import { describe, it, expect } from 'vitest';
import {
  BPS_TOTAL,
  precioDesdeMargen,
  margenDesdePrecio,
  markupDesdePrecio,
  redondearComercial,
  precioSugerido,
} from './margen.js';
import { money } from './money.js';

describe('precioDesdeMargen (margen sobre venta)', () => {
  it('40 % de margen sobre venta: precio = costo / (1 − 0,4)', () => {
    // costo $300, margen 40 % → $500
    expect(precioDesdeMargen(money(30000), 4000)).toBe(50000);
  });

  it('margen 0: el precio es el costo', () => {
    expect(precioDesdeMargen(money(30000), 0)).toBe(30000);
  });

  it('admite margen negativo (venta a pérdida): precio < costo', () => {
    // margen −25 %: precio = costo / 1,25
    expect(precioDesdeMargen(money(50000), -2500)).toBe(40000);
  });

  it('redondea half-up cuando no divide exacto', () => {
    // 10000 * 10000 / (10000 − 3333) = 1e8 / 6667 = 14999.25 → 14999
    expect(precioDesdeMargen(money(10000), 3333)).toBe(14999);
  });

  it('rechaza margen >= 100 % (precio infinito/negativo)', () => {
    expect(() => precioDesdeMargen(money(30000), BPS_TOTAL)).toThrow(RangeError);
    expect(() => precioDesdeMargen(money(30000), 12000)).toThrow(RangeError);
  });

  it('rechaza bps no enteros', () => {
    expect(() => precioDesdeMargen(money(30000), 40.5)).toThrow(RangeError);
  });
});

describe('margenDesdePrecio (margen sobre venta)', () => {
  it('calcula (precio − costo) / precio en bps', () => {
    // costo $300, precio $500 → margen 40 %
    expect(margenDesdePrecio(money(30000), money(50000))).toBe(4000);
  });

  it('margen negativo cuando se vende bajo costo', () => {
    // costo $500, precio $400 → (400−500)/400 = −25 %
    expect(margenDesdePrecio(money(50000), money(40000))).toBe(-2500);
  });

  it('redondea half-up cuando no da bps exacto', () => {
    // costo $300, precio $450 → (150/450) = 3333.33 → 3333
    expect(margenDesdePrecio(money(30000), money(45000))).toBe(3333);
  });

  it('devuelve null con precio 0 (margen indefinido)', () => {
    expect(margenDesdePrecio(money(30000), money(0))).toBeNull();
  });

  it('el resultado es entero (bps sin floats)', () => {
    expect(Number.isInteger(margenDesdePrecio(money(30000), money(45000)))).toBe(true);
  });
});

describe('markupDesdePrecio (markup sobre costo, dato secundario)', () => {
  it('calcula (precio − costo) / costo en bps', () => {
    // costo $300, precio $500 → markup 66,67 %
    expect(markupDesdePrecio(money(30000), money(50000))).toBe(6667);
    // costo $500, precio $1000 → markup 100 %
    expect(markupDesdePrecio(money(50000), money(100000))).toBe(BPS_TOTAL);
  });

  it('devuelve null con costo 0 (markup indefinido)', () => {
    expect(markupDesdePrecio(money(0), money(50000))).toBeNull();
  });
});

describe('margen ↔ precio: ida y vuelta estable (módulo redondeo)', () => {
  it('precioDesdeMargen ∘ margenDesdePrecio recupera el margen (±1 bps)', () => {
    for (let costo = 10000; costo <= 100000; costo += 2500) {
      for (let margen = 0; margen <= 9000; margen += 500) {
        const precio = precioDesdeMargen(money(costo), margen);
        const recuperado = margenDesdePrecio(money(costo), precio)!;
        expect(Math.abs(recuperado - margen)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('las dos funciones son coherentes en el espacio de margen (±1 bps)', () => {
    // Recuperar el precio EXACTO desde un margen en bps no es estable a márgenes
    // altos (la resolución de 1 bps hace al precio muy sensible); lo que sí es
    // estable —y es la coherencia que importa— es que el margen del precio
    // reconstruido coincida con el margen de partida.
    for (let costo = 10000; costo <= 100000; costo += 2500) {
      for (let precio = costo; precio <= costo * 3; precio += 1500) {
        const margen = margenDesdePrecio(money(costo), money(precio))!;
        const precioRecon = precioDesdeMargen(money(costo), margen);
        const margenRecon = margenDesdePrecio(money(costo), precioRecon)!;
        expect(Math.abs(margenRecon - margen)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('redondearComercial', () => {
  it('redondea al múltiplo de $5 más cercano (default 500)', () => {
    expect(redondearComercial(money(50000))).toBe(50000);
    expect(redondearComercial(money(49900))).toBe(50000); // $499 → $500
    expect(redondearComercial(money(50200))).toBe(50000); // $502 → $500
    expect(redondearComercial(money(50300))).toBe(50500); // $503 → $505
  });

  it('half-up en el punto medio del múltiplo (hacia arriba)', () => {
    expect(redondearComercial(money(250))).toBe(500); // $2,50 → $5
    expect(redondearComercial(money(249))).toBe(0); // $2,49 → $0
    expect(redondearComercial(money(750))).toBe(1000); // $7,50 → $10
  });

  it('simétrico para negativos', () => {
    expect(redondearComercial(money(-250))).toBe(-500);
    expect(redondearComercial(money(-249))).toBe(0);
  });

  it('acepta un múltiplo configurable', () => {
    // múltiplo $10 = 1000 cents
    expect(redondearComercial(money(50300), 1000)).toBe(50000);
    expect(redondearComercial(money(50600), 1000)).toBe(51000);
  });

  it('el resultado siempre es múltiplo del paso (entero)', () => {
    for (let c = 0; c <= 3000; c += 7) {
      expect(redondearComercial(money(c)) % 500).toBe(0);
    }
  });

  it('rechaza múltiplos no enteros o <= 0', () => {
    expect(() => redondearComercial(money(50000), 0)).toThrow(RangeError);
    expect(() => redondearComercial(money(50000), -500)).toThrow(RangeError);
    expect(() => redondearComercial(money(50000), 500.5)).toThrow(RangeError);
  });
});

describe('precioSugerido (compone margen + redondeo comercial)', () => {
  it('sugiere el precio desde margen redondeado a $5', () => {
    // costo $300, margen 40 % → $500 exacto → $500
    expect(precioSugerido(money(30000), 4000)).toBe(50000);
  });

  it('redondea comercialmente el precio crudo del margen', () => {
    // costo $301, margen 40 % → 30100/0,6 = 50166.66 → 50167 → $5 más cercano = 50000
    expect(precioDesdeMargen(money(30100), 4000)).toBe(50167);
    expect(precioSugerido(money(30100), 4000)).toBe(50000);
  });

  it('en precios chicos donde $5 es grueso, redondea al múltiplo más cercano', () => {
    // costo $7,33, margen 30 % → 733/0,7 = 1047 → $5 más cercano = $10 (1000)
    expect(precioDesdeMargen(money(733), 3000)).toBe(1047);
    expect(precioSugerido(money(733), 3000)).toBe(1000);
    // costo $1,60, margen 30 % → 160/0,7 = 228.57 → 229 → múltiplo $5 más cercano = 0
    expect(precioSugerido(money(160), 3000)).toBe(0);
  });

  it('acepta múltiplo configurable', () => {
    // costo $300, margen 40 % → $500, múltiplo $100 → $500
    expect(precioSugerido(money(30000), 4000, 10000)).toBe(50000);
  });
});
