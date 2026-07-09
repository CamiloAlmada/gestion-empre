import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type Timestamp,
  type WithFieldValue,
} from 'firebase/firestore';
import {
  money,
  peso,
  type EstadoVenta,
  type ItemVenta,
  type MedioPago,
  type Venta,
} from '@gestion/core';

/** Forma de un ítem embebido de venta tal como vive en Firestore (ver `ItemVenta`). */
interface ItemVentaDoc {
  productoId: string;
  nombreProducto: string;
  piezaId?: string;
  gramos?: number;
  unidades?: number;
  precioUnitCents: number;
  subtotalCents: number;
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
