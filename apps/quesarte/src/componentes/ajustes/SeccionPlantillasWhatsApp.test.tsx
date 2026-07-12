import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FirestoreError } from 'firebase/firestore';
import { PLANTILLAS_SEED, type PlantillaWhatsApp } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { SeccionPlantillasWhatsApp } from './SeccionPlantillasWhatsApp';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  useDoc: vi.fn(),
  guardarPlantillasWhatsApp: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    useDoc: mocks.useDoc,
    guardarPlantillasWhatsApp: mocks.guardarPlantillasWhatsApp,
  };
});

vi.mock('../../firebase', () => ({ db: {} }));

interface RefFalsa {
  __path: string;
  withConverter: () => RefFalsa;
}

function crearRef(path: string): RefFalsa {
  const ref: RefFalsa = { __path: path, withConverter: () => ref };
  return ref;
}

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coleccion: string, id: string) => crearRef(`${coleccion}/${id}`),
}));

interface EstadoDocFalso {
  datos: PlantillaWhatsApp[] | null;
  cargando: boolean;
  error: FirestoreError | null;
}

function configurarPlantillas(estado: EstadoDocFalso) {
  mocks.useDoc.mockImplementation(() => estado);
}

function renderizar() {
  return render(
    <ProveedorToasts>
      <SeccionPlantillasWhatsApp />
    </ProveedorToasts>,
  );
}

describe('SeccionPlantillasWhatsApp', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
  });

  it('cargando', () => {
    configurarPlantillas({ datos: null, cargando: true, error: null });
    renderizar();
    expect(screen.getByText('Cargando plantillas…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón de reintento', () => {
    configurarPlantillas({ datos: null, cargando: false, error: { code: 'unavailable' } as FirestoreError });
    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las plantillas.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  describe('estado vacío (doc ausente o lista vacía)', () => {
    it('ofrece "Cargar plantillas iniciales"', () => {
      configurarPlantillas({ datos: null, cargando: false, error: null });
      renderizar();

      expect(screen.getByText('Todavía no hay plantillas de WhatsApp configuradas.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Cargar plantillas iniciales' })).toBeTruthy();
    });

    it('sembrar llama a guardarPlantillasWhatsApp con PLANTILLAS_SEED', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarPlantillas({ datos: [], cargando: false, error: null });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Cargar plantillas iniciales' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledWith({}, PLANTILLAS_SEED);
      expect(await screen.findByText('Plantillas iniciales cargadas.')).toBeTruthy();
    });
  });

  describe('con plantillas', () => {
    function configurarConSeed() {
      configurarPlantillas({ datos: PLANTILLAS_SEED as PlantillaWhatsApp[], cargando: false, error: null });
    }

    it('lista nombre y contexto legible de cada plantilla', () => {
      configurarConSeed();
      renderizar();

      expect(screen.getByText('Pedido listo')).toBeTruthy();
      expect(screen.getByText('Venta')).toBeTruthy();
      expect(screen.getByText('Te extrañamos')).toBeTruthy();
      expect(screen.getByText('Cliente inactivo')).toBeTruthy();
      expect(screen.getByText('Aviso de llegada')).toBeTruthy();
      // Match exacto: "Cliente" (aviso-llegada) no colisiona con "Cliente inactivo" (te-extranamos).
      expect(screen.getAllByText('Cliente')).toHaveLength(1);
    });

    it('editar: precarga nombre y texto, guarda la lista completa con el cambio', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarConSeed();
      renderizar();

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);

      const inputNombre = screen.getByLabelText('Nombre') as HTMLInputElement;
      expect(inputNombre.value).toBe('Pedido listo');

      fireEvent.change(inputNombre, { target: { value: 'Pedido para retirar' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      const [, listaGuardada] = mocks.guardarPlantillasWhatsApp.mock.calls[0] as [unknown, PlantillaWhatsApp[]];
      expect(listaGuardada).toHaveLength(3);
      expect(listaGuardada.find((p) => p.id === 'pedido-listo')?.nombre).toBe('Pedido para retirar');
      // El resto de la lista queda intacta (edición atómica de UN elemento).
      expect(listaGuardada.find((p) => p.id === 'te-extranamos')).toEqual(PLANTILLAS_SEED[1]);
      expect(await screen.findByText('Plantilla guardada.')).toBeTruthy();
    });

    it('"Restaurar texto original" repone el borrador del modal sin guardar todavía', () => {
      configurarConSeed();
      renderizar();

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Roto' } });
      fireEvent.click(screen.getByRole('button', { name: 'Restaurar texto original' }));

      expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Pedido listo');
      expect(mocks.guardarPlantillasWhatsApp).not.toHaveBeenCalled();
    });

    it('"Restaurar iniciales" pide confirmación y llama a guardarPlantillasWhatsApp con el seed completo', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarConSeed();
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Restaurar iniciales' }));
      expect(screen.getByText(/Se pierden los cambios/)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledWith({}, PLANTILLAS_SEED);
      expect(await screen.findByText('Plantillas restauradas.')).toBeTruthy();
    });

    it('cancelar la confirmación de "Restaurar iniciales" no llama a guardarPlantillasWhatsApp', () => {
      configurarConSeed();
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Restaurar iniciales' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(mocks.guardarPlantillasWhatsApp).not.toHaveBeenCalled();
    });

    it('sin conexión: dispara la escritura sin esperar y avisa con un toast informativo', () => {
      mocks.useOnlineStatus.mockReturnValue(false);
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarConSeed();
      renderizar();

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Guardado sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
    });
  });
});
