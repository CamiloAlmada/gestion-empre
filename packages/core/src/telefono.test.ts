import { describe, it, expect } from 'vitest';
import { normalizarTelefono, componerTelefono, separarCodigoPais, CODIGOS_PAIS } from './telefono.js';

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

describe('componerTelefono', () => {
  it('con el código default, devuelve la parte nacional tal cual (sin prefijo)', () => {
    expect(componerTelefono('598', '099 123 456', '598')).toBe('099 123 456');
  });

  it('con un código distinto del default, antepone +cc', () => {
    expect(componerTelefono('34', '612 345 678', '598')).toBe('+34 612 345 678');
  });

  it('si la parte nacional ya viene con + o 00, no duplica el código', () => {
    expect(componerTelefono('34', '+34 612', '598')).toBe('+34 612');
    expect(componerTelefono('34', '0034 612', '598')).toBe('0034 612');
  });

  it('parte nacional vacía (o solo espacios) → string vacío', () => {
    expect(componerTelefono('34', '   ', '598')).toBe('');
    expect(componerTelefono('598', '', '598')).toBe('');
  });

  it('recorta espacios de la parte nacional', () => {
    expect(componerTelefono('598', '  099 123 456  ', '598')).toBe('099 123 456');
  });

  it('lanza RangeError si el código o el default no son numéricos', () => {
    expect(() => componerTelefono('x', '1', '598')).toThrow(RangeError);
    expect(() => componerTelefono('598', '1', 'x')).toThrow(RangeError);
  });
});

describe('separarCodigoPais', () => {
  it('sin + ni 00 → local del default, devuelto tal cual', () => {
    expect(separarCodigoPais('099 123 456', '598')).toEqual({ codigo: '598', nacional: '099 123 456' });
  });

  it('+5989912345 matchea 598, no 5 ni 59', () => {
    expect(separarCodigoPais('+5989912345', '598')).toEqual({ codigo: '598', nacional: '9912345' });
  });

  it('0034612345678 matchea 34 (código de acceso 00)', () => {
    expect(separarCodigoPais('0034612345678', '598')).toEqual({ codigo: '34', nacional: '612345678' });
  });

  it('código fuera de la lista → fallback con el display crudo intacto', () => {
    expect(separarCodigoPais('+7 999 000', '598')).toEqual({ codigo: '598', nacional: '+7 999 000' });
  });

  it('resto vacío tras quitar el código matcheado → fallback con el display crudo', () => {
    expect(separarCodigoPais('+598', '598')).toEqual({ codigo: '598', nacional: '+598' });
  });
});

describe('componerTelefono / separarCodigoPais — round-trip e integración con normalizarTelefono', () => {
  const NACIONAL = '612 345 678';
  const DEFAULT = '598';

  it.each(CODIGOS_PAIS)('round-trip para $nombre ($codigo)', ({ codigo }) => {
    const display = componerTelefono(codigo, NACIONAL, DEFAULT);
    expect(separarCodigoPais(display, DEFAULT)).toEqual({ codigo, nacional: NACIONAL });
  });

  it('el default compone y separa sin prefijo', () => {
    expect(componerTelefono('598', '099 123 456', '598')).toBe('099 123 456');
    expect(separarCodigoPais('099 123 456', '598')).toEqual({ codigo: '598', nacional: '099 123 456' });
  });

  it('normalizarTelefono deriva bien el E.164 de un display internacional compuesto', () => {
    expect(normalizarTelefono(componerTelefono('34', '612 345 678', '598'), '598')).toBe('34612345678');
  });

  it('normalizarTelefono deriva bien el E.164 de un display local (default) compuesto', () => {
    expect(normalizarTelefono(componerTelefono('598', '099 123 456', '598'), '598')).toBe('59899123456');
  });
});
