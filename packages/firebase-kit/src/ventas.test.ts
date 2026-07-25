import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calcularSubtotal,
  money,
  peso,
  type ItemVenta,
  type Pieza,
  type Producto,
  type Venta,
} from '@gestion/core';
import {
  anularVenta,
  registrarVenta,
  type EntradaVenta,
  type ItemEntradaVenta,
} from './ventas';
import {
  AnulacionInvalidaError,
  ItemInvalidoError,
  StockInsuficienteError,
  TotalIncoherenteError,
  VentaVaciaError,
} from './errores';

// Mock de `firebase/firestore`: captura las operaciones del batch y expone las
// refs como `{ path, id }` para poder afirmar a qué doc apunta cada write. Los
// increments se representan como `{ __increment: n }` para verificar el signo.
// Los converters no se ejercitan acá (unit): `withConverter` es identidad y
// afirmamos sobre el objeto de dominio que recibe `batch.set`.
const mocks = vi.hoisted(() => ({
  batch: { set: vi.fn(), update: vi.fn(), commit: vi.fn() },
  contador: { n: 0 },
  // Lecturas de Firestore: el POS es offline-first y el camino de venta NO puede
  // leer. Se exponen como spies que explotan para que cualquier lectura futura
  // rompa el test en vez de romper el mostrador sin conexión.
  lecturas: {
    getDoc: vi.fn(() => {
      throw new Error('El camino de venta no puede leer Firestore (offline-first).');
    }),
    getDocs: vi.fn(() => {
      throw new Error('El camino de venta no puede leer Firestore (offline-first).');
    }),
  },
}));

interface RefFalsa {
  id: string;
  path: string;
  withConverter: () => RefFalsa;
}

function crearRef(path: string, id: string): RefFalsa {
  const ref: RefFalsa = {
    id,
    path,
    withConverter: () => ref,
  };
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
    const path = segmentos.join('/');
    return crearRef(path, segmentos[segmentos.length - 1] ?? '');
  },
  increment: (n: number) => ({ __increment: n }),
  getDoc: mocks.lecturas.getDoc,
  getDocs: mocks.lecturas.getDocs,
}));

// `db` es opaco para el código bajo test (solo se pasa a los mocks).
const db = {} as never;

function incremento(valor: unknown): number {
  return (valor as { __increment: number }).__increment;
}

// ── Factories de dominio ────────────────────────────────────────────────────

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

function itemGranel(gramos: number, subtotal: number): ItemEntradaVenta {
  return {
    producto: producto({ modoStock: 'granel', stockGranelGramos: peso(10000) }),
    gramos: peso(gramos),
    precioUnitCents: money(45000),
    subtotalCents: money(subtotal),
  };
}

function entradaDe(items: ItemEntradaVenta[], totalCents: number): EntradaVenta {
  return { usuarioId: 'vend-1', medioPago: 'efectivo', items, totalCents: money(totalCents) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contador.n = 0;
  mocks.batch.commit.mockResolvedValue(undefined);
});

describe('registrarVenta', () => {
  it('crea la venta con estado, numero, fecha, total e items congelados', async () => {
    const { ventaId } = await registrarVenta(db, entradaDe([itemGranel(100, 4500)], 4500));

    const antes = Date.now();
    const [refVenta, ventaDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Venta];
    expect(refVenta.path).toMatch(/^ventas\//);
    expect(ventaId).toBe(refVenta.id);
    expect(ventaDoc.estado).toBe('completada');
    expect(ventaDoc.usuarioId).toBe('vend-1');
    expect(ventaDoc.medioPago).toBe('efectivo');
    expect(ventaDoc.totalCents).toBe(4500);
    expect(ventaDoc.numero).toBeLessThanOrEqual(antes);
    expect(ventaDoc.fecha).toBeInstanceOf(Date);
    expect(ventaDoc.items).toEqual([
      {
        productoId: 'prod1',
        nombreProducto: 'Producto',
        gramos: 100,
        precioUnitCents: 45000,
        subtotalCents: 4500,
        // Costo congelado: promedio del producto (500 /kg) por 100 g.
        costeo: {
          v: 1,
          fuente: 'promedio',
          origen: 'venta',
          costoUnitCents: 500,
          costoItemCents: 50,
        },
      },
    ]);
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('granel: decrementa stockGranelGramos con increment negativo + movimiento venta', async () => {
    await registrarVenta(db, entradaDe([itemGranel(100, 4500)], 4500));

    const [refStock, updateStock] = mocks.batch.update.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('productos/prod1');
    expect(incremento(updateStock.stockGranelGramos)).toBe(-100);
    expect(updateStock.stockUnidades).toBeUndefined();

    const [, movDoc] = mocks.batch.set.mock.calls[1] as [RefFalsa, Record<string, unknown>];
    const [refVenta] = mocks.batch.set.mock.calls[0] as [RefFalsa, Venta];
    expect(movDoc).toMatchObject({
      tipo: 'venta',
      productoId: 'prod1',
      deltaGramos: -100,
      origenTipo: 'venta',
      origenId: refVenta.id,
      usuarioId: 'vend-1',
    });
    expect(movDoc.piezaId).toBeUndefined();
  });

  it('fraccionado_por_pieza: baja pesoRestante de la pieza, sin cambiar estado', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      pieza: pieza(),
      gramos: peso(350),
      precioUnitCents: money(30000),
      subtotalCents: money(10500),
    };
    await registrarVenta(db, entradaDe([item], 10500));

    const [refStock, updateStock] = mocks.batch.update.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('piezas/pz1');
    expect(incremento(updateStock.pesoRestanteGramos)).toBe(-350);
    expect(updateStock.estado).toBeUndefined();

    const [, movDoc] = mocks.batch.set.mock.calls[1] as [RefFalsa, Record<string, unknown>];
    expect(movDoc).toMatchObject({ tipo: 'venta', piezaId: 'pz1', deltaGramos: -350 });
  });

  it('pieza_entera: consume el peso restante completo y marca la pieza agotada', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'pieza_entera' }),
      pieza: pieza({ pesoRestanteGramos: peso(1200) }),
      precioUnitCents: money(30000),
      subtotalCents: money(3600),
    };
    await registrarVenta(db, entradaDe([item], 3600));

    const [refStock, updateStock] = mocks.batch.update.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('piezas/pz1');
    expect(incremento(updateStock.pesoRestanteGramos)).toBe(-1200);
    expect(updateStock.estado).toBe('agotada');

    // El ítem congela como gramos el peso restante de la pieza.
    const [, ventaDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Venta];
    expect(ventaDoc.items[0]?.gramos).toBe(1200);
    expect(ventaDoc.items[0]?.piezaId).toBe('pz1');
  });

  it('unidad_simple: decrementa stockUnidades con increment negativo', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoPrecio: 'por_unidad', modoStock: 'unidad_simple', stockUnidades: 12 }),
      unidades: 3,
      precioUnitCents: money(15000),
      subtotalCents: money(45000),
    };
    await registrarVenta(db, entradaDe([item], 45000));

    const [refStock, updateStock] = mocks.batch.update.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('productos/prod1');
    expect(incremento(updateStock.stockUnidades)).toBe(-3);

    const [, movDoc] = mocks.batch.set.mock.calls[1] as [RefFalsa, Record<string, unknown>];
    expect(movDoc).toMatchObject({ tipo: 'venta', deltaUnidades: -3 });
    expect(movDoc.deltaGramos).toBeUndefined();
  });

  it('arma un movimiento por ítem (venta con múltiples ítems)', async () => {
    await registrarVenta(
      db,
      entradaDe([itemGranel(100, 4500), itemGranel(200, 9000)], 13500),
    );
    // 1 venta + 2 movimientos = 3 sets; 2 updates de stock.
    expect(mocks.batch.set).toHaveBeenCalledTimes(3);
    expect(mocks.batch.update).toHaveBeenCalledTimes(2);
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('rechaza venta sin ítems y no commitea', async () => {
    await expect(registrarVenta(db, entradaDe([], 0))).rejects.toThrow(VentaVaciaError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza total incoherente con la suma de subtotales', async () => {
    await expect(registrarVenta(db, entradaDe([itemGranel(100, 4500)], 4499))).rejects.toThrow(
      TotalIncoherenteError,
    );
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza peso insuficiente en pieza fraccionada', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      pieza: pieza({ pesoRestanteGramos: peso(300) }),
      gramos: peso(350),
      precioUnitCents: money(30000),
      subtotalCents: money(10500),
    };
    await expect(registrarVenta(db, entradaDe([item], 10500))).rejects.toThrow(
      StockInsuficienteError,
    );
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza stock granel insuficiente', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'granel', stockGranelGramos: peso(50) }),
      gramos: peso(100),
      precioUnitCents: money(45000),
      subtotalCents: money(4500),
    };
    await expect(registrarVenta(db, entradaDe([item], 4500))).rejects.toThrow(
      StockInsuficienteError,
    );
  });

  it('rechaza pieza no disponible', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      pieza: pieza({ estado: 'agotada' }),
      gramos: peso(100),
      precioUnitCents: money(30000),
      subtotalCents: money(3000),
    };
    await expect(registrarVenta(db, entradaDe([item], 3000))).rejects.toThrow(
      StockInsuficienteError,
    );
  });

  it('rechaza ítem por pieza sin pieza', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      gramos: peso(100),
      precioUnitCents: money(30000),
      subtotalCents: money(3000),
    };
    await expect(registrarVenta(db, entradaDe([item], 3000))).rejects.toThrow(ItemInvalidoError);
  });
});

describe('registrarVenta: costo congelado por ítem', () => {
  // Devuelve los ítems tal como quedan en el doc de venta que recibe el batch.
  function itemsDeLaVenta(): ItemVenta[] {
    const [, ventaDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Venta];
    return ventaDoc.items;
  }

  it('fraccionado_por_pieza: congela el costo de la PIEZA y su compra de origen', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      pieza: pieza({ costoKgCents: money(30000), compraId: 'compra-7' }),
      gramos: peso(350),
      precioUnitCents: money(30000),
      subtotalCents: money(10500),
    };
    await registrarVenta(db, entradaDe([item], 10500));

    expect(itemsDeLaVenta()[0]?.costeo).toEqual({
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: 30000,
      // 30000 · 350 / 1000
      costoItemCents: 10500,
      compraId: 'compra-7',
    });
  });

  it('pieza_entera: congela el costo de la pieza sobre su peso restante completo', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'pieza_entera' }),
      pieza: pieza({ pesoRestanteGramos: peso(1200), costoKgCents: money(25000) }),
      precioUnitCents: money(30000),
      subtotalCents: money(36000),
    };
    await registrarVenta(db, entradaDe([item], 36000));

    expect(itemsDeLaVenta()[0]?.costeo).toEqual({
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: 25000,
      // 25000 · 1200 / 1000
      costoItemCents: 30000,
    });
  });

  it('pieza sin compra de origen (ingreso manual): congela el costo sin compraId', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      pieza: pieza({ costoKgCents: money(30000) }),
      gramos: peso(350),
      precioUnitCents: money(30000),
      subtotalCents: money(10500),
    };
    await registrarVenta(db, entradaDe([item], 10500));

    expect(itemsDeLaVenta()[0]?.costeo).not.toHaveProperty('compraId');
  });

  it('pieza con costoKgCents 0: sin_costo, sin montos y sin caer al promedio del producto', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'fraccionado_por_pieza', costoPromedioCents: money(45000) }),
      pieza: pieza({ costoKgCents: money(0) }),
      gramos: peso(350),
      precioUnitCents: money(30000),
      subtotalCents: money(10500),
    };
    await registrarVenta(db, entradaDe([item], 10500));

    expect(itemsDeLaVenta()[0]?.costeo).toEqual({ v: 1, fuente: 'sin_costo', origen: 'venta' });
  });

  it('granel: congela el costo promedio por kg del producto', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({
        modoStock: 'granel',
        stockGranelGramos: peso(10000),
        costoPromedioCents: money(45000),
      }),
      gramos: peso(250),
      precioUnitCents: money(90000),
      subtotalCents: money(22500),
    };
    await registrarVenta(db, entradaDe([item], 22500));

    expect(itemsDeLaVenta()[0]?.costeo).toEqual({
      v: 1,
      fuente: 'promedio',
      origen: 'venta',
      costoUnitCents: 45000,
      // 45000 · 250 / 1000
      costoItemCents: 11250,
    });
  });

  it('unidad_simple: congela el costo promedio por unidad × cantidad', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({
        modoPrecio: 'por_unidad',
        modoStock: 'unidad_simple',
        stockUnidades: 12,
        costoPromedioCents: money(12500),
      }),
      unidades: 3,
      precioUnitCents: money(15000),
      subtotalCents: money(45000),
    };
    await registrarVenta(db, entradaDe([item], 45000));

    expect(itemsDeLaVenta()[0]?.costeo).toEqual({
      v: 1,
      fuente: 'promedio',
      origen: 'venta',
      costoUnitCents: 12500,
      costoItemCents: 37500,
    });
  });

  it('producto nunca comprado (costoPromedioCents 0): sin_costo, NUNCA un costo 0', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({
        modoStock: 'granel',
        stockGranelGramos: peso(10000),
        costoPromedioCents: money(0),
      }),
      gramos: peso(250),
      precioUnitCents: money(90000),
      subtotalCents: money(22500),
    };
    await registrarVenta(db, entradaDe([item], 22500));

    const costeo = itemsDeLaVenta()[0]?.costeo;
    expect(costeo).toEqual({ v: 1, fuente: 'sin_costo', origen: 'venta' });
    expect(costeo).not.toHaveProperty('costoUnitCents');
    expect(costeo).not.toHaveProperty('costoItemCents');
  });

  it('costoItemCents usa la MISMA regla de redondeo que subtotalCents', async () => {
    // 333 g con costo 899,00 /kg y precio 1.234,00 /kg: las dos magnitudes se
    // redondean half-up sobre la misma división por 1000 (no truncado).
    const gramos = peso(333);
    const subtotal = calcularSubtotal({
      modoPrecio: 'por_kg',
      precioKgCents: money(123400),
      gramos,
    });
    const item: ItemEntradaVenta = {
      producto: producto({
        modoStock: 'granel',
        stockGranelGramos: peso(10000),
        costoPromedioCents: money(89900),
      }),
      gramos,
      precioUnitCents: money(123400),
      subtotalCents: subtotal,
    };
    await registrarVenta(db, entradaDe([item], subtotal));

    const itemVenta = itemsDeLaVenta()[0];
    expect(itemVenta?.subtotalCents).toBe(41092); // 123400 · 333/1000 = 41092,2 → 41092
    expect(itemVenta?.costeo?.costoItemCents).toBe(29937); // 89900 · 333/1000 = 29936,7 → 29937
    expect(itemVenta?.costeo?.costoItemCents).toBe(
      calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: money(89900), gramos }),
    );
  });

  it('NO agrega lecturas de Firestore al camino de venta (offline-first)', async () => {
    await registrarVenta(db, entradaDe([itemGranel(100, 4500)], 4500));

    expect(mocks.lecturas.getDoc).not.toHaveBeenCalled();
    expect(mocks.lecturas.getDocs).not.toHaveBeenCalled();
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  // Tarea A1b: el movimiento `venta` (no solo el ítem embebido) también congela
  // su costo — reutilizando el MISMO valor, sin recalcular.
  it('el movimiento venta reutiliza el mismo costeo congelado en el ítem', async () => {
    const item: ItemEntradaVenta = {
      producto: producto({ modoStock: 'fraccionado_por_pieza' }),
      pieza: pieza({ costoKgCents: money(30000), compraId: 'compra-7' }),
      gramos: peso(350),
      precioUnitCents: money(30000),
      subtotalCents: money(10500),
    };
    await registrarVenta(db, entradaDe([item], 10500));

    const [, movDoc] = mocks.batch.set.mock.calls[1] as [RefFalsa, Record<string, unknown>];
    expect(movDoc.costeo).toEqual(itemsDeLaVenta()[0]?.costeo);
    expect(movDoc.costeo).toEqual({
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: 30000,
      costoItemCents: 10500,
      compraId: 'compra-7',
    });
  });
});

// Localiza el update del batch cuyo ref apunta a la colección `clientes` (el
// resto de los updates son de stock sobre productos/piezas).
function updateDeCliente(): [RefFalsa, Record<string, unknown>] | undefined {
  const call = mocks.batch.update.mock.calls.find((c) => {
    const [ref] = c as [RefFalsa, unknown];
    return ref.path.startsWith('clientes/');
  });
  return call as [RefFalsa, Record<string, unknown>] | undefined;
}

describe('registrarVenta con cliente', () => {
  it('venta anónima (sin cliente): no toca clientes y no denormaliza cliente en la venta', async () => {
    await registrarVenta(db, entradaDe([itemGranel(100, 4500)], 4500));

    expect(updateDeCliente()).toBeUndefined();
    const [, ventaDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Venta];
    expect(ventaDoc.clienteId).toBeUndefined();
    expect(ventaDoc.clienteNombre).toBeUndefined();
  });

  it('con cliente: denormaliza clienteId/clienteNombre y suma stats en el mismo batch', async () => {
    const entrada: EntradaVenta = {
      ...entradaDe([itemGranel(100, 4500)], 4500),
      cliente: { id: 'cli-1', nombre: 'Marta', esPrimeraCompra: false },
    };
    await registrarVenta(db, entrada);

    const [, ventaDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Venta];
    expect(ventaDoc.clienteId).toBe('cli-1');
    expect(ventaDoc.clienteNombre).toBe('Marta');

    const cliente = updateDeCliente();
    expect(cliente).toBeDefined();
    const [ref, update] = cliente as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('clientes/cli-1');
    expect(incremento(update['stats.cantidadVentas'])).toBe(1);
    expect(incremento(update['stats.totalHistoricoCents'])).toBe(4500);
    expect(update['stats.ultimaCompra']).toBeInstanceOf(Date);
    // No es primera compra: no se inicializa primeraCompra.
    expect(update).not.toHaveProperty('stats.primeraCompra');
  });

  it('primera compra: además inicializa stats.primeraCompra con la fecha de la venta', async () => {
    const entrada: EntradaVenta = {
      ...entradaDe([itemGranel(100, 4500)], 4500),
      cliente: { id: 'cli-2', nombre: 'Nuevo', esPrimeraCompra: true },
    };
    await registrarVenta(db, entrada);

    const [, update] = updateDeCliente() as [RefFalsa, Record<string, unknown>];
    expect(update['stats.primeraCompra']).toBeInstanceOf(Date);
    expect(update['stats.ultimaCompra']).toBeInstanceOf(Date);
  });
});

describe('anularVenta', () => {
  function ventaCompletada(items: ItemVenta[]): Venta {
    return {
      id: 'venta-9',
      numero: 111,
      fecha: new Date('2026-02-02'),
      usuarioId: 'vend-1',
      items,
      totalCents: money(4500),
      medioPago: 'efectivo',
      estado: 'completada',
    };
  }

  it('rechaza anular una venta no completada', async () => {
    const venta = { ...ventaCompletada([]), estado: 'anulada' as const };
    await expect(anularVenta(db, venta, 'admin-1')).rejects.toThrow(AnulacionInvalidaError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('actualiza la venta cambiando SOLO estado a anulada', async () => {
    const venta = ventaCompletada([
      {
        productoId: 'prod1',
        nombreProducto: 'Nuez',
        gramos: peso(100),
        precioUnitCents: money(45000),
        subtotalCents: money(4500),
      },
    ]);
    await anularVenta(db, venta, 'admin-1');

    const [refVenta, updateVenta] = mocks.batch.update.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refVenta.path).toBe('ventas/venta-9');
    expect(updateVenta).toEqual({ estado: 'anulada' });
  });

  it('venta CON costeo congelado: sigue cambiando SOLO estado y restaura el stock', async () => {
    // Las reglas rechazan cualquier cambio que no sea `estado`: el costo
    // congelado viaja en la venta y la anulación no lo toca ni lo revierte.
    const venta = ventaCompletada([
      {
        productoId: 'prod1',
        nombreProducto: 'Queso',
        piezaId: 'pz1',
        gramos: peso(350),
        precioUnitCents: money(30000),
        subtotalCents: money(10500),
        costeo: {
          v: 1,
          fuente: 'pieza',
          origen: 'venta',
          costoUnitCents: money(30000),
          costoItemCents: money(10500),
          compraId: 'compra-7',
        },
      },
    ]);
    await anularVenta(db, venta, 'admin-1');

    const [refVenta, updateVenta] = mocks.batch.update.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refVenta.path).toBe('ventas/venta-9');
    expect(updateVenta).toEqual({ estado: 'anulada' });

    const [refStock, updateStock] = mocks.batch.update.mock.calls[1] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('piezas/pz1');
    expect(incremento(updateStock.pesoRestanteGramos)).toBe(350);
    expect(updateStock.estado).toBe('disponible');
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);

    // Tarea A1b: el movimiento `devolucion` reutiliza el costeo del ítem
    // devuelto, sin recalcular (mismo dato con el que se vendió).
    const [, movDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(movDoc.costeo).toEqual({
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: 30000,
      costoItemCents: 10500,
      compraId: 'compra-7',
    });
  });

  it('granel: restaura stock con increment positivo + movimiento devolucion', async () => {
    const venta = ventaCompletada([
      {
        productoId: 'prod1',
        nombreProducto: 'Nuez',
        gramos: peso(100),
        precioUnitCents: money(45000),
        subtotalCents: money(4500),
      },
    ]);
    await anularVenta(db, venta, 'admin-1');

    const [refStock, updateStock] = mocks.batch.update.mock.calls[1] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('productos/prod1');
    expect(incremento(updateStock.stockGranelGramos)).toBe(100);

    const [, movDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(movDoc).toMatchObject({
      tipo: 'devolucion',
      deltaGramos: 100,
      origenTipo: 'venta',
      origenId: 'venta-9',
      usuarioId: 'admin-1',
    });
  });

  it('pieza: restaura peso con increment positivo y deja la pieza disponible', async () => {
    const venta = ventaCompletada([
      {
        productoId: 'prod1',
        nombreProducto: 'Queso',
        piezaId: 'pz1',
        gramos: peso(350),
        precioUnitCents: money(30000),
        subtotalCents: money(10500),
      },
    ]);
    await anularVenta(db, venta, 'admin-1');

    const [refStock, updateStock] = mocks.batch.update.mock.calls[1] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('piezas/pz1');
    expect(incremento(updateStock.pesoRestanteGramos)).toBe(350);
    expect(updateStock.estado).toBe('disponible');
  });

  it('unidad_simple: restaura unidades con increment positivo', async () => {
    const venta = ventaCompletada([
      {
        productoId: 'prod1',
        nombreProducto: 'Miel',
        unidades: 3,
        precioUnitCents: money(15000),
        subtotalCents: money(45000),
      },
    ]);
    await anularVenta(db, venta, 'admin-1');

    const [refStock, updateStock] = mocks.batch.update.mock.calls[1] as [
      RefFalsa,
      Record<string, unknown>,
    ];
    expect(refStock.path).toBe('productos/prod1');
    expect(incremento(updateStock.stockUnidades)).toBe(3);

    const [, movDoc] = mocks.batch.set.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(movDoc).toMatchObject({ tipo: 'devolucion', deltaUnidades: 3 });
  });

  it('venta sin cliente: la anulación no toca ninguna colección de clientes', async () => {
    const venta = ventaCompletada([
      {
        productoId: 'prod1',
        nombreProducto: 'Nuez',
        gramos: peso(100),
        precioUnitCents: money(45000),
        subtotalCents: money(4500),
      },
    ]);
    await anularVenta(db, venta, 'admin-1');
    expect(updateDeCliente()).toBeUndefined();
  });

  it('venta con cliente: revierte los contadores (increment negativos) sin rebobinar fechas', async () => {
    const venta: Venta = {
      ...ventaCompletada([
        {
          productoId: 'prod1',
          nombreProducto: 'Nuez',
          gramos: peso(100),
          precioUnitCents: money(45000),
          subtotalCents: money(4500),
        },
      ]),
      totalCents: money(4500),
      clienteId: 'cli-1',
      clienteNombre: 'Marta',
    };
    await anularVenta(db, venta, 'admin-1');

    const [ref, update] = updateDeCliente() as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('clientes/cli-1');
    expect(incremento(update['stats.cantidadVentas'])).toBe(-1);
    expect(incremento(update['stats.totalHistoricoCents'])).toBe(-4500);
    // Cache aproximado: la anulación NO toca las fechas (la verdad son las ventas).
    expect(update).not.toHaveProperty('stats.primeraCompra');
    expect(update).not.toHaveProperty('stats.ultimaCompra');
  });
});
