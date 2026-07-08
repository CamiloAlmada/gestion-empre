import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { peso, type MovimientoStock } from '@gestion/core';
import { movimientoConverter } from './movimiento';

function timestampFalso(fecha: Date) {
  return { toDate: () => fecha };
}

function snapshotDe(id: string, datos: unknown): QueryDocumentSnapshot {
  return {
    id,
    data: () => datos,
  } as unknown as QueryDocumentSnapshot;
}

const fecha = new Date('2026-03-05T08:00:00.000Z');

const docCompleto = {
  tipo: 'venta',
  productoId: 'prod1',
  piezaId: 'pz1',
  deltaGramos: -350,
  origenTipo: 'venta',
  origenId: 'v1',
  usuarioId: 'u1',
  fecha: timestampFalso(fecha),
  nota: 'venta de mostrador',
};

describe('movimientoConverter.fromFirestore', () => {
  it('reconstruye el movimiento con id desde snapshot.id', () => {
    const movimiento = movimientoConverter.fromFirestore(snapshotDe('m1', docCompleto), {});

    expect(movimiento.id).toBe('m1');
    expect(movimiento.tipo).toBe('venta');
    expect(movimiento.productoId).toBe('prod1');
    expect(movimiento.piezaId).toBe('pz1');
    expect(movimiento.deltaGramos).toBe(-350);
    expect(movimiento.origenTipo).toBe('venta');
    expect(movimiento.origenId).toBe('v1');
    expect(movimiento.usuarioId).toBe('u1');
    expect(movimiento.fecha).toEqual(fecha);
    expect(movimiento.nota).toBe('venta de mostrador');
  });

  it('opcionales ausentes (piezaId, deltaGramos, deltaUnidades, nota) quedan undefined', () => {
    const docGranel = {
      tipo: 'ajuste_negativo',
      productoId: 'prod2',
      deltaUnidades: -1,
      origenTipo: 'ajuste',
      origenId: 'aj1',
      usuarioId: 'u1',
      fecha: timestampFalso(fecha),
    };
    const movimiento = movimientoConverter.fromFirestore(snapshotDe('m2', docGranel), {});

    expect(movimiento.piezaId).toBeUndefined();
    expect(movimiento.deltaGramos).toBeUndefined();
    expect(movimiento.nota).toBeUndefined();
    expect(movimiento.deltaUnidades).toBe(-1);
  });

  it('acepta deltaGramos negativo (descuenta stock) sin alterar el signo', () => {
    const movimiento = movimientoConverter.fromFirestore(snapshotDe('m3', docCompleto), {});
    expect(movimiento.deltaGramos).toBe(-350);
  });

  it('rechaza deltaGramos no entero (doc corrupto)', () => {
    const docCorrupto = { ...docCompleto, deltaGramos: -350.25 };
    expect(() => movimientoConverter.fromFirestore(snapshotDe('m4', docCorrupto), {})).toThrow(
      RangeError,
    );
  });
});

describe('movimientoConverter.toFirestore', () => {
  const movimiento: MovimientoStock = {
    id: 'm1',
    tipo: 'venta',
    productoId: 'prod1',
    piezaId: 'pz1',
    deltaGramos: peso(-350),
    origenTipo: 'venta',
    origenId: 'v1',
    usuarioId: 'u1',
    fecha,
    nota: 'venta de mostrador',
  };

  it('no persiste el id', () => {
    const doc = movimientoConverter.toFirestore(movimiento);
    expect(doc).not.toHaveProperty('id');
  });

  it('round-trip: toFirestore » fromFirestore preserva los datos (menos el id)', () => {
    const doc = movimientoConverter.toFirestore(movimiento);
    const reconstruido = movimientoConverter.fromFirestore(
      snapshotDe('otro-id', { ...doc, fecha: timestampFalso(fecha) }),
      {},
    );

    expect(reconstruido).toEqual({ ...movimiento, id: 'otro-id' });
  });

  it('omite del doc los opcionales que están undefined', () => {
    const movimientoSinOpcionales: MovimientoStock = {
      ...movimiento,
      piezaId: undefined,
      deltaGramos: undefined,
      nota: undefined,
    };
    const doc = movimientoConverter.toFirestore(movimientoSinOpcionales);

    expect(doc).not.toHaveProperty('piezaId');
    expect(doc).not.toHaveProperty('deltaGramos');
    expect(doc).not.toHaveProperty('nota');
  });
});
