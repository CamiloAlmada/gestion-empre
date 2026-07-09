import { describe, expect, it } from 'vitest';
import { money, type Categoria, type Producto } from '@gestion/core';
import { agruparPorCategoria, SIN_CATEGORIA } from './agrupacion';

function producto(over: Partial<Producto> & Pick<Producto, 'nombre' | 'categoria'>): Producto {
  return {
    id: over.nombre,
    modoStock: 'granel',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function categoria(over: Partial<Categoria> & Pick<Categoria, 'nombre' | 'orden'>): Categoria {
  return { id: over.nombre, ...over };
}

describe('agruparPorCategoria', () => {
  it('sin categorías definidas: un único grupo sin nombre con todos los productos, en el orden recibido', () => {
    const productos = [
      producto({ nombre: 'Nuez', categoria: 'Frutos secos' }),
      producto({ nombre: 'Queso Colonia', categoria: 'Quesos' }),
    ];

    const grupos = agruparPorCategoria(productos, []);

    expect(grupos).toEqual([{ nombre: null, productos }]);
  });

  it('sin categorías definidas y sin productos: un grupo vacío sin nombre (no se omite)', () => {
    expect(agruparPorCategoria([], [])).toEqual([{ nombre: null, productos: [] }]);
  });

  it('agrupa respetando el orden de las categorías recibidas, no el alfabético', () => {
    const categorias = [
      categoria({ nombre: 'Miel', orden: 0 }),
      categoria({ nombre: 'Quesos', orden: 1 }),
      categoria({ nombre: 'Embutidos', orden: 2 }),
    ];
    const productos = [
      producto({ nombre: 'Salame', categoria: 'Embutidos' }),
      producto({ nombre: 'Queso Colonia', categoria: 'Quesos' }),
      producto({ nombre: 'Miel 500g', categoria: 'Miel' }),
    ];

    const grupos = agruparPorCategoria(productos, categorias);

    expect(grupos.map((g) => g.nombre)).toEqual(['Miel', 'Quesos', 'Embutidos']);
  });

  it('dentro de cada grupo preserva el orden de `productos` recibido (el llamador ya ordenó por nombre)', () => {
    const categorias = [categoria({ nombre: 'Quesos', orden: 0 })];
    const productos = [
      producto({ nombre: 'Colonia', categoria: 'Quesos' }),
      producto({ nombre: 'Dambo', categoria: 'Quesos' }),
      producto({ nombre: 'Azul', categoria: 'Quesos' }), // fuera de orden alfabético a propósito
    ];

    const grupos = agruparPorCategoria(productos, categorias);

    expect(grupos).toEqual([{ nombre: 'Quesos', productos }]);
  });

  it('productos huérfanos (categoría que no matchea ninguna definida) van al final bajo "Sin categoría"', () => {
    const categorias = [categoria({ nombre: 'Quesos', orden: 0 }), categoria({ nombre: 'Miel', orden: 1 })];
    const productos = [
      producto({ nombre: 'Queso Colonia', categoria: 'Quesos' }),
      producto({ nombre: 'Especias raras', categoria: 'Especias' }), // no definida
      producto({ nombre: 'Miel 500g', categoria: 'Miel' }),
    ];

    const grupos = agruparPorCategoria(productos, categorias);

    expect(grupos).toEqual([
      { nombre: 'Quesos', productos: [productos[0]] },
      { nombre: 'Miel', productos: [productos[2]] },
      { nombre: SIN_CATEGORIA, productos: [productos[1]] },
    ]);
  });

  it('match de categoría es exacto (case-sensitive): no matchea si difiere may/min', () => {
    const categorias = [categoria({ nombre: 'Quesos', orden: 0 })];
    const productos = [producto({ nombre: 'Queso Colonia', categoria: 'quesos' })];

    const grupos = agruparPorCategoria(productos, categorias);

    expect(grupos).toEqual([{ nombre: SIN_CATEGORIA, productos }]);
  });

  it('categorías sin productos se omiten del resultado', () => {
    const categorias = [
      categoria({ nombre: 'Quesos', orden: 0 }),
      categoria({ nombre: 'Miel', orden: 1 }), // sin productos
      categoria({ nombre: 'Embutidos', orden: 2 }),
    ];
    const productos = [
      producto({ nombre: 'Queso Colonia', categoria: 'Quesos' }),
      producto({ nombre: 'Salame', categoria: 'Embutidos' }),
    ];

    const grupos = agruparPorCategoria(productos, categorias);

    expect(grupos.map((g) => g.nombre)).toEqual(['Quesos', 'Embutidos']);
  });

  it('sin productos huérfanos: no aparece el grupo "Sin categoría"', () => {
    const categorias = [categoria({ nombre: 'Quesos', orden: 0 })];
    const productos = [producto({ nombre: 'Queso Colonia', categoria: 'Quesos' })];

    const grupos = agruparPorCategoria(productos, categorias);

    expect(grupos.map((g) => g.nombre)).toEqual(['Quesos']);
  });

  it('categorías definidas pero sin productos en absoluto: resultado vacío (todo se omite)', () => {
    const categorias = [categoria({ nombre: 'Quesos', orden: 0 }), categoria({ nombre: 'Miel', orden: 1 })];

    expect(agruparPorCategoria([], categorias)).toEqual([]);
  });

  it('todos los productos huérfanos: un único grupo "Sin categoría"', () => {
    const categorias = [categoria({ nombre: 'Quesos', orden: 0 })];
    const productos = [
      producto({ nombre: 'Especias raras', categoria: 'Especias' }),
      producto({ nombre: 'Otra cosa', categoria: 'Otra' }),
    ];

    const grupos = agruparPorCategoria(productos, categorias);

    expect(grupos).toEqual([{ nombre: SIN_CATEGORIA, productos }]);
  });

  it('compone con un filtro previo (p.ej. búsqueda): un grupo que queda vacío tras filtrar no aparece', () => {
    const categorias = [
      categoria({ nombre: 'Quesos', orden: 0 }),
      categoria({ nombre: 'Miel', orden: 1 }),
      categoria({ nombre: 'Embutidos', orden: 2 }),
    ];
    const productos = [
      producto({ nombre: 'Queso Colonia', categoria: 'Quesos' }),
      producto({ nombre: 'Miel 500g', categoria: 'Miel' }),
      producto({ nombre: 'Salame', categoria: 'Embutidos' }),
    ];

    // Simula el resultado de una búsqueda ("colonia") aplicada ANTES de agrupar.
    const filtrados = productos.filter((p) => p.nombre.toLowerCase().includes('colonia'));
    const grupos = agruparPorCategoria(filtrados, categorias);

    expect(grupos).toEqual([{ nombre: 'Quesos', productos: filtrados }]);
  });
});
