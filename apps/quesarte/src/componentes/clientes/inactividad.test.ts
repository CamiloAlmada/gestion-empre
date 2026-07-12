import { describe, expect, it } from 'vitest';
import { money, type Cliente } from '@gestion/core';
import { calcularClientesInactivos } from './inactividad';

function clienteDe(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2025-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

const AHORA = new Date('2026-07-12T12:00:00');

describe('calcularClientesInactivos', () => {
  it('ritmo propio (≥3 compras): clasifica inactivo según su propio promedio, no el umbral global', () => {
    // Compra cada 5 días en promedio, pero hace 20 días que no viene: 20 > 2×5=10 → inactivo.
    const c = clienteDe({
      id: 'c1',
      nombre: 'Ritmo propio',
      stats: {
        cantidadVentas: 5,
        totalHistoricoCents: money(100000),
        primeraCompra: new Date('2026-06-02T12:00:00'), // hace 40 días
        ultimaCompra: new Date('2026-06-22T12:00:00'), // hace 20 días
      },
    });

    const resultado = calcularClientesInactivos([c], AHORA);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]!.cliente.id).toBe('c1');
    expect(resultado[0]!.diasSinVenir).toBe(20);
  });

  it('ritmo propio (≥3 compras) que NO supera su umbral: no aparece, aunque pasen varios días', () => {
    // Compra cada 15 días en promedio; hace 20 días que no viene: 20 < 2×15=30 → NO inactivo.
    const c = clienteDe({
      id: 'c1',
      nombre: 'Cliente puntual',
      stats: {
        cantidadVentas: 5,
        totalHistoricoCents: money(100000),
        primeraCompra: new Date('2026-05-08T12:00:00'), // hace 65 días
        ultimaCompra: new Date('2026-06-22T12:00:00'), // hace 20 días
      },
    });

    expect(calcularClientesInactivos([c], AHORA)).toHaveLength(0);
  });

  it('<3 compras: usa el umbral global (30 días default) en vez del ritmo propio', () => {
    const c = clienteDe({
      id: 'c1',
      nombre: 'Cliente nuevo',
      stats: {
        cantidadVentas: 2,
        totalHistoricoCents: money(50000),
        ultimaCompra: new Date('2026-06-01T12:00:00'), // hace 41 días > 30
      },
    });

    const resultado = calcularClientesInactivos([c], AHORA);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]!.diasSinVenir).toBe(41);
  });

  it('<3 compras y dentro del umbral global: no aparece', () => {
    const c = clienteDe({
      id: 'c1',
      nombre: 'Cliente reciente',
      stats: {
        cantidadVentas: 1,
        totalHistoricoCents: money(50000),
        ultimaCompra: new Date('2026-07-01T12:00:00'), // hace 11 días < 30
      },
    });

    expect(calcularClientesInactivos([c], AHORA)).toHaveLength(0);
  });

  it('ordena por total histórico descendente: primero los mejores clientes que se están perdiendo', () => {
    const bajo = clienteDe({
      id: 'c-bajo',
      nombre: 'Bajo',
      stats: { cantidadVentas: 1, totalHistoricoCents: money(10000), ultimaCompra: new Date('2026-06-01') },
    });
    const alto = clienteDe({
      id: 'c-alto',
      nombre: 'Alto',
      stats: { cantidadVentas: 1, totalHistoricoCents: money(500000), ultimaCompra: new Date('2026-06-01') },
    });
    const medio = clienteDe({
      id: 'c-medio',
      nombre: 'Medio',
      stats: { cantidadVentas: 1, totalHistoricoCents: money(200000), ultimaCompra: new Date('2026-06-01') },
    });

    const resultado = calcularClientesInactivos([bajo, alto, medio], AHORA);

    expect(resultado.map((r) => r.cliente.id)).toEqual(['c-alto', 'c-medio', 'c-bajo']);
  });

  it('cliente desactivado (activo: false): se excluye aunque clasifique como inactivo por sus stats', () => {
    const c = clienteDe({
      id: 'c1',
      nombre: 'Desactivado',
      activo: false,
      stats: { cantidadVentas: 1, totalHistoricoCents: money(50000), ultimaCompra: new Date('2026-01-01') },
    });

    expect(calcularClientesInactivos([c], AHORA)).toHaveLength(0);
  });

  it('cliente sin compras: no aparece (clasificarInactividad ya lo excluye)', () => {
    const c = clienteDe({ id: 'c1', nombre: 'Sin compras' });

    expect(calcularClientesInactivos([c], AHORA)).toHaveLength(0);
  });

  it('lista vacía: devuelve []', () => {
    expect(calcularClientesInactivos([], AHORA)).toEqual([]);
  });
});
