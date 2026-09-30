import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, type Cliente, type DeudaCliente } from '@gestion/core';
import { ListaClientesConDeuda, type FilaDeuda } from './ListaClientesConDeuda';

const mocks = vi.hoisted(() => ({ botonWhatsApp: vi.fn() }));

vi.mock('../whatsapp/BotonWhatsApp', () => ({
  BotonWhatsApp: (props: { contexto: string }) => {
    mocks.botonWhatsApp(props);
    return <button type="button">WhatsApp ({props.contexto})</button>;
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function deuda(over: Partial<DeudaCliente> & Pick<DeudaCliente, 'clienteId' | 'clienteNombre'>): DeudaCliente {
  return {
    deudaCents: money(100000),
    cantidadVentas: 1,
    fechaMasAntigua: new Date('2026-09-01'),
    diasDeuda: 3,
    ...over,
  };
}

function clienteDe(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

function renderizar(filas: FilaDeuda[], onSeleccionar = vi.fn()) {
  render(<ListaClientesConDeuda filas={filas} db={{} as never} onSeleccionar={onSeleccionar} />);
  return onSeleccionar;
}

describe('ListaClientesConDeuda', () => {
  it('muestra "Debe $X · N ventas · hace D días"', () => {
    renderizar([{ deuda: deuda({ clienteId: 'c1', clienteNombre: 'Ana', deudaCents: money(250000), cantidadVentas: 3, diasDeuda: 12 }) }]);

    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText('Debe $ 2.500,00 · 3 ventas · hace 12 días')).toBeTruthy();
  });

  it('singulares: 1 venta y hace 1 día', () => {
    renderizar([{ deuda: deuda({ clienteId: 'c1', clienteNombre: 'Ana', cantidadVentas: 1, diasDeuda: 1 }) }]);

    expect(screen.getByText('Debe $ 1.000,00 · 1 venta · hace 1 día')).toBeTruthy();
  });

  it('0 días: "desde hoy"', () => {
    renderizar([{ deuda: deuda({ clienteId: 'c1', clienteNombre: 'Ana', diasDeuda: 0 }) }]);

    expect(screen.getByText('Debe $ 1.000,00 · 1 venta · desde hoy')).toBeTruthy();
  });

  it('respeta el orden recibido', () => {
    renderizar([
      { deuda: deuda({ clienteId: 'c2', clienteNombre: 'Zoe' }) },
      { deuda: deuda({ clienteId: 'c1', clienteNombre: 'Ana' }) },
    ]);

    const filas = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(filas[0]).toContain('Zoe');
    expect(filas[1]).toContain('Ana');
  });

  it('usa el nombre vigente del cliente si está cargado; si no, el denormalizado de la venta', () => {
    renderizar([
      { deuda: deuda({ clienteId: 'c1', clienteNombre: 'Ana vieja' }), cliente: clienteDe({ id: 'c1', nombre: 'Ana Nueva' }) },
      { deuda: deuda({ clienteId: 'c2', clienteNombre: 'Beto de la venta' }) },
    ]);

    expect(screen.getByText('Ana Nueva')).toBeTruthy();
    expect(screen.queryByText('Ana vieja')).toBeNull();
    expect(screen.getByText('Beto de la venta')).toBeTruthy();
  });

  it('WhatsApp: contexto "cobro", teléfono del cliente y valores formateados', () => {
    renderizar([
      {
        deuda: deuda({ clienteId: 'c1', clienteNombre: 'Ana', deudaCents: money(250000), diasDeuda: 12 }),
        cliente: clienteDe({ id: 'c1', nombre: 'Ana', telefono: '099 111 222', telefonoE164: '59899111222' }),
      },
    ]);

    expect(mocks.botonWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        contexto: 'cobro',
        telefono: '099 111 222',
        telefonoE164: '59899111222',
        valores: { cliente: 'Ana', deuda: '$ 2.500,00', diasDeuda: '12' },
      }),
    );
  });

  it('tocar la fila avisa el clienteId; el botón de WhatsApp no dispara la navegación', () => {
    const onSeleccionar = renderizar([{ deuda: deuda({ clienteId: 'c7', clienteNombre: 'Ana' }) }]);

    fireEvent.click(screen.getByRole('button', { name: /WhatsApp/ }));
    expect(onSeleccionar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Ana.*Debe/ }));
    expect(onSeleccionar).toHaveBeenCalledWith('c7');
  });
});
