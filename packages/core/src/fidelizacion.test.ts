import { describe, it, expect } from 'vitest';
import { clasificarInactividad, type EntradaInactividad } from './fidelizacion.js';
import { money } from './money.js';
import type { StatsCliente } from './tipos.js';

const MS_POR_DIA = 86_400_000;
const AHORA = new Date('2026-07-12T00:00:00Z');
/** Fecha `d` días antes de AHORA. */
const hace = (d: number): Date => new Date(AHORA.getTime() - d * MS_POR_DIA);

describe('clasificarInactividad — sin datos suficientes', () => {
  it('0 compras → no clasifica como inactivo, diasSinVenir 0', () => {
    const stats: EntradaInactividad = { cantidadVentas: 0 };
    expect(clasificarInactividad(stats, AHORA)).toEqual({ inactivo: false, diasSinVenir: 0 });
  });

  it('cantidadVentas > 0 pero sin ultimaCompra → no clasifica', () => {
    const stats: EntradaInactividad = { cantidadVentas: 2 };
    expect(clasificarInactividad(stats, AHORA)).toEqual({ inactivo: false, diasSinVenir: 0 });
  });
});

describe('clasificarInactividad — <3 compras usan umbral global (default 30)', () => {
  it('1 compra hace 40 días → inactivo', () => {
    const stats: EntradaInactividad = { cantidadVentas: 1, ultimaCompra: hace(40) };
    expect(clasificarInactividad(stats, AHORA)).toEqual({ inactivo: true, diasSinVenir: 40 });
  });

  it('1 compra hace 20 días → activo', () => {
    const stats: EntradaInactividad = { cantidadVentas: 1, ultimaCompra: hace(20) };
    expect(clasificarInactividad(stats, AHORA)).toEqual({ inactivo: false, diasSinVenir: 20 });
  });

  it('2 compras: umbral es estricto (>) — exactamente 30 días no es inactivo', () => {
    const stats: EntradaInactividad = { cantidadVentas: 2, ultimaCompra: hace(30) };
    expect(clasificarInactividad(stats, AHORA)).toEqual({ inactivo: false, diasSinVenir: 30 });
  });

  it('2 compras hace 31 días → inactivo', () => {
    const stats: EntradaInactividad = { cantidadVentas: 2, ultimaCompra: hace(31) };
    expect(clasificarInactividad(stats, AHORA)).toEqual({ inactivo: true, diasSinVenir: 31 });
  });
});

describe('clasificarInactividad — ≥3 compras usan ritmo propio', () => {
  it('promedio 20 días (span 40 / 2), factor 2 ⇒ umbral 40; 50 días → inactivo', () => {
    const stats: EntradaInactividad = {
      cantidadVentas: 3,
      primeraCompra: hace(90),
      ultimaCompra: hace(50),
    };
    expect(clasificarInactividad(stats, AHORA)).toEqual({
      inactivo: true,
      diasSinVenir: 50,
      promedioDiasEntreCompras: 20,
    });
  });

  it('mismo ritmo (umbral 40), 30 días → activo', () => {
    const stats: EntradaInactividad = {
      cantidadVentas: 3,
      primeraCompra: hace(70),
      ultimaCompra: hace(30),
    };
    expect(clasificarInactividad(stats, AHORA)).toEqual({
      inactivo: false,
      diasSinVenir: 30,
      promedioDiasEntreCompras: 20,
    });
  });

  it('el umbral por ritmo es estricto (>): diasSinVenir == 2×promedio no es inactivo', () => {
    const stats: EntradaInactividad = {
      cantidadVentas: 3,
      primeraCompra: hace(80),
      ultimaCompra: hace(40),
    };
    // promedio 20, umbral 40, diasSinVenir 40 → 40 > 40 es false
    expect(clasificarInactividad(stats, AHORA)).toEqual({
      inactivo: false,
      diasSinVenir: 40,
      promedioDiasEntreCompras: 20,
    });
  });

  it('divide por (cantidadVentas − 1): 5 compras, span 40 → promedio 10', () => {
    const stats: EntradaInactividad = {
      cantidadVentas: 5,
      primeraCompra: hace(60),
      ultimaCompra: hace(20),
    };
    // promedio 10, umbral 20, diasSinVenir 20 → no inactivo (estricto)
    expect(clasificarInactividad(stats, AHORA)).toEqual({
      inactivo: false,
      diasSinVenir: 20,
      promedioDiasEntreCompras: 10,
    });
  });
});

describe('clasificarInactividad — ritmo 0 cae al umbral global', () => {
  it('≥3 compras todas el mismo día (promedio 0) → clasifica por umbral, reporta promedio 0', () => {
    const mismoDia = hace(40);
    const stats: EntradaInactividad = {
      cantidadVentas: 4,
      primeraCompra: mismoDia,
      ultimaCompra: mismoDia,
    };
    expect(clasificarInactividad(stats, AHORA)).toEqual({
      inactivo: true, // 40 > umbral 30
      diasSinVenir: 40,
      promedioDiasEntreCompras: 0,
    });
  });

  it('mismo día pero dentro del umbral → activo, promedio 0', () => {
    const mismoDia = hace(10);
    const stats: EntradaInactividad = {
      cantidadVentas: 3,
      primeraCompra: mismoDia,
      ultimaCompra: mismoDia,
    };
    expect(clasificarInactividad(stats, AHORA)).toEqual({
      inactivo: false,
      diasSinVenir: 10,
      promedioDiasEntreCompras: 0,
    });
  });

  it('≥3 compras sin primeraCompra → umbral global, sin promedio', () => {
    const stats: EntradaInactividad = { cantidadVentas: 3, ultimaCompra: hace(40) };
    expect(clasificarInactividad(stats, AHORA)).toEqual({ inactivo: true, diasSinVenir: 40 });
  });
});

describe('clasificarInactividad — bordes de fechas y días', () => {
  it('ultimaCompra en el futuro (reloj desfasado) → diasSinVenir 0, activo', () => {
    const stats: EntradaInactividad = { cantidadVentas: 2, ultimaCompra: hace(-5) };
    expect(clasificarInactividad(stats, AHORA)).toEqual({ inactivo: false, diasSinVenir: 0 });
  });

  it('cuenta días completos (floor): 40,9 días → 40', () => {
    const stats: EntradaInactividad = {
      cantidadVentas: 1,
      ultimaCompra: new Date(AHORA.getTime() - 40.9 * MS_POR_DIA),
    };
    const r = clasificarInactividad(stats, AHORA);
    expect(r.diasSinVenir).toBe(40);
  });
});

describe('clasificarInactividad — config y validaciones', () => {
  it('respeta factorInactividad y umbralGlobalDias custom', () => {
    const stats: EntradaInactividad = { cantidadVentas: 2, ultimaCompra: hace(40) };
    expect(clasificarInactividad(stats, AHORA, { umbralGlobalDias: 60 }).inactivo).toBe(false);

    const ritmo: EntradaInactividad = {
      cantidadVentas: 3,
      primeraCompra: hace(70),
      ultimaCompra: hace(30),
    };
    // promedio 20; factor 1 → umbral 20; 30 > 20 → inactivo
    expect(clasificarInactividad(ritmo, AHORA, { factorInactividad: 1 }).inactivo).toBe(true);
  });

  it('lanza RangeError con ahora inválido o config inválida', () => {
    const stats: EntradaInactividad = { cantidadVentas: 1, ultimaCompra: hace(10) };
    expect(() => clasificarInactividad(stats, new Date('no-es-fecha'))).toThrow(RangeError);
    expect(() => clasificarInactividad(stats, AHORA, { factorInactividad: 0 })).toThrow(RangeError);
    expect(() => clasificarInactividad(stats, AHORA, { factorInactividad: -1 })).toThrow(RangeError);
    expect(() => clasificarInactividad(stats, AHORA, { umbralGlobalDias: -1 })).toThrow(RangeError);
  });

  it('el `stats` del modelo Cliente (StatsCliente completo) es aceptado', () => {
    const stats: StatsCliente = {
      cantidadVentas: 3,
      totalHistoricoCents: money(500000),
      primeraCompra: hace(90),
      ultimaCompra: hace(50),
    };
    expect(clasificarInactividad(stats, AHORA).inactivo).toBe(true);
  });
});
