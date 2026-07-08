import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Firestore } from 'firebase/firestore';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { ModalAjusteNegativo } from './ModalAjusteNegativo';

const mocks = vi.hoisted(() => {
  class AjusteInvalidoError extends Error {}
  class StockInsuficienteError extends Error {}
  return {
    ajustarStock: vi.fn(),
    AjusteInvalidoError,
    StockInsuficienteError,
  };
});

vi.mock('@gestion/firebase-kit', () => ({
  ajustarStock: mocks.ajustarStock,
  AjusteInvalidoError: mocks.AjusteInvalidoError,
  StockInsuficienteError: mocks.StockInsuficienteError,
}));

const dbFalsa = {} as Firestore;

function productoPieza(): Producto {
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

function productoGranel(): Producto {
  return {
    id: 'prod2',
    nombre: 'Nuez mariposa',
    categoria: 'Frutos secos',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(50000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    modoStock: 'granel',
    stockGranelGramos: peso(2000),
  };
}

function unaPieza(): Pieza {
  return {
    id: 'pz1',
    productoId: 'prod1',
    pesoInicialGramos: peso(5000),
    pesoRestanteGramos: peso(4000),
    costoKgCents: money(30000),
    fechaIngreso: new Date('2026-01-01'),
    estado: 'disponible',
  };
}

function renderizar(props: Partial<Parameters<typeof ModalAjusteNegativo>[0]> = {}) {
  const onCerrar = vi.fn();
  render(
    <ProveedorToasts>
      <ModalAjusteNegativo
        abierto
        onCerrar={onCerrar}
        db={dbFalsa}
        producto={productoPieza()}
        usuarioId="admin-1"
        pieza={unaPieza()}
        {...props}
      />
    </ProveedorToasts>,
  );
  return { onCerrar };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ModalAjusteNegativo - motivo obligatorio', () => {
  it('confirmar sin motivo: no llama a ajustarStock', () => {
    renderizar();

    fireEvent.change(screen.getByLabelText('Cantidad a restar'), { target: { value: '0,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(mocks.ajustarStock).not.toHaveBeenCalled();
    expect(screen.getByText('El motivo es obligatorio.')).toBeTruthy();
  });

  it('confirmar sin cantidad: no llama a ajustarStock', () => {
    renderizar();

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'recuento' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(mocks.ajustarStock).not.toHaveBeenCalled();
    expect(screen.getByText('Ingresá una cantidad mayor a cero.')).toBeTruthy();
  });
});

describe('ModalAjusteNegativo - por pieza', () => {
  it('tipo "Ajuste" (default): llama a ajustarStock con delta negativo y la pieza', async () => {
    mocks.ajustarStock.mockResolvedValueOnce(undefined);
    const { onCerrar } = renderizar();

    fireEvent.change(screen.getByLabelText('Cantidad a restar'), { target: { value: '0,5' } }); // 500 g
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'se rompió el envase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.ajustarStock).toHaveBeenCalledTimes(1));
    expect(mocks.ajustarStock).toHaveBeenCalledWith(dbFalsa, {
      usuarioId: 'admin-1',
      tipo: 'ajuste_negativo',
      producto: productoPieza(),
      pieza: unaPieza(),
      deltaGramos: peso(-500),
      deltaUnidades: undefined,
      nota: 'se rompió el envase',
    });
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
  });

  it('tipo "Merma": llama a ajustarStock con tipo merma', async () => {
    mocks.ajustarStock.mockResolvedValueOnce(undefined);
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Merma' }));
    fireEvent.change(screen.getByLabelText('Cantidad a restar'), { target: { value: '4' } }); // toda la pieza
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'se echó a perder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.ajustarStock).toHaveBeenCalledTimes(1));
    expect(mocks.ajustarStock).toHaveBeenCalledWith(
      dbFalsa,
      expect.objectContaining({ tipo: 'merma', deltaGramos: peso(-4000) }),
    );
  });

  it('error StockInsuficienteError: toast claro y no cierra', async () => {
    mocks.ajustarStock.mockRejectedValueOnce(new mocks.StockInsuficienteError('no alcanza'));
    const { onCerrar } = renderizar();

    fireEvent.change(screen.getByLabelText('Cantidad a restar'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'prueba' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('No hay stock suficiente para ese ajuste.')).toBeTruthy();
    expect(onCerrar).not.toHaveBeenCalled();
  });
});

describe('ModalAjusteNegativo - producto granel (sin pieza)', () => {
  it('usa CantidadInput/PesoInput de granel y no pasa `pieza`', async () => {
    mocks.ajustarStock.mockResolvedValueOnce(undefined);
    renderizar({ producto: productoGranel(), pieza: undefined });

    fireEvent.change(screen.getByLabelText('Cantidad a restar'), { target: { value: '0,2' } }); // 200 g
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'recuento' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.ajustarStock).toHaveBeenCalledTimes(1));
    expect(mocks.ajustarStock).toHaveBeenCalledWith(dbFalsa, {
      usuarioId: 'admin-1',
      tipo: 'ajuste_negativo',
      producto: productoGranel(),
      pieza: undefined,
      deltaGramos: peso(-200),
      deltaUnidades: undefined,
      nota: 'recuento',
    });
  });
});
