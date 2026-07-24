/** Opción de un `GrupoSegmentado`: valor de dominio + etiqueta visible. */
export interface OpcionGrupoSegmentado<T extends string> {
  readonly valor: T;
  readonly etiqueta: string;
}

export interface GrupoSegmentadoProps<T extends string> {
  opciones: readonly OpcionGrupoSegmentado<T>[];
  valor: T;
  onCambiar: (valor: T) => void;
  /** Nombre accesible del grupo (`aria-label`). El grupo no impone su propio
   * label visible: si la pantalla necesita uno (como "Modo"/"Estilo" en
   * Ajustes), lo agrega el llamador — ver `SelectorTinte` para un caso que sí
   * lo agrega internamente por ser un componente de dominio fijo. */
  ariaLabel: string;
  className?: string;
}

/**
 * Grupo segmentado genérico (docs/06-ui-ux.md §5): fila de botones
 * `role="group"` + `aria-pressed`, con la opción activa marcada tanto por
 * ARIA como visualmente (relleno primario). Extraído del patrón que ya
 * duplicaban `SelectorTema`/`SelectorEstilo` en
 * `apps/quesarte/src/pantallas/Ajustes.tsx` (mismas clases, mismo
 * comportamiento) — esa pantalla NO se tocó en esta tarea; migrarla a este
 * componente queda para otra tanda.
 *
 * Selección única, siempre con una opción activa (no hay estado "ninguna
 * elegida" — a diferencia de `ChipsFiltro`, que sí admite "Todas"/null).
 * Tocar la opción ya activa es un no-op a nivel semántico pero igual dispara
 * `onCambiar` (el llamador decide si le importa la idempotencia).
 */
export function GrupoSegmentado<T extends string>({
  opciones,
  valor,
  onCambiar,
  ariaLabel,
  className = '',
}: GrupoSegmentadoProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex gap-1 rounded-elemento border border-borde p-1 ${className}`}
    >
      {opciones.map((opcion) => {
        const activo = valor === opcion.valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambiar(opcion.valor)}
            className={`min-h-[44px] flex-1 rounded-control px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
              activo ? 'bg-primary-600 text-white' : 'text-texto-secundario hover:text-texto'
            }`}
          >
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
