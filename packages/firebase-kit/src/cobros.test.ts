import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cobroInicial, money, type CobroVenta, type PagoVenta, type Venta } from '@gestion/core';
import {
  deshacerUltimoPago,
  LARGO_MAX_REFERENCIA_PAGO,
  MAX_PAGOS_POR_VENTA,
  registrarPago,
  registrarPagos,
  type DatosPagoComunes,
  type DatosRegistroPago,
} from './cobros';
import { CobroInvalidoError } from './errores';

// Mock de `firebase/firestore`: captura `updateDoc` y las operaciones del batch,
// y expone las refs como `{ path, id }`. Las lecturas explotan: el camino de
// cobro es offline-first y NO puede leer (doc 06 §8).
const mocks = vi.hoisted(() => ({
  updateDoc: vi.fn(),
  batch: { update: vi.fn(), set: vi.fn(), commit: vi.fn() },
  writeBatch: vi.fn(),
  contador: { n: 0 },
  lectura: vi.fn(() => {
    throw new Error('El camino de cobro no puede leer Firestore (offline-first).');
  }),
}));

vi.mock('firebase/firestore', () => ({
  updateDoc: mocks.updateDoc,
  writeBatch: mocks.writeBatch,
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  doc: (dbOrColeccion: unknown, ...segmentos: string[]) => {
    if (segmentos.length === 0) {
      const { __collection } = dbOrColeccion as { __collection: string };
      const id = `auto-${(mocks.contador.n += 1)}`;
      return { path: `${__collection}/${id}`, id };
    }
    return { path: segmentos.join('/'), id: segmentos[segmentos.length - 1] };
  },
  getDoc: mocks.lectura,
  getDocs: mocks.lectura,
}));

const db = {} as never;

interface RefFalsa {
  path: string;
  id: string;
}

function pagoPrevio(id: string, montoCents: number): PagoVenta {
  return {
    id,
    fecha: new Date('2026-09-20T12:00:00.000Z'),
    registradoEn: new Date('2026-09-20T12:00:30.000Z'),
    montoCents: money(montoCents),
    medioPago: 'efectivo',
    usuarioId: 'admin-1',
  };
}

function ventaACobrar(over: Partial<Venta> = {}): Venta {
  return {
    id: 'venta-1',
    numero: 1,
    fecha: new Date('2026-09-15T10:00:00.000Z'),
    usuarioId: 'vend-1',
    items: [],
    totalCents: money(10000),
    medioPago: 'a_cobrar',
    estado: 'completada',
    clienteId: 'cli-1',
    clienteNombre: 'Marta',
    cobro: cobroInicial(),
    ...over,
  };
}

const FECHA_PAGO = new Date('2026-09-30T15:00:00.000Z');

function datos(over: Partial<DatosRegistroPago> = {}): DatosRegistroPago {
  return {
    montoCents: money(10000),
    medioPago: 'transferencia',
    fecha: FECHA_PAGO,
    referencia: 'OP-123',
    usuarioId: 'admin-1',
    ...over,
  };
}

function updateUnico(): [RefFalsa, Record<string, unknown>] {
  expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
  return mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
}

function nadaEscrito() {
  expect(mocks.updateDoc).not.toHaveBeenCalled();
  expect(mocks.writeBatch).not.toHaveBeenCalled();
  expect(mocks.batch.update).not.toHaveBeenCalled();
  expect(mocks.batch.commit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contador.n = 0;
  mocks.updateDoc.mockResolvedValue(undefined);
  mocks.batch.commit.mockResolvedValue(undefined);
  mocks.writeBatch.mockReturnValue(mocks.batch);
});

describe('registrarPago', () => {
  it('el update lleva EXACTAMENTE { cobro }, calculado con aplicarPago', async () => {
    await registrarPago(db, ventaACobrar(), datos());

    const [ref, update] = updateUnico();
    expect(ref.path).toBe('ventas/venta-1');
    expect(Object.keys(update)).toEqual(['cobro']);
    const cobro = update.cobro as CobroVenta;
    expect(cobro.v).toBe(1);
    expect(cobro.estado).toBe('cobrada');
    expect(cobro.cobradoCents).toBe(10000);
    expect(cobro.pagos).toHaveLength(1);
  });

  it('el kit genera id y registradoEn; el resto sale de los datos', async () => {
    const antes = Date.now();
    await registrarPago(db, ventaACobrar(), datos({ cuentaId: 'prex', cuentaEtiqueta: 'PREX ···1234' }));

    const [, update] = updateUnico();
    const [pago] = (update.cobro as CobroVenta).pagos;
    expect(pago).toMatchObject({
      fecha: FECHA_PAGO,
      montoCents: 10000,
      medioPago: 'transferencia',
      usuarioId: 'admin-1',
      referencia: 'OP-123',
      cuentaId: 'prex',
      cuentaEtiqueta: 'PREX ···1234',
    });
    expect(pago?.id).toMatch(/^auto-/);
    expect(pago?.registradoEn).toBeInstanceOf(Date);
    expect(pago?.registradoEn.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('pago parcial: estado pendiente, y los pagos anteriores van primero e idénticos', async () => {
    const previo = pagoPrevio('p-1', 3000);
    const venta = ventaACobrar({
      cobro: { v: 1, estado: 'pendiente', cobradoCents: money(3000), pagos: [previo] },
    });
    await registrarPago(db, venta, datos({ montoCents: money(2000) }));

    const [, update] = updateUnico();
    const cobro = update.cobro as CobroVenta;
    expect(cobro.estado).toBe('pendiente');
    expect(cobro.cobradoCents).toBe(5000);
    expect(cobro.pagos[0]).toEqual(previo);
    expect(cobro.pagos[1]?.montoCents).toBe(2000);
  });

  it('omite los opcionales vacíos (nunca undefined ni null en el mapa)', async () => {
    await registrarPago(db, ventaACobrar(), datos({ referencia: '   ' }));

    const [, update] = updateUnico();
    const [pago] = (update.cobro as { pagos: Record<string, unknown>[] }).pagos;
    expect(pago).not.toHaveProperty('referencia');
    expect(pago).not.toHaveProperty('cuentaId');
    expect(pago).not.toHaveProperty('cuentaEtiqueta');
  });

  it('devuelve la promesa del commit sin esperarla (patrón offline doc 06 §8)', () => {
    let resolver: () => void = () => undefined;
    const commit = new Promise<void>((r) => {
      resolver = r;
    });
    mocks.updateDoc.mockReturnValue(commit);

    const resultado = registrarPago(db, ventaACobrar(), datos());

    // La escritura ya se disparó de forma síncrona, sin esperar el ack.
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(resultado).toBe(commit);
    resolver();
  });

  it('sobrepago: lanza RangeError de forma síncrona y no escribe', () => {
    expect(() => registrarPago(db, ventaACobrar(), datos({ montoCents: money(10001) }))).toThrow(
      RangeError,
    );
    nadaEscrito();
  });

  it('monto 0: lanza RangeError y no escribe', () => {
    expect(() => registrarPago(db, ventaACobrar(), datos({ montoCents: money(0) }))).toThrow(
      RangeError,
    );
    nadaEscrito();
  });

  it('venta sin cobro (cobrada en el acto): CobroInvalidoError y no escribe', () => {
    const venta = ventaACobrar({ medioPago: 'efectivo', cobro: undefined });
    expect(() => registrarPago(db, venta, datos())).toThrow(CobroInvalidoError);
    nadaEscrito();
  });

  it('venta anulada: CobroInvalidoError y no escribe', () => {
    expect(() => registrarPago(db, ventaACobrar({ estado: 'anulada' }), datos())).toThrow(
      CobroInvalidoError,
    );
    nadaEscrito();
  });

  it(`tope de ${MAX_PAGOS_POR_VENTA} pagos: CobroInvalidoError y no escribe`, () => {
    const pagos = Array.from({ length: MAX_PAGOS_POR_VENTA }, (_, i) => pagoPrevio(`p-${i}`, 1));
    const venta = ventaACobrar({
      cobro: { v: 1, estado: 'pendiente', cobradoCents: money(MAX_PAGOS_POR_VENTA), pagos },
    });
    expect(() => registrarPago(db, venta, datos({ montoCents: money(1) }))).toThrow(
      CobroInvalidoError,
    );
    nadaEscrito();
  });

  it('referencia más larga que el tope: CobroInvalidoError y no escribe', () => {
    const referencia = 'x'.repeat(LARGO_MAX_REFERENCIA_PAGO + 1);
    expect(() => registrarPago(db, ventaACobrar(), datos({ referencia }))).toThrow(
      CobroInvalidoError,
    );
    nadaEscrito();
  });

  it('no lee Firestore', async () => {
    await registrarPago(db, ventaACobrar(), datos());
    expect(mocks.lectura).not.toHaveBeenCalled();
  });
});

describe('registrarPagos (varias ventas, un batch)', () => {
  const comunes: DatosPagoComunes = {
    medioPago: 'transferencia',
    fecha: FECHA_PAGO,
    referencia: 'OP-999',
    cuentaId: 'prex',
    cuentaEtiqueta: 'PREX ···1234',
    usuarioId: 'admin-1',
  };

  const tres = [
    ventaACobrar({ id: 'v-1', totalCents: money(1000) }),
    ventaACobrar({
      id: 'v-2',
      totalCents: money(5000),
      cobro: { v: 1, estado: 'pendiente', cobradoCents: money(2000), pagos: [pagoPrevio('p-1', 2000)] },
    }),
    ventaACobrar({ id: 'v-3', totalCents: money(7000) }),
  ];

  it('3 ventas → un batch con 3 updates de { cobro }, cada una por SU saldo y la misma referencia', async () => {
    await registrarPagos(db, tres, comunes);

    expect(mocks.writeBatch).toHaveBeenCalledTimes(1);
    expect(mocks.batch.update).toHaveBeenCalledTimes(3);
    expect(mocks.batch.commit).toHaveBeenCalledTimes(1);
    expect(mocks.updateDoc).not.toHaveBeenCalled();

    const llamadas = mocks.batch.update.mock.calls as [RefFalsa, Record<string, unknown>][];
    expect(llamadas.map(([ref]) => ref.path)).toEqual(['ventas/v-1', 'ventas/v-2', 'ventas/v-3']);
    for (const [, update] of llamadas) expect(Object.keys(update)).toEqual(['cobro']);

    const cobros = llamadas.map(([, u]) => u.cobro as CobroVenta);
    const ultimos = cobros.map((c) => c.pagos[c.pagos.length - 1]);
    expect(ultimos.map((p) => p?.montoCents)).toEqual([1000, 3000, 7000]);
    expect(cobros.every((c) => c.estado === 'cobrada')).toBe(true);
    expect(new Set(ultimos.map((p) => p?.referencia))).toEqual(new Set(['OP-999']));
    expect(new Set(ultimos.map((p) => p?.cuentaEtiqueta))).toEqual(new Set(['PREX ···1234']));
    // Cada pago con su propio id.
    expect(new Set(ultimos.map((p) => p?.id)).size).toBe(3);
  });

  it('si una venta no es cobrable, no se escribe ninguna', () => {
    const conAnulada = [...tres, ventaACobrar({ id: 'v-4', estado: 'anulada' })];
    expect(() => registrarPagos(db, conAnulada, comunes)).toThrow(CobroInvalidoError);
    nadaEscrito();
  });

  it('una venta ya saldada (saldo 0): RangeError y no se escribe ninguna', () => {
    const saldada = ventaACobrar({
      id: 'v-5',
      cobro: { v: 1, estado: 'cobrada', cobradoCents: money(10000), pagos: [pagoPrevio('p', 10000)] },
    });
    expect(() => registrarPagos(db, [tres[0] as Venta, saldada], comunes)).toThrow(RangeError);
    nadaEscrito();
  });

  it('lista vacía o venta repetida: CobroInvalidoError', () => {
    expect(() => registrarPagos(db, [], comunes)).toThrow(CobroInvalidoError);
    expect(() => registrarPagos(db, [tres[0] as Venta, tres[0] as Venta], comunes)).toThrow(
      CobroInvalidoError,
    );
    nadaEscrito();
  });
});

describe('deshacerUltimoPago', () => {
  it('el update lleva EXACTAMENTE { cobro } sin el último pago', async () => {
    const p1 = pagoPrevio('p-1', 3000);
    const p2 = pagoPrevio('p-2', 7000);
    const venta = ventaACobrar({
      cobro: { v: 1, estado: 'cobrada', cobradoCents: money(10000), pagos: [p1, p2] },
    });
    await deshacerUltimoPago(db, venta);

    const [ref, update] = updateUnico();
    expect(ref.path).toBe('ventas/venta-1');
    expect(Object.keys(update)).toEqual(['cobro']);
    expect(update.cobro).toEqual({
      v: 1,
      estado: 'pendiente',
      cobradoCents: 3000,
      pagos: [
        {
          id: 'p-1',
          fecha: p1.fecha,
          registradoEn: p1.registradoEn,
          montoCents: 3000,
          medioPago: 'efectivo',
          usuarioId: 'admin-1',
        },
      ],
    });
  });

  it('sin pagos: RangeError (de core) y no escribe', () => {
    expect(() => deshacerUltimoPago(db, ventaACobrar())).toThrow(RangeError);
    nadaEscrito();
  });

  it('venta sin cobro: CobroInvalidoError y no escribe', () => {
    expect(() => deshacerUltimoPago(db, ventaACobrar({ cobro: undefined }))).toThrow(
      CobroInvalidoError,
    );
    nadaEscrito();
  });
});
