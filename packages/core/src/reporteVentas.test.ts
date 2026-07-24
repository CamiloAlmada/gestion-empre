import { describe, it, expect } from 'vitest';
import {
  resumenPeriodo,
  rankingPorProducto,
  rankingPorCategoria,
  type ItemRanking,
} from './reporteVentas.js';
import { money } from './money.js';
import type { CosteoItem, ItemVenta, Venta } from './tipos.js';

let contadorId = 0;
/** Id incremental, para no repetir string literal en cada fixture. */
function siguienteId(prefijo: string): string {
  contadorId += 1;
  return `${prefijo}-${contadorId}`;
}

const COSTEO_SIN_DATO: CosteoItem = { v: 1, fuente: 'sin_costo', origen: 'venta' };

function itemConCosto(subtotal: number, costo: number, extra: Partial<ItemVenta> = {}): ItemVenta {
  return {
    productoId: siguienteId('prod'),
    nombreProducto: 'Producto',
    unidades: 1,
    precioUnitCents: money(subtotal),
    subtotalCents: money(subtotal),
    costeo: { v: 1, fuente: 'promedio', origen: 'venta', costoUnitCents: money(costo), costoItemCents: money(costo) },
    ...extra,
  };
}

function itemSinCosto(subtotal: number, extra: Partial<ItemVenta> = {}): ItemVenta {
  return {
    productoId: siguienteId('prod'),
    nombreProducto: 'Producto',
    unidades: 1,
    precioUnitCents: money(subtotal),
    subtotalCents: money(subtotal),
    costeo: COSTEO_SIN_DATO,
    ...extra,
  };
}

/** Ítem "legado": nunca tuvo el mapa `costeo` (versión anterior al congelado, A1). */
function itemLegado(subtotal: number, extra: Partial<ItemVenta> = {}): ItemVenta {
  return {
    productoId: siguienteId('prod'),
    nombreProducto: 'Producto',
    unidades: 1,
    precioUnitCents: money(subtotal),
    subtotalCents: money(subtotal),
    ...extra,
  };
}

function venta(items: ItemVenta[], overrides: Partial<Venta> = {}): Venta {
  const total = items.reduce((acc, i) => acc + i.subtotalCents, 0);
  return {
    id: siguienteId('venta'),
    numero: contadorId,
    fecha: new Date('2026-07-24T12:00:00Z'),
    usuarioId: 'u1',
    items,
    totalCents: money(total),
    medioPago: 'efectivo',
    estado: 'completada',
    ...overrides,
  };
}

describe('resumenPeriodo — período vacío', () => {
  it('sin ventas → resumen en cero, cobertura sin datos (no 0% ni 100%)', () => {
    const r = resumenPeriodo([]);
    expect(r).toEqual({
      totalVendidoCents: money(0),
      gananciaBrutaCents: money(0),
      cantidadVentas: 0,
      cobertura: {
        lineasConCosto: 0,
        lineasSinCosto: 0,
        totalLineas: 0,
        coberturaBps: null,
        montoSinCostoCents: money(0),
      },
    });
  });
});

describe('resumenPeriodo — ventas anuladas', () => {
  it('una venta anulada NO entra en ningún agregado', () => {
    const buena = venta([itemConCosto(10_000, 6_000)]); // ganancia 4000
    const anulada = venta([itemConCosto(50_000, 10_000)], { estado: 'anulada' });

    const r = resumenPeriodo([buena, anulada]);

    expect(r.cantidadVentas).toBe(1);
    expect(r.totalVendidoCents).toBe(money(10_000));
    expect(r.gananciaBrutaCents).toBe(money(4_000));
    expect(r.cobertura.totalLineas).toBe(1); // la línea de la anulada no cuenta ni siquiera en cobertura
  });
});

describe('resumenPeriodo — líneas sin costo conocido', () => {
  it('una línea sin costo no suma 0 a la ganancia: queda aparte en la cobertura', () => {
    const v = venta([itemConCosto(10_000, 4_000), itemSinCosto(5_000)]);
    const r = resumenPeriodo([v]);

    // Ganancia = SOLO la línea con costo (10000 - 4000 = 6000), la otra se excluye del cálculo.
    expect(r.gananciaBrutaCents).toBe(money(6_000));
    expect(r.totalVendidoCents).toBe(money(15_000));
    expect(r.cobertura).toEqual({
      lineasConCosto: 1,
      lineasSinCosto: 1,
      totalLineas: 2,
      coberturaBps: 5_000, // 50%
      montoSinCostoCents: money(5_000),
    });
  });

  it('líneas legadas (sin mapa `costeo`) cuentan igual que `sin_dato`', () => {
    const v = venta([itemConCosto(10_000, 4_000), itemLegado(3_000)]);
    const r = resumenPeriodo([v]);

    expect(r.gananciaBrutaCents).toBe(money(6_000));
    expect(r.cobertura.lineasSinCosto).toBe(1);
    expect(r.cobertura.montoSinCostoCents).toBe(money(3_000));
  });

  it('cobertura de costo 0%: ninguna línea tiene costo conocido', () => {
    const v = venta([itemSinCosto(4_000), itemSinCosto(6_000)]);
    const r = resumenPeriodo([v]);

    expect(r.gananciaBrutaCents).toBe(money(0));
    expect(r.cobertura.coberturaBps).toBe(0); // 0%, no null: SÍ hay líneas, todas sin costo
    expect(r.cobertura.montoSinCostoCents).toBe(money(10_000));
  });
});

describe('ranking — ordena por ganancia aportada, no por facturación', () => {
  it('un producto que vende mucho con poco margen queda por debajo de uno que vende poco con mucho margen', () => {
    // Producto A: factura 10.000, casi sin margen (ganancia 100).
    const productoA = itemConCosto(10_000, 9_900);
    // Producto B: factura apenas 500, pero con mucho margen (ganancia 400).
    const productoB = itemConCosto(500, 100);

    const ranking = rankingPorProducto([venta([productoA, productoB])]);

    expect(ranking).toHaveLength(2);
    expect(ranking[0]!.clave).toBe(productoB.productoId);
    expect(ranking[0]!.gananciaCents).toBe(money(400));
    expect(ranking[1]!.clave).toBe(productoA.productoId);
    expect(ranking[1]!.gananciaCents).toBe(money(100));
    // La facturación confirma que el orden NO siguió este criterio.
    expect(ranking[0]!.facturacionCents).toBeLessThan(ranking[1]!.facturacionCents);
  });

  it('excluye ventas anuladas del ranking', () => {
    const item = itemConCosto(10_000, 5_000);
    const ranking = rankingPorProducto([venta([item], { estado: 'anulada' })]);
    expect(ranking).toEqual<ItemRanking[]>([]);
  });

  it('acumula varias líneas del mismo producto en distintas ventas', () => {
    const idCompartido = 'prod-fijo';
    const v1 = venta([itemConCosto(1_000, 600, { productoId: idCompartido })]); // ganancia 400
    const v2 = venta([itemConCosto(2_000, 1_000, { productoId: idCompartido })]); // ganancia 1000
    const ranking = rankingPorProducto([v1, v2]);

    expect(ranking).toHaveLength(1);
    expect(ranking[0]!.gananciaCents).toBe(money(1_400));
    expect(ranking[0]!.facturacionCents).toBe(money(3_000));
  });

  it('cuenta las líneas sin costo del producto, para que la pantalla pueda rotular el dato como parcial', () => {
    const idCompartido = 'prod-parcial';
    const v = venta([
      itemConCosto(1_000, 600, { productoId: idCompartido }),
      itemSinCosto(500, { productoId: idCompartido }),
    ]);
    const ranking = rankingPorProducto([v]);
    expect(ranking[0]!.lineasSinCosto).toBe(1);
  });
});

describe('rankingPorCategoria', () => {
  it('agrupa por categoría resuelta a partir del productoId', () => {
    const quesos = itemConCosto(1_000, 500, { productoId: 'p-queso' }); // ganancia 500
    const miel = itemConCosto(3_000, 500, { productoId: 'p-miel' }); // ganancia 2500
    const categoriaDe = (productoId: string): string | undefined =>
      ({ 'p-queso': 'Quesos', 'p-miel': 'Miel' })[productoId];

    const ranking = rankingPorCategoria([venta([quesos, miel])], categoriaDe);

    expect(ranking).toHaveLength(2);
    expect(ranking[0]!.clave).toBe('Miel');
    expect(ranking[0]!.gananciaCents).toBe(money(2_500));
    expect(ranking[1]!.clave).toBe('Quesos');
  });

  it('producto no resoluble cae en el bucket rotulado "Sin categoría", no desaparece', () => {
    const item = itemConCosto(1_000, 500, { productoId: 'p-fantasma' });
    const ranking = rankingPorCategoria([venta([item])], () => undefined);

    expect(ranking).toEqual<ItemRanking[]>([
      {
        clave: 'Sin categoría',
        etiqueta: 'Sin categoría',
        facturacionCents: money(1_000),
        gananciaCents: money(500),
        lineasSinCosto: 0,
      },
    ]);
  });
});
