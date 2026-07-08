import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { FirestoreError, Query } from 'firebase/firestore';
import { useCollection } from './useCollection';

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
let onNext: (snap: { docs: { data: () => Dato }[] }) => void;
let onError: (error: FirestoreError) => void;

function snapshotDe(datos: Dato[]) {
  return { docs: datos.map((dato) => ({ data: () => dato })) };
}

const queryFalsa = { id: 'q1' } as unknown as Query<Dato>;

describe('useCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onSnapshot.mockImplementation(
      (
        _query: unknown,
        next: (snap: { docs: { data: () => Dato }[] }) => void,
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

  it('con query null: no suscribe y devuelve estado inactivo', () => {
    const { result } = renderHook(() => useCollection<Dato>(null));

    expect(mocks.onSnapshot).not.toHaveBeenCalled();
    expect(result.current).toEqual({ datos: [], cargando: false, error: null });
  });

  it('con query: arranca cargando, sin datos ni error', () => {
    const { result } = renderHook(() => useCollection(queryFalsa));

    expect(result.current).toEqual({ datos: [], cargando: true, error: null });
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('con resultados: expone la lista y deja de cargar', () => {
    const { result } = renderHook(() => useCollection(queryFalsa));

    act(() => {
      onNext(snapshotDe([{ nombre: 'Ana' }, { nombre: 'Beto' }]));
    });

    expect(result.current).toEqual({
      datos: [{ nombre: 'Ana' }, { nombre: 'Beto' }],
      cargando: false,
      error: null,
    });
  });

  it('colección vacía: datos [], cargando false, sin error', () => {
    const { result } = renderHook(() => useCollection(queryFalsa));

    act(() => {
      onNext(snapshotDe([]));
    });

    expect(result.current).toEqual({ datos: [], cargando: false, error: null });
  });

  it('error de lectura: expone el error, datos [], cargando false', () => {
    const { result } = renderHook(() => useCollection(queryFalsa));
    const error = { code: 'permission-denied' } as FirestoreError;

    act(() => {
      onError(error);
    });

    expect(result.current).toEqual({ datos: [], cargando: false, error });
  });

  it('desuscribe onSnapshot al desmontar', () => {
    const { unmount } = renderHook(() => useCollection(queryFalsa));

    unmount();

    expect(mocks.desuscribir).toHaveBeenCalledTimes(1);
  });

  it('al cambiar la identidad de query, desuscribe la anterior y abre una nueva', () => {
    const { result, rerender } = renderHook(({ query }) => useCollection(query), {
      initialProps: { query: queryFalsa },
    });

    act(() => {
      onNext(snapshotDe([{ nombre: 'Ana' }]));
    });
    expect(result.current.datos).toEqual([{ nombre: 'Ana' }]);
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);

    const otraQuery = { id: 'q2' } as unknown as Query<Dato>;
    rerender({ query: otraQuery });

    expect(mocks.desuscribir).toHaveBeenCalledTimes(1);
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.cargando).toBe(true);

    act(() => {
      onNext(snapshotDe([{ nombre: 'Beto' }]));
    });
    expect(result.current.datos).toEqual([{ nombre: 'Beto' }]);
  });

  it('al pasar de query a null, desuscribe y vuelve a estado inactivo', () => {
    const { result, rerender } = renderHook(
      ({ query }: { query: Query<Dato> | null }) => useCollection(query),
      {
        initialProps: { query: queryFalsa as Query<Dato> | null },
      },
    );

    act(() => {
      onNext(snapshotDe([{ nombre: 'Ana' }]));
    });
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);

    rerender({ query: null });

    expect(mocks.desuscribir).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ datos: [], cargando: false, error: null });
  });
});
