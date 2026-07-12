import { describe, it, expect } from 'vitest';
import { normalizarTelefono } from './telefono.js';

describe('normalizarTelefono — formatos canónicos del doc 08', () => {
  it('local uruguayo con troncal 0 → antepone 598 y quita el 0', () => {
    expect(normalizarTelefono('099 123 456')).toBe('59899123456');
  });

  it('internacional con + en cualquier notación → 59899123456', () => {
    expect(normalizarTelefono('+598 99 123 456')).toBe('59899123456');
    expect(normalizarTelefono('+59899123456')).toBe('59899123456');
  });

  it('internacional con 00 → quita el 00', () => {
    expect(normalizarTelefono('00598 99 123 456')).toBe('59899123456');
    expect(normalizarTelefono('0059899123456')).toBe('59899123456');
  });

  it('ya en E.164 sin + (empieza con el código de país) → tal cual', () => {
    expect(normalizarTelefono('59899123456')).toBe('59899123456');
  });
});

describe('normalizarTelefono — separadores tolerados', () => {
  it('acepta espacios, guiones, paréntesis y puntos', () => {
    expect(normalizarTelefono('099-123-456')).toBe('59899123456');
    expect(normalizarTelefono('(099) 123.456')).toBe('59899123456');
    expect(normalizarTelefono(' 099.123.456 ')).toBe('59899123456');
    expect(normalizarTelefono('+598 (99) 123-456')).toBe('59899123456');
  });

  it('local sin troncal (8 dígitos) → antepone el código de país', () => {
    expect(normalizarTelefono('99 123 456')).toBe('59899123456');
  });
});

describe('normalizarTelefono — rechazos (null)', () => {
  it('vacío o solo separadores', () => {
    expect(normalizarTelefono('')).toBeNull();
    expect(normalizarTelefono('   ')).toBeNull();
    expect(normalizarTelefono('--- (). ')).toBeNull();
    expect(normalizarTelefono('+')).toBeNull();
  });

  it('letras u otros símbolos', () => {
    expect(normalizarTelefono('abc')).toBeNull();
    expect(normalizarTelefono('099 123 45a')).toBeNull();
    expect(normalizarTelefono('099#123456')).toBeNull();
    expect(normalizarTelefono('099/123456')).toBeNull();
  });

  it('un + fuera del inicio no es normalizable', () => {
    expect(normalizarTelefono('099+123456')).toBeNull();
    expect(normalizarTelefono('598 99+123')).toBeNull();
  });

  it('resultado fuera del rango [8,15] dígitos', () => {
    expect(normalizarTelefono('00598')).toBeNull(); // solo el código de país
    expect(normalizarTelefono('+598')).toBeNull(); // 3 dígitos
    expect(normalizarTelefono('1234')).toBeNull(); // 598+1234 = 7 dígitos
    expect(normalizarTelefono('99999999999999999999')).toBeNull(); // demasiado largo
    expect(normalizarTelefono('+9999999999999999')).toBeNull(); // 16 dígitos con +
  });
});

describe('normalizarTelefono — ambigüedades resueltas conservadoramente', () => {
  it('598 seguido de 0 (099…) tras el código de país → malformado → null', () => {
    // '598099123456' = código 598 + troncal 0 filtrado + local → mezcla inválida.
    expect(normalizarTelefono('598099123456')).toBeNull();
  });

  it('doble código de país 0598… → null', () => {
    // Troncal 0 + '598…'; al quitar el 0 vuelve a empezar con 598 → ambiguo.
    expect(normalizarTelefono('0598123456')).toBeNull();
  });

  it('+ con parte nacional que arranca en 0 se confía igual (usuario afirmó E.164)', () => {
    // Caso 1: no aplicamos el chequeo de troncal porque el país puede no ser 598.
    expect(normalizarTelefono('+598099123456')).toBe('598099123456');
  });
});

describe('normalizarTelefono — código de país configurable', () => {
  it('usa el codigoPais provisto para números locales', () => {
    expect(normalizarTelefono('11 2345 6789', '54')).toBe('541123456789'); // Argentina
    expect(normalizarTelefono('011 2345 6789', '54')).toBe('541123456789'); // con troncal
  });

  it('tolera espacios y + en el codigoPais', () => {
    expect(normalizarTelefono('99 123 456', '+598')).toBe('59899123456');
    expect(normalizarTelefono('99 123 456', ' 598 ')).toBe('59899123456');
  });

  it('lanza RangeError si codigoPais no es numérico', () => {
    expect(() => normalizarTelefono('99123456', 'uy')).toThrow(RangeError);
    expect(() => normalizarTelefono('99123456', '')).toThrow(RangeError);
  });
});
