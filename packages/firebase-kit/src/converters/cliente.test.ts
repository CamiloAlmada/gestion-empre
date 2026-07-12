import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { money, type Cliente } from '@gestion/core';
import { clienteConverter } from './cliente';

/** Timestamp falso: alcanza con `.toDate()` para lo que usa el converter. */
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
const primera = new Date('2026-03-02T11:00:00.000Z');
const ultima = new Date('2026-05-20T18:00:00.000Z');

const docCompleto = {
  nombre: 'Marta González',
  alias: 'Marta la de enfrente',
  telefono: '099123456',
  email: 'marta@example.com',
  direccion: 'Av. Siempre Viva 742',
  notas: 'Compra queso los sábados',
  fechaAlta: timestampFalso(alta),
  activo: true,
  stats: {
    cantidadVentas: 7,
    totalHistoricoCents: 123450,
    primeraCompra: timestampFalso(primera),
    ultimaCompra: timestampFalso(ultima),
  },
};

describe('clienteConverter.fromFirestore', () => {
  it('reconstruye el cliente con id desde snapshot.id y mapea stats', () => {
    const cliente = clienteConverter.fromFirestore(snapshotDe('c1', docCompleto), {});

    expect(cliente.id).toBe('c1');
    expect(cliente.nombre).toBe('Marta González');
    expect(cliente.alias).toBe('Marta la de enfrente');
    expect(cliente.telefono).toBe('099123456');
    expect(cliente.fechaAlta).toEqual(alta);
    expect(cliente.activo).toBe(true);
    expect(cliente.stats.cantidadVentas).toBe(7);
    expect(cliente.stats.totalHistoricoCents).toBe(123450);
    expect(cliente.stats.primeraCompra).toEqual(primera);
    expect(cliente.stats.ultimaCompra).toEqual(ultima);
  });

  it('opcionales de contacto y fechas de stats ausentes quedan undefined', () => {
    const docMinimo = {
      nombre: 'Anónimo con nombre',
      fechaAlta: timestampFalso(alta),
      activo: true,
      stats: { cantidadVentas: 0, totalHistoricoCents: 0 },
    };
    const cliente = clienteConverter.fromFirestore(snapshotDe('c2', docMinimo), {});

    expect(cliente.alias).toBeUndefined();
    expect(cliente.telefono).toBeUndefined();
    expect(cliente.telefonoE164).toBeUndefined();
    expect(cliente.email).toBeUndefined();
    expect(cliente.direccion).toBeUndefined();
    expect(cliente.notas).toBeUndefined();
    expect(cliente.stats.primeraCompra).toBeUndefined();
    expect(cliente.stats.ultimaCompra).toBeUndefined();
    expect(cliente.stats.totalHistoricoCents).toBe(0);
  });

  it('reconstruye telefonoE164 (derivado) cuando está presente en el doc', () => {
    const conE164 = { ...docCompleto, telefonoE164: '59899123456' };
    const cliente = clienteConverter.fromFirestore(snapshotDe('c4', conE164), {});
    expect(cliente.telefonoE164).toBe('59899123456');
  });

  it('rechaza totalHistoricoCents no entero (doc corrupto)', () => {
    const docCorrupto = { ...docCompleto, stats: { ...docCompleto.stats, totalHistoricoCents: 1234.5 } };
    expect(() => clienteConverter.fromFirestore(snapshotDe('c3', docCorrupto), {})).toThrow(
      RangeError,
    );
  });
});

describe('clienteConverter.toFirestore', () => {
  const cliente: Cliente = {
    id: 'c1',
    nombre: 'Marta González',
    alias: 'Marta la de enfrente',
    telefono: '099123456',
    email: 'marta@example.com',
    direccion: 'Av. Siempre Viva 742',
    notas: 'Compra queso los sábados',
    fechaAlta: alta,
    activo: true,
    stats: {
      cantidadVentas: 7,
      totalHistoricoCents: money(123450),
      primeraCompra: primera,
      ultimaCompra: ultima,
    },
  };

  it('no persiste el id', () => {
    const doc = clienteConverter.toFirestore(cliente);
    expect(doc).not.toHaveProperty('id');
  });

  it('persiste telefonoE164 (derivado) cuando está presente', () => {
    const doc = clienteConverter.toFirestore({ ...cliente, telefonoE164: '59899123456' });
    expect(doc.telefonoE164).toBe('59899123456');
  });

  it('round-trip: toFirestore » fromFirestore preserva los datos (menos el id)', () => {
    const doc = clienteConverter.toFirestore(cliente);
    const statsDoc = doc.stats as Record<string, unknown>;
    const reconstruido = clienteConverter.fromFirestore(
      snapshotDe('otro-id', {
        ...doc,
        fechaAlta: timestampFalso(alta),
        stats: {
          ...statsDoc,
          primeraCompra: timestampFalso(primera),
          ultimaCompra: timestampFalso(ultima),
        },
      }),
      {},
    );

    expect(reconstruido).toEqual({ ...cliente, id: 'otro-id' });
  });

  it('omite del doc los opcionales de contacto y las fechas de stats ausentes', () => {
    const clienteMinimo: Cliente = {
      id: 'c9',
      nombre: 'Alta rápida',
      fechaAlta: alta,
      activo: true,
      stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    };
    const doc = clienteConverter.toFirestore(clienteMinimo);

    expect(doc).not.toHaveProperty('alias');
    expect(doc).not.toHaveProperty('telefono');
    expect(doc).not.toHaveProperty('telefonoE164');
    expect(doc).not.toHaveProperty('email');
    expect(doc).not.toHaveProperty('direccion');
    expect(doc).not.toHaveProperty('notas');
    const statsDoc = doc.stats as Record<string, unknown>;
    expect(statsDoc).not.toHaveProperty('primeraCompra');
    expect(statsDoc).not.toHaveProperty('ultimaCompra');
    expect(statsDoc.cantidadVentas).toBe(0);
    expect(statsDoc.totalHistoricoCents).toBe(0);
  });
});
