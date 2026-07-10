import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Categoria, type Pieza, type Producto } from '@gestion/core';
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

function categoriaDe(over: Partial<Categoria> & Pick<Categoria, 'nombre' | 'orden'>): Categoria {
  return { id: over.nombre, ...over };
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

const categoriasDeDos: Categoria[] = [
  categoriaDe({ nombre: 'Quesos', orden: 0 }),
  categoriaDe({ nombre: 'Miel', orden: 1 }),
];

describe('GrillaProductos', () => {
  it('muestra nombre, precio formateado e indicación del modo', () => {
    render(
      <GrillaProductos
        productos={[quesoColonia, mielFrasco]}
        piezasAgrupadas={new Map([['p1', [piezaDe({ id: 'pz1', productoId: 'p1' })]]])}
        categorias={[]}
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
        categorias={[]}
        onSeleccionar={onSeleccionar}
      />,
    );

    fireEvent.click(screen.getByText('Queso Colonia'));

    expect(onSeleccionar).toHaveBeenCalledWith(quesoColonia);
  });

  it('la búsqueda filtra por nombre o categoría ignorando acentos', () => {
    render(
      <GrillaProductos
        productos={[quesoColonia, mielFrasco]}
        piezasAgrupadas={new Map()}
        categorias={[]}
        onSeleccionar={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'colonia' } });

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByText('Miel 500g')).toBeNull();
  });

  it('sin resultados muestra un mensaje', () => {
    render(
      <GrillaProductos productos={[quesoColonia]} piezasAgrupadas={new Map()} categorias={[]} onSeleccionar={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'no existe' } });

    expect(screen.getByText('Sin resultados para "no existe".')).toBeTruthy();
  });

  it('marca "Sin stock" cuando no hay piezas disponibles', () => {
    render(
      <GrillaProductos productos={[quesoColonia]} piezasAgrupadas={new Map()} categorias={[]} onSeleccionar={vi.fn()} />,
    );

    expect(screen.getByText('Sin stock')).toBeTruthy();
  });

  it('no marca "Sin stock" cuando hay unidades disponibles', () => {
    render(
      <GrillaProductos productos={[mielFrasco]} piezasAgrupadas={new Map()} categorias={[]} onSeleccionar={vi.fn()} />,
    );

    expect(screen.queryByText('Sin stock')).toBeNull();
  });

  it('la card de un producto sin stock queda deshabilitada y no llama a onSeleccionar al tocarla', () => {
    const onSeleccionar = vi.fn();
    render(
      <GrillaProductos
        productos={[quesoColonia]}
        piezasAgrupadas={new Map()}
        categorias={[]}
        onSeleccionar={onSeleccionar}
      />,
    );

    const card = screen.getByRole('button', { name: /Queso Colonia/ }) as HTMLButtonElement;
    expect(card.disabled).toBe(true);

    fireEvent.click(card);

    expect(onSeleccionar).not.toHaveBeenCalled();
  });
});

describe('GrillaProductos - chips de filtro por categoría (docs/06-ui-ux.md §3, tarea UI-3d)', () => {
  it('sin categorías definidas, no muestra chips', () => {
    render(
      <GrillaProductos
        productos={[quesoColonia, mielFrasco]}
        piezasAgrupadas={new Map()}
        categorias={[]}
        onSeleccionar={vi.fn()}
      />,
    );

    expect(screen.queryByRole('group', { name: 'Filtrar por categoría' })).toBeNull();
  });

  it('con una sola categoría con productos, no muestra chips (no aportan)', () => {
    render(
      <GrillaProductos
        productos={[quesoColonia]}
        piezasAgrupadas={new Map()}
        categorias={[categoriaDe({ nombre: 'Quesos', orden: 0 })]}
        onSeleccionar={vi.fn()}
      />,
    );

    expect(screen.queryByRole('group', { name: 'Filtrar por categoría' })).toBeNull();
  });

  it('con dos o más categorías con productos, muestra "Todas" + una por categoría', () => {
    render(
      <GrillaProductos
        productos={[quesoColonia, mielFrasco]}
        piezasAgrupadas={new Map()}
        categorias={categoriasDeDos}
        onSeleccionar={vi.fn()}
      />,
    );

    const grupo = screen.getByRole('group', { name: 'Filtrar por categoría' });
    expect(screen.getByRole('button', { name: 'Todas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quesos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Miel' })).toBeTruthy();
    expect(grupo).toBeTruthy();
  });

  it('tocar un chip de categoría filtra la grilla', () => {
    render(
      <GrillaProductos
        productos={[quesoColonia, mielFrasco]}
        piezasAgrupadas={new Map()}
        categorias={categoriasDeDos}
        onSeleccionar={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByText('Miel 500g')).toBeNull();
    expect(screen.getByRole('button', { name: 'Quesos' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('compone con la búsqueda de texto (AND): el chip de categoría sigue elegido y la búsqueda además recorta dentro de ella', () => {
    const quesoAzul = productoDe({
      id: 'p3',
      nombre: 'Queso Azul',
      categoria: 'Quesos',
      modoStock: 'unidad_simple',
      modoPrecio: 'por_unidad',
      stockUnidades: 3,
    });

    render(
      <GrillaProductos
        productos={[quesoColonia, quesoAzul, mielFrasco]}
        piezasAgrupadas={new Map()}
        categorias={categoriasDeDos}
        onSeleccionar={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));
    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('Queso Azul')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'colonia' } });

    // La búsqueda recorta DENTRO de "Quesos" (que sigue elegido): "Queso
    // Azul" desaparece por no matchear el texto, no por la categoría.
    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByText('Queso Azul')).toBeNull();
    expect(screen.queryByText('Miel 500g')).toBeNull();
  });

  it('si la búsqueda deja sin chip a la categoría elegida, el filtro vuelve a "Todas" solo (no queda en un callejón sin salida)', () => {
    render(
      <GrillaProductos
        productos={[quesoColonia, mielFrasco]}
        piezasAgrupadas={new Map()}
        categorias={categoriasDeDos}
        onSeleccionar={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Miel' }));
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'colonia' } });

    // Con la búsqueda "colonia" solo queda la categoría "Quesos": los chips
    // se ocultan (una sola opción no aporta), pero el producto se ve — si el
    // filtro hubiera quedado apuntando a "Miel" (categoría ya sin chip), acá
    // se vería "Sin resultados" en su lugar.
    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Filtrar por categoría' })).toBeNull();

    // Confirma que el reset fue real (no solo que el chip está oculto):
    // borrar la búsqueda vuelve a traer ambas categorías, no solo "Miel".
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: '' } });
    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('Miel 500g')).toBeTruthy();
  });

  it('"Todas" vuelve a mostrar ambas categorías', () => {
    render(
      <GrillaProductos
        productos={[quesoColonia, mielFrasco]}
        piezasAgrupadas={new Map()}
        categorias={categoriasDeDos}
        onSeleccionar={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('Miel 500g')).toBeTruthy();
  });
});
