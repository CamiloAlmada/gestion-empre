import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { money, type Venta } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { ModalConfirmarAnulacion } from './ModalConfirmarAnulacion';

const mocks = vi.hoisted(() => {
  class AnulacionInvalidaError extends Error {}
  return { anularVenta: vi.fn(), AnulacionInvalidaError };
});

vi.mock('@gestion/firebase-kit', () => ({
  anularVenta: mocks.anularVenta,
  AnulacionInvalidaError: mocks.AnulacionInvalidaError,
}));

function venta(over: Partial<Venta> = {}): Venta {
  return {
    id: 'v1',
    numero: 1001,
    fecha: new Date('2026-01-05T14:30:00'),
    usuarioId: 'u1',
    items: [],
    totalCents: money(50000),
    medioPago: 'efectivo',
    estado: 'completada',
    ...over,
  };
}

function renderizar(props: Partial<Parameters<typeof ModalConfirmarAnulacion>[0]> = {}) {
  return render(
    <ProveedorToasts>
      <ModalConfirmarAnulacion
        abierto={true}
        onCerrar={props.onCerrar ?? (() => {})}
        db={{} as never}
        venta={venta()}
        usuarioId="admin1"
        enLinea={true}
        {...props}
      />
    </ProveedorToasts>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ModalConfirmarAnulacion - contenido', () => {
  it('explica el efecto de la anulación', () => {
    renderizar();
    expect(
      screen.getByText(
        'Restaura el stock descontado y marca la venta como anulada. No se puede deshacer.',
      ),
    ).toBeTruthy();
  });
});

describe('ModalConfirmarAnulacion - en línea', () => {
  it('éxito: llama a anularVenta con la venta y el uid, muestra toast y cierra', async () => {
    mocks.anularVenta.mockResolvedValue(undefined);
    const onCerrar = vi.fn();
    renderizar({ onCerrar, enLinea: true });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    await waitFor(() => expect(mocks.anularVenta).toHaveBeenCalledWith({}, venta(), 'admin1'));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(screen.getByText('Venta anulada. Se restauró el stock.')).toBeTruthy();
  });

  it('AnulacionInvalidaError: muestra mensaje específico y no cierra', async () => {
    mocks.anularVenta.mockRejectedValue(new mocks.AnulacionInvalidaError('ya anulada'));
    const onCerrar = vi.fn();
    renderizar({ onCerrar, enLinea: true });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    await waitFor(() => expect(screen.getByText('Esta venta ya fue anulada.')).toBeTruthy());
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('error genérico: muestra mensaje genérico', async () => {
    mocks.anularVenta.mockRejectedValue(new Error('boom'));
    renderizar({ enLinea: true });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    await waitFor(() =>
      expect(screen.getByText('No se pudo anular la venta. Intentá de nuevo.')).toBeTruthy(),
    );
  });
});

describe('ModalConfirmarAnulacion - offline (patrón §8)', () => {
  it('dispara la escritura sin esperar, cierra y avisa con toast info', async () => {
    let resolverPromesa: () => void = () => {};
    mocks.anularVenta.mockReturnValue(
      new Promise<void>((resolve) => {
        resolverPromesa = resolve;
      }),
    );
    const onCerrar = vi.fn();
    renderizar({ onCerrar, enLinea: false });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    // Sin esperar el resolve de anularVenta: ya cerró y avisó.
    expect(onCerrar).toHaveBeenCalled();
    expect(
      screen.getByText('Anulación guardada sin conexión. Se sincronizará al reconectar.'),
    ).toBeTruthy();

    resolverPromesa();
    await Promise.resolve();
  });

  it('si el servidor rechaza la sincronización, avisa con un toast de error', async () => {
    mocks.anularVenta.mockRejectedValue(new Error('rechazada al sincronizar'));
    renderizar({ enLinea: false });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    await waitFor(() =>
      expect(
        screen.getByText('No se pudo anular la venta al sincronizar. Revisala en el historial.'),
      ).toBeTruthy(),
    );
  });
});
