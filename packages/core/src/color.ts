/**
 * Conversiones de color OKLCH ⇄ sRGB y contraste WCAG, en TypeScript puro.
 *
 * Portadas de `scripts/contraste.mjs` (que NO se toca): mismas matrices de
 * Björn Ottosson (https://bottosson.github.io/posts/oklab/) y mismo
 * des/re-companding de sRGB. A diferencia del script, acá NO hay `console.warn`
 * ni lectura de archivos: son funciones puras para que el motor de paletas
 * (`paleta.ts`) las use sin side effects (regla de oro 1 de core).
 */

/** Terna sRGB LINEAL (no gamma-corregida). Puede caer fuera de [0,1]. */
export type RgbLineal = readonly [number, number, number];

/** [r,g,b] en 0..255, o `null` si `valor` no es un hex `#rrggbb`. */
export function parseHex(valor: string): readonly [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(valor.trim());
  if (!m) return null;
  const n = parseInt(m[1] ?? '', 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Un canal sRGB (0..255) a lineal (des-companding estándar de sRGB). */
export function componenteSrgbALineal(c255: number): number {
  const cs = c255 / 255;
  return cs <= 0.04045 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

/** Un canal sRGB lineal a 0..1 gamma-corregido (companding estándar de sRGB). */
export function componenteLinealASrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

/** Hex `#rrggbb` a sRGB lineal. @throws {Error} si el hex es inválido. */
export function hexASrgbLineal(hex: string): RgbLineal {
  const rgb255 = parseHex(hex);
  if (!rgb255) throw new Error(`hex inválido: "${hex}"`);
  return [
    componenteSrgbALineal(rgb255[0]),
    componenteSrgbALineal(rgb255[1]),
    componenteSrgbALineal(rgb255[2]),
  ];
}

/** `oklch(L C H)` a `[L,C,H]`, o `null` si no matchea. H en grados. */
export function parseOklch(valor: string): readonly [number, number, number] | null {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(valor);
  if (!m) return null;
  return [parseFloat(m[1] ?? ''), parseFloat(m[2] ?? ''), parseFloat(m[3] ?? '')];
}

/** OKLCH → sRGB lineal (matrices de Ottosson). SIN clamp: el llamador decide
 * qué hacer con canales fuera de [0,1] (`clampGamut` / `dentroDeGamut`). */
export function oklchASrgbLineal(L: number, C: number, H: number): RgbLineal {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** `true` si los 3 canales sRGB lineales están en [0,1]. Es el criterio de
 * "en gamut" de `maxChromaEnGamut` y del capado de chroma del motor. */
export function dentroDeGamut(rgb: RgbLineal): boolean {
  return rgb.every((c) => c >= 0 && c <= 1);
}

/** Resultado de clampear a gamut: la terna capada a [0,1] y si el original
 * caía fuera (tolerancia 1e-4 para no marcar por ruido de redondeo). */
export interface ResultadoClamp {
  readonly rgb: RgbLineal;
  readonly estabaFueraDeGamut: boolean;
}

/** Clampea la terna a [0,1]. NO avisa por consola (a diferencia del script):
 * devuelve el flag para que el llamador decida. */
export function clampGamut(rgb: RgbLineal): ResultadoClamp {
  const [r, g, b] = rgb;
  const estabaFueraDeGamut = r < -1e-4 || r > 1 + 1e-4 || g < -1e-4 || g > 1 + 1e-4 || b < -1e-4 || b > 1 + 1e-4;
  return {
    rgb: [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))],
    estabaFueraDeGamut,
  };
}

/** Luminancia relativa WCAG. Asume la terna YA en lineal (no re-corrige gamma). */
export function luminanciaRelativa(rgb: RgbLineal): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** Ratio de contraste WCAG `(L1+0.05)/(L2+0.05)` con L1 ≥ L2. */
export function ratioContraste(a: RgbLineal, b: RgbLineal): number {
  const lA = luminanciaRelativa(a);
  const lB = luminanciaRelativa(b);
  const [L1, L2] = lA >= lB ? [lA, lB] : [lB, lA];
  return (L1 + 0.05) / (L2 + 0.05);
}

/** OKLCH a hex `#rrggbb`: clamp a gamut + companding sRGB + redondeo a 8 bits.
 * Usado para el `theme-color` del navegador (fondo-light/-dark). */
export function oklchAHex(L: number, C: number, H: number): string {
  const { rgb } = clampGamut(oklchASrgbLineal(L, C, H));
  const canal = (c: number): string =>
    Math.round(componenteLinealASrgb(c) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${canal(rgb[0])}${canal(rgb[1])}${canal(rgb[2])}`;
}

/** Iteraciones de bisección de `maxChromaEnGamut`: 24 ⇒ resolución ≈ 2.4e-8
 * sobre [0, 0.4], sobrada para el margen del 5 % con que el motor usa el
 * resultado. El máximo de chroma OKLCH en gamut sRGB no supera ~0.32. */
const ITERS_MAX_CHROMA = 24;

/** Máxima chroma OKLCH en gamut sRGB para (L, H) dados, por bisección sobre C
 * con `oklchASrgbLineal` SIN clamp (criterio: los 3 canales en [0,1]). */
export function maxChromaEnGamut(l: number, h: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < ITERS_MAX_CHROMA; i++) {
    const mid = (lo + hi) / 2;
    if (dentroDeGamut(oklchASrgbLineal(l, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** L y C con 4 decimales máximo (sin ceros de cola), hue redondeado a entero.
 * Ej.: `serializarOklch(0.56231, 0.108, 214.4)` ⇒ `'oklch(0.5623 0.108 214)'`. */
export function serializarOklch(L: number, C: number, H: number): string {
  return `oklch(${recorte4(L)} ${recorte4(C)} ${Math.round(H)})`;
}

/** Formatea con hasta 4 decimales y sin ceros de cola: `0.5000`→`0.5`, `0`→`0`. */
function recorte4(x: number): string {
  return x.toFixed(4).replace(/\.?0+$/, '');
}
