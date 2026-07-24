import { useEffect } from 'react';
import { leerCacheTemaNegocio, useTema, useTemaNegocio, type Estilo, type Tema } from '@gestion/ui';

export type ModoEfectivo = 'light' | 'dark';

/**
 * Mapa de las 4 combinaciones (estilo × modo efectivo) → color hex para
 * `<meta name="theme-color">`. Cada valor DEBE ser el `--fondo` resuelto de
 * esa combinación en `packages/config/tailwind.css` (es el color de fondo
 * de toda la app, así que es el que mejor integra la barra de estado del
 * navegador/SO con la UI).
 *
 * - `minimalista.*`: calculados con precisión desde los tokens OKLCH reales
 *   (`--color-neutral-100` / `--color-neutral-950`, que son los que
 *   `--fondo-light`/`--fondo-dark` usan hoy para el estilo Minimalista) vía
 *   conversión OKLCH → OKLab → linear sRGB → sRGB (matrices y fórmula de
 *   Björn Ottosson, https://bottosson.github.io/posts/oklab/, gamma sRGB
 *   estándar). Script usado (Node, sin dependencias):
 *
 *   oklch(0.965 0.006 75) → #f6f3ef   (neutral-100, minimalista-light)
 *   oklch(0.1   0.006 75) → #040302   (neutral-950, minimalista-dark)
 *
 * - `calido.*`: calculados con la misma conversión OKLCH → OKLab → linear
 *   sRGB → sRGB (Björn Ottosson, gamma sRGB estándar) desde los tokens
 *   `--fondo-light`/`--fondo-dark` reales del bloque `[data-estilo='calido']`
 *   en `packages/config/tailwind.css` (verificados AA en docs/06-ui-ux.md
 *   §7, tarea TH-E):
 *
 *   oklch(0.955 0.03 85)  → #f9efda   (--fondo-light, calido-light)
 *   oklch(0.15  0.015 55) → #100906   (--fondo-dark, calido-dark)
 */
export const MAPA_THEME_COLOR: Record<Estilo, Record<ModoEfectivo, string>> = {
  minimalista: {
    light: '#f6f3ef',
    dark: '#040302',
  },
  calido: {
    light: '#f9efda',
    dark: '#100906',
  },
};

/** Exportada para reutilizar el mismo criterio "modo efectivo" fuera de acá
 * (p. ej. `SeccionColoresNegocio.tsx`, que necesita saber si mostrar la
 * galería de presets en su variante light o dark). Pura, sin side effects. */
export function resolverModoEfectivo(tema: Tema, prefiereOscuro: boolean): ModoEfectivo {
  if (tema === 'system') {
    return prefiereOscuro ? 'dark' : 'light';
  }
  return tema;
}

/**
 * Mantiene `<meta name="theme-color">` (definido en `index.html`)
 * sincronizado con la combinación activa de estilo × modo efectivo, vía
 * `MAPA_THEME_COLOR`. En modo "system" sigue los cambios de
 * `prefers-color-scheme` en vivo (mismo criterio que los tokens CSS). No
 * renderiza nada — se monta una sola vez en `App.tsx`, fuera de las rutas,
 * para que aplique también en `/login` (docs/06-ui-ux.md §4).
 *
 * "Colores del negocio" (tercer eje, tanda TM) tiene PRIORIDAD sobre el mapa
 * estático: si hay tokens EFECTIVOS (`useTemaNegocio().tokens` — incluye el
 * preview en vivo del editor de Ajustes, no solo lo persistido), se usa el
 * `themeColor` de ESE modo. `MAPA_THEME_COLOR` es el ÚLTIMO fallback, para
 * cuando el negocio CONFIRMADO no tiene tema propio (`tokens === null`).
 *
 * CASCADA DE 3 NIVELES (BLOQ-1, tanda TM7): con el tri-estado de
 * `ProveedorTemaNegocioProps.tokens`, `tokens` puede ser `undefined`
 * ("todavía no sé" — Firestore cargando, o `/login` con permission-denied).
 * Ahí NO hay que caer directo al mapa estático — eso parpadearía la barra
 * de estado a un color distinto del que el negocio configuró, apenas React
 * monta, durante toda la carga (o toda la sesión, en `/login`). En cambio,
 * `leerCacheTemaNegocio()` lee el MISMO cache que el script anti-FOUC de
 * `index.html` ya usó para pintar el `<style>`/el `theme-color` inicial
 * antes del primer paint: es la mejor aproximación disponible mientras no
 * hay nada confirmado, y coincide con lo que el usuario ya está viendo.
 * `tokens?.themeColor[modo] ?? leerCacheTemaNegocio()?.themeColor[modo] ??
 * MAPA_THEME_COLOR[estilo][modo]`. Con `tokens: null` CONFIRMADO, el cache
 * ya no existe (`ProveedorTemaNegocio` lo borra en el mismo momento que
 * confirma "sin tema") — la cascada de todos modos intenta leerlo primero,
 * pero como está vacío cae naturalmente al mapa, sin necesitar un caso
 * especial para "no usar el cache si es null".
 *
 * El valor inicial (antes de que React monte) lo fija el script anti-FOUC
 * de `index.html` con el mismo criterio (cache de `temaNegocio` primero, el
 * mapa estático como fallback), duplicado a propósito — mismo patrón que la
 * lectura de `tema`/`estilo` guardados (ver ProveedorTema.tsx).
 */
export function MetaThemeColor() {
  const { tema, estilo } = useTema();
  const { tokens } = useTemaNegocio();

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function aplicar() {
      const modo = resolverModoEfectivo(tema, media.matches);
      const meta = document.querySelector('meta[name="theme-color"]');
      const color =
        tokens?.themeColor[modo] ?? leerCacheTemaNegocio()?.themeColor[modo] ?? MAPA_THEME_COLOR[estilo][modo];
      meta?.setAttribute('content', color);
    }

    aplicar();

    if (tema !== 'system') {
      return undefined;
    }
    media.addEventListener('change', aplicar);
    return () => media.removeEventListener('change', aplicar);
  }, [tema, estilo, tokens]);

  return null;
}
