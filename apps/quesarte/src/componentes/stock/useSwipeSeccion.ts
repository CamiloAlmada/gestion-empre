import { useRef, type RefObject, type TouchEvent as ReactTouchEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { ItemSelectorSeccion } from './SelectorSeccion';

/**
 * Distancia mínima (px) para que el gesto cuente como swipe intencional y no
 * como un tap con el dedo levemente inestable (docs/06-ui-ux.md §2/§3, UI-4c
 * — mismo criterio de umbral + dominancia de eje que ya usa `Carrito.tsx`
 * §6 para su propio gesto táctil). Punto medio del rango sugerido (48-60px).
 */
const UMBRAL_SWIPE_PX = 54;

/**
 * El desplazamiento horizontal debe superar ampliamente al vertical para
 * distinguir un swipe intencional de un scroll vertical con leve deriva
 * lateral del dedo (docs/06-ui-ux.md §2: "dominancia de eje").
 */
const FACTOR_DOMINANCIA_EJE = 1.5;

interface PosicionToque {
  x: number;
  y: number;
}

export interface ManejadoresSwipeSeccion {
  /** Se asigna al contenedor del layout: define el límite superior de la
   * búsqueda de contenedores con scroll horizontal propio y es el nodo sobre
   * el que se escuchan los toques. */
  ref: RefObject<HTMLDivElement | null>;
  onTouchStart: (evento: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (evento: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchCancel: () => void;
}

/**
 * Sube por los ancestros de `objetivo` hasta (sin incluir) `contenedorLayout`
 * buscando un nodo con scroll horizontal propio (el `SelectorSeccion` mismo,
 * o cualquier tabla con overflow): si el gesto nace ahí, el swipe de sección
 * NUNCA debe dispararse — ese contenedor necesita el gesto para su propio
 * scroll (docs/06-ui-ux.md §2, UI-4c). La búsqueda se corta en el contenedor
 * del layout: no le interesa lo que haya scrolleable por fuera de él.
 */
function naceEnContenedorConScrollHorizontal(objetivo: Node | null, contenedorLayout: HTMLElement): boolean {
  let nodo: Node | null = objetivo;
  while (nodo && nodo !== contenedorLayout) {
    if (nodo instanceof HTMLElement) {
      const scrolleaHorizontal = nodo.scrollWidth > nodo.clientWidth;
      const overflowX = window.getComputedStyle(nodo).overflowX;
      if (scrolleaHorizontal && (overflowX === 'auto' || overflowX === 'scroll')) {
        return true;
      }
    }
    nodo = nodo.parentNode;
  }
  return false;
}

/**
 * Swipe horizontal entre secciones RAÍZ de Stock (docs/06-ui-ux.md §2,
 * UI-4c): touch handlers de React sobre el contenedor del layout, SIN
 * listeners globales ni `preventDefault` — el scroll vertical nativo y el
 * scroll horizontal de contenedores excluidos (el selector, tablas) siguen
 * intactos. No hace falta escuchar `touchmove`: la decisión de navegar se
 * toma comparando la posición de inicio (`touchstart`) contra la final
 * (`touchend`), sin necesidad de arrastre visual del contenido.
 *
 * `items` es el MISMO array filtrado por rol que recibe `SelectorSeccion`
 * (`itemsSelectorStock(esAdmin)`): el orden de navegación respeta el rol sin
 * recalcularlo acá.
 */
export function useSwipeSeccion(items: ItemSelectorSeccion[]): ManejadoresSwipeSeccion {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inicioRef = useRef<PosicionToque | null>(null);
  // Se decide UNA vez, en touchstart (con el `target` original, antes de que
  // cualquier scroll interno mueva el dedo): si el gesto nace en un
  // contenedor con scroll horizontal propio, se descarta para todo el resto
  // del gesto aunque el dedo termine fuera de ese contenedor.
  const permiteGestoRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();

  function onTouchStart(evento: ReactTouchEvent<HTMLDivElement>) {
    // Multitouch (pinch, etc.): no es un swipe de navegación, se descarta.
    if (evento.touches.length !== 1) {
      inicioRef.current = null;
      permiteGestoRef.current = false;
      return;
    }
    const toque = evento.touches[0];
    if (!toque) return; // defensivo: `length === 1` ya lo garantiza, pero TS no lo infiere sobre el índice
    inicioRef.current = { x: toque.clientX, y: toque.clientY };
    permiteGestoRef.current = contenedorRef.current
      ? !naceEnContenedorConScrollHorizontal(evento.target as Node, contenedorRef.current)
      : true;
  }

  function onTouchEnd(evento: ReactTouchEvent<HTMLDivElement>) {
    const inicio = inicioRef.current;
    inicioRef.current = null;
    if (!inicio || !permiteGestoRef.current) return;

    const toqueFinal = evento.changedTouches[0];
    if (!toqueFinal) return;

    const dx = toqueFinal.clientX - inicio.x;
    const dy = toqueFinal.clientY - inicio.y;

    if (Math.abs(dx) < UMBRAL_SWIPE_PX) return; // desplazamiento corto: tap o jitter, no navega
    if (Math.abs(dx) <= Math.abs(dy) * FACTOR_DOMINANCIA_EJE) return; // gesto vertical dominante

    const indiceActual = items.findIndex((item) => item.a === location.pathname);
    if (indiceActual === -1) return;

    const indiceDestino = indiceActual + (dx < 0 ? 1 : -1);
    const destino = items[indiceDestino];
    if (!destino) return; // extremo del array: sin wrap-around, el gesto no hace nada

    navigate(destino.a, { viewTransition: true });
  }

  function onTouchCancel() {
    inicioRef.current = null;
    permiteGestoRef.current = false;
  }

  return { ref: contenedorRef, onTouchStart, onTouchEnd, onTouchCancel };
}
