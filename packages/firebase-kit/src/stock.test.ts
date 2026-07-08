import { beforeEach, describe, expect, it, vi } from 'vitest';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import {
  ajustarStock,
  ingresarPiezas,
  type EntradaAjuste,
  type EntradaIngresoPiezas,
} from './stock';
import { AjusteInvalidoError, IngresoInvalidoError, StockInsuficienteError } from './errores';

// Mismo mock de `firebase/firestore` que en ventas.test.ts (batch capturado,
// refs como `{ path, id }`, increments como `{ __increment: n }`).
const mocks = vi.hoisted(() => ({
  batch: { set: vi.fn(), update: vi.fn(), commit: vi.fn() },
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
  writeBatch: () => mocks.batch,
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  doc: (dbOrColeccion: unknown, ...segmentos: string[]) => {
    if (segmentos.length === 0) {
      const { __collection } = dbOrColeccion as { __collection: string };
      const id = `auto-${(mocks.contador.n += 1)}`;
      return crearRef(`${__collection}/${id}`, id);
    }
    return crearRef(segmentos.join('/'), segmentos[segmentos.length - 1] ?? '');
  },
  increment: (n: number) => ({ __increment: n }),
}));

const db = {} as never;

function incremento(valor: unknown): number {
  return (valor as { __increment: number }).__increment;
}

function producto(over: Partial<Producto> & Pick<Producto, 'modoStock'>): Producto {
  return {
    id: 'prod1',
    nombre: 'Producto',
    categoria: 'cat',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function pieza(over: Partial<Pieza> = {}): Pieza {
  return {
    id: 'pz1',
    productoId: 'prod1',
    pesoInicialGramos: peso(5000),
    pesoRestanteGramos: peso(4000),
    costoKgCents: money(30000),
    fechaIngreso: new Date('2026-01-01'),
    estado: 'disponible',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contador.n = 0;
  mocks.batch.commit.mockResolvedValue(undefined);
});

describe('ajustarStock', () => {
  it('ajuste_positivo granel: increment positivo + movimiento con nota', async () => {
    const entrada: EntradaAjuste = {
      usuarioId: 'admin-1',
      tipo: 'ajuste_positivo',
      producto: producto({ modoStock: 'granel', stockGranelGramos: peso(1000) }),
      deltaGramos: peso(500),
      nota: 'recuento',
    };
    await ajustarStock(db, entrada);

    const [refStock, updateStock] = mocks.batch.update.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('productos/prod1');
    expect(incremento(updateStock.stockGranelGramos)).toBe(500);

    const [refMov, movDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(movDoc).toMatchObject({
      tipo: 'ajuste_positivo',
      productoId: 'prod1',
      deltaGramos: 500,
      origenTipo: 'ajuste',
      origenId: refMov.id,
      usuarioId: 'admin-1',
      nota: 'recuento',
    });
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('ajuste_negativo granel: increment negativo', async () => {
    const entrada: EntradaAjuste = {
      usuarioId: 'admin-1',
      tipo: 'ajuste_negativo',
      producto: producto({ modoStock: 'granel', stockGranelGramos: peso(1000) }),
      deltaGramos: peso(-300),
    };
    await ajustarStock(db, entrada);

    const [, updateStock] = mocks.batch.update.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(incremento(updateStock.stockGranelGramos)).toBe(-300);
  });

  it('unidad_simple: ajusta stockUnidades', async () => {
    const entrada: EntradaAjuste = {
      usuarioId: 'admin-1',
      tipo: 'ajuste_positivo',
      producto: producto({
        modoPrecio: 'por_unidad',
        modoStock: 'unidad_simple',
        stockUnidades: 5,
      }),
      deltaUnidades: 4,
    };
    await ajustarStock(db, entrada);

    const [refStock, updateStock] = mocks.batch.update.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('productos/prod1');
    expect(incremento(updateStock.stockUnidades)).toBe(4);
    const [, movDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(movDoc).toMatchObject({ deltaUnidades: 4 });
  });

  it('merma de pieza que la agota: marca merma_total', async () => {
    const entrada: EntradaAjuste = {
      usuarioId: 'admin-1',
      tipo: 'merma',
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      pieza: pieza({ pesoRestanteGramos: peso(40) }),
      deltaGramos: peso(-40),
      nota: 'se echó a perder',
    };
    await ajustarStock(db, entrada);

    const [refStock, updateStock] = mocks.batch.update.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('piezas/pz1');
    expect(incremento(updateStock.pesoRestanteGramos)).toBe(-40);
    expect(updateStock.estado).toBe('merma_total');

    const [, movDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(movDoc).toMatchObject({ tipo: 'merma', piezaId: 'pz1', deltaGramos: -40 });
  });

  it('merma parcial de pieza: NO marca merma_total', async () => {
    const entrada: EntradaAjuste = {
      usuarioId: 'admin-1',
      tipo: 'merma',
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      pieza: pieza({ pesoRestanteGramos: peso(1000) }),
      deltaGramos: peso(-200),
    };
    await ajustarStock(db, entrada);

    const [, updateStock] = mocks.batch.update.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(incremento(updateStock.pesoRestanteGramos)).toBe(-200);
    expect(updateStock.estado).toBeUndefined();
  });

  it('rechaza signo incoherente: ajuste_positivo con delta negativo', async () => {
    const entrada: EntradaAjuste = {
      usuarioId: 'admin-1',
      tipo: 'ajuste_positivo',
      producto: producto({ modoStock: 'granel', stockGranelGramos: peso(1000) }),
      deltaGramos: peso(-100),
    };
    await expect(ajustarStock(db, entrada)).rejects.toThrow(AjusteInvalidoError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza delta cero', async () => {
    const entrada: EntradaAjuste = {
      usuarioId: 'admin-1',
      tipo: 'ajuste_negativo',
      producto: producto({ modoStock: 'granel', stockGranelGramos: peso(1000) }),
      deltaGramos: peso(0),
    };
    await expect(ajustarStock(db, entrada)).rejects.toThrow(AjusteInvalidoError);
  });

  it('rechaza ajuste que dejaría el stock negativo', async () => {
    const entrada: EntradaAjuste = {
      usuarioId: 'admin-1',
      tipo: 'ajuste_negativo',
      producto: producto({ modoStock: 'granel', stockGranelGramos: peso(100) }),
      deltaGramos: peso(-500),
    };
    await expect(ajustarStock(db, entrada)).rejects.toThrow(StockInsuficienteError);
  });

  it('rechaza producto por pieza sin pieza', async () => {
    const entrada: EntradaAjuste = {
      usuarioId: 'admin-1',
      tipo: 'ajuste_negativo',
      producto: producto({ modoStock: 'pieza_entera' }),
      deltaGramos: peso(-100),
    };
    await expect(ajustarStock(db, entrada)).rejects.toThrow(AjusteInvalidoError);
  });

  it('rechaza delta del tipo equivocado (granel con deltaUnidades)', async () => {
    const entrada: EntradaAjuste = {
      usuarioId: 'admin-1',
      tipo: 'ajuste_positivo',
      producto: producto({ modoStock: 'granel', stockGranelGramos: peso(1000) }),
      deltaUnidades: 5,
    };
    await expect(ajustarStock(db, entrada)).rejects.toThrow(AjusteInvalidoError);
  });
});

// Separa los `batch.set` capturados en piezas vs movimientos según el path del
// ref falso (`piezas/auto-N` | `movimientos/auto-N`).
function setsDe(coleccion: 'piezas' | 'movimientos'): [RefFalsa, Record<string, unknown>][] {
  return (mocks.batch.set.mock.calls as [RefFalsa, Record<string, unknown>][]).filter(
    ([ref]) => ref.path.startsWith(`${coleccion}/`),
  );
}

describe('ingresarPiezas', () => {
  it('1 pieza: crea la pieza y su movimiento ajuste_positivo, devuelve su id', async () => {
    const entrada: EntradaIngresoPiezas = {
      usuarioId: 'admin-1',
      producto: producto({ modoStock: 'fraccionado_por_pieza', costoPromedioCents: money(30000) }),
      piezas: [{ pesoInicialGramos: peso(5000), fechaVencimiento: new Date('2027-01-01') }],
    };

    const { piezaIds } = await ingresarPiezas(db, entrada);

    const piezasSet = setsDe('piezas');
    const movsSet = setsDe('movimientos');
    expect(piezasSet).toHaveLength(1);
    expect(movsSet).toHaveLength(1);

    const [piezaRef, piezaDoc] = piezasSet[0]!;
    expect(piezaDoc).toMatchObject({
      id: piezaRef.id,
      productoId: 'prod1',
      pesoInicialGramos: 5000,
      pesoRestanteGramos: 5000,
      costoKgCents: 30000,
      estado: 'disponible',
      fechaVencimiento: new Date('2027-01-01'),
    });
    expect(piezaDoc.fechaIngreso).toBeInstanceOf(Date);

    const [movRef, movDoc] = movsSet[0]!;
    expect(movDoc).toMatchObject({
      tipo: 'ajuste_positivo',
      productoId: 'prod1',
      piezaId: piezaRef.id,
      deltaGramos: 5000,
      origenTipo: 'ajuste',
      origenId: movRef.id,
      usuarioId: 'admin-1',
    });

    expect(piezaIds).toEqual([piezaRef.id]);
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('N piezas: crea una pieza y un movimiento por cada una, en un solo commit', async () => {
    const entrada: EntradaIngresoPiezas = {
      usuarioId: 'admin-1',
      producto: producto({ modoStock: 'pieza_entera' }),
      piezas: [
        { pesoInicialGramos: peso(3000) },
        { pesoInicialGramos: peso(3500) },
        { pesoInicialGramos: peso(4000) },
      ],
    };

    const { piezaIds } = await ingresarPiezas(db, entrada);

    const piezasSet = setsDe('piezas');
    const movsSet = setsDe('movimientos');
    expect(piezasSet).toHaveLength(3);
    expect(movsSet).toHaveLength(3);
    expect(piezasSet.map(([, d]) => d.pesoInicialGramos)).toEqual([3000, 3500, 4000]);
    expect(movsSet.map(([, d]) => d.deltaGramos)).toEqual([3000, 3500, 4000]);
    // Cada movimiento referencia a su propia pieza (mismo orden de creación).
    expect(movsSet.map(([, d]) => d.piezaId)).toEqual(piezasSet.map(([ref]) => ref.id));
    expect(piezaIds).toEqual(piezasSet.map(([ref]) => ref.id));
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('hereda costoKgCents del costoPromedioCents del producto (money(0) incluido)', async () => {
    const entrada: EntradaIngresoPiezas = {
      usuarioId: 'admin-1',
      producto: producto({ modoStock: 'fraccionado_por_pieza', costoPromedioCents: money(0) }),
      piezas: [{ pesoInicialGramos: peso(5000) }],
    };

    await ingresarPiezas(db, entrada);

    const [, piezaDoc] = setsDe('piezas')[0]!;
    expect(piezaDoc.costoKgCents).toBe(0);
  });

  it('sin fechaVencimiento: no la incluye en la pieza', async () => {
    const entrada: EntradaIngresoPiezas = {
      usuarioId: 'admin-1',
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      piezas: [{ pesoInicialGramos: peso(5000) }],
    };

    await ingresarPiezas(db, entrada);

    const [, piezaDoc] = setsDe('piezas')[0]!;
    expect(piezaDoc.fechaVencimiento).toBeUndefined();
  });

  it('rechaza producto que no va por piezas (granel) y no commitea', async () => {
    const entrada: EntradaIngresoPiezas = {
      usuarioId: 'admin-1',
      producto: producto({ modoStock: 'granel', stockGranelGramos: peso(1000) }),
      piezas: [{ pesoInicialGramos: peso(5000) }],
    };
    await expect(ingresarPiezas(db, entrada)).rejects.toThrow(IngresoInvalidoError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
    expect(mocks.batch.set).not.toHaveBeenCalled();
  });

  it('rechaza lista de piezas vacía', async () => {
    const entrada: EntradaIngresoPiezas = {
      usuarioId: 'admin-1',
      producto: producto({ modoStock: 'pieza_entera' }),
      piezas: [],
    };
    await expect(ingresarPiezas(db, entrada)).rejects.toThrow(IngresoInvalidoError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza pesoInicialGramos no positivo (cero)', async () => {
    const entrada: EntradaIngresoPiezas = {
      usuarioId: 'admin-1',
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      piezas: [{ pesoInicialGramos: peso(0) }],
    };
    await expect(ingresarPiezas(db, entrada)).rejects.toThrow(IngresoInvalidoError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza pesoInicialGramos negativo, aunque otra pieza sea válida (nada se commitea)', async () => {
    const entrada: EntradaIngresoPiezas = {
      usuarioId: 'admin-1',
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      piezas: [{ pesoInicialGramos: peso(5000) }, { pesoInicialGramos: peso(-1) }],
    };
    await expect(ingresarPiezas(db, entrada)).rejects.toThrow(IngresoInvalidoError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
    expect(mocks.batch.set).not.toHaveBeenCalled();
  });

  it('rechaza fechaVencimiento anterior a hoy', async () => {
    const entrada: EntradaIngresoPiezas = {
      usuarioId: 'admin-1',
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      piezas: [{ pesoInicialGramos: peso(5000), fechaVencimiento: new Date('2020-01-01') }],
    };
    await expect(ingresarPiezas(db, entrada)).rejects.toThrow(IngresoInvalidoError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });
});
