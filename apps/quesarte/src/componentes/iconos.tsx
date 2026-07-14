/**
 * Íconos SVG inline de la app: trazos simples, `currentColor`, siempre
 * decorativos (`aria-hidden`) — el nombre accesible lo da el label de texto
 * (o `aria-label`) del elemento que los envuelve, nunca el ícono en sí. La
 * mayoría son de las secciones del shell (docs/06-ui-ux.md §2: tab de
 * `BarraPestanas`, título de pantalla placeholder); `IconoFiltros` es de un
 * botón de acción puntual (Precios, WA-H3) pero sigue el mismo patrón sin
 * librería — no hay otro lugar en la app para íconos inline sueltos.
 */

export interface IconoProps {
  className?: string;
}

const PROPS_BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': 'true' as const,
};

/** Caja/paquete: sección Stock. */
export function IconoStock({ className = 'h-6 w-6' }: IconoProps) {
  return (
    <svg {...PROPS_BASE} className={className}>
      <path d="M3.5 7.5 12 3l8.5 4.5-8.5 4.5-8.5-4.5Z" />
      <path d="M3.5 7.5v9L12 21m8.5-4.5v-9M12 21l8.5-4.5M12 21v-9" />
    </svg>
  );
}

/** Dos personas: sección Clientes (tab bar, 2026-07-10 — reemplaza al tab
 * Historial, ver docs/06-ui-ux.md §2). */
export function IconoClientes({ className = 'h-6 w-6' }: IconoProps) {
  return (
    <svg {...PROPS_BASE} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.46-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
      <circle cx="17.5" cy="9.2" r="2.3" />
      <path d="M14.9 19c0-2.55 1.83-4.4 4.2-4.4" />
    </svg>
  );
}

/** Reloj con flecha antihoraria ("rebobinar tiempo", ícono clásico de
 * "history"): atajo a Historial desde el header de Venta (docs/06-ui-ux.md
 * §2, 2026-07-10 — única acción que se renderiza en el header también en
 * pantalla angosta). Ya no vive en la tab bar (ver `IconoClientes`). */
export function IconoHistorial({ className = 'h-6 w-6' }: IconoProps) {
  return (
    <svg {...PROPS_BASE} className={className}>
      <polyline points="2.5 4.5 2.5 9.5 7.5 9.5" />
      <path d="M4.1 14.5a8.5 8.5 0 1 0 2.02-8.83L2.5 9.5" />
      <path d="M12 8.2v4.3l2.8 1.7" />
    </svg>
  );
}

/** Carrito: tab central Venta (FAB). */
export function IconoVenta({ className = 'h-6 w-6' }: IconoProps) {
  return (
    <svg {...PROPS_BASE} className={className}>
      <path d="M3 4h2.2l1 12.3a1.8 1.8 0 0 0 1.8 1.7h8.6a1.8 1.8 0 0 0 1.78-1.53L20 8H6.2" />
      <circle cx="9.5" cy="20" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="20" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Barras: sección Reportes. */
export function IconoReportes({ className = 'h-6 w-6' }: IconoProps) {
  return (
    <svg {...PROPS_BASE} className={className}>
      <path d="M4 20V13M10 20V6M16 20v-8M4 20h16" />
    </svg>
  );
}

/** Sliders: sección Ajustes. */
export function IconoAjustes({ className = 'h-6 w-6' }: IconoProps) {
  return (
    <svg {...PROPS_BASE} className={className}>
      <path d="M4 6h12M4 12h6M4 18h9" />
      <circle cx="18" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Embudo de filtro ("filter-list"): botón de filtros extra en Precios
 * (WA-H3, docs/06-ui-ux.md §3 "Carril de filtros con botón de filtros
 * extra"). Convertido desde el `filter-list.svg` provisto por el dueño
 * (mismo `viewBox 0 0 24 24`, trazo original) a este patrón de la app:
 * `stroke="currentColor"` (el original traía `#000000` hardcodeado) vía
 * `PROPS_BASE`, sin el `width`/`height` de 800px del original (lo gobierna
 * `className`, default `h-5 w-5` — un poco más chico que los íconos de
 * sección: este vive DENTRO de un botón de 44px, no en la tab bar). */
export function IconoFiltros({ className = 'h-5 w-5' }: IconoProps) {
  return (
    <svg {...PROPS_BASE} className={className}>
      <path d="M21 6H19M21 12H16M21 18H16M7 20V13.5612C7 13.3532 7 13.2492 6.97958 13.1497C6.96147 13.0615 6.93151 12.9761 6.89052 12.8958C6.84431 12.8054 6.77934 12.7242 6.64939 12.5617L3.35061 8.43826C3.22066 8.27583 3.15569 8.19461 3.10948 8.10417C3.06849 8.02393 3.03853 7.93852 3.02042 7.85026C3 7.75078 3 7.64677 3 7.43875V5.6C3 5.03995 3 4.75992 3.10899 4.54601C3.20487 4.35785 3.35785 4.20487 3.54601 4.10899C3.75992 4 4.03995 4 4.6 4H13.4C13.9601 4 14.2401 4 14.454 4.10899C14.6422 4.20487 14.7951 4.35785 14.891 4.54601C15 4.75992 15 5.03995 15 5.6V7.43875C15 7.64677 15 7.75078 14.9796 7.85026C14.9615 7.93852 14.9315 8.02393 14.8905 8.10417C14.8443 8.19461 14.7793 8.27583 14.6494 8.43826L11.3506 12.5617C11.2207 12.7242 11.1557 12.8054 11.1095 12.8958C11.0685 12.9761 11.0385 13.0615 11.0204 13.1497C11 13.2492 11 13.3532 11 13.5612V17L7 20Z" />
    </svg>
  );
}

/** Círculo con "i": botón ⓘ de "Ver desglose de costo" en Precios (COSTO-1,
 * docs/03-compras-costos-precios.md). El punto de la "i" se rellena
 * (`fill="currentColor"`, mismo criterio que los puntos del carrito de
 * `IconoVenta`) porque un trazo tan chico se ve hueco/débil con el
 * `strokeWidth` de `PROPS_BASE`. */
export function IconoInfo({ className = 'h-5 w-5' }: IconoProps) {
  return (
    <svg {...PROPS_BASE} className={className}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
