/**
 * Motor de paletas personalizadas: `generarPaleta(tema)` deriva las 27
 * variables crudas de Capa 1 de `packages/config/tailwind.css` en OKLCH, con
 * AA garantizado por construcción (docs/06-ui-ux.md §4 y §7). Puro y
 * determinista: misma semilla ⇒ mismos strings, byte a byte.
 *
 * ANCLAJE POR LUMINANCIA WCAG (Y), no por L de OKLCH. El ratio WCAG depende
 * solo de Y ((Y1+0.05)/(Y2+0.05)); fijar la L de OKLCH por escalón daría
 * ratios distintos por matiz. Anclando la Y de cada token a la del Minimalista
 * verificado, los ratios quedan CONSTANTES para todo matiz/tinte ⇒ si el set
 * pasa una vez, pasa siempre. La bisección busca la L que da la Y anclada, con
 * la chroma capada a gamut adentro del lazo.
 */

import {
  clampGamut,
  dentroDeGamut,
  luminanciaRelativa,
  maxChromaEnGamut,
  oklchAHex,
  oklchASrgbLineal,
  parseOklch,
  serializarOklch,
} from './color.js';
import {
  PARES_AA,
  verificarPares,
  type NombreVariable,
  type ReferenciaColor,
  type ReporteContraste,
} from './contrasteAa.js';
import { normalizarTema, type TemaPersonalizado, type TinteFondo } from './tema.js';

/** Salida del motor. Contrato CONGELADO (docs §7 / tanda TM). */
export interface TokensGenerados {
  readonly version: 1;
  readonly tema: TemaPersonalizado;
  /** Las 27 variables crudas, valores `'oklch(l c h)'`. */
  readonly variables: Record<NombreVariable, string>;
  /** Hex `#rrggbb` de `--fondo-light`/`--fondo-dark` para el `theme-color`. */
  readonly themeColor: { readonly light: string; readonly dark: string };
  readonly reporte: ReporteContraste;
}

/** La paleta no alcanzó AA en todos los pares ni tras la reparación. Lleva el
 * reporte adentro para que el llamador (o el test) vea qué par falló. */
export class ErrorPaletaInvalida extends Error {
  readonly reporte: ReporteContraste;
  constructor(reporte: ReporteContraste) {
    super('generarPaleta: la paleta no alcanza AA en todos los pares tras la reparación');
    this.name = 'ErrorPaletaInvalida';
    this.reporte = reporte;
  }
}

// ---------------------------------------------------------------------------
// Anclas de luminancia WCAG (Y) del estilo Minimalista ACTUAL de
// packages/config/tailwind.css. Calculadas UNA vez con las conversiones de
// color.ts y CONGELADAS acá; la procedencia (token neutral-* / oklch original)
// va en cada línea. Cambiar un valor de tailwind.css exige recalcular su ancla.
// ---------------------------------------------------------------------------

type TokenNeutro = 'fondo' | 'superficie' | 'texto' | 'texto-secundario' | 'borde';
type Modo = 'light' | 'dark';

const Y_ANCLA_NEUTRO: Record<`${TokenNeutro}-${Modo}`, number> = {
  'fondo-light': 0.8982759, // neutral-100  oklch(0.965 0.006 75)
  'fondo-dark': 0.0009951, // neutral-950  oklch(0.1 0.006 75)
  'superficie-light': 0.9554269, // neutral-50   oklch(0.985 0.004 75)
  'superficie-dark': 0.00408, // neutral-900  oklch(0.16 0.008 75)
  'texto-light': 0.00408, // neutral-900  oklch(0.16 0.008 75)
  'texto-dark': 0.9554269, // neutral-50   oklch(0.985 0.004 75)
  'texto-secundario-light': 0.0793497, // neutral-600  oklch(0.43 0.012 75)
  'texto-secundario-dark': 0.2742813, // neutral-400  oklch(0.65 0.012 75)
  'borde-light': 0.2742813, // neutral-400  oklch(0.65 0.012 75)
  'borde-dark': 0.1486439, // neutral-500  oklch(0.53 0.012 75)
};

type EscalonPrimary = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

const Y_ANCLA_PRIMARY: Record<EscalonPrimary, number> = {
  50: 0.9405152, // oklch(0.98 0.015 78)
  100: 0.8553581, // oklch(0.95 0.04 78)
  200: 0.6996443, // oklch(0.89 0.09 78)
  300: 0.541377, // oklch(0.82 0.15 78)
  400: 0.4056859, // oklch(0.745 0.14 78)
  500: 0.2755784, // oklch(0.655 0.125 78)
  600: 0.1721654, // oklch(0.56 0.108 78)
  700: 0.1018052, // oklch(0.47 0.09 78)
  800: 0.0559512, // oklch(0.385 0.074 78)
  900: 0.0306533, // oklch(0.315 0.06 78)
  950: 0.0097464, // oklch(0.215 0.041 78)
};

// ---------------------------------------------------------------------------
// Recetas de chroma/hue. La L la fija la bisección (por la Y anclada); acá se
// eligen la chroma OBJETIVO y el hue. La chroma real = min(objetivo,
// 0.95·maxChromaEnGamut) — el objetivo es un techo, el gamut lo puede recortar.
// ---------------------------------------------------------------------------

interface RecetaTinte {
  /** Hue de los neutros, por modo (Cálido usa hues distintos en light/dark). */
  readonly hue: Record<Modo, number>;
  /** Chroma objetivo por token neutro y modo. COTA DURA: ≤ 0.06 (docs §7). */
  readonly chroma: Record<TokenNeutro, Record<Modo, number>>;
}

const RECETAS: Record<TinteFondo, RecetaTinte> = {
  // Neutro: hue 75 (el del neutral-* de Minimalista), chroma bajísima. Con
  // matiz 78 reproduce el carácter Minimalista (preset "Miel").
  neutro: {
    hue: { light: 75, dark: 75 },
    chroma: {
      fondo: { light: 0.006, dark: 0.006 },
      superficie: { light: 0.005, dark: 0.008 },
      texto: { light: 0.008, dark: 0.008 },
      'texto-secundario': { light: 0.01, dark: 0.012 },
      borde: { light: 0.01, dark: 0.012 },
    },
  },
  // Cálido: hue 85 light / 55 dark (como el Cálido actual), chroma media.
  calido: {
    hue: { light: 85, dark: 55 },
    chroma: {
      fondo: { light: 0.024, dark: 0.02 },
      superficie: { light: 0.018, dark: 0.024 },
      texto: { light: 0.035, dark: 0.032 },
      'texto-secundario': { light: 0.048, dark: 0.046 },
      borde: { light: 0.055, dark: 0.042 },
    },
  },
  // Frío: espejo del cálido en hues 255/250, chroma un punto más contenida.
  frio: {
    hue: { light: 255, dark: 250 },
    chroma: {
      fondo: { light: 0.018, dark: 0.018 },
      superficie: { light: 0.015, dark: 0.02 },
      texto: { light: 0.03, dark: 0.03 },
      'texto-secundario': { light: 0.038, dark: 0.04 },
      borde: { light: 0.042, dark: 0.038 },
    },
  },
};

// Chroma objetivo de la escala primary: la envolvente de las escalas
// existentes (≈ la de Minimalista: ~0.015 en 50, pico 0.15 en 300, ~0.04 en
// 950). Para hues donde el gamut no la permite, se recorta sola.
const CHROMA_PRIMARY: Record<EscalonPrimary, number> = {
  50: 0.015, 100: 0.04, 200: 0.09, 300: 0.15, 400: 0.14, 500: 0.125,
  600: 0.108, 700: 0.09, 800: 0.074, 900: 0.06, 950: 0.041,
};

// Estados (éxito/peligro/advertencia): NO se regeneran. Se EMITEN con los
// valores canónicos Minimalista de tailwind.css, para que la paleta custom
// pise también los overrides de Cálido y el conjunto verificado sea cerrado.
const ESTADOS: Record<Extract<NombreVariable, `--${'exito' | 'peligro' | 'advertencia'}-${Modo}`>, string> = {
  '--exito-light': serializarOklch(0.48, 0.14, 145),
  '--exito-dark': serializarOklch(0.7, 0.18, 145),
  '--peligro-light': serializarOklch(0.55, 0.2, 25),
  '--peligro-dark': serializarOklch(0.68, 0.19, 25),
  '--advertencia-light': serializarOklch(0.5, 0.11, 55),
  '--advertencia-dark': serializarOklch(0.7, 0.16, 55),
};

const TOKENS_NEUTRO: readonly TokenNeutro[] = ['fondo', 'superficie', 'texto', 'texto-secundario', 'borde'];
const MODOS: readonly Modo[] = ['light', 'dark'];
const ESCALONES: readonly EscalonPrimary[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const TOLERANCIA_Y = 1e-4;
const ITERS_BISECCION_L = 40;
const MAX_RONDAS_REPARACION = 10;

// ---------------------------------------------------------------------------
// Núcleo numérico
// ---------------------------------------------------------------------------

/** Luminancia WCAG de un OKLCH (clampeado a gamut, como lo verá el navegador). */
function luminanciaWcag(L: number, C: number, H: number): number {
  return luminanciaRelativa(clampGamut(oklchASrgbLineal(L, C, H)).rgb);
}

/**
 * Chroma efectiva = `min(Cobjetivo, 0.95·maxChromaEnGamut(L,H))`, evitando la
 * bisección cara de `maxChromaEnGamut` cuando `Cobjetivo` ya entra holgado.
 * Equivalencia EXACTA: si `Cobjetivo/0.95` cae fuera de gamut, entonces
 * `maxChroma < Cobjetivo/0.95` ⇒ `0.95·maxChroma < Cobjetivo` ⇒ el `min` es
 * `0.95·maxChroma` igual. El resultado es idéntico; solo se saltea el cálculo.
 */
function chromaEfectiva(L: number, H: number, Cobjetivo: number): number {
  if (dentroDeGamut(oklchASrgbLineal(L, Cobjetivo / 0.95, H))) return Cobjetivo;
  return 0.95 * maxChromaEnGamut(L, H);
}

/** Bisección de L en [0,1] hasta `|Y − Yobjetivo| ≤ 1e-4`, con la chroma capada
 * a gamut adentro del lazo (la chroma cambia la Y a L fija). */
function resolverL(Yobjetivo: number, H: number, Cobjetivo: number): { L: number; C: number } {
  let lo = 0;
  let hi = 1;
  let L = 0.5;
  for (let i = 0; i < ITERS_BISECCION_L; i++) {
    L = (lo + hi) / 2;
    const C = chromaEfectiva(L, H, Cobjetivo);
    const Y = luminanciaWcag(L, C, H);
    if (Math.abs(Y - Yobjetivo) <= TOLERANCIA_Y) return { L, C };
    if (Y < Yobjetivo) lo = L;
    else hi = L;
  }
  return { L, C: chromaEfectiva(L, H, Cobjetivo) };
}

// ---------------------------------------------------------------------------
// Generación, serialización, reparación
// ---------------------------------------------------------------------------

/** Token generado: valor OKLCH + los parámetros de receta (hue, chroma
 * objetivo) que la reparación necesita para re-bisecar. */
interface TokenGenerado {
  readonly L: number;
  readonly C: number;
  readonly H: number;
  readonly chromaObjetivo: number;
}

/** Genera los 21 tokens derivados (10 neutros + 11 primary) anclando cada Y. */
function generarTokens(tema: TemaPersonalizado): Map<NombreVariable, TokenGenerado> {
  const map = new Map<NombreVariable, TokenGenerado>();
  const receta = RECETAS[tema.tinte];

  for (const token of TOKENS_NEUTRO) {
    for (const modo of MODOS) {
      const hue = receta.hue[modo];
      const chromaObjetivo = receta.chroma[token][modo];
      const { L, C } = resolverL(Y_ANCLA_NEUTRO[`${token}-${modo}`], hue, chromaObjetivo);
      map.set(`--${token}-${modo}`, { L, C, H: hue, chromaObjetivo });
    }
  }

  for (const escalon of ESCALONES) {
    const chromaObjetivo = CHROMA_PRIMARY[escalon];
    const { L, C } = resolverL(Y_ANCLA_PRIMARY[escalon], tema.matiz, chromaObjetivo);
    map.set(`--color-primary-${escalon}`, { L, C, H: tema.matiz, chromaObjetivo });
  }

  return map;
}

/** Arma el mapa completo de 27 variables serializadas (21 generadas + 6 estados). */
function serializarTodo(generados: Map<NombreVariable, TokenGenerado>): Record<NombreVariable, string> {
  const entradas: [NombreVariable, string][] = [];
  for (const [nombre, t] of generados) entradas.push([nombre, serializarOklch(t.L, t.C, t.H)]);
  for (const [nombre, valor] of Object.entries(ESTADOS)) entradas.push([nombre as NombreVariable, valor]);
  // Los 27 nombres quedan cubiertos por construcción (21 + 6).
  return Object.fromEntries(entradas) as Record<NombreVariable, string>;
}

/** `fondo` y `superficie` son "hubs": nunca se mueven en la reparación (son la
 * base sobre la que se leen los demás; moverlos correría todo). */
function esHub(ref: NombreVariable): boolean {
  return ref.startsWith('--fondo') || ref.startsWith('--superficie');
}

/** Luminancia WCAG del lado "hub" de un par, leída del mapa serializado. */
function luminanciaDeReferencia(ref: ReferenciaColor, variables: Record<NombreVariable, string>): number {
  if (ref === '#ffffff') return 1;
  const oklch = parseOklch(variables[ref]);
  if (!oklch) return 0;
  return luminanciaWcag(oklch[0], oklch[1], oklch[2]);
}

/** El nombre movible de un par (el lado que NO es hub ni literal), o `null`. */
function ladoMovible(ref: ReferenciaColor, generados: Map<NombreVariable, TokenGenerado>): NombreVariable | null {
  if (ref === '#ffffff') return null;
  if (esHub(ref) || !generados.has(ref)) return null;
  return ref;
}

/**
 * Genera la paleta completa para `tema`. Pipeline: generar → serializar →
 * verificar SOBRE LO SERIALIZADO → si algún par falla, reparación determinista
 * (orden fijo de `PARES_AA`; se mueve solo el lado no-hub, alejando su Y del
 * hub ×/÷1.02 y re-bisecando; máx 10 rondas) → si no converge, `throw`.
 *
 * NOTA DE DISEÑO (reportada al tech lead, tanda TM): con las Y ancladas al
 * Minimalista el par `borde`/`fondo` en LIGHT da 2.92:1 — el Minimalista nunca
 * necesitó ese par (su tab bar no flota); Cálido sí, y por eso oscureció su
 * borde. Como `PARES_AA` exige `borde`/`fondo` ≥3:1 SIEMPRE (la base puede ser
 * Cálida), la reparación NO es vestigial: corre ~2 rondas en TODA paleta para
 * oscurecer `--borde-light`. Es determinista y converge, pero conviene decidir
 * si se congela un ancla de borde más oscura (como hizo Cálido) para que el
 * "por construcción" no dependa del lazo de reparación.
 */
export function generarPaleta(tema: TemaPersonalizado): TokensGenerados {
  const temaNorm = normalizarTema(tema);
  const generados = generarTokens(temaNorm);

  let variables = serializarTodo(generados);
  let reporte = verificarPares(variables);

  for (let ronda = 0; ronda < MAX_RONDAS_REPARACION && !reporte.todosPasan; ronda++) {
    for (let i = 0; i < reporte.resultados.length; i++) {
      const resultado = reporte.resultados[i];
      const par = PARES_AA[i];
      if (!resultado || !par || resultado.pasa) continue;

      const nombre = ladoMovible(par.fg, generados) ?? ladoMovible(par.bg, generados);
      if (nombre === null) continue; // par sin lado movible: se detecta al final
      const token = generados.get(nombre);
      if (!token) continue;

      const otro = nombre === par.fg ? par.bg : par.fg;
      const Yhub = luminanciaDeReferencia(otro, variables);
      const Ymov = luminanciaWcag(token.L, token.C, token.H);
      // Alejar la Y del movible respecto de la del hub (subir si es más claro,
      // bajar si es más oscuro) para agrandar el ratio.
      const nuevaY = Ymov > Yhub ? Math.min(0.9999, Ymov * 1.02) : Ymov / 1.02;
      const { L, C } = resolverL(nuevaY, token.H, token.chromaObjetivo);
      generados.set(nombre, { L, C, H: token.H, chromaObjetivo: token.chromaObjetivo });
    }
    variables = serializarTodo(generados);
    reporte = verificarPares(variables);
  }

  if (!reporte.todosPasan) throw new ErrorPaletaInvalida(reporte);

  const fondoLight = generados.get('--fondo-light');
  const fondoDark = generados.get('--fondo-dark');
  if (!fondoLight || !fondoDark) throw new Error('invariante: faltan los tokens de fondo');

  return {
    version: 1,
    tema: temaNorm,
    variables,
    themeColor: {
      light: oklchAHex(fondoLight.L, fondoLight.C, fondoLight.H),
      dark: oklchAHex(fondoDark.L, fondoDark.C, fondoDark.H),
    },
    reporte,
  };
}
