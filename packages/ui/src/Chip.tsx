import type { ReactNode } from 'react';

export interface ChipProps {
  /** Estado de toggle: es un filtro, no una navegación (por eso `aria-pressed`,
   * nunca `aria-current` — ver `ChipsFiltro` y docs/06-ui-ux.md §3). */
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Nombre accesible propio, si el texto visible no alcanza (botones-ícono). */
  ariaLabel?: string;
  className?: string;
}

/**
 * Píldora de filtro base (docs/06-ui-ux.md §3 "Chips de filtro"): activo con
 * relleno primario sólido y texto blanco (par `blanco`/`primary-600`
 * aprobado en docs/06 §7, "Botón primario" — mismo par, no uno nuevo);
 * inactivo tenue (superficie + borde + texto secundario, par
 * `texto-secundario`/`superficie` también aprobado en §7). Deliberadamente
 * DISTINTA del contenedor rectangular de `SelectorSeccion` (ese es
 * navegación por rutas; esto es filtro de lo visible en la propia pantalla).
 *
 * Target ≥44px y foco visible, checklist §5. Sirve como building block de
 * `ChipsFiltro` (fila de selección única) y como chip suelto para toggles
 * booleanos como "Mostrar inactivos" (Clientes/Proveedores, unificado acá).
 */
export function Chip({ activo, onClick, children, ariaLabel, className = '' }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1 focus-visible:ring-offset-superficie ${
        activo
          ? 'bg-primary-600 text-white'
          : 'border border-borde bg-superficie text-texto-secundario hover:text-texto'
      } ${className}`}
    >
      {children}
    </button>
  );
}
