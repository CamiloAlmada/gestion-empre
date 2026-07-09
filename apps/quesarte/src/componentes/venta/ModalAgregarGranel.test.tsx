import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Producto } from '@gestion/core';
import { ModalAgregarGranel } from './ModalAgregarGranel';
import { crearItemGranel } from './itemsCarrito';

afterEach(cleanup);

function productoDe(over: Partial<Producto>): Producto {
  return {
    id: 'p1',
    nombre: 'Nuez mariposa',
    categoria: 'Frutos secos',
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(45000),
    costoPromedioCents: money(20000),
    stockGranelGramos: peso(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function tipear(texto: string) {
  for (const char of texto) {
    if (char === ',') {
      fireEvent.click(screen.getByRole('button', { name: 'Coma decimal' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: char }));
    }
  }
}

describe('ModalAgregarGranel', () => {
  it('agrega el peso tipeado cuando no excede el stock', () => {
    const onAgregar = vi.fn();
    render(<ModalAgregarGranel abierto onCerrar={vi.fn()} producto={productoDe({})} onAgregar={onAgregar} />);

    tipear('0,2'); // 200 g, stock 500 g
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onAgregar).toHaveBeenCalledWith(peso(200));
  });

  it('avisa y deshabilita "Agregar" si el peso excede el stock disponible', () => {
    const onAgregar = vi.fn();
    render(<ModalAgregarGranel abierto onCerrar={vi.fn()} producto={productoDe({})} onAgregar={onAgregar} />);

    tipear('0,6'); // 600 g > 500 g disponibles

    expect(screen.getByRole('alert').textContent).toContain('Superás el stock disponible');
    expect((screen.getByRole('button', { name: 'Agregar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  describe('modo edición (itemEnEdicion)', () => {
    it('precarga el peso actual y cambia el copy a Editar/Guardar', () => {
      const producto = productoDe({ stockGranelGramos: peso(900) });
      const itemEnEdicion = crearItemGranel(producto, peso(300), 'clave-x');
      render(
        <ModalAgregarGranel abierto onCerrar={vi.fn()} producto={producto} onAgregar={vi.fn()} itemEnEdicion={itemEnEdicion} />,
      );

      expect(screen.getByText(`Editar · ${producto.nombre}`)).toBeTruthy();
      expect(screen.getByRole('textbox').textContent).toBe('0,3kg');
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
    });

    it('caso clave: pieza justa (granel) — subir a exactamente el stock disponible es válido', () => {
      const producto = productoDe({ stockGranelGramos: peso(900) });
      const itemEnEdicion = crearItemGranel(producto, peso(300), 'clave-x');
      const onAgregar = vi.fn();
      render(
        <ModalAgregarGranel
          abierto
          onCerrar={vi.fn()}
          producto={producto}
          onAgregar={onAgregar}
          itemEnEdicion={itemEnEdicion}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));
      fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));
      tipear('0,9'); // 900 g, exactamente el stock disponible.
      expect(screen.queryByRole('alert')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(onAgregar).toHaveBeenCalledWith(peso(900));
    });

    it('sin itemEnEdicion: comportamiento actual EXACTO (título y botón "Agregar", buffer vacío)', () => {
      render(<ModalAgregarGranel abierto onCerrar={vi.fn()} producto={productoDe({})} onAgregar={vi.fn()} />);

      expect(screen.getByText(`Agregar · Nuez mariposa`)).toBeTruthy();
      expect(screen.getByRole('textbox').textContent).toBe('0kg');
      expect(screen.getByRole('button', { name: 'Agregar' })).toBeTruthy();
    });
  });
});
