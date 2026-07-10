import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, type Cliente } from '@gestion/core';
import { SelectorCliente, type SelectorClienteProps } from './SelectorCliente';

afterEach(cleanup);

function clienteDe(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

const marta = clienteDe({ id: 'c1', nombre: 'Marta Fernández', alias: 'Marta la de enfrente' });
const juan = clienteDe({ id: 'c2', nombre: 'Juan Pérez', telefono: '099123456' });

function renderModal(props: Partial<SelectorClienteProps> = {}) {
  return render(
    <SelectorCliente
      abierto={true}
      onCerrar={vi.fn()}
      clientes={[marta, juan]}
      cargando={false}
      error={false}
      onSeleccionar={vi.fn()}
      onCrear={vi.fn()}
      {...props}
    />,
  );
}

describe('SelectorCliente', () => {
  it('cerrado: no muestra nada (dialog no abierto)', () => {
    renderModal({ abierto: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lista los clientes activos recibidos', () => {
    renderModal();
    expect(screen.getByText('Marta Fernández')).toBeTruthy();
    expect(screen.getByText('Juan Pérez')).toBeTruthy();
  });

  it('cargando: muestra el estado de carga, no la lista', () => {
    renderModal({ cargando: true });
    expect(screen.getByText('Cargando clientes…')).toBeTruthy();
    expect(screen.queryByText('Marta Fernández')).toBeNull();
  });

  it('error: muestra el aviso pero permite seguir creando (alta rápida no depende de la lectura)', () => {
    renderModal({ error: true });
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la lista de clientes');
  });

  it('sin búsqueda: no hay botón de alta rápida (no hay texto que crear)', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: /Crear/ })).toBeNull();
  });

  it('busca por nombre (case/acentos-insensible)', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Buscar por nombre, alias o teléfono'), {
      target: { value: 'MARTA' },
    });

    expect(screen.getByText('Marta Fernández')).toBeTruthy();
    expect(screen.queryByText('Juan Pérez')).toBeNull();
  });

  it('busca por alias', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Buscar por nombre, alias o teléfono'), {
      target: { value: 'enfrente' },
    });

    expect(screen.getByText('Marta Fernández')).toBeTruthy();
    expect(screen.queryByText('Juan Pérez')).toBeNull();
  });

  it('busca por teléfono', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Buscar por nombre, alias o teléfono'), {
      target: { value: '099123' },
    });

    expect(screen.getByText('Juan Pérez')).toBeTruthy();
    expect(screen.queryByText('Marta Fernández')).toBeNull();
  });

  it('sin resultados: muestra el aviso y el botón de alta rápida para el texto tipeado', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Buscar por nombre, alias o teléfono'), {
      target: { value: 'Nadie' },
    });

    expect(screen.getByText('Sin resultados.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear «Nadie»' })).toBeTruthy();
  });

  it('tocar un resultado llama a onSeleccionar con ese cliente', () => {
    const onSeleccionar = vi.fn();
    renderModal({ onSeleccionar });

    fireEvent.click(screen.getByText('Marta Fernández'));

    expect(onSeleccionar).toHaveBeenCalledWith(marta);
  });

  it('alta rápida: "Crear «texto»" llama a onCrear con el nombre recortado', () => {
    const onCrear = vi.fn();
    renderModal({ onCrear });

    fireEvent.change(screen.getByLabelText('Buscar por nombre, alias o teléfono'), {
      target: { value: '  Nuevo Cliente  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear «Nuevo Cliente»' }));

    expect(onCrear).toHaveBeenCalledWith('Nuevo Cliente');
  });

  it('al reabrir, la búsqueda arranca en blanco (no arrastra la anterior)', () => {
    const { rerender } = renderModal({ abierto: false });
    rerender(
      <SelectorCliente
        abierto={true}
        onCerrar={vi.fn()}
        clientes={[marta, juan]}
        cargando={false}
        error={false}
        onSeleccionar={vi.fn()}
        onCrear={vi.fn()}
      />,
    );

    expect((screen.getByLabelText('Buscar por nombre, alias o teléfono') as HTMLInputElement).value).toBe('');
  });
});
