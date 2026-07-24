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
  type CosteoItem,
  type EstadoVenta,
  type FuenteCosteo,
  type ItemVenta,
  type MedioPago,
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
 */
export const ventaConverter: FirestoreDataConverter<Venta> = {
  toFirestore(venta: WithFieldValue<Venta>): DocumentData {
    const { numero, fecha, usuarioId, items, totalCents, medioPago, estado, clienteId, clienteNombre } =
      venta;
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
    };
  },
};
