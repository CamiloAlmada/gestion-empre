import type { ReactNode } from 'react';

export interface ItemBarraPestanas {
  id: string;
  etiqueta: string;
  icono: ReactNode;
  /** El item central (Venta) se renderiza como FAB circular elevado. Debe
   * haber exactamente un item con `central: true`. */
  central?: boolean;
}

export interface BarraPestanasProps {
  items: ItemBarraPestanas[];
  activa: string;
  onSeleccionar: (id: string) => void;
}

// Translucidez contenida a esta barra (docs/06-ui-ux.md §3): superficie
// semi-opaca + blur/saturate, con fallback sólido cuando el navegador no
// soporta backdrop-filter o el usuario pidió menos transparencia. Se resuelve
// con utilidades arbitrarias de Tailwind (variantes @supports/@media) para no
// tocar el tema compartido de packages/config.
const CLASES_SUPERFICIE =
  'bg-superficie-translucida backdrop-blur-lg backdrop-saturate-[1.4] ' +
  '[@supports_not_(backdrop-filter:_blur(1px))]:bg-superficie ' +
  '[@media(prefers-reduced-transparency:reduce)]:bg-superficie';

/**
 * Barra de navegación inferior fija, router-agnóstica: la app decide los
 * items, cuál está activo y qué hacer al seleccionar uno (`@gestion/ui` no
 * conoce react-router). Ver docs/06-ui-ux.md §2 y §3.
 */
export function BarraPestanas({ items, activa, onSeleccionar }: BarraPestanasProps) {
  return (
    <nav
      aria-label="Navegación principal"
      className={`fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t border-borde pb-[env(safe-area-inset-bottom)] ${CLASES_SUPERFICIE}`}
    >
      {items.map((item) =>
        item.central === true ? (
          <BotonCentral
            key={item.id}
            item={item}
            activo={item.id === activa}
            onSeleccionar={onSeleccionar}
          />
        ) : (
          <BotonPestana
            key={item.id}
            item={item}
            activo={item.id === activa}
            onSeleccionar={onSeleccionar}
          />
        ),
      )}
    </nav>
  );
}

interface BotonItemProps {
  item: ItemBarraPestanas;
  activo: boolean;
  onSeleccionar: (id: string) => void;
}

function BotonPestana({ item, activo, onSeleccionar }: BotonItemProps) {
  return (
    <button
      type="button"
      aria-current={activo ? 'page' : undefined}
      onClick={() => onSeleccionar(item.id)}
      className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-inset ${
        activo ? 'text-primary-700 dark:text-primary-300' : 'text-texto-secundario'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${
          activo ? 'bg-primary-100 dark:bg-primary-900/40' : ''
        }`}
      >
        {item.icono}
      </span>
      <span>{item.etiqueta}</span>
    </button>
  );
}

function BotonCentral({ item, activo, onSeleccionar }: BotonItemProps) {
  return (
    <div className="relative flex flex-1 items-center justify-center">
      <button
        type="button"
        aria-current={activo ? 'page' : undefined}
        aria-label={item.etiqueta}
        onClick={() => onSeleccionar(item.id)}
        className="absolute -top-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-flotante transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-fondo"
      >
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center">
          {item.icono}
        </span>
      </button>
      {/* Label visible bajo el FAB: el nombre accesible del botón ya lo da
          aria-label de arriba, así que este texto (fuera del <button> por el
          posicionamiento absoluto) queda oculto para AT y no se duplica. */}
      <span
        aria-hidden="true"
        className={`absolute bottom-1.5 text-xs font-medium ${
          activo ? 'text-primary-700 dark:text-primary-300' : 'text-texto-secundario'
        }`}
      >
        {item.etiqueta}
      </span>
    </div>
  );
}
