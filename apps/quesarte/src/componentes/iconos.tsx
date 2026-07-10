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
