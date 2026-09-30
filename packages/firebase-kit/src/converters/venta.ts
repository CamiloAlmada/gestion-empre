import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type Timestamp,
  type WithFieldValue,
} from 'firebase/firestore';
import {
  VERSION_COSTEO,
  money,
  peso,
  type CobroVenta,
  type CosteoItem,
  type EstadoVenta,
  type FuenteCosteo,
  type ItemVenta,
  type MedioPago,
  type MedioPagoReal,
  type OrigenCosteo,
  type Venta,
} from '@gestion/core';

/** Forma del mapa de costeo embebido tal como vive en Firestore (ver `CosteoItem`). */
interface CosteoItemDoc {
  v: number;
  fuente: FuenteCosteo;
  origen: OrigenCosteo;
  costoUnitCents?: number;
  costoItemCents?: number;
  compraId?: string;
}

/** Forma de un ítem embebido de venta tal como vive en Firestore (ver `ItemVenta`). */
interface ItemVentaDoc {
  productoId: string;
  nombreProducto: string;
  piezaId?: string;
  gramos?: number;
  unidades?: number;
  precioUnitCents: number;
  subtotalCents: number;
  costeo?: CosteoItemDoc;
}

/**
 * Forma del documento `ventas/{id}` tal como vive en Firestore: los mismos campos
 * que `Venta` salvo `id`, que sale de `snapshot.id`. `fecha` es `Timestamp` en
 * Firestore y `Date` en dominio. `items` va embebido (denormalizado).
 */
interface VentaDoc {
  numero: number;
  fecha: Timestamp;
  usuarioId: string;
  items: ItemVentaDoc[];
  totalCents: number;
  medioPago: MedioPago;
  estado: EstadoVenta;
  clienteId?: string;
  clienteNombre?: string;
  cobro?: CobroVentaDoc;
}

function costeoADoc(costeo: CosteoItem): CosteoItemDoc {
  const doc: CosteoItemDoc = { v: costeo.v, fuente: costeo.fuente, origen: costeo.origen };
  // Los montos NO van cuando no hay base de costo (`fuente: 'sin_costo'`):
  // persistir un 0 declararía 100 % de ganancia. Nunca `null`: ausentes.
  if (costeo.costoUnitCents !== undefined) doc.costoUnitCents = costeo.costoUnitCents;
  if (costeo.costoItemCents !== undefined) doc.costoItemCents = costeo.costoItemCents;
  if (costeo.compraId !== undefined) doc.compraId = costeo.compraId;
  return doc;
}

/**
 * Reconstruye el mapa de costeo. Devuelve `undefined` (⇒ `clasificarCosteo` dice
 * `'legado'`) cuando el ítem no lo trae o cuando trae una versión que esta build
 * no sabe interpretar: degradar a "no sé" es honesto y no rompe el historial;
 * inventar un monto, no.
 */
function costeoDeDoc(doc: CosteoItemDoc | undefined): CosteoItem | undefined {
  if (doc === undefined || doc.v !== VERSION_COSTEO) return undefined;
  return {
    v: VERSION_COSTEO,
    fuente: doc.fuente,
    origen: doc.origen,
    costoUnitCents: doc.costoUnitCents !== undefined ? money(doc.costoUnitCents) : undefined,
    costoItemCents: doc.costoItemCents !== undefined ? money(doc.costoItemCents) : undefined,
    compraId: doc.compraId,
  };
}

/** Forma de un pago embebido tal como vive en Firestore (ver `PagoVenta`). */
interface PagoVentaDoc {
  id: string;
  fecha: Timestamp;
  registradoEn: Timestamp;
  montoCents: number;
  medioPago: MedioPagoReal;
  usuarioId: string;
  referencia?: string;
  cuentaId?: string;
  cuentaEtiqueta?: string;
}

/** Forma del mapa `cobro` tal como vive en Firestore (ver `CobroVenta`). */
interface CobroVentaDoc {
  v: number;
  estado: CobroVenta['estado'];
  cobradoCents: number;
  pagos: PagoVentaDoc[];
}

/**
 * Serializa el mapa `cobro` para Firestore. Las fechas quedan como `Date` (el SDK
 * las convierte a `Timestamp`); los opcionales `undefined` se OMITEN, nunca
 * `null`. Lo usan el converter (create de la venta) y las escrituras de
 * `cobros.ts`, que hacen `updateDoc` y por eso no pasan por el converter.
 *
 * **Precisión de los timestamps:** las reglas comparan los pagos anteriores POR
 * VALOR, y el cliente los reenvía tal como los leyó este converter, es decir
 * como `Date` (milisegundos). Por eso los pagos solo los escribe este kit, desde
 * el cliente, con precisión de milisegundos. Un script que escribiera un pago
 * con microsegundos (Admin SDK, `Timestamp` de servidor) haría rechazar por
 * reglas el pago SIGUIENTE de esa venta: `Timestamp.toDate()` trunca y el
 * prefijo deja de ser igual (verificado contra el emulador en el spike A2).
 */
export function cobroADoc(cobro: CobroVenta): DocumentData {
  return {
    v: cobro.v,
    estado: cobro.estado,
    cobradoCents: cobro.cobradoCents,
    pagos: cobro.pagos.map((pago) => {
      const doc: DocumentData = {
        id: pago.id,
        fecha: pago.fecha,
        registradoEn: pago.registradoEn,
        montoCents: pago.montoCents,
        medioPago: pago.medioPago,
        usuarioId: pago.usuarioId,
      };
      if (pago.referencia !== undefined) doc.referencia = pago.referencia;
      if (pago.cuentaId !== undefined) doc.cuentaId = pago.cuentaId;
      if (pago.cuentaEtiqueta !== undefined) doc.cuentaEtiqueta = pago.cuentaEtiqueta;
      return doc;
    }),
  };
}

/**
 * Reconstruye el mapa `cobro`. Ausente ⇒ `undefined` (venta cobrada en el acto o
 * anterior a los cobros diferidos). A diferencia de `costeo`, una versión
 * desconocida NO se degrada a `undefined`: para `estadoCobro` eso significaría
 * "cobrada", y mostrar como saldada una deuda es peor que no poder leerla.
 *
 * @throws {RangeError} si `v !== 1`, o si un monto no es entero (vía `money()`).
 */
function cobroDeDoc(doc: CobroVentaDoc | undefined): CobroVenta | undefined {
  if (doc === undefined) return undefined;
  if (doc.v !== 1) {
    throw new RangeError(`ventaConverter: versión de cobro desconocida (v = ${String(doc.v)})`);
  }
  return {
    v: 1,
    estado: doc.estado,
    cobradoCents: money(doc.cobradoCents),
    pagos: doc.pagos.map((pago) => ({
      id: pago.id,
      fecha: pago.fecha.toDate(),
      registradoEn: pago.registradoEn.toDate(),
      montoCents: money(pago.montoCents),
      medioPago: pago.medioPago,
      usuarioId: pago.usuarioId,
      referencia: pago.referencia,
      cuentaId: pago.cuentaId,
      cuentaEtiqueta: pago.cuentaEtiqueta,
    })),
  };
}

function itemADoc(item: ItemVenta): ItemVentaDoc {
  const { productoId, nombreProducto, piezaId, gramos, unidades, precioUnitCents, subtotalCents } =
    item;
  const doc: ItemVentaDoc = {
    productoId,
    nombreProducto,
    precioUnitCents,
    subtotalCents,
  };
  if (piezaId !== undefined) doc.piezaId = piezaId;
  if (gramos !== undefined) doc.gramos = gramos;
  if (unidades !== undefined) doc.unidades = unidades;
  if (item.costeo !== undefined) doc.costeo = costeoADoc(item.costeo);
  return doc;
}

function itemDeDoc(doc: ItemVentaDoc): ItemVenta {
  return {
    productoId: doc.productoId,
    nombreProducto: doc.nombreProducto,
    piezaId: doc.piezaId,
    gramos: doc.gramos !== undefined ? peso(doc.gramos) : undefined,
    unidades: doc.unidades,
    precioUnitCents: money(doc.precioUnitCents),
    subtotalCents: money(doc.subtotalCents),
    costeo: costeoDeDoc(doc.costeo),
  };
}

/**
 * Mapea documentos `ventas/{id}` ↔ el tipo de dominio `Venta`, siguiendo el
 * patrón de `usuarioConverter`.
 *
 * - `id` sale de `snapshot.id`, nunca se persiste como campo.
 * - `totalCents` y los montos/pesos de cada ítem embebido se reconstruyen con
 *   `money()`/`peso()`: un doc corrupto con float explota al leer.
 * - `items` es un array embebido (denormalizado, ver doc 02): cada ítem se mapea
 *   con el mismo cuidado que las entidades top-level. `piezaId`/`gramos`/
 *   `unidades` ausentes en Firestore ↔ `undefined` en dominio; `gramos` y
 *   `unidades` son excluyentes según el producto (al peso o por unidad).
 * - `clienteId`/`clienteNombre` (doc 07) son opcionales: la venta anónima no los
 *   trae. Ausentes en Firestore ↔ `undefined` en dominio; si están `undefined`
 *   al escribir, se omiten del doc (nunca `null`).
 * - `items[].costeo` (Fase 3) es opcional y versionado: las ventas escritas antes
 *   del congelado NO lo traen y deben seguir leyéndose sin error — su ausencia es
 *   la "versión 0". Este converter, junto con `clasificarCosteo` de core, es el
 *   ÚNICO lugar autorizado a preguntar si el mapa existe.
 * - `cobro` (doc 11) es opcional y versionado: solo lo llevan las ventas
 *   `a_cobrar`. Ausente en Firestore ↔ `undefined` en dominio (las ventas viejas
 *   se leen igual); `undefined` al escribir ⇒ se omite. `fecha`/`registradoEn` de
 *   cada pago: `Timestamp` ↔ `Date`. Una versión desconocida LANZA (ver
 *   `cobroDeDoc`), y la precisión de milisegundos de los pagos es un contrato con
 *   las reglas (ver `cobroADoc`).
 */
export const ventaConverter: FirestoreDataConverter<Venta> = {
  toFirestore(venta: WithFieldValue<Venta>): DocumentData {
    const {
      numero,
      fecha,
      usuarioId,
      items,
      totalCents,
      medioPago,
      estado,
      clienteId,
      clienteNombre,
      cobro,
    } = venta;
    const doc: DocumentData = {
      numero,
      fecha,
      usuarioId,
      items: (items as ItemVenta[]).map(itemADoc),
      totalCents,
      medioPago,
      estado,
    };
    if (clienteId !== undefined) doc.clienteId = clienteId;
    if (clienteNombre !== undefined) doc.clienteNombre = clienteNombre;
    if (cobro !== undefined) doc.cobro = cobroADoc(cobro as CobroVenta);
    return doc;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Venta {
    const datos = snapshot.data(options) as VentaDoc;
    return {
      id: snapshot.id,
      numero: datos.numero,
      fecha: datos.fecha.toDate(),
      usuarioId: datos.usuarioId,
      items: datos.items.map(itemDeDoc),
      totalCents: money(datos.totalCents),
      medioPago: datos.medioPago,
      estado: datos.estado,
      clienteId: datos.clienteId,
      clienteNombre: datos.clienteNombre,
      cobro: cobroDeDoc(datos.cobro),
    };
  },
};
