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

/**
 * Segundo eje de tema (independiente de `Tema`, docs/06-ui-ux.md §4):
 * `minimalista` es el default (no fija atributo); `calido` fija
 * `data-estilo="calido"` en `<html>`, que redefine los tokens semánticos de
 * color/forma en `@gestion/config/tailwind.css`.
 */
export type Estilo = 'minimalista' | 'calido';

const CLAVE_LOCALSTORAGE_TEMA = 'tema';
const CLAVE_LOCALSTORAGE_ESTILO = 'estilo';

export interface EstadoTema {
  tema: Tema;
  setTema: (tema: Tema) => void;
  estilo: Estilo;
  setEstilo: (estilo: Estilo) => void;
}

const ContextoTema = createContext<EstadoTema | null>(null);

function esTemaValido(valor: unknown): valor is Tema {
  return valor === 'light' || valor === 'dark' || valor === 'system';
}

function esEstiloValido(valor: unknown): valor is Estilo {
  return valor === 'minimalista' || valor === 'calido';
}

function leerTemaGuardado(): Tema {
  try {
    const guardado = window.localStorage.getItem(CLAVE_LOCALSTORAGE_TEMA);
    return esTemaValido(guardado) ? guardado : 'system';
  } catch {
    // localStorage puede no estar disponible (modo privado, contexto
    // restringido). El tema por defecto es "system".
    return 'system';
  }
}

function leerEstiloGuardado(): Estilo {
  try {
    const guardado = window.localStorage.getItem(CLAVE_LOCALSTORAGE_ESTILO);
    return esEstiloValido(guardado) ? guardado : 'minimalista';
  } catch {
    // Misma tolerancia que leerTemaGuardado: sin localStorage disponible, el
    // estilo por defecto es "minimalista" (el look actual, sin atributo).
    return 'minimalista';
  }
}

function aplicarTema(tema: Tema): void {
  if (tema === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', tema);
  }
}

function aplicarEstilo(estilo: Estilo): void {
  if (estilo === 'minimalista') {
    document.documentElement.removeAttribute('data-estilo');
  } else {
    document.documentElement.setAttribute('data-estilo', 'calido');
  }
}

export interface ProveedorTemaProps {
  children: ReactNode;
}

/**
 * Provee los dos ejes de tema (`tema`: light/dark/system, `estilo`:
 * minimalista/cálido) a toda la app. Al montar, lee la preferencia guardada
 * de cada eje en `localStorage` (fallbacks `system` y `minimalista`) y la
 * aplica de inmediato. Cada cambio se persiste y se refleja en `data-theme`
 * / `data-estilo` de `<html>` (ver docs/06-ui-ux.md §4).
 */
export function ProveedorTema({ children }: ProveedorTemaProps) {
  const [tema, setTemaState] = useState<Tema>(() => leerTemaGuardado());
  const [estilo, setEstiloState] = useState<Estilo>(() => leerEstiloGuardado());

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  useEffect(() => {
    aplicarEstilo(estilo);
  }, [estilo]);

  const setTema = useCallback((nuevoTema: Tema) => {
    setTemaState(nuevoTema);
    try {
      window.localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA, nuevoTema);
    } catch {
      // Si no se puede persistir, el tema igual se aplica en esta sesión.
    }
  }, []);

  const setEstilo = useCallback((nuevoEstilo: Estilo) => {
    setEstiloState(nuevoEstilo);
    try {
      window.localStorage.setItem(CLAVE_LOCALSTORAGE_ESTILO, nuevoEstilo);
    } catch {
      // Si no se puede persistir, el estilo igual se aplica en esta sesión.
    }
  }, []);

  const valor = useMemo<EstadoTema>(
    () => ({ tema, setTema, estilo, setEstilo }),
    [tema, setTema, estilo, setEstilo],
  );

  return <ContextoTema.Provider value={valor}>{children}</ContextoTema.Provider>;
}

/** Acceso al tema y estilo actuales y sus setters. Debe usarse dentro de un
 * `<ProveedorTema>`. */
export function useTema(): EstadoTema {
  const contexto = useContext(ContextoTema);
  if (contexto === null) {
    throw new Error('useTema debe usarse dentro de un <ProveedorTema>.');
  }
  return contexto;
}
