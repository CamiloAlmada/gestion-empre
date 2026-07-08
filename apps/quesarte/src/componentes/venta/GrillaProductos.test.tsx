import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import { GrillaProductos } from './GrillaProductos';

afterEach(cleanup);

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

const quesoColonia = productoDe({
  id: 'p1',
  nombre: 'Queso Colonia',
  categoria: 'Quesos',
  modoStock: 'fraccionado_por_pieza',
  modoPrecio: 'por_kg',
  precioVentaCents: money(89900),
});

const mielFrasco = productoDe({
  id: 'p2',
  nombre: 'Miel 500g',
  categoria: 'Miel',
  modoStock: 'unidad_simple',
  modoPrecio: 'por_unidad',
  precioVentaCents: money(45000),
  stockUnidades: 5,
});

describe('GrillaProductos', () => {
  it('muestra nombre, precio formateado e indicación del modo', () => {
    render(
      <GrillaProductos
        productos={[quesoColonia, mielFrasco]}
        piezasAgrupadas={new Map([['p1', [piezaDe({ id: 'pz1', productoId: 'p1' })]]])}
        onSeleccionar={vi.fn()}
      />,
    );

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('$ 899,00 /kg')).toBeTruthy();
    expect(screen.getByText('Al peso')).toBeTruthy();

    expect(screen.getByText('Miel 500g')).toBeTruthy();
    expect(screen.getByText('$ 450,00 /u')).toBeTruthy();
    expect(screen.getByText('Por unidad')).toBeTruthy();
  });

  it('tocar una card llama a onSeleccionar con el producto', () => {
    const onSeleccionar = vi.fn();
    render(
      <GrillaProductos
        productos={[quesoColonia]}
        piezasAgrupadas={new Map([['p1', [piezaDe({ id: 'pz1', productoId: 'p1' })]]])}
        onSeleccionar={onSeleccionar}
      />,
    );

    fireEvent.click(screen.getByText('Queso Colonia'));

    expect(onSeleccionar).toHaveBeenCalledWith(quesoColonia);
  });

  it('la búsqueda filtra por nombre o categoría ignorando acentos', () => {
    render(
      <GrillaProductos productos={[quesoColonia, mielFrasco]} piezasAgrupadas={new Map()} onSeleccionar={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'colonia' } });

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByText('Miel 500g')).toBeNull();
  });

  it('sin resultados muestra un mensaje', () => {
    render(
      <GrillaProductos productos={[quesoColonia]} piezasAgrupadas={new Map()} onSeleccionar={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'no existe' } });

    expect(screen.getByText('Sin resultados para "no existe".')).toBeTruthy();
  });

  it('marca "Sin stock" cuando no hay piezas disponibles', () => {
    render(
      <GrillaProductos productos={[quesoColonia]} piezasAgrupadas={new Map()} onSeleccionar={vi.fn()} />,
    );

    expect(screen.getByText('Sin stock')).toBeTruthy();
  });

  it('no marca "Sin stock" cuando hay unidades disponibles', () => {
    render(
      <GrillaProductos productos={[mielFrasco]} piezasAgrupadas={new Map()} onSeleccionar={vi.fn()} />,
    );

    expect(screen.queryByText('Sin stock')).toBeNull();
  });
});
