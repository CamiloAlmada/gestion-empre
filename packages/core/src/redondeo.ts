/**
 * Redondeo comercial del sistema.
 *
 * Toda multiplicación o conversión que produzca un valor fraccionario en centésimos
 * o gramos debe pasar por esta función antes de construir un `Money` o `Peso`.
 */

/**
 * Redondeo half-up simétrico ("away from zero"):
 *   redondearHalfUp(2.5)  === 3
 *   redondearHalfUp(-2.5) === -3
 *   redondearHalfUp(2.4)  === 2
 *   redondearHalfUp(-2.4) === -2
 *
 * `Math.round` de JS redondea half-up hacia +∞ (`Math.round(-2.5) === -2`), lo que
 * rompe la simetría necesaria para deltas y reversas. Por eso redondeamos sobre el
 * valor absoluto y reaplicamos el signo.
 *
 * Nota sobre punto flotante: opera sobre el `number` recibido tal cual, no sobre la
 * intención decimal del literal. Si el producto/argumento cae en un representable
 * distinto al esperado (ej. `2.675 * 100 === 267.5` exacto, que sube a 268), el
 * resultado refleja ese valor real. Convertí desde la UI con enteros cuando puedas.
 *
 * @throws {RangeError} si `x` no es un número finito.
 */
export function redondearHalfUp(x: number): number {
  if (!Number.isFinite(x)) {
    throw new RangeError(`redondearHalfUp requiere un número finito, recibió: ${x}`);
  }
  // `+ 0` normaliza el `-0` que produce `Math.sign(-0) * Math.round(0)` a `+0`:
  // -0 no tiene significado en centésimos/gramos y rompería comparaciones Object.is.
  return Math.sign(x) * Math.round(Math.abs(x)) + 0;
}
