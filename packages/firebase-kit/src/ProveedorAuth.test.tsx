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
/** Callbacks que `onSnapshot` recibe (next/error) por cada suscripción abierta. */
let onNextSnapshot: (snap: { exists: () => boolean; data: () => Usuario }) => void;
let onErrorSnapshot: (error: unknown) => void;

function envolver({ children }: { children: ReactNode }) {
  return (
    <ProveedorAuth auth={authFalso} db={dbFalso}>
      {children}
    </ProveedorAuth>
  );
}

function snapshotDe(usuario: Usuario | null) {
  return {
    exists: () => usuario !== null,
    data: () => usuario as Usuario,
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
    mocks.onSnapshot.mockImplementation(
      (
        _ref: unknown,
        next: (snap: { exists: () => boolean; data: () => Usuario }) => void,
        error: (e: unknown) => void,
      ) => {
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

  it('perfil inexistente (snapshot sin doc): perfil null, cargando false', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => {
      emitirAuth(usuarioAuthFalso);
    });
    act(() => {
      onNextSnapshot(snapshotDe(null));
    });

    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    expect(result.current.perfil).toBeNull();
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
