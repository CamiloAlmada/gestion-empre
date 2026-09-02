import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Usuario } from '@gestion/core';
import { ProveedorAuth, useAuth } from './ProveedorAuth';

const mocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  desuscribirAuth: vi.fn(),
  desuscribirSnapshot: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  signOut: mocks.signOut,
}));

vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  onSnapshot: mocks.onSnapshot,
}));

const authFalso = {} as Auth;
const dbFalso = {} as Firestore;

/** Captura el callback que `onAuthStateChanged` recibe, para dispararlo a mano. */
let emitirAuth: (usuario: User | null) => void;
/** Forma mínima del `DocumentSnapshot` que el provider consume. */
interface SnapshotFalso {
  exists: () => boolean;
  data: () => Usuario;
  metadata: { fromCache: boolean };
}
/** Callbacks que `onSnapshot` recibe (next/error) por cada suscripción abierta. */
let onNextSnapshot: (snap: SnapshotFalso) => void;
let onErrorSnapshot: (error: unknown) => void;
/** Opciones con las que se abrió la última suscripción al perfil. */
let opcionesSnapshot: { includeMetadataChanges?: boolean } | undefined;

function envolver({ children }: { children: ReactNode }) {
  return (
    <ProveedorAuth auth={authFalso} db={dbFalso}>
      {children}
    </ProveedorAuth>
  );
}

/**
 * Snapshot falso. `fromCache` por defecto en `false` = confirmado por el
 * servidor, que es el caso normal de los tests que ya existían.
 */
function snapshotDe(usuario: Usuario | null, fromCache = false): SnapshotFalso {
  return {
    exists: () => usuario !== null,
    data: () => usuario as Usuario,
    metadata: { fromCache },
  };
}

const usuarioAuthFalso = { uid: 'u1' } as User;
const perfilActivo: Usuario = {
  uid: 'u1',
  nombre: 'Ana',
  email: 'ana@quesarte.uy',
  rol: 'admin',
  activo: true,
};

describe('ProveedorAuth / useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onAuthStateChanged.mockImplementation((_auth: Auth, cb: (u: User | null) => void) => {
      emitirAuth = cb;
      return mocks.desuscribirAuth;
    });
    mocks.doc.mockReturnValue({ withConverter: () => ({}) });
    opcionesSnapshot = undefined;
    mocks.onSnapshot.mockImplementation(
      (
        _ref: unknown,
        // El provider siempre suscribe con opciones: `onSnapshot(ref, opciones,
        // next, error)`. Capturarlas por posición como hace `useCollection.test.ts`.
        opciones: { includeMetadataChanges?: boolean },
        next: (snap: SnapshotFalso) => void,
        error: (e: unknown) => void,
      ) => {
        opcionesSnapshot = opciones;
        onNextSnapshot = next;
        onErrorSnapshot = error;
        return mocks.desuscribirSnapshot;
      },
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('arranca cargando con usuario y perfil en null', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    expect(result.current.cargando).toBe(true);
    expect(result.current.usuario).toBeNull();
    expect(result.current.perfil).toBeNull();
  });

  it('sin sesión (auth resuelve en null): cargando pasa a false y no suscribe perfil', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(null);
    });

    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    expect(result.current.usuario).toBeNull();
    expect(result.current.perfil).toBeNull();
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
  });

  it('transición cargando → sesión con perfil activo', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });

    // Con sesión pero sin snapshot todavía, sigue cargando (no expone perfil null).
    expect(result.current.cargando).toBe(true);
    expect(result.current.usuario).toBe(usuarioAuthFalso);

    act(() => {
      onNextSnapshot(snapshotDe(perfilActivo));
    });

    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    expect(result.current.perfil).toEqual(perfilActivo);
  });

  it('perfil inactivo: se expone con activo=false y cargando=false (el guard decide)', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    act(() => {
      onNextSnapshot(snapshotDe({ ...perfilActivo, activo: false }));
    });

    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    expect(result.current.perfil?.activo).toBe(false);
  });

  it('perfil inexistente confirmado por el servidor: perfil null, cargando false', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    act(() => {
      onNextSnapshot(snapshotDe(null, false));
    });

    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    expect(result.current.perfil).toBeNull();
  });

  it('suscribe el perfil con includeMetadataChanges', () => {
    renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });

    expect(opcionesSnapshot).toEqual({ includeMetadataChanges: true });
  });

  // Bug de producción 2026-09-02: con la caché de Firestore vacía y sin red,
  // el SDK no falla — entrega un snapshot vacío desde caché. Tomarlo como
  // "no existe" mostraba "Cuenta no autorizada" a un admin con doc válido.
  it('snapshot vacío desde caché: NO resuelve, sigue cargando y no toca el perfil', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    act(() => {
      onNextSnapshot(snapshotDe(null, true));
    });

    expect(result.current.cargando).toBe(true);
    expect(result.current.perfil).toBeNull();
  });

  it('snapshot vacío desde caché y luego confirmación del servidor: recién ahí resuelve en null', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    act(() => {
      onNextSnapshot(snapshotDe(null, true));
    });
    expect(result.current.cargando).toBe(true);

    act(() => {
      onNextSnapshot(snapshotDe(null, false));
    });

    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    expect(result.current.perfil).toBeNull();
  });

  it('snapshot vacío desde caché y luego el perfil real: entra sin haber pasado por no autorizado', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    act(() => {
      onNextSnapshot(snapshotDe(null, true));
    });
    expect(result.current.cargando).toBe(true);

    act(() => {
      onNextSnapshot(snapshotDe(perfilActivo, false));
    });

    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    expect(result.current.perfil).toEqual(perfilActivo);
  });

  // Regla de oro 6: el mostrador puede quedarse sin internet. Un perfil
  // cacheado es una respuesta válida, a diferencia de un "no existe" cacheado.
  it('perfil existente desde caché: se acepta y resuelve (offline-first)', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    act(() => {
      onNextSnapshot(snapshotDe(perfilActivo, true));
    });

    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    expect(result.current.perfil).toEqual(perfilActivo);
  });

  it('la confirmación del servidor con los mismos datos no cambia la identidad del perfil', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    act(() => {
      onNextSnapshot(snapshotDe(perfilActivo, true));
    });
    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    const perfilDesdeCache = result.current.perfil;

    // Mismo contenido, objeto distinto: no debe propagarse un objeto nuevo a
    // los consumidores de useAuth().
    act(() => {
      onNextSnapshot(snapshotDe({ ...perfilActivo }, false));
    });
    expect(result.current.perfil).toBe(perfilDesdeCache);

    // Un cambio real sí se propaga.
    act(() => {
      onNextSnapshot(snapshotDe({ ...perfilActivo, activo: false }, false));
    });
    expect(result.current.perfil?.activo).toBe(false);
  });

  it('error de lectura del perfil (reglas): perfil null, cargando false, sin excepción', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    act(() => {
      onErrorSnapshot(new Error('permission-denied'));
    });

    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    expect(result.current.perfil).toBeNull();
  });

  it('desuscribe auth y perfil al desmontar', () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);

    unmount();

    expect(mocks.desuscribirAuth).toHaveBeenCalledTimes(1);
    expect(mocks.desuscribirSnapshot).toHaveBeenCalledTimes(1);
  });

  it('al cambiar de usuario desuscribe el perfil anterior y abre uno nuevo', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    act(() => {
      onNextSnapshot(snapshotDe(perfilActivo));
    });
    await waitFor(() => {
      expect(result.current.perfil).toEqual(perfilActivo);
    });
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);

    const otroUsuario = { uid: 'u2' } as User;
    const perfilU2: Usuario = { ...perfilActivo, uid: 'u2', nombre: 'Beto' };
    act(() => {
      emitirAuth(otroUsuario);
    });

    // El snapshot del usuario anterior se desuscribió; se abrió uno nuevo.
    expect(mocks.desuscribirSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(2);
    // Mientras el perfil nuevo no llegó, no se expone el anterior.
    expect(result.current.cargando).toBe(true);

    act(() => {
      onNextSnapshot(snapshotDe(perfilU2));
    });
    await waitFor(() => {
      expect(result.current.perfil).toEqual(perfilU2);
    });
  });

  it('ingresarConEmail delega en signInWithEmailAndPassword y propaga errores', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    await act(async () => {
      await result.current.ingresarConEmail('a@a.com', '123456');
    });
    expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(authFalso, 'a@a.com', '123456');

    const error = new Error('auth/invalid-credential');
    mocks.signInWithEmailAndPassword.mockRejectedValueOnce(error);
    await expect(result.current.ingresarConEmail('a@a.com', 'mal')).rejects.toThrow(error);
  });

  it('restablecerPassword delega en sendPasswordResetEmail y propaga errores', async () => {
    mocks.sendPasswordResetEmail.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    await act(async () => {
      await result.current.restablecerPassword('a@a.com');
    });
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(authFalso, 'a@a.com');

    const error = new Error('auth/network-request-failed');
    mocks.sendPasswordResetEmail.mockRejectedValueOnce(error);
    await expect(result.current.restablecerPassword('a@a.com')).rejects.toThrow(error);
  });

  it('salir delega en signOut con la instancia de auth', async () => {
    mocks.signOut.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    await act(async () => {
      await result.current.salir();
    });
    expect(mocks.signOut).toHaveBeenCalledWith(authFalso);
  });

  it('useAuth fuera de un ProveedorAuth lanza un error claro', () => {
    function Consumidor() {
      useAuth();
      return null;
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Consumidor />)).toThrow('useAuth debe usarse dentro de un <ProveedorAuth>.');

    errorSpy.mockRestore();
    expect(screen.queryByText('nunca')).toBeNull();
  });
});
