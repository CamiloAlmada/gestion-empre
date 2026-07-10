import type { EstadoCompra } from '@gestion/core';

export interface BadgeEstadoCompraProps {
  estado: EstadoCompra;
}

/**
 * Badge de estado de una compra (doc 03): "Confirmada" con el par `exito`/
 * `superficie` aprobado (docs/06-ui-ux.md §7, mismo criterio que
 * `BadgeEstadoVenta`); "Borrador" con el mismo estilo tenue que el badge
 * "Inactivo" de Proveedores/Clientes. Nunca se comunica solo con color: cada
 * estado suma texto (y "Confirmada" un glifo decorativo).
 */
export function BadgeEstadoCompra({ estado }: BadgeEstadoCompraProps) {
  if (estado === 'confirmada') {
    return (
      <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-exito bg-superficie px-2 py-0.5 text-xs font-medium text-exito">
        <span aria-hidden="true">✓</span>
        Confirmada
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-borde px-2 py-0.5 text-xs font-medium text-texto-secundario">
      Borrador
    </span>
  );
}
