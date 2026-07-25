import { useRef, type RefObject, type TouchEvent as ReactTouchEvent } from 'react';

/**
 * Distancia mínima (px) para que el gesto cuente como swipe intencional y no
 * como un tap con el dedo levemente inestable (docs/06-ui-ux.md §2/§3, UI-4c
 * — mismo criterio de umbral + dominancia de eje que ya usa `Carrito.tsx`
 * §6 para su propio gesto táctil, en `apps/quesarte`). Punto medio del rango
 * sugerido (48-60px).
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

/** Hacia dónde deslizó el dedo. Deliberadamente NO dice "siguiente/anterior"
 * ni "avanzar/retroceder": ese mapeo es decisión de quien consume el hook
 * (orden de rutas en Stock, orden de granularidades en Reportes, lo que
 * sea) — esta pieza solo reporta el gesto físico. */
export type DireccionSwipeHorizontal = 'izquierda' | 'derecha';

export interface ManejadoresSwipeHorizontal {
  /** Se asigna al contenedor sobre el que se quiere detectar el gesto: define
   * el límite superior de la búsqueda de contenedores con scroll horizontal
   * propio y es el nodo sobre el que se escuchan los toques. */
  ref: RefObject<HTMLDivElement | null>;
  onTouchStart: (evento: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (evento: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchCancel: () => void;
}

/**
 * Sube por los ancestros de `objetivo` hasta (sin incluir) `contenedorLimite`
 * buscando un nodo con scroll horizontal propio (un selector con overflow,
 * una tabla): si el gesto nace ahí, el swipe NUNCA debe dispararse — ese
 * contenedor necesita el gesto para su propio scroll (docs/06-ui-ux.md §2,
 * UI-4c). La búsqueda se corta en `contenedorLimite`: no le interesa lo que
 * haya scrolleable por fuera de él.
 */
function naceEnContenedorConScrollHorizontal(objetivo: Node | null, contenedorLimite: HTMLElement): boolean {
  let nodo: Node | null = objetivo;
  while (nodo && nodo !== contenedorLimite) {
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
 * Detección genérica de swipe horizontal (docs/06-ui-ux.md §2, UI-4c),
 * extraída de la implementación original en Stock (`useSwipeSeccion`,
 * `apps/quesarte`) para que Stock y cualquier otra pantalla (hoy: el
 * selector de período de Reportes) compartan EXACTAMENTE la misma detección
 * — mismo umbral, misma dominancia de eje, misma exclusión de contenedores
 * con scroll horizontal propio, mismo descarte de multitouch. Dos
 * detecciones separadas del mismo gesto divergirían con el tiempo (ya pasó
 * en este repo con el cálculo de alertas, duplicado entre Productos y
 * Reportes hasta que se unificó).
 *
 * Deliberadamente NO sabe nada de rutas, períodos ni de qué significa
 * "avanzar": solo informa, vía `onSwipe`, que el usuario deslizó hacia la
 * izquierda o hacia la derecha. Quien la usa decide qué hacer con eso (y si
 * hay wrap-around o límites — acá no hay noción de "extremo").
 *
 * Touch handlers de React sobre el contenedor, SIN listeners globales ni
 * `preventDefault` — el scroll vertical nativo y el scroll horizontal de
 * contenedores excluidos (el selector, tablas) siguen intactos. No hace
 * falta escuchar `touchmove`: la decisión se toma comparando la posición de
 * inicio (`touchstart`) contra la final (`touchend`), sin arrastre visual.
 */
export function useSwipeHorizontal(
  onSwipe: (direccion: DireccionSwipeHorizontal) => void,
): ManejadoresSwipeHorizontal {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inicioRef = useRef<PosicionToque | null>(null);
  // Se decide UNA vez, en touchstart (con el `target` original, antes de que
  // cualquier scroll interno mueva el dedo): si el gesto nace en un
  // contenedor con scroll horizontal propio, se descarta para todo el resto
  // del gesto aunque el dedo termine fuera de ese contenedor.
  const permiteGestoRef = useRef(false);

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

    if (Math.abs(dx) < UMBRAL_SWIPE_PX) return; // desplazamiento corto: tap o jitter, no dispara
    if (Math.abs(dx) <= Math.abs(dy) * FACTOR_DOMINANCIA_EJE) return; // gesto vertical dominante

    onSwipe(dx < 0 ? 'izquierda' : 'derecha');
  }

  function onTouchCancel() {
    inicioRef.current = null;
    permiteGestoRef.current = false;
  }

  return { ref: contenedorRef, onTouchStart, onTouchEnd, onTouchCancel };
}
