import { describe, expect, it } from 'vitest';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import {
  cambiarUnidades,
  crearItemFraccionado,
  crearItemGranel,
  crearItemPiezaEntera,
  crearItemUnidad,
  detalleItem,
  piezaIdsEnCarrito,
  piezasAjustadasPorCarrito,
  piezasParaEditar,
  puedeSumarUnidad,
  reemplazarItem,
  stockGranelParaEditar,
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

describe('puedeSumarUnidad', () => {
  it('true si las unidades ya carriteadas del producto están por debajo del stock', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', stockUnidades: 3 });
    const items = [crearItemUnidad(producto, 2, 'a')];
    expect(puedeSumarUnidad(items, 'a')).toBe(true);
  });

  it('false al llegar al stock', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', stockUnidades: 3 });
    const items = [crearItemUnidad(producto, 3, 'a')];
    expect(puedeSumarUnidad(items, 'a')).toBe(false);
  });

  it('cuenta TODOS los ítems del mismo producto, no solo el propio', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', stockUnidades: 3 });
    const items = [crearItemUnidad(producto, 1, 'a'), crearItemUnidad(producto, 2, 'b')];
    expect(puedeSumarUnidad(items, 'a')).toBe(false);
  });

  it('false si la clave no existe o el ítem no es unidad_simple', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg' });
    const items = [crearItemGranel(producto, peso(100), 'a')];
    expect(puedeSumarUnidad(items, 'a')).toBe(false);
    expect(puedeSumarUnidad(items, 'no-existe')).toBe(false);
  });
});

describe('cambiarUnidades', () => {
  it('delta positivo suma unidades y recalcula el subtotal por core', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', precioVentaCents: money(1000), stockUnidades: 5 });
    const items = [crearItemUnidad(producto, 1, 'a')];

    const resultado = cambiarUnidades(items, 'a', 1);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.unidades).toBe(2);
    expect(resultado[0]?.subtotalCents).toBe(money(2000));
    expect(resultado[0]?.clave).toBe('a');
  });

  it('delta negativo resta unidades', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', stockUnidades: 5 });
    const items = [crearItemUnidad(producto, 3, 'a')];

    const resultado = cambiarUnidades(items, 'a', -1);

    expect(resultado[0]?.unidades).toBe(2);
  });

  it('llegar a 0 unidades QUITA el ítem', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', stockUnidades: 5 });
    const items = [crearItemUnidad(producto, 1, 'a')];

    expect(cambiarUnidades(items, 'a', -1)).toEqual([]);
  });

  it('no permite superar el stock (contando lo ya carriteado): no-op', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', stockUnidades: 2 });
    const items = [crearItemUnidad(producto, 2, 'a')];

    const resultado = cambiarUnidades(items, 'a', 1);

    expect(resultado).toBe(items);
  });

  it('no toca otros ítems del carrito', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', stockUnidades: 5 });
    const otro = productoDe({ id: 'p2', modoStock: 'granel', modoPrecio: 'por_kg' });
    const items = [crearItemUnidad(producto, 1, 'a'), crearItemGranel(otro, peso(200), 'b')];

    const resultado = cambiarUnidades(items, 'a', 1);

    expect(resultado).toHaveLength(2);
    expect(resultado[1]).toBe(items[1]);
  });

  it('clave inexistente o ítem que no es unidad_simple: no-op', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg' });
    const items = [crearItemGranel(producto, peso(200), 'a')];

    expect(cambiarUnidades(items, 'a', 1)).toBe(items);
    expect(cambiarUnidades(items, 'no-existe', 1)).toBe(items);
  });
});

describe('reemplazarItem', () => {
  it('reemplaza el ítem de esa clave, deja el resto intacto', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg' });
    const original = crearItemGranel(producto, peso(200), 'a');
    const otro = crearItemGranel(producto, peso(50), 'b');
    const nuevo = crearItemGranel(producto, peso(500), 'a');

    const resultado = reemplazarItem([original, otro], 'a', nuevo);

    expect(resultado[0]).toBe(nuevo);
    expect(resultado[1]).toBe(otro);
  });

  it('clave inexistente: no cambia nada', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg' });
    const items = [crearItemGranel(producto, peso(200), 'a')];
    const nuevo = crearItemGranel(producto, peso(500), 'z');

    expect(reemplazarItem(items, 'z', nuevo)).toEqual(items);
  });
});

describe('piezasParaEditar', () => {
  it('caso clave: pieza justa — editar 800g a 900g de una pieza con 900g restantes es válido', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg' });
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(900) });
    const itemEnEdicion = crearItemFraccionado(producto, pieza, peso(800), 'a');

    const ajustadas = piezasParaEditar([pieza], 'p1', [itemEnEdicion], 'a');

    // La reserva del propio ítem (800 g) queda excluida: los 900 g completos
    // vuelven a estar "disponibles" para reasignar en la edición.
    expect(ajustadas[0]?.pesoRestanteGramos).toBe(peso(900));
  });

  it('otros ítems que reservan la MISMA pieza sí se siguen descontando', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg' });
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(900) });
    const itemEnEdicion = crearItemFraccionado(producto, pieza, peso(300), 'a');
    const otroItem = crearItemFraccionado(producto, pieza, peso(200), 'b');

    const ajustadas = piezasParaEditar([pieza], 'p1', [itemEnEdicion, otroItem], 'a');

    // 900 - 200 (reserva de 'b', que NO se está editando) = 700.
    expect(ajustadas[0]?.pesoRestanteGramos).toBe(peso(700));
  });

  it('claveEnEdicion que no está en el carrito: se comporta como piezasAjustadasPorCarrito sin excluir nada', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg' });
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(900) });
    const item = crearItemFraccionado(producto, pieza, peso(300), 'a');

    const ajustadas = piezasParaEditar([pieza], 'p1', [item], 'no-existe');

    expect(ajustadas[0]?.pesoRestanteGramos).toBe(peso(600));
  });
});

describe('stockGranelParaEditar', () => {
  it('caso granel: mismo stock de catálogo que agregar (no hay reserva previa que devolver)', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg', stockGranelGramos: peso(900) });
    expect(stockGranelParaEditar(producto)).toBe(peso(900));
  });

  it('sin stockGranelGramos: peso(0)', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg' });
    expect(stockGranelParaEditar(producto)).toBe(peso(0));
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
