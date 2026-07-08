/**
 * Íconos SVG inline de las secciones del shell (docs/06-ui-ux.md §2). Sin
 * librería de íconos: trazos simples, `currentColor`, siempre decorativos
 * (`aria-hidden`) — el nombre accesible lo da el label de texto que los
 * acompaña (tab de `BarraPestanas` o título de la pantalla placeholder).
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

/** Reloj: sección Historial. */
export function IconoHistorial({ className = 'h-6 w-6' }: IconoProps) {
  return (
    <svg {...PROPS_BASE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
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
