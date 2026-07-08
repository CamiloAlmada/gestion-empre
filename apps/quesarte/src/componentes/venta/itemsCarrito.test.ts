import { describe, expect, it } from 'vitest';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import {
  crearItemFraccionado,
  crearItemGranel,
  crearItemPiezaEntera,
  crearItemUnidad,
  detalleItem,
  piezaIdsEnCarrito,
  piezasAjustadasPorCarrito,
  totalCarrito,
  type ItemCarrito,
} from './itemsCarrito';

function productoDe(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock' | 'modoPrecio'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'cat',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function piezaDe(over: Partial<Pieza> & Pick<Pieza, 'id' | 'productoId'>): Pieza {
  return {
    pesoInicialGramos: peso(1000),
    pesoRestanteGramos: peso(1000),
    costoKgCents: money(500),
    fechaIngreso: new Date('2026-01-01'),
    estado: 'disponible',
    ...over,
  };
}

describe('crearItemFraccionado', () => {
  it('arma el ítem con la pieza, los gramos y el subtotal por core', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg', precioVentaCents: money(89900) });
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(1500) });

    const item = crearItemFraccionado(producto, pieza, peso(300), 'clave-1');

    expect(item.clave).toBe('clave-1');
    expect(item.producto).toBe(producto);
    expect(item.pieza).toBe(pieza);
    expect(item.gramos).toBe(peso(300));
    expect(item.unidades).toBeUndefined();
    expect(item.precioUnitCents).toBe(money(89900));
    // 89900 * 300 / 1000 = 26970
    expect(item.subtotalCents).toBe(money(26970));
  });
});

describe('crearItemPiezaEntera', () => {
  it('el peso vendido y el subtotal salen del peso restante de ESA pieza', () => {
    const producto = productoDe({ id: 'p2', modoStock: 'pieza_entera', modoPrecio: 'por_kg', precioVentaCents: money(120000) });
    const pieza = piezaDe({ id: 'pz2', productoId: 'p2', pesoRestanteGramos: peso(850) });

    const item = crearItemPiezaEntera(producto, pieza, 'clave-2');

    expect(item.pieza).toBe(pieza);
    expect(item.gramos).toBe(peso(850));
    // 120000 * 850 / 1000 = 102000
    expect(item.subtotalCents).toBe(money(102000));
  });
});

describe('crearItemGranel', () => {
  it('no lleva pieza', () => {
    const producto = productoDe({ id: 'p3', modoStock: 'granel', modoPrecio: 'por_kg', precioVentaCents: money(45000) });

    const item = crearItemGranel(producto, peso(200), 'clave-3');

    expect(item.pieza).toBeUndefined();
    expect(item.gramos).toBe(peso(200));
    // 45000 * 200 / 1000 = 9000
    expect(item.subtotalCents).toBe(money(9000));
  });
});

describe('crearItemUnidad', () => {
  it('usa unidades enteras y precio fijo por unidad', () => {
    const producto = productoDe({ id: 'p4', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', precioVentaCents: money(45000) });

    const item = crearItemUnidad(producto, 3, 'clave-4');

    expect(item.unidades).toBe(3);
    expect(item.gramos).toBeUndefined();
    expect(item.subtotalCents).toBe(money(135000));
  });
});

describe('totalCarrito', () => {
  it('suma subtotales con sumarMoney (fuerza redondeos en cada ítem)', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg', precioVentaCents: money(333) });
    // 333 * 333 / 1000 = 110,889 -> redondea a 111
    const item1 = crearItemGranel(producto, peso(333), 'a');
    // 333 * 777 / 1000 = 258,741 -> redondea a 259
    const item2 = crearItemGranel(producto, peso(777), 'b');

    expect(item1.subtotalCents).toBe(money(111));
    expect(item2.subtotalCents).toBe(money(259));
    expect(totalCarrito([item1, item2])).toBe(money(370));
  });

  it('carrito vacío da money(0)', () => {
    expect(totalCarrito([])).toBe(money(0));
  });
});

describe('piezaIdsEnCarrito', () => {
  it('junta los ids de pieza de cualquier ítem que lleve pieza', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'pieza_entera', modoPrecio: 'por_kg' });
    const pieza1 = piezaDe({ id: 'pz1', productoId: 'p1' });
    const pieza2 = piezaDe({ id: 'pz2', productoId: 'p1' });
    const items: ItemCarrito[] = [
      crearItemPiezaEntera(producto, pieza1, 'a'),
      crearItemPiezaEntera(producto, pieza2, 'b'),
      crearItemUnidad(productoDe({ id: 'p2', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' }), 1, 'c'),
    ];

    expect(piezaIdsEnCarrito(items)).toEqual(new Set(['pz1', 'pz2']));
  });
});

describe('piezasAjustadasPorCarrito', () => {
  it('resta lo ya reservado en el carrito para fraccionado_por_pieza del MISMO producto', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg' });
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(500) });
    const yaEnCarrito = crearItemFraccionado(producto, pieza, peso(300), 'a');

    const ajustadas = piezasAjustadasPorCarrito([pieza], 'p1', [yaEnCarrito]);

    expect(ajustadas[0]?.pesoRestanteGramos).toBe(peso(200));
    // No muta la pieza original.
    expect(pieza.pesoRestanteGramos).toBe(peso(500));
  });

  it('nunca deja un restante negativo', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg' });
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(100) });
    const yaEnCarrito = crearItemFraccionado(producto, pieza, peso(100), 'a');
    // Simula una segunda reserva sobre la misma pieza ya "vacía" localmente.
    const otraReserva = { ...yaEnCarrito, clave: 'b', gramos: peso(50) };

    const ajustadas = piezasAjustadasPorCarrito([pieza], 'p1', [yaEnCarrito, otraReserva]);

    expect(ajustadas[0]?.pesoRestanteGramos).toBe(peso(0));
  });

  it('ignora reservas de otro producto o de pieza_entera', () => {
    const productoOtro = productoDe({ id: 'p2', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg' });
    const productoPiezaEntera = productoDe({ id: 'p3', modoStock: 'pieza_entera', modoPrecio: 'por_kg' });
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(500) });
    const piezaOtro = piezaDe({ id: 'pz-otro', productoId: 'p2', pesoRestanteGramos: peso(500) });
    const piezaEntera = piezaDe({ id: 'pz-entera', productoId: 'p3', pesoRestanteGramos: peso(500) });

    const items: ItemCarrito[] = [
      crearItemFraccionado(productoOtro, piezaOtro, peso(200), 'a'),
      crearItemPiezaEntera(productoPiezaEntera, piezaEntera, 'b'),
    ];

    const ajustadas = piezasAjustadasPorCarrito([pieza], 'p1', items);

    expect(ajustadas[0]?.pesoRestanteGramos).toBe(peso(500));
  });

  it('sin reservas devuelve el mismo array (identidad)', () => {
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1' });
    const piezas = [pieza];
    expect(piezasAjustadasPorCarrito(piezas, 'p1', [])).toBe(piezas);
  });
});

describe('detalleItem', () => {
  it('unidad_simple', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    expect(detalleItem(crearItemUnidad(producto, 1, 'a'))).toBe('1 unidad');
    expect(detalleItem(crearItemUnidad(producto, 3, 'a'))).toBe('3 unidades');
  });

  it('pieza_entera', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'pieza_entera', modoPrecio: 'por_kg' });
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(850) });
    expect(detalleItem(crearItemPiezaEntera(producto, pieza, 'a'))).toBe('Pieza entera · 850 g');
  });

  it('fraccionado_por_pieza incluye la fecha de ingreso de la pieza', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg' });
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', fechaIngreso: new Date('2026-02-10T12:00:00') });
    expect(detalleItem(crearItemFraccionado(producto, pieza, peso(300), 'a'))).toBe(
      '300 g · pieza del 10/02/2026',
    );
  });

  it('granel', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg' });
    expect(detalleItem(crearItemGranel(producto, peso(1500), 'a'))).toBe('1,5 kg');
  });
});
