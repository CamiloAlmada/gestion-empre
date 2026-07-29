import { beforeEach, describe, expect, it, vi } from 'vitest';
import { money, type Categoria, type Producto } from '@gestion/core';
import { crearCategoria, intercambiarOrdenCategorias, renombrarCategoria } from './categorias';
import { CategoriaDuplicadaError, CategoriaInvalidaError } from './errores';

// Mock de `firebase/firestore` en el estilo de stock.test.ts / ventas.test.ts:
// batch capturado y refs como `{ path, id }` con `withConverter` encadenable.
//
// NO hay mock de lecturas (`getDocs`/`query`/`where`) porque el módulo ya no
// lee: las categorías y los productos se inyectan como arrays. Ver el doc de
// `categorias.ts`.
const mocks = vi.hoisted(() => ({
  batch: { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() },
  setDoc: vi.fn(),
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
  writeBatch: () => mocks.batch,
  doc: (_db: unknown, ...segmentos: string[]) =>
    crearRef(segmentos.join('/'), segmentos[segmentos.length - 1] ?? ''),
  setDoc: (ref: RefFalsa, data: unknown) => {
    mocks.setDoc(ref, data);
    return Promise.resolve();
  },
}));

const db = {} as never;

function categoria(over: Partial<Categoria> & Pick<Categoria, 'id'>): Categoria {
  return { nombre: 'Cat', orden: 0, ...over };
}

/** Producto mínimo: al fan-out solo le importan `id` y `categoria`. */
function producto(id: string, categoriaNombre: string): Producto {
  return {
    id,
    nombre: `Producto ${id}`,
    categoria: categoriaNombre,
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(0),
    costoPromedioCents: money(0),
    activo: true,
    actualizadoEn: new Date('2026-01-01T00:00:00Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.batch.commit.mockResolvedValue(undefined);
});

describe('crearCategoria', () => {
  it('lista vacía: orden 0', async () => {
    const { categoriaId } = await crearCategoria(db, 'Quesos', []);

    const [ref, data] = mocks.setDoc.mock.calls[0] as [RefFalsa, Categoria];
    expect(ref.path).toBe(`categorias/${categoriaId}`);
    expect(data).toEqual({ id: categoriaId, nombre: 'Quesos', orden: 0 });
  });

  it('con categorías existentes: orden = max(orden) + 1', async () => {
    await crearCategoria(db, 'Embutidos', [
      categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 }),
      categoria({ id: 'miel', nombre: 'Miel', orden: 3 }),
      categoria({ id: 'especias', nombre: 'Especias', orden: 1 }),
    ]);

    const [, data] = mocks.setDoc.mock.calls[0] as [RefFalsa, Categoria];
    expect(data.orden).toBe(4);
    expect(data.nombre).toBe('Embutidos');
  });

  it('recorta espacios del nombre antes de guardar', async () => {
    await crearCategoria(db, '  Frutos secos  ', []);
    const [, data] = mocks.setDoc.mock.calls[0] as [RefFalsa, Categoria];
    expect(data.nombre).toBe('Frutos secos');
  });

  it('rechaza nombre vacío (solo espacios)', async () => {
    await expect(crearCategoria(db, '   ', [])).rejects.toThrow(CategoriaInvalidaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('rechaza duplicado exacto', async () => {
    const existentes = [categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 })];
    await expect(crearCategoria(db, 'Quesos', existentes)).rejects.toThrow(
      CategoriaDuplicadaError,
    );
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('rechaza duplicado que solo difiere en mayúsculas (y con espacios de borde)', async () => {
    const existentes = [categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 })];
    await expect(crearCategoria(db, '  quESOS ', existentes)).rejects.toThrow(
      CategoriaDuplicadaError,
    );
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('el mensaje del duplicado nombra la categoría', async () => {
    const existentes = [categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 })];
    await expect(crearCategoria(db, 'quesos', existentes)).rejects.toThrow(
      /Ya existe una categoría llamada "quesos"/,
    );
  });

  // El invariante que sostiene la unicidad: el id del documento ES la clave.
  describe('el id del documento es la clave del nombre', () => {
    it('usa la clave como id, no un id autogenerado', async () => {
      const { categoriaId } = await crearCategoria(db, 'Quesos', []);

      expect(categoriaId).toBe('quesos');
      const [ref] = mocks.setDoc.mock.calls[0] as [RefFalsa, Categoria];
      expect(ref.path).toBe('categorias/quesos');
      expect(ref.id).toBe('quesos');
    });

    it('normaliza mayúsculas y espacios en el id, y conserva el nombre tal cual', async () => {
      const { categoriaId } = await crearCategoria(db, '  Frutos Secos  ', []);

      expect(categoriaId).toBe('frutos secos');
      const [, data] = mocks.setDoc.mock.calls[0] as [RefFalsa, Categoria];
      expect(data.nombre).toBe('Frutos Secos');
    });

    it('conserva eñe y acentos en el id (no se pliegan a ASCII)', async () => {
      const noquis = await crearCategoria(db, 'Ñoquis', []);
      expect(noquis.categoriaId).toBe('ñoquis');

      const cafe = await crearCategoria(db, 'CAFÉ', []);
      expect(cafe.categoriaId).toBe('café');
    });

    it('dos altas del mismo nombre apuntan al MISMO path (la carrera converge)', async () => {
      // Dos dispositivos offline: ninguno ve la categoría del otro, así que los
      // dos pasan el chequeo de duplicados con su lista. Lo que los salva es el
      // path, no el chequeo.
      const uno = await crearCategoria(db, 'Quesos', []);
      const otro = await crearCategoria(db, '  quesos ', []);

      expect(uno.categoriaId).toBe(otro.categoriaId);
      const rutas = (mocks.setDoc.mock.calls as [RefFalsa, Categoria][]).map(([r]) => r.path);
      expect(rutas).toEqual(['categorias/quesos', 'categorias/quesos']);
    });
  });

  describe('nombres cuya clave no sirve como id de Firestore', () => {
    for (const nombre of ['.', '..', 'a/b', '__x__', 'quesos/frescos', '__proto__']) {
      it(`rechaza ${JSON.stringify(nombre)} con error de dominio en español`, async () => {
        await expect(crearCategoria(db, nombre, [])).rejects.toThrow(CategoriaInvalidaError);
        expect(mocks.setDoc).not.toHaveBeenCalled();
      });
    }

    it('el mensaje explica el problema en español', async () => {
      await expect(crearCategoria(db, 'a/b', [])).rejects.toThrow(
        /no es un nombre de categoría válido/,
      );
    });

    it('acepta nombres con puntos o guiones bajos que sí son ids válidos', async () => {
      await expect(crearCategoria(db, 'Quesos 1.5 kg', [])).resolves.toEqual({
        categoriaId: 'quesos 1.5 kg',
      });
    });
  });
});

describe('renombrarCategoria', () => {
  // Los ids de las categorías son canónicos (id === clave del nombre), que es el
  // estado que garantizan `crearCategoria` y las reglas.

  it('la clave cambia: mueve el documento de path y re-etiqueta los productos en UN batch', async () => {
    const existentes = [
      categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 }),
      categoria({ id: 'miel', nombre: 'Miel', orden: 1 }),
    ];
    const productos = [
      producto('p1', 'Quesos'),
      producto('p2', 'Quesos'),
      producto('p3', 'Miel'),
    ];

    await renombrarCategoria(db, 'quesos', 'Quesos artesanales', existentes, productos);

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

  it('el fan-out deja intactos los productos de otras categorías', async () => {
    const existentes = [
      categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 }),
      categoria({ id: 'miel', nombre: 'Miel', orden: 1 }),
    ];
    const productos = [
      producto('p1', 'Miel'),
      producto('p2', 'Quesos'),
      producto('p3', 'Especias'),
      // Igualdad EXACTA: no se re-etiqueta un nombre que solo difiere en
      // mayúsculas, igual que hacía la query `where('categoria','==',...)`.
      producto('p4', 'quesos'),
    ];

    await renombrarCategoria(db, 'quesos', 'Quesos artesanales', existentes, productos);

    const updates = mocks.batch.update.mock.calls as [RefFalsa, Record<string, unknown>][];
    expect(updates.map(([ref]) => ref.path)).toEqual(['productos/p2']);
  });

  it('sin productos de esa categoría: solo mueve el documento', async () => {
    const existentes = [categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 })];

    await renombrarCategoria(db, 'quesos', 'Fiambres', existentes, [producto('p1', 'Miel')]);

    expect(mocks.batch.update).not.toHaveBeenCalled();
    expect(mocks.batch.set).toHaveBeenCalledTimes(1);
    expect(mocks.batch.delete).toHaveBeenCalledTimes(1);
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('la clave NO cambia (solo mayúsculas): conserva el id y actualiza in-place, sin delete', async () => {
    const existentes = [categoria({ id: 'quesos', nombre: 'quesos', orden: 0 })];
    const productos = [producto('p1', 'quesos')];

    await renombrarCategoria(db, 'quesos', 'Quesos', existentes, productos);

    // Ni alta ni borrado: el documento se queda donde está.
    expect(mocks.batch.set).not.toHaveBeenCalled();
    expect(mocks.batch.delete).not.toHaveBeenCalled();

    const updates = mocks.batch.update.mock.calls as [RefFalsa, Record<string, unknown>][];
    const catUpdate = updates.find(([ref]) => ref.path === 'categorias/quesos');
    expect(catUpdate?.[1]).toEqual({ nombre: 'Quesos', clave: 'quesos' });
    // El fan-out corre igual: el nombre denormalizado cambió de mayúsculas.
    const prodUpdate = updates.find(([ref]) => ref.path === 'productos/p1');
    expect(prodUpdate?.[1]).toEqual({ categoria: 'Quesos' });
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('la clave no cambia con espacios de borde tampoco', async () => {
    const existentes = [categoria({ id: 'miel', nombre: 'Miel', orden: 0 })];

    await renombrarCategoria(db, 'miel', '  Miel  ', existentes, []);

    expect(mocks.batch.set).not.toHaveBeenCalled();
    expect(mocks.batch.delete).not.toHaveBeenCalled();
  });

  it('renombrar un documento heredado (id autogenerado) lo reubica en su path canónico', async () => {
    const existentes = [categoria({ id: 'AbC123xyz', nombre: 'Quesos', orden: 2 })];

    await renombrarCategoria(db, 'AbC123xyz', 'Quesos', existentes, []);

    const sets = mocks.batch.set.mock.calls as [RefFalsa, Categoria][];
    expect(sets[0]?.[0].path).toBe('categorias/quesos');
    expect(sets[0]?.[1].orden).toBe(2);
    const deletes = mocks.batch.delete.mock.calls as [RefFalsa][];
    expect(deletes[0]?.[0].path).toBe('categorias/AbC123xyz');
  });

  it('rechaza nombre vacío', async () => {
    const existentes = [categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 })];
    await expect(renombrarCategoria(db, 'quesos', '  ', existentes, [])).rejects.toThrow(
      CategoriaInvalidaError,
    );
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza un nombre nuevo cuya clave no sirve como id', async () => {
    const existentes = [categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 })];
    await expect(renombrarCategoria(db, 'quesos', 'a/b', existentes, [])).rejects.toThrow(
      CategoriaInvalidaError,
    );
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza si la categoría no está en `existentes`', async () => {
    const existentes = [categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 })];
    await expect(renombrarCategoria(db, 'inexistente', 'X', existentes, [])).rejects.toThrow(
      CategoriaInvalidaError,
    );
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza duplicado contra OTRA categoría (case-insensitive)', async () => {
    const existentes = [
      categoria({ id: 'quesos', nombre: 'Quesos', orden: 0 }),
      categoria({ id: 'miel', nombre: 'Miel', orden: 1 }),
    ];
    await expect(renombrarCategoria(db, 'quesos', 'miel', existentes, [])).rejects.toThrow(
      CategoriaDuplicadaError,
    );
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('renombrarse a sí misma cambiando solo mayúsculas es válido (el duplicado excluye la propia)', async () => {
    const existentes = [categoria({ id: 'quesos', nombre: 'quesos', orden: 0 })];

    await expect(
      renombrarCategoria(db, 'quesos', 'QUESOS', existentes, []),
    ).resolves.toBeUndefined();

    const updates = mocks.batch.update.mock.calls as [RefFalsa, Record<string, unknown>][];
    expect(updates[0]?.[1]).toEqual({ nombre: 'QUESOS', clave: 'quesos' });
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
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
