import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { money, peso, type Producto } from '@gestion/core';
import { productoConverter } from './producto';

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

const fecha = new Date('2026-01-15T12:00:00.000Z');

const docCompleto = {
  nombre: 'Queso Colonia',
  categoria: 'Quesos',
  modoPrecio: 'por_kg',
  modoStock: 'fraccionado_por_pieza',
  precioVentaCents: 89900,
  costoPromedioCents: 54000,
  margenObjetivoPct: 40,
  stockGranelGramos: 1500,
  stockUnidades: 3,
  umbralAlertaStock: 200,
  activo: true,
  actualizadoEn: timestampFalso(fecha),
};

describe('productoConverter.fromFirestore', () => {
  it('reconstruye el producto con id desde snapshot.id, no del doc', () => {
    const producto = productoConverter.fromFirestore(snapshotDe('p1', docCompleto), {});

    expect(producto.id).toBe('p1');
    expect(producto.nombre).toBe('Queso Colonia');
    expect(producto.modoPrecio).toBe('por_kg');
    expect(producto.modoStock).toBe('fraccionado_por_pieza');
    expect(producto.precioVentaCents).toBe(89900);
    expect(producto.costoPromedioCents).toBe(54000);
    expect(producto.margenObjetivoPct).toBe(40);
    expect(producto.stockGranelGramos).toBe(1500);
    expect(producto.stockUnidades).toBe(3);
    expect(producto.umbralAlertaStock).toBe(200);
    expect(producto.activo).toBe(true);
    expect(producto.actualizadoEn).toEqual(fecha);
  });

  it('opcionales ausentes en el doc quedan undefined en dominio', () => {
    const docSinOpcionales: Partial<typeof docCompleto> = { ...docCompleto };
    delete docSinOpcionales.margenObjetivoPct;
    delete docSinOpcionales.stockGranelGramos;
    delete docSinOpcionales.stockUnidades;
    delete docSinOpcionales.umbralAlertaStock;
    const producto = productoConverter.fromFirestore(snapshotDe('p2', docSinOpcionales), {});

    expect(producto.margenObjetivoPct).toBeUndefined();
    expect(producto.stockGranelGramos).toBeUndefined();
    expect(producto.stockUnidades).toBeUndefined();
    expect(producto.umbralAlertaStock).toBeUndefined();
  });

  it('rechaza precioVentaCents no entero (doc corrupto)', () => {
    const docCorrupto = { ...docCompleto, precioVentaCents: 899.5 };
    expect(() => productoConverter.fromFirestore(snapshotDe('p3', docCorrupto), {})).toThrow(
      RangeError,
    );
  });

  it('rechaza stockGranelGramos no entero (doc corrupto)', () => {
    const docCorrupto = { ...docCompleto, stockGranelGramos: 1500.25 };
    expect(() => productoConverter.fromFirestore(snapshotDe('p4', docCorrupto), {})).toThrow(
      RangeError,
    );
  });
});

describe('productoConverter.toFirestore', () => {
  const producto: Producto = {
    id: 'p1',
    nombre: 'Queso Colonia',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    modoStock: 'fraccionado_por_pieza',
    precioVentaCents: money(89900),
    costoPromedioCents: money(54000),
    margenObjetivoPct: 40,
    stockGranelGramos: peso(1500),
    stockUnidades: 3,
    umbralAlertaStock: 200,
    activo: true,
    actualizadoEn: fecha,
  };

  it('no persiste el id', () => {
    const doc = productoConverter.toFirestore(producto);
    expect(doc).not.toHaveProperty('id');
  });

  it('round-trip: toFirestore » fromFirestore preserva los datos (menos el id)', () => {
    const doc = productoConverter.toFirestore(producto);
    const reconstruido = productoConverter.fromFirestore(
      snapshotDe('otro-id', { ...doc, actualizadoEn: timestampFalso(fecha) }),
      {},
    );

    expect(reconstruido).toEqual({ ...producto, id: 'otro-id' });
  });

  it('omite del doc los opcionales que están undefined', () => {
    const productoSinOpcionales: Producto = {
      ...producto,
      margenObjetivoPct: undefined,
      stockGranelGramos: undefined,
      stockUnidades: undefined,
      umbralAlertaStock: undefined,
    };
    const doc = productoConverter.toFirestore(productoSinOpcionales);

    expect(doc).not.toHaveProperty('margenObjetivoPct');
    expect(doc).not.toHaveProperty('stockGranelGramos');
    expect(doc).not.toHaveProperty('stockUnidades');
    expect(doc).not.toHaveProperty('umbralAlertaStock');
  });
});
