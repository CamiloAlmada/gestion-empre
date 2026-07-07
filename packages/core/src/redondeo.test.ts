import { describe, it, expect } from 'vitest';
import { redondearHalfUp } from './redondeo.js';

describe('redondearHalfUp', () => {
  it('redondea half-up en el límite exacto .5 hacia afuera del cero', () => {
    expect(redondearHalfUp(2.5)).toBe(3);
    expect(redondearHalfUp(-2.5)).toBe(-3);
    expect(redondearHalfUp(0.5)).toBe(1);
    expect(redondearHalfUp(-0.5)).toBe(-1);
    expect(redondearHalfUp(1.5)).toBe(2);
    expect(redondearHalfUp(-1.5)).toBe(-2);
  });

  it('difiere de Math.round en negativos en el límite (regresión de la regla)', () => {
    // Math.round(-2.5) === -2 (hacia +∞); nuestra versión es simétrica.
    expect(redondearHalfUp(-2.5)).not.toBe(Math.round(-2.5));
    expect(redondearHalfUp(-2.5)).toBe(-3);
  });

  it('redondea hacia abajo por debajo de .5', () => {
    expect(redondearHalfUp(2.4)).toBe(2);
    expect(redondearHalfUp(-2.4)).toBe(-2);
    expect(redondearHalfUp(2.49999)).toBe(2);
    expect(redondearHalfUp(-2.49999)).toBe(-2);
  });

  it('redondea hacia arriba por encima de .5', () => {
    expect(redondearHalfUp(2.6)).toBe(3);
    expect(redondearHalfUp(-2.6)).toBe(-3);
  });

  it('deja los enteros intactos, incluidos 0 y -0', () => {
    expect(redondearHalfUp(0)).toBe(0);
    expect(redondearHalfUp(-0)).toBe(0);
    expect(redondearHalfUp(7)).toBe(7);
    expect(redondearHalfUp(-7)).toBe(-7);
  });

  it('opera sobre el valor real del double, no sobre la intención decimal', () => {
    // 2.675 * 100 === 267.5 exacto en IEEE754 (el producto cae justo en un
    // representable), así que half-up sube a 268.
    expect(2.675 * 100).toBe(267.5);
    expect(redondearHalfUp(2.675 * 100)).toBe(268);
    // 1.005 * 1000 === 1004.9999999999999 (fracción .9999… ≥ .5) → sube a 1005;
    // acá el error de flotante no altera el resultado esperado.
    expect(1.005 * 1000).toBeCloseTo(1005, 3);
    expect(redondearHalfUp(1.005 * 1000)).toBe(1005);
  });

  it('lanza RangeError con valores no finitos', () => {
    expect(() => redondearHalfUp(NaN)).toThrow(RangeError);
    expect(() => redondearHalfUp(Infinity)).toThrow(RangeError);
    expect(() => redondearHalfUp(-Infinity)).toThrow(RangeError);
  });
});
