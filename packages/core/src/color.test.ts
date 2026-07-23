import { describe, it, expect } from 'vitest';
import {
  clampGamut,
  dentroDeGamut,
  hexASrgbLineal,
  luminanciaRelativa,
  maxChromaEnGamut,
  oklchAHex,
  oklchASrgbLineal,
  parseHex,
  parseOklch,
  ratioContraste,
  serializarOklch,
} from './color.js';

describe('parseHex / parseOklch', () => {
  it('parsea hex #rrggbb (case-insensitive) y rechaza basura', () => {
    expect(parseHex('#25D366')).toEqual([0x25, 0xd3, 0x66]);
    expect(parseHex('#ffffff')).toEqual([255, 255, 255]);
    expect(parseHex('rojo')).toBeNull();
    expect(parseHex('#fff')).toBeNull();
  });

  it('parsea oklch(L C H) y rechaza lo que no matchea', () => {
    expect(parseOklch('oklch(0.56 0.108 78)')).toEqual([0.56, 0.108, 78]);
    expect(parseOklch('#ffffff')).toBeNull();
  });
});

describe('candado de conversiones (ratios históricos de scripts/contraste.mjs)', () => {
  const blanco = hexASrgbLineal('#ffffff');

  it('blanco / whatsapp-oscuro #128C7E ≈ 4.14:1', () => {
    expect(ratioContraste(blanco, hexASrgbLineal('#128c7e'))).toBeCloseTo(4.14, 1);
  });

  it('blanco / whatsapp #25D366 ≈ 1.98:1', () => {
    expect(ratioContraste(blanco, hexASrgbLineal('#25d366'))).toBeCloseTo(1.98, 1);
  });

  it('blanco / primary-600 ámbar oklch(0.56 0.108 78) ≈ 4.73:1', () => {
    const primary600 = clampGamut(oklchASrgbLineal(0.56, 0.108, 78)).rgb;
    expect(ratioContraste(blanco, primary600)).toBeCloseTo(4.73, 1);
  });
});

describe('oklchAHex (round-trip)', () => {
  it('extremos: blanco y negro', () => {
    expect(oklchAHex(1, 0, 0)).toBe('#ffffff');
    expect(oklchAHex(0, 0, 0)).toBe('#000000');
  });

  it('un color intermedio round-trippea con luminancia estable', () => {
    // oklchAHex → hex → sRGB lineal debe conservar la luminancia del OKLCH
    // original (dentro del error de cuantización a 8 bits).
    const hex = oklchAHex(0.56, 0.108, 78);
    expect(/^#[0-9a-f]{6}$/.test(hex)).toBe(true);
    const lumOriginal = luminanciaRelativa(clampGamut(oklchASrgbLineal(0.56, 0.108, 78)).rgb);
    const lumHex = luminanciaRelativa(hexASrgbLineal(hex));
    expect(Math.abs(lumHex - lumOriginal)).toBeLessThan(0.005);
  });
});

describe('maxChromaEnGamut', () => {
  it('en L extremos (negro/blanco puro) la chroma máxima tiende a 0', () => {
    expect(maxChromaEnGamut(0, 78)).toBeLessThan(0.001);
    expect(maxChromaEnGamut(1, 78)).toBeLessThan(0.001);
  });

  it('en un L medio devuelve chroma positiva EN gamut, y apenas por encima cae fuera', () => {
    const c = maxChromaEnGamut(0.6, 78);
    expect(c).toBeGreaterThan(0.05);
    expect(dentroDeGamut(oklchASrgbLineal(0.6, c, 78))).toBe(true);
    expect(dentroDeGamut(oklchASrgbLineal(0.6, c * 1.05, 78))).toBe(false);
  });

  it('el hue envuelve: 0° ≡ 360°', () => {
    expect(maxChromaEnGamut(0.6, 0)).toBeCloseTo(maxChromaEnGamut(0.6, 360), 5);
  });
});

describe('serializarOklch', () => {
  it('recorta a 4 decimales sin ceros de cola y redondea el hue a entero', () => {
    expect(serializarOklch(0.562311, 0.108, 214.4)).toBe('oklch(0.5623 0.108 214)');
    expect(serializarOklch(0.5, 0, 75)).toBe('oklch(0.5 0 75)');
    expect(serializarOklch(0.965, 0.006, 75)).toBe('oklch(0.965 0.006 75)');
  });

  it('el hue redondea half-up y no arrastra decimales', () => {
    expect(serializarOklch(0.4, 0.12, 77.6)).toBe('oklch(0.4 0.12 78)');
  });
});

describe('clampGamut', () => {
  it('marca fuera de gamut y capa a [0,1]', () => {
    const { rgb, estabaFueraDeGamut } = clampGamut([1.2, -0.1, 0.5]);
    expect(estabaFueraDeGamut).toBe(true);
    expect(rgb).toEqual([1, 0, 0.5]);
  });

  it('no marca por ruido de redondeo (tolerancia 1e-4)', () => {
    expect(clampGamut([1.00005, 0.5, 0]).estabaFueraDeGamut).toBe(false);
  });
});
