import { describe, it, expect } from 'vitest';
import { calcularSubtotal } from './precio.js';
import { money } from './money.js';
import { peso } from './peso.js';

describe('calcularSubtotal — por_kg', () => {
  it('cobra casos de negocio del doc 02', () => {
    // 0,5 kg de queso a $450,00/kg → $225,00
    expect(calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: money(45000), gramos: peso(500) })).toBe(
      22500,
    );
    // 100 g de nuez a $890,00/kg → $89,00
    expect(calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: money(89000), gramos: peso(100) })).toBe(
      8900,
    );
  });

  it('redondea half-up en el límite de medio centésimo (hacia arriba)', () => {
    // 2500 * 1 / 1000 = 2,5 → 3
    expect(calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: money(2500), gramos: peso(1) })).toBe(3);
    // 2500 * 3 / 1000 = 7,5 → 8
    expect(calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: money(2500), gramos: peso(3) })).toBe(8);
  });

  it('redondea hacia abajo por debajo del medio centésimo', () => {
    // 2400 * 1 / 1000 = 2,4 → 2
    expect(calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: money(2400), gramos: peso(1) })).toBe(2);
    // 2499 * 1 / 1000 = 2,499 → 2
    expect(calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: money(2499), gramos: peso(1) })).toBe(2);
  });

  it('devuelve 0 con 0 gramos', () => {
    expect(calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: money(45000), gramos: peso(0) })).toBe(0);
  });

  it('gramo exacto de kilo no pierde precisión', () => {
    // 45000 * 1000 / 1000 = 45000 exacto
    expect(
      calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: money(45000), gramos: peso(1000) }),
    ).toBe(45000);
  });

  it('maneja precios grandes sin desbordar', () => {
    // $50.000,00/kg por 50 kg → 5.000.000 * 50.000 / 1000 = 250.000.000 = $2.500.000,00
    expect(
      calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: money(5_000_000), gramos: peso(50_000) }),
    ).toBe(250_000_000);
  });
});

describe('calcularSubtotal — por_unidad', () => {
  it('cobra 1, 2 y N unidades', () => {
    expect(calcularSubtotal({ modoPrecio: 'por_unidad', precioUnitCents: money(15000), unidades: 1 })).toBe(
      15000,
    );
    expect(calcularSubtotal({ modoPrecio: 'por_unidad', precioUnitCents: money(15000), unidades: 2 })).toBe(
      30000,
    );
    expect(calcularSubtotal({ modoPrecio: 'por_unidad', precioUnitCents: money(15000), unidades: 5 })).toBe(
      75000,
    );
  });

  it('devuelve 0 con 0 unidades', () => {
    expect(calcularSubtotal({ modoPrecio: 'por_unidad', precioUnitCents: money(15000), unidades: 0 })).toBe(
      0,
    );
  });

  it('rechaza una cantidad de unidades no entera', () => {
    expect(() =>
      calcularSubtotal({ modoPrecio: 'por_unidad', precioUnitCents: money(15000), unidades: 1.5 }),
    ).toThrow(RangeError);
  });
});
