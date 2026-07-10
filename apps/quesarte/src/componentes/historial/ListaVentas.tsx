import { formatearMoney, type Venta } from '@gestion/core';
import { BadgeEstadoVenta } from './BadgeEstadoVenta';
import { ETIQUETAS_MEDIO_PAGO, formatearFechaHora, textoCantidadItems } from './formato';

export interface ListaVentasProps {
  ventas: Venta[];
  onSeleccionar: (venta: Venta) => void;
}

/**
 * Lista maestra de ventas: una fila-botón táctil por venta (mismo patrón que
 * `ListaProductos` en Stock), con número, fecha/hora, cantidad de ítems,
 * total, medio de pago y badge de anulada si corresponde. Tocar una fila
 * selecciona la venta (el llamador decide qué hacer — ver `Historial.tsx`).
 *
 * `clienteNombre` (doc 07: denormalizado en la venta "para no depender de un
 * join al mostrar el historial") se muestra en esta misma fila secundaria
 * cuando la venta tiene cliente asociado. Una venta anónima no agrega nada
 * en su lugar — no hay "sin cliente" que ensucie la fila por defecto, doc
 * 06 §1 "menos, ante la duda".
 */
export function ListaVentas({ ventas, onSeleccionar }: ListaVentasProps) {
  return (
    <ul className="flex flex-col gap-2">
      {ventas.map((venta) => (
        <li key={venta.id}>
          <button
            type="button"
            onClick={() => onSeleccionar(venta)}
            className="flex min-h-[56px] w-full flex-col gap-1 rounded-card border border-borde bg-superficie p-4 text-left transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-texto">Venta #{venta.numero}</span>
              <span className="tabular-nums font-semibold text-texto">
                {formatearMoney(venta.totalCents)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-texto-secundario">
              <span>{formatearFechaHora(venta.fecha)}</span>
              <span>{textoCantidadItems(venta.items.length)}</span>
              <span>{ETIQUETAS_MEDIO_PAGO[venta.medioPago]}</span>
              {venta.clienteNombre !== undefined && <span>{venta.clienteNombre}</span>}
            </div>
            <BadgeEstadoVenta estado={venta.estado} />
          </button>
        </li>
      ))}
    </ul>
  );
}
