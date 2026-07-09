import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Categoria } from '@gestion/core';
import {
  crearCategoria,
  intercambiarOrdenCategorias,
  renombrarCategoria,
} from './categorias';
import { CategoriaDuplicadaError, CategoriaInvalidaError } from './errores';

// Mock de `firebase/firestore` en el estilo de stock.test.ts / ventas.test.ts:
// batch capturado, refs como `{ path, id }` con `withConverter` encadenable, y
// además `getDocs`/`query`/`where`/`setDoc` para las lecturas de estas funciones.
// El estado leído lo controla cada test vía `estado.categorias` / `estado.productos`.
const mocks = vi.hoisted(() => ({
  batch: { set: vi.fn(), update: vi.fn(), commit: vi.fn() },
  setDoc: vi.fn(),
  estado: { categorias: [] as Categoria[], productos: [] as { id: string; categoria: string }[] },
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

// Snapshot de query: cada doc expone `.data()` (categorías) y `.ref` (productos).
function snapshotDe(
  coleccion: string,
  items: readonly { id: string }[],
): { docs: { id: string; data: () => unknown; ref: RefFalsa }[] } {
  return {
    docs: items.map((it) => ({
      id: it.id,
      data: () => it,
      ref: crearRef(`${coleccion}/${it.id}`, it.id),
    })),
  };
}

vi.mock('firebase/firestore', () => ({
  writeBatch: () => mocks.batch,
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
  query: (coleccion: ColeccionFalsa, ...clausulas: unknown[]) => ({
    __collection: coleccion.__collection,
    __clausulas: clausulas,
  }),
  where: (campo: string, op: string, valor: unknown) => ({ __where: [campo, op, valor] }),
  getDocs: (fuente: { __collection: string; __clausulas?: { __where: unknown[] }[] }) => {
    if (fuente.__collection === 'categorias') {
      return Promise.resolve(snapshotDe('categorias', mocks.estado.categorias));
    }
    // productos: filtra por la cláusula where('categoria','==', valor).
    const clausula = fuente.__clausulas?.[0]?.__where as [string, string, string] | undefined;
    const valor = clausula?.[2];
    const filtrados = mocks.estado.productos.filter((p) => p.categoria === valor);
    return Promise.resolve(snapshotDe('productos', filtrados));
  },
  setDoc: (ref: RefFalsa, data: unknown) => {
    mocks.setDoc(ref, data);
    return Promise.resolve();
  },
}));

const db = {} as never;

function categoria(over: Partial<Categoria> & Pick<Categoria, 'id'>): Categoria {
  return { nombre: 'Cat', orden: 0, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contador.n = 0;
  mocks.estado.categorias = [];
  mocks.estado.productos = [];
  mocks.batch.commit.mockResolvedValue(undefined);
});

describe('crearCategoria', () => {
  it('primera categoría: orden 0', async () => {
    const { categoriaId } = await crearCategoria(db, 'Quesos');

    const [ref, data] = mocks.setDoc.mock.calls[0] as [RefFalsa, Categoria];
    expect(ref.path).toBe(`categorias/${categoriaId}`);
    expect(data).toEqual({ id: categoriaId, nombre: 'Quesos', orden: 0 });
  });

  it('con categorías existentes: orden = max(orden) + 1', async () => {
    mocks.estado.categorias = [
      categoria({ id: 'c1', nombre: 'Quesos', orden: 0 }),
      categoria({ id: 'c2', nombre: 'Miel', orden: 3 }),
      categoria({ id: 'c3', nombre: 'Especias', orden: 1 }),
    ];
    await crearCategoria(db, 'Embutidos');

    const [, data] = mocks.setDoc.mock.calls[0] as [RefFalsa, Categoria];
    expect(data.orden).toBe(4);
    expect(data.nombre).toBe('Embutidos');
  });

  it('recorta espacios del nombre antes de guardar', async () => {
    await crearCategoria(db, '  Frutos secos  ');
    const [, data] = mocks.setDoc.mock.calls[0] as [RefFalsa, Categoria];
    expect(data.nombre).toBe('Frutos secos');
  });

  it('rechaza nombre vacío (solo espacios)', async () => {
    await expect(crearCategoria(db, '   ')).rejects.toThrow(CategoriaInvalidaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('rechaza duplicado exacto', async () => {
    mocks.estado.categorias = [categoria({ id: 'c1', nombre: 'Quesos', orden: 0 })];
    await expect(crearCategoria(db, 'Quesos')).rejects.toThrow(CategoriaDuplicadaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('rechaza duplicado case-insensitive y con espacios de borde', async () => {
    mocks.estado.categorias = [categoria({ id: 'c1', nombre: 'Quesos', orden: 0 })];
    await expect(crearCategoria(db, '  quESOS ')).rejects.toThrow(CategoriaDuplicadaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});

describe('renombrarCategoria', () => {
  it('renombra la categoría y re-etiqueta sus productos en un batch', async () => {
    mocks.estado.categorias = [
      categoria({ id: 'c1', nombre: 'Quesos', orden: 0 }),
      categoria({ id: 'c2', nombre: 'Miel', orden: 1 }),
    ];
    mocks.estado.productos = [
      { id: 'p1', categoria: 'Quesos' },
      { id: 'p2', categoria: 'Quesos' },
      { id: 'p3', categoria: 'Miel' },
    ];

    await renombrarCategoria(db, 'c1', 'Quesos artesanales');

    const updates = mocks.batch.update.mock.calls as [RefFalsa, Record<string, unknown>][];
    // 1 update a la categoría + 2 a los productos que la referenciaban (p3 es Miel).
    expect(updates).toHaveLength(3);

    const catUpdate = updates.find(([ref]) => ref.path === 'categorias/c1');
    expect(catUpdate?.[1]).toEqual({ nombre: 'Quesos artesanales' });

    const productos = updates
      .filter(([ref]) => ref.path.startsWith('productos/'))
      .map(([ref, data]) => [ref.path, data.categoria]);
    expect(productos).toEqual([
      ['productos/p1', 'Quesos artesanales'],
      ['productos/p2', 'Quesos artesanales'],
    ]);
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('permite corregir solo el uso de mayúsculas (excluye la propia del chequeo)', async () => {
    mocks.estado.categorias = [categoria({ id: 'c1', nombre: 'quesos', orden: 0 })];
    mocks.estado.productos = [{ id: 'p1', categoria: 'quesos' }];

    await renombrarCategoria(db, 'c1', 'Quesos');

    const catUpdate = (mocks.batch.update.mock.calls as [RefFalsa, Record<string, unknown>][]).find(
      ([ref]) => ref.path === 'categorias/c1',
    );
    expect(catUpdate?.[1]).toEqual({ nombre: 'Quesos' });
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('rechaza nombre vacío', async () => {
    mocks.estado.categorias = [categoria({ id: 'c1', nombre: 'Quesos', orden: 0 })];
    await expect(renombrarCategoria(db, 'c1', '  ')).rejects.toThrow(CategoriaInvalidaError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza si la categoría no existe', async () => {
    mocks.estado.categorias = [categoria({ id: 'c1', nombre: 'Quesos', orden: 0 })];
    await expect(renombrarCategoria(db, 'inexistente', 'X')).rejects.toThrow(CategoriaInvalidaError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza duplicado contra OTRA categoría (case-insensitive)', async () => {
    mocks.estado.categorias = [
      categoria({ id: 'c1', nombre: 'Quesos', orden: 0 }),
      categoria({ id: 'c2', nombre: 'Miel', orden: 1 }),
    ];
    await expect(renombrarCategoria(db, 'c1', 'miel')).rejects.toThrow(CategoriaDuplicadaError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });
});

describe('intercambiarOrdenCategorias', () => {
  it('intercambia los orden de las dos categorías en un batch', async () => {
    const a = categoria({ id: 'c1', nombre: 'Quesos', orden: 0 });
    const b = categoria({ id: 'c2', nombre: 'Miel', orden: 1 });

    await intercambiarOrdenCategorias(db, a, b);

    const updates = mocks.batch.update.mock.calls as [RefFalsa, Record<string, unknown>][];
    expect(updates).toHaveLength(2);
    const porRuta = Object.fromEntries(updates.map(([ref, data]) => [ref.path, data.orden]));
    expect(porRuta).toEqual({ 'categorias/c1': 1, 'categorias/c2': 0 });
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });
});
