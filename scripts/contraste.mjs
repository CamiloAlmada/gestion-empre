#!/usr/bin/env node
/**
 * scripts/contraste.mjs — calculadora de contraste WCAG 2.x para los
 * tokens de color del tema compartido (`packages/config/tailwind.css`).
 *
 * Node puro, sin dependencias (Node ≥18 por `??`/`?.`, el repo pide ≥22).
 * Reemplaza al script ad-hoc de verificaciones anteriores (docs/06-ui-ux.md
 * §7 lo menciona) que no había quedado versionado — ESTE sí queda en el
 * repo para que cualquier tarea de UI pueda repetir la corrida.
 *
 * ---------------------------------------------------------------------
 * CÓMO CORRERLO (reproducibilidad)
 * ---------------------------------------------------------------------
 *
 *   node scripts/contraste.mjs
 *
 * corre el set `PARES_DEFECTO` de abajo (los pares de marca WhatsApp de la
 * tarea WA-I) en las 4 combinaciones estilo×modo (Minimalista/Cálido ×
 * light/dark) e imprime una tabla con los ratios.
 *
 * También se puede pasar una lista propia de pares por argumento, cada uno
 * con la forma `etiqueta=fg/bg`:
 *
 *   node scripts/contraste.mjs "mi par=token:texto/token:superficie"
 *   node scripts/contraste.mjs "blanco sobre marca=#ffffff/#128C7E"
 *
 * Cada lado (`fg`/`bg`) admite tres formas:
 *   - hex fijo:            `#25D366`
 *   - literal OKLCH:       `oklch(0.56 0.108 78)`
 *   - token del tema:      `token:nombre` (p. ej. `token:superficie`,
 *     `token:texto`, `token:whatsapp`, `token:whatsapp-oscuro`) — se
 *     resuelve leyendo `packages/config/tailwind.css` para las 4
 *     combinaciones. Los tokens de MARCA (whatsapp, whatsapp-oscuro) son
 *     fijos por diseño (no varían por tema/modo — ver comentario en el
 *     propio `tailwind.css`), así que su ratio da igual en las 4 filas;
 *     eso es lo esperado, no un bug del script.
 *
 * ---------------------------------------------------------------------
 * QUÉ HACE
 * ---------------------------------------------------------------------
 *
 * 1. Lee `packages/config/tailwind.css` y extrae, con un extractor de
 *    bloques por selector (conteo de llaves — alcanza porque el archivo no
 *    anida reglas dentro de reglas en los bloques que nos interesan), los
 *    custom properties de:
 *      - el primer `@theme { ... }` (NO `@theme inline`): escalas
 *        `--color-primary-*`, `--color-neutral-*` y los tokens de marca
 *        `--color-whatsapp*`.
 *      - todos los `:root { ... }` de nivel superior (Capa 1 de pares
 *        crudos `--x-light`/`--x-dark`, tokens de forma, layout, y la
 *        Capa 2 de selección `--fondo: var(--fondo-light)` etc.) — se
 *        mergean en un único mapa porque ninguno redefine el nombre de
 *        otro (documentado en el propio `tailwind.css`).
 *      - `[data-estilo='calido'] { ... }`: overrides de Cálido.
 *      - `[data-theme='dark'] { ... }`: selección de modo dark.
 *
 * 2. Arma, para cada combinación (estilo, modo), un mapa de variables que
 *    replica la cascada real documentada en `tailwind.css` (Capa 1 → override
 *    Cálido si corresponde → override dark si corresponde) y resuelve
 *    `var(--x)` recursivamente hasta un literal `oklch()` o hex.
 *
 * 3. Convierte OKLCH→sRGB LINEAL con las matrices estándar (Björn Ottosson,
 *    https://bottosson.github.io/posts/oklab/) y hex→sRGB lineal con el
 *    des-companding estándar de sRGB. Si un canal cae fuera de [0,1]
 *    (fuera de gamut sRGB) se CLAMPEA a [0,1] y se avisa por stderr — los
 *    tokens ya verificados del tema documentan que ajustaron su chroma para
 *    no necesitar esto, pero un token nuevo podría.
 *
 * 4. Calcula luminancia relativa WCAG (los valores ya están en lineal, no
 *    hace falta des-gamma-corregir de nuevo) y el ratio de contraste
 *    `(L1+0.05)/(L2+0.05)` con L1 ≥ L2.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUTA_TAILWIND = path.resolve(__dirname, '../packages/config/tailwind.css');

// -----------------------------------------------------------------------
// 1. Extracción de bloques CSS (selector → Map<propiedad, valorCrudo>)
// -----------------------------------------------------------------------

/** Encuentra el índice de la `}` que cierra la `{` en `iAbre` (asume que no
 * hay llaves anidadas dentro del bloque, cierto para todos los bloques que
 * este script necesita leer de `tailwind.css`). */
function indiceCierre(css, iAbre) {
  let profundidad = 1;
  for (let i = iAbre + 1; i < css.length; i++) {
    if (css[i] === '{') profundidad++;
    else if (css[i] === '}') {
      profundidad--;
      if (profundidad === 0) return i;
    }
  }
  throw new Error('bloque CSS sin cerrar (no se encontró "}" de cierre)');
}

/** Devuelve el contenido de TODOS los bloques cuyo selector matchea
 * `patronSelector` (debe matchear justo antes de la `{` de apertura). */
function bloques(css, patronSelector) {
  const resultado = [];
  const re = new RegExp(patronSelector.source, patronSelector.flags.includes('g') ? patronSelector.flags : patronSelector.flags + 'g');
  let m;
  while ((m = re.exec(css)) !== null) {
    const iAbre = css.indexOf('{', m.index + m[0].length - 1);
    const iCierra = indiceCierre(css, iAbre);
    resultado.push(css.slice(iAbre + 1, iCierra));
  }
  return resultado;
}

/** Parsea declaraciones `--nombre: valor;` de un bloque a un Map. */
function declaraciones(contenidoBloque) {
  const mapa = new Map();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(contenidoBloque)) !== null) {
    mapa.set(m[1], m[2].trim());
  }
  return mapa;
}

function cargarTailwindCss() {
  return readFileSync(RUTA_TAILWIND, 'utf8');
}

/** Arma los 4 mapas base (theme, root mergeado, calido, dark) a partir del
 * texto de `tailwind.css`. Se separan de la resolución por combinación para
 * poder mergearlos en el orden de cascada correcto una sola vez por combo. */
function extraerBasesCss(css) {
  // `@theme {` pero NO `@theme inline {`: exigimos que después de "@theme"
  // y espacio opcional venga directo la "{".
  const [themeContenido] = bloques(css, /@theme\s*(?=\{)/);
  const themeVars = declaraciones(themeContenido ?? '');

  // Todos los `:root { ... }` de nivel superior (no matchea
  // `:root:not([data-theme])`, que va dentro de un `@media`, porque ahí
  // después de ":root" sigue ":not(" y no "{" ni espacio+"{").
  const rootBloques = bloques(css, /(?:^|\n)\s*:root\s*(?=\{)/);
  const rootVars = new Map();
  for (const b of rootBloques) {
    for (const [k, v] of declaraciones(b)) rootVars.set(k, v);
  }

  const [calidoContenido] = bloques(css, /\[data-estilo=['"]calido['"]\]\s*(?=\{)/);
  const calidoVars = declaraciones(calidoContenido ?? '');

  const [darkContenido] = bloques(css, /(?:^|\n)\s*\[data-theme=['"]dark['"]\]\s*(?=\{)/);
  const darkVars = declaraciones(darkContenido ?? '');

  return { themeVars, rootVars, calidoVars, darkVars };
}

/** Mapa de variables resuelto para una combinación (estilo, modo),
 * replicando la cascada real del archivo (ver cabecera del script). */
function mapaParaCombo(bases, estilo, modo) {
  const mapa = new Map();
  for (const [k, v] of bases.themeVars) mapa.set(k, v);
  for (const [k, v] of bases.rootVars) mapa.set(k, v);
  if (estilo === 'calido') {
    for (const [k, v] of bases.calidoVars) mapa.set(k, v);
  }
  if (modo === 'dark') {
    for (const [k, v] of bases.darkVars) mapa.set(k, v);
  }
  return mapa;
}

// -----------------------------------------------------------------------
// 2. Resolución de un valor crudo (posiblemente var(--x)) a sRGB lineal
// -----------------------------------------------------------------------

function parseHex(valor) {
  const m = /^#([0-9a-f]{6})$/i.exec(valor.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function componenteSrgbALineal(c255) {
  const cs = c255 / 255;
  return cs <= 0.04045 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

function hexASrgbLineal(hex) {
  const rgb255 = parseHex(hex);
  if (!rgb255) throw new Error(`hex inválido: "${hex}"`);
  return rgb255.map(componenteSrgbALineal);
}

function parseOklch(valor) {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(valor);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

/** OKLCH → sRGB lineal (matrices de Björn Ottosson). Devuelve [r,g,b] SIN
 * clampear — el llamador decide qué hacer con valores fuera de [0,1]. */
function oklchASrgbLineal(L, C, H) {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [r, g, bl];
}

/** Clampea a [0,1] y avisa por stderr si el valor original estaba fuera de
 * gamut sRGB (margen de tolerancia 1e-4 para no gritar por redondeo). */
function clampGamut([r, g, b], etiqueta) {
  const fueraDeGamut = [r, g, b].some((c) => c < -1e-4 || c > 1 + 1e-4);
  if (fueraDeGamut) {
    const fmt = [r, g, b].map((c) => c.toFixed(4)).join(', ');
    console.warn(`⚠ ${etiqueta}: OKLCH fuera de gamut sRGB (rgb lineal sin clamp = [${fmt}]), clampeado a [0,1]`);
  }
  return [r, g, b].map((c) => Math.min(1, Math.max(0, c)));
}

/** Resuelve un valor crudo de CSS (literal o `var(--x)`) a sRGB lineal
 * [r,g,b] en [0,1], recursivamente. */
function resolverASrgbLineal(valorCrudo, mapaVars, etiqueta, profundidad = 0) {
  if (profundidad > 15) throw new Error(`recursión de var() demasiado profunda resolviendo "${etiqueta}"`);
  const valor = valorCrudo.trim();

  const refVar = /^var\(\s*(--[\w-]+)\s*\)$/.exec(valor);
  if (refVar) {
    const nombre = refVar[1];
    const siguiente = mapaVars.get(nombre);
    if (siguiente === undefined) {
      throw new Error(`variable "${nombre}" no encontrada resolviendo "${etiqueta}" (¿falta en tailwind.css?)`);
    }
    return resolverASrgbLineal(siguiente, mapaVars, etiqueta, profundidad + 1);
  }

  if (valor.startsWith('#')) return hexASrgbLineal(valor);

  const oklch = parseOklch(valor);
  if (oklch) return clampGamut(oklchASrgbLineal(...oklch), etiqueta);

  throw new Error(`no se sabe resolver el valor "${valor}" (${etiqueta})`);
}

/** Resuelve una EXPRESIÓN de la CLI/PARES_DEFECTO (`#hex`, `oklch(...)` o
 * `token:nombre`) a sRGB lineal para una combinación dada. */
function resolverExpresion(expr, mapaVars, etiqueta) {
  const comoToken = /^token:(.+)$/.exec(expr.trim());
  if (comoToken) {
    // Los tokens semánticos (texto, superficie, fondo...) viven como
    // `--nombre` (Capa 2, ver cabecera del archivo); los de escala/marca
    // (whatsapp, whatsapp-oscuro, primary-600...) como `--color-nombre`
    // (bloque `@theme`). Se prueban ambas formas.
    const candidatos = [`--${comoToken[1]}`, `--color-${comoToken[1]}`];
    const nombreVar = candidatos.find((c) => mapaVars.has(c));
    if (nombreVar === undefined) {
      throw new Error(
        `token "${comoToken[1]}" no encontrado (probé ${candidatos.join(' y ')} en tailwind.css)`,
      );
    }
    return resolverASrgbLineal(mapaVars.get(nombreVar), mapaVars, etiqueta);
  }
  return resolverASrgbLineal(expr, mapaVars, etiqueta);
}

// -----------------------------------------------------------------------
// 3. Luminancia y ratio WCAG
// -----------------------------------------------------------------------

function luminanciaRelativa([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratioContraste(rgbA, rgbB) {
  const lA = luminanciaRelativa(rgbA);
  const lB = luminanciaRelativa(rgbB);
  const [L1, L2] = lA >= lB ? [lA, lB] : [lB, lA];
  return (L1 + 0.05) / (L2 + 0.05);
}

// -----------------------------------------------------------------------
// 4. Pares por defecto (tarea WA-I — identidad visual de WhatsApp)
// -----------------------------------------------------------------------

const PARES_DEFECTO = [
  { etiqueta: 'a) blanco / whatsapp-oscuro (#128C7E)', fg: '#ffffff', bg: 'token:whatsapp-oscuro', umbral: 4.5 },
  { etiqueta: 'a-bis) blanco / whatsapp (#25D366)', fg: '#ffffff', bg: 'token:whatsapp', umbral: 4.5 },
  { etiqueta: 'b) texto (token) / whatsapp', fg: 'token:texto', bg: 'token:whatsapp', umbral: 4.5 },
  { etiqueta: 'b-bis) negro fijo / whatsapp', fg: '#000000', bg: 'token:whatsapp', umbral: 4.5 },
  { etiqueta: 'elegido-hover) negro fijo / whatsapp-oscuro', fg: '#000000', bg: 'token:whatsapp-oscuro', umbral: 4.5 },
  { etiqueta: 'c) whatsapp (glifo/texto) / superficie — texto 4.5:1', fg: 'token:whatsapp', bg: 'token:superficie', umbral: 4.5 },
  { etiqueta: 'c) whatsapp (glifo/texto) / superficie — UI 3:1', fg: 'token:whatsapp', bg: 'token:superficie', umbral: 3 },
  { etiqueta: 'c) whatsapp-oscuro / superficie — texto 4.5:1', fg: 'token:whatsapp-oscuro', bg: 'token:superficie', umbral: 4.5 },
  { etiqueta: 'c) whatsapp-oscuro / superficie — UI 3:1', fg: 'token:whatsapp-oscuro', bg: 'token:superficie', umbral: 3 },
];

const COMBOS = [
  { estilo: 'minimalista', modo: 'light' },
  { estilo: 'minimalista', modo: 'dark' },
  { estilo: 'calido', modo: 'light' },
  { estilo: 'calido', modo: 'dark' },
];

function parsearParCli(arg) {
  const [etiqueta, resto] = arg.split('=');
  if (!resto) throw new Error(`par inválido "${arg}": formato esperado "etiqueta=fg/bg"`);
  const [fg, bg] = resto.split('/');
  if (!fg || !bg) throw new Error(`par inválido "${arg}": formato esperado "etiqueta=fg/bg"`);
  return { etiqueta, fg, bg, umbral: null };
}

function main() {
  const css = cargarTailwindCss();
  const bases = extraerBasesCss(css);

  const argsPares = process.argv.slice(2);
  const pares = argsPares.length > 0 ? argsPares.map(parsearParCli) : PARES_DEFECTO;

  console.log(`Fuente: ${path.relative(process.cwd(), RUTA_TAILWIND)}\n`);

  for (const par of pares) {
    console.log(`— ${par.etiqueta} (${par.fg} sobre ${par.bg}) —`);
    for (const combo of COMBOS) {
      const mapaVars = mapaParaCombo(bases, combo.estilo, combo.modo);
      const etiquetaCombo = `${par.etiqueta} [${combo.estilo}/${combo.modo}]`;
      const rgbFg = resolverExpresion(par.fg, mapaVars, `fg de ${etiquetaCombo}`);
      const rgbBg = resolverExpresion(par.bg, mapaVars, `bg de ${etiquetaCombo}`);
      const ratio = ratioContraste(rgbFg, rgbBg);
      const pasa = par.umbral === null ? '' : ratio >= par.umbral ? '✅ PASA' : '❌ NO PASA';
      const comboFmt = `${combo.estilo}/${combo.modo}`.padEnd(17);
      console.log(`  ${comboFmt} ${ratio.toFixed(2)}:1  ${pasa}`);
    }
    console.log('');
  }
}

main();
