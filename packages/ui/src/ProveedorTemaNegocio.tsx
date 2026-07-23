import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  aplicarTemaNegocio,
  borrarCacheTemaNegocio,
  escribirCacheTemaNegocio,
  limpiarTemaNegocio,
  type TokensGenerados,
} from './temaNegocio';

export interface EstadoTemaNegocio {
  /** Tokens EFECTIVOS mostrados ahora mismo: los del draft si hay un
   * `previsualizar` activo, si no los persistidos (la prop `tokens`). Un
   * consumidor que necesite reflejar lo que se está VIENDO (p. ej. el meta
   * `theme-color`, tarea posterior) lee de acá — no de la prop. */
  tokens: TokensGenerados | null;
  /** Aplica `tokensDraft` al documento sin tocar el cache de localStorage
   * (el editor de Ajustes lo usa para el preview en vivo; Guardar/Descartar
   * decide después si eso se persiste o no). */
  previsualizar: (tokensDraft: TokensGenerados) => void;
  /** Descarta cualquier preview activo y vuelve a reflejar los tokens
   * persistidos (la prop `tokens` vigente, o limpia el documento si es
   * `null`). */
  restaurar: () => void;
}

const ContextoTemaNegocio = createContext<EstadoTemaNegocio | null>(null);

export interface ProveedorTemaNegocioProps {
  /** Tokens ya generados por el motor de `@gestion/core` (o `null` si el
   * negocio no tiene tema personalizado, es decir usa los colores base de
   * `@gestion/config/tailwind.css`). La app es quien decide de dónde salen
   * (doc `configuracion/tema` + `generarPaleta`) — este componente no sabe
   * de Firestore, solo recibe el resultado. */
  tokens: TokensGenerados | null;
  children: ReactNode;
}

/**
 * Provee el tercer eje de tema — los colores DEL NEGOCIO, no del usuario
 * (docs/06-ui-ux.md §4) — a toda la app. Controlado 100% por props: cada
 * cambio de `tokens` (nuevo doc de Firestore, o `null` si se borró) se
 * aplica al documento y se cachea en `localStorage` para el anti-FOUC del
 * próximo arranque. Además expone `previsualizar`/`restaurar` para el editor
 * de Ajustes → Apariencia (preview en vivo sin tocar el cache; descartar,
 * navegar o desmontar el editor SIEMPRE vuelve a los tokens persistidos).
 */
export function ProveedorTemaNegocio({ tokens, children }: ProveedorTemaNegocioProps) {
  const [draft, setDraft] = useState<TokensGenerados | null>(null);

  const efectivos = draft ?? tokens;

  // Aplica al DOM lo que corresponda mostrar (preview si hay, si no lo
  // persistido). Se re-ejecuta tanto si cambia el draft como si cambia la
  // prop — el cleanup (desmontaje o cambio de dependencia) deja el
  // documento limpio antes de la siguiente aplicación, así que StrictMode
  // (montaje doble) no deja atributos ni <style> duplicados.
  useEffect(() => {
    if (efectivos !== null) {
      aplicarTemaNegocio(efectivos);
    } else {
      limpiarTemaNegocio();
    }
    return () => {
      limpiarTemaNegocio();
    };
  }, [efectivos]);

  // El cache SOLO refleja lo persistido (la prop), nunca el preview: si el
  // usuario cierra la pestaña en medio de un preview sin guardar, el
  // próximo arranque debe mostrar el tema real, no el borrador descartado.
  useEffect(() => {
    if (tokens !== null) {
      escribirCacheTemaNegocio(tokens);
    } else {
      borrarCacheTemaNegocio();
    }
  }, [tokens]);

  const previsualizar = useCallback((tokensDraft: TokensGenerados) => {
    setDraft(tokensDraft);
  }, []);

  const restaurar = useCallback(() => {
    setDraft(null);
  }, []);

  const valor = useMemo<EstadoTemaNegocio>(
    () => ({ tokens: efectivos, previsualizar, restaurar }),
    [efectivos, previsualizar, restaurar],
  );

  return (
    <ContextoTemaNegocio.Provider value={valor}>{children}</ContextoTemaNegocio.Provider>
  );
}

/** Acceso a los tokens de negocio efectivos y a `previsualizar`/`restaurar`.
 * Debe usarse dentro de un `<ProveedorTemaNegocio>`. */
export function useTemaNegocio(): EstadoTemaNegocio {
  const contexto = useContext(ContextoTemaNegocio);
  if (contexto === null) {
    throw new Error('useTemaNegocio debe usarse dentro de un <ProveedorTemaNegocio>.');
  }
  return contexto;
}
