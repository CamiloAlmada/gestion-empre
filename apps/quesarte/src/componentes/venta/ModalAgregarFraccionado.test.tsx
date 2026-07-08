import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import { ModalAgregarFraccionado } from './ModalAgregarFraccionado';

afterEach(cleanup);

function productoDe(over: Partial<Producto> & Pick<Producto, 'id'>): Producto {
  return {
    nombre: 'Queso Colonia',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    modoStock: 'fraccionado_por_pieza',
    precioVentaCents: money(89900),
    costoPromedioCents: money(50000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function piezaDe(over: Partial<Pieza> & Pick<Pieza, 'id' | 'fechaIngreso'>): Pieza {
  return {
    productoId: 'p1',
    pesoInicialGramos: peso(1000),
    pesoRestanteGramos: peso(1000),
    costoKgCents: money(30000),
    estado: 'disponible',
    ...over,
  };
}

const producto = productoDe({ id: 'p1' });

function tipear(gramos: string) {
  // Modo kg por defecto: tipea dígitos usando el teclado propio.
  for (const char of gramos) {
    if (char === ',') {
      fireEvent.click(screen.getByRole('button', { name: 'Coma decimal' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: char }));
    }
  }
}

describe('ModalAgregarFraccionado', () => {
  it('elige automáticamente la pieza FIFO (la más antigua) y arma el aviso "De:"', () => {
    const piezas = [
      piezaDe({ id: 'c', fechaIngreso: new Date('2026-01-10T10:00:00') }),
      piezaDe({ id: 'a', fechaIngreso: new Date('2026-01-01T10:00:00') }),
      piezaDe({ id: 'b', fechaIngreso: new Date('2026-01-05T10:00:00') }),
    ];
    const onAgregar = vi.fn();
    render(
      <ModalAgregarFraccionado
        abierto
        onCerrar={vi.fn()}
        producto={producto}
        piezasDisponibles={piezas}
        onAgregar={onAgregar}
      />,
    );

    tipear('0,2'); // 200 g

    expect(screen.getByText(/De: pieza del 01\/01\/2026/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onAgregar).toHaveBeenCalledWith(piezas[1], peso(200));
  });

  it('override manual reemplaza la elección FIFO', () => {
    const piezas = [
      piezaDe({ id: 'a', fechaIngreso: new Date('2026-01-01T10:00:00') }),
      piezaDe({ id: 'b', fechaIngreso: new Date('2026-01-05T10:00:00') }),
    ];
    const onAgregar = vi.fn();
    render(
      <ModalAgregarFraccionado
        abierto
        onCerrar={vi.fn()}
        producto={producto}
        piezasDisponibles={piezas}
        onAgregar={onAgregar}
      />,
    );

    tipear('0,2');
    // FIFO eligió la pieza 'a' (la más antigua); se cambia a mano por 'b'.
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar pieza' }));
    fireEvent.click(screen.getByText(/Pieza del 05\/01\/2026/));

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onAgregar).toHaveBeenCalledWith(piezas[1], peso(200));
  });

  it('suficiente === false muestra el aviso y "Agregar" queda deshabilitado', () => {
    const piezas = [
      piezaDe({ id: 'a', fechaIngreso: new Date('2026-01-01T10:00:00'), pesoRestanteGramos: peso(150) }),
    ];
    const onAgregar = vi.fn();
    render(
      <ModalAgregarFraccionado
        abierto
        onCerrar={vi.fn()}
        producto={producto}
        piezasDisponibles={piezas}
        onAgregar={onAgregar}
      />,
    );

    tipear('0,2'); // pide 200 g, la pieza solo tiene 150 g

    expect(screen.getByRole('alert').textContent).toContain('menos de lo pedido');
    expect((screen.getByRole('button', { name: 'Agregar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onAgregar).not.toHaveBeenCalled();
  });

  it('"Usar lo que queda" ajusta el peso al restante de la pieza y habilita agregar', () => {
    const piezas = [
      piezaDe({ id: 'a', fechaIngreso: new Date('2026-01-01T10:00:00'), pesoRestanteGramos: peso(150) }),
    ];
    const onAgregar = vi.fn();
    render(
      <ModalAgregarFraccionado
        abierto
        onCerrar={vi.fn()}
        producto={producto}
        piezasDisponibles={piezas}
        onAgregar={onAgregar}
      />,
    );

    tipear('0,2');
    fireEvent.click(screen.getByRole('button', { name: /Usar lo que queda/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onAgregar).toHaveBeenCalledWith(piezas[0], peso(150));
  });

  it('sin piezas disponibles muestra el aviso y no permite tipear', () => {
    render(
      <ModalAgregarFraccionado
        abierto
        onCerrar={vi.fn()}
        producto={producto}
        piezasDisponibles={[]}
        onAgregar={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('No hay piezas disponibles');
    expect(screen.queryByRole('button', { name: '1' })).toBeNull();
  });

  it('cancelar llama a onCerrar', () => {
    const onCerrar = vi.fn();
    render(
      <ModalAgregarFraccionado
        abierto
        onCerrar={onCerrar}
        producto={producto}
        piezasDisponibles={[piezaDe({ id: 'a', fechaIngreso: new Date('2026-01-01T10:00:00') })]}
        onAgregar={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCerrar).toHaveBeenCalled();
  });
});
