/**
 * Runtime del tema del NEGOCIO (tercer eje, docs/06-ui-ux.md §4 "Colores del
 * negocio", tanda TM). A diferencia de `ProveedorTema.tsx` (modo/estilo, dos
 * ejes de PREFERENCIA DEL USUARIO que solo tocan atributos), acá recibimos
 * una paleta ya generada — CSS custom properties calculadas por el motor
 * `generarPaleta` de `@gestion/core` (tarea paralela) — y la aplicamos al
 * documento. Este módulo es puro DOM: no sabe de Firestore ni de cómo se
 * generaron los tokens, solo cómo inyectarlos.
 *
 * TODO(merge TM): reemplazar estos tipos por el import real de @gestion/core
 * una vez que la tarea del motor esté mergeada.
 */

/** Tinte de fondo elegido por el admin (matiz de marca + tinte componen la
 * semilla persistida; ver docs/06-ui-ux.md §4). */
export type TinteFondo = 'neutro' | 'calido' | 'frio';

/** Semilla persistida en `configuracion/tema`: la paleta completa se
 * regenera determinista a partir de esto en cada cliente. */
export interface TemaPersonalizado {
  version: 1;
  matiz: number;
  tinte: TinteFondo;
}

/** Salida completa del motor: los 27 pares crudos (`--fondo-light`, etc.) +
 * la escala `--color-primary-*`, listos para volcar tal cual a un bloque
 * CSS, más el hex de `theme-color` para el meta tag (tarea posterior) y el
 * reporte de contraste (no se consume acá). */
export interface TokensGenerados {
  version: 1;
  tema: TemaPersonalizado;
  variables: Record<string, string>;
  themeColor: { light: string; dark: string };
  reporte: unknown;
}

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
