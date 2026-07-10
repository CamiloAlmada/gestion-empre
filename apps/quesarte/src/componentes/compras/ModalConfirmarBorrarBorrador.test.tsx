import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Firestore } from 'firebase/firestore';
import { ProveedorToasts } from '@gestion/ui';
import { ModalConfirmarBorrarBorrador } from './ModalConfirmarBorrarBorrador';

const mocks = vi.hoisted(() => ({ deleteDoc: vi.fn() }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string, id: string) => ({ __path: `${path}/${id}` }),
  deleteDoc: mocks.deleteDoc,
}));

const dbFalsa = {} as Firestore;

function renderizar(props: Partial<Parameters<typeof ModalConfirmarBorrarBorrador>[0]> = {}) {
  const onCerrar = vi.fn();
  const onBorrado = vi.fn();
  const utils = render(
    <ProveedorToasts>
      <ModalConfirmarBorrarBorrador
        abierto
        onCerrar={onCerrar}
        db={dbFalsa}
        compraId="c1"
        proveedorNombre="Quesos del Norte"
        enLinea
        onBorrado={onBorrado}
        {...props}
      />
    </ProveedorToasts>,
  );
  return { ...utils, onCerrar, onBorrado };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ModalConfirmarBorrarBorrador', () => {
  it('confirma y borra: espera el ack, avisa y llama a onBorrado', async () => {
    mocks.deleteDoc.mockResolvedValueOnce(undefined);
    const { onBorrado } = renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar borrador' }));

    await waitFor(() => expect(mocks.deleteDoc).toHaveBeenCalledTimes(1));
    expect(mocks.deleteDoc).toHaveBeenCalledWith({ __path: 'compras/c1' });
    await waitFor(() => expect(onBorrado).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Borrador eliminado.')).toBeTruthy();
  });

  it('sin conexión: no espera el ack, avisa y llama a onBorrado al toque', async () => {
    mocks.deleteDoc.mockResolvedValueOnce(undefined);
    const { onBorrado } = renderizar({ enLinea: false });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar borrador' }));

    expect(onBorrado).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Borrador eliminado sin conexión. Se sincronizará al reconectar.'),
    ).toBeTruthy();
  });

  it('error al borrar: muestra toast de error y no llama a onBorrado', async () => {
    mocks.deleteDoc.mockRejectedValueOnce(new Error('boom'));
    const { onBorrado } = renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar borrador' }));

    expect(await screen.findByText('No se pudo eliminar el borrador. Intentá de nuevo.')).toBeTruthy();
    expect(onBorrado).not.toHaveBeenCalled();
  });
});
