import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { money, peso, type Venta } from '@gestion/core';
import { ventaConverter } from './venta';

function timestampFalso(fecha: Date) {
  return { toDate: () => fecha };
}

function snapshotDe(id: string, datos: unknown): QueryDocumentSnapshot {
  return {
    id,
    data: () => datos,
  } as unknown as QueryDocumentSnapshot;
}

const fecha = new Date('2026-02-01T14:30:00.000Z');

const docCompleto = {
  numero: 1024,
  fecha: timestampFalso(fecha),
  usuarioId: 'u1',
  items: [
    {
      productoId: 'prod1',
      nombreProducto: 'Queso Colonia',
      piezaId: 'pz1',
      gramos: 350,
      precioUnitCents: 89900,
      subtotalCents: 31465,
    },
    {
      productoId: 'prod2',
      nombreProducto: 'Miel 500g',
      unidades: 2,
      precioUnitCents: 25000,
      subtotalCents: 50000,
    },
  ],
  totalCents: 81465,
  medioPago: 'efectivo',
  estado: 'completada',
};

describe('ventaConverter.fromFirestore', () => {
  it('reconstruye la venta con id desde snapshot.id y mapea cada item embebido', () => {
    const venta = ventaConverter.fromFirestore(snapshotDe('v1', docCompleto), {});

    expect(venta.id).toBe('v1');
    expect(venta.numero).toBe(1024);
    expect(venta.fecha).toEqual(fecha);
    expect(venta.usuarioId).toBe('u1');
    expect(venta.totalCents).toBe(81465);
    expect(venta.medioPago).toBe('efectivo');
    expect(venta.estado).toBe('completada');

    expect(venta.items).toHaveLength(2);
    expect(venta.items[0]).toEqual({
      productoId: 'prod1',
      nombreProducto: 'Queso Colonia',
      piezaId: 'pz1',
      gramos: 350,
      unidades: undefined,
      precioUnitCents: 89900,
      subtotalCents: 31465,
    });
    expect(venta.items[1]).toEqual({
      productoId: 'prod2',
      nombreProducto: 'Miel 500g',
      piezaId: undefined,
      gramos: undefined,
      unidades: 2,
      precioUnitCents: 25000,
      subtotalCents: 50000,
    });
  });

  it('rechaza totalCents no entero (doc corrupto)', () => {
    const docCorrupto = { ...docCompleto, totalCents: 814.65 };
    expect(() => ventaConverter.fromFirestore(snapshotDe('v2', docCorrupto), {})).toThrow(
      RangeError,
    );
  });

  it('rechaza gramos no entero dentro de un item (doc corrupto)', () => {
    const docCorrupto = {
      ...docCompleto,
      items: [{ ...docCompleto.items[0], gramos: 350.5 }],
    };
    expect(() => ventaConverter.fromFirestore(snapshotDe('v3', docCorrupto), {})).toThrow(
      RangeError,
    );
  });
});

describe('ventaConverter.toFirestore', () => {
  const venta: Venta = {
    id: 'v1',
    numero: 1024,
    fecha,
    usuarioId: 'u1',
    items: [
      {
        productoId: 'prod1',
        nombreProducto: 'Queso Colonia',
        piezaId: 'pz1',
        gramos: peso(350),
        precioUnitCents: money(89900),
        subtotalCents: money(31465),
      },
      {
        productoId: 'prod2',
        nombreProducto: 'Miel 500g',
        unidades: 2,
        precioUnitCents: money(25000),
        subtotalCents: money(50000),
      },
    ],
    totalCents: money(81465),
    medioPago: 'efectivo',
    estado: 'completada',
  };

  it('no persiste el id de la venta', () => {
    const doc = ventaConverter.toFirestore(venta);
    expect(doc).not.toHaveProperty('id');
  });

  it('round-trip: toFirestore » fromFirestore preserva los datos (menos el id)', () => {
    const doc = ventaConverter.toFirestore(venta);
    const reconstruido = ventaConverter.fromFirestore(
      snapshotDe('otro-id', { ...doc, fecha: timestampFalso(fecha) }),
      {},
    );

    expect(reconstruido).toEqual({ ...venta, id: 'otro-id' });
  });

  it('omite gramos/unidades/piezaId ausentes en cada item embebido', () => {
    const doc = ventaConverter.toFirestore(venta);
    const items = doc.items as Record<string, unknown>[];

    expect(items[0]).not.toHaveProperty('unidades');
    expect(items[1]).not.toHaveProperty('gramos');
    expect(items[1]).not.toHaveProperty('piezaId');
  });

  it('omite clienteId/clienteNombre en una venta anónima (byte-idéntica a antes)', () => {
    const doc = ventaConverter.toFirestore(venta);
    expect(doc).not.toHaveProperty('clienteId');
    expect(doc).not.toHaveProperty('clienteNombre');
  });

  it('persiste clienteId/clienteNombre cuando la venta tiene cliente', () => {
    const conCliente: Venta = { ...venta, clienteId: 'cli-1', clienteNombre: 'Marta' };
    const doc = ventaConverter.toFirestore(conCliente);
    expect(doc.clienteId).toBe('cli-1');
    expect(doc.clienteNombre).toBe('Marta');

    const reconstruido = ventaConverter.fromFirestore(
      snapshotDe('otro-id', { ...doc, fecha: timestampFalso(fecha) }),
      {},
    );
    expect(reconstruido.clienteId).toBe('cli-1');
    expect(reconstruido.clienteNombre).toBe('Marta');
  });
});
