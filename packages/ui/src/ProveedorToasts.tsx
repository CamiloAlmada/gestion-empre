import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Toast, type TipoToast } from './Toast';

interface ToastActivo {
  id: number;
  mensaje: string;
  tipo: TipoToast;
}

export interface EstadoToasts {
  /** Encola un toast. `tipo` por defecto: 'info'. */
  mostrarToast: (mensaje: string, tipo?: TipoToast) => void;
}

const ContextoToasts = createContext<EstadoToasts | null>(null);

export interface ProveedorToastsProps {
  children: ReactNode;
}

/**
 * Provee `mostrarToast()` a toda la app y renderiza la pila de toasts
 * activos, apilados sobre la barra inferior (docs/06-ui-ux.md §5). Cada
 * toast se auto-descarta a los 5s (ver Toast.tsx) o al tocar su botón cerrar.
 */
export function ProveedorToasts({ children }: ProveedorToastsProps) {
  const [toasts, setToasts] = useState<ToastActivo[]>([]);
  const proximoId = useRef(0);

  const descartarToast = useCallback((id: number) => {
    setToasts((actuales) => actuales.filter((toast) => toast.id !== id));
  }, []);

  const mostrarToast = useCallback((mensaje: string, tipo: TipoToast = 'info') => {
    const id = proximoId.current;
    proximoId.current += 1;
    setToasts((actuales) => [...actuales, { id, mensaje, tipo }]);
  }, []);

  const valor = useMemo<EstadoToasts>(() => ({ mostrarToast }), [mostrarToast]);

  return (
    <ContextoToasts.Provider value={valor}>
      {children}
      {/* z-50: por encima de la barra inferior (z-40). bottom-20 despeja los
          ~64px de la barra + margen. aria-live="polite": el role de cada
          Toast (status/alert) ya anuncia al entrar; "polite" en el
          contenedor evita interrumpir si hay varios en cola. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)]"
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            mensaje={toast.mensaje}
            tipo={toast.tipo}
            onDescartar={descartarToast}
          />
        ))}
      </div>
    </ContextoToasts.Provider>
  );
}

/** Acceso a `mostrarToast()`. Debe usarse dentro de un `<ProveedorToasts>`. */
export function useToasts(): EstadoToasts {
  const contexto = useContext(ContextoToasts);
  if (contexto === null) {
    throw new Error('useToasts debe usarse dentro de un <ProveedorToasts>.');
  }
  return contexto;
}
