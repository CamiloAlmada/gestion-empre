import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { FirestoreError } from 'firebase/firestore';
import { useTemaNegocio } from '@gestion/ui';
import { generarPaleta, type TemaPersonalizado } from '@gestion/core';
import { SincronizadorTemaNegocio } from './SincronizadorTemaNegocio';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useDoc: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useAuth: mocks.useAuth,
    useDoc: mocks.useDoc,
  };
});

vi.mock('../firebase', () => ({ db: {} }));

interface RefFalsa {
  __path: string;
  __contador: number;
  withConverter: () => RefFalsa;
}

let contadorRefs = 0;

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coleccion: string, id: string): RefFalsa => {
    contadorRefs += 1;
    const ref: RefFalsa = { __path: `${coleccion}/${id}`, __contador: contadorRefs, withConverter: () => ref };
    return ref;
  },
}));

interface EstadoDocFalso {
  datos: TemaPersonalizado | null;
  cargando: boolean;
  error: FirestoreError | null;
}

function configurarUseDoc(estado: EstadoDocFalso) {
  mocks.useDoc.mockReturnValue(estado);
}

function configurarAuth(usuario: { uid: string } | null) {
  mocks.useAuth.mockReturnValue({
    usuario,
    perfil: null,
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn(),
  });
}

const SEMILLA_VALIDA: TemaPersonalizado = { version: 1, matiz: 200, tinte: 'frio' };
const ERROR_PERMISOS = { code: 'permission-denied' } as FirestoreError;

/** Sonda: expone si `useTemaNegocio().tokens` es `null` o no, y (si no lo
 * es) el hex de `--fondo-light` — suficiente para distinguir "sin tema",
 * "tema A" y "tema B" sin acoplarse a toda la superficie de `TokensGenerados`. */
function Sonda() {
  const { tokens } = useTemaNegocio();
  return <p>{tokens === null ? 'sin-tema' : `fondo:${tokens.variables['--fondo-light']}`}</p>;
}

function renderizar() {
  return render(
    <SincronizadorTemaNegocio>
      <Sonda />
    </SincronizadorTemaNegocio>,
  );
}

describe('SincronizadorTemaNegocio', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    contadorRefs = 0;
  });

  it('doc válido: el proveedor recibe los tokens generados por generarPaleta', () => {
    configurarAuth(null);
    configurarUseDoc({ datos: SEMILLA_VALIDA, cargando: false, error: null });

    renderizar();

    const esperado = generarPaleta(SEMILLA_VALIDA);
    expect(screen.getByText(`fondo:${esperado.variables['--fondo-light']}`)).toBeTruthy();
  });

  it('doc corrupto (converter tolerante devuelve null): tokens null', () => {
    configurarAuth(null);
    configurarUseDoc({ datos: null, cargando: false, error: null });

    renderizar();

    expect(screen.getByText('sin-tema')).toBeTruthy();
  });

  it('mientras carga: no hay nada confirmado, tokens arrancan en null', () => {
    configurarAuth(null);
    configurarUseDoc({ datos: null, cargando: true, error: null });

    renderizar();

    expect(screen.getByText('sin-tema')).toBeTruthy();
  });

  it('error de permisos (caso Login sin sesión) NO limpia un tema ya confirmado', () => {
    configurarAuth(null);
    configurarUseDoc({ datos: SEMILLA_VALIDA, cargando: false, error: null });

    const { rerender } = renderizar();

    const esperado = generarPaleta(SEMILLA_VALIDA);
    expect(screen.getByText(`fondo:${esperado.variables['--fondo-light']}`)).toBeTruthy();

    // Simula que la sesión se pierde (o nunca hubo) y el siguiente snapshot
    // llega como error de permisos: el tema ya confirmado NO debe borrarse.
    configurarUseDoc({ datos: null, cargando: false, error: ERROR_PERMISOS });
    rerender(
      <SincronizadorTemaNegocio>
        <Sonda />
      </SincronizadorTemaNegocio>,
    );

    expect(screen.getByText(`fondo:${esperado.variables['--fondo-light']}`)).toBeTruthy();
  });

  it('error de permisos SIN tema previo (Login real, primer arranque): se queda sin tema, no rompe', () => {
    configurarAuth(null);
    configurarUseDoc({ datos: null, cargando: false, error: ERROR_PERMISOS });

    renderizar();

    expect(screen.getByText('sin-tema')).toBeTruthy();
  });

  it('paleta inválida (fusible defensivo de generarPaleta): cae a null en silencio, sin romper', async () => {
    configurarAuth(null);
    configurarUseDoc({ datos: SEMILLA_VALIDA, cargando: false, error: null });

    const core = await import('@gestion/core');
    const espia = vi.spyOn(core, 'generarPaleta').mockImplementation(() => {
      throw new Error('paleta inválida simulada');
    });

    expect(() => renderizar()).not.toThrow();
    expect(screen.getByText('sin-tema')).toBeTruthy();

    espia.mockRestore();
  });

  it('la referencia al doc cambia de identidad al iniciar sesión (fuerza resuscripción)', () => {
    configurarAuth(null);
    configurarUseDoc({ datos: null, cargando: false, error: ERROR_PERMISOS });

    const { rerender } = renderizar();
    const primeraLlamada = mocks.useDoc.mock.calls[0]?.[0] as RefFalsa;

    configurarAuth({ uid: 'u1' });
    configurarUseDoc({ datos: SEMILLA_VALIDA, cargando: false, error: null });
    rerender(
      <SincronizadorTemaNegocio>
        <Sonda />
      </SincronizadorTemaNegocio>,
    );

    const segundaLlamada = mocks.useDoc.mock.calls.at(-1)?.[0] as RefFalsa;
    expect(segundaLlamada.__contador).not.toBe(primeraLlamada.__contador);
  });
});
