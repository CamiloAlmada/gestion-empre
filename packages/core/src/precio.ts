import { money, type Money } from './money.js';
import type { Peso } from './peso.js';
import { redondearHalfUp } from './redondeo.js';

/**
 * Ítem cobrable para `calcularSubtotal`, discriminado por `modoPrecio` para que no
 * se puedan cruzar los casos (nunca gramos con precio por unidad, ni al revés).
 */
export type ItemCobrable =
  | {
      readonly modoPrecio: 'por_kg';
      /** Precio por kilo, en centésimos. */
      readonly precioKgCents: Money;
      readonly gramos: Peso;
    }
  | {
      readonly modoPrecio: 'por_unidad';
      /** Precio por unidad, en centésimos. */
      readonly precioUnitCents: Money;
      readonly unidades: number;
    };

/**
 * Subtotal de un ítem de venta, en centésimos.
 *
 * - `por_kg`: fórmula del doc 02, `redondearHalfUp(precioKgCents * gramos / 1000)`.
 *   El producto `precioKgCents * gramos` es un entero exacto y la única división
 *   (por 1000) se redondea half-up una sola vez: máxima precisión.
 * - `por_unidad`: `precioUnitCents * unidades`, entero exacto (sin redondeo). Las
 *   unidades deben ser enteras (`unidad_simple` no se fracciona): se valida de
 *   forma explícita porque un producto entero por una fracción puede dar entero
 *   (p. ej. `15000 * 1,5 = 22500`) y `money()` no lo detectaría.
 *
 * @throws {RangeError} si `unidades` (en `por_unidad`) no es un entero finito.
 */
export function calcularSubtotal(item: ItemCobrable): Money {
  if (item.modoPrecio === 'por_kg') {
    return money(redondearHalfUp((item.precioKgCents * item.gramos) / 1000));
  }
  if (!Number.isInteger(item.unidades)) {
    throw new RangeError(
      `calcularSubtotal requiere unidades enteras en 'por_unidad', recibió: ${item.unidades}`,
    );
  }
  return money(item.precioUnitCents * item.unidades);
}
