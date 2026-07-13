import { describe, expect, it } from 'vitest';
import { money, type Producto } from '@gestion/core';
import {
  elegibleParaMargenMasivo,
  estaBajoObjetivo,
  margenActualBps,
  margenComparable,
  MULTIPLO_REDONDEO_CENTS_DEFAULT,
  precioSugeridoConMargen,
  precioSugeridoDe,
  razonExclusionMasivo,
  unidadCosto,
} from './margenes';

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

describe('unidadCosto (M2, review Fase 2)', () => {
  it('fraccionado_por_pieza: siempre "kg", sea cual sea el modoPrecio', () => {
    expect(unidadCosto(producto({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg' }))).toBe(
      'kg',
    );
    expect(
      unidadCosto(producto({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_unidad' })),
    ).toBe('kg');
  });

  it('pieza_entera: siempre "kg", sea cual sea el modoPrecio (caso real: salame a precio fijo)', () => {
    expect(unidadCosto(producto({ id: 'p1', modoStock: 'pieza_entera', modoPrecio: 'por_kg' }))).toBe('kg');
    expect(unidadCosto(producto({ id: 'p1', modoStock: 'pieza_entera', modoPrecio: 'por_unidad' }))).toBe('kg');
  });

  it('granel: "kg"', () => {
    expect(unidadCosto(producto({ id: 'p1', modoStock: 'granel' }))).toBe('kg');
  });

  it('unidad_simple: "unidad"', () => {
    expect(unidadCosto(producto({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' }))).toBe(
      'unidad',
    );
  });
});

describe('margenComparable (M2, review Fase 2)', () => {
  it('por pieza + por_kg: comparable (costo y precio ambos por kg)', () => {
    expect(
      margenComparable(producto({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg' })),
    ).toBe(true);
    expect(margenComparable(producto({ id: 'p1', modoStock: 'pieza_entera', modoPrecio: 'por_kg' }))).toBe(
      true,
    );
  });

  it('por pieza + por_unidad: NO comparable (costo por kg, precio por unidad)', () => {
    expect(
      margenComparable(producto({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_unidad' })),
    ).toBe(false);
    expect(margenComparable(producto({ id: 'p1', modoStock: 'pieza_entera', modoPrecio: 'por_unidad' }))).toBe(
      false,
    );
  });

  it('granel y unidad_simple: siempre comparable (sus combinaciones canónicas ya coinciden, doc 02)', () => {
    expect(margenComparable(producto({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg' }))).toBe(true);
    expect(
      margenComparable(producto({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' })),
    ).toBe(true);
  });
});

describe('margenActualBps', () => {
  it('costo $300, precio $500 → 40 % (4000 bps)', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000), precioVentaCents: money(50000) });
    expect(margenActualBps(p)).toBe(4000);
  });

  it('M2: pieza_entera + por_unidad con costo y precio cargados → null (unidades incompatibles, no se calcula)', () => {
    const p = producto({
      id: 'p1',
      modoStock: 'pieza_entera',
      modoPrecio: 'por_unidad',
      costoPromedioCents: money(30000), // $300/kg
      precioVentaCents: money(50000), // $500/unidad — no comparable con lo anterior
    });
    expect(margenActualBps(p)).toBeNull();
  });

  it('M2: pieza_entera + por_kg (el caso ANTERIOR a M2) sigue calculando margen normal', () => {
    const p = producto({
      id: 'p1',
      modoStock: 'pieza_entera',
      modoPrecio: 'por_kg',
      costoPromedioCents: money(30000),
      precioVentaCents: money(50000),
    });
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

  it('M2: false para pieza_entera + por_unidad aunque el "margen" crudo daría bajo objetivo (no hay alerta sin sentido)', () => {
    const p = producto({
      id: 'p1',
      modoStock: 'pieza_entera',
      modoPrecio: 'por_unidad',
      costoPromedioCents: money(30000),
      precioVentaCents: money(40000), // (400-300)/400=25%, "bajo" un objetivo de 40% si se calculara
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

  it('M2: null para pieza_entera + por_unidad, aunque tenga costo y objetivo (no comparable, excluido del masivo)', () => {
    const p = producto({
      id: 'p1',
      modoStock: 'pieza_entera',
      modoPrecio: 'por_unidad',
      costoPromedioCents: money(30000),
      margenObjetivoBps: 4000,
    });
    expect(precioSugeridoDe(p)).toBeNull();
  });
});

describe('precioSugeridoConMargen (WA-H, margen objetivo masivo)', () => {
  it('mismo resultado que precioSugeridoDe con el bps del producto pasado explícito', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000) });
    expect(precioSugeridoConMargen(p, 4000)).toBe(money(50000));
  });

  it('no depende de margenObjetivoBps del producto: funciona aunque el producto no lo tenga cargado', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000) });
    expect(p.margenObjetivoBps).toBeUndefined();
    expect(precioSugeridoConMargen(p, 4000)).toBe(money(50000));
  });

  it('null sin costo cargado', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(0) });
    expect(precioSugeridoConMargen(p, 4000)).toBeNull();
  });

  it('null si margen no comparable (M2)', () => {
    const p = producto({
      id: 'p1',
      modoStock: 'pieza_entera',
      modoPrecio: 'por_unidad',
      costoPromedioCents: money(30000),
    });
    expect(precioSugeridoConMargen(p, 4000)).toBeNull();
  });

  it('null si el margen pasado es >= 100 %', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000) });
    expect(precioSugeridoConMargen(p, 10000)).toBeNull();
  });
});

describe('razonExclusionMasivo / elegibleParaMargenMasivo (WA-H, margen objetivo masivo)', () => {
  it('sin costo cargado: "sin_costo", no elegible', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(0) });
    expect(razonExclusionMasivo(p)).toBe('sin_costo');
    expect(elegibleParaMargenMasivo(p)).toBe(false);
  });

  it('con costo pero margen no comparable (M2): "margen_no_comparable", no elegible', () => {
    const p = producto({
      id: 'p1',
      modoStock: 'pieza_entera',
      modoPrecio: 'por_unidad',
      costoPromedioCents: money(30000),
    });
    expect(razonExclusionMasivo(p)).toBe('margen_no_comparable');
    expect(elegibleParaMargenMasivo(p)).toBe(false);
  });

  it('sin costo Y no comparable a la vez: cuenta como "sin_costo" (categorías disjuntas, precedencia documentada)', () => {
    const p = producto({
      id: 'p1',
      modoStock: 'pieza_entera',
      modoPrecio: 'por_unidad',
      costoPromedioCents: money(0),
    });
    expect(razonExclusionMasivo(p)).toBe('sin_costo');
  });

  it('con costo y margen comparable: null, elegible — no requiere margenObjetivoBps ya cargado', () => {
    const p = producto({ id: 'p1', costoPromedioCents: money(30000) });
    expect(p.margenObjetivoBps).toBeUndefined();
    expect(razonExclusionMasivo(p)).toBeNull();
    expect(elegibleParaMargenMasivo(p)).toBe(true);
  });
});
