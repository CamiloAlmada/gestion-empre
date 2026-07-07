import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { Auth, User } from 'firebase/auth';
import { useAuth } from './useAuth';

const mocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  desuscribir: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signInWithPopup: mocks.signInWithPopup,
  signOut: mocks.signOut,
  GoogleAuthProvider: vi.fn(),
}));

const authFalso = {} as Auth;

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onAuthStateChanged.mockImplementation(() => mocks.desuscribir);
  });

  afterEach(() => {
    cleanup();
  });

  it('arranca con cargando en true y usuario en null', () => {
    const { result } = renderHook(() => useAuth(authFalso));

    expect(result.current.cargando).toBe(true);
    expect(result.current.usuario).toBeNull();
  });

  it('setea el usuario y pasa cargando a false cuando llega el callback de auth', async () => {
    let callback: ((usuario: User | null) => void) | undefined;
    mocks.onAuthStateChanged.mockImplementation((_auth: Auth, cb: (usuario: User | null) => void) => {
      callback = cb;
      return mocks.desuscribir;
    });

    const { result } = renderHook(() => useAuth(authFalso));
    const usuarioFalso = { uid: 'u1' } as User;

    act(() => {
      callback?.(usuarioFalso);
    });

    await waitFor(() => {
      expect(result.current.cargando).toBe(false);
    });
    expect(result.current.usuario).toBe(usuarioFalso);
  });

  it('se desuscribe de onAuthStateChanged al desmontar', () => {
    const { unmount } = renderHook(() => useAuth(authFalso));

    unmount();

    expect(mocks.desuscribir).toHaveBeenCalledTimes(1);
  });

  it('ingresarConEmail delega en signInWithEmailAndPassword con la instancia de auth', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth(authFalso));

    await act(async () => {
      await result.current.ingresarConEmail('a@a.com', '123456');
    });

    expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(authFalso, 'a@a.com', '123456');
  });

  it('propaga el error si signInWithEmailAndPassword rechaza', async () => {
    const error = new Error('credenciales inválidas');
    mocks.signInWithEmailAndPassword.mockRejectedValue(error);
    const { result } = renderHook(() => useAuth(authFalso));

    await expect(result.current.ingresarConEmail('a@a.com', 'mal')).rejects.toThrow(error);
  });

  it('ingresarConGoogle delega en signInWithPopup con la instancia de auth', async () => {
    mocks.signInWithPopup.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth(authFalso));

    await act(async () => {
      await result.current.ingresarConGoogle();
    });

    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithPopup.mock.calls[0]?.[0]).toBe(authFalso);
  });

  it('salir delega en signOut con la instancia de auth', async () => {
    mocks.signOut.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth(authFalso));

    await act(async () => {
      await result.current.salir();
    });

    expect(mocks.signOut).toHaveBeenCalledWith(authFalso);
  });
});
