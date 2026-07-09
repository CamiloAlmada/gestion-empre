import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { Categoria } from '@gestion/core';
import { categoriaConverter } from './categoria';

function snapshotDe(id: string, datos: unknown): QueryDocumentSnapshot {
  return {
    id,
    data: () => datos,
  } as unknown as QueryDocumentSnapshot;
}

const docCompleto = {
  nombre: 'Quesos',
  orden: 2,
};

describe('categoriaConverter.fromFirestore', () => {
  it('reconstruye la categoría con id desde snapshot.id, no del doc', () => {
    const categoria = categoriaConverter.fromFirestore(snapshotDe('cat1', docCompleto), {});

    expect(categoria.id).toBe('cat1');
    expect(categoria.nombre).toBe('Quesos');
    expect(categoria.orden).toBe(2);
  });

  it('acepta orden 0 (primera categoría)', () => {
    const categoria = categoriaConverter.fromFirestore(
      snapshotDe('cat0', { nombre: 'Miel', orden: 0 }),
      {},
    );
    expect(categoria.orden).toBe(0);
  });

  it('rechaza orden no entero (doc corrupto)', () => {
    const docCorrupto = { ...docCompleto, orden: 1.5 };
    expect(() => categoriaConverter.fromFirestore(snapshotDe('cat2', docCorrupto), {})).toThrow(
      RangeError,
    );
  });

  it('rechaza orden negativo (doc corrupto)', () => {
    const docCorrupto = { ...docCompleto, orden: -1 };
    expect(() => categoriaConverter.fromFirestore(snapshotDe('cat3', docCorrupto), {})).toThrow(
      RangeError,
    );
  });
});

describe('categoriaConverter.toFirestore', () => {
  const categoria: Categoria = {
    id: 'cat1',
    nombre: 'Quesos',
    orden: 2,
  };

  it('no persiste el id', () => {
    const doc = categoriaConverter.toFirestore(categoria);
    expect(doc).not.toHaveProperty('id');
  });

  it('round-trip: toFirestore » fromFirestore preserva los datos (menos el id)', () => {
    const doc = categoriaConverter.toFirestore(categoria);
    const reconstruido = categoriaConverter.fromFirestore(snapshotDe('otro-id', doc), {});

    expect(reconstruido).toEqual({ ...categoria, id: 'otro-id' });
  });
});
