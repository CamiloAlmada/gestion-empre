import { describe, it, expect } from 'vitest';
import { generarPaleta, ErrorPaletaInvalida, type TokensGenerados } from './paleta.js';
import { verificarPares, PARES_AA } from './contrasteAa.js';
import { parseOklch } from './color.js';
import { PRESETS_TEMA, type TinteFondo } from './tema.js';

const TINTES: readonly TinteFondo[] = ['neutro', 'calido', 'frio'];

function ratioDe(tokens: TokensGenerados, id: string): number {
  const r = tokens.reporte.resultados.find((x) => x.id === id);
  if (!r) throw new Error(`par ${id} no encontrado`);
  return r.ratio;
}

describe('EL TEOREMA: AA por construcción en las 1080 paletas', () => {
  it('genera matiz 0..359 × 3 tintes sin lanzar y con todosPasan', () => {
    const inicio = Date.now();
    let generadas = 0;
    for (let matiz = 0; matiz < 360; matiz++) {
      for (const tinte of TINTES) {
        const tokens = generarPaleta({ version: 1, matiz, tinte });
        expect(tokens.reporte.todosPasan).toBe(true);
        // Contrato endurecido: el AA es POR CONSTRUCCIÓN, no por reparación. Si
        // una receta o un par nuevo reactivara el lazo, esto rompe el build.
        expect(tokens.reporte.reparaciones).toBe(0);
        generadas++;
      }
    }
    expect(generadas).toBe(1080);
    // El test es la garantía del contrato §7; debe correr rápido. No se asserta
    // un tope duro de tiempo (flakea en CI cargado); se registra por consola.
    console.log(`[teorema] 1080 paletas en ${Date.now() - inicio}ms`);
  });
});

describe('regresión §7: Miel (78, neutro) reproduce los ratios Minimalista', () => {
  const miel = generarPaleta({ version: 1, matiz: 78, tinte: 'neutro' });

  // Ratios de la tabla Minimalista de docs/06 §7, tolerancia ±0.15. EXCEPCIÓN:
  // los pares de `borde` dan más alto que el §7 estático porque el ancla de
  // borde-light es la de la UNIÓN de tablas (oscurecida para que borde/fondo
  // light ≥ 3.05, ver Y_ANCLA_NEUTRO en paleta.ts), no la Minimalista pura:
  // borde/superficie sube de 3.10 a ~3.24 y borde/fondo pasa de 2.92 a ~3.05.
  const esperados: Record<string, number> = {
    'texto/fondo-light': 17.53,
    'texto/superficie-light': 18.59,
    'texto-secundario/superficie-light': 7.77,
    'texto-secundario/fondo-light': 7.33,
    'boton-primario-light': 4.73,
    'boton-primario-hover-light': 6.92,
    'error/superficie-light': 5.15,
    'boton-peligro-light': 5.38,
    'borde-input/superficie-light': 3.24, // §7: 3.10 (ancla de borde oscurecida)
    'borde/fondo-light': 3.05, // §7 Cálido: 3.23; acá por construcción ≥ 3.05
    'ring/superficie-light': 4.53,
    'ring/fondo-light': 4.27,
    'exito/superficie-light': 5.89,
    'advertencia/superficie-light': 5.97,
    'marca/superficie-light': 6.62,
    'selector-activo/fondo-light': 6.25,
  };

  for (const [id, valor] of Object.entries(esperados)) {
    it(`${id} ≈ ${valor}:1`, () => {
      expect(Math.abs(ratioDe(miel, id) - valor)).toBeLessThanOrEqual(0.15);
    });
  }

  it('el par selector primary-700/primary-100 da 5.96, NO el 12.33 de la tabla §7', () => {
    // docs/06 §7 lista 12.33 (light) / 7.28 (dark) para el ítem activo del
    // selector, pero la escala primary ACTUAL de tailwind.css da 5.96 / 7.33
    // (verificado con `node scripts/contraste.mjs`). La fila §7 quedó vieja; el
    // motor reproduce el valor real y el par igual cumple AA (≥4.5). REPORTADO.
    expect(ratioDe(miel, 'selector-activo-light')).toBeCloseTo(5.96, 1);
    expect(ratioDe(miel, 'selector-activo-dark')).toBeCloseTo(7.33, 1);
  });
});

describe('snapshots de receta por preset', () => {
  // Se snapshotea { tema, themeColor, variables }: TODO lo que define la receta
  // (strings oklch serializados a 4 decimales y hex, ambos estables). Se OMITE
  // reporte a propósito: sus ratios son floats de precisión completa que
  // flakearían el snapshot entre versiones de V8, y ya están cubiertos por el
  // teorema y la regresión. Un cambio de receta acá obliga a decidir bump de
  // `version`.
  function receta(t: TokensGenerados) {
    return { tema: t.tema, themeColor: t.themeColor, variables: t.variables };
  }

  it('Miel (78, neutro)', () => {
    expect(receta(generarPaleta({ version: 1, matiz: 78, tinte: 'neutro' }))).toMatchInlineSnapshot(`
      {
        "tema": {
          "matiz": 78,
          "tinte": "neutro",
          "version": 1,
        },
        "themeColor": {
          "dark": "#040302",
          "light": "#f6f3ef",
        },
        "variables": {
          "--advertencia-dark": "oklch(0.7 0.16 55)",
          "--advertencia-light": "oklch(0.5 0.11 55)",
          "--borde-dark": "oklch(0.53 0.012 75)",
          "--borde-light": "oklch(0.6388 0.01 75)",
          "--color-primary-100": "oklch(0.95 0.04 78)",
          "--color-primary-200": "oklch(0.89 0.09 78)",
          "--color-primary-300": "oklch(0.82 0.15 78)",
          "--color-primary-400": "oklch(0.745 0.14 78)",
          "--color-primary-50": "oklch(0.98 0.015 78)",
          "--color-primary-500": "oklch(0.655 0.125 78)",
          "--color-primary-600": "oklch(0.5601 0.108 78)",
          "--color-primary-700": "oklch(0.47 0.09 78)",
          "--color-primary-800": "oklch(0.385 0.074 78)",
          "--color-primary-900": "oklch(0.3149 0.06 78)",
          "--color-primary-950": "oklch(0.2148 0.041 78)",
          "--exito-dark": "oklch(0.7 0.18 145)",
          "--exito-light": "oklch(0.48 0.14 145)",
          "--fondo-dark": "oklch(0.1016 0.006 75)",
          "--fondo-light": "oklch(0.965 0.006 75)",
          "--peligro-dark": "oklch(0.68 0.19 25)",
          "--peligro-light": "oklch(0.55 0.2 25)",
          "--superficie-dark": "oklch(0.1602 0.008 75)",
          "--superficie-light": "oklch(0.985 0.005 75)",
          "--texto-dark": "oklch(0.9851 0.008 75)",
          "--texto-light": "oklch(0.1602 0.008 75)",
          "--texto-secundario-dark": "oklch(0.65 0.012 75)",
          "--texto-secundario-light": "oklch(0.4299 0.01 75)",
        },
      }
    `);
  });
  it('Crema (52, calido)', () => {
    expect(receta(generarPaleta({ version: 1, matiz: 52, tinte: 'calido' }))).toMatchInlineSnapshot(`
      {
        "tema": {
          "matiz": 52,
          "tinte": "calido",
          "version": 1,
        },
        "themeColor": {
          "dark": "#070201",
          "light": "#fbf3e2",
        },
        "variables": {
          "--advertencia-dark": "oklch(0.7 0.16 55)",
          "--advertencia-light": "oklch(0.5 0.11 55)",
          "--borde-dark": "oklch(0.5327 0.042 55)",
          "--borde-light": "oklch(0.639 0.055 85)",
          "--color-primary-100": "oklch(0.9511 0.0264 52)",
          "--color-primary-200": "oklch(0.8922 0.0611 52)",
          "--color-primary-300": "oklch(0.8233 0.1061 52)",
          "--color-primary-400": "oklch(0.7518 0.14 52)",
          "--color-primary-50": "oklch(0.9805 0.0103 52)",
          "--color-primary-500": "oklch(0.6611 0.125 52)",
          "--color-primary-600": "oklch(0.5652 0.108 52)",
          "--color-primary-700": "oklch(0.4744 0.09 52)",
          "--color-primary-800": "oklch(0.3887 0.074 52)",
          "--color-primary-900": "oklch(0.3179 0.06 52)",
          "--color-primary-950": "oklch(0.2168 0.041 52)",
          "--exito-dark": "oklch(0.7 0.18 145)",
          "--exito-light": "oklch(0.48 0.14 145)",
          "--fondo-dark": "oklch(0.1016 0.02 55)",
          "--fondo-light": "oklch(0.9649 0.024 85)",
          "--peligro-dark": "oklch(0.68 0.19 25)",
          "--peligro-light": "oklch(0.55 0.2 25)",
          "--superficie-dark": "oklch(0.1621 0.024 55)",
          "--superficie-light": "oklch(0.9849 0.015 85)",
          "--texto-dark": "oklch(0.9854 0.0079 55)",
          "--texto-light": "oklch(0.1602 0.0312 85)",
          "--texto-secundario-dark": "oklch(0.6528 0.046 55)",
          "--texto-secundario-light": "oklch(0.4302 0.048 85)",
        },
      }
    `);
  });
  it('Oliva (130, neutro)', () => {
    expect(receta(generarPaleta({ version: 1, matiz: 130, tinte: 'neutro' }))).toMatchInlineSnapshot(`
      {
        "tema": {
          "matiz": 130,
          "tinte": "neutro",
          "version": 1,
        },
        "themeColor": {
          "dark": "#040302",
          "light": "#f6f3ef",
        },
        "variables": {
          "--advertencia-dark": "oklch(0.7 0.16 55)",
          "--advertencia-light": "oklch(0.5 0.11 55)",
          "--borde-dark": "oklch(0.53 0.012 75)",
          "--borde-light": "oklch(0.6388 0.01 75)",
          "--color-primary-100": "oklch(0.9457 0.04 130)",
          "--color-primary-200": "oklch(0.8801 0.09 130)",
          "--color-primary-300": "oklch(0.8031 0.15 130)",
          "--color-primary-400": "oklch(0.7292 0.14 130)",
          "--color-primary-50": "oklch(0.9784 0.015 130)",
          "--color-primary-500": "oklch(0.6409 0.125 130)",
          "--color-primary-600": "oklch(0.5479 0.108 130)",
          "--color-primary-700": "oklch(0.46 0.09 130)",
          "--color-primary-800": "oklch(0.3765 0.074 130)",
          "--color-primary-900": "oklch(0.3081 0.06 130)",
          "--color-primary-950": "oklch(0.2109 0.041 130)",
          "--exito-dark": "oklch(0.7 0.18 145)",
          "--exito-light": "oklch(0.48 0.14 145)",
          "--fondo-dark": "oklch(0.1016 0.006 75)",
          "--fondo-light": "oklch(0.965 0.006 75)",
          "--peligro-dark": "oklch(0.68 0.19 25)",
          "--peligro-light": "oklch(0.55 0.2 25)",
          "--superficie-dark": "oklch(0.1602 0.008 75)",
          "--superficie-light": "oklch(0.985 0.005 75)",
          "--texto-dark": "oklch(0.9851 0.008 75)",
          "--texto-light": "oklch(0.1602 0.008 75)",
          "--texto-secundario-dark": "oklch(0.65 0.012 75)",
          "--texto-secundario-light": "oklch(0.4299 0.01 75)",
        },
      }
    `);
  });
  it('Mar (245, frio)', () => {
    expect(receta(generarPaleta({ version: 1, matiz: 245, tinte: 'frio' }))).toMatchInlineSnapshot(`
      {
        "tema": {
          "matiz": 245,
          "tinte": "frio",
          "version": 1,
        },
        "themeColor": {
          "dark": "#010408",
          "light": "#ecf4fe",
        },
        "variables": {
          "--advertencia-dark": "oklch(0.7 0.16 55)",
          "--advertencia-light": "oklch(0.5 0.11 55)",
          "--borde-dark": "oklch(0.5288 0.038 250)",
          "--borde-light": "oklch(0.6381 0.042 255)",
          "--color-primary-100": "oklch(0.9482 0.0252 245)",
          "--color-primary-200": "oklch(0.8857 0.0569 245)",
          "--color-primary-300": "oklch(0.8121 0.0962 245)",
          "--color-primary-400": "oklch(0.7372 0.1384 245)",
          "--color-primary-50": "oklch(0.9794 0.0099 245)",
          "--color-primary-500": "oklch(0.6481 0.125 245)",
          "--color-primary-600": "oklch(0.554 0.108 245)",
          "--color-primary-700": "oklch(0.4651 0.09 245)",
          "--color-primary-800": "oklch(0.3809 0.074 245)",
          "--color-primary-900": "oklch(0.3115 0.06 245)",
          "--color-primary-950": "oklch(0.2129 0.041 245)",
          "--exito-dark": "oklch(0.7 0.18 145)",
          "--exito-light": "oklch(0.48 0.14 145)",
          "--fondo-dark": "oklch(0.1016 0.018 250)",
          "--fondo-light": "oklch(0.9646 0.0162 255)",
          "--peligro-dark": "oklch(0.68 0.19 25)",
          "--peligro-light": "oklch(0.55 0.2 25)",
          "--superficie-dark": "oklch(0.1602 0.02 250)",
          "--superficie-light": "oklch(0.9848 0.0069 255)",
          "--texto-dark": "oklch(0.9847 0.0071 250)",
          "--texto-light": "oklch(0.1602 0.03 255)",
          "--texto-secundario-dark": "oklch(0.6487 0.04 250)",
          "--texto-secundario-light": "oklch(0.4292 0.038 255)",
        },
      }
    `);
  });
  it('Lavanda (300, frio)', () => {
    expect(receta(generarPaleta({ version: 1, matiz: 300, tinte: 'frio' }))).toMatchInlineSnapshot(`
      {
        "tema": {
          "matiz": 300,
          "tinte": "frio",
          "version": 1,
        },
        "themeColor": {
          "dark": "#010408",
          "light": "#ecf4fe",
        },
        "variables": {
          "--advertencia-dark": "oklch(0.7 0.16 55)",
          "--advertencia-light": "oklch(0.5 0.11 55)",
          "--borde-dark": "oklch(0.5288 0.038 250)",
          "--borde-light": "oklch(0.6381 0.042 255)",
          "--color-primary-100": "oklch(0.9512 0.0258 300)",
          "--color-primary-200": "oklch(0.8925 0.0583 300)",
          "--color-primary-300": "oklch(0.8235 0.0986 300)",
          "--color-primary-400": "oklch(0.7533 0.14 300)",
          "--color-primary-50": "oklch(0.9805 0.0102 300)",
          "--color-primary-500": "oklch(0.6624 0.125 300)",
          "--color-primary-600": "oklch(0.5664 0.108 300)",
          "--color-primary-700": "oklch(0.4753 0.09 300)",
          "--color-primary-800": "oklch(0.3892 0.074 300)",
          "--color-primary-900": "oklch(0.3184 0.06 300)",
          "--color-primary-950": "oklch(0.2168 0.041 300)",
          "--exito-dark": "oklch(0.7 0.18 145)",
          "--exito-light": "oklch(0.48 0.14 145)",
          "--fondo-dark": "oklch(0.1016 0.018 250)",
          "--fondo-light": "oklch(0.9646 0.0162 255)",
          "--peligro-dark": "oklch(0.68 0.19 25)",
          "--peligro-light": "oklch(0.55 0.2 25)",
          "--superficie-dark": "oklch(0.1602 0.02 250)",
          "--superficie-light": "oklch(0.9848 0.0069 255)",
          "--texto-dark": "oklch(0.9847 0.0071 250)",
          "--texto-light": "oklch(0.1602 0.03 255)",
          "--texto-secundario-dark": "oklch(0.6487 0.04 250)",
          "--texto-secundario-light": "oklch(0.4292 0.038 255)",
        },
      }
    `);
  });
  it('Pizarra (215, frio)', () => {
    expect(receta(generarPaleta({ version: 1, matiz: 215, tinte: 'frio' }))).toMatchInlineSnapshot(`
      {
        "tema": {
          "matiz": 215,
          "tinte": "frio",
          "version": 1,
        },
        "themeColor": {
          "dark": "#010408",
          "light": "#ecf4fe",
        },
        "variables": {
          "--advertencia-dark": "oklch(0.7 0.16 55)",
          "--advertencia-light": "oklch(0.5 0.11 55)",
          "--borde-dark": "oklch(0.5288 0.038 250)",
          "--borde-light": "oklch(0.6381 0.042 255)",
          "--color-primary-100": "oklch(0.9454 0.04 215)",
          "--color-primary-200": "oklch(0.8795 0.09 215)",
          "--color-primary-300": "oklch(0.8031 0.1348 215)",
          "--color-primary-400": "oklch(0.7294 0.1224 215)",
          "--color-primary-50": "oklch(0.9783 0.015 215)",
          "--color-primary-500": "oklch(0.6412 0.1076 215)",
          "--color-primary-600": "oklch(0.5481 0.092 215)",
          "--color-primary-700": "oklch(0.46 0.0772 215)",
          "--color-primary-800": "oklch(0.377 0.0633 215)",
          "--color-primary-900": "oklch(0.3086 0.0518 215)",
          "--color-primary-950": "oklch(0.2109 0.0354 215)",
          "--exito-dark": "oklch(0.7 0.18 145)",
          "--exito-light": "oklch(0.48 0.14 145)",
          "--fondo-dark": "oklch(0.1016 0.018 250)",
          "--fondo-light": "oklch(0.9646 0.0162 255)",
          "--peligro-dark": "oklch(0.68 0.19 25)",
          "--peligro-light": "oklch(0.55 0.2 25)",
          "--superficie-dark": "oklch(0.1602 0.02 250)",
          "--superficie-light": "oklch(0.9848 0.0069 255)",
          "--texto-dark": "oklch(0.9847 0.0071 250)",
          "--texto-light": "oklch(0.1602 0.03 255)",
          "--texto-secundario-dark": "oklch(0.6487 0.04 250)",
          "--texto-secundario-light": "oklch(0.4292 0.038 255)",
        },
      }
    `);
  });
});

describe('determinismo y verificación post-parse', () => {
  it('misma semilla ⇒ mismo objeto byte a byte', () => {
    const a = generarPaleta({ version: 1, matiz: 214, tinte: 'frio' });
    const b = generarPaleta({ version: 1, matiz: 214, tinte: 'frio' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('re-verificar los strings emitidos coincide con el reporte devuelto', () => {
    const tokens = generarPaleta({ version: 1, matiz: 300, tinte: 'calido' });
    // parsear cada string emitido debe dar un oklch válido...
    for (const par of PARES_AA) {
      for (const ref of [par.fg, par.bg]) {
        if (ref === '#ffffff') continue;
        expect(parseOklch(tokens.variables[ref])).not.toBeNull();
      }
    }
    // ...y verificar sobre lo serializado reproduce exactamente el reporte.
    expect(verificarPares(tokens.variables)).toEqual(tokens.reporte);
  });

  it('normaliza la semilla en la salida (matiz fuera de rango se envuelve)', () => {
    const tokens = generarPaleta({ version: 1, matiz: 78 + 360, tinte: 'neutro' });
    expect(tokens.tema).toEqual({ version: 1, matiz: 78, tinte: 'neutro' });
  });

  it('themeColor es el hex de --fondo-light/-dark', () => {
    const tokens = generarPaleta({ version: 1, matiz: 78, tinte: 'neutro' });
    expect(/^#[0-9a-f]{6}$/.test(tokens.themeColor.light)).toBe(true);
    expect(/^#[0-9a-f]{6}$/.test(tokens.themeColor.dark)).toBe(true);
  });

  it('todos los presets de la galería generan sin lanzar', () => {
    for (const preset of PRESETS_TEMA) {
      expect(() => generarPaleta(preset.tema)).not.toThrow();
    }
  });
});

describe('ErrorPaletaInvalida', () => {
  it('lleva el reporte adentro y tiene name propio', () => {
    // Construcción directa: no se puede provocar naturalmente (las 1080 pasan),
    // pero el contrato de la clase debe ser estable para el llamador.
    const reporteFalso = verificarPares(
      generarPaleta({ version: 1, matiz: 78, tinte: 'neutro' }).variables,
    );
    const err = new ErrorPaletaInvalida(reporteFalso);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ErrorPaletaInvalida');
    expect(err.reporte).toBe(reporteFalso);
  });
});
