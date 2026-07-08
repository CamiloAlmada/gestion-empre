import { describe, it, expect } from 'vitest';
import {
  peso,
  sumarPeso,
  restarPeso,
  pesoNoNegativo,
  pesoDesdeKg,
  formatearPeso,
  formatearPesoForzado,
} from './peso.js';

describe('peso (constructor)', () => {
  it('acepta 0, positivos y negativos enteros', () => {
    expect(peso(0)).toBe(0);
    expect(peso(350)).toBe(350);
    expect(peso(-350)).toBe(-350);
  });

  it('rechaza no-enteros', () => {
    expect(() => peso(1.5)).toThrow(RangeError);
    expect(() => peso(0.1)).toThrow(RangeError);
    expect(() => peso(-99.9)).toThrow(RangeError);
  });

  it('rechaza NaN e Infinity', () => {
    expect(() => peso(NaN)).toThrow(RangeError);
    expect(() => peso(Infinity)).toThrow(RangeError);
    expect(() => peso(-Infinity)).toThrow(RangeError);
  });
});

describe('sumarPeso', () => {
  it('suma casos base', () => {
    expect(sumarPeso(peso(100), peso(250), peso(50))).toBe(400);
  });

  it('sin argumentos devuelve 0 (identidad)', () => {
    expect(sumarPeso()).toBe(0);
  });

  it('respeta la identidad con 0', () => {
    expect(sumarPeso(peso(999), peso(0))).toBe(999);
  });

  it('maneja negativos (deltas de stock)', () => {
    expect(sumarPeso(peso(500), peso(-200))).toBe(300);
    expect(sumarPeso(peso(-500), peso(500))).toBe(0);
    expect(sumarPeso(peso(-100), peso(-250))).toBe(-350);
  });
});

describe('restarPeso', () => {
  it('resta con resultado positivo', () => {
    expect(restarPeso(peso(500), peso(200))).toBe(300);
  });

  it('resta con resultado negativo (delta)', () => {
    expect(restarPeso(peso(200), peso(500))).toBe(-300);
  });

  it('resta con resultado cero', () => {
    expect(restarPeso(peso(500), peso(500))).toBe(0);
  });
});

describe('pesoNoNegativo', () => {
  it('clampea negativos a 0', () => {
    expect(pesoNoNegativo(peso(-350))).toBe(0);
  });

  it('deja el 0 intacto', () => {
    expect(pesoNoNegativo(peso(0))).toBe(0);
  });

  it('deja los positivos intactos', () => {
    expect(pesoNoNegativo(peso(350))).toBe(350);
  });
});

describe('pesoDesdeKg', () => {
  it('convierte kg a gramos', () => {
    expect(pesoDesdeKg(0.1)).toBe(100);
    expect(pesoDesdeKg(1)).toBe(1000);
    expect(pesoDesdeKg(1.25)).toBe(1250);
    expect(pesoDesdeKg(0)).toBe(0);
    expect(pesoDesdeKg(-0.5)).toBe(-500);
  });

  it('redondea half-up con más de 3 decimales', () => {
    // 1.2345 → 1234.5 → 1235
    expect(pesoDesdeKg(1.2345)).toBe(1235);
    // 1.2344 → 1234.4 → 1234
    expect(pesoDesdeKg(1.2344)).toBe(1234);
    // -1.2345 → -1234.5 → -1235 (simétrico)
    expect(pesoDesdeKg(-1.2345)).toBe(-1235);
  });

  it('lanza RangeError con valores no finitos', () => {
    expect(() => pesoDesdeKg(NaN)).toThrow(RangeError);
    expect(() => pesoDesdeKg(Infinity)).toThrow(RangeError);
  });
});

describe('formatearPeso', () => {
  it('muestra gramos por debajo de 1000 g', () => {
    expect(formatearPeso(peso(350))).toBe('350 g');
    expect(formatearPeso(peso(0))).toBe('0 g');
    expect(formatearPeso(peso(1))).toBe('1 g');
    expect(formatearPeso(peso(999))).toBe('999 g');
  });

  it('muestra kg desde 1000 g, con hasta 3 decimales sin ceros a la derecha', () => {
    expect(formatearPeso(peso(1000))).toBe('1 kg');
    expect(formatearPeso(peso(1250))).toBe('1,25 kg');
    expect(formatearPeso(peso(2000))).toBe('2 kg');
    expect(formatearPeso(peso(1005))).toBe('1,005 kg');
    expect(formatearPeso(peso(1200))).toBe('1,2 kg');
    expect(formatearPeso(peso(1025))).toBe('1,025 kg');
    expect(formatearPeso(peso(12345))).toBe('12,345 kg');
  });

  it('formatea negativos con signo al frente (deltas)', () => {
    expect(formatearPeso(peso(-350))).toBe('-350 g');
    expect(formatearPeso(peso(-1250))).toBe('-1,25 kg');
    expect(formatearPeso(peso(-2000))).toBe('-2 kg');
  });
});

describe('formatearPesoForzado', () => {
  describe("unidad 'g'", () => {
    it('muestra gramos enteros sin sufijo ni separador de miles', () => {
      expect(formatearPesoForzado(peso(500), 'g')).toBe('500');
      expect(formatearPesoForzado(peso(1500), 'g')).toBe('1500');
      expect(formatearPesoForzado(peso(12345), 'g')).toBe('12345');
    });

    it('formatea el cero', () => {
      expect(formatearPesoForzado(peso(0), 'g')).toBe('0');
    });

    it('formatea negativos con signo al frente (deltas)', () => {
      expect(formatearPesoForzado(peso(-350), 'g')).toBe('-350');
      expect(formatearPesoForzado(peso(-1500), 'g')).toBe('-1500');
    });
  });

  describe("unidad 'kg'", () => {
    it('fuerza kg incluso por debajo de 1000 g, con coma decimal', () => {
      expect(formatearPesoForzado(peso(500), 'kg')).toBe('0,5');
      expect(formatearPesoForzado(peso(1250), 'kg')).toBe('1,25');
      expect(formatearPesoForzado(peso(1005), 'kg')).toBe('1,005');
    });

    it('recorta ceros a la derecha', () => {
      expect(formatearPesoForzado(peso(1200), 'kg')).toBe('1,2');
      expect(formatearPesoForzado(peso(1020), 'kg')).toBe('1,02');
    });

    it('exacto en kilos: sin decimales', () => {
      expect(formatearPesoForzado(peso(1000), 'kg')).toBe('1');
      expect(formatearPesoForzado(peso(2000), 'kg')).toBe('2');
    });

    it('formatea el cero', () => {
      expect(formatearPesoForzado(peso(0), 'kg')).toBe('0');
    });

    it('formatea negativos con signo al frente (deltas)', () => {
      expect(formatearPesoForzado(peso(-1250), 'kg')).toBe('-1,25');
      expect(formatearPesoForzado(peso(-500), 'kg')).toBe('-0,5');
      expect(formatearPesoForzado(peso(-2000), 'kg')).toBe('-2');
    });
  });

  it('re-presenta el mismo Peso al alternar de unidad, como espera el input (kg → g → kg)', () => {
    const p = pesoDesdeKg(1.25); // peso(1250)
    const enKg = formatearPesoForzado(p, 'kg');
    const enG = formatearPesoForzado(p, 'g');
    expect(enKg).toBe('1,25');
    expect(enG).toBe('1250');
    // El value re-presentado en kg se vuelve a parsear al mismo Peso.
    expect(pesoDesdeKg(parseFloat(enKg.replace(',', '.')))).toBe(p);
    expect(peso(parseInt(enG, 10))).toBe(p);
  });
});
