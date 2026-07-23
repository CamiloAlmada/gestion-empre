/**
 * Tema personalizado "Colores del negocio" (docs/06-ui-ux.md §4 y §7).
 *
 * La SEMILLA del tema (matiz + tinte) es lo único que se persiste en Firestore
 * (`configuracion/tema`); la paleta completa la regenera `generarPaleta`
 * (paleta.ts) de forma determinista en cada cliente. Este módulo define esa
 * semilla, su normalización, un type guard para datos crudos de Firestore y la
 * galería de presets.
 */

/** Tinte de los neutros de fondo (docs §4). No afecta la escala primary. */
export type TinteFondo = 'neutro' | 'calido' | 'frio';

/** Semilla del tema del negocio. `version` habilita migraciones si la receta
 * del motor cambia (un bump obliga a decidir compatibilidad). */
export interface TemaPersonalizado {
  readonly version: 1;
  /** Matiz de marca en grados, entero en [0, 359]. */
  readonly matiz: number;
  readonly tinte: TinteFondo;
}

const TINTES: readonly TinteFondo[] = ['neutro', 'calido', 'frio'];

/**
 * Normaliza una semilla a la forma canónica: matiz redondeado a entero y
 * envuelto (wrap) a [0, 360). El slider entrega enteros, pero un preset o una
 * migración podrían traer valores fuera de rango: `370`→`10`, `-30`→`330`.
 *
 * @throws {RangeError} si `matiz` no es finito o `tinte` no es un tinte válido.
 */
export function normalizarTema(tema: { matiz: number; tinte: TinteFondo }): TemaPersonalizado {
  if (!Number.isFinite(tema.matiz)) {
    throw new RangeError(`normalizarTema requiere un matiz finito, recibió: ${tema.matiz}`);
  }
  if (!TINTES.includes(tema.tinte)) {
    throw new RangeError(`tinte inválido: "${String(tema.tinte)}"`);
  }
  const matiz = ((Math.round(tema.matiz) % 360) + 360) % 360;
  return { version: 1, matiz, tinte: tema.tinte };
}

/** Claves EXACTAS de la semilla persistida. El shape estricto (ni una clave de
 * más) es parte del contrato de la tanda. */
const CLAVES_TEMA: readonly string[] = ['version', 'matiz', 'tinte'];

/**
 * Type guard para datos crudos (Firestore, localStorage): valida SHAPE ESTRICTO
 * Y rangos. Un documento con matiz no entero, fuera de [0,359], tinte
 * desconocido, con claves faltantes O con claves de más NO es un
 * `TemaPersonalizado` (la UI cae al tema base; el converter tolerante lo mapea
 * a `null`, no lo acepta).
 *
 * El shape estricto —exactamente `{version, matiz, tinte}`— es contrato, no
 * paranoia: es el espejo client-side del `hasOnly('version', 'matiz', 'tinte')`
 * que imponen las reglas de Firestore server-side. Un doc con claves ajenas es
 * un dato corrupto/de otra versión, no una semilla válida.
 */
export function esTemaValido(x: unknown): x is TemaPersonalizado {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  const claves = Object.keys(o);
  if (claves.length !== CLAVES_TEMA.length || !claves.every((k) => CLAVES_TEMA.includes(k))) {
    return false;
  }
  return (
    o['version'] === 1 &&
    typeof o['matiz'] === 'number' &&
    Number.isInteger(o['matiz']) &&
    o['matiz'] >= 0 &&
    o['matiz'] <= 359 &&
    typeof o['tinte'] === 'string' &&
    (TINTES as readonly string[]).includes(o['tinte'])
  );
}

/** Un preset es un par matiz+tinte con nombre; NO se persiste su `id` (docs §4:
 * "un preset ES un par matiz+tinte; no se persiste id de preset"). */
export interface PresetTema {
  readonly id: string;
  readonly nombre: string;
  readonly tema: TemaPersonalizado;
}

/**
 * Galería de presets (docs §4). Cubren el espacio de matices con nombres
 * cortos y evocadores para comercios:
 * - "Miel" (78, neutro): reproduce el carácter Minimalista actual (ámbar/miel).
 * - "Crema" (52, cálido): el carácter del estilo Cálido (crema/naranja).
 * - "Oliva" (130, neutro): verde apagado, registro delicatessen.
 * - "Mar" (245, frío): azul.
 * - "Lavanda" (300, frío): violeta.
 * - "Pizarra" (215, frío): azul-gris neutro-frío.
 */
export const PRESETS_TEMA: readonly PresetTema[] = [
  { id: 'miel', nombre: 'Miel', tema: { version: 1, matiz: 78, tinte: 'neutro' } },
  { id: 'crema', nombre: 'Crema', tema: { version: 1, matiz: 52, tinte: 'calido' } },
  { id: 'oliva', nombre: 'Oliva', tema: { version: 1, matiz: 130, tinte: 'neutro' } },
  { id: 'mar', nombre: 'Mar', tema: { version: 1, matiz: 245, tinte: 'frio' } },
  { id: 'lavanda', nombre: 'Lavanda', tema: { version: 1, matiz: 300, tinte: 'frio' } },
  { id: 'pizarra', nombre: 'Pizarra', tema: { version: 1, matiz: 215, tinte: 'frio' } },
];
