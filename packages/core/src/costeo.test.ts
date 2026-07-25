import { describe, expect, it } from 'vitest';
import { money } from './money.js';
import { peso } from './peso.js';
import { calcularSubtotal } from './precio.js';
import {
  VERSION_COSTEO,
  clasificarCosteo,
  congelarCosteo,
  costoCongeladoDe,
  type ConCosteo,
} from './costeo.js';
import type { CosteoItem } from './tipos.js';

describe('congelarCosteo — fuente pieza', () => {
  it('congela costoKgCents, el costo del ítem y la compra de origen', () => {
    const costeo = congelarCosteo({
      pieza: { costoKgCents: money(30000), compraId: 'compra-7' },
      magnitud: { medida: 'peso', gramos: peso(350) },
    });

    expect(costeo).toEqual({
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: 30000,
      // 30000 * 350 / 1000 = 10500 exacto
      costoItemCents: 10500,
      compraId: 'compra-7',
    });
  });

  it('sin compraId (pieza de ingreso manual) congela el costo y omite la procedencia', () => {
    const costeo = congelarCosteo({
      pieza: { costoKgCents: money(30000) },
      magnitud: { medida: 'peso', gramos: peso(1000) },
    });

    expect(costeo.fuente).toBe('pieza');
    expect(costeo.costoItemCents).toBe(30000);
    expect(costeo).not.toHaveProperty('compraId');
  });

  it('pieza sin costo (costoKgCents 0) queda sin_costo y NO cae al promedio del producto', () => {
    const costeo = congelarCosteo({
      pieza: { costoKgCents: money(0), compraId: 'compra-7' },
      costoPromedioCents: money(45000),
      magnitud: { medida: 'peso', gramos: peso(350) },
    });

    expect(costeo).toEqual({ v: 1, fuente: 'sin_costo', origen: 'venta' });
    expect(costeo).not.toHaveProperty('costoUnitCents');
    expect(costeo).not.toHaveProperty('costoItemCents');
    expect(costeo).not.toHaveProperty('compraId');
  });

  it('la pieza tiene prioridad sobre el costo promedio del producto', () => {
    const costeo = congelarCosteo({
      pieza: { costoKgCents: money(30000) },
      costoPromedioCents: money(45000),
      magnitud: { medida: 'peso', gramos: peso(1000) },
    });

    expect(costeo.fuente).toBe('pieza');
    expect(costeo.costoUnitCents).toBe(30000);
  });
});

describe('congelarCosteo — fuente promedio', () => {
  it('granel: congela costoPromedioCents por kg y el costo del ítem', () => {
    const costeo = congelarCosteo({
      costoPromedioCents: money(45000),
      magnitud: { medida: 'peso', gramos: peso(250) },
    });

    expect(costeo).toEqual({
      v: 1,
      fuente: 'promedio',
      origen: 'venta',
      costoUnitCents: 45000,
      costoItemCents: 11250,
    });
  });

  it('unidad: costo por unidad multiplicado por la cantidad (entero exacto)', () => {
    const costeo = congelarCosteo({
      costoPromedioCents: money(12500),
      magnitud: { medida: 'unidades', unidades: 3 },
    });

    expect(costeo).toEqual({
      v: 1,
      fuente: 'promedio',
      origen: 'venta',
      costoUnitCents: 12500,
      costoItemCents: 37500,
    });
  });

  it('rechaza unidades no enteras (misma validación que el subtotal)', () => {
    expect(() =>
      congelarCosteo({
        costoPromedioCents: money(12500),
        magnitud: { medida: 'unidades', unidades: 1.5 },
      }),
    ).toThrow(RangeError);
  });
});

describe('congelarCosteo — honestidad del dato (sin_costo)', () => {
  it('costo promedio 0 (producto nunca comprado) NO congela montos', () => {
    const costeo = congelarCosteo({
      costoPromedioCents: money(0),
      magnitud: { medida: 'peso', gramos: peso(250) },
    });

    expect(costeo).toEqual({ v: 1, fuente: 'sin_costo', origen: 'venta' });
  });

  it('costo promedio ausente NO congela montos', () => {
    const costeo = congelarCosteo({ magnitud: { medida: 'unidades', unidades: 2 } });

    expect(costeo).toEqual({ v: 1, fuente: 'sin_costo', origen: 'venta' });
  });

  it('costo negativo (dato corrupto) tampoco se congela', () => {
    const costeo = congelarCosteo({
      costoPromedioCents: money(-100),
      magnitud: { medida: 'peso', gramos: peso(250) },
    });

    expect(costeo.fuente).toBe('sin_costo');
  });

  it('sin_costo conserva el origen recibido (el backfill también declara sin costo)', () => {
    const costeo = congelarCosteo({
      costoPromedioCents: money(0),
      magnitud: { medida: 'peso', gramos: peso(250) },
      origen: 'backfill',
    });

    expect(costeo).toEqual({ v: 1, fuente: 'sin_costo', origen: 'backfill' });
  });
});

describe('congelarCosteo — redondeo idéntico al del subtotal', () => {
  // El costo del ítem NO puede tener una regla de redondeo propia: sale de la
  // MISMA función que produce `subtotalCents`.
  const casos: readonly (readonly [number, number])[] = [
    [89900, 333], // 29936,7 → 29937 (half-up sube)
    [45000, 111], // 4995 exacto
    [30000, 5], // 150 exacto
    [12345, 77], // 950,565 → 951
    [10001, 5], // 50,005 → 50
    [10003, 5], // 50,015 → 50 (el .5 real cae por el flotante; misma verdad que el precio)
    [1, 1], // 0,001 → 0
  ];

  it.each(casos)('costoUnit %i × %i g da el mismo entero que calcularSubtotal', (unit, gramosVal) => {
    const costeo = congelarCosteo({
      costoPromedioCents: money(unit),
      magnitud: { medida: 'peso', gramos: peso(gramosVal) },
    });
    const subtotalEquivalente = calcularSubtotal({
      modoPrecio: 'por_kg',
      precioKgCents: money(unit),
      gramos: peso(gramosVal),
    });

    expect(costeo.costoItemCents).toBe(subtotalEquivalente);
  });

  it('caso concreto: 899 $/kg por 333 g cuesta 299,37 (half-up, no truncado)', () => {
    const costeo = congelarCosteo({
      pieza: { costoKgCents: money(89900) },
      magnitud: { medida: 'peso', gramos: peso(333) },
    });

    // 89900 · 333 / 1000 = 29936,7 → 29937 (truncar daría 29936).
    expect(costeo.costoItemCents).toBe(29937);
  });

  it('el costo del ítem siempre es un entero de centésimos', () => {
    for (let gramosVal = 1; gramosVal <= 400; gramosVal += 7) {
      const costeo = congelarCosteo({
        costoPromedioCents: money(45733),
        magnitud: { medida: 'peso', gramos: peso(gramosVal) },
      });
      expect(Number.isInteger(costeo.costoItemCents)).toBe(true);
    }
  });
});

describe('clasificarCosteo', () => {
  const real: CosteoItem = {
    v: 1,
    fuente: 'pieza',
    origen: 'venta',
    costoUnitCents: money(30000),
    costoItemCents: money(10500),
  };

  it("línea sin mapa costeo (formato viejo) es 'legado'", () => {
    expect(clasificarCosteo({})).toBe('legado');
    expect(clasificarCosteo({ costeo: undefined })).toBe('legado');
  });

  it("costo congelado por la venta es 'real'", () => {
    expect(clasificarCosteo({ costeo: real })).toBe('real');
    expect(clasificarCosteo({ costeo: { ...real, fuente: 'promedio' } })).toBe('real');
  });

  it("costo reconstruido por el backfill es 'estimado', aunque venga de la pieza", () => {
    expect(clasificarCosteo({ costeo: { ...real, origen: 'backfill' } })).toBe('estimado');
  });

  it("costeo sin montos es 'sin_dato', con cualquier origen", () => {
    const sinCosto: CosteoItem = { v: 1, fuente: 'sin_costo', origen: 'venta' };
    expect(clasificarCosteo({ costeo: sinCosto })).toBe('sin_dato');
    expect(clasificarCosteo({ costeo: { ...sinCosto, origen: 'backfill' } })).toBe('sin_dato');
  });

  it("un mapa de versión futura se trata como 'legado' (no se inventa un monto)", () => {
    const futuro = { ...real, v: 2 } as unknown as CosteoItem;
    expect(clasificarCosteo({ costeo: futuro })).toBe('legado');
  });

  it('clasifica lo que produce congelarCosteo en cada modo', () => {
    const porPieza: ConCosteo = {
      costeo: congelarCosteo({
        pieza: { costoKgCents: money(30000), compraId: 'c1' },
        magnitud: { medida: 'peso', gramos: peso(350) },
      }),
    };
    const porPromedio: ConCosteo = {
      costeo: congelarCosteo({
        costoPromedioCents: money(45000),
        magnitud: { medida: 'unidades', unidades: 2 },
      }),
    };
    const sinBase: ConCosteo = {
      costeo: congelarCosteo({ magnitud: { medida: 'unidades', unidades: 2 } }),
    };

    expect(clasificarCosteo(porPieza)).toBe('real');
    expect(clasificarCosteo(porPromedio)).toBe('real');
    expect(clasificarCosteo(sinBase)).toBe('sin_dato');
  });
});

describe('costoCongeladoDe', () => {
  it('devuelve el costo total congelado cuando lo hay', () => {
    const linea: ConCosteo = {
      costeo: congelarCosteo({
        pieza: { costoKgCents: money(30000) },
        magnitud: { medida: 'peso', gramos: peso(350) },
      }),
    };
    expect(costoCongeladoDe(linea)).toBe(10500);
  });

  it('devuelve null (no 0) sin costo y en formato viejo', () => {
    expect(costoCongeladoDe({})).toBeNull();
    expect(
      costoCongeladoDe({ costeo: { v: 1, fuente: 'sin_costo', origen: 'venta' } }),
    ).toBeNull();
  });

  it('devuelve el costo reconstruido por backfill (quien agrega decide con clasificarCosteo)', () => {
    expect(
      costoCongeladoDe({
        costeo: {
          v: 1,
          fuente: 'promedio',
          origen: 'backfill',
          costoUnitCents: money(1000),
          costoItemCents: money(2000),
        },
      }),
    ).toBe(2000);
  });
});

describe('VERSION_COSTEO', () => {
  it('la build actual escribe la versión 1 (la ausencia del mapa es la versión 0)', () => {
    expect(VERSION_COSTEO).toBe(1);
    expect(congelarCosteo({ magnitud: { medida: 'unidades', unidades: 1 } }).v).toBe(1);
  });
});
