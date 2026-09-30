import type { EstadoCobro, EstadoVenta } from '@gestion/core';

export interface BadgeEstadoVentaProps {
  estado: EstadoVenta;
  /**
   * Estado de cobro de la venta, tal como lo devuelve `estadoCobro(venta)` de
   * core (única forma autorizada de interpretarlo, docs/11-cobros-diferidos.md).
   * Opcional: quien no lo pasa solo muestra el badge de anulada.
   */
  estadoCobro?: EstadoCobro;
}

/**
 * Badges de excepción de una venta, con los pares de contraste aprobados
 * (docs/06-ui-ux.md §7): "Anulada" (`peligro`/`superficie`) y, mientras se
 * debe algo, "A cobrar" o "Parcial" (`advertencia`/`superficie`, contorno como
 * `BadgeStock`). Una venta `completada` y cobrada no muestra nada: el estado
 * normal no necesita remarcarse, solo la excepción — igual criterio que
 * `BadgeStock` en Stock (alertas, no estados normales). Una venta anulada
 * muestra solo "Anulada": no se cobra, aunque haya nacido `a_cobrar`.
 * Los glifos son decorativos (`aria-hidden`): el texto comunica el estado,
 * nunca el color solo (§5).
 */
export function BadgeEstadoVenta({ estado, estadoCobro }: BadgeEstadoVentaProps) {
  if (estado === 'anulada') {
    return (
      <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-peligro bg-superficie px-2 py-0.5 text-xs font-medium text-peligro">
        <span aria-hidden="true">⊘</span>
        Anulada
      </span>
    );
  }

  if (estadoCobro === 'pendiente' || estadoCobro === 'parcial') {
    return (
      <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-advertencia bg-superficie px-2 py-0.5 text-xs font-medium text-advertencia">
        <span aria-hidden="true">⏳</span>
        {estadoCobro === 'pendiente' ? 'A cobrar' : 'Parcial'}
      </span>
    );
  }

  return null;
}
