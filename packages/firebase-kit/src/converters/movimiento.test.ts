import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { clasificarCosteo, money, peso, type CosteoItem, type MovimientoStock } from '@gestion/core';
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

// Retrocompatibilidad (tarea A1b): `docCompleto` es EXACTAMENTE el formato
// viejo (sin `costeo`), el que hay escrito en producción. Debe seguir
// deserializando sin error.
describe('movimientoConverter y el costeo congelado (costeo)', () => {
  it('movimiento viejo SIN costeo: deserializa sin error y clasifica como legado', () => {
    const movimiento = movimientoConverter.fromFirestore(snapshotDe('m-viejo', docCompleto), {});

    expect(movimiento.costeo).toBeUndefined();
    expect(clasificarCosteo(movimiento)).toBe('legado');
  });

  it('reconstruye el mapa completo con money() y lo clasifica como real', () => {
    const doc = {
      ...docCompleto,
      costeo: {
        v: 1,
        fuente: 'pieza',
        origen: 'venta',
        costoUnitCents: 30000,
        costoItemCents: 10500,
        compraId: 'compra-7',
      },
    };
    const movimiento = movimientoConverter.fromFirestore(snapshotDe('m-nuevo', doc), {});

    expect(movimiento.costeo).toEqual({
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: 30000,
      costoItemCents: 10500,
      compraId: 'compra-7',
    });
    expect(clasificarCosteo(movimiento)).toBe('real');
  });

  it('costeo sin montos (sin_costo) se reconstruye sin inventar ceros', () => {
    const doc = { ...docCompleto, costeo: { v: 1, fuente: 'sin_costo', origen: 'venta' } };
    const movimiento = movimientoConverter.fromFirestore(snapshotDe('m-sin-costo', doc), {});

    expect(movimiento.costeo?.fuente).toBe('sin_costo');
    expect(movimiento.costeo?.costoUnitCents).toBeUndefined();
    expect(movimiento.costeo?.costoItemCents).toBeUndefined();
    expect(clasificarCosteo(movimiento)).toBe('sin_dato');
  });

  it('rechaza un costo no entero dentro del costeo (doc corrupto)', () => {
    const doc = {
      ...docCompleto,
      costeo: { v: 1, fuente: 'pieza', origen: 'venta', costoItemCents: 105.5 },
    };
    expect(() => movimientoConverter.fromFirestore(snapshotDe('m-corrupto', doc), {})).toThrow(
      RangeError,
    );
  });

  it('una versión de costeo futura se ignora (legado) en vez de romper el historial', () => {
    const doc = {
      ...docCompleto,
      costeo: { v: 2, fuente: 'pieza', origen: 'venta', costoItemCents: 10500 },
    };
    const movimiento = movimientoConverter.fromFirestore(snapshotDe('m-futuro', doc), {});

    expect(movimiento.costeo).toBeUndefined();
    expect(clasificarCosteo(movimiento)).toBe('legado');
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

  it('omite el mapa costeo cuando el movimiento no lo trae (movimiento viejo, byte-idéntico)', () => {
    const doc = movimientoConverter.toFirestore(movimiento);
    expect(doc).not.toHaveProperty('costeo');
  });

  it('persiste el mapa costeo y sobrevive el round-trip', () => {
    const costeo: CosteoItem = {
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: money(30000),
      costoItemCents: money(10500),
      compraId: 'compra-7',
    };
    const conCosteo: MovimientoStock = { ...movimiento, costeo };

    const doc = movimientoConverter.toFirestore(conCosteo);
    expect(doc.costeo).toEqual({
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: 30000,
      costoItemCents: 10500,
      compraId: 'compra-7',
    });

    const reconstruido = movimientoConverter.fromFirestore(
      snapshotDe('m1', { ...doc, fecha: timestampFalso(fecha) }),
      {},
    );
    expect(reconstruido.costeo).toEqual(costeo);
  });

  it('sin_costo: NO persiste montos (un 0 declararía 100 % de ganancia)', () => {
    const costeo: CosteoItem = { v: 1, fuente: 'sin_costo', origen: 'venta' };
    const conCosteo: MovimientoStock = { ...movimiento, costeo };

    const doc = movimientoConverter.toFirestore(conCosteo);
    const mapa = doc.costeo as Record<string, unknown>;

    expect(mapa).toEqual({ v: 1, fuente: 'sin_costo', origen: 'venta' });
    expect(mapa).not.toHaveProperty('costoUnitCents');
    expect(mapa).not.toHaveProperty('costoItemCents');
    expect(mapa).not.toHaveProperty('compraId');
  });
});
