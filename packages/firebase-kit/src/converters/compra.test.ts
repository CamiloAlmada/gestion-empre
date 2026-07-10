import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { money, peso, type Compra } from '@gestion/core';
import { compraConverter } from './compra';

function timestampFalso(fecha: Date) {
  return { toDate: () => fecha };
}

function snapshotDe(id: string, datos: unknown): QueryDocumentSnapshot {
  return {
    id,
    data: () => datos,
  } as unknown as QueryDocumentSnapshot;
}

const fecha = new Date('2026-03-10T10:00:00.000Z');
const vence = new Date('2026-09-10T00:00:00.000Z');

// Documento de una compra CONFIRMADA: ítems con prorrateo ya calculado, un ítem
// por pieza (con detalle y costoRealKgCents) y uno por unidad (sin costo por kg).
const docConfirmada = {
  fecha: timestampFalso(fecha),
  usuarioId: 'admin-1',
  estado: 'confirmada',
  proveedorId: 'prov-1',
  proveedorNombre: 'Lácteos Colonia',
  items: [
    {
      productoId: 'prod-queso',
      nombreProducto: 'Queso Colonia',
      gramos: 8000,
      piezas: [
        { pesoGramos: 5000, fechaVencimiento: timestampFalso(vence) },
        { pesoGramos: 3000 },
      ],
      costoFacturaCents: 240000,
      gastoProrrateadoCents: 16000,
      costoRealCents: 256000,
      costoRealKgCents: 32000,
    },
    {
      productoId: 'prod-miel',
      nombreProducto: 'Miel 500g',
      unidades: 12,
      costoFacturaCents: 60000,
      gastoProrrateadoCents: 4000,
      costoRealCents: 64000,
    },
  ],
  gastos: [
    { concepto: 'combustible', descripcion: 'Nafta ida y vuelta', montoCents: 15000 },
    { concepto: 'peaje', montoCents: 5000 },
  ],
  totalFacturaCents: 300000,
  totalGastosCents: 20000,
  totalRealCents: 320000,
};

describe('compraConverter.fromFirestore', () => {
  it('reconstruye la compra con id desde snapshot.id y mapea items/gastos/piezas', () => {
    const compra = compraConverter.fromFirestore(snapshotDe('c1', docConfirmada), {});

    expect(compra.id).toBe('c1');
    expect(compra.fecha).toEqual(fecha);
    expect(compra.usuarioId).toBe('admin-1');
    expect(compra.estado).toBe('confirmada');
    expect(compra.proveedorId).toBe('prov-1');
    expect(compra.proveedorNombre).toBe('Lácteos Colonia');
    expect(compra.totalFacturaCents).toBe(300000);
    expect(compra.totalGastosCents).toBe(20000);
    expect(compra.totalRealCents).toBe(320000);

    expect(compra.items).toHaveLength(2);
    expect(compra.items[0]).toEqual({
      productoId: 'prod-queso',
      nombreProducto: 'Queso Colonia',
      gramos: 8000,
      unidades: undefined,
      piezas: [
        { pesoGramos: 5000, fechaVencimiento: vence },
        { pesoGramos: 3000, fechaVencimiento: undefined },
      ],
      costoFacturaCents: 240000,
      gastoProrrateadoCents: 16000,
      costoRealCents: 256000,
      costoRealKgCents: 32000,
    });
    expect(compra.items[1]).toEqual({
      productoId: 'prod-miel',
      nombreProducto: 'Miel 500g',
      gramos: undefined,
      unidades: 12,
      piezas: undefined,
      costoFacturaCents: 60000,
      gastoProrrateadoCents: 4000,
      costoRealCents: 64000,
      costoRealKgCents: undefined,
    });

    expect(compra.gastos).toEqual([
      { concepto: 'combustible', descripcion: 'Nafta ida y vuelta', montoCents: 15000 },
      { concepto: 'peaje', descripcion: undefined, montoCents: 5000 },
    ]);
  });

  it('rechaza totalRealCents no entero (doc corrupto)', () => {
    const docCorrupto = { ...docConfirmada, totalRealCents: 3200.5 };
    expect(() => compraConverter.fromFirestore(snapshotDe('c2', docCorrupto), {})).toThrow(
      RangeError,
    );
  });

  it('rechaza pesoGramos no entero dentro de una pieza (doc corrupto)', () => {
    const docCorrupto = {
      ...docConfirmada,
      items: [
        { ...docConfirmada.items[0], piezas: [{ pesoGramos: 5000.25 }] },
        docConfirmada.items[1],
      ],
    };
    expect(() => compraConverter.fromFirestore(snapshotDe('c3', docCorrupto), {})).toThrow(
      RangeError,
    );
  });
});

describe('compraConverter.toFirestore', () => {
  const compra: Compra = {
    id: 'c1',
    fecha,
    usuarioId: 'admin-1',
    estado: 'confirmada',
    proveedorId: 'prov-1',
    proveedorNombre: 'Lácteos Colonia',
    items: [
      {
        productoId: 'prod-queso',
        nombreProducto: 'Queso Colonia',
        gramos: peso(8000),
        piezas: [
          { pesoGramos: peso(5000), fechaVencimiento: vence },
          { pesoGramos: peso(3000) },
        ],
        costoFacturaCents: money(240000),
        gastoProrrateadoCents: money(16000),
        costoRealCents: money(256000),
        costoRealKgCents: money(32000),
      },
      {
        productoId: 'prod-miel',
        nombreProducto: 'Miel 500g',
        unidades: 12,
        costoFacturaCents: money(60000),
        gastoProrrateadoCents: money(4000),
        costoRealCents: money(64000),
      },
    ],
    gastos: [
      { concepto: 'combustible', descripcion: 'Nafta ida y vuelta', montoCents: money(15000) },
      { concepto: 'peaje', montoCents: money(5000) },
    ],
    totalFacturaCents: money(300000),
    totalGastosCents: money(20000),
    totalRealCents: money(320000),
  };

  it('no persiste el id de la compra', () => {
    const doc = compraConverter.toFirestore(compra);
    expect(doc).not.toHaveProperty('id');
  });

  it('round-trip: toFirestore » fromFirestore preserva los datos (menos el id)', () => {
    const doc = compraConverter.toFirestore(compra);
    // Reconstruir los Timestamp de fecha y de la fechaVencimiento embebida.
    const items = (doc.items as Record<string, unknown>[]).map((it) => {
      if (it.piezas === undefined) return it;
      const piezas = (it.piezas as Record<string, unknown>[]).map((pz) =>
        pz.fechaVencimiento !== undefined
          ? { ...pz, fechaVencimiento: timestampFalso(pz.fechaVencimiento as Date) }
          : pz,
      );
      return { ...it, piezas };
    });
    const reconstruido = compraConverter.fromFirestore(
      snapshotDe('otro-id', { ...doc, fecha: timestampFalso(fecha), items }),
      {},
    );

    expect(reconstruido).toEqual({ ...compra, id: 'otro-id' });
  });

  it('omite proveedorId cuando la compra no lo trae (retrocompat doc 07)', () => {
    const sinProveedorId: Compra = { ...compra, proveedorId: undefined };
    const doc = compraConverter.toFirestore(sinProveedorId);
    expect(doc).not.toHaveProperty('proveedorId');
    expect(doc.proveedorNombre).toBe('Lácteos Colonia');
  });

  it('omite los campos calculados en un ítem de borrador (sin prorrateo)', () => {
    const borrador: Compra = {
      ...compra,
      estado: 'borrador',
      items: [
        {
          productoId: 'prod-queso',
          nombreProducto: 'Queso Colonia',
          gramos: peso(8000),
          piezas: [{ pesoGramos: peso(5000) }],
          costoFacturaCents: money(240000),
        },
      ],
    };
    const doc = compraConverter.toFirestore(borrador);
    const item = (doc.items as Record<string, unknown>[])[0]!;
    expect(item).not.toHaveProperty('gastoProrrateadoCents');
    expect(item).not.toHaveProperty('costoRealCents');
    expect(item).not.toHaveProperty('costoRealKgCents');
    const pieza = (item.piezas as Record<string, unknown>[])[0]!;
    expect(pieza).not.toHaveProperty('fechaVencimiento');
  });

  it('omite unidades en un ítem por peso y piezas/gramos en uno por unidad', () => {
    const doc = compraConverter.toFirestore(compra);
    const items = doc.items as Record<string, unknown>[];
    expect(items[0]).not.toHaveProperty('unidades');
    expect(items[1]).not.toHaveProperty('gramos');
    expect(items[1]).not.toHaveProperty('piezas');
  });
});
