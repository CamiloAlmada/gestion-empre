import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { clasificarCosteo, money, peso, type CosteoItem, type Venta } from '@gestion/core';
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

// Retrocompatibilidad: `docCompleto` es EXACTAMENTE el formato viejo (sin
// `costeo`), el que hay escrito en producción. Debe seguir deserializando.
describe('ventaConverter y el costeo congelado (items[].costeo)', () => {
  it('venta vieja SIN costeo: deserializa sin error y clasifica como legado', () => {
    const venta = ventaConverter.fromFirestore(snapshotDe('v-vieja', docCompleto), {});

    expect(venta.items).toHaveLength(2);
    for (const item of venta.items) {
      expect(item.costeo).toBeUndefined();
      expect(clasificarCosteo(item)).toBe('legado');
    }
  });

  it('reconstruye el mapa completo con money() y lo clasifica como real', () => {
    const doc = {
      ...docCompleto,
      items: [
        {
          ...docCompleto.items[0],
          costeo: {
            v: 1,
            fuente: 'pieza',
            origen: 'venta',
            costoUnitCents: 30000,
            costoItemCents: 10500,
            compraId: 'compra-7',
          },
        },
      ],
    };
    const venta = ventaConverter.fromFirestore(snapshotDe('v-nueva', doc), {});

    expect(venta.items[0]?.costeo).toEqual({
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: 30000,
      costoItemCents: 10500,
      compraId: 'compra-7',
    });
    expect(clasificarCosteo(venta.items[0] ?? {})).toBe('real');
  });

  it('costeo sin montos (sin_costo) se reconstruye sin inventar ceros', () => {
    const doc = {
      ...docCompleto,
      items: [{ ...docCompleto.items[1], costeo: { v: 1, fuente: 'sin_costo', origen: 'venta' } }],
    };
    const venta = ventaConverter.fromFirestore(snapshotDe('v-sin-costo', doc), {});

    expect(venta.items[0]?.costeo?.fuente).toBe('sin_costo');
    expect(venta.items[0]?.costeo?.costoUnitCents).toBeUndefined();
    expect(venta.items[0]?.costeo?.costoItemCents).toBeUndefined();
    expect(clasificarCosteo(venta.items[0] ?? {})).toBe('sin_dato');
  });

  it('rechaza un costo no entero dentro del costeo (doc corrupto)', () => {
    const doc = {
      ...docCompleto,
      items: [
        {
          ...docCompleto.items[0],
          costeo: { v: 1, fuente: 'pieza', origen: 'venta', costoItemCents: 105.5 },
        },
      ],
    };
    expect(() => ventaConverter.fromFirestore(snapshotDe('v-corrupta', doc), {})).toThrow(
      RangeError,
    );
  });

  it('una versión de costeo futura se ignora (legado) en vez de romper el historial', () => {
    const doc = {
      ...docCompleto,
      items: [
        {
          ...docCompleto.items[0],
          costeo: { v: 2, fuente: 'pieza', origen: 'venta', costoItemCents: 10500 },
        },
      ],
    };
    const venta = ventaConverter.fromFirestore(snapshotDe('v-futura', doc), {});

    expect(venta.items[0]?.costeo).toBeUndefined();
    expect(clasificarCosteo(venta.items[0] ?? {})).toBe('legado');
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

  it('omite el mapa costeo cuando el ítem no lo trae (venta vieja, byte-idéntica)', () => {
    const doc = ventaConverter.toFirestore(venta);
    const items = doc.items as Record<string, unknown>[];

    expect(items[0]).not.toHaveProperty('costeo');
    expect(items[1]).not.toHaveProperty('costeo');
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
    const conCosteo: Venta = {
      ...venta,
      items: [
        {
          productoId: 'prod1',
          nombreProducto: 'Queso Colonia',
          piezaId: 'pz1',
          gramos: peso(350),
          precioUnitCents: money(89900),
          subtotalCents: money(31465),
          costeo,
        },
      ],
    };

    const doc = ventaConverter.toFirestore(conCosteo);
    const items = doc.items as Record<string, unknown>[];
    expect(items[0]?.costeo).toEqual({
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: 30000,
      costoItemCents: 10500,
      compraId: 'compra-7',
    });

    const reconstruido = ventaConverter.fromFirestore(
      snapshotDe('v1', { ...doc, fecha: timestampFalso(fecha) }),
      {},
    );
    expect(reconstruido.items[0]?.costeo).toEqual(costeo);
  });

  it('sin_costo: NO persiste montos (un 0 declararía 100 % de ganancia)', () => {
    const costeo: CosteoItem = { v: 1, fuente: 'sin_costo', origen: 'venta' };
    const conCosteo: Venta = {
      ...venta,
      items: [
        {
          productoId: 'prod2',
          nombreProducto: 'Miel 500g',
          unidades: 2,
          precioUnitCents: money(25000),
          subtotalCents: money(50000),
          costeo,
        },
      ],
    };

    const doc = ventaConverter.toFirestore(conCosteo);
    const mapa = (doc.items as Record<string, unknown>[])[0]?.costeo as Record<string, unknown>;

    expect(mapa).toEqual({ v: 1, fuente: 'sin_costo', origen: 'venta' });
    expect(mapa).not.toHaveProperty('costoUnitCents');
    expect(mapa).not.toHaveProperty('costoItemCents');
    expect(mapa).not.toHaveProperty('compraId');
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
