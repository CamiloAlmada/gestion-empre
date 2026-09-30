import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { cobroInicial, money, type Venta } from '@gestion/core';
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

  it('venta con cliente asociado: muestra el nombre del cliente (denormalizado, doc 07)', () => {
    render(
      <ListaVentas ventas={[venta({ clienteId: 'c1', clienteNombre: 'Ana Pérez' })]} onSeleccionar={() => {}} />,
    );

    expect(screen.getByText('Ana Pérez')).toBeTruthy();
  });

  it('venta anónima (sin clienteNombre): no agrega ningún placeholder tipo "sin cliente"', () => {
    render(<ListaVentas ventas={[venta()]} onSeleccionar={() => {}} />);

    expect(screen.queryByText(/sin cliente/i)).toBeNull();
  });

  it('tocar una fila llama a onSeleccionar con la venta', () => {
    const onSeleccionar = vi.fn();
    const v = venta();
    render(<ListaVentas ventas={[v]} onSeleccionar={onSeleccionar} />);

    fireEvent.click(screen.getByRole('button', { name: /Venta #1001/ }));

    expect(onSeleccionar).toHaveBeenCalledWith(v);
  });

  it('venta a cobrar: muestra el badge "A cobrar" y conserva el medio "A cobrar" de la fila', () => {
    render(
      <ListaVentas
        ventas={[venta({ medioPago: 'a_cobrar', clienteId: 'c1', cobro: cobroInicial() })]}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.getAllByText('A cobrar').length).toBe(2); // medio de pago + badge
    expect(screen.queryByText('Parcial')).toBeNull();
  });

  it('venta a cobrar con un pago parcial: muestra el badge "Parcial"', () => {
    render(
      <ListaVentas
        ventas={[
          venta({
            medioPago: 'a_cobrar',
            cobro: { v: 1, estado: 'pendiente', cobradoCents: money(10000), pagos: [] },
          }),
        ]}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.getByText('Parcial')).toBeTruthy();
  });

  it('venta a cobrar ya saldada: sin badge de cobro', () => {
    render(
      <ListaVentas
        ventas={[
          venta({
            medioPago: 'a_cobrar',
            cobro: { v: 1, estado: 'cobrada', cobradoCents: money(50000), pagos: [] },
          }),
        ]}
        onSeleccionar={() => {}}
      />,
    );

    // Solo queda el texto del medio de pago, sin badge.
    expect(screen.getAllByText('A cobrar').length).toBe(1);
    expect(screen.queryByText('Parcial')).toBeNull();
  });

  it('venta a cobrar ANULADA: solo el badge "Anulada" (no se cobra)', () => {
    render(
      <ListaVentas
        ventas={[venta({ medioPago: 'a_cobrar', estado: 'anulada', cobro: cobroInicial() })]}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.getByText('Anulada')).toBeTruthy();
    expect(screen.getAllByText('A cobrar').length).toBe(1);
  });

  it('venta cobrada en el mostrador (sin cobro): sin badge de cobro', () => {
    render(<ListaVentas ventas={[venta()]} onSeleccionar={() => {}} />);

    expect(screen.queryByText('Parcial')).toBeNull();
    expect(screen.queryByText('A cobrar')).toBeNull();
  });
});
