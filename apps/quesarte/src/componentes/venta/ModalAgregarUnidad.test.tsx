import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, type Producto } from '@gestion/core';
import { ModalAgregarUnidad } from './ModalAgregarUnidad';

afterEach(cleanup);

function productoDe(over: Partial<Producto>): Producto {
  return {
    id: 'p1',
    nombre: 'Miel 500g',
    categoria: 'Miel',
    modoPrecio: 'por_unidad',
    modoStock: 'unidad_simple',
    precioVentaCents: money(45000),
    costoPromedioCents: money(20000),
    stockUnidades: 3,
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

describe('ModalAgregarUnidad', () => {
  it('arranca en 1 unidad y agrega esa cantidad', () => {
    const onAgregar = vi.fn();
    render(<ModalAgregarUnidad abierto onCerrar={vi.fn()} producto={productoDe({})} onAgregar={onAgregar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onAgregar).toHaveBeenCalledWith(1);
  });

  it('el stepper no supera el stock disponible', () => {
    render(<ModalAgregarUnidad abierto onCerrar={vi.fn()} producto={productoDe({ stockUnidades: 2 })} onAgregar={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Agregar una unidad' }));
    expect(screen.getByText('2')).toBeTruthy();

    // Ya llegó al tope: el botón "+" queda deshabilitado y no sube de 2.
    expect((screen.getByRole('button', { name: 'Agregar una unidad' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una unidad' }));
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('el stepper no baja de 1', () => {
    render(<ModalAgregarUnidad abierto onCerrar={vi.fn()} producto={productoDe({})} onAgregar={vi.fn()} />);

    expect((screen.getByRole('button', { name: 'Quitar una unidad' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar una unidad' }));
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('sin stock disponible avisa y deshabilita "Agregar"', () => {
    const onAgregar = vi.fn();
    render(
      <ModalAgregarUnidad
        abierto
        onCerrar={vi.fn()}
        producto={productoDe({ stockUnidades: 0 })}
        onAgregar={onAgregar}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Sin stock disponible');
    expect((screen.getByRole('button', { name: 'Agregar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
