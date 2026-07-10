import { money, type Money } from './money.js';
import { redondearHalfUp } from './redondeo.js';

/**
 * Total de basis points: `10_000 bps = 100 %`. Un `40 %` se representa como
 * `4000 bps`. Los márgenes y markups viajan en **bps enteros** para no meter
 * floats en persistencia ni en la aritmética de dominio (`33,33 %` = `3333 bps`,
 * exacto donde `puntos porcentuales` como número perdería precisión).
 */
export const BPS_TOTAL = 10_000;

/**
 * Precio de venta que alcanza un **margen sobre venta** objetivo dado el costo.
 *
 * Definición del doc 03: `margen sobre venta = (precio − costo) / precio`, de donde
 * `precio = costo / (1 − margen)`. En bps enteros:
 *   `precio = costo · BPS_TOTAL / (BPS_TOTAL − margenBps)`  (redondeo half-up).
 *
 * Es el precio "crudo": la UI le aplica después `redondearComercial` (ver
 * `precioSugerido`). Acepta márgenes negativos (venta a pérdida) para ser coherente
 * con lo que `margenDesdePrecio` puede devolver (ida y vuelta estable).
 *
 * @throws {RangeError} si `margenSobreVentaBps` no es entero, o si es `>= 100 %`
 *   (`>= BPS_TOTAL`), que implicaría precio infinito o negativo.
 */
export function precioDesdeMargen(costoCents: Money, margenSobreVentaBps: number): Money {
  if (!Number.isInteger(margenSobreVentaBps)) {
    throw new RangeError(`precioDesdeMargen requiere bps enteros, recibió: ${margenSobreVentaBps}`);
  }
  if (margenSobreVentaBps >= BPS_TOTAL) {
    throw new RangeError(
      `margen sobre venta >= 100 % ⇒ precio infinito/negativo (bps: ${margenSobreVentaBps})`,
    );
  }
  return money(redondearHalfUp((costoCents * BPS_TOTAL) / (BPS_TOTAL - margenSobreVentaBps)));
}

/**
 * **Margen sobre venta** en bps: `(precio − costo) / precio`, redondeado half-up.
 * Es la métrica principal de la pantalla de precios ("de cada $100 que vendo,
 * cuánto me queda"). Puede dar negativo si se vende bajo costo (pérdida).
 *
 * Devuelve `null` si `precioCents <= 0`: el margen no está definido sin precio
 * (evita dividir por cero, mismo criterio que el resto de core).
 */
export function margenDesdePrecio(costoCents: Money, precioCents: Money): number | null {
  if (precioCents <= 0) return null;
  return redondearHalfUp(((precioCents - costoCents) * BPS_TOTAL) / precioCents);
}

/**
 * **Markup sobre costo** en bps: `(precio − costo) / costo`, redondeado half-up.
 * Dato secundario de la pantalla de precios (doc 03). Puede dar negativo (pérdida).
 *
 * Devuelve `null` si `costoCents <= 0`: el markup no está definido sin costo.
 */
export function markupDesdePrecio(costoCents: Money, precioCents: Money): number | null {
  if (costoCents <= 0) return null;
  return redondearHalfUp(((precioCents - costoCents) * BPS_TOTAL) / costoCents);
}

/**
 * Redondeo **comercial**: al múltiplo de `multiploCents` más cercano (half-up,
 * simétrico para negativos). Default `500` centésimos = **$5** (decidido con el
 * dueño, doc 04); configurable vía `configuracion.multiploRedondeoCents`.
 *
 * El doc no fija "más cercano" vs "hacia arriba"; se elige **más cercano** con
 * half-up (`$2,50` con múltiplo `$5` sube a `$5`; `$2,49` baja a `$0`), la regla de
 * redondeo consistente con el resto de core.
 *
 * @throws {RangeError} si `multiploCents` no es un entero > 0.
 */
export function redondearComercial(cents: Money, multiploCents: number = 500): Money {
  if (!Number.isInteger(multiploCents) || multiploCents <= 0) {
    throw new RangeError(`redondearComercial requiere un múltiplo entero > 0, recibió: ${multiploCents}`);
  }
  return money(redondearHalfUp(cents / multiploCents) * multiploCents);
}

/**
 * Precio sugerido para la UI: `precioDesdeMargen` seguido de `redondearComercial`.
 *
 * Ojo: al redondear comercialmente, el margen efectivo se corre un poco del
 * objetivo (el múltiplo de $5 es grueso en precios chicos); la alerta de margen
 * recalcula el margen real a partir del precio ya redondeado, no del objetivo.
 *
 * @throws {RangeError} si `margenSobreVentaBps >= 100 %` o `multiploCents <= 0`.
 */
export function precioSugerido(
  costoCents: Money,
  margenSobreVentaBps: number,
  multiploCents: number = 500,
): Money {
  return redondearComercial(precioDesdeMargen(costoCents, margenSobreVentaBps), multiploCents);
}
