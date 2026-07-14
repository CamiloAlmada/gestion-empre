import { describe, expect, it } from 'vitest';
import { money, peso, type Compra, type Producto } from '@gestion/core';
import { desglosarCosto, ultimaCompraConProducto } from './desgloseCosto';

function productoDe(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    precioVentaCents: money(0),
    costoPromedioCents: money(30000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function compraDe(over: Partial<Compra> & Pick<Compra, 'id'>): Compra {
  return {
    fecha: new Date('2026-07-01'),
    usuarioId: 'admin-1',
    estado: 'confirmada',
    proveedorNombre: 'Proveedor',
    items: [],
    gastos: [],
    totalFacturaCents: money(0),
    totalGastosCents: money(0),
    totalRealCents: money(0),
    ...over,
  };
}

describe('ultimaCompraConProducto', () => {
  it('null sin ninguna compra que incluya el producto', () => {
    expect(ultimaCompraConProducto([], 'p1')).toBeNull();
    expect(
      ultimaCompraConProducto(
        [compraDe({ id: 'c1', items: [{ productoId: 'otro', nombreProducto: 'Otro', costoFacturaCents: money(1) }] })],
        'p1',
      ),
    ).toBeNull();
  });

  it('(c) devuelve la PRIMERA de la lista que matchea (se asume ya ordenada por fecha desc)', () => {
    const compraReciente = compraDe({
      id: 'reciente',
      fecha: new Date('2026-07-10'),
      items: [{ productoId: 'p1', nombreProducto: 'Queso', costoFacturaCents: money(100) }],
    });
    const compraVieja = compraDe({
      id: 'vieja',
      fecha: new Date('2026-05-01'),
      items: [{ productoId: 'p1', nombreProducto: 'Queso', costoFacturaCents: money(50) }],
    });

    const resultado = ultimaCompraConProducto([compraReciente, compraVieja], 'p1');

    expect(resultado?.compra.id).toBe('reciente');
    expect(resultado?.item.costoFacturaCents).toBe(money(100));
  });

  it('(d) ignora compras en borrador aunque incluyan el producto', () => {
    const borrador = compraDe({
      id: 'b1',
      estado: 'borrador',
      items: [{ productoId: 'p1', nombreProducto: 'Queso', costoFacturaCents: money(999) }],
    });
    const confirmada = compraDe({
      id: 'c1',
      estado: 'confirmada',
      items: [{ productoId: 'p1', nombreProducto: 'Queso', costoFacturaCents: money(100) }],
    });

    const resultado = ultimaCompraConProducto([borrador, confirmada], 'p1');

    expect(resultado?.compra.id).toBe('c1');
  });
});

describe('desglosarCosto', () => {
  it('(b) ítem al peso (/kg): normaliza mercadería y gastos con el mismo criterio que calcularCostoRealKgCents (half-up)', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel' });
    const compra = compraDe({ id: 'c1', fecha: new Date('2026-06-15'), proveedorNombre: 'Lácteos del Sur' });
    // 1500 g, factura $300,00, gasto $30,00 → real $330,00.
    const desglose = desglosarCosto(producto, compra, {
      productoId: 'p1',
      nombreProducto: 'Queso',
      gramos: peso(1500),
      costoFacturaCents: money(30000),
      gastoProrrateadoCents: money(3000),
      costoRealCents: money(33000),
      costoRealKgCents: money(22000),
    });

    expect(desglose).toEqual({
      fecha: compra.fecha,
      proveedorNombre: 'Lácteos del Sur',
      unidad: 'kg',
      mercaderiaCents: money(20000), // 30000*1000/1500
      gastosCents: money(2000), // 3000*1000/1500
      costoRealCents: money(22000), // el persistido, no 20000+2000 recalculado
    });
  });

  it('(b) ítem por unidad (/u): normaliza con calcularTicketPromedio (mismo gap documentado que resumenCompra.costoRealPorUnidad)', () => {
    const producto = productoDe({ id: 'p2', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const compra = compraDe({ id: 'c1', fecha: new Date('2026-06-20'), proveedorNombre: 'Apiario Norte' });
    // 4 unidades, factura $400,00, gasto $40,00 → real $440,00.
    const desglose = desglosarCosto(producto, compra, {
      productoId: 'p2',
      nombreProducto: 'Miel 500g',
      unidades: 4,
      costoFacturaCents: money(40000),
      gastoProrrateadoCents: money(4000),
      costoRealCents: money(44000),
    });

    expect(desglose).toEqual({
      fecha: compra.fecha,
      proveedorNombre: 'Apiario Norte',
      unidad: 'unidad',
      mercaderiaCents: money(10000), // 40000/4
      gastosCents: money(1000), // 4000/4
      costoRealCents: money(11000), // 44000/4
    });
  });

  it('sin gastoProrrateadoCents (compra sin gastos de viaje): gastos normalizados en 0', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel' });
    const compra = compraDe({ id: 'c1' });
    const desglose = desglosarCosto(producto, compra, {
      productoId: 'p1',
      nombreProducto: 'Queso',
      gramos: peso(1000),
      costoFacturaCents: money(10000),
      costoRealCents: money(10000),
      costoRealKgCents: money(10000),
    });

    expect(desglose?.gastosCents).toBe(money(0));
    expect(desglose?.mercaderiaCents).toBe(money(10000));
  });

  it('redondeo: mercadería + gastos normalizados por separado puede diferir en 1 centésimo del costo real persistido — se muestra igual el persistido, no la suma', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel' });
    const compra = compraDe({ id: 'c1' });
    // 700 g: factura $100,00 (10000c), gasto $3,33 (333c) → real 10333c.
    // mercadería: round(10000*1000/700) = round(14285.71) = 14286.
    // gastos:     round(333*1000/700)   = round(475.71)   = 476.
    // suma = 14762, pero costoRealKgCents persistido (calcularCostoRealKgCents
    // sobre el TOTAL 10333c) = round(10333*1000/700) = round(14761.43) = 14761.
    const desglose = desglosarCosto(producto, compra, {
      productoId: 'p1',
      nombreProducto: 'Queso',
      gramos: peso(700),
      costoFacturaCents: money(10000),
      gastoProrrateadoCents: money(333),
      costoRealCents: money(10333),
      costoRealKgCents: money(14761),
    });

    expect(desglose?.mercaderiaCents).toBe(money(14286));
    expect(desglose?.gastosCents).toBe(money(476));
    expect((desglose?.mercaderiaCents ?? 0) + (desglose?.gastosCents ?? 0)).toBe(14762);
    // El costo real mostrado es el persistido, NO la suma de las partes ya normalizadas.
    expect(desglose?.costoRealCents).toBe(money(14761));
  });

  it('/kg sin costoRealKgCents (dato incompleto/corrupto): devuelve null en vez de calcular con undefined', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel' });
    const compra = compraDe({ id: 'c1' });
    const desglose = desglosarCosto(producto, compra, {
      productoId: 'p1',
      nombreProducto: 'Queso',
      gramos: peso(1000),
      costoFacturaCents: money(10000),
    });

    expect(desglose).toBeNull();
  });

  it('/u sin unidades (dato incompleto/corrupto): devuelve null', () => {
    const producto = productoDe({ id: 'p2', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const compra = compraDe({ id: 'c1' });
    const desglose = desglosarCosto(producto, compra, {
      productoId: 'p2',
      nombreProducto: 'Miel',
      costoFacturaCents: money(1000),
    });

    expect(desglose).toBeNull();
  });
});
