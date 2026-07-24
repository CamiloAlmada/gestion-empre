export interface FilaRankingProps {
  /** Ej. nombre del producto; puede ser largo — se trunca con ellipsis. */
  etiqueta: string;
  /** Ya formateado; el componente NO hace aritmética. */
  valor: string;
  /** 0-100. El componente NO calcula el porcentaje, lo recibe resuelto (clampeado por robustez). */
  proporcion: number;
  /** Ej. "32% margen" — opcional, no todo ranking lo tiene. */
  valorSecundario?: string;
}

/**
 * Fila de un ranking (ej. productos por ganancia aportada), pensada para
 * listas de 5 a 15 filas apiladas en pantalla de teléfono (docs/06-ui-ux.md,
 * futura Fase 3 de Reportes). El contenedor de lista NO es parte de este
 * componente, solo la fila.
 *
 * Barra proporcional con CSS puro (`div` interno con `width` inline) — nada
 * de SVG ni librería de charts, mismo criterio de simplicidad del resto de
 * `packages/ui`. `proporcion` se clampea a [0, 100] acá mismo: es robustez
 * de rango, no cálculo de negocio (la Regla de Oro de "sin aritmética de
 * plata/porcentajes en el componente" aplica al VALOR, no a defender el
 * layout de un dato fuera de rango).
 *
 * `etiqueta` larga trunca con ellipsis (`truncate` + `min-w-0` + `flex-1`,
 * mismo patrón que `StatCard`/`DataTable`): la barra y el valor siempre
 * quedan visibles, nunca se genera scroll horizontal.
 */
export function FilaRanking({ etiqueta, valor, proporcion, valorSecundario }: FilaRankingProps) {
  const proporcionClampeada = Math.min(100, Math.max(0, proporcion));

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm text-texto">{etiqueta}</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-fondo">
          <div
            className="h-full rounded-full bg-primary-600 transition-[width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: `${proporcionClampeada}%` }}
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <p className="text-sm font-semibold tabular-nums text-texto">{valor}</p>
        {valorSecundario !== undefined && (
          <p className="text-xs tabular-nums text-texto-secundario">{valorSecundario}</p>
        )}
      </div>
    </div>
  );
}
