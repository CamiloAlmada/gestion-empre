import { redondearHalfUp } from './redondeo.js';

declare const brandMoney: unique symbol;

/**
 * Dinero en centésimos de peso uruguayo, entero.
 *
 * `$ 1.234,50` se persiste como `123450`. Puede ser negativo (reversas, deltas).
 * Es un branded type sobre `number`: costo cero en runtime, pero no se puede
 * construir sin pasar por `money()` / las funciones de este módulo.
 */
export type Money = number & { readonly [brandMoney]: 'Money' };

/**
 * Construye un `Money` a partir de centésimos.
 *
 * @throws {RangeError} si `cents` no es un entero finito (rechaza floats, NaN,
 *   Infinity). Acepta 0 y negativos.
 */
export function money(cents: number): Money {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`money() requiere un entero finito de centésimos, recibió: ${cents}`);
  }
  return cents as Money;
}

/** Suma de montos. Sin argumentos devuelve `money(0)` (identidad). */
export function sumarMoney(...montos: Money[]): Money {
  return money(montos.reduce<number>((acc, m) => acc + m, 0));
}

/**
 * Multiplica un monto por un escalar (ej. cantidad, fracción de kg, porcentaje) y
 * redondea half-up al centésimo.
 *
 * @throws {RangeError} si `escalar` no es finito.
 */
export function multiplicarMoney(m: Money, escalar: number): Money {
  if (!Number.isFinite(escalar)) {
    throw new RangeError(`multiplicarMoney() requiere un escalar finito, recibió: ${escalar}`);
  }
  return money(redondearHalfUp(m * escalar));
}

/**
 * Ticket promedio: `totalHistoricoCents / cantidadVentas`, redondeado half-up con
 * el mismo helper que `multiplicarMoney` (nunca una regla de redondeo nueva).
 * Devuelve `null` cuando el cliente todavía no tiene ventas (`cantidadVentas <= 0`):
 * evita la división por cero en vez de propagar `NaN`/`Infinity`.
 *
 * Es aritmética de plata (regla de oro 1): vive en core, junto a los demás
 * helpers de `Money`, y la UI solo la consume. Toma los dos escalares (en vez de
 * `StatsCliente`) para no acoplar este módulo de primitivas al modelo de dominio.
 */
export function calcularTicketPromedio(
  totalHistoricoCents: Money,
  cantidadVentas: number,
): Money | null {
  if (cantidadVentas <= 0) return null;
  return money(redondearHalfUp(totalHistoricoCents / cantidadVentas));
}

/**
 * Convierte un monto en pesos (con decimales, como lo ingresa la UI) a `Money`
 * en centésimos, redondeando half-up. Frontera UI → dominio.
 *
 *   moneyDesdePesos(1234.5) === money(123450)
 *
 * @throws {RangeError} si `monto` no es finito.
 */
export function moneyDesdePesos(monto: number): Money {
  if (!Number.isFinite(monto)) {
    throw new RangeError(`moneyDesdePesos() requiere un monto finito, recibió: ${monto}`);
  }
  return money(redondearHalfUp(monto * 100));
}

/**
 * Formatea un `Money` a string es-UY: separador de miles `.`, decimal `,`, siempre
 * 2 decimales, prefijo `$ `, y signo `-` al frente para negativos.
 *
 *   formatearMoney(money(123450))  === '$ 1.234,50'
 *   formatearMoney(money(-123450)) === '-$ 1.234,50'
 *   formatearMoney(money(5))       === '$ 0,05'
 *
 * Se construye a mano (sin `Intl.NumberFormat`) para garantizar espacios comunes
 * (no NBSP) y un output byte-a-byte estable entre entornos.
 */
export function formatearMoney(m: Money): string {
  const signo = m < 0 ? '-' : '';
  const abs = Math.abs(m);
  const entero = Math.trunc(abs / 100);
  const centavos = abs % 100;
  const centavosStr = centavos.toString().padStart(2, '0');
  return `${signo}$ ${agruparMiles(entero)},${centavosStr}`;
}

/** Agrupa de a 3 dígitos con `.` un entero no negativo: `1234567` → `'1.234.567'`. */
function agruparMiles(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
