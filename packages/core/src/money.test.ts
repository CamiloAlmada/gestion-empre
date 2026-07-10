import { describe, it, expect } from 'vitest';
import {
  money,
  sumarMoney,
  multiplicarMoney,
  calcularTicketPromedio,
  moneyDesdePesos,
  formatearMoney,
} from './money.js';

describe('money (constructor)', () => {
  it('acepta 0, positivos y negativos enteros', () => {
    expect(money(0)).toBe(0);
    expect(money(123450)).toBe(123450);
    expect(money(-123450)).toBe(-123450);
  });

  it('rechaza no-enteros', () => {
    expect(() => money(1.5)).toThrow(RangeError);
    expect(() => money(0.01)).toThrow(RangeError);
    expect(() => money(-2.999)).toThrow(RangeError);
  });

  it('rechaza NaN e Infinity', () => {
    expect(() => money(NaN)).toThrow(RangeError);
    expect(() => money(Infinity)).toThrow(RangeError);
    expect(() => money(-Infinity)).toThrow(RangeError);
  });
});

describe('sumarMoney', () => {
  it('suma casos base', () => {
    expect(sumarMoney(money(100), money(250), money(50))).toBe(400);
  });

  it('sin argumentos devuelve 0 (identidad)', () => {
    expect(sumarMoney()).toBe(0);
  });

  it('respeta la identidad con 0', () => {
    expect(sumarMoney(money(999), money(0))).toBe(999);
  });

  it('maneja negativos y se cancela a 0', () => {
    expect(sumarMoney(money(500), money(-200))).toBe(300);
    expect(sumarMoney(money(-500), money(500))).toBe(0);
    expect(sumarMoney(money(-100), money(-250))).toBe(-350);
  });
});

describe('multiplicarMoney', () => {
  it('multiplica por enteros sin redondeo', () => {
    expect(multiplicarMoney(money(100), 3)).toBe(300);
    expect(multiplicarMoney(money(100), 0)).toBe(0);
  });

  it('redondea half-up hacia arriba', () => {
    // 100 * 0.125 = 12.5 → 13
    expect(multiplicarMoney(money(100), 0.125)).toBe(13);
  });

  it('redondea half-up hacia abajo', () => {
    // 100 * 0.124 = 12.4 → 12
    expect(multiplicarMoney(money(100), 0.124)).toBe(12);
  });

  it('redondea simétricamente con signo negativo', () => {
    // -100 * 0.125 = -12.5 → -13 (away from zero)
    expect(multiplicarMoney(money(-100), 0.125)).toBe(-13);
    // 100 * -0.125 = -12.5 → -13
    expect(multiplicarMoney(money(100), -0.125)).toBe(-13);
  });

  it('calcula subtotal al peso: round(precioKgCents * gramos / 1000)', () => {
    // precio 45000 cents/kg, 350 g → 45000 * 0.35 = 15750
    expect(multiplicarMoney(money(45000), 350 / 1000)).toBe(15750);
    // 45000 * 333/1000 = 14985
    expect(multiplicarMoney(money(45000), 333 / 1000)).toBe(14985);
  });

  it('lanza RangeError con escalar no finito', () => {
    expect(() => multiplicarMoney(money(100), NaN)).toThrow(RangeError);
    expect(() => multiplicarMoney(money(100), Infinity)).toThrow(RangeError);
  });
});

describe('calcularTicketPromedio', () => {
  it('sin ventas (cantidadVentas <= 0): devuelve null en vez de dividir por cero', () => {
    expect(calcularTicketPromedio(money(0), 0)).toBeNull();
    expect(calcularTicketPromedio(money(5000), 0)).toBeNull();
    // Defensa extra: un contador negativo (dato corrupto) tampoco divide.
    expect(calcularTicketPromedio(money(5000), -1)).toBeNull();
  });

  it('divide el total histórico entre la cantidad de ventas (exacto)', () => {
    expect(calcularTicketPromedio(money(200000), 4)).toBe(200000 / 4);
    expect(calcularTicketPromedio(money(200000), 4)).toBe(50000);
  });

  it('redondea half-up cuando la división no es exacta', () => {
    // 1000 / 3 = 333.33… → 333
    expect(calcularTicketPromedio(money(1000), 3)).toBe(333);
    // 1001 / 3 = 333.66… → 334
    expect(calcularTicketPromedio(money(1001), 3)).toBe(334);
  });

  it('el resultado es siempre un entero de centésimos (Money)', () => {
    expect(Number.isInteger(calcularTicketPromedio(money(1000), 3))).toBe(true);
  });
});

describe('moneyDesdePesos', () => {
  it('convierte pesos con 2 decimales exactos', () => {
    expect(moneyDesdePesos(1234.5)).toBe(123450);
    expect(moneyDesdePesos(0)).toBe(0);
    expect(moneyDesdePesos(1)).toBe(100);
    expect(moneyDesdePesos(-12.34)).toBe(-1234);
  });

  it('redondea half-up montos con más de 2 decimales', () => {
    // 12.344 → 1234.4 → 1234
    expect(moneyDesdePesos(12.344)).toBe(1234);
    // 12.345 → 1234.5 → 1235
    expect(moneyDesdePesos(12.345)).toBe(1235);
    // -12.345 → -1234.5 → -1235 (simétrico)
    expect(moneyDesdePesos(-12.345)).toBe(-1235);
  });

  it('lanza RangeError con montos no finitos', () => {
    expect(() => moneyDesdePesos(NaN)).toThrow(RangeError);
    expect(() => moneyDesdePesos(Infinity)).toThrow(RangeError);
  });
});

describe('formatearMoney', () => {
  it('formatea el caso canónico es-UY', () => {
    expect(formatearMoney(money(123450))).toBe('$ 1.234,50');
  });

  it('formatea cero y montos menores a un peso', () => {
    expect(formatearMoney(money(0))).toBe('$ 0,00');
    expect(formatearMoney(money(5))).toBe('$ 0,05');
    expect(formatearMoney(money(50))).toBe('$ 0,50');
    expect(formatearMoney(money(99))).toBe('$ 0,99');
  });

  it('formatea negativos con signo al frente', () => {
    expect(formatearMoney(money(-123450))).toBe('-$ 1.234,50');
    expect(formatearMoney(money(-5))).toBe('-$ 0,05');
  });

  it('agrupa miles y millones con punto', () => {
    expect(formatearMoney(money(100000))).toBe('$ 1.000,00');
    expect(formatearMoney(money(100000000))).toBe('$ 1.000.000,00');
    expect(formatearMoney(money(123456789))).toBe('$ 1.234.567,89');
    expect(formatearMoney(money(-123456789))).toBe('-$ 1.234.567,89');
  });

  it('usa espacio comun U+0020, no NBSP U+00A0', () => {
    const NBSP = String.fromCharCode(0x00a0);
    const s = formatearMoney(money(123450));
    expect(s).not.toContain(NBSP);
    expect(s.charCodeAt(1)).toBe(0x20);
  });
});
