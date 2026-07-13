import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';

export interface ItemSelectorSeccion {
  id: string;
  etiqueta: string;
  a: string;
}

/**
 * Lista declarativa de secciones del tab Stock (docs/06-ui-ux.md §2,
 * 2026-07-10): agregar una sección nueva es sumar un objeto acá, sin tocar
 * `SelectorSeccion`.
 *
 * Orden contractual tras la fusión Stock+Catálogo (UI-5, 2026-07-13,
 * decidido por el dueño): "Productos | Compras | Proveedores | Precios". Los
 * ítems `catalogo` (ex `/stock/productos`, ahora la MISMA pantalla que
 * `stock`) y `categorias` desaparecen de acá — Categorías se mudó a Ajustes
 * (listado común solo-admin, misma naturaleza que Usuarios; la ruta vieja
 * `/stock/categorias` sigue existiendo un tiempo y redirige a la nueva,
 * fuera de esta tarea). Con la fusión, el selector admin entra sin scroll en
 * un teléfono común — motivo explícito de la tanda.
 *
 * "Compras"/"Proveedores"/"Precios" solo para admin
 * (docs/07-clientes-proveedores.md: el vendedor no ve datos bancarios ni
 * costos de proveedor, ni costos/edición de precios) — mismo gate que ya
 * usaban las acciones de header de `Stock.tsx` antes de UI-4 y que la tab bar
 * general (`Shell.tsx`); las rutas además quedan protegidas server-side por
 * `RutaSoloAdmin` en App.tsx.
 */
export function itemsSelectorStock(esAdmin: boolean): ItemSelectorSeccion[] {
  return [
    { id: 'productos', etiqueta: 'Productos', a: '/stock' },
    ...(esAdmin
      ? [
          { id: 'compras', etiqueta: 'Compras', a: '/stock/compras' },
          { id: 'proveedores', etiqueta: 'Proveedores', a: '/stock/proveedores' },
          { id: 'precios', etiqueta: 'Precios', a: '/stock/precios' },
        ]
      : []),
  ];
}

export interface SelectorSeccionProps {
  items: ItemSelectorSeccion[];
}

/**
 * `matchMedia` no existe en jsdom (ver `MetaThemeColor.test.tsx`) — se
 * consulta con un chequeo de tipo, no `vi.spyOn`. Duplicado del helper que ya
 * usa `Carrito.tsx` para su propio gesto: cada archivo con una interacción
 * corta y puntual que depende de `prefers-reduced-motion` lo resuelve en el
 * momento, sin estado ni listener (no hace falta reaccionar a un cambio de
 * la preferencia del SO a mitad de una navegación).
 */
function prefiereMovimientoReducido(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
 *
 * `scroll-px-[5px]` (UI-4f, validación del dueño): sin esto, el auto-scroll
 * al ítem activo (`scrollIntoView({ inline: 'nearest' })`, más abajo) alinea
 * el borde del `<a>` con el borde del scrollport — en los extremos
 * (Productos primero, Precios último para admin) eso deja el respiro del
 * contenedor interior
 * (el `div` de abajo: `border` 1px + `p-1` 4px = 5px) fuera de vista, con el
 * selector visualmente "cortado". `scroll-padding-inline` en el scrollport
 * le dice al navegador que trate ese margen como zona seguro-visible al
 * calcular "nearest": en los extremos, como no se puede scrollear más allá
 * de 0 ni del máximo, el navegador clampea ahí — mostrando el contenedor
 * entero. 5px = el mismo cálculo (borde + padding) del `div` de abajo, no un
 * valor arbitrario.
 */
export function SelectorSeccion({ items }: SelectorSeccionProps) {
  const location = useLocation();
  // Apunta SIEMPRE al `<a>` del ítem activo (se reasigna solo: React limpia
  // la referencia vieja al desactivarse un ítem y la vuelve a fijar en el
  // nuevo antes de correr efectos, así que el efecto de abajo siempre lee el
  // nodo correcto para el pathname actual).
  const activoRef = useRef<HTMLAnchorElement | null>(null);

  // Auto-scroll del ítem activo (docs/06-ui-ux.md §2, UI-4d): con más
  // secciones que ancho de pantalla, el scroll horizontal del `<nav>` puede
  // dejar el activo fuera de vista al navegar — y, sin este efecto, también
  // en la entrada DIRECTA por URL (primer render, el `<nav>` arranca
  // scrolleado al inicio). Corre en cada cambio de `pathname`, INCLUIDO el
  // montaje inicial (los efectos siempre corren después del primer render).
  useEffect(() => {
    activoRef.current?.scrollIntoView({
      inline: 'nearest', // mueve lo mínimo necesario, no siempre al centro
      // CRÍTICO: sin esto, `scrollIntoView` además intenta llevar el
      // elemento a la vista VERTICAL de la PÁGINA (el <nav> vive en el
      // flujo normal del documento, no aislado) y scrollearía la pantalla
      // entera — acá solo interesa el scroll horizontal interno del <nav>.
      block: 'nearest',
      behavior: prefiereMovimientoReducido() ? 'auto' : 'smooth',
    });
  }, [location.pathname]);

  return (
    <nav
      aria-label="Secciones de Stock"
      className="overflow-x-auto scroll-px-[5px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              ref={activo ? activoRef : undefined}
              to={item.a}
              viewTransition
              aria-current={activo ? 'page' : undefined}
              className={`flex min-h-[48px] items-center justify-center whitespace-nowrap rounded-control px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-inset ${
                activo
                  ? // `view-transition-name` SOLO en el activo (docs/06-ui-ux.md
                    // §2/§3, UI-4c): la View Transitions API exige un nombre
                    // único por documento — si se lo diéramos a todos los
                    // ítems, `document.startViewTransition` tira error. Con
                    // el nombre solo acá, el navegador hace el morph de
                    // posición/tamaño de ESTE elemento entre la foto vieja
                    // (ítem que dejaba de estar activo) y la nueva (el que
                    // pasa a estarlo).
                    'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 [view-transition-name:pill-seccion]'
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
