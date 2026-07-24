/**
 * Runtime del tema del NEGOCIO (tercer eje, docs/06-ui-ux.md §4 "Colores del
 * negocio", tanda TM). A diferencia de `ProveedorTema.tsx` (modo/estilo, dos
 * ejes de PREFERENCIA DEL USUARIO que solo tocan atributos), acá recibimos
 * una paleta ya generada — CSS custom properties calculadas por el motor
 * `generarPaleta` de `@gestion/core` (tarea paralela) — y la aplicamos al
 * documento. Este módulo es puro DOM: no sabe de Firestore ni de cómo se
 * generaron los tokens, solo cómo inyectarlos.
 */
import type { TemaPersonalizado, TinteFondo, TokensGenerados } from '@gestion/core';

// Re-export de conveniencia para consumidores de ui que ya los importaban de
// acá (consolidación post-merge de la Wave 1: los tipos canónicos viven en
// @gestion/core/src/tema.ts y paleta.ts — la fuente es una sola).
export type { TemaPersonalizado, TinteFondo, TokensGenerados };

/** Shape exacto de lo que se persiste en `localStorage['temaNegocio']`: el
 * bloque CSS ya serializado (mismo string que se inyecta en el `<style>`,
 * ver `serializarVariablesTemaNegocio`) + el hex de theme-color. El script
 * anti-FOUC de `index.html` no puede correr el motor (no tiene acceso a
 * @gestion/core en ese punto del arranque) — por eso el cache guarda el
 * OUTPUT ya resuelto, no la semilla. */
export interface CacheTemaNegocio {
  v: 1;
  css: string;
  themeColor: { light: string; dark: string };
}

const ID_STYLE_TEMA_NEGOCIO = 'tema-negocio';
const ATRIBUTO_TEMA_NEGOCIO = 'data-tema-negocio';
const CLAVE_LOCALSTORAGE_TEMA_NEGOCIO = 'temaNegocio';

/**
 * Serializa `variables` (claves ya con el `--` incluido, ver
 * `TokensGenerados`) en UN bloque `:root[data-tema-negocio] { ... }`.
 *
 * Por qué este selector y no otro: `:root` es un pseudo-clase, especificidad
 * (0,1,0); sumarle el atributo `[data-tema-negocio]` da (0,2,0). Eso le gana,
 * SIN depender del orden de inserción en el `<head>`, tanto a los `:root`
 * planos de Capa 1 de `@gestion/config/tailwind.css` como al bloque
 * `[data-estilo='calido']` (también (0,1,0)) — los pares crudos que
 * definimos acá quedan siempre por encima de los del estilo activo. La
 * Capa 2 (los tokens resueltos `--fondo`, `--superficie-translucida`, etc.)
 * NO se toca: sigue leyendo `var(--fondo-light)` / `var(--fondo-dark)` y
 * por lo tanto hereda solos los valores de negocio. Y como esta regla no
 * vive dentro de ningún `@layer`, también le gana sin esfuerzo a la escala
 * `--color-primary-*` de `@theme` (Tailwind v4 emite `@theme` dentro de
 * `@layer theme`, y una regla sin layer siempre gana sobre una con layer).
 */
function serializarVariablesTemaNegocio(variables: Record<string, string>): string {
  const declaraciones = Object.entries(variables)
    .map(([nombre, valor]) => `  ${nombre}: ${valor};`)
    .join('\n');
  return `:root[${ATRIBUTO_TEMA_NEGOCIO}] {\n${declaraciones}\n}`;
}

function obtenerOCrearStyleTemaNegocio(): HTMLStyleElement {
  const existente = document.getElementById(ID_STYLE_TEMA_NEGOCIO);
  if (existente instanceof HTMLStyleElement) {
    return existente;
  }
  const style = document.createElement('style');
  style.id = ID_STYLE_TEMA_NEGOCIO;
  document.head.appendChild(style);
  return style;
}

/**
 * Aplica los tokens del negocio al documento: escribe el bloque CSS en
 * `<style id="tema-negocio">` (creándolo si hace falta, reemplazando su
 * contenido si ya existe — nunca duplica el nodo) y fija
 * `data-tema-negocio` en `<html>`. Idempotente: llamarla varias veces
 * seguidas con los mismos tokens (p. ej. el doble efecto de React
 * StrictMode) deja el DOM exactamente igual, sin nodos ni atributos extra.
 */
export function aplicarTemaNegocio(tokens: TokensGenerados): void {
  const style = obtenerOCrearStyleTemaNegocio();
  style.textContent = serializarVariablesTemaNegocio(tokens.variables);
  document.documentElement.setAttribute(ATRIBUTO_TEMA_NEGOCIO, '');
}

/**
 * Revierte `aplicarTemaNegocio`: quita el atributo de `<html>` y vacía el
 * `<style>` (no lo remueve del `<head>` — se reutiliza en la próxima
 * aplicación). Segura de llamar aunque nunca se haya aplicado nada.
 */
export function limpiarTemaNegocio(): void {
  const style = document.getElementById(ID_STYLE_TEMA_NEGOCIO);
  if (style !== null) {
    style.textContent = '';
  }
  document.documentElement.removeAttribute(ATRIBUTO_TEMA_NEGOCIO);
}

/**
 * Persiste en `localStorage` el CSS YA serializado (el mismo bloque que
 * `aplicarTemaNegocio` inyecta) + el hex de `theme-color`, para que el
 * script anti-FOUC de `index.html` pueda pintarlo antes de que cargue el
 * bundle de React. Tolerante a `localStorage` no disponible (modo privado,
 * contexto restringido), igual que `ProveedorTema.tsx`.
 */
export function escribirCacheTemaNegocio(tokens: TokensGenerados): void {
  const payload: CacheTemaNegocio = {
    v: 1,
    css: serializarVariablesTemaNegocio(tokens.variables),
    themeColor: tokens.themeColor,
  };
  try {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA_NEGOCIO, JSON.stringify(payload));
  } catch {
    // Si no se puede persistir, el tema igual queda aplicado en esta sesión
    // (solo se pierde el anti-FOUC del próximo arranque).
  }
}

/** Borra el cache de `localStorage` (vuelta a los colores originales). */
export function borrarCacheTemaNegocio(): void {
  try {
    window.localStorage.removeItem(CLAVE_LOCALSTORAGE_TEMA_NEGOCIO);
  } catch {
    // Sin localStorage disponible no hay nada que borrar.
  }
}

/** Type guard con las MISMAS verificaciones de sanidad que el script
 * anti-FOUC de `index.html` (duplicadas a propósito ahí, ver
 * `packages/config/anti-fouc-tema-negocio.md`): un dato de `JSON.parse`
 * sobre un string arbitrario de `localStorage` no tiene ningún tipo
 * garantizado, y viaja a un `<style>`/`<meta content>` reales. */
function esCacheTemaNegocioValido(x: unknown): x is CacheTemaNegocio {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o['v'] !== 1) return false;
  if (typeof o['css'] !== 'string') return false;
  if (!o['css'].startsWith(':root[data-tema-negocio]')) return false;
  if (o['css'].includes('</style')) return false;
  const themeColor = o['themeColor'];
  if (typeof themeColor !== 'object' || themeColor === null) return false;
  const tc = themeColor as Record<string, unknown>;
  // Mismo regex de hex que el script inline (nota MENOR del review TM: sin
  // esto, la paridad de sanidad que promete el JSDoc era inexacta).
  const esHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  return esHex(tc['light']) && esHex(tc['dark']);
}

/**
 * Lee y valida el cache de `localStorage['temaNegocio']` (el mismo que
 * `escribirCacheTemaNegocio` escribe y que el script anti-FOUC de
 * `index.html` consume ANTES de que React monte). Pensado para el breve
 * tramo en que el runtime todavía no tiene una respuesta CONFIRMADA de
 * Firestore (`tokens: undefined`, ver `ProveedorTemaNegocio`): en ese
 * tramo, un consumidor que necesite un color YA (p. ej. `MetaThemeColor`
 * para el `theme-color` de la barra de estado) puede caer acá antes de caer
 * al mapa estático por defecto — es la MISMA fuente que ya pintó el
 * `<style>`/atributo que el anti-FOUC dejó en el documento, así que usarla
 * de fallback es coherente con lo que el usuario ya está viendo en pantalla.
 *
 * Devuelve `null` ante cualquier dato ausente, corrupto o que no pase las
 * verificaciones de sanidad — nunca lanza.
 */
export function leerCacheTemaNegocio(): CacheTemaNegocio | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_LOCALSTORAGE_TEMA_NEGOCIO);
    if (crudo === null) return null;
    const datos: unknown = JSON.parse(crudo);
    return esCacheTemaNegocioValido(datos) ? datos : null;
  } catch {
    return null;
  }
}
