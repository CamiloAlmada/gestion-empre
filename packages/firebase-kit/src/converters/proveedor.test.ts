import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { Proveedor } from '@gestion/core';
import { proveedorConverter } from './proveedor';

function timestampFalso(fecha: Date) {
  return { toDate: () => fecha };
}

function snapshotDe(id: string, datos: unknown): QueryDocumentSnapshot {
  return {
    id,
    data: () => datos,
  } as unknown as QueryDocumentSnapshot;
}

const alta = new Date('2026-03-01T10:00:00.000Z');

const docCompleto = {
  nombre: 'Lácteos Colonia S.A.',
  contactoNombre: 'Juan Pérez',
  telefono: '099999999',
  email: 'ventas@lacteoscolonia.uy',
  direccion: 'Ruta 1 km 177, Colonia',
  rut: '210000000012',
  pagos: [
    { banco: 'BROU', cuenta: '001234567', titular: 'Lácteos Colonia S.A.', moneda: 'UYU' },
    { banco: 'Itaú', cuenta: '7654321' },
  ],
  notas: 'Entrega los martes',
  fechaAlta: timestampFalso(alta),
  activo: true,
};

describe('proveedorConverter.fromFirestore', () => {
  it('reconstruye el proveedor con id desde snapshot.id y mapea los pagos', () => {
    const proveedor = proveedorConverter.fromFirestore(snapshotDe('p1', docCompleto), {});

    expect(proveedor.id).toBe('p1');
    expect(proveedor.nombre).toBe('Lácteos Colonia S.A.');
    expect(proveedor.rut).toBe('210000000012');
    expect(proveedor.fechaAlta).toEqual(alta);
    expect(proveedor.pagos).toHaveLength(2);
    expect(proveedor.pagos?.[0]).toEqual({
      banco: 'BROU',
      cuenta: '001234567',
      titular: 'Lácteos Colonia S.A.',
      moneda: 'UYU',
    });
    expect(proveedor.pagos?.[1]).toEqual({
      banco: 'Itaú',
      cuenta: '7654321',
      titular: undefined,
      moneda: undefined,
    });
  });

  it('opcionales ausentes quedan undefined (incluido pagos)', () => {
    const docMinimo = {
      nombre: 'Proveedor mínimo',
      fechaAlta: timestampFalso(alta),
      activo: true,
    };
    const proveedor = proveedorConverter.fromFirestore(snapshotDe('p2', docMinimo), {});

    expect(proveedor.contactoNombre).toBeUndefined();
    expect(proveedor.telefono).toBeUndefined();
    expect(proveedor.rut).toBeUndefined();
    expect(proveedor.pagos).toBeUndefined();
    expect(proveedor.notas).toBeUndefined();
  });
});

describe('proveedorConverter.toFirestore', () => {
  const proveedor: Proveedor = {
    id: 'p1',
    nombre: 'Lácteos Colonia S.A.',
    contactoNombre: 'Juan Pérez',
    telefono: '099999999',
    email: 'ventas@lacteoscolonia.uy',
    direccion: 'Ruta 1 km 177, Colonia',
    rut: '210000000012',
    pagos: [
      { banco: 'BROU', cuenta: '001234567', titular: 'Lácteos Colonia S.A.', moneda: 'UYU' },
      { banco: 'Itaú', cuenta: '7654321' },
    ],
    notas: 'Entrega los martes',
    fechaAlta: alta,
    activo: true,
  };

  it('no persiste el id', () => {
    const doc = proveedorConverter.toFirestore(proveedor);
    expect(doc).not.toHaveProperty('id');
  });

  it('round-trip: toFirestore » fromFirestore preserva los datos (menos el id)', () => {
    const doc = proveedorConverter.toFirestore(proveedor);
    const reconstruido = proveedorConverter.fromFirestore(
      snapshotDe('otro-id', { ...doc, fechaAlta: timestampFalso(alta) }),
      {},
    );

    expect(reconstruido).toEqual({ ...proveedor, id: 'otro-id' });
  });

  it('omite del doc los opcionales ausentes y los sub-campos de cada pago', () => {
    const proveedorMinimo: Proveedor = {
      id: 'p9',
      nombre: 'Proveedor mínimo',
      fechaAlta: alta,
      activo: true,
    };
    const doc = proveedorConverter.toFirestore(proveedorMinimo);

    expect(doc).not.toHaveProperty('contactoNombre');
    expect(doc).not.toHaveProperty('rut');
    expect(doc).not.toHaveProperty('pagos');
    expect(doc).not.toHaveProperty('notas');
  });

  it('un pago sin titular/moneda omite esos sub-campos', () => {
    const doc = proveedorConverter.toFirestore(proveedor);
    const pagos = doc.pagos as Record<string, unknown>[];
    expect(pagos[1]).not.toHaveProperty('titular');
    expect(pagos[1]).not.toHaveProperty('moneda');
  });
});
