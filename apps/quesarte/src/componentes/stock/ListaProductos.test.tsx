import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import { ListaProductos } from './ListaProductos';
import { agruparPiezasPorProducto } from './resumen';

function producto(over: Partial<Producto> & Pick<Producto, 'modoStock'>): Producto {
  return {
    id: 'prod1',
    nombre: 'Producto',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function pieza(over: Partial<Pieza> = {}): Pieza {
  return {
    id: 'pz1',
    productoId: 'prod1',
    pesoInicialGramos: peso(5000),
    pesoRestanteGramos: peso(4000),
    costoKgCents: money(30000),
    fechaIngreso: new Date('2026-01-01'),
    estado: 'disponible',
    ...over,
  };
}

afterEach(() => cleanup());

describe('ListaProductos - agrupación por modoStock', () => {
  it('fraccionado_por_pieza: muestra cantidad de piezas y peso total (kg)', () => {
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    const piezas = [
      pieza({ id: 'a', productoId: 'p1', pesoRestanteGramos: peso(1500) }),
      pieza({ id: 'b', productoId: 'p1', pesoRestanteGramos: peso(2500) }),
    ];

    render(
      <ListaProductos
        productos={[prod]}
        piezasAgrupadas={agruparPiezasPorProducto(piezas)}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('2 piezas · 4 kg')).toBeTruthy();
  });

  it('pieza_entera: mismo resumen que fraccionado_por_pieza', () => {
    const prod = producto({ id: 'p1', nombre: 'Salame', modoStock: 'pieza_entera' });
    const piezas = [pieza({ id: 'a', productoId: 'p1', pesoRestanteGramos: peso(800) })];

    render(
      <ListaProductos
        productos={[prod]}
        piezasAgrupadas={agruparPiezasPorProducto(piezas)}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.getByText('1 pieza · 800 g')).toBeTruthy();
  });

  it('granel: muestra el total en peso, sin piezas', () => {
    const prod = producto({ id: 'p1', nombre: 'Nuez mariposa', modoStock: 'granel', stockGranelGramos: peso(3200) });

    render(<ListaProductos productos={[prod]} piezasAgrupadas={new Map()} onSeleccionar={() => {}} />);

    expect(screen.getByText('3,2 kg')).toBeTruthy();
  });

  it('unidad_simple: muestra la cantidad de unidades', () => {
    const prod = producto({
      id: 'p1',
      nombre: 'Miel 500g',
      modoPrecio: 'por_unidad',
      modoStock: 'unidad_simple',
      stockUnidades: 7,
    });

    render(<ListaProductos productos={[prod]} piezasAgrupadas={new Map()} onSeleccionar={() => {}} />);

    expect(screen.getByText('7 unidades')).toBeTruthy();
  });
});

describe('ListaProductos - alertas visuales', () => {
  it('pieza que vence en 3 días: badge "Vence pronto"', () => {
    const ahora = new Date();
    const en3Dias = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 3);
    const prod = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const piezas = [pieza({ id: 'a', productoId: 'p1', fechaVencimiento: en3Dias })];

    render(
      <ListaProductos
        productos={[prod]}
        piezasAgrupadas={agruparPiezasPorProducto(piezas)}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.getByText('Vence pronto')).toBeTruthy();
    expect(screen.queryByText('Vencida')).toBeNull();
  });

  it('pieza vencida: badge "Vencida"', () => {
    const ahora = new Date();
    const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
    const prod = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const piezas = [pieza({ id: 'a', productoId: 'p1', fechaVencimiento: ayer })];

    render(
      <ListaProductos
        productos={[prod]}
        piezasAgrupadas={agruparPiezasPorProducto(piezas)}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.getByText('Vencida')).toBeTruthy();
  });

  it('stock por debajo del umbral: badge "Stock bajo"', () => {
    const prod = producto({
      id: 'p1',
      modoStock: 'granel',
      stockGranelGramos: peso(100),
      umbralAlertaStock: 500,
    });

    render(<ListaProductos productos={[prod]} piezasAgrupadas={new Map()} onSeleccionar={() => {}} />);

    expect(screen.getByText('Stock bajo')).toBeTruthy();
  });

  it('sin alertas: no muestra ningún badge', () => {
    const prod = producto({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(5000) });

    render(<ListaProductos productos={[prod]} piezasAgrupadas={new Map()} onSeleccionar={() => {}} />);

    expect(screen.queryByText('Vence pronto')).toBeNull();
    expect(screen.queryByText('Vencida')).toBeNull();
    expect(screen.queryByText('Stock bajo')).toBeNull();
  });
});

describe('ListaProductos - ocultarCategoria', () => {
  it('por defecto muestra el subtítulo de categoría de cada fila', () => {
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel' });

    render(<ListaProductos productos={[prod]} piezasAgrupadas={new Map()} onSeleccionar={() => {}} />);

    expect(screen.getByText('Quesos')).toBeTruthy();
  });

  it('con ocultarCategoria=true no muestra el subtítulo de categoría', () => {
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel' });

    render(
      <ListaProductos productos={[prod]} piezasAgrupadas={new Map()} onSeleccionar={() => {}} ocultarCategoria />,
    );

    expect(screen.queryByText('Quesos')).toBeNull();
    expect(screen.getByText('Queso Colonia')).toBeTruthy();
  });
});

describe('ListaProductos - interacción', () => {
  it('tocar una fila llama a onSeleccionar con el producto', () => {
    const onSeleccionar = vi.fn();
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel', stockGranelGramos: peso(1000) });

    render(<ListaProductos productos={[prod]} piezasAgrupadas={new Map()} onSeleccionar={onSeleccionar} />);
    fireEvent.click(screen.getByRole('button', { name: /Queso Colonia/ }));

    expect(onSeleccionar).toHaveBeenCalledWith(prod);
  });
});
