import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FirestoreError } from 'firebase/firestore';
import { ProveedorToasts } from '@gestion/ui';
import { SeccionNegocio } from './SeccionNegocio';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  useDoc: vi.fn(),
  guardarConfiguracionGeneral: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    useDoc: mocks.useDoc,
    guardarConfiguracionGeneral: mocks.guardarConfiguracionGeneral,
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

interface DatosConfiguracionFalsa {
  nombreNegocio?: string;
  codigoPaisDefault?: string;
}

interface EstadoDocFalso {
  datos: DatosConfiguracionFalsa | null;
  cargando: boolean;
  error: FirestoreError | null;
}

function configurarConfiguracion(estado: EstadoDocFalso) {
  mocks.useDoc.mockImplementation(() => estado);
}

function renderizar() {
  return render(
    <ProveedorToasts>
      <SeccionNegocio />
    </ProveedorToasts>,
  );
}

describe('SeccionNegocio', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
  });

  it('precarga el formulario con la configuración existente', () => {
    configurarConfiguracion({
      datos: { nombreNegocio: 'Quesarte', codigoPaisDefault: '598' },
      cargando: false,
      error: null,
    });

    renderizar();

    expect((screen.getByLabelText('Nombre del negocio') as HTMLInputElement).value).toBe('Quesarte');
    expect((screen.getByLabelText('Código de país') as HTMLInputElement).value).toBe('598');
  });

  it('sin config todavía: código de país arranca en 598 (default visual) y nombre vacío', () => {
    configurarConfiguracion({ datos: null, cargando: false, error: null });

    renderizar();

    expect((screen.getByLabelText('Nombre del negocio') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Código de país') as HTMLInputElement).value).toBe('598');
  });

  it('valida localmente el nombre vacío sin llamar a guardarConfiguracionGeneral', () => {
    configurarConfiguracion({ datos: { nombreNegocio: '', codigoPaisDefault: '598' }, cargando: false, error: null });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('Ingresá el nombre del negocio.')).toBeTruthy();
    expect(mocks.guardarConfiguracionGeneral).not.toHaveBeenCalled();
  });

  it('valida localmente un código de país inválido (letras, más de 4 dígitos)', () => {
    configurarConfiguracion({
      datos: { nombreNegocio: 'Quesarte', codigoPaisDefault: '598' },
      cargando: false,
      error: null,
    });
    renderizar();

    fireEvent.change(screen.getByLabelText('Código de país'), { target: { value: 'abcde' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('El código de país debe ser de 1 a 4 dígitos (sin +).')).toBeTruthy();
    expect(mocks.guardarConfiguracionGeneral).not.toHaveBeenCalled();
  });

  it('éxito: llama a guardarConfiguracionGeneral con nombre y código recortados', async () => {
    mocks.guardarConfiguracionGeneral.mockResolvedValue(undefined);
    configurarConfiguracion({
      datos: { nombreNegocio: 'Quesarte', codigoPaisDefault: '598' },
      cargando: false,
      error: null,
    });
    renderizar();

    fireEvent.change(screen.getByLabelText('Nombre del negocio'), { target: { value: '  Quesarte SRL  ' } });
    fireEvent.change(screen.getByLabelText('Código de país'), { target: { value: '54' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.guardarConfiguracionGeneral).toHaveBeenCalledTimes(1));
    expect(mocks.guardarConfiguracionGeneral).toHaveBeenCalledWith(
      {},
      { nombreNegocio: 'Quesarte SRL', codigoPaisDefault: '54' },
    );
    expect(await screen.findByText('Configuración del negocio guardada.')).toBeTruthy();
  });

  it('sin conexión: dispara la escritura sin esperar y avisa con un toast informativo', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.guardarConfiguracionGeneral.mockResolvedValue(undefined);
    configurarConfiguracion({
      datos: { nombreNegocio: 'Quesarte', codigoPaisDefault: '598' },
      cargando: false,
      error: null,
    });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(mocks.guardarConfiguracionGeneral).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Guardado sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
  });
});
