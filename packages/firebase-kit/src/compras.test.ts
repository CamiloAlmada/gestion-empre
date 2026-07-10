import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  money,
  peso,
  type Compra,
  type ItemCompra,
  type MovimientoStock,
  type Pieza,
} from '@gestion/core';
import {
  actualizarBorradorCompra,
  confirmarCompra,
  guardarBorradorCompra,
  type DatosBorradorCompra,
  type EntradaConfirmarCompra,
} from './compras';
import {
  CompraIncoherenteError,
  CompraVaciaError,
  EstadoCompraInvalidoError,
  ProrateoIncoherenteError,
  ProveedorInvalidoError,
} from './errores';

// Mismo enfoque de mock que `ventas.test.ts`: se capturan las operaciones del batch
// y de `setDoc`, con refs `{ path, id }` para afirmar a qué doc apunta cada write.
// `withConverter` es identidad ⇒ se afirma sobre el objeto de dominio recibido.
const mocks = vi.hoisted(() => ({
  batch: { set: vi.fn(), update: vi.fn(), commit: vi.fn() },
  setDoc: vi.fn(),
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
  setDoc: (...args: unknown[]) => mocks.setDoc(...args),
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
}));

const db = {} as never;

function incremento(valor: unknown): number {
  return (valor as { __increment: number }).__increment;
}

// Writes del batch a una colección (por prefijo de path).
function setsDe(coleccion: string): Array<[RefFalsa, unknown]> {
  return mocks.batch.set.mock.calls.filter(([ref]) => (ref as RefFalsa).path.startsWith(`${coleccion}/`)) as Array<
    [RefFalsa, unknown]
  >;
}
function updatesDe(coleccion: string): Array<[RefFalsa, Record<string, unknown>]> {
  return mocks.batch.update.mock.calls.filter(([ref]) =>
    (ref as RefFalsa).path.startsWith(`${coleccion}/`),
  ) as Array<[RefFalsa, Record<string, unknown>]>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contador.n = 0;
  mocks.batch.commit.mockResolvedValue(undefined);
  mocks.setDoc.mockResolvedValue(undefined);
});

// ── Factories ───────────────────────────────────────────────────────────────

// Compra confirmable coherente: un ítem por pieza (queso) y uno granel (nuez).
// Σ prorrateo = 20000 = totalGastos; costos por kg exactos.
function compraConfirmable(over: Partial<Compra> = {}): Compra {
  const itemQueso: ItemCompra = {
    productoId: 'prod-queso',
    nombreProducto: 'Queso Colonia',
    gramos: peso(8000),
    piezas: [{ pesoGramos: peso(5000) }, { pesoGramos: peso(3000) }],
    costoFacturaCents: money(240000),
    gastoProrrateadoCents: money(15000),
    costoRealCents: money(255000),
    costoRealKgCents: money(31875), // 255000*1000/8000
  };
  const itemNuez: ItemCompra = {
    productoId: 'prod-nuez',
    nombreProducto: 'Nuez',
    gramos: peso(2000),
    costoFacturaCents: money(60000),
    gastoProrrateadoCents: money(5000),
    costoRealCents: money(65000),
    costoRealKgCents: money(32500), // 65000*1000/2000
  };
  return {
    id: 'compra-1',
    fecha: new Date('2026-03-10T10:00:00.000Z'),
    usuarioId: 'admin-1',
    estado: 'borrador',
    proveedorId: 'prov-1',
    proveedorNombre: 'Lácteos Colonia',
    items: [itemQueso, itemNuez],
    gastos: [
      { concepto: 'combustible', montoCents: money(15000) },
      { concepto: 'peaje', montoCents: money(5000) },
    ],
    totalFacturaCents: money(300000),
    totalGastosCents: money(20000),
    totalRealCents: money(320000),
    ...over,
  };
}

function entradaConfirmar(over: Partial<EntradaConfirmarCompra> = {}): EntradaConfirmarCompra {
  return {
    compra: compraConfirmable(),
    usuarioId: 'admin-1',
    efectosProducto: [
      { productoId: 'prod-queso', nuevoCostoPromedioCents: money(31875) },
      { productoId: 'prod-nuez', nuevoCostoPromedioCents: money(32500) },
    ],
    ...over,
  };
}

// ── guardarBorradorCompra / actualizarBorradorCompra ────────────────────────

describe('guardarBorradorCompra', () => {
  const datos: DatosBorradorCompra = {
    usuarioId: 'admin-1',
    proveedorId: 'prov-1',
    proveedorNombre: 'Lácteos Colonia',
    items: [
      {
        productoId: 'prod-queso',
        nombreProducto: 'Queso Colonia',
        gramos: peso(8000),
        piezas: [{ pesoGramos: peso(5000) }, { pesoGramos: peso(3000) }],
        costoFacturaCents: money(240000),
      },
      {
        productoId: 'prod-nuez',
        nombreProducto: 'Nuez',
        gramos: peso(2000),
        costoFacturaCents: money(60000),
      },
    ],
    gastos: [
      { concepto: 'combustible', montoCents: money(15000) },
      { concepto: 'peaje', montoCents: money(5000) },
    ],
    fecha: new Date('2026-03-10T10:00:00.000Z'),
  };

  it('crea la compra en borrador con totales derivados y sin campos calculados', async () => {
    const { compraId } = await guardarBorradorCompra(db, datos);

    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    const [ref, compra] = mocks.setDoc.mock.calls[0] as [RefFalsa, Compra];
    expect(ref.path).toBe(`compras/${compraId}`);
    expect(compra.estado).toBe('borrador');
    expect(compra.totalFacturaCents).toBe(300000);
    expect(compra.totalGastosCents).toBe(20000);
    expect(compra.totalRealCents).toBe(320000);
    // Un borrador NO persiste prorrateo ni costos reales.
    expect(compra.items[0]!.gastoProrrateadoCents).toBeUndefined();
    expect(compra.items[0]!.costoRealCents).toBeUndefined();
    expect(compra.items[0]!.costoRealKgCents).toBeUndefined();
  });

  it('rechaza un proveedorNombre vacío', async () => {
    await expect(
      guardarBorradorCompra(db, { ...datos, proveedorNombre: '   ' }),
    ).rejects.toBeInstanceOf(ProveedorInvalidoError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});

describe('actualizarBorradorCompra', () => {
  it('reescribe el borrador sobre su propio id, en estado borrador', async () => {
    await actualizarBorradorCompra(db, 'compra-9', {
      usuarioId: 'admin-1',
      proveedorNombre: 'Otro',
      items: [],
      gastos: [],
    });
    const [ref, compra] = mocks.setDoc.mock.calls[0] as [RefFalsa, Compra];
    expect(ref.path).toBe('compras/compra-9');
    expect(compra.estado).toBe('borrador');
    expect(compra.totalRealCents).toBe(0);
  });
});

// ── confirmarCompra: efectos ────────────────────────────────────────────────

describe('confirmarCompra (efectos atómicos)', () => {
  it('marca la compra confirmada conservando los ítems prorrateados', async () => {
    await confirmarCompra(db, entradaConfirmar());

    const [ref, compra] = setsDe('compras')[0]!;
    expect(ref.path).toBe('compras/compra-1');
    expect((compra as Compra).estado).toBe('confirmada');
    expect((compra as Compra).items).toHaveLength(2);
  });

  it('crea una pieza por PiezaCompra, heredando costoRealKgCents y ligada a la compra', async () => {
    await confirmarCompra(db, entradaConfirmar());

    const piezas = setsDe('piezas').map(([, p]) => p as Pieza);
    expect(piezas).toHaveLength(2);
    for (const p of piezas) {
      expect(p.productoId).toBe('prod-queso');
      expect(p.costoKgCents).toBe(31875);
      expect(p.compraId).toBe('compra-1');
      expect(p.estado).toBe('disponible');
      expect(p.pesoInicialGramos).toBe(p.pesoRestanteGramos);
    }
    expect(piezas.map((p) => p.pesoInicialGramos).sort((a, b) => a - b)).toEqual([3000, 5000]);
  });

  it('actualiza costo promedio + actualizadoEn de cada producto e incrementa solo el granel', async () => {
    await confirmarCompra(db, entradaConfirmar());

    const updates = new Map(updatesDe('productos').map(([ref, u]) => [ref.id, u]));
    expect(updates.size).toBe(2);

    const queso = updates.get('prod-queso')!;
    expect(queso.costoPromedioCents).toBe(31875);
    expect(queso.actualizadoEn).toBeInstanceOf(Date);
    // Producto por pieza: el stock vive en las piezas, no se incrementa el agregado.
    expect(queso).not.toHaveProperty('stockGranelGramos');
    expect(queso).not.toHaveProperty('stockUnidades');

    const nuez = updates.get('prod-nuez')!;
    expect(nuez.costoPromedioCents).toBe(32500);
    expect(incremento(nuez.stockGranelGramos)).toBe(2000);
  });

  it('registra movimientos ingreso_compra (uno por pieza, uno por ítem granel) con origen la compra', async () => {
    await confirmarCompra(db, entradaConfirmar());

    const movs = setsDe('movimientos').map(([, m]) => m as MovimientoStock);
    // 2 piezas + 1 granel = 3 movimientos.
    expect(movs).toHaveLength(3);
    for (const m of movs) {
      expect(m.tipo).toBe('ingreso_compra');
      expect(m.origenTipo).toBe('compra');
      expect(m.origenId).toBe('compra-1');
      expect(m.usuarioId).toBe('admin-1');
    }
    const granel = movs.find((m) => m.piezaId === undefined)!;
    expect(granel.productoId).toBe('prod-nuez');
    expect(granel.deltaGramos).toBe(2000);
    const dePieza = movs.filter((m) => m.piezaId !== undefined);
    expect(dePieza).toHaveLength(2);
  });

  it('incrementa stockUnidades para un ítem por unidad (sin costo por kg)', async () => {
    const compra = compraConfirmable({
      items: [
        {
          productoId: 'prod-miel',
          nombreProducto: 'Miel',
          unidades: 12,
          costoFacturaCents: money(60000),
          gastoProrrateadoCents: money(0),
          costoRealCents: money(60000),
        },
      ],
      gastos: [],
      totalFacturaCents: money(60000),
      totalGastosCents: money(0),
      totalRealCents: money(60000),
    });
    await confirmarCompra(db, {
      compra,
      usuarioId: 'admin-1',
      efectosProducto: [{ productoId: 'prod-miel', nuevoCostoPromedioCents: money(60000) }],
    });

    const miel = updatesDe('productos')[0]![1];
    expect(incremento(miel.stockUnidades)).toBe(12);
    const mov = setsDe('movimientos')[0]![1] as MovimientoStock;
    expect(mov.deltaUnidades).toBe(12);
    expect(setsDe('piezas')).toHaveLength(0);
  });

  it('commitea un único batch', async () => {
    await confirmarCompra(db, entradaConfirmar());
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
  });
});

// ── confirmarCompra: validaciones (no escribe nada) ─────────────────────────

describe('confirmarCompra (validaciones antes del batch)', () => {
  function esperarRechazo(entrada: EntradaConfirmarCompra): Promise<unknown> {
    return confirmarCompra(db, entrada);
  }

  it('rechaza confirmar una compra que no está en borrador', async () => {
    await expect(
      esperarRechazo(entradaConfirmar({ compra: compraConfirmable({ estado: 'confirmada' }) })),
    ).rejects.toBeInstanceOf(EstadoCompraInvalidoError);
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it('rechaza una compra sin ítems', async () => {
    const compra = compraConfirmable({
      items: [],
      gastos: [],
      totalFacturaCents: money(0),
      totalGastosCents: money(0),
      totalRealCents: money(0),
    });
    await expect(
      esperarRechazo(entradaConfirmar({ compra, efectosProducto: [] })),
    ).rejects.toBeInstanceOf(CompraVaciaError);
  });

  it('rechaza si el prorrateo no suma el total de gastos', async () => {
    const compra = compraConfirmable();
    compra.items[1] = { ...compra.items[1]!, gastoProrrateadoCents: money(4000), costoRealCents: money(64000), costoRealKgCents: money(32000) };
    // Ahora Σ prorrateo = 19000 ≠ 20000.
    await expect(esperarRechazo(entradaConfirmar({ compra }))).rejects.toBeInstanceOf(
      ProrateoIncoherenteError,
    );
  });

  it('rechaza si un total no cierra con la suma de sus partes', async () => {
    await expect(
      esperarRechazo(entradaConfirmar({ compra: compraConfirmable({ totalRealCents: money(999999) }) })),
    ).rejects.toBeInstanceOf(CompraIncoherenteError);
  });

  it('rechaza si costoRealCents de un ítem no es factura + prorrateo', async () => {
    const compra = compraConfirmable();
    compra.items[0] = { ...compra.items[0]!, costoRealCents: money(999999) };
    await expect(esperarRechazo(entradaConfirmar({ compra }))).rejects.toBeInstanceOf(
      CompraIncoherenteError,
    );
  });

  it('rechaza si la suma de piezas no coincide con los gramos del ítem', async () => {
    const compra = compraConfirmable();
    compra.items[0] = { ...compra.items[0]!, piezas: [{ pesoGramos: peso(5000) }, { pesoGramos: peso(2000) }] };
    await expect(esperarRechazo(entradaConfirmar({ compra }))).rejects.toBeInstanceOf(
      CompraIncoherenteError,
    );
  });

  it('rechaza si un ítem por unidad trae costoRealKgCents', async () => {
    const compra = compraConfirmable({
      items: [
        {
          productoId: 'prod-miel',
          nombreProducto: 'Miel',
          unidades: 12,
          costoFacturaCents: money(60000),
          gastoProrrateadoCents: money(0),
          costoRealCents: money(60000),
          costoRealKgCents: money(1),
        },
      ],
      gastos: [],
      totalFacturaCents: money(60000),
      totalGastosCents: money(0),
      totalRealCents: money(60000),
    });
    await expect(
      esperarRechazo(
        entradaConfirmar({
          compra,
          efectosProducto: [{ productoId: 'prod-miel', nuevoCostoPromedioCents: money(60000) }],
        }),
      ),
    ).rejects.toBeInstanceOf(CompraIncoherenteError);
  });

  it('rechaza si falta el efecto de costo promedio de un producto', async () => {
    await expect(
      esperarRechazo(
        entradaConfirmar({
          efectosProducto: [{ productoId: 'prod-queso', nuevoCostoPromedioCents: money(31875) }],
        }),
      ),
    ).rejects.toBeInstanceOf(EstadoCompraInvalidoError);
  });

  it('rechaza si efectosProducto trae un producto de más', async () => {
    await expect(
      esperarRechazo(
        entradaConfirmar({
          efectosProducto: [
            { productoId: 'prod-queso', nuevoCostoPromedioCents: money(31875) },
            { productoId: 'prod-nuez', nuevoCostoPromedioCents: money(32500) },
            { productoId: 'prod-fantasma', nuevoCostoPromedioCents: money(1) },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(EstadoCompraInvalidoError);
  });
});
