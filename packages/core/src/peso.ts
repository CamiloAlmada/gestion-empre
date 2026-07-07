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
 * Formatea un `Peso` a string para la UI:
 *   - magnitud < 1000 g: gramos enteros → `'350 g'`
 *   - magnitud ≥ 1000 g: kg con decimal `,` y hasta 3 decimales, sin ceros a la
 *     derecha → `'1,25 kg'`, `'2 kg'`, `'1,005 kg'`
 *
 * Signo `-` al frente para negativos. El umbral usa el valor absoluto.
 * Se calcula con aritmética entera (resto de gramos) para no introducir floats.
 */
export function formatearPeso(p: Peso): string {
  const signo = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  if (abs < 1000) {
    return `${signo}${abs} g`;
  }
  const kgEntero = Math.trunc(abs / 1000);
  const resto = abs % 1000;
  const decimales = resto.toString().padStart(3, '0').replace(/0+$/, '');
  const kgStr = decimales.length > 0 ? `${kgEntero},${decimales}` : `${kgEntero}`;
  return `${signo}${kgStr} kg`;
}
