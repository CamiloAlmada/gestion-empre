import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, type Venta } from '@gestion/core';
import { ListaVentas } from './ListaVentas';

function venta(over: Partial<Venta> = {}): Venta {
  return {
    id: 'v1',
    numero: 1001,
    fecha: new Date(2026, 0, 5, 14, 30),
    usuarioId: 'u1',
    items: [
      {
        productoId: 'p1',
        nombreProducto: 'Queso Colonia',
        precioUnitCents: money(100000),
        subtotalCents: money(50000),
      },
    ],
    totalCents: money(50000),
    medioPago: 'efectivo',
    estado: 'completada',
    ...over,
  };
}

afterEach(() => cleanup());

describe('ListaVentas', () => {
  it('muestra número, fecha/hora, cantidad de ítems, total y medio de pago', () => {
    render(<ListaVentas ventas={[venta()]} onSeleccionar={() => {}} />);

    expect(screen.getByText('Venta #1001')).toBeTruthy();
    expect(screen.getByText('05/01/2026 14:30')).toBeTruthy();
    expect(screen.getByText('1 ítem')).toBeTruthy();
    expect(screen.getByText('$ 500,00')).toBeTruthy();
    expect(screen.getByText('Efectivo')).toBeTruthy();
  });

  it('venta anulada: muestra el badge "Anulada"', () => {
    render(<ListaVentas ventas={[venta({ estado: 'anulada' })]} onSeleccionar={() => {}} />);

    expect(screen.getByText('Anulada')).toBeTruthy();
  });

  it('venta completada: no muestra ningún badge de estado', () => {
    render(<ListaVentas ventas={[venta()]} onSeleccionar={() => {}} />);

    expect(screen.queryByText('Anulada')).toBeNull();
  });

  it('tocar una fila llama a onSeleccionar con la venta', () => {
    const onSeleccionar = vi.fn();
    const v = venta();
    render(<ListaVentas ventas={[v]} onSeleccionar={onSeleccionar} />);

    fireEvent.click(screen.getByRole('button', { name: /Venta #1001/ }));

    expect(onSeleccionar).toHaveBeenCalledWith(v);
  });
});
