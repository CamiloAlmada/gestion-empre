import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { FirestoreError } from 'firebase/firestore';
import { aplicarTemaNegocio, escribirCacheTemaNegocio, useTemaNegocio } from '@gestion/ui';
import { generarPaleta, type TemaPersonalizado, type TokensGenerados } from '@gestion/core';
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

/** Sonda: expone el tri-estado de `useTemaNegocio().tokens` — `undefined`
 * ("todavía no sé"), `null` ("confirmado: sin tema") o el hex de
 * `--fondo-light` — sin acoplarse a toda la superficie de `TokensGenerados`. */
function Sonda() {
  const { tokens } = useTemaNegocio();
  let texto: string;
  if (tokens === undefined) {
    texto = 'cargando';
  } else if (tokens === null) {
    texto = 'sin-tema';
  } else {
    texto = `fondo:${tokens.variables['--fondo-light']}`;
  }
  return <p>{texto}</p>;
}

function renderizar() {
  return render(
    <SincronizadorTemaNegocio>
      <Sonda />
    </SincronizadorTemaNegocio>,
  );
}

function limpiarDom(): void {
  document.getElementById('tema-negocio')?.remove();
  document.documentElement.removeAttribute('data-tema-negocio');
}

describe('SincronizadorTemaNegocio', () => {
  beforeEach(() => {
    limpiarDom();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    contadorRefs = 0;
    limpiarDom();
    window.localStorage.clear();
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

  it('mientras carga: no hay nada confirmado, tokens arrancan en undefined (BLOQ-1, no null)', () => {
    configurarAuth(null);
    configurarUseDoc({ datos: null, cargando: true, error: null });

    renderizar();

    expect(screen.getByText('cargando')).toBeTruthy();
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

  it('error de permisos SIN tema previo (Login real, primer arranque): se queda en "no sé" (undefined, BLOQ-1), no rompe', () => {
    configurarAuth(null);
    configurarUseDoc({ datos: null, cargando: false, error: ERROR_PERMISOS });

    renderizar();

    // Nunca hubo una respuesta CONFIRMADA (ni doc ni ausencia de doc): el
    // estado se queda en `undefined`, no colapsa a `null` ("sin tema").
    expect(screen.getByText('cargando')).toBeTruthy();
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

  // BLOQ-1 (review senior de la tanda TM, TM7): tests de integración de
  // punta a punta — `SincronizadorTemaNegocio` REAL + `ProveedorTemaNegocio`
  // REAL (ninguno de los dos mockeado en este archivo) — que reproducen
  // exactamente el bug de producción y prueban el fix. Antes del tri-estado,
  // el estado arrancaba en `null` ("confirmado sin tema"): el PRIMER render,
  // aun con `useDoc` todavía cargando o en `/login` con permission-denied
  // permanente, pisaba con `limpiarTemaNegocio()`/`borrarCacheTemaNegocio()`
  // lo que el script anti-FOUC de `index.html` ya había pintado en el DOM y
  // en `localStorage` ANTES de que React montara.
  describe('integración con ProveedorTemaNegocio real: no pisar el anti-FOUC (BLOQ-1)', () => {
    function simularAntiFouc(): TokensGenerados {
      const tokens = generarPaleta(SEMILLA_VALIDA);
      aplicarTemaNegocio(tokens);
      escribirCacheTemaNegocio(tokens);
      return tokens;
    }

    it('(a) primer arranque con cache: useDoc todavía cargando → el style, el atributo y el cache quedan INTACTOS', () => {
      const tokensCache = simularAntiFouc();
      configurarAuth(null);
      configurarUseDoc({ datos: null, cargando: true, error: null });

      renderizar();

      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
      expect(document.getElementById('tema-negocio')?.textContent).toContain(
        tokensCache.variables['--fondo-light'],
      );
      expect(window.localStorage.getItem('temaNegocio')).not.toBeNull();
    });

    it('(b) permission-denied desde el arranque (/login sin sesión): ídem intactos', () => {
      const tokensCache = simularAntiFouc();
      configurarAuth(null);
      configurarUseDoc({ datos: null, cargando: false, error: ERROR_PERMISOS });

      renderizar();

      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
      expect(document.getElementById('tema-negocio')?.textContent).toContain(
        tokensCache.variables['--fondo-light'],
      );
      expect(window.localStorage.getItem('temaNegocio')).not.toBeNull();
    });

    it('(c) doc CONFIRMADO inexistente: limpia el DOM y el cache que había dejado el anti-FOUC', () => {
      simularAntiFouc();
      configurarAuth(null);
      configurarUseDoc({ datos: null, cargando: false, error: null });

      renderizar();

      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
      expect(window.localStorage.getItem('temaNegocio')).toBeNull();
      expect(screen.getByText('sin-tema')).toBeTruthy();
    });
  });
});
