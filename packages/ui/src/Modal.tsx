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
      dialog.close();
    }
  }, [abierto]);

  // "close" cubre TODOS los caminos de cierre nativo (Escape dispara
  // "cancel" y luego "close"; nuestro click en backdrop y el botón de
  // "acciones" llaman a dialog.close() directamente). Es la única fuente de
  // verdad para avisarle al padre y devolver el foco: evita duplicar lógica
  // por cada gesto de cierre.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }

    function manejarClose() {
      onCerrar();
      const disparador = disparadorRef.current;
      if (disparador instanceof HTMLElement) {
        disparador.focus();
      }
    }

    dialog.addEventListener('close', manejarClose);
    return () => dialog.removeEventListener('close', manejarClose);
  }, [onCerrar]);

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
      className="m-auto w-[min(90vw,28rem)] rounded-2xl border border-borde bg-superficie p-0 text-texto shadow-lg backdrop:bg-primary-950/60"
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
