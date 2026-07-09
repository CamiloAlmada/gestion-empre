import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BarraPestanas, type ItemBarraPestanas } from './BarraPestanas';

const items: ItemBarraPestanas[] = [
  { id: 'stock', etiqueta: 'Stock', icono: <span>S</span> },
  { id: 'historial', etiqueta: 'Historial', icono: <span>H</span> },
  { id: 'venta', etiqueta: 'Venta', icono: <span>V</span>, central: true },
  { id: 'reportes', etiqueta: 'Reportes', icono: <span>R</span> },
  { id: 'ajustes', etiqueta: 'Ajustes', icono: <span>A</span> },
];

describe('BarraPestanas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderiza los 5 items con sus labels visibles', () => {
    render(<BarraPestanas items={items} activa="venta" onSeleccionar={vi.fn()} />);

    expect(screen.getByText('Stock')).toBeTruthy();
    expect(screen.getByText('Historial')).toBeTruthy();
    expect(screen.getByText('Reportes')).toBeTruthy();
    expect(screen.getByText('Ajustes')).toBeTruthy();
  });

  it('tiene exactamente un item central, renderizado como botón con nombre accesible', () => {
    render(<BarraPestanas items={items} activa="venta" onSeleccionar={vi.fn()} />);

    const central = screen.getByRole('button', { name: 'Venta' });
    expect(central).toBeTruthy();
  });

  it('marca aria-current="page" en el tab activo y no en los demás', () => {
    render(<BarraPestanas items={items} activa="stock" onSeleccionar={vi.fn()} />);

    const stockBtn = screen.getByRole('button', { name: /Stock/ });
    const historialBtn = screen.getByRole('button', { name: /Historial/ });

    expect(stockBtn.getAttribute('aria-current')).toBe('page');
    expect(historialBtn.getAttribute('aria-current')).toBeNull();
  });

  it('llama a onSeleccionar con el id al tocar un tab', () => {
    const onSeleccionar = vi.fn();
    render(<BarraPestanas items={items} activa="stock" onSeleccionar={onSeleccionar} />);

    fireEvent.click(screen.getByRole('button', { name: /Historial/ }));

    expect(onSeleccionar).toHaveBeenCalledWith('historial');
  });

  it('llama a onSeleccionar con el id del item central al tocarlo', () => {
    const onSeleccionar = vi.fn();
    render(<BarraPestanas items={items} activa="stock" onSeleccionar={onSeleccionar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Venta' }));

    expect(onSeleccionar).toHaveBeenCalledWith('venta');
  });

  it('usa aria-label="Navegación principal" en el <nav>', () => {
    render(<BarraPestanas items={items} activa="stock" onSeleccionar={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeTruthy();
  });

  it('la barra base queda pegada a los 3 bordes (Minimalista, sin cambios)', () => {
    render(<BarraPestanas items={items} activa="stock" onSeleccionar={vi.fn()} />);

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(nav.className).toContain('inset-x-0');
    expect(nav.className).toContain('bottom-0');
    expect(nav.className).toContain('border-t');
  });

  it('trae los overrides `calido:` para la píldora flotante despegada (docs/06-ui-ux.md §4, TH-F)', () => {
    render(<BarraPestanas items={items} activa="stock" onSeleccionar={vi.fn()} />);

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    // Despegada de los laterales y del borde inferior.
    expect(nav.className).toContain('calido:inset-x-3');
    expect(nav.className).toContain('calido:bottom-[max(env(safe-area-inset-bottom),0.75rem)]');
    // Forma píldora + sombra flotante en vez de la franja translúcida con borde superior.
    expect(nav.className).toContain('calido:rounded-flotante');
    expect(nav.className).toContain('calido:shadow-flotante');
    // Borde perimetral (no solo arriba) y sin el padding de safe-area de la base.
    expect(nav.className).toContain('calido:border');
    expect(nav.className).toContain('calido:border-borde');
    expect(nav.className).toContain('calido:border-t-0');
    expect(nav.className).toContain('calido:pb-0');
  });
});
