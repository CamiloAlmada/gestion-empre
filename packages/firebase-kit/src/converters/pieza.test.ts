import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { money, peso, type Pieza } from '@gestion/core';
import { piezaConverter } from './pieza';

function timestampFalso(fecha: Date) {
  return { toDate: () => fecha };
}

function snapshotDe(id: string, datos: unknown): QueryDocumentSnapshot {
  return {
    id,
    data: () => datos,
  } as unknown as QueryDocumentSnapshot;
}

const fechaIngreso = new Date('2026-01-10T09:00:00.000Z');
const fechaVencimiento = new Date('2026-06-10T00:00:00.000Z');

const docCompleto = {
  productoId: 'prod1',
  pesoInicialGramos: 4500,
  pesoRestanteGramos: 3200,
  costoKgCents: 45000,
  compraId: 'compra1',
  fechaIngreso: timestampFalso(fechaIngreso),
  fechaVencimiento: timestampFalso(fechaVencimiento),
  estado: 'disponible',
};

describe('piezaConverter.fromFirestore', () => {
  it('reconstruye la pieza con id desde snapshot.id', () => {
    const pieza = piezaConverter.fromFirestore(snapshotDe('pz1', docCompleto), {});

    expect(pieza.id).toBe('pz1');
    expect(pieza.productoId).toBe('prod1');
    expect(pieza.pesoInicialGramos).toBe(4500);
    expect(pieza.pesoRestanteGramos).toBe(3200);
    expect(pieza.costoKgCents).toBe(45000);
    expect(pieza.compraId).toBe('compra1');
    expect(pieza.fechaIngreso).toEqual(fechaIngreso);
    expect(pieza.fechaVencimiento).toEqual(fechaVencimiento);
    expect(pieza.estado).toBe('disponible');
  });

  it('compraId y fechaVencimiento ausentes quedan undefined (pieza cargada manualmente, sin vencimiento)', () => {
    const docSinOpcionales: Partial<typeof docCompleto> = { ...docCompleto };
    delete docSinOpcionales.compraId;
    delete docSinOpcionales.fechaVencimiento;
    const pieza = piezaConverter.fromFirestore(snapshotDe('pz2', docSinOpcionales), {});

    expect(pieza.compraId).toBeUndefined();
    expect(pieza.fechaVencimiento).toBeUndefined();
  });

  it('rechaza pesoRestanteGramos no entero (doc corrupto)', () => {
    const docCorrupto = { ...docCompleto, pesoRestanteGramos: 3200.7 };
    expect(() => piezaConverter.fromFirestore(snapshotDe('pz3', docCorrupto), {})).toThrow(
      RangeError,
    );
  });

  it('rechaza costoKgCents no entero (doc corrupto)', () => {
    const docCorrupto = { ...docCompleto, costoKgCents: 450.5 };
    expect(() => piezaConverter.fromFirestore(snapshotDe('pz4', docCorrupto), {})).toThrow(
      RangeError,
    );
  });
});

describe('piezaConverter.toFirestore', () => {
  const pieza: Pieza = {
    id: 'pz1',
    productoId: 'prod1',
    pesoInicialGramos: peso(4500),
    pesoRestanteGramos: peso(3200),
    costoKgCents: money(45000),
    compraId: 'compra1',
    fechaIngreso,
    fechaVencimiento,
    estado: 'disponible',
  };

  it('no persiste el id', () => {
    const doc = piezaConverter.toFirestore(pieza);
    expect(doc).not.toHaveProperty('id');
  });

  it('round-trip: toFirestore » fromFirestore preserva los datos (menos el id)', () => {
    const doc = piezaConverter.toFirestore(pieza);
    const reconstruido = piezaConverter.fromFirestore(
      snapshotDe('otro-id', {
        ...doc,
        fechaIngreso: timestampFalso(fechaIngreso),
        fechaVencimiento: timestampFalso(fechaVencimiento),
      }),
      {},
    );

    expect(reconstruido).toEqual({ ...pieza, id: 'otro-id' });
  });

  it('omite del doc compraId y fechaVencimiento cuando están undefined', () => {
    const piezaSinOpcionales: Pieza = {
      ...pieza,
      compraId: undefined,
      fechaVencimiento: undefined,
    };
    const doc = piezaConverter.toFirestore(piezaSinOpcionales);

    expect(doc).not.toHaveProperty('compraId');
    expect(doc).not.toHaveProperty('fechaVencimiento');
  });
});
