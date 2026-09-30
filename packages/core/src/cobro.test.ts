import { describe, expect, it } from 'vitest';
import {
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
