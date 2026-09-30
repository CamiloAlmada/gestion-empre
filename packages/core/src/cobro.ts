import { money, sumarMoney, type Money } from './money.js';
import type { CobroVenta, PagoVenta, Venta } from './tipos.js';

/**
 * Cobros diferidos: lógica pura sobre `CobroVenta` (ver `docs/11-cobros-diferidos.md`).
 *
 * Dos responsabilidades, las dos puras (regla de oro 1):
 *
 * 1. **`cobroInicial` / `aplicarPago` / `deshacerUltimoPago`** — producen el valor
 *    del mapa `cobro`. Mantienen coherentes `pagos`, `cobradoCents` y `estado`, así
 *    que nadie más los recalcula.
 * 2. **`estadoCobro` / `saldoPendienteCents`** — la ÚNICA puerta de lectura de
 *    `venta.cobro` y de `medioPago === 'a_cobrar'` (misma disciplina que
 *    `clasificarCosteo`). Historial, Reportes y la ficha del cliente las consumen y
 *    nunca vuelven a escribir `if (venta.cobro === undefined)`.
 */

/** Estado de cobro de una venta, tal como lo muestran las pantallas. */
export type EstadoCobro = 'cobrada' | 'pendiente' | 'parcial' | 'anulada';

/** Valor inicial del mapa `cobro` de una venta que nace `a_cobrar`. */
export function cobroInicial(): CobroVenta {
  return { v: 1, estado: 'pendiente', cobradoCents: money(0), pagos: [] };
}

/** Resta de montos con la aritmética de `Money` (validada como entero). */
function restar(a: Money, b: Money): Money {
  return sumarMoney(a, money(-b));
}

function estadoSegunCobrado(cobradoCents: Money, totalCents: Money): CobroVenta['estado'] {
  return cobradoCents === totalCents ? 'cobrada' : 'pendiente';
}

/**
 * Agrega un pago al final de la lista, suma lo cobrado y recalcula el estado
 * (`'cobrada'` si lo cobrado iguala el total). No muta el `cobro` recibido.
 *
 * @throws {RangeError} si `pago.montoCents <= 0`, o si lo cobrado superaría
 *   `totalCents` (sobrepago).
 */
export function aplicarPago(cobro: CobroVenta, pago: PagoVenta, totalCents: Money): CobroVenta {
  if (pago.montoCents <= 0) {
    throw new RangeError(`aplicarPago() requiere un monto mayor a 0, recibió: ${pago.montoCents}`);
  }
  const cobradoCents = sumarMoney(cobro.cobradoCents, pago.montoCents);
  if (cobradoCents > totalCents) {
    throw new RangeError(
      `aplicarPago(): el cobrado (${cobradoCents}) superaría el total de la venta (${totalCents})`,
    );
  }
  return {
    ...cobro,
    estado: estadoSegunCobrado(cobradoCents, totalCents),
    cobradoCents,
    pagos: [...cobro.pagos, pago],
  };
}

/**
 * Quita el último pago (caso "lo cargué mal"), resta su monto y recalcula el
 * estado. No muta el `cobro` recibido.
 *
 * @throws {RangeError} si no hay pagos para deshacer.
 */
export function deshacerUltimoPago(cobro: CobroVenta, totalCents: Money): CobroVenta {
  const ultimo = cobro.pagos[cobro.pagos.length - 1];
  if (ultimo === undefined) {
    throw new RangeError('deshacerUltimoPago() no puede deshacer: la venta no tiene pagos');
  }
  const cobradoCents = restar(cobro.cobradoCents, ultimo.montoCents);
  return {
    ...cobro,
    estado: estadoSegunCobrado(cobradoCents, totalCents),
    cobradoCents,
    pagos: cobro.pagos.slice(0, -1),
  };
}

/**
 * Lo que falta cobrar de una venta. `0` si no tiene `cobro` (se cobró en el acto
 * o es anterior a esta capacidad) y `0` si está anulada: una venta anulada no se
 * cobra, aunque tenga pagos cargados.
 */
export function saldoPendienteCents(venta: Pick<Venta, 'estado' | 'totalCents' | 'cobro'>): Money {
  if (venta.estado === 'anulada' || venta.cobro === undefined) return money(0);
  return restar(venta.totalCents, venta.cobro.cobradoCents);
}

/**
 * Estado de cobro de una venta. Es la ÚNICA función autorizada a interpretar
 * `venta.cobro` y `medioPago === 'a_cobrar'`.
 *
 * - `anulada`: gana sobre todo lo demás (aunque tenga pagos o sea `a_cobrar`).
 * - sin `cobro` ⇒ `cobrada` (cobrada en el mostrador, o venta anterior).
 * - `cobro.estado === 'cobrada'` ⇒ `cobrada`.
 * - pendiente con algo cobrado ⇒ `parcial`; sin nada cobrado ⇒ `pendiente`.
 */
export function estadoCobro(venta: Pick<Venta, 'estado' | 'cobro'>): EstadoCobro {
  if (venta.estado === 'anulada') return 'anulada';
  const cobro = venta.cobro;
  if (cobro === undefined || cobro.estado === 'cobrada') return 'cobrada';
  return cobro.cobradoCents > 0 ? 'parcial' : 'pendiente';
}
