import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crearProveedor,
  actualizarProveedor,
  desactivarProveedor,
  reactivarProveedor,
} from './proveedores';
import { ProveedorInvalidoError } from './errores';

// Mock de `firebase/firestore` como en clientes.test.ts.
const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
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

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  doc: (dbOrColeccion: unknown, ...segmentos: string[]) => {
    if (segmentos.length === 0) {
      const { __collection } = dbOrColeccion as { __collection: string };
      const id = `auto-${(mocks.contador.n += 1)}`;
      return crearRef(`${__collection}/${id}`, id);
    }
    return crearRef(segmentos.join('/'), segmentos[segmentos.length - 1] ?? '');
  },
  setDoc: (ref: RefFalsa, datos: unknown) => mocks.setDoc(ref, datos),
  updateDoc: (ref: RefFalsa, datos: unknown) => mocks.updateDoc(ref, datos),
}));

const db = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contador.n = 0;
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

    const [ref, proveedor] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toMatch(/^proveedores\//);
    expect(proveedorId).toBe(ref.id);
    expect(proveedor.nombre).toBe('Lácteos Colonia'); // recortado
    expect(proveedor.activo).toBe(true);
    expect(proveedor.fechaAlta).toBeInstanceOf(Date);
    expect(proveedor.rut).toBe('210000000012');
    expect(proveedor.pagos).toEqual([{ banco: 'BROU', cuenta: '001234567' }]);
    expect(proveedor.contactoNombre).toBeUndefined();
  });

  it('rechaza nombre vacío tras trim y no escribe', async () => {
    await expect(crearProveedor(db, { nombre: '  ' })).rejects.toThrow(ProveedorInvalidoError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
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

  it('rechaza nombre vacío y no escribe', async () => {
    await expect(actualizarProveedor(db, 'prov-1', { nombre: '' })).rejects.toThrow(
      ProveedorInvalidoError,
    );
    expect(mocks.updateDoc).not.toHaveBeenCalled();
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
