import type { EstadoVenta } from '@gestion/core';

export interface BadgeEstadoVentaProps {
  estado: EstadoVenta;
}

/**
 * Badge "Anulada" para ventas anuladas, con el par de contraste `peligro`/
 * `superficie` aprobado (docs/06-ui-ux.md §7). Una venta `completada` no
 * muestra badge: el estado normal no necesita remarcarse, solo la excepción
 * — igual criterio que `BadgeStock` en Stock (alertas, no estados normales).
 * El glifo es decorativo (`aria-hidden`): el texto "Anulada" es lo que
 * comunica el estado, nunca el color solo (§5).
 */
export function BadgeEstadoVenta({ estado }: BadgeEstadoVentaProps) {
  if (estado !== 'anulada') return null;

  return (
    <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-peligro bg-superficie px-2 py-0.5 text-xs font-medium text-peligro">
      <span aria-hidden="true">⊘</span>
      Anulada
    </span>
  );
}
