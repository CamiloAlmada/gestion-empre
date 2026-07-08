import type { ReactNode } from 'react';

export interface StatCardProps {
  titulo: string;
  valor: string;
  detalle?: string;
  icono?: ReactNode;
}

/**
 * Card de estadística (dashboard/reportes). Opaca siempre (ver
 * docs/06-ui-ux.md §3: la translucidez se reserva a tab bar y header). El
 * ícono, si se pasa, es decorativo (`aria-hidden`) y nunca es el único
 * portador de información — `titulo`/`valor` siempre son texto.
 */
export function StatCard({ titulo, valor, detalle, icono }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-borde bg-superficie p-4">
      {icono !== undefined && (
        <div
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white"
        >
          {icono}
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm text-texto-secundario">{titulo}</p>
        <p className="text-2xl font-bold tabular-nums text-texto">{valor}</p>
        {detalle !== undefined && <p className="text-sm text-texto-secundario">{detalle}</p>}
      </div>
    </div>
  );
}
