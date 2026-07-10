import { describe, expect, it } from 'vitest';
import { money, peso, prorratearGastos, type Producto } from '@gestion/core';
import {
  aItemBorrador,
  calcularEfectosProducto,
  calcularItemsProrrateados,
  itemCompraAForm,
  itemVacio,
  modoStockDeItem,
  sumaPiezas,
  textoCantidadItem,
  totalesActuales,
  type ItemCompraForm,
} from './resumenCompra';

function productoDe(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    precioVentaCents: money(0),
    costoPromedioCents: money(0),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

describe('itemVacio / aItemBorrador', () => {
  it('itemVacio arranca en costoFacturaCents 0, sin cantidad', () => {
    const item = itemVacio('p1', 'Queso', 'granel');
    expect(item).toEqual({ productoId: 'p1', nombreProducto: 'Queso', modoStock: 'granel', costoFacturaCents: 0 });
  });

  it('aItemBorrador descarta modoStock', () => {
    const item: ItemCompraForm = {
      productoId: 'p1',
      nombreProducto: 'Queso',
      modoStock: 'granel',
      gramos: peso(1000),
      costoFacturaCents: money(50000),
    };
    expect(aItemBorrador(item)).toEqual({
      productoId: 'p1',
      nombreProducto: 'Queso',
      gramos: peso(1000),
      unidades: undefined,
      piezas: undefined,
      costoFacturaCents: money(50000),
    });
  });
});

describe('sumaPiezas', () => {
  it('suma los pesos declarados', () => {
    expect(sumaPiezas([{ pesoGramos: peso(1000) }, { pesoGramos: peso(2500) }])).toBe(3500);
  });

  it('lista vacía da 0', () => {
    expect(sumaPiezas([])).toBe(0);
  });
});

describe('totalesActuales', () => {
  it('suma factura y gastos, y el total real es la suma de ambos', () => {
    const items: ItemCompraForm[] = [
      { productoId: 'p1', nombreProducto: 'A', modoStock: 'granel', costoFacturaCents: money(10000) },
      { productoId: 'p2', nombreProducto: 'B', modoStock: 'unidad_simple', costoFacturaCents: money(5000) },
    ];
    const totales = totalesActuales(items, [{ concepto: 'combustible', montoCents: money(2000) }]);
    expect(totales).toEqual({
      totalFacturaCents: money(15000),
      totalGastosCents: money(2000),
      totalRealCents: money(17000),
    });
  });
});

describe('calcularItemsProrrateados', () => {
  it('coincide con prorratearGastos de core + calcularCostoRealCents/Kg', () => {
    const items: ItemCompraForm[] = [
      { productoId: 'p1', nombreProducto: 'Queso', modoStock: 'granel', gramos: peso(1000), costoFacturaCents: money(10000) },
      { productoId: 'p2', nombreProducto: 'Miel', modoStock: 'unidad_simple', unidades: 5, costoFacturaCents: money(5000) },
    ];
    const resultado = calcularItemsProrrateados(items, money(3000), 'por_valor');

    const esperado = prorratearGastos(
      items.map((it) => ({ costoFacturaCents: it.costoFacturaCents, gramos: it.gramos })),
      money(3000),
      'por_valor',
    );
    expect(resultado[0]!.gastoProrrateadoCents).toBe(esperado[0]!.gastoProrrateadoCents);
    expect(resultado[1]!.gastoProrrateadoCents).toBe(esperado[1]!.gastoProrrateadoCents);

    // costoRealCents = costoFactura + prorrateo
    expect(resultado[0]!.costoRealCents).toBe(resultado[0]!.costoFacturaCents + resultado[0]!.gastoProrrateadoCents);
    // costoRealKgCents solo para ítems al peso
    expect(resultado[0]!.costoRealKgCents).not.toBeNull();
    expect(resultado[1]!.costoRealKgCents).toBeNull();
  });

  it('la suma de gastoProrrateadoCents cierra exacto contra el total (invariante de core)', () => {
    const items: ItemCompraForm[] = [
      { productoId: 'p1', nombreProducto: 'A', modoStock: 'granel', gramos: peso(333), costoFacturaCents: money(999) },
      { productoId: 'p2', nombreProducto: 'B', modoStock: 'granel', gramos: peso(667), costoFacturaCents: money(1001) },
    ];
    const resultado = calcularItemsProrrateados(items, money(1000), 'por_peso');
    const suma = resultado.reduce((acc, it) => acc + it.gastoProrrateadoCents, 0);
    expect(suma).toBe(1000);
  });
});

describe('calcularEfectosProducto', () => {
  it('granel: promedio ponderado contra el stock/costo existentes del producto', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(1000), costoPromedioCents: money(1000) });
    const items: ItemCompraForm[] = [
      { productoId: 'p1', nombreProducto: 'Queso', modoStock: 'granel', gramos: peso(1000), costoFacturaCents: money(2000) },
    ];
    const prorrateados = calcularItemsProrrateados(items, money(0), 'por_valor');
    const efectos = calcularEfectosProducto(prorrateados, new Map([['p1', producto]]));

    expect(efectos).toHaveLength(1);
    // costoRealKgCents del ítem = costoRealCents(2000) * 1000 / 1000 = 2000 c/kg
    // promedio(1000g@1000, 1000g@2000) = (1000*1000+1000*2000)/2000 = 1500
    expect(efectos[0]).toEqual({ productoId: 'p1', nuevoCostoPromedioCents: money(1500) });
  });

  it('unidad_simple: usa el costo real por unidad (total/unidades)', () => {
    const producto = productoDe({ id: 'p2', modoStock: 'unidad_simple', stockUnidades: 0, costoPromedioCents: money(0) });
    const items: ItemCompraForm[] = [
      { productoId: 'p2', nombreProducto: 'Miel', modoStock: 'unidad_simple', unidades: 4, costoFacturaCents: money(4000) },
    ];
    const prorrateados = calcularItemsProrrateados(items, money(0), 'por_valor');
    const efectos = calcularEfectosProducto(prorrateados, new Map([['p2', producto]]));

    // sin stock previo -> toma el costo entrante: 4000/4 = 1000 por unidad
    expect(efectos[0]).toEqual({ productoId: 'p2', nuevoCostoPromedioCents: money(1000) });
  });

  it('pieza: sin cache de peso existente, arranca en 0 y toma el costo real/kg de la compra', () => {
    const producto = productoDe({ id: 'p3', modoStock: 'fraccionado_por_pieza', costoPromedioCents: money(9999) });
    const items: ItemCompraForm[] = [
      {
        productoId: 'p3',
        nombreProducto: 'Rueda',
        modoStock: 'fraccionado_por_pieza',
        gramos: peso(2000),
        piezas: [{ pesoGramos: peso(2000) }],
        costoFacturaCents: money(4000),
      },
    ];
    const prorrateados = calcularItemsProrrateados(items, money(0), 'por_valor');
    const efectos = calcularEfectosProducto(prorrateados, new Map([['p3', producto]]));

    // costoRealKgCents = 4000*1000/2000 = 2000 c/kg; sin stock previo -> lo toma tal cual
    expect(efectos[0]).toEqual({ productoId: 'p3', nuevoCostoPromedioCents: money(2000) });
  });

  it('lanza si falta el producto de un ítem en el mapa', () => {
    const items: ItemCompraForm[] = [
      { productoId: 'p1', nombreProducto: 'A', modoStock: 'granel', gramos: peso(1000), costoFacturaCents: money(1000) },
    ];
    const prorrateados = calcularItemsProrrateados(items, money(0), 'por_valor');
    expect(() => calcularEfectosProducto(prorrateados, new Map())).toThrow();
  });
});

describe('modoStockDeItem / itemCompraAForm', () => {
  it('con piezas -> fraccionado_por_pieza', () => {
    expect(modoStockDeItem({ piezas: [{ pesoGramos: peso(500) }], gramos: peso(500), unidades: undefined })).toBe(
      'fraccionado_por_pieza',
    );
  });

  it('con gramos y sin piezas -> granel', () => {
    expect(modoStockDeItem({ piezas: undefined, gramos: peso(500), unidades: undefined })).toBe('granel');
  });

  it('sin piezas ni gramos -> unidad_simple', () => {
    expect(modoStockDeItem({ piezas: undefined, gramos: undefined, unidades: 3 })).toBe('unidad_simple');
  });

  it('itemCompraAForm reconstruye el ítem con el modoStock derivado', () => {
    const item = itemCompraAForm({
      productoId: 'p1',
      nombreProducto: 'Rueda',
      gramos: peso(2000),
      piezas: [{ pesoGramos: peso(2000) }],
      costoFacturaCents: money(4000),
    });
    expect(item).toEqual({
      productoId: 'p1',
      nombreProducto: 'Rueda',
      modoStock: 'fraccionado_por_pieza',
      gramos: peso(2000),
      unidades: undefined,
      piezas: [{ pesoGramos: peso(2000) }],
      costoFacturaCents: money(4000),
    });
  });
});

describe('textoCantidadItem', () => {
  it('piezas: cuenta + peso total', () => {
    const item: ItemCompraForm = {
      productoId: 'p1',
      nombreProducto: 'Rueda',
      modoStock: 'fraccionado_por_pieza',
      gramos: peso(3200),
      piezas: [{ pesoGramos: peso(1200) }, { pesoGramos: peso(2000) }],
      costoFacturaCents: money(0),
    };
    expect(textoCantidadItem(item)).toBe('2 piezas · 3,2 kg');
  });

  it('granel: solo el peso', () => {
    const item: ItemCompraForm = {
      productoId: 'p1',
      nombreProducto: 'Nuez',
      modoStock: 'granel',
      gramos: peso(500),
      costoFacturaCents: money(0),
    };
    expect(textoCantidadItem(item)).toBe('500 g');
  });

  it('unidad: singular y plural', () => {
    const uno: ItemCompraForm = {
      productoId: 'p1',
      nombreProducto: 'Miel',
      modoStock: 'unidad_simple',
      unidades: 1,
      costoFacturaCents: money(0),
    };
    const varios: ItemCompraForm = { ...uno, unidades: 3 };
    expect(textoCantidadItem(uno)).toBe('1 unidad');
    expect(textoCantidadItem(varios)).toBe('3 unidades');
  });
});
