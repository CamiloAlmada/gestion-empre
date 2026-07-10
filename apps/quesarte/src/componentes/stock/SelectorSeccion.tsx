import { Link, useLocation } from 'react-router';

export interface ItemSelectorSeccion {
  id: string;
  etiqueta: string;
  a: string;
}

/**
 * Lista declarativa de secciones del tab Stock (docs/06-ui-ux.md §2,
 * 2026-07-10): agregar Compras/Precios cuando existan (F2-F) es sumar un
 * objeto acá, sin tocar `SelectorSeccion`. "Proveedores" solo para admin
 * (docs/07-clientes-proveedores.md: el vendedor no ve datos bancarios ni
 * costos de proveedor) — mismo gate que ya usaban las acciones de header de
 * `Stock.tsx` antes de esta tarea y que la tab bar general (`Shell.tsx`); la
 * ruta además queda protegida server-side por `RutaSoloAdmin` en App.tsx.
 */
export function itemsSelectorStock(esAdmin: boolean): ItemSelectorSeccion[] {
  return [
    { id: 'stock', etiqueta: 'Stock', a: '/stock' },
    { id: 'catalogo', etiqueta: 'Catálogo', a: '/stock/productos' },
    // Compras (F2-F1, doc 03): solo admin, entre Catálogo y Proveedores
    // (docs/06-ui-ux.md §2: "Stock | Catálogo | Compras | Proveedores | Precios").
    ...(esAdmin ? [{ id: 'compras', etiqueta: 'Compras', a: '/stock/compras' }] : []),
    ...(esAdmin ? [{ id: 'proveedores', etiqueta: 'Proveedores', a: '/stock/proveedores' }] : []),
  ];
}

export interface SelectorSeccionProps {
  items: ItemSelectorSeccion[];
}

/**
 * Selector de sección ("secondary tabs" de Material 3, docs/06-ui-ux.md §2,
 * 2026-07-10, decidido con el dueño): fila horizontal scrolleable de rutas
 * HERMANAS dentro del tab Stock, contenida en una superficie redondeada —
 * presentación deliberadamente DISTINTA de los chips de filtro (§3: píldoras
 * sueltas `rounded-full`) para que nunca se confundan: acá el contenedor
 * entero es una superficie con borde y los ítems son rectangulares
 * (`rounded-control`), no píldoras sueltas.
 *
 * Semántica de NAVEGACIÓN POR RUTAS REALES, no de ARIA tabs:
 * `role="tablist"`/`role="tab"` son para paneles locales con manejo de foco
 * propio (flechas de teclado, un solo tab enfocable a la vez) que acá no
 * aplica — cada ítem es una ruta distinta del router, con su propio
 * historial, y el foco lo maneja el navegador como en cualquier lista de
 * links. Por eso: `<nav>` con `<Link>` reales y `aria-current="page"` en el
 * activo, calculado por coincidencia EXACTA de `pathname` (nunca por
 * prefijo: `/stock` no debe quedar marcado activo estando en
 * `/stock/productos`, aunque lo tenga como prefijo — de ahí que NO se use
 * `NavLink`, cuyo matching por defecto es por prefijo).
 *
 * Relleno del activo: mismos tokens que el pill decorativo del tab activo de
 * `BarraPestanas` (`primary-100`/`dark:primary-900/40`, aprobado como uso
 * decorativo en docs/06 §7) con el texto en el par de marca ya aprobado ahí
 * (`primary-700`/`primary-300`). Ese pill en `BarraPestanas` es puramente
 * decorativo (queda detrás del ÍCONO; el contraste verificado lo lleva el
 * label de texto aparte); acá el texto se apoya directamente sobre el pill,
 * así que se verificó ese par puntual con el mismo script OKLCH→sRGB de
 * docs/06 §7: 12.33:1 en light, 7.28:1 en dark (con la superficie de abajo
 * al 40% de opacidad) — ambos superan holgadamente el 4.5:1 de AA. No se
 * agrega a la tabla de docs/06 §7 desde esta tarea (fuera de alcance tocar
 * docs/); reportado al tech lead para que lo sume ahí.
 *
 * Scroll horizontal sin scrollbar visible (patrón estándar, docs/06 §2):
 * `overflow-x-auto` + scrollbar oculto por navegador (`scrollbar-width`,
 * `-ms-overflow-style`, `::-webkit-scrollbar`), el contenido sigue
 * scrolleable con gesto táctil/rueda aunque la barra no se vea.
 */
export function SelectorSeccion({ items }: SelectorSeccionProps) {
  const location = useLocation();

  return (
    <nav
      aria-label="Secciones de Stock"
      className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Sin <ul>/<li> a propósito (mismo criterio que `BarraPestanas`, que
          tampoco envuelve sus botones en una lista): un ítem por ruta no
          necesita semántica de lista, y evita que este contenedor compita
          con listas reales de la pantalla (p.ej. `role="list"` del listado
          de productos) por `getByRole('list')` en tests. */}
      <div className="flex w-max min-w-full gap-1 rounded-elemento border border-borde bg-superficie p-1">
        {items.map((item) => {
          const activo = location.pathname === item.a;
          return (
            <Link
              key={item.id}
              to={item.a}
              aria-current={activo ? 'page' : undefined}
              className={`flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-control px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-inset ${
                activo
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                  : 'text-texto-secundario hover:text-texto'
              }`}
            >
              {item.etiqueta}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
