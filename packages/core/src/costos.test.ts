import { describe, it, expect } from 'vitest';
import {
  calcularCostoRealCents,
  calcularCostoRealKgCents,
  nuevoCostoPromedio,
} from './costos.js';
import { money } from './money.js';
import { peso } from './peso.js';

describe('calcularCostoRealCents', () => {
  it('suma factura + gasto prorrateado', () => {
    expect(calcularCostoRealCents(money(50000), money(10000))).toBe(60000);
    expect(calcularCostoRealCents(money(50000), money(0))).toBe(50000);
  });
});

describe('calcularCostoRealKgCents', () => {
  it('deriva el costo por kg de un ítem al peso', () => {
    // $2.500 por 5 kg → $500/kg
    expect(calcularCostoRealKgCents(money(250000), peso(5000))).toBe(50000);
    // $600 por 3 kg → $200/kg
    expect(calcularCostoRealKgCents(money(60000), peso(3000))).toBe(20000);
  });

  it('redondea half-up cuando no divide exacto', () => {
    // 10000 * 1000 / 3000 = 3333.33 → 3333
    expect(calcularCostoRealKgCents(money(10000), peso(3000))).toBe(3333);
    // 20000 * 1000 / 3000 = 6666.66 → 6667
    expect(calcularCostoRealKgCents(money(20000), peso(3000))).toBe(6667);
  });

  it('un kilo exacto no pierde precisión', () => {
    expect(calcularCostoRealKgCents(money(50000), peso(1000))).toBe(50000);
  });

  it('devuelve null con gramos 0 (no hay costo por kg que derivar)', () => {
    expect(calcularCostoRealKgCents(money(50000), peso(0))).toBeNull();
  });

  it('el resultado es entero (sin floats)', () => {
    expect(Number.isInteger(calcularCostoRealKgCents(money(10000), peso(3000)))).toBe(true);
  });
});

describe('nuevoCostoPromedio', () => {
  it('promedia ponderado por cantidad entre stock existente y lo ingresado', () => {
    // 2000 g a $400/kg + 2000 g a $600/kg → $500/kg
    expect(nuevoCostoPromedio(2000, money(40000), 2000, money(60000))).toBe(50000);
    // 3000 g a $400/kg + 1000 g a $800/kg → (3*400 + 1*800)/4 = $500/kg
    expect(nuevoCostoPromedio(3000, money(40000), 1000, money(80000))).toBe(50000);
  });

  it('pondera por unidades igual que por gramos (unidad de medida se cancela)', () => {
    // 10 unidades a $150 + 30 unidades a $250 → (10*150+30*250)/40 = $225
    expect(nuevoCostoPromedio(10, money(15000), 30, money(25000))).toBe(22500);
  });

  it('stock previo 0: el promedio es el costo entrante', () => {
    expect(nuevoCostoPromedio(0, money(0), 2000, money(60000))).toBe(60000);
    // aunque venga un costo previo espurio, sin cantidad no pesa
    expect(nuevoCostoPromedio(0, money(99999), 2000, money(60000))).toBe(60000);
  });

  it('sin costo previo (promedio 0) con stock existente: usa el costo entrante', () => {
    // stock que entró por ingreso manual (costo 0) no diluye la primera compra
    expect(nuevoCostoPromedio(5000, money(0), 1000, money(60000))).toBe(60000);
  });

  it('cantidad ingresada 0: no cambia el promedio', () => {
    expect(nuevoCostoPromedio(2000, money(50000), 0, money(99999))).toBe(50000);
  });

  it('redondea half-up cuando el promedio no es exacto', () => {
    // (1*100 + 2*101)/3 = 302/3 = 100.66 → 101
    expect(nuevoCostoPromedio(1, money(100), 2, money(101))).toBe(101);
    // (1*100 + 1*101)/2 = 100.5 → 101 (half-up away from zero)
    expect(nuevoCostoPromedio(1, money(100), 1, money(101))).toBe(101);
  });

  it('el resultado es entero (sin floats)', () => {
    expect(Number.isInteger(nuevoCostoPromedio(1, money(100), 2, money(101)))).toBe(true);
  });

  it('rechaza cantidades no enteras', () => {
    expect(() => nuevoCostoPromedio(1.5, money(100), 1, money(100))).toThrow(RangeError);
    expect(() => nuevoCostoPromedio(1, money(100), 1.5, money(100))).toThrow(RangeError);
  });
});
