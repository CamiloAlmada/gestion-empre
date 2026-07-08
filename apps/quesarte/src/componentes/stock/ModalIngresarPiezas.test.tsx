import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Firestore } from 'firebase/firestore';
import { money, peso, type Producto } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { ModalIngresarPiezas } from './ModalIngresarPiezas';

const mocks = vi.hoisted(() => {
  class IngresoInvalidoError extends Error {}
  return {
    ingresarPiezas: vi.fn(),
    IngresoInvalidoError,
  };
});

vi.mock('@gestion/firebase-kit', () => ({
  ingresarPiezas: mocks.ingresarPiezas,
  IngresoInvalidoError: mocks.IngresoInvalidoError,
}));

const dbFalsa = {} as Firestore;

function producto(): Producto {
  return {
    id: 'prod1',
    nombre: 'Queso Colonia',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(50000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    modoStock: 'fraccionado_por_pieza',
  };
}

function renderizar(props: Partial<Parameters<typeof ModalIngresarPiezas>[0]> = {}) {
  const onCerrar = vi.fn();
  const utils = render(
    <ProveedorToasts>
      <ModalIngresarPiezas
        abierto
        onCerrar={onCerrar}
        db={dbFalsa}
        producto={producto()}
        usuarioId="admin-1"
        {...props}
      />
    </ProveedorToasts>,
  );
  return { ...utils, onCerrar };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ModalIngresarPiezas', () => {
  it('arranca con una sola fila de pieza', () => {
    renderizar();

    expect(screen.getByText('Pieza 1')).toBeTruthy();
    expect(screen.queryByText('Pieza 2')).toBeNull();
    expect(screen.queryByLabelText(/Quitar pieza/)).toBeNull();
  });

  it('"Agregar otra pieza" agrega una fila; "Quitar" la elimina', () => {
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar otra pieza' }));
    expect(screen.getByText('Pieza 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar pieza 2' }));
    expect(screen.queryByText('Pieza 2')).toBeNull();
  });

  it('confirmar con 2 filas llama a ingresarPiezas con el shape exacto', async () => {
    mocks.ingresarPiezas.mockResolvedValueOnce({ piezaIds: ['a', 'b'] });
    const { onCerrar } = renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar otra pieza' }));

    const pesos = screen.getAllByLabelText('Peso inicial');
    fireEvent.change(pesos[0]!, { target: { value: '5' } }); // 5 kg
    fireEvent.change(pesos[1]!, { target: { value: '3,5' } }); // 3,5 kg

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.ingresarPiezas).toHaveBeenCalledTimes(1));
    expect(mocks.ingresarPiezas).toHaveBeenCalledWith(dbFalsa, {
      producto: producto(),
      usuarioId: 'admin-1',
      piezas: [
        { pesoInicialGramos: peso(5000), fechaVencimiento: undefined },
        { pesoInicialGramos: peso(3500), fechaVencimiento: undefined },
      ],
    });
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
  });

  it('confirmar sin peso: no llama a ingresarPiezas y marca el error inline', () => {
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(mocks.ingresarPiezas).not.toHaveBeenCalled();
    expect(screen.getByText('Ingresá el peso de la pieza (mayor a cero).')).toBeTruthy();
  });

  it('error tipado (IngresoInvalidoError): muestra toast de error y no cierra el modal', async () => {
    mocks.ingresarPiezas.mockRejectedValueOnce(new mocks.IngresoInvalidoError('peso no positivo'));
    const { onCerrar } = renderizar();

    fireEvent.change(screen.getByLabelText('Peso inicial'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.ingresarPiezas).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(
        'No se pudo ingresar el stock: revisá los pesos y las fechas de vencimiento de cada pieza.',
      ),
    ).toBeTruthy();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('vencimiento anterior a hoy: error inline, no confirma', () => {
    renderizar();

    fireEvent.change(screen.getByLabelText('Peso inicial'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Vencimiento (opcional)'), { target: { value: '2020-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(mocks.ingresarPiezas).not.toHaveBeenCalled();
    expect(screen.getByText('No puede ser anterior a hoy.')).toBeTruthy();
  });
});
