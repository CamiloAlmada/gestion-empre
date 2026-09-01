import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProveedorToasts } from '@gestion/ui';
import { money, type Cliente } from '@gestion/core';
import type { DatosCliente } from '@gestion/firebase-kit';
import { ModalCliente, type ModalClienteProps } from './ModalCliente';

function clienteDe(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

function renderizar(overrides: Partial<ModalClienteProps> = {}) {
  const onGuardar = vi.fn();
  const onCerrar = vi.fn();
  const props: ModalClienteProps = {
    abierto: true,
    cliente: null,
    guardando: false,
    onGuardar,
    onCerrar,
    ...overrides,
  };
  render(
    <ProveedorToasts>
      <ModalCliente {...props} />
    </ProveedorToasts>,
  );
  return { onGuardar, onCerrar };
}

function paisSelect() {
  return screen.getByLabelText('País') as HTMLSelectElement;
}

function telefonoInput() {
  return screen.getByLabelText('Teléfono (opcional)') as HTMLInputElement;
}

function datosGuardados(onGuardar: ReturnType<typeof vi.fn>): DatosCliente {
  return (onGuardar.mock.calls[0] as [DatosCliente])[0];
}

afterEach(() => {
  cleanup();
});

describe('ModalCliente - selector de país (tester en España tomado como uruguayo)', () => {
  it('con nombre + España (+34) y teléfono "612 345 678", guarda telefono "+34 612 345 678"', () => {
    const { onGuardar } = renderizar();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Cliente España' } });
    fireEvent.change(paisSelect(), { target: { value: '34' } });
    fireEvent.change(telefonoInput(), { target: { value: '612 345 678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onGuardar).toHaveBeenCalledTimes(1);
    expect(datosGuardados(onGuardar).telefono).toBe('+34 612 345 678');
  });

  it('default Uruguay (+598) y teléfono "099 123 456": guarda sin prefijo, igual que siempre', () => {
    const { onGuardar } = renderizar();

    expect(paisSelect().value).toBe('598');

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Cliente Uruguay' } });
    fireEvent.change(telefonoInput(), { target: { value: '099 123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(datosGuardados(onGuardar).telefono).toBe('099 123 456');
  });

  it('editar un cliente con telefono "+34 612 345 678": precarga el selector en España y el input en "612 345 678"', () => {
    renderizar({ cliente: clienteDe({ id: 'c1', nombre: 'Ana', telefono: '+34 612 345 678' }) });

    expect(paisSelect().value).toBe('34');
    expect(telefonoInput().value).toBe('612 345 678');
  });

  it('editar un cliente con telefono "099 123 456": precarga el selector en Uruguay (default)', () => {
    renderizar({ cliente: clienteDe({ id: 'c1', nombre: 'Ana', telefono: '099 123 456' }) });

    expect(paisSelect().value).toBe('598');
    expect(telefonoInput().value).toBe('099 123 456');
  });

  it('editar un cliente con telefono "+7 999 000" (código fuera de la lista): precarga el default y el input muestra el crudo con "+"; guardar sin tocar lo deja intacto', () => {
    const { onGuardar } = renderizar({
      cliente: clienteDe({ id: 'c1', nombre: 'Ana', telefono: '+7 999 000' }),
    });

    expect(paisSelect().value).toBe('598');
    expect(telefonoInput().value).toBe('+7 999 000');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(datosGuardados(onGuardar).telefono).toBe('+7 999 000');
  });

  it('vaciar el teléfono: guarda telefono undefined', () => {
    const { onGuardar } = renderizar({
      cliente: clienteDe({ id: 'c1', nombre: 'Ana', telefono: '099 123 456' }),
    });

    fireEvent.change(telefonoInput(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(datosGuardados(onGuardar).telefono).toBeUndefined();
  });

  it('con codigoPaisDefault fuera de CODIGOS_PAIS (p. ej. un admin cargó uno no contemplado), el selector ofrece esa opción y no queda con un value huérfano', () => {
    renderizar({ codigoPaisDefault: '1234' });

    const select = paisSelect();
    expect(select.value).toBe('1234');
    expect(screen.getByText('Código +1234')).toBeTruthy();
  });
});

describe('ModalCliente - placeholder "Sin el 0 inicial" (país ≠ default: normalizarTelefono confía en los dígitos del +cc tal cual)', () => {
  it('elegir España (país ≠ default) muestra el placeholder en el teléfono', () => {
    renderizar();

    expect(telefonoInput().placeholder).toBe('');

    fireEvent.change(paisSelect(), { target: { value: '34' } });

    expect(telefonoInput().placeholder).toBe('Sin el 0 inicial');
  });

  it('volver a Uruguay (el default) saca el placeholder', () => {
    renderizar();

    fireEvent.change(paisSelect(), { target: { value: '34' } });
    expect(telefonoInput().placeholder).toBe('Sin el 0 inicial');

    fireEvent.change(paisSelect(), { target: { value: '598' } });

    expect(telefonoInput().placeholder).toBe('');
  });
});
