import { describe, expect, it } from 'vitest';
import { money, type Producto } from '@gestion/core';
import { estaBajoObjetivo, margenActualBps, MULTIPLO_REDONDEO_CENTS_DEFAULT, precioSugeridoDe } from './margenes';

function producto(over: Partial<Producto> & Pick<Producto, 'id'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'Categoría',
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(0),
    costoPromedioCents: money(0),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

describe('margenActualBps', () => {
  it('costo $300, precio $500 → 40 % (4000 bps)', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000), precioVentaCents: money(50000) });
    expect(margenActualBps(p)).toBe(4000);
  });

  it('sin costo cargado (0): null, no 100 % (evita la división basura del doc 03)', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(0), precioVentaCents: money(50000) });
    expect(margenActualBps(p)).toBeNull();
  });

  it('precio 0: null (delegado de margenDesdePrecio de core)', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000), precioVentaCents: money(0) });
    expect(margenActualBps(p)).toBeNull();
  });

  it('venta bajo costo: margen negativo', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(50000), precioVentaCents: money(40000) });
    expect(margenActualBps(p)).toBe(-2500);
  });
});

describe('estaBajoObjetivo', () => {
  it('true cuando el margen actual quedó por debajo del objetivo', () => {
    const p = producto({
      id: 'p1',
      costoPromedioCents: money(30000),
      precioVentaCents: money(40000), // margen (400-300)/400 = 25 %
      margenObjetivoBps: 4000, // objetivo 40 %
    });
    expect(estaBajoObjetivo(p)).toBe(true);
  });

  it('false cuando el margen actual alcanza o supera el objetivo', () => {
    const p = producto({
      id: 'p1',
      costoPromedioCents: money(30000),
      precioVentaCents: money(50000), // margen 40 %
      margenObjetivoBps: 4000,
    });
    expect(estaBajoObjetivo(p)).toBe(false);
  });

  it('false sin objetivo definido (nada que comparar)', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000), precioVentaCents: money(40000) });
    expect(estaBajoObjetivo(p)).toBe(false);
  });

  it('false sin costo cargado, aunque tenga objetivo (el margen actual es null)', () => {
    const p = producto({
      id: 'p1',
      costoPromedioCents: money(0),
      precioVentaCents: money(40000),
      margenObjetivoBps: 4000,
    });
    expect(estaBajoObjetivo(p)).toBe(false);
  });
});

describe('precioSugeridoDe', () => {
  it('costo $300, objetivo 40 %, redondeo $5 default: precio sugerido y margen efectivo (doc 03: se recalcula desde el precio YA redondeado)', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000), margenObjetivoBps: 4000 });
    const sugerido = precioSugeridoDe(p);
    // precioDesdeMargen(30000, 4000) = 50000 exacto → redondeo $5 no lo mueve.
    expect(sugerido).toBe(money(50000));
    expect(MULTIPLO_REDONDEO_CENTS_DEFAULT).toBe(500);
  });

  it('el redondeo comercial corre el margen efectivo del objetivo en precios chicos (comportamiento esperado, doc 03)', () => {
    // costo $100, objetivo 25 % → precioDesdeMargen = 100/0.75 = 133,33 → 13333.
    // redondeo a $5 (multiplo 500) → 13500 → margen efectivo (135-100)/135 = 25.93 %, no 25.00 %.
    const p = producto({ id: 'p1', costoPromedioCents: money(10000), margenObjetivoBps: 2500 });
    const sugerido = precioSugeridoDe(p);
    expect(sugerido).toBe(money(13500));
    expect(margenActualBps({ ...p, precioVentaCents: sugerido! })).toBe(2593);
  });

  it('null sin costo cargado', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(0), margenObjetivoBps: 4000 });
    expect(precioSugeridoDe(p)).toBeNull();
  });

  it('null sin margen objetivo definido', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000) });
    expect(precioSugeridoDe(p)).toBeNull();
  });

  it('null si el margen objetivo cargado es >= 100 % (rango inválido, tolerado sin romper la pantalla)', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000), margenObjetivoBps: 10000 });
    expect(precioSugeridoDe(p)).toBeNull();
  });

  it('acepta un multiplo de redondeo distinto del default', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000), margenObjetivoBps: 4000 });
    expect(precioSugeridoDe(p, 1000)).toBe(money(50000));
  });
});
