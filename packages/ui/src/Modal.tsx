import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

export interface ModalProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
  acciones?: ReactNode;
}

/**
 * Modal basado en `<dialog>` nativo (`showModal()`): focus trap y manejo de
 * Escape correctos "gratis" en cualquier navegador moderno. Fondo siempre
 * opaco (docs/06-ui-ux.md §3: los modales nunca son translúcidos). Cierra
 * con Escape o con click en el backdrop, y en ambos casos devuelve el foco
 * al elemento que lo abrió.
 */
export function Modal({ abierto, onCerrar, titulo, children, acciones }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const disparadorRef = useRef<Element | null>(null);
  // true mientras el <dialog> se está cerrando porque LA PROP `abierto` pasó
  // a false (el padre ya decidió cerrar, típicamente porque su propio botón
  // de "acciones" llama a `onCerrar` directamente antes de que este efecto
  // corra). En ese caso el evento "close" que dispara nuestro propio
  // `dialog.close()` es un eco del cierre que el padre ya conoce: no hay que
  // volver a llamar a `onCerrar` (evita el doble aviso).
  const cerrandoPorPropRef = useRef(false);
  const tituloId = useId();

  // Abre/cierra el <dialog> nativo en respuesta a la prop `abierto`, y
  // recuerda qué elemento tenía el foco antes de abrir para devolvérselo al
  // cerrar (ver el otro efecto, más abajo).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }

    if (abierto && !dialog.open) {
      disparadorRef.current = document.activeElement;
      dialog.showModal();
    } else if (!abierto && dialog.open) {
      cerrandoPorPropRef.current = true;
      dialog.close();
    }
  }, [abierto]);

  // "close" cubre TODOS los caminos de cierre nativo (Escape dispara
  // "cancel" y luego "close"; nuestro click en backdrop y el efecto de
  // arriba llaman a dialog.close() directamente). Es la única fuente de
  // verdad para devolver el foco: evita duplicar esa lógica por cada gesto
  // de cierre. Avisar a `onCerrar`, en cambio, se salta cuando el cierre fue
  // iniciado por la prop (ver `cerrandoPorPropRef`) para no avisar dos veces
  // de un cierre que el padre ya originó.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }

    function manejarClose() {
      const avisadoPorElPadre = cerrandoPorPropRef.current;
      cerrandoPorPropRef.current = false;

      if (!avisadoPorElPadre) {
        onCerrar();
      }
      const disparador = disparadorRef.current;
      if (disparador instanceof HTMLElement) {
        disparador.focus();
      }
    }

    dialog.addEventListener('close', manejarClose);
    return () => dialog.removeEventListener('close', manejarClose);
  }, [onCerrar]);

  // Bloquea el scroll del body mientras el modal está abierto: sin esto, el
  // contenido de atrás sigue scrolleando bajo el modal (scroll chaining),
  // sobre todo notorio en mobile/PWA. Guarda el `overflow` que el body TENÍA
  // antes de este modal y lo restaura al cerrar/desmontar, en vez de asumir
  // que era `''` — necesario para modales encadenados (p. ej. "Agregar
  // stock" abre "Categorías" encima): si A abre (guarda su `overflow`
  // original, pone `hidden`) y luego B abre (guarda el `hidden` que dejó A,
  // lo deja en `hidden`), cerrar B restaura lo que B guardó (`hidden`: A
  // sigue abierto, el body debe seguir bloqueado) y recién cerrar A restaura
  // el valor original. Cada instancia solo conoce y toca el valor que ELLA
  // encontró al abrir, así que el body nunca queda desbloqueado con un
  // modal todavía abierto, ni bloqueado de más tras cerrar el último.
  useEffect(() => {
    if (!abierto) {
      return;
    }
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto]);

  function manejarClickBackdrop(evento: MouseEvent<HTMLDialogElement>) {
    // El backdrop nativo (::backdrop) no es descendiente del <dialog>: un
    // click ahí llega con target === el propio <dialog> (el contenido visual
    // vive en el div interior, con padding propio). Click dentro del
    // contenido no cierra.
    if (evento.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  }

  function manejarKeyDown(evento: KeyboardEvent<HTMLDialogElement>) {
    // Fallback explícito: en navegadores reales el <dialog> abierto ya
    // cierra solo con Escape (evento "cancel" nativo). El guard `.open`
    // evita duplicar el cierre si el navegador ya lo hizo.
    if (evento.key === 'Escape' && dialogRef.current?.open === true) {
      dialogRef.current.close();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={tituloId}
      onClick={manejarClickBackdrop}
      onKeyDown={manejarKeyDown}
      className="m-auto w-[min(90vw,28rem)] rounded-card border border-borde bg-superficie p-0 text-texto shadow-flotante backdrop:bg-primary-950/60"
    >
      <div className="flex max-h-[85vh] flex-col gap-4 p-6">
        <h2 id={tituloId} className="text-lg font-semibold text-texto">
          {titulo}
        </h2>
        <div className="overflow-y-auto text-texto">{children}</div>
        {acciones !== undefined && <div className="flex justify-end gap-2 pt-2">{acciones}</div>}
      </div>
    </dialog>
  );
}
