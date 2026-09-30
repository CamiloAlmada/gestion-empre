import { collection, doc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import {
  aplicarPago,
  deshacerUltimoPago as deshacerUltimoPagoCore,
  saldoPendienteCents,
  type CobroVenta,
  type MedioPagoReal,
  type Money,
  type PagoVenta,
  type Venta,
} from '@gestion/core';
import { cobroADoc } from './converters/venta';
import { CobroInvalidoError } from './errores';

/**
 * Escrituras de cobros diferidos (docs/11-cobros-diferidos.md, tarea A3).
 *
 * - **Sin lecturas.** Cada función recibe la venta que el caller ya tiene en
 *   memoria (su suscripción) y calcula el `cobro` nuevo con las funciones puras
 *   de core. Camino offline-first (doc 06 §8).
 * - **El update lleva exactamente `{ cobro }`.** Es lo único que las reglas
 *   dejan cambiar (`soloCambian(['cobro'])`), y el mapa se reescribe entero: las
 *   reglas verifican que los pagos anteriores lleguen intactos.
 * - **Contrato: validación síncrona + promesa del commit.** Las funciones NO son
 *   `async`: toda validación (venta no cobrable, sobrepago, topes) lanza de forma
 *   SÍNCRONA, antes de escribir nada; si pasa, devuelven la promesa del commit
 *   SIN esperarla. Esa promesa resuelve con el ack del servidor, que sin
 *   conexión (o bajo captive portal) no llega: el caller dispara, cierra el
 *   modal y le cuelga a la promesa los avisos de éxito y de fallo, siempre con
 *   un `.catch` (un rechazo sin manejar es un unhandled rejection). Es el mismo
 *   patrón híbrido de doc 06 §8; no hace falta el contrato en dos fases de
 *   `proveedores.ts` porque acá no hay lectura previa ni id que devolver.
 * - **Precisión de los timestamps.** Los pagos anteriores se reenvían tal como
 *   los leyó `ventaConverter` (`Date`, milisegundos) y las reglas los comparan
 *   por valor. Solo este kit escribe pagos, desde el cliente, con precisión de
 *   milisegundos; un pago escrito con microsegundos por otro medio haría
 *   rechazar el pago siguiente (ver `cobroADoc`).
 */

/** Tope de pagos por venta. Espeja `pagos.size() <= 20` de `firestore.rules`. */
export const MAX_PAGOS_POR_VENTA = 20;
/** Tope de largo de `PagoVenta.referencia`. Espeja `firestore.rules`. */
export const LARGO_MAX_REFERENCIA_PAGO = 60;
/** Tope de largo de `PagoVenta.cuentaId`. Espeja `firestore.rules`. */
export const LARGO_MAX_CUENTA_ID_PAGO = 40;
/** Tope de largo de `PagoVenta.cuentaEtiqueta`. Espeja `firestore.rules`. */
export const LARGO_MAX_CUENTA_ETIQUETA_PAGO = 60;

/** Datos de un pago que carga el admin; el kit agrega `id` y `registradoEn`. */
export interface DatosRegistroPago {
  montoCents: Money;
  medioPago: MedioPagoReal;
  /** Fecha y hora del pago (la del comprobante). */
  fecha: Date;
  /** Número de operación. Vacío tras `trim()` ⇒ se omite. */
  referencia?: string;
  cuentaId?: string;
  cuentaEtiqueta?: string;
  /** Uid de quien registra (las reglas exigen que sea `request.auth.uid`). */
  usuarioId: string;
}

/** Datos comunes a un pago de varias ventas: el monto de cada una es su saldo. */
export type DatosPagoComunes = Omit<DatosRegistroPago, 'montoCents'>;

/**
 * Registra un pago contra una venta a cobrar: update de exactamente `{ cobro }`,
 * con el cobro calculado por `aplicarPago` desde `venta` (en memoria).
 *
 * Contrato (ver el doc del módulo): valida y lanza de forma síncrona; si pasa,
 * devuelve la promesa del commit sin esperarla. El caller NUNCA espera esa
 * promesa para cerrar el modal y SIEMPRE le encadena un `.catch`.
 *
 * Precisión: el pago nuevo se escribe con `Date` (milisegundos) y los anteriores
 * se reenvían como los leyó el converter. Un pago escrito con microsegundos por
 * fuera de este kit haría que las reglas rechacen este update (ver `cobroADoc`).
 *
 * @throws {CobroInvalidoError} si la venta no está `completada`, no tiene
 *   `cobro`, ya tiene `MAX_PAGOS_POR_VENTA` pagos, o un texto excede su tope.
 * @throws {RangeError} (de `aplicarPago`) si el monto es ≤ 0 o si lo cobrado
 *   superaría el total. En todos los casos no se escribe nada.
 */
export function registrarPago(
  db: Firestore,
  venta: Venta,
  datos: DatosRegistroPago,
): Promise<void> {
  const cobro = cobroConPago(db, venta, datos, new Date());
  return updateDoc(doc(db, 'ventas', venta.id), { cobro: cobroADoc(cobro) });
}

/**
 * Registra UN pago que salda varias ventas a la vez (una transferencia que paga
 * varios pedidos): un solo `writeBatch` con un update de `{ cobro }` por venta.
 * Cada venta recibe como monto SU saldo (`saldoPendienteCents`), con la misma
 * fecha, medio, referencia y cuenta. Lo usa la lista "Por cobrar" (Fase B).
 *
 * Mismo contrato que `registrarPago`: se validan TODAS las ventas antes de
 * armar el batch (si una falla, no se escribe ninguna) y se devuelve la promesa
 * del commit sin esperarla.
 *
 * @throws {CobroInvalidoError} si la lista está vacía, repite una venta, o
 *   alguna venta no es cobrable (ver `registrarPago`).
 * @throws {RangeError} (de `aplicarPago`) si alguna venta no tiene saldo.
 */
export function registrarPagos(
  db: Firestore,
  ventas: readonly Venta[],
  datos: DatosPagoComunes,
): Promise<void> {
  if (ventas.length === 0) {
    throw new CobroInvalidoError('No hay ventas para registrar el pago.');
  }
  if (new Set(ventas.map((v) => v.id)).size !== ventas.length) {
    throw new CobroInvalidoError('La misma venta aparece dos veces en el pago.');
  }
  const registradoEn = new Date();
  const updates = ventas.map((venta) => ({
    ventaId: venta.id,
    cobro: cobroConPago(db, venta, { ...datos, montoCents: saldoPendienteCents(venta) }, registradoEn),
  }));

  const batch = writeBatch(db);
  for (const { ventaId, cobro } of updates) {
    batch.update(doc(db, 'ventas', ventaId), { cobro: cobroADoc(cobro) });
  }
  return batch.commit();
}

/**
 * Deshace el último pago de una venta (caso "lo cargué mal"): update de
 * exactamente `{ cobro }` con `deshacerUltimoPago` de core. Mismo contrato que
 * `registrarPago`.
 *
 * @throws {CobroInvalidoError} si la venta no está `completada` o no tiene `cobro`.
 * @throws {RangeError} (de core) si la venta no tiene pagos.
 */
export function deshacerUltimoPago(db: Firestore, venta: Venta): Promise<void> {
  const cobro = deshacerUltimoPagoCore(exigirCobro(venta), venta.totalCents);
  return updateDoc(doc(db, 'ventas', venta.id), { cobro: cobroADoc(cobro) });
}

// ── Internos ────────────────────────────────────────────────────────────────

function exigirCobro(venta: Venta): CobroVenta {
  if (venta.estado !== 'completada') {
    throw new CobroInvalidoError(
      `Solo se cobran ventas 'completada'; la venta ${venta.id} está '${venta.estado}'.`,
    );
  }
  if (venta.cobro === undefined) {
    throw new CobroInvalidoError(`La venta ${venta.id} no es una venta a cobrar.`);
  }
  return venta.cobro;
}

function textoOpcional(valor: string | undefined, campo: string, tope: number): string | undefined {
  const texto = valor?.trim();
  if (texto === undefined || texto === '') return undefined;
  if (texto.length > tope) {
    throw new CobroInvalidoError(`${campo} admite hasta ${tope} caracteres.`);
  }
  return texto;
}

/** Arma el pago (con `id` y `registradoEn`) y lo aplica al cobro de la venta. */
function cobroConPago(
  db: Firestore,
  venta: Venta,
  datos: DatosRegistroPago,
  registradoEn: Date,
): CobroVenta {
  const cobro = exigirCobro(venta);
  if (cobro.pagos.length >= MAX_PAGOS_POR_VENTA) {
    throw new CobroInvalidoError(
      `La venta ${venta.id} ya tiene ${MAX_PAGOS_POR_VENTA} pagos, el máximo permitido.`,
    );
  }
  const pago: PagoVenta = {
    // AutoId del SDK (20 caracteres, sin red): solo genera el id, no se escribe
    // ningún documento en esa ruta.
    id: doc(collection(db, 'ventas')).id,
    fecha: datos.fecha,
    registradoEn,
    montoCents: datos.montoCents,
    medioPago: datos.medioPago,
    usuarioId: datos.usuarioId,
    referencia: textoOpcional(datos.referencia, 'La referencia', LARGO_MAX_REFERENCIA_PAGO),
    cuentaId: textoOpcional(datos.cuentaId, 'El id de la cuenta', LARGO_MAX_CUENTA_ID_PAGO),
    cuentaEtiqueta: textoOpcional(
      datos.cuentaEtiqueta,
      'La etiqueta de la cuenta',
      LARGO_MAX_CUENTA_ETIQUETA_PAGO,
    ),
  };
  return aplicarPago(cobro, pago, venta.totalCents);
}
