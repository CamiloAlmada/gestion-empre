import { describe, expect, it } from 'vitest';
import { money, type StatsCliente } from '@gestion/core';
import { calcularDiasDesdeUltimaCompra, calcularTicketPromedio } from './estadisticas';

function stats(over: Partial<StatsCliente> = {}): StatsCliente {
  return { cantidadVentas: 0, totalHistoricoCents: money(0), ...over };
}

describe('calcularTicketPromedio', () => {
  it('sin ventas (cantidadVentas === 0): devuelve null en vez de dividir por cero', () => {
    expect(calcularTicketPromedio(stats({ cantidadVentas: 0, totalHistoricoCents: money(0) }))).toBeNull();
  });

  it('divide el total histórico entre la cantidad de ventas', () => {
    const resultado = calcularTicketPromedio(
      stats({ cantidadVentas: 4, totalHistoricoCents: money(200000) }),
    );
    expect(resultado).toBe(money(50000));
  });

  it('redondea half-up cuando la división no es exacta', () => {
    // 1000 / 3 = 333.33...  → redondea a 333
    const resultado = calcularTicketPromedio(
      stats({ cantidadVentas: 3, totalHistoricoCents: money(1000) }),
    );
    expect(resultado).toBe(money(333));

    // 1001 / 3 = 333.66... → redondea a 334
    const resultadoDos = calcularTicketPromedio(
      stats({ cantidadVentas: 3, totalHistoricoCents: money(1001) }),
    );
    expect(resultadoDos).toBe(money(334));
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
