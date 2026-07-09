import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Categoria, type Producto } from '@gestion/core';
import { agruparPorCategoria, SIN_CATEGORIA } from './agrupacion';
import { ListaProductosAgrupada } from './ListaProductosAgrupada';

function producto(over: Partial<Producto> & Pick<Producto, 'nombre' | 'categoria'>): Producto {
  return {
    id: over.nombre,
    modoStock: 'granel',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    stockGranelGramos: peso(1000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function categoria(over: Partial<Categoria> & Pick<Categoria, 'nombre' | 'orden'>): Categoria {
  return { id: over.nombre, ...over };
}

afterEach(() => cleanup());

describe('ListaProductosAgrupada', () => {
  it('sin categorías definidas: lista plana, sin encabezados, con subtítulo de categoría por fila', () => {
    const productos = [producto({ nombre: 'Nuez', categoria: 'Frutos secos' })];
    const grupos = agruparPorCategoria(productos, []);

    render(<ListaProductosAgrupada grupos={grupos} piezasAgrupadas={new Map()} onSeleccionar={() => {}} />);

    expect(screen.getByText('Nuez')).toBeTruthy();
    expect(screen.getByText('Frutos secos')).toBeTruthy(); // subtítulo de la fila, no encabezado
    expect(screen.queryAllByRole('heading').length).toBe(0);
  });

  it('con categorías definidas: renderiza un encabezado h2 por grupo, en el orden de las categorías', () => {
    const categorias = [
      categoria({ nombre: 'Quesos', orden: 0 }),
      categoria({ nombre: 'Miel', orden: 1 }),
      categoria({ nombre: 'Embutidos', orden: 2 }),
    ];
    const productos = [
      producto({ nombre: 'Salame', categoria: 'Embutidos' }),
      producto({ nombre: 'Queso Colonia', categoria: 'Quesos' }),
      producto({ nombre: 'Miel 500g', categoria: 'Miel' }),
    ];
    const grupos = agruparPorCategoria(productos, categorias);

    render(<ListaProductosAgrupada grupos={grupos} piezasAgrupadas={new Map()} onSeleccionar={() => {}} />);

    const encabezados = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(encabezados).toEqual(['Quesos', 'Miel', 'Embutidos']);
  });

  it('productos huérfanos: aparecen bajo el encabezado "Sin categoría", al final', () => {
    const categorias = [categoria({ nombre: 'Quesos', orden: 0 })];
    const productos = [
      producto({ nombre: 'Queso Colonia', categoria: 'Quesos' }),
      producto({ nombre: 'Especias raras', categoria: 'Especias' }),
    ];
    const grupos = agruparPorCategoria(productos, categorias);

    render(<ListaProductosAgrupada grupos={grupos} piezasAgrupadas={new Map()} onSeleccionar={() => {}} />);

    const encabezados = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(encabezados).toEqual(['Quesos', SIN_CATEGORIA]);
  });

  it('agrupada: el subtítulo de categoría de la fila se omite (el encabezado ya lo comunica)', () => {
    const categorias = [categoria({ nombre: 'Quesos', orden: 0 })];
    const productos = [producto({ nombre: 'Queso Colonia', categoria: 'Quesos' })];
    const grupos = agruparPorCategoria(productos, categorias);

    render(<ListaProductosAgrupada grupos={grupos} piezasAgrupadas={new Map()} onSeleccionar={() => {}} />);

    // El nombre de categoría solo aparece una vez: en el encabezado h2.
    expect(screen.getAllByText('Quesos').length).toBe(1);
  });

  it('grupos ya filtrados (p.ej. tras una búsqueda) que quedan vacíos no generan encabezado', () => {
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
    // Simula la búsqueda "colonia" filtrando ANTES de agrupar.
    const filtrados = productos.filter((p) => p.nombre.toLowerCase().includes('colonia'));
    const grupos = agruparPorCategoria(filtrados, categorias);

    render(<ListaProductosAgrupada grupos={grupos} piezasAgrupadas={new Map()} onSeleccionar={() => {}} />);

    const encabezados = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(encabezados).toEqual(['Quesos']);
    expect(screen.queryByText('Salame')).toBeNull();
    expect(screen.queryByText('Miel 500g')).toBeNull();
  });

  it('tocar una fila dentro de un grupo llama a onSeleccionar con el producto', () => {
    const onSeleccionar = vi.fn();
    const categorias = [categoria({ nombre: 'Quesos', orden: 0 })];
    const prod = producto({ nombre: 'Queso Colonia', categoria: 'Quesos' });
    const grupos = agruparPorCategoria([prod], categorias);

    render(<ListaProductosAgrupada grupos={grupos} piezasAgrupadas={new Map()} onSeleccionar={onSeleccionar} />);
    fireEvent.click(screen.getByRole('button', { name: /Queso Colonia/ }));

    expect(onSeleccionar).toHaveBeenCalledWith(prod);
  });
});
