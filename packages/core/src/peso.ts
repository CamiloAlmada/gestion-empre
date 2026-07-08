import { redondearHalfUp } from './redondeo.js';

declare const brandPeso: unique symbol;

/**
 * Peso en gramos, entero.
 *
 * La UI muestra y acepta kg con decimales, pero convierte a gramos antes de tocar
 * dominio o persistencia. Puede ser negativo (deltas de movimientos de stock).
 * Branded type sobre `number`: costo cero en runtime.
 */
export type Peso = number & { readonly [brandPeso]: 'Peso' };

/**
 * Construye un `Peso` a partir de gramos.
 *
 * @throws {RangeError} si `gramos` no es un entero finito (rechaza floats, NaN,
 *   Infinity). Acepta 0 y negativos.
 */
export function peso(gramos: number): Peso {
  if (!Number.isInteger(gramos)) {
    throw new RangeError(`peso() requiere un entero finito de gramos, recibió: ${gramos}`);
  }
  return gramos as Peso;
}

/** Suma de pesos. Sin argumentos devuelve `peso(0)` (identidad). */
export function sumarPeso(...pesos: Peso[]): Peso {
  return peso(pesos.reduce<number>((acc, p) => acc + p, 0));
}

/**
 * Resta `b` de `a`. Puede dar negativo, coherente con que `Peso` admite deltas
 * negativos (movimientos de stock). Para clampear a 0 usar `pesoNoNegativo`.
 */
export function restarPeso(a: Peso, b: Peso): Peso {
  return peso(a - b);
}

/** Clampea un `Peso` a 0: negativos → `peso(0)`, 0 y positivos intactos. */
export function pesoNoNegativo(p: Peso): Peso {
  return p < 0 ? peso(0) : p;
}

/**
 * Convierte kg (con decimales, como lo ingresa la UI) a `Peso` en gramos,
 * redondeando half-up. Frontera UI → dominio.
 *
 *   pesoDesdeKg(0.1) === peso(100)
 *
 * @throws {RangeError} si `kg` no es finito.
 */
export function pesoDesdeKg(kg: number): Peso {
  if (!Number.isFinite(kg)) {
    throw new RangeError(`pesoDesdeKg() requiere un valor finito, recibió: ${kg}`);
  }
  return peso(redondearHalfUp(kg * 1000));
}

/**
 * Formatea la magnitud de un `Peso` como kg **sin** el sufijo ` kg`: número con
 * decimal `,` y hasta 3 decimales, sin ceros a la derecha, signo `-` al frente.
 *
 *   kgSinSufijo(peso(1250)) === '1,25'
 *   kgSinSufijo(peso(500))  === '0,5'
 *   kgSinSufijo(peso(2000)) === '2'
 *
 * Se calcula con aritmética entera (resto de gramos) para no introducir floats.
 * Base compartida por `formatearPeso` (le agrega ` kg`) y por
 * `formatearPesoForzado` (lo usa tal cual).
 */
function kgSinSufijo(p: Peso): string {
  const signo = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  const kgEntero = Math.trunc(abs / 1000);
  const resto = abs % 1000;
  const decimales = resto.toString().padStart(3, '0').replace(/0+$/, '');
  return decimales.length > 0 ? `${signo}${kgEntero},${decimales}` : `${signo}${kgEntero}`;
}

/**
 * Formatea un `Peso` a string para **display**, eligiendo la unidad según la
 * magnitud y agregando el sufijo:
 *   - magnitud < 1000 g: gramos enteros → `'350 g'`
 *   - magnitud ≥ 1000 g: kg con decimal `,` y hasta 3 decimales, sin ceros a la
 *     derecha → `'1,25 kg'`, `'2 kg'`, `'1,005 kg'`
 *
 * Signo `-` al frente para negativos. El umbral usa el valor absoluto.
 *
 * Para inputs con unidad explícita (toggle g|kg), usar `formatearPesoForzado`,
 * que fuerza la unidad y no agrega sufijo.
 */
export function formatearPeso(p: Peso): string {
  const abs = Math.abs(p);
  if (abs < 1000) {
    const signo = p < 0 ? '-' : '';
    return `${signo}${abs} g`;
  }
  return `${kgSinSufijo(p)} kg`;
}

/**
 * Formatea un `Peso` (gramos) forzando la unidad pedida y **sin** sufijo, para
 * repoblar el value de un input de peso con toggle de unidad explícito:
 *   - `'g'`  → gramos enteros, tal cual el número (`peso(1500)` → `'1500'`,
 *     `peso(-350)` → `'-350'`, `peso(0)` → `'0'`). Sin separador de miles ni sufijo.
 *   - `'kg'` → kg con decimal `,` y hasta 3 decimales sin ceros a la derecha,
 *     forzando kg incluso por debajo de 1000 g (`peso(500)` → `'0,5'`).
 *
 * Diferencia con `formatearPeso`: aquel elige la unidad por magnitud y agrega
 * sufijo (` g`/` kg`) para display; este fuerza la unidad activa y no agrega
 * sufijo porque alimenta el `value` de un `<input>`.
 */
export function formatearPesoForzado(p: Peso, unidad: 'g' | 'kg'): string {
  return unidad === 'g' ? String(p) : kgSinSufijo(p);
}
