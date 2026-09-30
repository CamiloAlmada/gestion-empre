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

/**
 * Pagos registrados contra una venta, en el orden en que se cargaron. Lista vacía
 * si no tiene `cobro` (se cobró en el acto o es anterior a esta capacidad).
 * Puerta de lectura de `venta.cobro.pagos`: las pantallas no acceden al mapa.
 */
export function pagosDe(venta: Pick<Venta, 'cobro'>): readonly PagoVenta[] {
  return venta.cobro?.pagos ?? [];
}

/**
 * Lo ya cobrado mediante pagos registrados. `0` si no tiene `cobro`: una venta
 * cobrada en el mostrador no tiene "pagos" que registrar, así que da 0 (no su
 * total). No mira el estado de la venta: una anulada conserva lo que se había
 * cobrado, que es lo que hay que avisar antes de anularla.
 */
export function cobradoCents(venta: Pick<Venta, 'cobro'>): Money {
  return venta.cobro?.cobradoCents ?? money(0);
}

/**
 * Deuda total de un conjunto de ventas: suma de `saldoPendienteCents`. Las
 * cobradas, las anuladas y las sin `cobro` aportan 0.
 */
export function deudaTotalCents(
  ventas: readonly Pick<Venta, 'estado' | 'totalCents' | 'cobro'>[],
): Money {
  return ventas.reduce((acumulado, v) => sumarMoney(acumulado, saldoPendienteCents(v)), money(0));
}

/** Deuda de un cliente, agregada sobre sus ventas con saldo pendiente. */
export interface DeudaCliente {
  clienteId: string;
  /** Nombre denormalizado de la venta más reciente del cliente que lo tenga. */
  clienteNombre: string;
  /** Suma de `saldoPendienteCents` de sus ventas. */
  deudaCents: Money;
  /** Cantidad de ventas con saldo > 0. */
  cantidadVentas: number;
  /** Fecha de la venta pendiente más vieja. */
  fechaMasAntigua: Date;
  /** Días calendario (hora local) entre `fechaMasAntigua` y `ahora`. */
  diasDeuda: number;
}

/**
 * Días calendario enteros entre dos instantes, contados en hora LOCAL: una venta
 * de ayer a las 23:00 mirada hoy a las 08:00 lleva 1 día (no 0, como daría
 * `floor(ms / 24h)`). Se compara por fecha (año-mes-día local) llevada a UTC para
 * que el cambio de horario de verano no corra el resultado. Nunca negativo: una
 * fecha futura (desfasaje de reloj) da 0. Es un criterio distinto del de
 * `clasificarInactividad` (que usa 24 h transcurridas), a propósito: acá el dueño
 * piensa "me debe desde el martes", no "hace 47 horas".
 */
function diasCalendarioLocal(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Agrupa por cliente la deuda de un conjunto de ventas. Cuentan solo las ventas
 * con `saldoPendienteCents > 0` (quedan fuera anuladas, cobradas y las del
 * mostrador) y con `clienteId`; las que no lo tienen se ignoran.
 *
 * Orden: `diasDeuda` descendente (el que debe hace más, primero), desempate por
 * `deudaCents` descendente y, al final, por `clienteNombre`.
 */
export function agruparDeudaPorCliente(ventas: readonly Venta[], ahora: Date): DeudaCliente[] {
  interface Acumulado {
    deudaCents: Money;
    cantidadVentas: number;
    fechaMasAntigua: Date;
    nombre: { fecha: Date; valor: string } | null;
  }
  const porCliente = new Map<string, Acumulado>();

  // Primero el nombre (de cualquier venta del cliente) y después la deuda.
  for (const v of ventas) {
    if (v.clienteId === undefined) continue;
    const saldo = saldoPendienteCents(v);
    const previo = porCliente.get(v.clienteId);
    const acc: Acumulado = previo ?? {
      deudaCents: money(0),
      cantidadVentas: 0,
      fechaMasAntigua: v.fecha,
      nombre: null,
    };
    if (v.clienteNombre !== undefined && v.clienteNombre !== '') {
      if (acc.nombre === null || v.fecha.getTime() > acc.nombre.fecha.getTime()) {
        acc.nombre = { fecha: v.fecha, valor: v.clienteNombre };
      }
    }
    if (saldo > 0) {
      acc.deudaCents = sumarMoney(acc.deudaCents, saldo);
      acc.cantidadVentas += 1;
      if (acc.cantidadVentas === 1 || v.fecha.getTime() < acc.fechaMasAntigua.getTime()) {
        acc.fechaMasAntigua = v.fecha;
      }
    }
    porCliente.set(v.clienteId, acc);
  }

  const resultado: DeudaCliente[] = [];
  for (const [clienteId, acc] of porCliente) {
    if (acc.cantidadVentas === 0) continue;
    resultado.push({
      clienteId,
      clienteNombre: acc.nombre?.valor ?? '',
      deudaCents: acc.deudaCents,
      cantidadVentas: acc.cantidadVentas,
      fechaMasAntigua: acc.fechaMasAntigua,
      diasDeuda: diasCalendarioLocal(acc.fechaMasAntigua, ahora),
    });
  }
  return resultado.sort(
    (x, y) =>
      y.diasDeuda - x.diasDeuda ||
      y.deudaCents - x.deudaCents ||
      x.clienteNombre.localeCompare(y.clienteNombre, 'es'),
  );
}
