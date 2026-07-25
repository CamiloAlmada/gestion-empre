import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FirestoreError } from 'firebase/firestore';
import type { Configuracion } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { SeccionAlertas } from './SeccionAlertas';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  useDoc: vi.fn(),
  guardarDiasAvisoVencimiento: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    useDoc: mocks.useDoc,
    guardarDiasAvisoVencimiento: mocks.guardarDiasAvisoVencimiento,
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
  datos: Configuracion | null;
  cargando: boolean;
  error: FirestoreError | null;
}

function configurarConfiguracion(estado: EstadoDocFalso) {
  mocks.useDoc.mockImplementation(() => estado);
}

function renderizar() {
  return render(
    <ProveedorToasts>
      <SeccionAlertas />
    </ProveedorToasts>,
  );
}

function campoDias(): HTMLInputElement {
  return screen.getByLabelText('Avisar vencimientos con') as HTMLInputElement;
}

function guardar() {
  fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.useOnlineStatus.mockReturnValue(true);
});

describe('SeccionAlertas', () => {
  it('sin configuración guardada arranca en el default de core (7 días)', () => {
    configurarConfiguracion({ datos: null, cargando: false, error: null });

    renderizar();

    expect(campoDias().value).toBe('7');
  });

  it('precarga el valor configurado por el negocio', () => {
    configurarConfiguracion({ datos: { diasAvisoVencimiento: 21 }, cargando: false, error: null });

    renderizar();

    expect(campoDias().value).toBe('21');
  });

  it('guarda el valor tipeado', async () => {
    configurarConfiguracion({ datos: null, cargando: false, error: null });
    mocks.guardarDiasAvisoVencimiento.mockResolvedValue(undefined);

    renderizar();
    fireEvent.change(campoDias(), { target: { value: '14' } });
    guardar();

    await waitFor(() => {
      expect(mocks.guardarDiasAvisoVencimiento).toHaveBeenCalledWith({}, 14);
    });
  });

  it('rechaza 0 sin escribir nada (avisar el día del vencimiento es tarde)', () => {
    configurarConfiguracion({ datos: null, cargando: false, error: null });

    renderizar();
    fireEvent.change(campoDias(), { target: { value: '0' } });
    guardar();

    expect(screen.getByText(/entre 1 y 90/)).toBeTruthy();
    expect(mocks.guardarDiasAvisoVencimiento).not.toHaveBeenCalled();
  });

  it('rechaza un valor por encima del máximo', () => {
    configurarConfiguracion({ datos: null, cargando: false, error: null });

    renderizar();
    fireEvent.change(campoDias(), { target: { value: '120' } });
    guardar();

    expect(screen.getByText(/entre 1 y 90/)).toBeTruthy();
    expect(mocks.guardarDiasAvisoVencimiento).not.toHaveBeenCalled();
  });

  it('rechaza un decimal (rompería el conteo de días de calendario)', () => {
    configurarConfiguracion({ datos: null, cargando: false, error: null });

    renderizar();
    fireEvent.change(campoDias(), { target: { value: '7.5' } });
    guardar();

    expect(screen.getByText(/entre 1 y 90/)).toBeTruthy();
    expect(mocks.guardarDiasAvisoVencimiento).not.toHaveBeenCalled();
  });

  it('rechaza el campo vacío', () => {
    configurarConfiguracion({ datos: null, cargando: false, error: null });

    renderizar();
    fireEvent.change(campoDias(), { target: { value: '' } });
    guardar();

    expect(screen.getByText(/entre 1 y 90/)).toBeTruthy();
    expect(mocks.guardarDiasAvisoVencimiento).not.toHaveBeenCalled();
  });

  it('sin conexión: dispara la escritura y avisa que falta sincronizar, sin colgar el formulario', async () => {
    configurarConfiguracion({ datos: null, cargando: false, error: null });
    mocks.useOnlineStatus.mockReturnValue(false);
    // Sin conexión la promesa de Firestore no resuelve hasta reconectar.
    mocks.guardarDiasAvisoVencimiento.mockReturnValue(new Promise(() => {}));

    renderizar();
    fireEvent.change(campoDias(), { target: { value: '10' } });
    guardar();

    expect(mocks.guardarDiasAvisoVencimiento).toHaveBeenCalledWith({}, 10);
    expect(await screen.findByText(/Se sincronizará al reconectar/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
  });
});
