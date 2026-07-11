import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, type Producto } from '@gestion/core';
import { SelectorProductoCompra } from './SelectorProductoCompra';

function productoDe(over: Partial<Producto> & Pick<Producto, 'id' | 'nombre'>): Producto {
  return {
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(0),
    costoPromedioCents: money(0),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function renderizar(props: Partial<Parameters<typeof SelectorProductoCompra>[0]> = {}) {
  const onCerrar = vi.fn();
  const onSeleccionar = vi.fn();
  const utils = render(
    <SelectorProductoCompra
      abierto
      onCerrar={onCerrar}
      productos={[]}
      cargando={false}
      error={false}
      proveedorId={null}
      productoIdsAgregados={new Set()}
      onSeleccionar={onSeleccionar}
      {...props}
    />,
  );
  return { ...utils, onCerrar, onSeleccionar };
}

afterEach(cleanup);

describe('SelectorProductoCompra', () => {
  it('sin proveedor: lista todos los productos sin sección de sugeridos', () => {
    renderizar({
      productos: [productoDe({ id: 'p1', nombre: 'Queso Colonia' }), productoDe({ id: 'p2', nombre: 'Miel' })],
    });

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('Miel')).toBeTruthy();
    expect(screen.queryByText('Sugeridos de este proveedor')).toBeNull();
  });

  it('con proveedor: separa sugeridos (proveedorPrincipalId coincidente) del resto', () => {
    renderizar({
      proveedorId: 'prov1',
      productos: [
        productoDe({ id: 'p1', nombre: 'Queso Colonia', proveedorPrincipalId: 'prov1' }),
        productoDe({ id: 'p2', nombre: 'Miel', proveedorPrincipalId: 'prov2' }),
      ],
    });

    expect(screen.getByText('Sugeridos de este proveedor')).toBeTruthy();
    expect(screen.getByText('Todos los productos')).toBeTruthy();
    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('Miel')).toBeTruthy();
  });

  it('la búsqueda filtra por nombre ignorando acentos', () => {
    renderizar({
      productos: [productoDe({ id: 'p1', nombre: 'Queso Añejo' }), productoDe({ id: 'p2', nombre: 'Miel' })],
    });

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'anejo' } });

    expect(screen.getByText('Queso Añejo')).toBeTruthy();
    expect(screen.queryByText('Miel')).toBeNull();
  });

  it('tocar un producto llama a onSeleccionar con ese producto', () => {
    const producto = productoDe({ id: 'p1', nombre: 'Queso Colonia' });
    const { onSeleccionar } = renderizar({ productos: [producto] });

    fireEvent.click(screen.getByRole('button', { name: /Queso Colonia/ }));

    expect(onSeleccionar).toHaveBeenCalledWith(producto);
  });

  it('el contenedor scrolleable de resultados lleva aire lateral para que el ring de foco no se recorte (UI-4f)', () => {
    const { container } = renderizar({
      productos: [productoDe({ id: 'p1', nombre: 'Queso Colonia' })],
    });

    const scrolleable = container.querySelector('.overflow-y-auto') as HTMLElement;
    expect(scrolleable).toBeTruthy();
    expect(scrolleable.className).toContain('px-0.5');
    expect(scrolleable.className).toContain('-mx-0.5');
  });

  it('un producto ya agregado muestra el badge "Agregado" pero sigue tocable', () => {
    const producto = productoDe({ id: 'p1', nombre: 'Queso Colonia' });
    const { onSeleccionar } = renderizar({ productos: [producto], productoIdsAgregados: new Set(['p1']) });

    expect(screen.getByText('Agregado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Queso Colonia/ }));
    expect(onSeleccionar).toHaveBeenCalledWith(producto);
  });

  it('estado cargando', () => {
    renderizar({ cargando: true });
    expect(screen.getByText('Cargando catálogo…')).toBeTruthy();
  });

  it('estado error', () => {
    renderizar({ error: true });
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar el catálogo.');
  });

  it('sin resultados', () => {
    renderizar({ productos: [productoDe({ id: 'p1', nombre: 'Queso Colonia' })] });
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'zzz' } });
    expect(screen.getByText('Sin resultados.')).toBeTruthy();
  });
});
