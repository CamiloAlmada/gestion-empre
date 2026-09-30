import type { Firestore } from 'firebase/firestore';
import { formatearMoney, type Cliente, type DeudaCliente } from '@gestion/core';
import { BotonWhatsApp } from '../whatsapp/BotonWhatsApp';
import { textoCantidadVentas } from './formato';

/** Una fila de la lista: la deuda agregada (de `agruparDeudaPorCliente`) y, si la
 * pantalla lo tiene cargado, el cliente (fuente del teléfono y del nombre vigente). */
export interface FilaDeuda {
  deuda: DeudaCliente;
  cliente?: Cliente;
}

export interface ListaClientesConDeudaProps {
  filas: FilaDeuda[];
  db: Firestore;
  onSeleccionar: (clienteId: string) => void;
}

/** "desde hoy" / "hace 1 día" / "hace N días" con singular correcto. */
function textoDiasDeuda(dias: number): string {
  if (dias <= 0) return 'desde hoy';
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

/**
 * Fila por cliente con deuda (doc 11, "Deben"): nombre, "Debe $X · N ventas ·
 * hace D días" y el botón de WhatsApp con el recordatorio de cobro. Respeta el
 * orden recibido (core ya lo entrega con la deuda más vieja primero). A
 * diferencia de `ListaClientesInactivos`, la fila lleva a la ficha del cliente
 * (donde está el detalle de las ventas a cobrar): el área de texto es un botón
 * y WhatsApp queda como hermano, nunca un botón anidado en otro. Si el cliente
 * está dado de baja (`activo: false`) la fila sigue: la deuda existe igual, y
 * lleva el badge "Dado de baja" (mismo estilo que el "Inactivo" de `ListaClientes`).
 */
export function ListaClientesConDeuda({ filas, db, onSeleccionar }: ListaClientesConDeudaProps) {
  return (
    <ul className="flex flex-col gap-2">
      {filas.map(({ deuda, cliente }) => {
        const nombre = cliente?.nombre ?? deuda.clienteNombre;
        const deudaFormateada = formatearMoney(deuda.deudaCents);
        return (
          <li
            key={deuda.clienteId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-borde bg-superficie p-2 pl-4"
          >
            <button
              type="button"
              onClick={() => onSeleccionar(deuda.clienteId)}
              className="flex min-h-[56px] min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-texto">{nombre}</span>
                {cliente?.activo === false && (
                  <span className="rounded-full border border-borde px-2 py-0.5 text-xs text-texto-secundario">
                    Dado de baja
                  </span>
                )}
              </span>
              <span className="text-sm text-texto-secundario">
                {`Debe ${deudaFormateada} · ${textoCantidadVentas(deuda.cantidadVentas)} · ${textoDiasDeuda(deuda.diasDeuda)}`}
              </span>
            </button>
            <div className="flex shrink-0 items-center pr-2">
              <BotonWhatsApp
                telefono={cliente?.telefono}
                telefonoE164={cliente?.telefonoE164}
                contexto="cobro"
                valores={{
                  cliente: nombre,
                  deuda: deudaFormateada,
                  diasDeuda: String(deuda.diasDeuda),
                }}
                db={db}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
