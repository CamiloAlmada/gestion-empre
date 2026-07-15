import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Firestore } from 'firebase/firestore';
import { money, peso, type Producto } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { ModalSumarStock } from './ModalSumarStock';

const mocks = vi.hoisted(() => {
  class AjusteInvalidoError extends Error {}
  return {
    ajustarStock: vi.fn(),
    AjusteInvalidoError,
  };
});

vi.mock('@gestion/firebase-kit', () => ({
  ajustarStock: mocks.ajustarStock,
  AjusteInvalidoError: mocks.AjusteInvalidoError,
}));

const dbFalsa = {} as Firestore;

function productoGranel(): Producto {
  return {
    id: 'prod1',
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

function productoUnidad(): Producto {
  return {
    id: 'prod2',
    nombre: 'Miel 500g',
    categoria: 'Miel',
    modoPrecio: 'por_unidad',
    precioVentaCents: money(20000),
    costoPromedioCents: money(10000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    modoStock: 'unidad_simple',
    stockUnidades: 5,
  };
}

function renderizar(producto: Producto) {
  const onCerrar = vi.fn();
  render(
    <ProveedorToasts>
      <ModalSumarStock abierto onCerrar={onCerrar} db={dbFalsa} producto={producto} usuarioId="admin-1" />
    </ProveedorToasts>,
  );
  return { onCerrar };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ModalSumarStock - granel', () => {
  it('confirmar con peso llama a ajustarStock con ajuste_positivo y deltaGramos', async () => {
    mocks.ajustarStock.mockResolvedValueOnce(undefined);
    const { onCerrar } = renderizar(productoGranel());

    fireEvent.change(screen.getByLabelText('Cantidad a sumar'), { target: { value: '1,5' } }); // 1,5 kg
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.ajustarStock).toHaveBeenCalledTimes(1));
    expect(mocks.ajustarStock).toHaveBeenCalledWith(dbFalsa, {
      usuarioId: 'admin-1',
      tipo: 'ajuste_positivo',
      producto: productoGranel(),
      deltaGramos: peso(1500),
      deltaUnidades: undefined,
    });
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
  });

  it('confirmar sin peso: no llama a ajustarStock', () => {
    renderizar(productoGranel());

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(mocks.ajustarStock).not.toHaveBeenCalled();
    expect(screen.getByText('Ingresá un peso mayor a cero.')).toBeTruthy();
  });
});

describe('ModalSumarStock - unidad_simple', () => {
  it('confirmar con cantidad llama a ajustarStock con deltaUnidades', async () => {
    mocks.ajustarStock.mockResolvedValueOnce(undefined);
    renderizar(productoUnidad());

    fireEvent.change(screen.getByLabelText('Cantidad a sumar'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.ajustarStock).toHaveBeenCalledTimes(1));
    expect(mocks.ajustarStock).toHaveBeenCalledWith(dbFalsa, {
      usuarioId: 'admin-1',
      tipo: 'ajuste_positivo',
      producto: productoUnidad(),
      deltaGramos: undefined,
      deltaUnidades: 3,
    });
  });

  it('error tipado: muestra toast de error y no cierra', async () => {
    mocks.ajustarStock.mockRejectedValueOnce(new mocks.AjusteInvalidoError('delta invalido'));
    const { onCerrar } = renderizar(productoUnidad());

    fireEvent.change(screen.getByLabelText('Cantidad a sumar'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('No se pudo sumar el stock: revisá la cantidad ingresada.')).toBeTruthy();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  // AUDIT-1 (docs/03): `ModalSumarStock` es instancia ESTABLE (nunca se
  // desmonta, `DetalleProductoPantalla.tsx` la renderiza incondicionalmente,
  // `abierto` solo alterna un booleano). En `unidad_simple`, `CantidadInput`
  // es el primer campo SIN nada por delante que absorba el autofoco nativo
  // de `dialog.showModal()`. jsdom no lo implementa (ver test-setup.ts): se
  // reemplaza acá por una versión fiel a la spec para reproducir el mismo
  // comportamiento que un navegador real.
  describe('AUDIT-1: autofoco nativo de showModal() vs. reset del formulario al reabrir', () => {
    const showModalOriginal = HTMLDialogElement.prototype.showModal;

    function primerFocuseable(dialog: HTMLDialogElement): HTMLElement | null {
      return dialog.querySelector('input, button, select, textarea, [tabindex]');
    }

    beforeAll(() => {
      HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
        this.setAttribute('open', '');
        primerFocuseable(this)?.focus();
      };
    });

    afterAll(() => {
      HTMLDialogElement.prototype.showModal = showModalOriginal;
    });

    it('unidad_simple: escribir sin confirmar, cerrar y reabrir — el campo vuelve a mostrar vacío (antes del fix quedaba con el texto viejo)', () => {
      const onCerrar = vi.fn();
      const { rerender } = render(
        <ProveedorToasts>
          <ModalSumarStock abierto onCerrar={onCerrar} db={dbFalsa} producto={productoUnidad()} usuarioId="admin-1" />
        </ProveedorToasts>,
      );

      fireEvent.change(screen.getByLabelText('Cantidad a sumar'), { target: { value: '50' } });

      rerender(
        <ProveedorToasts>
          <ModalSumarStock
            abierto={false}
            onCerrar={onCerrar}
            db={dbFalsa}
            producto={productoUnidad()}
            usuarioId="admin-1"
          />
        </ProveedorToasts>,
      );
      rerender(
        <ProveedorToasts>
          <ModalSumarStock abierto onCerrar={onCerrar} db={dbFalsa} producto={productoUnidad()} usuarioId="admin-1" />
        </ProveedorToasts>,
      );

      expect((screen.getByLabelText('Cantidad a sumar') as HTMLInputElement).value).toBe('');
    });

    it('granel: PesoInput antepone sus botones g/kg — el autofoco cae ahí, el campo se resetea normalmente (ya protegido sin el fix)', () => {
      const onCerrar = vi.fn();
      const { rerender } = render(
        <ProveedorToasts>
          <ModalSumarStock abierto onCerrar={onCerrar} db={dbFalsa} producto={productoGranel()} usuarioId="admin-1" />
        </ProveedorToasts>,
      );

      fireEvent.change(screen.getByLabelText('Cantidad a sumar'), { target: { value: '1,5' } });

      rerender(
        <ProveedorToasts>
          <ModalSumarStock
            abierto={false}
            onCerrar={onCerrar}
            db={dbFalsa}
            producto={productoGranel()}
            usuarioId="admin-1"
          />
        </ProveedorToasts>,
      );
      rerender(
        <ProveedorToasts>
          <ModalSumarStock abierto onCerrar={onCerrar} db={dbFalsa} producto={productoGranel()} usuarioId="admin-1" />
        </ProveedorToasts>,
      );

      expect((screen.getByLabelText('Cantidad a sumar') as HTMLInputElement).value).toBe('');
    });
  });
});
