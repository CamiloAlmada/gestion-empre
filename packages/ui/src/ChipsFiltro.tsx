import { Chip } from './Chip';

export interface ChipsFiltroProps {
  /** Etiquetas de las opciones, en el orden a mostrar (sin incluir "Todas":
   * `ChipsFiltro` la antepone sola). Cadenas simples y no un tipo de dominio
   * para que `@gestion/ui` no tenga que conocer `Categoria` ni ningún otro
   * modelo — el llamador ya trae el vocabulario ordenado (p. ej.
   * `categoriasVisibles` en la app). */
  opciones: string[];
  /** Opción activa, o `null` para "Todas" (sin filtro). */
  valor: string | null;
  onCambiar: (valor: string | null) => void;
  /** Nombre accesible del grupo completo (p. ej. "Filtrar por categoría"). */
  ariaLabel: string;
  etiquetaTodas?: string;
  className?: string;
}

/**
 * Fila de chips de filtro de SELECCIÓN ÚNICA (docs/06-ui-ux.md §3): "Todas"
 * siempre primera, seguida de `opciones` en el orden recibido. Scrolleable
 * en horizontal con scrollbar oculta (mismo patrón que `SelectorSeccion`,
 * pero presentación deliberadamente distinta: acá son píldoras SUELTAS, sin
 * contenedor de superficie — no se deben confundir con navegación).
 *
 * Es selección única, no toggles independientes: tocar una opción la activa
 * (nunca queda "sin selección" salvo eligiendo "Todas" explícitamente) — por
 * eso tocar la opción ya activa es un no-op, no la desactiva.
 */
export function ChipsFiltro({
  opciones,
  valor,
  onCambiar,
  ariaLabel,
  etiquetaTodas = 'Todas',
  className = '',
}: ChipsFiltroProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <Chip activo={valor === null} onClick={() => onCambiar(null)}>
        {etiquetaTodas}
      </Chip>
      {opciones.map((opcion) => (
        <Chip key={opcion} activo={valor === opcion} onClick={() => onCambiar(opcion)}>
          {opcion}
        </Chip>
      ))}
    </div>
  );
}
