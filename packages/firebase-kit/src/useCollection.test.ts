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

interface SnapshotFalso {
  docs: { data: () => Dato }[];
  metadata: { fromCache: boolean };
}

/** Captura los callbacks next/error que `onSnapshot` recibe por cada suscripción. */
let onNext: (snap: SnapshotFalso) => void;
let onError: (error: FirestoreError) => void;
/** Opciones (segundo argumento) con las que se llamó a `onSnapshot`, si las hubo. */
let opcionesRecibidas: { includeMetadataChanges?: boolean } | undefined;

function snapshotDe(datos: Dato[], fromCache = false): SnapshotFalso {
  return { docs: datos.map((dato) => ({ data: () => dato })), metadata: { fromCache } };
}

const queryFalsa = { id: 'q1' } as unknown as Query<Dato>;

describe('useCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    opcionesRecibidas = undefined;
    mocks.onSnapshot.mockImplementation((_query: unknown, ...resto: unknown[]) => {
      // El hook llama a `onSnapshot` con 3 args (query, next, error) cuando
      // no se pide `seguirFrescura`, y con 4 (query, options, next, error)
      // cuando sí — misma distinción que hace la firma real de Firestore.
      if (resto.length === 2) {
        const [next, error] = resto as [(snap: SnapshotFalso) => void, (e: FirestoreError) => void];
        opcionesRecibidas = undefined;
        onNext = next;
        onError = error;
      } else {
        const [opciones, next, error] = resto as [
          { includeMetadataChanges?: boolean },
          (snap: SnapshotFalso) => void,
          (e: FirestoreError) => void,
        ];
        opcionesRecibidas = opciones;
        onNext = next;
        onError = error;
      }
      return mocks.desuscribir;
    });
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

  describe('con { seguirFrescura: true }', () => {
    it('sin seguirFrescura: se suscribe sin includeMetadataChanges y sin desdeCache', () => {
      const { result } = renderHook(() => useCollection(queryFalsa));

      expect(opcionesRecibidas).toBeUndefined();
      expect(result.current).toEqual({ datos: [], cargando: true, error: null });
      expect('desdeCache' in result.current).toBe(false);
    });

    it('antes del primer snapshot: cargando true, desdeCache true (sin snapshot confirmado todavía), suscribe con includeMetadataChanges', () => {
      const { result } = renderHook(() => useCollection(queryFalsa, { seguirFrescura: true }));

      expect(opcionesRecibidas).toEqual({ includeMetadataChanges: true });
      expect(result.current).toEqual({
        datos: [],
        cargando: true,
        error: null,
        desdeCache: true,
      });
    });

    it('primer snapshot desde caché: expone desdeCache true', () => {
      const { result } = renderHook(() => useCollection(queryFalsa, { seguirFrescura: true }));

      act(() => {
        onNext(snapshotDe([{ nombre: 'Ana' }], true));
      });

      expect(result.current).toEqual({
        datos: [{ nombre: 'Ana' }],
        cargando: false,
        error: null,
        desdeCache: true,
      });
    });

    it('confirmación del servidor con los mismos datos: llega un snapshot con desdeCache false', () => {
      const { result } = renderHook(() => useCollection(queryFalsa, { seguirFrescura: true }));

      act(() => {
        onNext(snapshotDe([{ nombre: 'Ana' }], true));
      });
      expect(result.current.desdeCache).toBe(true);

      // Mismos datos, pero ahora confirmados por el servidor. Sin
      // `includeMetadataChanges: true` este segundo snapshot no se emitiría
      // porque los datos no cambiaron — por eso se verifica más arriba que
      // la suscripción se hizo con esa opción.
      act(() => {
        onNext(snapshotDe([{ nombre: 'Ana' }], false));
      });

      expect(result.current).toEqual({
        datos: [{ nombre: 'Ana' }],
        cargando: false,
        error: null,
        desdeCache: false,
      });
    });

    it('se cae la red: el listener vuelve a emitir con desdeCache true', () => {
      const { result } = renderHook(() => useCollection(queryFalsa, { seguirFrescura: true }));

      act(() => {
        onNext(snapshotDe([{ nombre: 'Ana' }], false));
      });
      expect(result.current.desdeCache).toBe(false);

      act(() => {
        onNext(snapshotDe([{ nombre: 'Ana' }], true));
      });

      expect(result.current.desdeCache).toBe(true);
    });

    it('con query null: no suscribe y devuelve estado inactivo con desdeCache true (sin snapshot que confirmar)', () => {
      const { result } = renderHook(() => useCollection(null, { seguirFrescura: true }));

      expect(mocks.onSnapshot).not.toHaveBeenCalled();
      expect(result.current).toEqual({
        datos: [],
        cargando: false,
        error: null,
        desdeCache: true,
      });
    });

    it('error de lectura: expone desdeCache true (estado estable, no hay snapshot confirmado vigente)', () => {
      const { result } = renderHook(() => useCollection(queryFalsa, { seguirFrescura: true }));
      const error = { code: 'permission-denied' } as FirestoreError;

      act(() => {
        onNext(snapshotDe([{ nombre: 'Ana' }], false));
      });
      expect(result.current.desdeCache).toBe(false);

      act(() => {
        onError(error);
      });

      expect(result.current).toEqual({
        datos: [],
        cargando: false,
        error,
        desdeCache: true,
      });
    });
  });
});
