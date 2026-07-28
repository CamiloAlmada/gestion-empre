import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Proveedor } from '@gestion/core';
import {
  crearProveedor,
  actualizarProveedor,
  desactivarProveedor,
  reactivarProveedor,
  LARGO_MAX_NOMBRE_PROVEEDOR,
} from './proveedores';
import { ProveedorDuplicadoError, ProveedorInvalidoError } from './errores';

// Mock de `firebase/firestore` como en clientes.test.ts, más `getDocs` (y la
// colección encadenable con `withConverter`) al estilo de categorias.test.ts: el
// chequeo de duplicados lee la colección antes de escribir. El estado leído lo
// controla cada test vía `estado.proveedores`; el converter no interviene, el
// snapshot devuelve las entidades tal cual.
const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  estado: { proveedores: [] as Proveedor[] },
  contador: { n: 0 },
}));

interface RefFalsa {
  id: string;
  path: string;
  withConverter: () => RefFalsa;
}

function crearRef(path: string, id: string): RefFalsa {
  const ref: RefFalsa = { id, path, withConverter: () => ref };
  return ref;
}

interface ColeccionFalsa {
  __collection: string;
  withConverter: () => ColeccionFalsa;
}

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string): ColeccionFalsa => {
    const c: ColeccionFalsa = { __collection: path, withConverter: () => c };
    return c;
  },
  doc: (dbOrColeccion: unknown, ...segmentos: string[]) => {
    if (segmentos.length === 0) {
      const { __collection } = dbOrColeccion as { __collection: string };
      const id = `auto-${(mocks.contador.n += 1)}`;
      return crearRef(`${__collection}/${id}`, id);
    }
    return crearRef(segmentos.join('/'), segmentos[segmentos.length - 1] ?? '');
  },
  getDocs: (fuente: ColeccionFalsa) => {
    if (fuente.__collection !== 'proveedores') {
      throw new Error(`getDocs inesperado sobre ${fuente.__collection}`);
    }
    return Promise.resolve({
      docs: mocks.estado.proveedores.map((p) => ({ id: p.id, data: () => p })),
    });
  },
  setDoc: (ref: RefFalsa, datos: unknown) => mocks.setDoc(ref, datos),
  updateDoc: (ref: RefFalsa, datos: unknown) => mocks.updateDoc(ref, datos),
}));

const db = {} as never;

function proveedor(over: Partial<Proveedor> & Pick<Proveedor, 'id' | 'nombre'>): Proveedor {
  return { fechaAlta: new Date('2026-01-01'), activo: true, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contador.n = 0;
  mocks.estado.proveedores = [];
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.updateDoc.mockResolvedValue(undefined);
});

describe('crearProveedor', () => {
  it('crea con activo true, fechaAlta y los pagos provistos', async () => {
    const { proveedorId } = await crearProveedor(db, {
      nombre: '  Lácteos Colonia  ',
      rut: '210000000012',
      pagos: [{ banco: 'BROU', cuenta: '001234567' }],
    });

    const [ref, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toMatch(/^proveedores\//);
    expect(proveedorId).toBe(ref.id);
    expect(prov.nombre).toBe('Lácteos Colonia'); // recortado
    expect(prov.activo).toBe(true);
    expect(prov.fechaAlta).toBeInstanceOf(Date);
    expect(prov.rut).toBe('210000000012');
    expect(prov.pagos).toEqual([{ banco: 'BROU', cuenta: '001234567' }]);
    expect(prov.contactoNombre).toBeUndefined();
  });

  it('devuelve una sincronizacion que resuelve con el ack del servidor', async () => {
    const { sincronizacion } = await crearProveedor(db, { nombre: 'La Rural' });
    await expect(sincronizacion).resolves.toBeUndefined();
  });

  it('resuelve con el id aunque el ack nunca llegue (sin conexión)', async () => {
    // Fase 1 no espera al servidor: con el `setDoc` colgado, la promesa externa
    // igual resuelve y la pantalla puede seguir usando el id.
    const colgada = new Promise<void>(() => {});
    mocks.setDoc.mockReturnValue(colgada);

    const { proveedorId, sincronizacion } = await crearProveedor(db, { nombre: 'La Rural' });

    expect(proveedorId).toMatch(/^auto-/);
    expect(sincronizacion).toBe(colgada);
  });

  it('el rechazo del servidor viaja por sincronizacion, no por la promesa externa', async () => {
    mocks.setDoc.mockRejectedValue(new Error('permission-denied'));

    const { sincronizacion } = await crearProveedor(db, { nombre: 'La Rural' });

    await expect(sincronizacion).rejects.toThrow('permission-denied');
  });

  it('rechaza nombre vacío tras trim y no escribe', async () => {
    await expect(crearProveedor(db, { nombre: '  ' })).rejects.toThrow(ProveedorInvalidoError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('acepta un nombre de exactamente el largo máximo', async () => {
    const nombre = 'a'.repeat(LARGO_MAX_NOMBRE_PROVEEDOR);
    await crearProveedor(db, { nombre });
    const [, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(prov.nombre).toBe(nombre);
  });

  it('rechaza un nombre más largo que el máximo y no escribe', async () => {
    const nombre = 'a'.repeat(LARGO_MAX_NOMBRE_PROVEEDOR + 1);
    await expect(crearProveedor(db, { nombre })).rejects.toThrow(ProveedorInvalidoError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('mide el largo tras trim: 120 caracteres rodeados de espacios es válido', async () => {
    const nombre = 'a'.repeat(LARGO_MAX_NOMBRE_PROVEEDOR);
    await crearProveedor(db, { nombre: `   ${nombre}   ` });
    const [, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(prov.nombre).toBe(nombre);
  });

  it('acepta nombres con "/" o "." (el id es autogenerado, no deriva del nombre)', async () => {
    await crearProveedor(db, { nombre: 'Distribuidora S.A. / Colonia' });
    const [ref, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(prov.nombre).toBe('Distribuidora S.A. / Colonia');
    expect(ref.id).toMatch(/^auto-/);
  });

  describe('unicidad del nombre', () => {
    it('rechaza un duplicado exacto y no escribe', async () => {
      mocks.estado.proveedores = [proveedor({ id: 'p1', nombre: 'La Rural' })];

      await expect(crearProveedor(db, { nombre: 'La Rural' })).rejects.toThrow(
        ProveedorDuplicadoError,
      );
      expect(mocks.setDoc).not.toHaveBeenCalled();
    });

    it('rechaza un duplicado que solo difiere en mayúsculas y espacios de borde', async () => {
      mocks.estado.proveedores = [proveedor({ id: 'p1', nombre: 'La Rural' })];

      await expect(crearProveedor(db, { nombre: '  LA rural ' })).rejects.toThrow(
        ProveedorDuplicadoError,
      );
      expect(mocks.setDoc).not.toHaveBeenCalled();
    });

    it('nombra al proveedor existente en el mensaje, no al que se tipeó', async () => {
      mocks.estado.proveedores = [proveedor({ id: 'p1', nombre: 'La Rural' })];

      await expect(crearProveedor(db, { nombre: 'la rural' })).rejects.toThrow(
        'Ya existe un proveedor llamado "La Rural".',
      );
    });

    it('un homónimo INACTIVO también es duplicado, con un mensaje que invita a reactivarlo', async () => {
      mocks.estado.proveedores = [
        proveedor({ id: 'p1', nombre: 'La Rural', activo: false }),
      ];

      await expect(crearProveedor(db, { nombre: 'La Rural' })).rejects.toThrow(
        'Ya existe un proveedor llamado "La Rural" (está inactivo, podés reactivarlo).',
      );
      expect(mocks.setDoc).not.toHaveBeenCalled();
    });

    it('NO pliega acentos: "Café" y "Cafe" son dos proveedores distintos', async () => {
      mocks.estado.proveedores = [proveedor({ id: 'p1', nombre: 'Café Brasilero' })];

      await crearProveedor(db, { nombre: 'Cafe Brasilero' });

      const [, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
      expect(prov.nombre).toBe('Cafe Brasilero');
    });

    it('NO pliega la eñe: "Niño" y "Nino" son dos proveedores distintos', async () => {
      mocks.estado.proveedores = [proveedor({ id: 'p1', nombre: 'El Niño' })];

      await crearProveedor(db, { nombre: 'El Nino' });

      expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    });

    it('deja pasar un nombre distinto aunque haya otros proveedores', async () => {
      mocks.estado.proveedores = [
        proveedor({ id: 'p1', nombre: 'La Rural' }),
        proveedor({ id: 'p2', nombre: 'Lácteos Colonia' }),
      ];

      const { proveedorId } = await crearProveedor(db, { nombre: 'Granja del Sur' });

      expect(mocks.setDoc).toHaveBeenCalledTimes(1);
      expect(proveedorId).toMatch(/^auto-/);
    });
  });
});

describe('actualizarProveedor', () => {
  it('actualiza datos sin tocar activo', async () => {
    await actualizarProveedor(db, 'prov-1', {
      nombre: 'Lácteos Colonia',
      telefono: '099999999',
    });
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('proveedores/prov-1');
    expect(cambios).toEqual({ nombre: 'Lácteos Colonia', telefono: '099999999' });
    expect(cambios).not.toHaveProperty('activo');
  });

  it('devuelve una sincronizacion que resuelve con el ack del servidor', async () => {
    const { sincronizacion } = await actualizarProveedor(db, 'prov-1', { nombre: 'La Rural' });
    await expect(sincronizacion).resolves.toBeUndefined();
  });

  it('resuelve aunque el ack nunca llegue (sin conexión)', async () => {
    const colgada = new Promise<void>(() => {});
    mocks.updateDoc.mockReturnValue(colgada);

    const { sincronizacion } = await actualizarProveedor(db, 'prov-1', { nombre: 'La Rural' });

    expect(sincronizacion).toBe(colgada);
  });

  it('el rechazo del servidor viaja por sincronizacion, no por la promesa externa', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('permission-denied'));

    const { sincronizacion } = await actualizarProveedor(db, 'prov-1', { nombre: 'La Rural' });

    await expect(sincronizacion).rejects.toThrow('permission-denied');
  });

  it('rechaza nombre vacío y no escribe', async () => {
    await expect(actualizarProveedor(db, 'prov-1', { nombre: '' })).rejects.toThrow(
      ProveedorInvalidoError,
    );
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it('rechaza un nombre más largo que el máximo y no escribe', async () => {
    const nombre = 'a'.repeat(LARGO_MAX_NOMBRE_PROVEEDOR + 1);
    await expect(actualizarProveedor(db, 'prov-1', { nombre })).rejects.toThrow(
      ProveedorInvalidoError,
    );
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  describe('unicidad del nombre', () => {
    it('permite corregir solo las mayúsculas del propio nombre', async () => {
      mocks.estado.proveedores = [proveedor({ id: 'p1', nombre: 'la rural' })];

      await actualizarProveedor(db, 'p1', { nombre: 'La Rural' });

      const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
      expect(ref.path).toBe('proveedores/p1');
      expect(cambios).toEqual({ nombre: 'La Rural' });
    });

    it('rechaza chocar con OTRO proveedor y no escribe', async () => {
      mocks.estado.proveedores = [
        proveedor({ id: 'p1', nombre: 'La Rural' }),
        proveedor({ id: 'p2', nombre: 'Lácteos Colonia' }),
      ];

      await expect(actualizarProveedor(db, 'p2', { nombre: 'la rural' })).rejects.toThrow(
        ProveedorDuplicadoError,
      );
      expect(mocks.updateDoc).not.toHaveBeenCalled();
    });

    it('rechaza chocar con otro proveedor INACTIVO, con el mensaje que lo distingue', async () => {
      mocks.estado.proveedores = [
        proveedor({ id: 'p1', nombre: 'La Rural', activo: false }),
        proveedor({ id: 'p2', nombre: 'Lácteos Colonia' }),
      ];

      await expect(actualizarProveedor(db, 'p2', { nombre: 'La Rural' })).rejects.toThrow(
        'Ya existe un proveedor llamado "La Rural" (está inactivo, podés reactivarlo).',
      );
      expect(mocks.updateDoc).not.toHaveBeenCalled();
    });

    it('edita aunque el proveedor no esté en la lectura (caché incompleta offline)', async () => {
      mocks.estado.proveedores = [proveedor({ id: 'p1', nombre: 'Lácteos Colonia' })];

      await actualizarProveedor(db, 'p-fuera-de-cache', { nombre: 'La Rural' });

      expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    });
  });
});

describe('desactivarProveedor', () => {
  it('escribe solo activo:false (no borra)', async () => {
    await desactivarProveedor(db, 'prov-1');
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('proveedores/prov-1');
    expect(cambios).toEqual({ activo: false });
  });
});

describe('reactivarProveedor', () => {
  it('escribe solo activo:true (inversa de desactivarProveedor)', async () => {
    await reactivarProveedor(db, 'prov-1');
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('proveedores/prov-1');
    expect(cambios).toEqual({ activo: true });
  });
});
