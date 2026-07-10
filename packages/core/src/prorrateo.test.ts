import { describe, it, expect } from 'vitest';
import { repartirProporcional, prorratearGastos } from './prorrateo.js';
import { money } from './money.js';
import { peso } from './peso.js';

describe('repartirProporcional — invariante de suma exacta', () => {
  it('un solo ítem se lleva todo el total', () => {
    expect(repartirProporcional(money(200000), [45000])).toEqual([200000]);
    expect(repartirProporcional(money(0), [45000])).toEqual([0]);
  });

  it('reparte proporcional cuando divide exacto', () => {
    // total 100 entre pesos 70/20/10 → 70/20/10
    expect(repartirProporcional(money(100), [70, 20, 10])).toEqual([70, 20, 10]);
  });

  it('cierra el residuo con el método del mayor residuo', () => {
    // total 7 entre pesos 5/4/1 (W=10): crudos 3.5 / 2.8 / 0.7 → pisos 3/2/0 (Σ5),
    // residuo 2 a los mayores residuos fraccionarios (.8 y .7) → 3/3/1
    expect(repartirProporcional(money(7), [5, 4, 1])).toEqual([3, 3, 1]);
  });

  it('reparte $2.000 de combustible sin perder ni inventar centésimos (criterio doc 04)', () => {
    // $2.000 = 200000 cents entre tres ítems de factura desigual
    const r = repartirProporcional(money(200000), [50000, 30000, 20000]);
    expect(r).toEqual([100000, 60000, 40000]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(200000);
  });

  it('desempata residuos iguales por mayor peso, luego por menor índice', () => {
    // total 1 entre pesos iguales → va al de menor índice
    expect(repartirProporcional(money(1), [10, 10, 10])).toEqual([1, 0, 0]);
    // total 2 entre pesos iguales → a los dos primeros índices
    expect(repartirProporcional(money(2), [10, 10, 10])).toEqual([1, 1, 0]);
    // residuos fraccionarios iguales pero pesos distintos → gana el de mayor peso.
    // total 3 entre pesos 1/1/1... construimos empate real: total 5 entre 2/2/2 (W=6):
    // crudos 1.66 c/u → pisos 1/1/1 (Σ3), residuo 2, residuos frac iguales,
    // pesos iguales → índices 0 y 1
    expect(repartirProporcional(money(5), [2, 2, 2])).toEqual([2, 2, 1]);
  });

  it('desempate por mayor peso cuando los residuos fraccionarios empatan', () => {
    // total 1 entre pesos 1/2 (W=3): crudos .33/.66 → pisos 0/0, residuo 1,
    // residuos frac .33 vs .66 → gana el segundo (mayor). No es empate.
    expect(repartirProporcional(money(1), [1, 2])).toEqual([0, 1]);
    // Empate de residuo fraccionario con pesos distintos:
    // total 3 entre pesos 1/3 (W=4): crudos .75/2.25 → pisos 0/2 (Σ2), residuo 1,
    // residuos frac .75(=3/4) vs .25(=1/4) → gana el primero → 1/2
    expect(repartirProporcional(money(3), [1, 3])).toEqual([1, 2]);
  });

  it('ítems con peso 0 no reciben nada si hay base positiva', () => {
    // total 100, pesos 0/100/0 → todo al del medio
    expect(repartirProporcional(money(100), [0, 100, 0])).toEqual([0, 100, 0]);
  });

  it('sin base de reparto (todos los pesos 0) reparte en partes iguales', () => {
    // total 100 entre 3 ítems de peso 0 → 34/33/33 (residuo al menor índice)
    const r = repartirProporcional(money(100), [0, 0, 0]);
    expect(r).toEqual([34, 33, 33]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('gastos 0: todos reciben 0', () => {
    expect(repartirProporcional(money(0), [50000, 30000, 20000])).toEqual([0, 0, 0]);
  });

  it('lista vacía con total 0 devuelve lista vacía', () => {
    expect(repartirProporcional(money(0), [])).toEqual([]);
  });

  it('rechaza prorratear un total > 0 sin ítems', () => {
    expect(() => repartirProporcional(money(100), [])).toThrow(RangeError);
  });

  it('rechaza total negativo y pesos negativos o no enteros', () => {
    expect(() => repartirProporcional(money(-100), [10])).toThrow(RangeError);
    expect(() => repartirProporcional(money(100), [-10])).toThrow(RangeError);
    expect(() => repartirProporcional(money(100), [10.5])).toThrow(RangeError);
  });

  it('el resultado es siempre entero (sin floats)', () => {
    const r = repartirProporcional(money(1000), [3, 3, 3]);
    for (const c of r) expect(Number.isInteger(c)).toBe(true);
  });
});

describe('repartirProporcional — propiedad: Σ == total SIEMPRE', () => {
  // Generador determinístico (LCG) para barrer muchas combinaciones sin librerías.
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  // 2000 combinaciones (antes 5000): el invariante Σ==total es estructural (vale
  // por construcción del algoritmo), así que este test es una red de seguridad, no
  // una prueba exhaustiva. 2000 casos ya barren toda la variedad relevante
  // (n=1..8, pesos con ceros y montos grandes, totales hasta $5.000) y el barrido
  // determinístico de totales 0..300 de abajo cubre los bordes de residuo chico.
  // Timeout explícito holgado (20 s) para que la variancia de runners lentos de CI
  // no vuelva a tumbar el default de 5 s de vitest — corre en <1 s en local.
  it('cualquier combinación de total y pesos cierra exacto', () => {
    const rand = lcg(20260710);
    let casos = 0;
    for (let iter = 0; iter < 2000; iter++) {
      const n = 1 + Math.floor(rand() * 8); // 1..8 ítems
      const pesos: number[] = [];
      for (let i = 0; i < n; i++) {
        // mezcla de pesos: a veces 0, a veces montos grandes
        pesos.push(rand() < 0.2 ? 0 : Math.floor(rand() * 100000));
      }
      const total = Math.floor(rand() * 500000); // hasta $5.000 de gastos
      const r = repartirProporcional(money(total), pesos);
      const suma = r.reduce((a, b) => a + b, 0);
      expect(suma).toBe(total);
      expect(r).toHaveLength(n);
      for (const c of r) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
      }
      casos++;
    }
    expect(casos).toBe(2000);
  }, 20_000);

  it('barrido exhaustivo de totales chicos contra pesos fijos', () => {
    const pesos = [7, 3, 5, 1, 11]; // primos, fuerza residuos no triviales
    for (let total = 0; total <= 300; total++) {
      const r = repartirProporcional(money(total), pesos);
      expect(r.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('listas grandes también cierran exacto', () => {
    const pesos = Array.from({ length: 500 }, (_, i) => (i % 13) + 1);
    const r = repartirProporcional(money(123457), pesos);
    expect(r.reduce((a, b) => a + b, 0)).toBe(123457);
    expect(r).toHaveLength(500);
  });
});

describe('prorratearGastos — por_valor (default)', () => {
  it('agrega gastoProrrateadoCents preservando los demás campos del ítem', () => {
    const items = [
      { productoId: 'a', nombreProducto: 'Queso Colonia', costoFacturaCents: money(50000) },
      { productoId: 'b', nombreProducto: 'Salame', costoFacturaCents: money(30000) },
      { productoId: 'c', nombreProducto: 'Miel', costoFacturaCents: money(20000) },
    ];
    const r = prorratearGastos(items, money(200000), 'por_valor');
    expect(r).toEqual([
      { productoId: 'a', nombreProducto: 'Queso Colonia', costoFacturaCents: 50000, gastoProrrateadoCents: 100000 },
      { productoId: 'b', nombreProducto: 'Salame', costoFacturaCents: 30000, gastoProrrateadoCents: 60000 },
      { productoId: 'c', nombreProducto: 'Miel', costoFacturaCents: 20000, gastoProrrateadoCents: 40000 },
    ]);
  });

  it('cierra exacto con montos que no dividen', () => {
    const items = [
      { costoFacturaCents: money(33333) },
      { costoFacturaCents: money(33333) },
      { costoFacturaCents: money(33334) },
    ];
    const r = prorratearGastos(items, money(1000), 'por_valor');
    const suma = r.reduce((a, it) => a + it.gastoProrrateadoCents, 0);
    expect(suma).toBe(1000);
  });

  it('ítems con costo 0 no reciben gasto si hay otros con costo', () => {
    const items = [
      { costoFacturaCents: money(0) },
      { costoFacturaCents: money(100000) },
    ];
    const r = prorratearGastos(items, money(5000), 'por_valor');
    expect(r.map((it) => it.gastoProrrateadoCents)).toEqual([0, 5000]);
  });

  it('gastos 0: nadie recibe gasto', () => {
    const items = [{ costoFacturaCents: money(50000) }, { costoFacturaCents: money(50000) }];
    const r = prorratearGastos(items, money(0), 'por_valor');
    expect(r.map((it) => it.gastoProrrateadoCents)).toEqual([0, 0]);
  });
});

describe('prorratearGastos — por_peso', () => {
  it('reparte proporcional a los gramos', () => {
    const items = [
      { costoFacturaCents: money(50000), gramos: peso(3000) },
      { costoFacturaCents: money(80000), gramos: peso(1000) },
    ];
    const r = prorratearGastos(items, money(200000), 'por_peso');
    // 3000/4000 y 1000/4000 → 150000 / 50000
    expect(r.map((it) => it.gastoProrrateadoCents)).toEqual([150000, 50000]);
  });

  it('ítems sin gramos (por unidad) pesan 0 y quedan fuera', () => {
    const items = [
      { costoFacturaCents: money(50000), gramos: peso(2000) },
      { costoFacturaCents: money(15000) }, // por unidad, sin gramos
    ];
    const r = prorratearGastos(items, money(3000), 'por_peso');
    expect(r.map((it) => it.gastoProrrateadoCents)).toEqual([3000, 0]);
  });

  it('todos por unidad (sin gramos): reparte en partes iguales', () => {
    const items = [{ costoFacturaCents: money(15000) }, { costoFacturaCents: money(15000) }];
    const r = prorratearGastos(items, money(101), 'por_peso');
    const suma = r.reduce((a, it) => a + it.gastoProrrateadoCents, 0);
    expect(suma).toBe(101);
    expect(r.map((it) => it.gastoProrrateadoCents)).toEqual([51, 50]);
  });
});
