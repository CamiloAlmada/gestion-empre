import { useEffect } from 'react';
import { useTema, type Estilo, type Tema } from '@gestion/ui';

type ModoEfectivo = 'light' | 'dark';

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
 * - `calido.*`: PROVISORIOS. El bloque `[data-estilo='calido']` que
 *   redefine los tokens de color en `tailwind.css` todavía no existe (la
 *   paleta Cálido se diseña y verifica AA en otra tarea, ver
 *   docs/06-ui-ux.md §4/§7) — estos hex son una aproximación visual al
 *   crema/marrón descriptos ahí, NO un valor derivado de un token real.
 *   TODO(paleta-calido): reemplazar por el hex real de `--fondo` una vez
 *   que esa tarea defina y verifique los tokens de Cálido.
 */
export const MAPA_THEME_COLOR: Record<Estilo, Record<ModoEfectivo, string>> = {
  minimalista: {
    light: '#f6f3ef',
    dark: '#040302',
  },
  calido: {
    light: '#f6ecdc',
    dark: '#241a12',
  },
};

function resolverModoEfectivo(tema: Tema, prefiereOscuro: boolean): ModoEfectivo {
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
 * El valor inicial (antes de que React monte) lo fija el script anti-FOUC
 * de `index.html` con el mismo mapa, duplicado a propósito — mismo patrón
 * que la lectura de `tema`/`estilo` guardados (ver ProveedorTema.tsx).
 */
export function MetaThemeColor() {
  const { tema, estilo } = useTema();

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function aplicar() {
      const modo = resolverModoEfectivo(tema, media.matches);
      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', MAPA_THEME_COLOR[estilo][modo]);
    }

    aplicar();

    if (tema !== 'system') {
      return undefined;
    }
    media.addEventListener('change', aplicar);
    return () => media.removeEventListener('change', aplicar);
  }, [tema, estilo]);

  return null;
}
