import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Link de "volver" a la izquierda del header (breadcrumb de un solo nivel,
 * docs/06-ui-ux.md §2): `etiqueta` es el nombre del padre ("Stock",
 * "Ajustes"), `a` la ruta destino. */
export interface VolverA {
  etiqueta: string;
  a: string;
}

export interface ConfigHeader {
  /** Título de la VISTA actual, no del tab (p.ej. en Stock → Productos dice
   * "Productos"). Conciso (~15 caracteres, docs/06 §2). */
  titulo: string;
  /** Presente solo en subvistas (Productos, Usuarios, detalle de producto). */
  volverA?: VolverA;
  /** Hasta 2 acciones contextuales de la pantalla, renderizadas a la derecha. */
  acciones?: ReactNode;
}

interface EstadoHeaderContexto {
  config: ConfigHeader | null;
  setConfig: (config: ConfigHeader | null) => void;
}

const ContextoHeader = createContext<EstadoHeaderContexto | null>(null);

export interface ProveedorHeaderProps {
  children: ReactNode;
}

/**
 * Provee el estado del header contextual (docs/06-ui-ux.md §2): las
 * pantallas lo setean con `useHeader()`, `Shell` lo lee para renderizar
 * `[‹ Padre] Título [acciones]`. Vive DENTRO de `Shell` (envuelve el
 * `Outlet`), NO en `main.tsx`: es un detalle de layout del shell, no de la
 * app entera.
 */
export function ProveedorHeader({ children }: ProveedorHeaderProps) {
  const [config, setConfig] = useState<ConfigHeader | null>(null);
  const valor = useMemo<EstadoHeaderContexto>(() => ({ config, setConfig }), [config]);

  return <ContextoHeader.Provider value={valor}>{children}</ContextoHeader.Provider>;
}

/** Acceso interno al estado crudo del header (config actual + setter). Lo usa
 * `Shell` para renderizar; las pantallas usan `useHeader()` más abajo, nunca
 * esto directamente. */
function useContextoHeader(): EstadoHeaderContexto {
  const contexto = useContext(ContextoHeader);
  if (contexto === null) {
    throw new Error('useHeader debe usarse dentro de un <ProveedorHeader> (ver Shell.tsx).');
  }
  return contexto;
}

/** Lectura del header contextual actual, para `Shell`. `config === null`
 * significa que ninguna pantalla montada lo seteó todavía: `Shell` cae a su
 * fallback (`TITULOS_POR_TAB`). */
export function useHeaderActual(): ConfigHeader | null {
  return useContextoHeader().config;
}

/**
 * Setea el header contextual de la pantalla que la llama: título, link de
 * volver opcional y hasta 2 acciones a la derecha (docs/06-ui-ux.md §2). Se
 * limpia solo al desmontar (vuelve a `null`), para no dejar el título de una
 * pantalla vieja colgado al navegar a otra que no llama a este hook.
 *
 * IMPORTANTE — por qué `acciones` NO está en el array de dependencias del
 * efecto: `Shell` envuelve el `Outlet` con `ProveedorHeader`, así que la
 * pantalla que llama a `useHeader()` es SIEMPRE descendiente del propio
 * `ProveedorHeader`. Si el efecto dependiera de la identidad de `acciones`
 * (normalmente un literal JSX nuevo en cada render, p.ej.
 * `acciones: <Button>…</Button>`), se arma un loop infinito: `setConfig`
 * cambia el estado del provider → re-renderiza todo su árbol (incluida la
 * pantalla, por ser descendiente) → la pantalla vuelve a crear un `acciones`
 * con una identidad distinta → el efecto se re-dispara → `setConfig` de
 * nuevo, sin fin (confirmado a mano: cuelga el proceso de test). Por eso solo
 * se depende de los campos PRIMITIVOS de `volverA` (`etiqueta`/`a`) y de
 * `titulo`; `acciones` se lee del closure más reciente cuando el efecto sí se
 * re-dispara (por un cambio real de título o de volver). Esto es seguro
 * mientras el contenido de `acciones` solo cierre sobre setters estables
 * (`useState` setters, siempre estables) — el patrón que siguen todas las
 * pantallas del proyecto; si alguna futura necesita que `acciones` cambie por
 * otro motivo, hay que reflejarlo en `titulo`/`volverA` o extender este hook.
 */
export function useHeader({ titulo, volverA, acciones }: ConfigHeader): void {
  const { setConfig } = useContextoHeader();
  const etiquetaVolver = volverA?.etiqueta;
  const destinoVolver = volverA?.a;

  useEffect(() => {
    setConfig({
      titulo,
      volverA: etiquetaVolver !== undefined && destinoVolver !== undefined
        ? { etiqueta: etiquetaVolver, a: destinoVolver }
        : undefined,
      acciones,
    });
    return () => setConfig(null);
    // acciones deliberadamente fuera del array: ver comentario arriba.
  }, [titulo, etiquetaVolver, destinoVolver, setConfig]);
}
