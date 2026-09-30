import { describe, expect, it } from 'vitest';
import {
  agruparDeudaPorCliente,
  aplicarPago,
  cobradoCents,
  cobroInicial,
  deshacerUltimoPago,
  deudaTotalCents,
  estadoCobro,
  pagosDe,
  saldoPendienteCents,
} from './cobro.js';
import { money } from './money.js';
import type { CobroVenta, PagoVenta, Venta } from './tipos.js';

const TOTAL = money(10000);

function pago(montoCents: number, id = 'p1'): PagoVenta {
  return {
    id,
    fecha: new Date('2026-09-30T15:00:00Z'),
    registradoEn: new Date('2026-09-30T15:05:00Z'),
    montoCents: money(montoCents),
    medioPago: 'transferencia',
    usuarioId: 'admin-1',
    referencia: '12345',
  };
}

function venta(parcial: Partial<Pick<Venta, 'estado' | 'cobro' | 'totalCents'>> = {}) {
  return { estado: 'completada' as const, totalCents: TOTAL, ...parcial };
}

describe('cobroInicial', () => {
  it('es pendiente, sin cobrado y sin pagos', () => {
    expect(cobroInicial()).toEqual({ v: 1, estado: 'pendiente', cobradoCents: 0, pagos: [] });
  });
});

describe('aplicarPago', () => {
  it('un pago por el total deja la venta cobrada', () => {
    const cobro = aplicarPago(cobroInicial(), pago(10000), TOTAL);
    expect(cobro.estado).toBe('cobrada');
    expect(cobro.cobradoCents).toBe(10000);
    expect(cobro.pagos).toHaveLength(1);
  });

  it('un pago menor deja pendiente, y estadoCobro da parcial', () => {
    const cobro = aplicarPago(cobroInicial(), pago(4000), TOTAL);
    expect(cobro.estado).toBe('pendiente');
    expect(cobro.cobradoCents).toBe(4000);
    expect(estadoCobro(venta({ cobro }))).toBe('parcial');
  });

  it('dos pagos que suman el total dejan la venta cobrada, en orden', () => {
    const c1 = aplicarPago(cobroInicial(), pago(4000, 'a'), TOTAL);
    const c2 = aplicarPago(c1, pago(6000, 'b'), TOTAL);
    expect(c2.estado).toBe('cobrada');
    expect(c2.cobradoCents).toBe(10000);
    expect(c2.pagos.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('rechaza el sobrepago', () => {
    expect(() => aplicarPago(cobroInicial(), pago(10001), TOTAL)).toThrow(RangeError);
    const c1 = aplicarPago(cobroInicial(), pago(6000), TOTAL);
    expect(() => aplicarPago(c1, pago(4001, 'b'), TOTAL)).toThrow(RangeError);
  });

  it('rechaza monto 0 y negativo', () => {
    expect(() => aplicarPago(cobroInicial(), pago(0), TOTAL)).toThrow(RangeError);
    expect(() => aplicarPago(cobroInicial(), pago(-500), TOTAL)).toThrow(RangeError);
  });

  it('no muta el cobro original', () => {
    const original = cobroInicial();
    aplicarPago(original, pago(4000), TOTAL);
    expect(original).toEqual({ v: 1, estado: 'pendiente', cobradoCents: 0, pagos: [] });
  });
});

describe('deshacerUltimoPago', () => {
  it('vuelve al estado anterior', () => {
    const c1 = aplicarPago(cobroInicial(), pago(4000, 'a'), TOTAL);
    const c2 = aplicarPago(c1, pago(6000, 'b'), TOTAL);
    expect(c2.estado).toBe('cobrada');

    const deshecho = deshacerUltimoPago(c2, TOTAL);
    expect(deshecho).toEqual(c1);

    expect(deshacerUltimoPago(c1, TOTAL)).toEqual(cobroInicial());
  });

  it('no muta el cobro original', () => {
    const c1: CobroVenta = aplicarPago(cobroInicial(), pago(4000), TOTAL);
    deshacerUltimoPago(c1, TOTAL);
    expect(c1.pagos).toHaveLength(1);
    expect(c1.cobradoCents).toBe(4000);
  });

  it('lanza si no hay pagos', () => {
    expect(() => deshacerUltimoPago(cobroInicial(), TOTAL)).toThrow(RangeError);
  });
});

describe('estadoCobro', () => {
  it('sin cobro es cobrada (cobrada en el acto o venta anterior)', () => {
    expect(estadoCobro(venta())).toBe('cobrada');
  });

  it('cobro pendiente sin pagos es pendiente', () => {
    expect(estadoCobro(venta({ cobro: cobroInicial() }))).toBe('pendiente');
  });

  it('cobro cobrada es cobrada', () => {
    const cobro = aplicarPago(cobroInicial(), pago(10000), TOTAL);
    expect(estadoCobro(venta({ cobro }))).toBe('cobrada');
  });

  it('anulada con pagos es anulada', () => {
    const cobro = aplicarPago(cobroInicial(), pago(4000), TOTAL);
    expect(estadoCobro(venta({ estado: 'anulada', cobro }))).toBe('anulada');
  });

  it('anulada a cobrar sin pagos es anulada', () => {
    expect(estadoCobro(venta({ estado: 'anulada', cobro: cobroInicial() }))).toBe('anulada');
  });
});

describe('saldoPendienteCents', () => {
  it('con cobro, es total menos cobrado', () => {
    expect(saldoPendienteCents(venta({ cobro: cobroInicial() }))).toBe(10000);
    const cobro = aplicarPago(cobroInicial(), pago(4000), TOTAL);
    expect(saldoPendienteCents(venta({ cobro }))).toBe(6000);
    const total = aplicarPago(cobroInicial(), pago(10000), TOTAL);
    expect(saldoPendienteCents(venta({ cobro: total }))).toBe(0);
  });

  it('sin cobro es 0', () => {
    expect(saldoPendienteCents(venta())).toBe(0);
  });

  it('anulada es 0, aunque tenga saldo', () => {
    expect(saldoPendienteCents(venta({ estado: 'anulada', cobro: cobroInicial() }))).toBe(0);
  });
});

describe('pagosDe', () => {
  it('venta sin cobro (mostrador): lista vacía', () => {
    expect(pagosDe(venta())).toEqual([]);
  });

  it('venta a cobrar: devuelve los pagos en orden', () => {
    const cobro = aplicarPago(aplicarPago(cobroInicial(), pago(3000, 'a'), TOTAL), pago(2000, 'b'), TOTAL);
    expect(pagosDe(venta({ cobro })).map((p) => p.id)).toEqual(['a', 'b']);
    expect(pagosDe(venta({ cobro: cobroInicial() }))).toEqual([]);
  });
});

describe('cobradoCents', () => {
  it('venta sin cobro (mostrador): 0, no el total', () => {
    expect(cobradoCents(venta())).toBe(0);
  });

  it('venta a cobrar: lo cobrado por los pagos registrados', () => {
    expect(cobradoCents(venta({ cobro: cobroInicial() }))).toBe(0);
    const cobro = aplicarPago(cobroInicial(), pago(3000), TOTAL);
    expect(cobradoCents(venta({ cobro }))).toBe(3000);
  });

  it('una venta anulada conserva lo cobrado (para avisarlo)', () => {
    const cobro = aplicarPago(cobroInicial(), pago(3000), TOTAL);
    expect(cobradoCents(venta({ estado: 'anulada', cobro }))).toBe(3000);
  });
});

describe('deudaTotalCents', () => {
  it('lista vacía: 0', () => {
    expect(deudaTotalCents([])).toBe(0);
  });

  it('suma los saldos de pendientes y parciales; cobradas, anuladas y de mostrador aportan 0', () => {
    const parcial = aplicarPago(cobroInicial(), pago(4000), TOTAL);
    const saldada = aplicarPago(cobroInicial(), pago(10000), TOTAL);
    expect(
      deudaTotalCents([
        venta({ cobro: cobroInicial() }), // 10000
        venta({ cobro: parcial }), // 6000
        venta({ cobro: saldada }), // 0
        venta({ estado: 'anulada', cobro: cobroInicial() }), // 0
        venta(), // 0
      ]),
    ).toBe(16000);
  });
});

describe('agruparDeudaPorCliente', () => {
  // Fechas a mediodía local: el cálculo es por día calendario local, así que las
  // pruebas no dependen de la zona horaria de la máquina.
  const AHORA = new Date(2026, 8, 30, 10, 0);
  const dia = (d: number, h = 12) => new Date(2026, 8, d, h, 0);

  function ventaCliente(
    id: string,
    clienteId: string | undefined,
    opts: {
      fecha?: Date;
      totalCents?: number;
      cobradoCents?: number;
      estado?: Venta['estado'];
      aCobrar?: boolean;
      clienteNombre?: string;
    } = {},
  ): Venta {
    const aCobrar = opts.aCobrar ?? true;
    const total = money(opts.totalCents ?? 10000);
    const cobrado = money(opts.cobradoCents ?? 0);
    return {
      id,
      numero: 1,
      fecha: opts.fecha ?? dia(29),
      usuarioId: 'u1',
      items: [],
      totalCents: total,
      medioPago: aCobrar ? 'a_cobrar' : 'efectivo',
      estado: opts.estado ?? 'completada',
      ...(clienteId !== undefined ? { clienteId } : {}),
      ...(opts.clienteNombre !== undefined ? { clienteNombre: opts.clienteNombre } : {}),
      ...(aCobrar
        ? {
            cobro: {
              v: 1 as const,
              estado: cobrado === total ? ('cobrada' as const) : ('pendiente' as const),
              cobradoCents: cobrado,
              pagos: [],
            },
          }
        : {}),
    };
  }

  it('lista vacía → []', () => {
    expect(agruparDeudaPorCliente([], AHORA)).toEqual([]);
  });

  it('las anuladas, las cobradas y las del mostrador no aparecen', () => {
    const ventas = [
      ventaCliente('anulada', 'c1', { estado: 'anulada', clienteNombre: 'Ana' }),
      ventaCliente('cobrada', 'c2', { cobradoCents: 10000, clienteNombre: 'Beto' }),
      ventaCliente('mostrador', 'c3', { aCobrar: false, clienteNombre: 'Carla' }),
    ];
    expect(agruparDeudaPorCliente(ventas, AHORA)).toEqual([]);
  });

  it('una venta parcial aporta su saldo, no su total', () => {
    const [d] = agruparDeudaPorCliente(
      [ventaCliente('v1', 'c1', { totalCents: 10000, cobradoCents: 4000, clienteNombre: 'Ana' })],
      AHORA,
    );
    expect(d?.deudaCents).toBe(6000);
    expect(d?.cantidadVentas).toBe(1);
  });

  it('una venta sin cliente se ignora', () => {
    expect(agruparDeudaPorCliente([ventaCliente('v1', undefined)], AHORA)).toEqual([]);
  });

  it('dos ventas del mismo cliente suman y los días salen de la más vieja', () => {
    const ventas = [
      ventaCliente('reciente', 'c1', { fecha: dia(29), totalCents: 3000, clienteNombre: 'Ana R.' }),
      ventaCliente('vieja', 'c1', { fecha: dia(20), totalCents: 5000, clienteNombre: 'Ana' }),
      ventaCliente('cobrada', 'c1', { fecha: dia(1), cobradoCents: 10000 }),
    ];
    const resultado = agruparDeudaPorCliente(ventas, AHORA);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toEqual({
      clienteId: 'c1',
      clienteNombre: 'Ana R.', // el de la venta más reciente
      deudaCents: 8000,
      cantidadVentas: 2,
      fechaMasAntigua: dia(20),
      diasDeuda: 10,
    });
  });

  it('cuenta días calendario locales: ayer de noche mirado hoy a la mañana es 1', () => {
    const [d] = agruparDeudaPorCliente(
      [ventaCliente('v1', 'c1', { fecha: dia(29, 23), clienteNombre: 'Ana' })],
      AHORA,
    );
    expect(d?.diasDeuda).toBe(1);
  });

  it('una venta de hoy da 0 días, y una fecha futura no da negativo', () => {
    const [hoy] = agruparDeudaPorCliente([ventaCliente('v1', 'c1', { fecha: dia(30, 8) })], AHORA);
    expect(hoy?.diasDeuda).toBe(0);
    const [futura] = agruparDeudaPorCliente([ventaCliente('v2', 'c1', { fecha: dia(31) })], AHORA);
    expect(futura?.diasDeuda).toBe(0);
  });

  it('ordena por días descendente y desempata por deuda descendente, luego por nombre', () => {
    const ventas = [
      ventaCliente('a', 'c-poca', { fecha: dia(25), totalCents: 1000, clienteNombre: 'Zoe' }),
      ventaCliente('b', 'c-vieja', { fecha: dia(10), totalCents: 500, clienteNombre: 'Vieja' }),
      ventaCliente('c', 'c-mucha', { fecha: dia(25), totalCents: 9000, clienteNombre: 'Yuri' }),
      ventaCliente('d', 'c-b', { fecha: dia(28), totalCents: 700, clienteNombre: 'Bea' }),
      ventaCliente('e', 'c-a', { fecha: dia(28), totalCents: 700, clienteNombre: 'Abel' }),
    ];
    expect(agruparDeudaPorCliente(ventas, AHORA).map((d) => d.clienteId)).toEqual([
      'c-vieja',
      'c-mucha',
      'c-poca',
      'c-a',
      'c-b',
    ]);
  });

  it('no muta la lista recibida', () => {
    const ventas = [
      ventaCliente('a', 'c1', { fecha: dia(29) }),
      ventaCliente('b', 'c2', { fecha: dia(20) }),
    ];
    const copia = [...ventas];
    agruparDeudaPorCliente(ventas, AHORA);
    expect(ventas).toEqual(copia);
  });
});
