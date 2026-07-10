import { describe, expect, it } from 'vitest';
import { money, type StatsCliente } from '@gestion/core';
import { calcularDiasDesdeUltimaCompra, calcularTicketPromedio } from './estadisticas';

function stats(over: Partial<StatsCliente> = {}): StatsCliente {
  return { cantidadVentas: 0, totalHistoricoCents: money(0), ...over };
}

// La aritmética exhaustiva (redondeo half-up, división por cero) se testea en
// core (`money.test.ts`, `calcularTicketPromedio`); acá solo se verifica que el
// adapter mapea bien los campos de `StatsCliente` al helper de core.
describe('calcularTicketPromedio (adapter sobre StatsCliente)', () => {
  it('sin ventas (cantidadVentas === 0): devuelve null', () => {
    expect(calcularTicketPromedio(stats({ cantidadVentas: 0, totalHistoricoCents: money(0) }))).toBeNull();
  });

  it('delega en el helper de core con el total y la cantidad de las stats', () => {
    const resultado = calcularTicketPromedio(
      stats({ cantidadVentas: 4, totalHistoricoCents: money(200000) }),
    );
    expect(resultado).toBe(money(50000));
  });
});

describe('calcularDiasDesdeUltimaCompra', () => {
  it('sin compras registradas (ultimaCompra undefined): devuelve null', () => {
    expect(calcularDiasDesdeUltimaCompra(stats(), new Date('2026-07-09'))).toBeNull();
  });

  it('calcula días enteros entre la última compra y "ahora"', () => {
    const resultado = calcularDiasDesdeUltimaCompra(
      stats({ ultimaCompra: new Date('2026-07-01T10:00:00') }),
      new Date('2026-07-09T10:00:00'),
    );
    expect(resultado).toBe(8);
  });

  it('redondea hacia abajo: menos de 24hs desde la última compra cuenta como 0 días', () => {
    const resultado = calcularDiasDesdeUltimaCompra(
      stats({ ultimaCompra: new Date('2026-07-09T08:00:00') }),
      new Date('2026-07-09T20:00:00'),
    );
    expect(resultado).toBe(0);
  });

  it('nunca devuelve un valor negativo aunque "ahora" sea anterior a la última compra registrada', () => {
    const resultado = calcularDiasDesdeUltimaCompra(
      stats({ ultimaCompra: new Date('2026-07-10T00:00:00') }),
      new Date('2026-07-09T00:00:00'),
    );
    expect(resultado).toBe(0);
  });
});
