import { describe, it, expect } from 'vitest';
import { normalizarTema, esTemaValido, PRESETS_TEMA, type TinteFondo } from './tema.js';

describe('normalizarTema', () => {
  it('deja pasar un tema ya canónico', () => {
    expect(normalizarTema({ matiz: 78, tinte: 'neutro' })).toEqual({ version: 1, matiz: 78, tinte: 'neutro' });
  });

  it('envuelve el matiz a [0,360)', () => {
    expect(normalizarTema({ matiz: 360, tinte: 'neutro' }).matiz).toBe(0);
    expect(normalizarTema({ matiz: 370, tinte: 'calido' }).matiz).toBe(10);
    expect(normalizarTema({ matiz: -30, tinte: 'frio' }).matiz).toBe(330);
    expect(normalizarTema({ matiz: 720, tinte: 'neutro' }).matiz).toBe(0);
  });

  it('redondea el matiz a entero', () => {
    expect(normalizarTema({ matiz: 77.6, tinte: 'neutro' }).matiz).toBe(78);
    expect(normalizarTema({ matiz: 359.9, tinte: 'neutro' }).matiz).toBe(0); // 360 → wrap 0
  });

  it('rechaza matiz no finito o tinte inválido', () => {
    expect(() => normalizarTema({ matiz: NaN, tinte: 'neutro' })).toThrow(RangeError);
    expect(() => normalizarTema({ matiz: Infinity, tinte: 'neutro' })).toThrow(RangeError);
    expect(() => normalizarTema({ matiz: 10, tinte: 'verde' as TinteFondo })).toThrow(RangeError);
  });
});

describe('esTemaValido (type guard para datos crudos de Firestore)', () => {
  it('acepta un tema bien formado', () => {
    expect(esTemaValido({ version: 1, matiz: 200, tinte: 'frio' })).toBe(true);
    expect(esTemaValido({ version: 1, matiz: 0, tinte: 'neutro' })).toBe(true);
    expect(esTemaValido({ version: 1, matiz: 359, tinte: 'calido' })).toBe(true);
  });

  it('rechaza basura y formas parciales', () => {
    expect(esTemaValido(null)).toBe(false);
    expect(esTemaValido(undefined)).toBe(false);
    expect(esTemaValido(42)).toBe(false);
    expect(esTemaValido('neutro')).toBe(false);
    expect(esTemaValido({})).toBe(false);
    expect(esTemaValido({ version: 2, matiz: 78, tinte: 'neutro' })).toBe(false);
    expect(esTemaValido({ version: 1, matiz: 78 })).toBe(false);
    expect(esTemaValido({ version: 1, tinte: 'neutro' })).toBe(false);
  });

  it('rechaza matiz fuera de rango o no entero', () => {
    expect(esTemaValido({ version: 1, matiz: -1, tinte: 'neutro' })).toBe(false);
    expect(esTemaValido({ version: 1, matiz: 360, tinte: 'neutro' })).toBe(false);
    expect(esTemaValido({ version: 1, matiz: 78.5, tinte: 'neutro' })).toBe(false);
    expect(esTemaValido({ version: 1, matiz: NaN, tinte: 'neutro' })).toBe(false);
  });

  it('rechaza tinte desconocido', () => {
    expect(esTemaValido({ version: 1, matiz: 78, tinte: 'violeta' })).toBe(false);
  });
});

describe('PRESETS_TEMA', () => {
  it('tiene 6 presets con ids únicos y temas válidos', () => {
    expect(PRESETS_TEMA).toHaveLength(6);
    const ids = PRESETS_TEMA.map((p) => p.id);
    expect(new Set(ids).size).toBe(6);
    for (const preset of PRESETS_TEMA) {
      expect(esTemaValido(preset.tema)).toBe(true);
      expect(preset.nombre.length).toBeGreaterThan(0);
    }
  });

  it('cubre los tres tintes y reproduce Miel = Minimalista (78, neutro)', () => {
    const tintes = new Set(PRESETS_TEMA.map((p) => p.tema.tinte));
    expect(tintes).toEqual(new Set<TinteFondo>(['neutro', 'calido', 'frio']));
    const miel = PRESETS_TEMA.find((p) => p.id === 'miel');
    expect(miel?.tema).toEqual({ version: 1, matiz: 78, tinte: 'neutro' });
  });
});
