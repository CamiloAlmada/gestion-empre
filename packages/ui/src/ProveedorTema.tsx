import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * `light`/`dark` fijan `data-theme` en `<html>`. `system` no fija el
 * atributo: el CSS del tema compartido (`@gestion/config/tailwind.css`) ya
 * resuelve los tokens por `prefers-color-scheme` cuando no hay `data-theme`.
 */
export type Tema = 'light' | 'dark' | 'system';

const CLAVE_LOCALSTORAGE = 'tema';

export interface EstadoTema {
  tema: Tema;
  setTema: (tema: Tema) => void;
}

const ContextoTema = createContext<EstadoTema | null>(null);

function esTemaValido(valor: unknown): valor is Tema {
  return valor === 'light' || valor === 'dark' || valor === 'system';
}

function leerTemaGuardado(): Tema {
  try {
    const guardado = window.localStorage.getItem(CLAVE_LOCALSTORAGE);
    return esTemaValido(guardado) ? guardado : 'system';
  } catch {
    // localStorage puede no estar disponible (modo privado, contexto
    // restringido). El tema por defecto es "system".
    return 'system';
  }
}

function aplicarTema(tema: Tema): void {
  if (tema === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', tema);
  }
}

export interface ProveedorTemaProps {
  children: ReactNode;
}

/**
 * Provee el tema (`light`/`dark`/`system`) a toda la app. Al montar, lee la
 * preferencia guardada en `localStorage` (fallback `system`) y la aplica de
 * inmediato. Cada cambio se persiste y se refleja en `data-theme` de
 * `<html>` (ver docs/06-ui-ux.md §4).
 */
export function ProveedorTema({ children }: ProveedorTemaProps) {
  const [tema, setTemaState] = useState<Tema>(() => leerTemaGuardado());

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  const setTema = useCallback((nuevoTema: Tema) => {
    setTemaState(nuevoTema);
    try {
      window.localStorage.setItem(CLAVE_LOCALSTORAGE, nuevoTema);
    } catch {
      // Si no se puede persistir, el tema igual se aplica en esta sesión.
    }
  }, []);

  const valor = useMemo<EstadoTema>(() => ({ tema, setTema }), [tema, setTema]);

  return <ContextoTema.Provider value={valor}>{children}</ContextoTema.Provider>;
}

/** Acceso al tema actual y su setter. Debe usarse dentro de un `<ProveedorTema>`. */
export function useTema(): EstadoTema {
  const contexto = useContext(ContextoTema);
  if (contexto === null) {
    throw new Error('useTema debe usarse dentro de un <ProveedorTema>.');
  }
  return contexto;
}
