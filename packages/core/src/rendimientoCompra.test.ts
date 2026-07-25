import { describe, expect, it } from 'vitest';
import { calcularRendimientoCompra } from './rendimientoCompra.js';
import { money } from './money.js';
import { peso } from './peso.js';
import type { Compra, ItemCompra, ItemVenta, Venta } from './tipos.js';

let contadorId = 0;
/** Id incremental, para no repetir string literal en cada fixture. */
function siguienteId(prefijo: string): string {
  contadorId += 1;
  return `${prefijo}-${contadorId}`;
}

const COMPRA_ID = 'compra-1';

/** Ítem de compra por PIEZA (atribución exacta): `piezas` presente. */
function itemPorPieza(over: Partial<ItemCompra> = {}): ItemCompra {
  return {
    productoId: siguienteId('prod'),
    nombreProducto: 'Queso Colonia',
    gramos: peso(10_000),
    piezas: [{ pesoGramos: peso(10_000) }],
    costoFacturaCents: money(50_000),
    gastoProrrateadoCents: money(5_000),
    costoRealCents: money(55_000),
    costoRealKgCents: money(5_500),
    ...over,
  };
}

/** Ítem de compra a GRANEL (sin atribución posible): sin `piezas`, con `gramos`. */
function itemGranel(over: Partial<ItemCompra> = {}): ItemCompra {
  return {
    productoId: siguienteId('prod'),
    nombreProducto: 'Miel a granel',
    gramos: peso(5_000),
    costoFacturaCents: money(20_000),
    gastoProrrateadoCents: money(2_000),
    costoRealCents: money(22_000),
    costoRealKgCents: money(4_400),
    ...over,
  };
}

/** Ítem de compra por UNIDAD (sin atribución posible): sin `piezas`, con `unidades`. */
function itemUnidad(over: Partial<ItemCompra> = {}): ItemCompra {
  return {
    productoId: siguienteId('prod'),
    nombreProducto: 'Frasco de especias',
    unidades: 10,
    costoFacturaCents: money(10_000),
    gastoProrrateadoCents: money(1_000),
    costoRealCents: money(11_000),
    ...over,
  };
}

function compraConfirmada(items: ItemCompra[], over: Partial<Compra> = {}): Compra {
  const totalFacturaCents = money(items.reduce((acc, it) => acc + it.costoFacturaCents, 0));
  const totalGastosCents = money(items.reduce((acc, it) => acc + (it.gastoProrrateadoCents ?? 0), 0));
  const totalRealCents = money(items.reduce((acc, it) => acc + (it.costoRealCents ?? 0), 0));
  return {
    id: COMPRA_ID,
    fecha: new Date(2026, 6, 1),
    usuarioId: 'admin1',
    estado: 'confirmada',
    proveedorId: 'prov-1',
    proveedorNombre: 'Proveedor Colonia',
    items,
    gastos: [{ concepto: 'flete', montoCents: totalGastosCents }],
    totalFacturaCents,
    totalGastosCents,
    totalRealCents,
    ...over,
  };
}

/** Ítem de venta que salió de una PIEZA de `COMPRA_ID`, con costo congelado. */
function itemVentaAtribuida(
  gramos: number,
  costoUnitCents: number,
  precioUnitCents: number,
  over: Partial<ItemVenta> = {},
): ItemVenta {
  const subtotalCents = money(Math.round((precioUnitCents * gramos) / 1000));
  const costoItemCents = money(Math.round((costoUnitCents * gramos) / 1000));
  return {
    productoId: 'prod-pieza',
    nombreProducto: 'Queso Colonia',
    piezaId: 'pieza-1',
    gramos: peso(gramos),
    precioUnitCents: money(precioUnitCents),
    subtotalCents,
    costeo: {
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: money(costoUnitCents),
      costoItemCents,
      compraId: COMPRA_ID,
    },
    ...over,
  };
}

function ventaCon(items: ItemVenta[], over: Partial<Venta> = {}): Venta {
  const totalCents = money(items.reduce((acc, i) => acc + i.subtotalCents, 0));
  return {
    id: siguienteId('venta'),
    numero: 1,
    fecha: new Date(2026, 6, 5),
    usuarioId: 'u1',
    items,
    totalCents,
    medioPago: 'efectivo',
    estado: 'completada',
    ...over,
  };
}

describe('calcularRendimientoCompra - guarda de estado', () => {
  it('lanza RangeError si la compra no está confirmada (borrador)', () => {
    const compra = compraConfirmada([itemPorPieza()], { estado: 'borrador' });
    expect(() => calcularRendimientoCompra(compra, [])).toThrow(RangeError);
  });
});

describe('calcularRendimientoCompra - compra sin ventas todavía', () => {
  it('estado "sin_ventas": costo conocido, ganancia y % vendido en cero, sin leerse como fracaso', () => {
    const compra = compraConfirmada([itemPorPieza()]);

    const rendimiento = calcularRendimientoCompra(compra, []);

    expect(rendimiento.costoTotalCents).toBe(money(55_000));
    expect(rendimiento.costoAtribuibleCents).toBe(money(55_000));
    expect(rendimiento.costoNoAtribuibleCents).toBe(money(0));
    expect(rendimiento.gananciaGeneradaCents).toBe(money(0));
    expect(rendimiento.gramosAtribuiblesComprados).toBe(peso(10_000));
    expect(rendimiento.gramosAtribuiblesVendidos).toBe(peso(0));
    expect(rendimiento.porcentajeVendidoBps).toBe(0);
    expect(rendimiento.estado).toBe('sin_ventas');
  });

  it('ventas de OTRA compra no cuentan (filtro estricto por compraId)', () => {
    const compra = compraConfirmada([itemPorPieza()]);
    const ventaDeOtraCompra = ventaCon([
      itemVentaAtribuida(1_000, 5_500, 10_000, {
        costeo: {
          v: 1,
          fuente: 'pieza',
          origen: 'venta',
          costoUnitCents: money(5_500),
          costoItemCents: money(5_500),
          compraId: 'otra-compra',
        },
      }),
    ]);

    const rendimiento = calcularRendimientoCompra(compra, [ventaDeOtraCompra]);

    expect(rendimiento.gramosAtribuiblesVendidos).toBe(peso(0));
    expect(rendimiento.gananciaGeneradaCents).toBe(money(0));
    expect(rendimiento.estado).toBe('sin_ventas');
  });
});

describe('calcularRendimientoCompra - compra 100% vendida', () => {
  it('estado "agotada": % vendido 100%, ganancia = ingreso total - costo real de lo vendido', () => {
    const compra = compraConfirmada([itemPorPieza()]); // 10.000 g a costo real $5.500/kg
    const venta = ventaCon([itemVentaAtribuida(10_000, 5_500, 10_000)]); // vendido a $10.000/kg

    const rendimiento = calcularRendimientoCompra(compra, [venta]);

    expect(rendimiento.gramosAtribuiblesVendidos).toBe(peso(10_000));
    expect(rendimiento.porcentajeVendidoBps).toBe(10_000); // 100%
    expect(rendimiento.estado).toBe('agotada');
    // Ingreso 10kg × $10.000 = $100.000; costo 10kg × $5.500 = $55.000 ⇒ ganancia $45.000.
    expect(rendimiento.gananciaGeneradaCents).toBe(money(45_000));
  });

  it('las ventas anuladas no cuentan (filtro ya existe en core, reutilizado vía ventasVigentes)', () => {
    const compra = compraConfirmada([itemPorPieza()]);
    const ventaAnulada = ventaCon([itemVentaAtribuida(10_000, 5_500, 10_000)], { estado: 'anulada' });

    const rendimiento = calcularRendimientoCompra(compra, [ventaAnulada]);

    expect(rendimiento.gramosAtribuiblesVendidos).toBe(peso(0));
    expect(rendimiento.gananciaGeneradaCents).toBe(money(0));
    expect(rendimiento.estado).toBe('sin_ventas');
  });
});

describe('calcularRendimientoCompra - compra parcialmente vendida', () => {
  it('estado "en_curso": entre 0% y 100%, ganancia solo de lo efectivamente vendido', () => {
    const compra = compraConfirmada([itemPorPieza()]); // 10.000 g
    const venta = ventaCon([itemVentaAtribuida(4_000, 5_500, 10_000)]); // vendió 4kg de 10kg

    const rendimiento = calcularRendimientoCompra(compra, [venta]);

    expect(rendimiento.gramosAtribuiblesVendidos).toBe(peso(4_000));
    expect(rendimiento.porcentajeVendidoBps).toBe(4_000); // 40%
    expect(rendimiento.estado).toBe('en_curso');
    // 4kg × $10.000 = $40.000; costo 4kg × $5.500 = $22.000 ⇒ ganancia $18.000.
    expect(rendimiento.gananciaGeneradaCents).toBe(money(18_000));
  });
});

describe('calcularRendimientoCompra - compra solo de granel/unidad (atribución nula)', () => {
  it('estado "sin_atribucion": % vendido null, costo va entero a costoNoAtribuibleCents', () => {
    const compra = compraConfirmada([itemGranel(), itemUnidad()]);

    const rendimiento = calcularRendimientoCompra(compra, []);

    expect(rendimiento.costoAtribuibleCents).toBe(money(0));
    expect(rendimiento.costoNoAtribuibleCents).toBe(money(22_000 + 11_000));
    expect(rendimiento.costoTotalCents).toBe(money(22_000 + 11_000));
    expect(rendimiento.gramosAtribuiblesComprados).toBe(peso(0));
    expect(rendimiento.porcentajeVendidoBps).toBeNull();
    expect(rendimiento.gananciaGeneradaCents).toBe(money(0));
    expect(rendimiento.estado).toBe('sin_atribucion');
  });

  it('con ventas de OTRAS compras del mismo producto granel, sigue sin atribución (nunca se mezcla en silencio)', () => {
    const compra = compraConfirmada([itemGranel({ productoId: 'miel' })]);
    // Una venta de "miel" con costeo por PROMEDIO (fuente granel/unidad):
    // `congelarCosteo` nunca le pone `compraId`, así que esta línea jamás
    // puede atribuirse a `COMPRA_ID` aunque el producto coincida.
    const ventaGranelDeCualquierCompra = ventaCon([
      {
        productoId: 'miel',
        nombreProducto: 'Miel a granel',
        gramos: peso(500),
        precioUnitCents: money(8_000),
        subtotalCents: money(4_000),
        costeo: {
          v: 1,
          fuente: 'promedio',
          origen: 'venta',
          costoUnitCents: money(4_400),
          costoItemCents: money(2_200),
        },
      },
    ]);

    const rendimiento = calcularRendimientoCompra(compra, [ventaGranelDeCualquierCompra]);

    expect(rendimiento.gananciaGeneradaCents).toBe(money(0));
    expect(rendimiento.porcentajeVendidoBps).toBeNull();
    expect(rendimiento.estado).toBe('sin_atribucion');
  });
});

describe('calcularRendimientoCompra - compra mixta (pieza + granel)', () => {
  it('separa costo atribuible de no atribuible, y la ganancia solo cubre la porción por pieza', () => {
    const compra = compraConfirmada([itemPorPieza(), itemGranel()]);
    const venta = ventaCon([itemVentaAtribuida(5_000, 5_500, 10_000)]); // vendió 5kg de los 10kg por pieza

    const rendimiento = calcularRendimientoCompra(compra, [venta]);

    expect(rendimiento.costoAtribuibleCents).toBe(money(55_000));
    expect(rendimiento.costoNoAtribuibleCents).toBe(money(22_000));
    expect(rendimiento.costoTotalCents).toBe(money(55_000 + 22_000));
    expect(rendimiento.porcentajeVendidoBps).toBe(5_000); // 50% de la porción atribuible
    expect(rendimiento.gananciaGeneradaCents).toBe(money(22_500)); // 5kg × ($10.000 − $5.500)
    expect(rendimiento.estado).toBe('en_curso');
  });
});
