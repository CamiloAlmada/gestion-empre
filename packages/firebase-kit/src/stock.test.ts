import { beforeEach, describe, expect, it, vi } from 'vitest';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import { ajustarStock, type EntradaAjuste } from './stock';
import { AjusteInvalidoError, StockInsuficienteError } from './errores';

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
