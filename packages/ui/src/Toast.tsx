import { useEffect, useState } from 'react';

export type TipoToast = 'info' | 'exito' | 'error';

export interface ToastProps {
  mensaje: string;
  tipo: TipoToast;
  onDescartar: () => void;
}

/** Cuánto tiempo queda un toast antes de auto-descartarse. */
export const DURACION_TOAST_MS = 5000;

// Solo tokens semánticos (docs/06-ui-ux.md §4). El patrón "info" replica el
// de AvisoPwa (superficie invertida bg-texto/text-fondo): siempre contrasta
// con el contenido en los dos temas. exito/error usan superficie opaca +
// texto en el color de estado (pares aprobados en docs/06 §7).
const CLASES_POR_TIPO: Record<TipoToast, string> = {
  info: 'bg-texto text-fondo',
  exito: 'border border-borde bg-superficie text-exito',
  error: 'border border-borde bg-superficie text-peligro',
};

// Nada se comunica solo por color: cada tipo suma un glifo decorativo
// además del texto del mensaje (checklist §5).
const GLIFO_POR_TIPO: Record<TipoToast, string> = {
  info: 'ℹ',
  exito: '✓',
  error: '⚠',
};

export function Toast({ mensaje, tipo, onDescartar }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Un frame después de montar, para que la transición de entrada anime
    // desde el estado inicial en vez de arrancar ya en el final.
    const marco = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(marco);
  }, []);

  useEffect(() => {
    const temporizador = setTimeout(onDescartar, DURACION_TOAST_MS);
    return () => clearTimeout(temporizador);
  }, [onDescartar]);

  return (
    <div
      role={tipo === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-lg transition-all duration-200 ease-out motion-reduce:transition-none ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      } ${CLASES_POR_TIPO[tipo]}`}
    >
      <span aria-hidden="true">{GLIFO_POR_TIPO[tipo]}</span>
      <p className="flex-1">{mensaje}</p>
      <button
        type="button"
        onClick={onDescartar}
        aria-label="Cerrar aviso"
        className="rounded-full p-1 text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
