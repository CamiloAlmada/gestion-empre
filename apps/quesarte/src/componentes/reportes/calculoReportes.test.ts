import { describe, expect, it } from 'vitest';
import { money } from '@gestion/core';
import {
  comparacionGanancia,
  etiquetaComparacion,
  etiquetasPeriodo,
  formatearPorcentajeEntero,
  notaCobertura,
  offsetMinutosLocal,
  tituloGanancia,
} from './calculoReportes';

describe('etiquetasPeriodo', () => {
  it('día: hoy/lo que va de hoy, ayer/la misma hora de ayer', () => {
    expect(etiquetasPeriodo('dia')).toEqual({
      actualCerrado: 'hoy',
      actualEnCurso: 'lo que va de hoy',
      anteriorCerrado: 'ayer',
      anteriorTramo: 'la misma hora de ayer',
    });
  });

  it('semana: esta semana/lo que va de la semana, la semana anterior/el mismo tramo', () => {
    expect(etiquetasPeriodo('semana')).toEqual({
      actualCerrado: 'esta semana',
      actualEnCurso: 'lo que va de la semana',
      anteriorCerrado: 'la semana anterior',
      anteriorTramo: 'el mismo tramo de la semana anterior',
    });
  });

  it('mes: este mes/lo que va del mes, el mes anterior/el mismo tramo', () => {
    expect(etiquetasPeriodo('mes')).toEqual({
      actualCerrado: 'este mes',
      actualEnCurso: 'lo que va del mes',
      anteriorCerrado: 'el mes anterior',
      anteriorTramo: 'el mismo tramo del mes anterior',
    });
  });
});

describe('tituloGanancia', () => {
  const etiquetas = etiquetasPeriodo('mes');

  it('cerrado: "Ganancia de este mes"', () => {
    expect(tituloGanancia(etiquetas, false)).toBe('Ganancia de este mes');
  });

  it('en curso: "Ganancia de lo que va del mes" (nunca el título de un mes completo)', () => {
    expect(tituloGanancia(etiquetas, true)).toBe('Ganancia de lo que va del mes');
  });
});

describe('etiquetaComparacion', () => {
  const etiquetas = etiquetasPeriodo('mes');

  it('cerrado: compara contra el período anterior completo', () => {
    expect(etiquetaComparacion(etiquetas, false)).toBe('el mes anterior');
  });

  it('en curso: compara contra el TRAMO equivalente, nunca el período anterior completo', () => {
    expect(etiquetaComparacion(etiquetas, true)).toBe('el mismo tramo del mes anterior');
  });
});

describe('offsetMinutosLocal', () => {
  it('es el negativo de getTimezoneOffset (mismo criterio que Date.getTimezoneOffset invertido)', () => {
    const fecha = new Date('2026-07-24T12:00:00Z');
    expect(offsetMinutosLocal(fecha)).toBe(-fecha.getTimezoneOffset());
  });
});

describe('formatearPorcentajeEntero', () => {
  it('redondea a entero sin decimales', () => {
    expect(formatearPorcentajeEntero(9435)).toBe('94%');
  });

  it('conserva el signo negativo', () => {
    expect(formatearPorcentajeEntero(-823)).toBe('-8%');
  });

  it('100% exacto', () => {
    expect(formatearPorcentajeEntero(10_000)).toBe('100%');
  });

  it('0%', () => {
    expect(formatearPorcentajeEntero(0)).toBe('0%');
  });
});

describe('notaCobertura', () => {
  it('null con cobertura completa (100%)', () => {
    expect(
      notaCobertura({
        lineasConCosto: 10,
        lineasSinCosto: 0,
        totalLineas: 10,
        coberturaBps: 10_000,
        montoSinCostoCents: money(0),
      }),
    ).toBeNull();
  });

  it('null sin líneas (coberturaBps null)', () => {
    expect(
      notaCobertura({
        lineasConCosto: 0,
        lineasSinCosto: 0,
        totalLineas: 0,
        coberturaBps: null,
        montoSinCostoCents: money(0),
      }),
    ).toBeNull();
  });

  it('texto en lenguaje llano cuando la cobertura es menor a 100%', () => {
    expect(
      notaCobertura({
        lineasConCosto: 9,
        lineasSinCosto: 1,
        totalLineas: 10,
        coberturaBps: 9000,
        montoSinCostoCents: money(500),
      }),
    ).toBe('Ganancia calculada sobre el 90% de lo vendido.');
  });
});

describe('comparacionGanancia', () => {
  it('sin-base: no produce ningún número', () => {
    expect(comparacionGanancia({ tipo: 'sin-base' }, 'el mes anterior')).toEqual({ tipo: 'sin-base' });
  });

  it('normal con subida: tendencia subida, texto con signo + y la etiqueta del período anterior', () => {
    expect(comparacionGanancia({ tipo: 'normal', variacionBps: 1200 }, 'el mes anterior')).toEqual({
      tipo: 'normal',
      tendencia: 'subida',
      variacion: '+12% vs. el mes anterior',
    });
  });

  it('normal con bajada: tendencia bajada, sin signo + (el "-" ya viene del número)', () => {
    expect(comparacionGanancia({ tipo: 'normal', variacionBps: -800 }, 'ayer')).toEqual({
      tipo: 'normal',
      tendencia: 'bajada',
      variacion: '-8% vs. ayer',
    });
  });

  it('sin variación (0 bps): tendencia igual', () => {
    expect(comparacionGanancia({ tipo: 'normal', variacionBps: 0 }, 'ayer')).toEqual({
      tipo: 'normal',
      tendencia: 'igual',
      variacion: '0% vs. ayer',
    });
  });

  it('pocos-datos: conserva el tipo (para que TarjetaDelta rotule el dato como parcial)', () => {
    expect(
      comparacionGanancia({ tipo: 'pocos-datos', variacionBps: 500 }, 'la semana anterior'),
    ).toEqual({
      tipo: 'pocos-datos',
      tendencia: 'subida',
      variacion: '+5% vs. la semana anterior',
    });
  });
});
