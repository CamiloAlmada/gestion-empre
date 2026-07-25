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
  batch: { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() },
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

  // El invariante que sostiene la unicidad: el id del documento ES la clave.
  describe('el id del documento es la clave del nombre', () => {
    it('usa la clave como id, no un id autogenerado', async () => {
      const { categoriaId } = await crearCategoria(db, 'Quesos');

      expect(categoriaId).toBe('quesos');
      const [ref] = mocks.setDoc.mock.calls[0] as [RefFalsa, Categoria];
      expect(ref.path).toBe('categorias/quesos');
      expect(ref.id).toBe('quesos');
    });

    it('normaliza mayúsculas y espacios en el id, y conserva el nombre tal cual', async () => {
      const { categoriaId } = await crearCategoria(db, '  Frutos Secos  ');

      expect(categoriaId).toBe('frutos secos');
      const [, data] = mocks.setDoc.mock.calls[0] as [RefFalsa, Categoria];
      expect(data.nombre).toBe('Frutos Secos');
    });

    it('conserva eñe y acentos en el id (no se pliegan a ASCII)', async () => {
      const { categoriaId } = await crearCategoria(db, 'Ñoquis');
      expect(categoriaId).toBe('ñoquis');

      mocks.setDoc.mockClear();
      mocks.estado.categorias = [];
      const cafe = await crearCategoria(db, 'CAFÉ');
      expect(cafe.categoriaId).toBe('café');
    });

    it('dos altas del mismo nombre apuntan al MISMO path (la carrera converge)', async () => {
      // Dos dispositivos offline: ninguno ve la categoría del otro, así que los
      // dos pasan el chequeo de duplicados. Lo que los salva es el path.
      const uno = await crearCategoria(db, 'Quesos');
      const otro = await crearCategoria(db, '  quesos ');

      expect(uno.categoriaId).toBe(otro.categoriaId);
      const rutas = (mocks.setDoc.mock.calls as [RefFalsa, Categoria][]).map(([r]) => r.path);
      expect(rutas).toEqual(['categorias/quesos', 'categorias/quesos']);
    });
  });

  describe('nombres cuya clave no sirve como id de Firestore', () => {
    for (const nombre of ['.', '..', 'a/b', '__x__', 'quesos/frescos', '__proto__']) {
      it(`rechaza ${JSON.stringify(nombre)} con error de dominio en español`, async () => {
        await expect(crearCategoria(db, nombre)).rejects.toThrow(CategoriaInvalidaError);
        expect(mocks.setDoc).not.toHaveBeenCalled();
      });
    }

    it('el mensaje explica el problema en español', async () => {
      await expect(crearCategoria(db, 'a/b')).rejects.toThrow(
        /no es un nombre de categoría válido/,
      );
    });

    it('acepta nombres con puntos o guiones bajos que sí son ids válidos', async () => {
      await expect(crearCategoria(db, 'Quesos 1.5 kg')).resolves.toEqual({
        categoriaId: 'quesos 1.5 kg',
      });
    });
  });
});

describe('renombrarCategoria', () => {
  // Los ids de las categorías son canónicos (id === clave del nombre), que es el
  // estado que garantizan `crearCategoria` y las reglas.

  it('la clave cambia: mueve el documento de path y re-etiqueta los productos en UN batch', async () => {
    mocks.estado.categorias = [
      categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 }),
      categoria({ id: 'miel', nombre: 'Miel', orden: 1 }),
    ];
    mocks.estado.productos = [
      { id: 'p1', categoria: 'Quesos' },
      { id: 'p2', categoria: 'Quesos' },
      { id: 'p3', categoria: 'Miel' },
    ];

    await renombrarCategoria(db, 'quesos', 'Quesos artesanales');

    // Documento nuevo en el path de la clave nueva, conservando el orden.
    const sets = mocks.batch.set.mock.calls as [RefFalsa, Categoria][];
    expect(sets).toHaveLength(1);
    expect(sets[0]?.[0].path).toBe('categorias/quesos artesanales');
    expect(sets[0]?.[1]).toEqual({
      id: 'quesos artesanales',
      nombre: 'Quesos artesanales',
      orden: 0,
    });

    // Documento viejo borrado, en el mismo batch.
    const deletes = mocks.batch.delete.mock.calls as [RefFalsa][];
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.[0].path).toBe('categorias/quesos');

    // Fan-out: solo los productos de esa categoría (p3 es Miel).
    const updates = mocks.batch.update.mock.calls as [RefFalsa, Record<string, unknown>][];
    expect(updates.map(([ref, data]) => [ref.path, data.categoria])).toEqual([
      ['productos/p1', 'Quesos artesanales'],
      ['productos/p2', 'Quesos artesanales'],
    ]);

    // Todo en un único commit: o se muda y se re-etiqueta, o no pasa nada.
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('la clave NO cambia (solo mayúsculas): conserva el id y actualiza in-place', async () => {
    mocks.estado.categorias = [categoria({ id: 'quesos', nombre: 'quesos', orden: 0 })];
    mocks.estado.productos = [{ id: 'p1', categoria: 'quesos' }];

    await renombrarCategoria(db, 'quesos', 'Quesos');

    // Ni alta ni borrado: el documento se queda donde está.
    expect(mocks.batch.set).not.toHaveBeenCalled();
    expect(mocks.batch.delete).not.toHaveBeenCalled();

    const updates = mocks.batch.update.mock.calls as [RefFalsa, Record<string, unknown>][];
    const catUpdate = updates.find(([ref]) => ref.path === 'categorias/quesos');
    expect(catUpdate?.[1]).toEqual({ nombre: 'Quesos', clave: 'quesos' });
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('la clave no cambia con espacios de borde tampoco', async () => {
    mocks.estado.categorias = [categoria({ id: 'miel', nombre: 'Miel', orden: 0 })];

    await renombrarCategoria(db, 'miel', '  Miel  ');

    expect(mocks.batch.set).not.toHaveBeenCalled();
    expect(mocks.batch.delete).not.toHaveBeenCalled();
  });

  it('renombrar un documento heredado (id autogenerado) lo reubica en su path canónico', async () => {
    mocks.estado.categorias = [categoria({ id: 'AbC123xyz', nombre: 'Quesos', orden: 2 })];

    await renombrarCategoria(db, 'AbC123xyz', 'Quesos');

    const sets = mocks.batch.set.mock.calls as [RefFalsa, Categoria][];
    expect(sets[0]?.[0].path).toBe('categorias/quesos');
    expect(sets[0]?.[1].orden).toBe(2);
    const deletes = mocks.batch.delete.mock.calls as [RefFalsa][];
    expect(deletes[0]?.[0].path).toBe('categorias/AbC123xyz');
  });

  it('rechaza nombre vacío', async () => {
    mocks.estado.categorias = [categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 })];
    await expect(renombrarCategoria(db, 'quesos', '  ')).rejects.toThrow(CategoriaInvalidaError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza un nombre nuevo cuya clave no sirve como id', async () => {
    mocks.estado.categorias = [categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 })];
    await expect(renombrarCategoria(db, 'quesos', 'a/b')).rejects.toThrow(CategoriaInvalidaError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza si la categoría no existe', async () => {
    mocks.estado.categorias = [categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 })];
    await expect(renombrarCategoria(db, 'inexistente', 'X')).rejects.toThrow(CategoriaInvalidaError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza duplicado contra OTRA categoría (case-insensitive)', async () => {
    mocks.estado.categorias = [
      categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 }),
      categoria({ id: 'miel', nombre: 'Miel', orden: 1 }),
    ];
    await expect(renombrarCategoria(db, 'quesos', 'miel')).rejects.toThrow(CategoriaDuplicadaError);
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
