import type { ChangeEvent } from 'react';

export interface CampoBusquedaProps {
  /** Valor controlado del campo. */
  valor: string;
  onChange: (valor: string) => void;
  /** Nombre accesible del campo (no hay label visible — ver JSDoc). */
  ariaLabel: string;
  /** Describe QUÉ se busca (p. ej. "Nombre, alias o teléfono"). */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Campo de búsqueda unificado (docs/06-ui-ux.md §3 "Búsqueda unificada"): un
 * solo componente para TODA búsqueda de listado de la app — píldora con
 * ícono de lupa integrado a la izquierda (decorativo, `aria-hidden`), SIN
 * label visible arriba. El nombre accesible va en `ariaLabel` (prop
 * obligatoria); el `placeholder` solo describe qué campos matchea la
 * búsqueda. Reemplaza, en las pantallas de listado, el patrón anterior de
 * `Input` con label "Buscar".
 *
 * Forma por token propio `rounded-busqueda` (NO `rounded-control`, aunque
 * hoy comparten el mismo valor en Minimalista): el estilo Cálido lo lleva a
 * píldora completa (9999px, como la tab bar) mientras el resto de los
 * controles se queda en un radio más chico — ver
 * `packages/config/tailwind.css`, tokens de forma.
 *
 * `type="search"` con reset de las decoraciones nativas de Chrome/Safari
 * (botón "limpiar" con su propio espaciado, radio propio de Safari) para
 * que la forma la defina SOLO el token, consistente entre navegadores.
 */
export function CampoBusqueda({
  valor,
  onChange,
  ariaLabel,
  placeholder,
  disabled = false,
  className = '',
}: CampoBusquedaProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <div className={`relative ${className}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-secundario"
      >
        <circle cx="9" cy="9" r="6" />
        <line x1="18" y1="18" x2="13.5" y2="13.5" />
      </svg>
      <input
        type="search"
        aria-label={ariaLabel}
        value={valor}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-11 w-full appearance-none rounded-busqueda border border-borde bg-superficie py-2 pl-9 pr-3 text-texto outline-none placeholder:text-texto-secundario focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:bg-fondo disabled:text-texto-secundario [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />
    </div>
  );
}
