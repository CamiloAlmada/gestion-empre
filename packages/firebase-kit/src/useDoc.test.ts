import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { DocumentReference, FirestoreError } from 'firebase/firestore';
import { useDoc } from './useDoc';

const mocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  desuscribir: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  onSnapshot: mocks.onSnapshot,
}));

interface Dato {
  nombre: string;
}

/** Captura los callbacks next/error que `onSnapshot` recibe por cada suscripción. */
let onNext: (snap: { exists: () => boolean; data: () => Dato }) => void;
let onError: (error: FirestoreError) => void;

function snapshotDe(dato: Dato | null) {
  return {
    exists: () => dato !== null,
    data: () => dato as Dato,
  };
}

const refFalso = { id: 'doc1' } as unknown as DocumentReference<Dato>;

describe('useDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onSnapshot.mockImplementation(
      (
        _ref: unknown,
        next: (snap: { exists: () => boolean; data: () => Dato }) => void,
        error: (e: FirestoreError) => void,
      ) => {
        onNext = next;
        onError = error;
        return mocks.desuscribir;
      },
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('con ref null: no suscribe y devuelve estado inactivo', () => {
    const { result } = renderHook(() => useDoc<Dato>(null));

    expect(mocks.onSnapshot).not.toHaveBeenCalled();
    expect(result.current).toEqual({ datos: null, cargando: false, error: null });
  });

  it('con ref: arranca cargando, sin datos ni error', () => {
    const { result } = renderHook(() => useDoc(refFalso));

    expect(result.current).toEqual({ datos: null, cargando: true, error: null });
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('doc existente: expone los datos y deja de cargar', () => {
    const { result } = renderHook(() => useDoc(refFalso));

    act(() => {
      onNext(snapshotDe({ nombre: 'Ana' }));
    });

    expect(result.current).toEqual({ datos: { nombre: 'Ana' }, cargando: false, error: null });
  });

  it('doc inexistente: datos null, cargando false, sin error', () => {
    const { result } = renderHook(() => useDoc(refFalso));

    act(() => {
      onNext(snapshotDe(null));
    });

    expect(result.current).toEqual({ datos: null, cargando: false, error: null });
  });

  it('error de lectura: expone el error, datos null, cargando false', () => {
    const { result } = renderHook(() => useDoc(refFalso));
    const error = { code: 'permission-denied' } as FirestoreError;

    act(() => {
      onError(error);
    });

    expect(result.current).toEqual({ datos: null, cargando: false, error });
  });

  it('desuscribe onSnapshot al desmontar', () => {
    const { unmount } = renderHook(() => useDoc(refFalso));

    unmount();

    expect(mocks.desuscribir).toHaveBeenCalledTimes(1);
  });

  it('al cambiar la identidad de ref, desuscribe la anterior y abre una nueva', () => {
    const { result, rerender } = renderHook(({ ref }) => useDoc(ref), {
      initialProps: { ref: refFalso },
    });

    act(() => {
      onNext(snapshotDe({ nombre: 'Ana' }));
    });
    expect(result.current.datos).toEqual({ nombre: 'Ana' });
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);

    const otroRef = { id: 'doc2' } as unknown as DocumentReference<Dato>;
    rerender({ ref: otroRef });

    expect(mocks.desuscribir).toHaveBeenCalledTimes(1);
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(2);
    // Vuelve a cargando hasta que llegue el snapshot del nuevo ref.
    expect(result.current.cargando).toBe(true);

    act(() => {
      onNext(snapshotDe({ nombre: 'Beto' }));
    });
    expect(result.current.datos).toEqual({ nombre: 'Beto' });
  });

  it('al pasar de ref a null, desuscribe y vuelve a estado inactivo', () => {
    const { result, rerender } = renderHook(
      ({ ref }: { ref: DocumentReference<Dato> | null }) => useDoc(ref),
      { initialProps: { ref: refFalso as DocumentReference<Dato> | null } },
    );

    act(() => {
      onNext(snapshotDe({ nombre: 'Ana' }));
    });
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);

    rerender({ ref: null });

    expect(mocks.desuscribir).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ datos: null, cargando: false, error: null });
  });
});
