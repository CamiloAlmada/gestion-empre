import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, type Cliente } from '@gestion/core';
import { ListaClientes } from './ListaClientes';

function cliente(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

afterEach(() => cleanup());

describe('ListaClientes', () => {
  it('muestra nombre, alias, cantidad de ventas y última compra', () => {
    render(
      <ListaClientes
        clientes={[
          cliente({
            id: 'c1',
            nombre: 'Ana Pérez',
            alias: 'Anita',
            stats: {
              cantidadVentas: 3,
              totalHistoricoCents: money(150000),
              ultimaCompra: new Date(2026, 0, 5),
            },
          }),
        ]}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByText('Anita')).toBeTruthy();
    expect(screen.getByText('3 ventas')).toBeTruthy();
    expect(screen.getByText('05/01/2026')).toBeTruthy();
  });

  it('sin ventas: muestra "Sin compras" en vez de una fecha', () => {
    render(
      <ListaClientes
        clientes={[cliente({ id: 'c1', nombre: 'Carlos Núñez' })]}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.getByText('Sin compras')).toBeTruthy();
    expect(screen.getByText('0 ventas')).toBeTruthy();
  });

  it('sin alias: no muestra un renglón de alias', () => {
    render(
      <ListaClientes
        clientes={[cliente({ id: 'c1', nombre: 'Carlos Núñez' })]}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.queryByText('undefined')).toBeNull();
  });

  it('cliente inactivo: muestra el badge "Inactivo"', () => {
    render(
      <ListaClientes
        clientes={[cliente({ id: 'c1', nombre: 'Marta López', activo: false })]}
        onSeleccionar={() => {}}
      />,
    );

    expect(screen.getByText('Inactivo')).toBeTruthy();
  });

  it('cliente activo: no muestra el badge "Inactivo"', () => {
    render(
      <ListaClientes clientes={[cliente({ id: 'c1', nombre: 'Ana Pérez' })]} onSeleccionar={() => {}} />,
    );

    expect(screen.queryByText('Inactivo')).toBeNull();
  });

  it('tocar una fila llama a onSeleccionar con el cliente', () => {
    const onSeleccionar = vi.fn();
    const c = cliente({ id: 'c1', nombre: 'Ana Pérez' });
    render(<ListaClientes clientes={[c]} onSeleccionar={onSeleccionar} />);

    fireEvent.click(screen.getByRole('button', { name: /Ana Pérez/ }));

    expect(onSeleccionar).toHaveBeenCalledWith(c);
  });
});
