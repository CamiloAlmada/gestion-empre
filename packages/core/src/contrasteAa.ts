/**
 * Pares de contraste AA como DATOS, y su verificador (docs/06-ui-ux.md §7).
 *
 * `PARES_AA` es la UNIÓN de las tablas §7 Minimalista + Cálido, EXCLUIDOS los
 * pares de marca WhatsApp (fijos, fuera del motor). Incluye el par
 * `borde`/`fondo` ≥3:1 —que en §7 solo aparece en Cálido, por la tab bar
 * flotante— porque con "Colores del negocio" activo la base puede ser Cálida
 * y ese par debe cumplirse igual.
 *
 * `verificarPares` es reutilizable por los tests (garantía por construcción) y
 * por la UI (panel de transparencia "Contraste verificado (AA)").
 */

import {
  clampGamut,
  hexASrgbLineal,
  oklchASrgbLineal,
  parseOklch,
  ratioContraste,
  type RgbLineal,
} from './color.js';

/** Los 27 nombres de variable que emite `generarPaleta`: EXACTAMENTE los pares
 * crudos de Capa 1 de `packages/config/tailwind.css` + la escala primary. */
export type NombreVariable =
  | '--fondo-light'
  | '--fondo-dark'
  | '--superficie-light'
  | '--superficie-dark'
  | '--texto-light'
  | '--texto-dark'
  | '--texto-secundario-light'
  | '--texto-secundario-dark'
  | '--borde-light'
  | '--borde-dark'
  | '--exito-light'
  | '--exito-dark'
  | '--peligro-light'
  | '--peligro-dark'
  | '--advertencia-light'
  | '--advertencia-dark'
  | '--color-primary-50'
  | '--color-primary-100'
  | '--color-primary-200'
  | '--color-primary-300'
  | '--color-primary-400'
  | '--color-primary-500'
  | '--color-primary-600'
  | '--color-primary-700'
  | '--color-primary-800'
  | '--color-primary-900'
  | '--color-primary-950';

/** Un lado de un par: una variable generada, o el literal blanco (botón
 * primario / peligro, que en la UI usan `text-white`, no un token del tema). */
export type ReferenciaColor = NombreVariable | '#ffffff';

/** Modo en que se evalúa el par (elige el sufijo -light/-dark de cada token). */
export type Modo = 'light' | 'dark';

/** Un par de contraste a verificar. `umbral`: 4.5 texto normal, 3 componente UI. */
export interface ParAA {
  readonly id: string;
  readonly uso: string;
  readonly fg: ReferenciaColor;
  readonly bg: ReferenciaColor;
  readonly umbral: 4.5 | 3;
  readonly modo: Modo;
}

/**
 * Unión de las tablas §7 (Minimalista ∪ Cálido, sin WhatsApp). Como ambas
 * tablas comparten la misma estructura de pares (mismos tokens, distinto
 * ratio por estilo), la unión de PARES es el set Minimalista + el único par
 * exclusivo de Cálido: `borde`/`fondo` (tab bar flotante), en ambos modos.
 */
export const PARES_AA: readonly ParAA[] = [
  { id: 'texto/fondo-light', uso: 'Texto principal sobre fondo', fg: '--texto-light', bg: '--fondo-light', umbral: 4.5, modo: 'light' },
  { id: 'texto/fondo-dark', uso: 'Texto principal sobre fondo', fg: '--texto-dark', bg: '--fondo-dark', umbral: 4.5, modo: 'dark' },
  { id: 'texto/superficie-light', uso: 'Texto principal sobre superficie', fg: '--texto-light', bg: '--superficie-light', umbral: 4.5, modo: 'light' },
  { id: 'texto/superficie-dark', uso: 'Texto principal sobre superficie', fg: '--texto-dark', bg: '--superficie-dark', umbral: 4.5, modo: 'dark' },
  { id: 'texto-secundario/superficie-light', uso: 'Texto secundario sobre superficie', fg: '--texto-secundario-light', bg: '--superficie-light', umbral: 4.5, modo: 'light' },
  { id: 'texto-secundario/superficie-dark', uso: 'Texto secundario sobre superficie', fg: '--texto-secundario-dark', bg: '--superficie-dark', umbral: 4.5, modo: 'dark' },
  { id: 'texto-secundario/fondo-light', uso: 'Texto secundario sobre fondo', fg: '--texto-secundario-light', bg: '--fondo-light', umbral: 4.5, modo: 'light' },
  { id: 'texto-secundario/fondo-dark', uso: 'Texto secundario sobre fondo', fg: '--texto-secundario-dark', bg: '--fondo-dark', umbral: 4.5, modo: 'dark' },
  { id: 'boton-primario-light', uso: 'Botón primario (blanco sobre primary-600)', fg: '#ffffff', bg: '--color-primary-600', umbral: 4.5, modo: 'light' },
  { id: 'boton-primario-dark', uso: 'Botón primario (blanco sobre primary-600)', fg: '#ffffff', bg: '--color-primary-600', umbral: 4.5, modo: 'dark' },
  { id: 'boton-primario-hover-light', uso: 'Botón primario hover (blanco sobre primary-700)', fg: '#ffffff', bg: '--color-primary-700', umbral: 4.5, modo: 'light' },
  { id: 'boton-primario-hover-dark', uso: 'Botón primario hover (blanco sobre primary-700)', fg: '#ffffff', bg: '--color-primary-700', umbral: 4.5, modo: 'dark' },
  { id: 'error/superficie-light', uso: 'Texto de error (peligro sobre superficie)', fg: '--peligro-light', bg: '--superficie-light', umbral: 4.5, modo: 'light' },
  { id: 'error/superficie-dark', uso: 'Texto de error (peligro sobre superficie)', fg: '--peligro-dark', bg: '--superficie-dark', umbral: 4.5, modo: 'dark' },
  { id: 'boton-peligro-light', uso: 'Botón peligro (blanco sobre peligro)', fg: '#ffffff', bg: '--peligro-light', umbral: 4.5, modo: 'light' },
  { id: 'boton-peligro-dark', uso: 'Botón peligro (fondo sobre peligro, dark:text-fondo)', fg: '--fondo-dark', bg: '--peligro-dark', umbral: 4.5, modo: 'dark' },
  { id: 'borde-input/superficie-light', uso: 'Borde de input sobre superficie', fg: '--borde-light', bg: '--superficie-light', umbral: 3, modo: 'light' },
  { id: 'borde-input/superficie-dark', uso: 'Borde de input sobre superficie', fg: '--borde-dark', bg: '--superficie-dark', umbral: 3, modo: 'dark' },
  { id: 'ring/superficie-light', uso: 'Ring de foco (primary-600 sobre superficie)', fg: '--color-primary-600', bg: '--superficie-light', umbral: 3, modo: 'light' },
  { id: 'ring/superficie-dark', uso: 'Ring de foco (primary-600 sobre superficie)', fg: '--color-primary-600', bg: '--superficie-dark', umbral: 3, modo: 'dark' },
  { id: 'ring/fondo-light', uso: 'Ring de foco (primary-600 sobre fondo)', fg: '--color-primary-600', bg: '--fondo-light', umbral: 3, modo: 'light' },
  { id: 'ring/fondo-dark', uso: 'Ring de foco (primary-600 sobre fondo)', fg: '--color-primary-600', bg: '--fondo-dark', umbral: 3, modo: 'dark' },
  { id: 'exito/superficie-light', uso: 'Éxito sobre superficie', fg: '--exito-light', bg: '--superficie-light', umbral: 4.5, modo: 'light' },
  { id: 'exito/superficie-dark', uso: 'Éxito sobre superficie', fg: '--exito-dark', bg: '--superficie-dark', umbral: 4.5, modo: 'dark' },
  { id: 'advertencia/superficie-light', uso: 'Advertencia sobre superficie', fg: '--advertencia-light', bg: '--superficie-light', umbral: 4.5, modo: 'light' },
  { id: 'advertencia/superficie-dark', uso: 'Advertencia sobre superficie', fg: '--advertencia-dark', bg: '--superficie-dark', umbral: 4.5, modo: 'dark' },
  { id: 'marca/superficie-light', uso: 'Texto de marca (primary-700 sobre superficie)', fg: '--color-primary-700', bg: '--superficie-light', umbral: 4.5, modo: 'light' },
  { id: 'marca/superficie-dark', uso: 'Texto de marca (primary-300 sobre superficie)', fg: '--color-primary-300', bg: '--superficie-dark', umbral: 4.5, modo: 'dark' },
  { id: 'selector-activo-light', uso: 'Ítem activo del selector (primary-700 sobre primary-100)', fg: '--color-primary-700', bg: '--color-primary-100', umbral: 4.5, modo: 'light' },
  { id: 'selector-activo-dark', uso: 'Ítem activo del selector (primary-300 sobre primary-900)', fg: '--color-primary-300', bg: '--color-primary-900', umbral: 4.5, modo: 'dark' },
  { id: 'selector-activo/fondo-light', uso: 'Ítem activo del selector sobre fondo (primary-700)', fg: '--color-primary-700', bg: '--fondo-light', umbral: 4.5, modo: 'light' },
  { id: 'selector-activo/fondo-dark', uso: 'Ítem activo del selector sobre fondo (primary-300)', fg: '--color-primary-300', bg: '--fondo-dark', umbral: 4.5, modo: 'dark' },
  { id: 'borde/fondo-light', uso: 'Borde de tab bar flotante sobre fondo (Cálido)', fg: '--borde-light', bg: '--fondo-light', umbral: 3, modo: 'light' },
  { id: 'borde/fondo-dark', uso: 'Borde de tab bar flotante sobre fondo (Cálido)', fg: '--borde-dark', bg: '--fondo-dark', umbral: 3, modo: 'dark' },
];

/** Resultado de verificar un par: incluye los strings resueltos y el ratio,
 * para que el panel de transparencia muestre exactamente qué se midió. */
export interface ResultadoPar {
  readonly id: string;
  readonly uso: string;
  readonly modo: Modo;
  readonly fgResuelto: string;
  readonly bgResuelto: string;
  readonly ratio: number;
  readonly umbral: number;
  readonly pasa: boolean;
}

/** Reporte completo de la verificación de contraste de una paleta. */
export interface ReporteContraste {
  readonly resultados: readonly ResultadoPar[];
  readonly todosPasan: boolean;
}

/** Resuelve una referencia (variable o blanco) a su string y a sRGB lineal. */
function resolver(ref: ReferenciaColor, variables: Record<NombreVariable, string>): { str: string; rgb: RgbLineal } {
  if (ref === '#ffffff') return { str: '#ffffff', rgb: hexASrgbLineal('#ffffff') };
  const str = variables[ref];
  const oklch = parseOklch(str);
  if (!oklch) throw new Error(`la variable ${ref} no es un oklch() válido: "${str}"`);
  return { str, rgb: clampGamut(oklchASrgbLineal(oklch[0], oklch[1], oklch[2])).rgb };
}

/**
 * Verifica `PARES_AA` contra un mapa de variables ya SERIALIZADAS (strings
 * `oklch(...)`). Verificar sobre lo serializado —no sobre los números
 * internos— garantiza que lo medido es idéntico a lo que el navegador renderiza.
 */
export function verificarPares(variables: Record<NombreVariable, string>): ReporteContraste {
  const resultados = PARES_AA.map((par): ResultadoPar => {
    const fg = resolver(par.fg, variables);
    const bg = resolver(par.bg, variables);
    const ratio = ratioContraste(fg.rgb, bg.rgb);
    return {
      id: par.id,
      uso: par.uso,
      modo: par.modo,
      fgResuelto: fg.str,
      bgResuelto: bg.str,
      ratio,
      umbral: par.umbral,
      pasa: ratio >= par.umbral,
    };
  });
  return { resultados, todosPasan: resultados.every((r) => r.pasa) };
}
