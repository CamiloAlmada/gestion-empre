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
   * `previsualizar` activo, si no los persistidos (la prop `tokens`, con su
   * mismo tri-estado — ver el JSDoc de `ProveedorTemaNegocioProps.tokens`).
   * Un consumidor que necesite reflejar lo que se está VIENDO (p. ej. el
   * meta `theme-color`) lee de acá — no de la prop. */
  tokens: TokensGenerados | null | undefined;
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
  /**
   * Tri-estado — la distinción es el contrato central de este componente
   * (bug real de producción, tanda TM7: un `null` sobrecargado como "sin
   * tema" Y "todavía no sé" hacía que el runtime anulara el anti-FOUC y
   * borrara el cache en CADA arranque, ver el commit que introdujo este
   * JSDoc):
   *
   * - `undefined` — "desconocido, todavía no hay respuesta confirmada"
   *   (Firestore cargando, o un error de lectura como `permission-denied`
   *   en `/login`, donde las reglas exigen usuario activo). NO se toca el
   *   DOM (lo que el script anti-FOUC de `index.html` ya pintó desde el
   *   cache queda intacto) NI el cache — ninguno de los dos efectos corre.
   *   Es el valor inicial correcto mientras el llamador (`Sincronizador
   *   TemaNegocio` en la app) no tiene todavía una respuesta definitiva.
   * - `null` — "CONFIRMADO: el negocio no tiene tema propio" (lectura
   *   exitosa sin doc, o doc corrupto/de otra versión que el converter
   *   tolerante mapea a `null`). Acá SÍ se limpia el documento (vuelve a
   *   los colores base de `@gestion/config/tailwind.css`) y se borra el
   *   cache — es una confirmación real, no falta de información.
   * - `TokensGenerados` — tokens ya generados por el motor de
   *   `@gestion/core`: se aplican al documento y se cachean en
   *   `localStorage` para el anti-FOUC del próximo arranque.
   *
   * La app es quien decide de dónde sale cada estado (doc
   * `configuracion/tema` + `generarPaleta`) — este componente no sabe de
   * Firestore, solo qué hacer con cada uno de los tres valores.
   */
  tokens: TokensGenerados | null | undefined;
  children: ReactNode;
}

/**
 * Provee el tercer eje de tema — los colores DEL NEGOCIO, no del usuario
 * (docs/06-ui-ux.md §4) — a toda la app. Controlado 100% por props: cada
 * cambio de `tokens` se refleja en el documento y en el cache según su
 * tri-estado (ver el JSDoc de `ProveedorTemaNegocioProps.tokens` — la
 * distinción `undefined`/`null` es central, no un detalle). Además expone
 * `previsualizar`/`restaurar` para el editor de Ajustes → Apariencia
 * (preview en vivo sin tocar el cache; descartar, navegar o desmontar el
 * editor SIEMPRE vuelve a los tokens persistidos).
 */
export function ProveedorTemaNegocio({ tokens, children }: ProveedorTemaNegocioProps) {
  const [draft, setDraft] = useState<TokensGenerados | null>(null);

  // `draft` (no-null) siempre gana, sea cual sea el estado de `tokens` —
  // previsualizar mientras la carga inicial todavía no resolvió es un caso
  // válido (el editor solo puede abrirse con sesión admin, momento en el
  // que la carga ya resolvió en la práctica, pero el tipo no lo exige).
  const efectivos = draft ?? tokens;

  // Aplica al DOM lo que corresponda. `undefined` es el único caso que NO
  // toca nada: ni aplica ni limpia, así que lo que haya pintado el script
  // anti-FOUC (o lo que ya estuviera aplicado de un ciclo anterior) queda
  // intacto — es la semántica "no tocar" documentada en el prop. `null` y
  // `TokensGenerados` sí registran su propio cleanup (`limpiarTemaNegocio`),
  // así que StrictMode (montaje doble) no deja atributos ni `<style>`
  // duplicados en esos dos casos.
  useEffect(() => {
    if (efectivos === undefined) {
      return undefined;
    }
    if (efectivos !== null) {
      aplicarTemaNegocio(efectivos);
    } else {
      limpiarTemaNegocio();
    }
    return () => {
      limpiarTemaNegocio();
    };
  }, [efectivos]);

  // El cache SOLO refleja lo persistido (la prop, nunca el preview) Y SOLO
  // ante una respuesta CONFIRMADA (`null` o tokens reales) — `undefined` no
  // toca el cache, mismo criterio que el DOM arriba: mientras no hay nada
  // confirmado, el cache sigue siendo la mejor fuente que tiene el anti-FOUC
  // del PRÓXIMO arranque, y pisarlo con "todavía no sé" lo destruiría sin
  // necesidad. Si el usuario cierra la pestaña en medio de un preview sin
  // guardar, el próximo arranque debe mostrar el tema real, no el borrador
  // descartado — por eso esto depende de `tokens`, no de `efectivos`.
  useEffect(() => {
    if (tokens === undefined) {
      return;
    }
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
