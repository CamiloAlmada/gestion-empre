import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money } from '@gestion/core';
import { ModalGastoCompra } from './ModalGastoCompra';

function renderizar(props: Partial<Parameters<typeof ModalGastoCompra>[0]> = {}) {
  const onCerrar = vi.fn();
  const onConfirmar = vi.fn();
  const utils = render(
    <ModalGastoCompra abierto onCerrar={onCerrar} gastoExistente={null} onConfirmar={onConfirmar} {...props} />,
  );
  return { ...utils, onCerrar, onConfirmar };
}

afterEach(cleanup);

describe('ModalGastoCompra', () => {
  it('arranca en "Combustible" por defecto', () => {
    renderizar();
    expect(screen.getByRole('button', { name: 'Combustible' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('agrega un gasto con concepto, descripción y monto', () => {
    const { onConfirmar } = renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Peaje' }));
    fireEvent.change(screen.getByLabelText('Descripción (opcional)'), { target: { value: 'Ruta 1' } });
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onConfirmar).toHaveBeenCalledWith({ concepto: 'peaje', descripcion: 'Ruta 1', montoCents: money(25000) });
  });

  it('sin monto: no confirma y marca el error', () => {
    const { onConfirmar } = renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText('Ingresá un monto mayor a cero.')).toBeTruthy();
  });

  it('edición: precarga concepto, descripción y monto del gasto existente', () => {
    renderizar({
      gastoExistente: { concepto: 'flete', descripcion: 'Camión', montoCents: money(80000) },
    });

    expect(screen.getByRole('button', { name: 'Flete' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Descripción (opcional)') as HTMLInputElement).value).toBe('Camión');
    expect((screen.getByLabelText('Monto') as HTMLInputElement).value).toBe('800,00');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
  });
});
