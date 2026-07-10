import type { Cliente } from '@gestion/core';
import { formatearFecha } from '../stock/resumen';
import { textoCantidadVentas } from './formato';

export interface ListaClientesProps {
  clientes: Cliente[];
  onSeleccionar: (cliente: Cliente) => void;
}

/**
 * Lista maestra de clientes (mismo patrón fila-botón que `ListaVentas` de
 * Historial): nombre + alias si tiene, cantidad de ventas y fecha de la
 * última compra a la derecha. Tocar una fila selecciona el cliente (el
 * llamador decide navegar a la ficha, ver `Clientes.tsx`).
 *
 * Un cliente desactivado (`activo: false`, visible solo con el toggle
 * "Mostrar inactivos") lleva un badge "Inactivo" — nunca se comunica solo con
 * un cambio de color (docs/06-ui-ux.md §5).
 */
export function ListaClientes({ clientes, onSeleccionar }: ListaClientesProps) {
  return (
    <ul className="flex flex-col gap-2">
      {clientes.map((cliente) => (
        <li key={cliente.id}>
          <button
            type="button"
            onClick={() => onSeleccionar(cliente)}
            className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-card border border-borde bg-superficie p-4 text-left transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-texto">{cliente.nombre}</span>
                {!cliente.activo && (
                  <span className="rounded-full border border-borde px-2 py-0.5 text-xs text-texto-secundario">
                    Inactivo
                  </span>
                )}
              </div>
              {cliente.alias !== undefined && (
                <span className="text-sm text-texto-secundario">{cliente.alias}</span>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5 text-sm text-texto-secundario">
              <span>{textoCantidadVentas(cliente.stats.cantidadVentas)}</span>
              <span>
                {cliente.stats.ultimaCompra !== undefined
                  ? formatearFecha(cliente.stats.ultimaCompra)
                  : 'Sin compras'}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
