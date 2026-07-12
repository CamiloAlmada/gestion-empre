import type { StatsCliente } from './tipos.js';

/**
 * Clasificación de clientes inactivos (doc 08, "Fidelización").
 *
 * Un cliente está inactivo cuando el tiempo desde su última compra supera su
 * **ritmo propio**: `diasSinVenir > factorInactividad × promedioDiasEntreCompras`.
 * El ritmo se calcula con ≥3 compras históricas; con menos, se usa un umbral global.
 *
 * TypeScript puro (regla de oro 1): la fecha "ahora" entra **como parámetro** (nada
 * de `Date.now()` adentro) para que la función sea determinista y testeable. El
 * ordenamiento de la lista por valor histórico es responsabilidad del caller (UI),
 * no de esta clasificación.
 */

const MS_POR_DIA = 86_400_000; // 24 · 60 · 60 · 1000

/** Config de la clasificación (doc 08). Ambos con default. */
export interface ConfigInactividad {
  /** Múltiplo del ritmo propio a partir del cual se considera inactivo. Default `2`. */
  readonly factorInactividad?: number;
  /** Umbral global en días para clientes con <3 compras (o sin ritmo). Default `30`. */
  readonly umbralGlobalDias?: number;
}

/** Datos de stats que la clasificación necesita (subconjunto de `StatsCliente`). */
export type EntradaInactividad = Pick<
  StatsCliente,
  'cantidadVentas' | 'primeraCompra' | 'ultimaCompra'
>;

/** Resultado de clasificar un cliente. */
export interface ResultadoInactividad {
  /** `true` si el cliente superó su umbral de inactividad. */
  readonly inactivo: boolean;
  /** Días enteros completos desde la última compra (0 si nunca compró o dato futuro). */
  readonly diasSinVenir: number;
  /**
   * Ritmo propio en días. Presente solo con ≥3 compras y fechas válidas. Puede ser
   * `0` (todas las compras el mismo día): en ese caso la clasificación cae al umbral
   * global (ver más abajo), pero se reporta igual como dato informativo.
   */
  readonly promedioDiasEntreCompras?: number;
}

const DEFAULT_FACTOR = 2;
const DEFAULT_UMBRAL_GLOBAL_DIAS = 30;

/**
 * Clasifica a un cliente como inactivo o no, según sus stats y `ahora`.
 *
 * Reglas (doc 08):
 * - **≥3 compras** con fechas válidas y ritmo positivo:
 *   `promedio = (ultimaCompra − primeraCompra) / (cantidadVentas − 1)` (en días);
 *   inactivo si `diasSinVenir > factorInactividad × promedio`.
 * - **<3 compras**: inactivo si `diasSinVenir > umbralGlobalDias`.
 *
 * Decisiones en casos borde (todas testeadas):
 * - **0 compras** (o `ultimaCompra` ausente/ inválida): no clasifica como inactivo
 *   (`inactivo: false`, `diasSinVenir: 0`). No hay "última compra" de la cual estar
 *   ausente; no debe aparecer en "clientes que estamos perdiendo".
 * - **Ritmo 0** (≥3 compras pero todas el mismo día, `primeraCompra === ultimaCompra`,
 *   o `primeraCompra` ausente): no hay cadencia real; declarar inactivo tras un solo
 *   día sería demasiado agresivo, así que **se cae al umbral global**. Se reporta
 *   `promedioDiasEntreCompras: 0` cuando pudo calcularse.
 * - **`ultimaCompra` en el futuro** (desfasaje de reloj / dato malo): `diasSinVenir`
 *   se acota a `0` → nunca inactivo.
 *
 * @param stats stats del cliente (sirve el `stats` del modelo `Cliente`).
 * @param ahora instante de referencia (lo provee el caller; core no lee el reloj).
 * @param config factor y umbral global (defaults `2` y `30`).
 * @throws {RangeError} si `ahora` es una fecha inválida, o si `factorInactividad`
 *   (≤0 / no finito) o `umbralGlobalDias` (<0 / no finito) son inválidos.
 */
export function clasificarInactividad(
  stats: EntradaInactividad,
  ahora: Date,
  config: ConfigInactividad = {},
): ResultadoInactividad {
  if (!esFechaValida(ahora)) {
    throw new RangeError('clasificarInactividad requiere un `ahora` que sea una fecha válida');
  }
  const factor = config.factorInactividad ?? DEFAULT_FACTOR;
  const umbralGlobal = config.umbralGlobalDias ?? DEFAULT_UMBRAL_GLOBAL_DIAS;
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(`factorInactividad debe ser un número finito > 0, recibió: ${factor}`);
  }
  if (!Number.isFinite(umbralGlobal) || umbralGlobal < 0) {
    throw new RangeError(`umbralGlobalDias debe ser un número finito ≥ 0, recibió: ${umbralGlobal}`);
  }

  const { cantidadVentas, primeraCompra, ultimaCompra } = stats;

  // Sin compras (o sin última compra registrable) → no clasifica como inactivo.
  if (cantidadVentas <= 0 || !esFechaValida(ultimaCompra)) {
    return { inactivo: false, diasSinVenir: 0 };
  }

  const diasSinVenir = Math.max(0, Math.floor((ahora.getTime() - ultimaCompra.getTime()) / MS_POR_DIA));

  // Ritmo propio con ≥3 compras y fechas válidas.
  if (cantidadVentas >= 3 && esFechaValida(primeraCompra)) {
    const promedio = (ultimaCompra.getTime() - primeraCompra.getTime()) / MS_POR_DIA / (cantidadVentas - 1);
    if (promedio > 0) {
      return { inactivo: diasSinVenir > factor * promedio, diasSinVenir, promedioDiasEntreCompras: promedio };
    }
    // Ritmo 0 (todas el mismo día): sin cadencia real → umbral global, pero se
    // reporta el promedio calculado (0) como dato informativo.
    return { inactivo: diasSinVenir > umbralGlobal, diasSinVenir, promedioDiasEntreCompras: promedio };
  }

  // <3 compras (o sin primeraCompra para calcular ritmo) → umbral global.
  return { inactivo: diasSinVenir > umbralGlobal, diasSinVenir };
}

/** `true` si `d` es un `Date` válido (no `undefined`, no `Invalid Date`). */
function esFechaValida(d: Date | undefined): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}
