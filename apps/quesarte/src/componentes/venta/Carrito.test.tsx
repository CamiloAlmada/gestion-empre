import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Producto } from '@gestion/core';
import { Carrito } from './Carrito';
import { crearItemGranel, crearItemUnidad } from './itemsCarrito';

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

describe('Carrito', () => {
  it('carrito vacío: sin ítems, "Cobrar" deshabilitado', () => {
    render(<Carrito items={[]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0);
    const botonesCobrar = screen.getAllByRole('button', { name: 'Cobrar' });
    for (const boton of botonesCobrar) {
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('muestra los ítems, el detalle y el total (sumarMoney)', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg', precioVentaCents: money(45000) });
    const item = crearItemGranel(producto, peso(300), 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    expect(screen.getAllByText('Producto').length).toBeGreaterThan(0);
    // 45000 * 300 / 1000 = 13500 -> $ 135,00
    expect(screen.getAllByText('$ 135,00').length).toBeGreaterThan(0);

    const botonesCobrar = screen.getAllByRole('button', { name: 'Cobrar' });
    for (const boton of botonesCobrar) {
      expect((boton as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('quitar un ítem llama a onQuitar con su clave, SIN pedir confirmación', () => {
    const onQuitar = vi.fn();
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 2, 'clave-x');

    render(<Carrito items={[item]} onQuitar={onQuitar} onCobrar={vi.fn()} procesando={false} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar Producto del carrito' })[0]!);

    expect(onQuitar).toHaveBeenCalledWith('clave-x');
  });

  it('tocar "Cobrar" llama a onCobrar', () => {
    const onCobrar = vi.fn();
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={onCobrar} procesando={false} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);

    expect(onCobrar).toHaveBeenCalled();
  });

  it('procesando deshabilita "Cobrar" aunque haya ítems', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando />);

    for (const boton of screen.getAllByRole('button', { name: 'Cobrar' })) {
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('el resumen móvil se expande y contrae mostrando el conteo de ítems', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    const resumen = screen.getByRole('button', { name: /1 ítem/ });
    expect(resumen.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(resumen);

    expect(resumen.getAttribute('aria-expanded')).toBe('true');
  });

  it('carrito colapsado: no hay scrim en el DOM', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    expect(screen.queryByTestId('scrim-carrito')).toBeNull();
  });

  it('expandido: el scrim está presente; tocarlo colapsa el carrito', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));
    const scrim = screen.getByTestId('scrim-carrito');
    expect(scrim.getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(scrim);

    const resumen = screen.getByRole('button', { name: /1 ítem/ });
    expect(resumen.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('scrim-carrito')).toBeNull();
  });

  it('expandido: keydown Escape colapsa el carrito', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));
    expect(screen.getByTestId('scrim-carrito')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });

    const resumen = screen.getByRole('button', { name: /1 ítem/ });
    expect(resumen.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('scrim-carrito')).toBeNull();
  });
});
