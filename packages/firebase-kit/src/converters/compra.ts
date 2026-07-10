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
  type Compra,
  type ConceptoGasto,
  type EstadoCompra,
  type GastoCompra,
  type ItemCompra,
  type PiezaCompra,
} from '@gestion/core';

/** Detalle de pieza tal como vive embebido en un ítem de compra en Firestore. */
interface PiezaCompraDoc {
  pesoGramos: number;
  fechaVencimiento?: Timestamp;
}

/** Ítem de compra embebido tal como vive en Firestore (ver `ItemCompra`). */
interface ItemCompraDoc {
  productoId: string;
  nombreProducto: string;
  gramos?: number;
  unidades?: number;
  piezas?: PiezaCompraDoc[];
  costoFacturaCents: number;
  gastoProrrateadoCents?: number;
  costoRealCents?: number;
  costoRealKgCents?: number;
}

/** Gasto de viaje embebido tal como vive en Firestore (ver `GastoCompra`). */
interface GastoCompraDoc {
  concepto: ConceptoGasto;
  descripcion?: string;
  montoCents: number;
}

/**
 * Forma del documento `compras/{id}` tal como vive en Firestore: los mismos campos
 * que `Compra` salvo `id`, que sale de `snapshot.id`. `fecha` es `Timestamp` en
 * Firestore y `Date` en dominio. `items` y `gastos` van embebidos (denormalizado).
 */
interface CompraDoc {
  fecha: Timestamp;
  usuarioId: string;
  estado: EstadoCompra;
  proveedorId?: string;
  proveedorNombre: string;
  items: ItemCompraDoc[];
  gastos: GastoCompraDoc[];
  totalFacturaCents: number;
  totalGastosCents: number;
  totalRealCents: number;
}

// Las funciones `*ADoc` devuelven `DocumentData` (loose): Firestore convierte los
// `Date` a `Timestamp` al persistir, y así se omiten los opcionales `undefined`
// sin castear tipos (mismo criterio que `piezaConverter`/`movimientoConverter`).
function piezaADoc(pz: PiezaCompra): DocumentData {
  const doc: DocumentData = { pesoGramos: pz.pesoGramos };
  if (pz.fechaVencimiento !== undefined) doc.fechaVencimiento = pz.fechaVencimiento;
  return doc;
}

function piezaDeDoc(doc: PiezaCompraDoc): PiezaCompra {
  return {
    pesoGramos: peso(doc.pesoGramos),
    fechaVencimiento: doc.fechaVencimiento?.toDate(),
  };
}

function itemADoc(item: ItemCompra): DocumentData {
  const doc: DocumentData = {
    productoId: item.productoId,
    nombreProducto: item.nombreProducto,
    costoFacturaCents: item.costoFacturaCents,
  };
  if (item.gramos !== undefined) doc.gramos = item.gramos;
  if (item.unidades !== undefined) doc.unidades = item.unidades;
  if (item.piezas !== undefined) doc.piezas = item.piezas.map(piezaADoc);
  if (item.gastoProrrateadoCents !== undefined) doc.gastoProrrateadoCents = item.gastoProrrateadoCents;
  if (item.costoRealCents !== undefined) doc.costoRealCents = item.costoRealCents;
  if (item.costoRealKgCents !== undefined) doc.costoRealKgCents = item.costoRealKgCents;
  return doc;
}

function itemDeDoc(doc: ItemCompraDoc): ItemCompra {
  return {
    productoId: doc.productoId,
    nombreProducto: doc.nombreProducto,
    gramos: doc.gramos !== undefined ? peso(doc.gramos) : undefined,
    unidades: doc.unidades,
    piezas: doc.piezas?.map(piezaDeDoc),
    costoFacturaCents: money(doc.costoFacturaCents),
    gastoProrrateadoCents:
      doc.gastoProrrateadoCents !== undefined ? money(doc.gastoProrrateadoCents) : undefined,
    costoRealCents: doc.costoRealCents !== undefined ? money(doc.costoRealCents) : undefined,
    costoRealKgCents: doc.costoRealKgCents !== undefined ? money(doc.costoRealKgCents) : undefined,
  };
}

function gastoADoc(gasto: GastoCompra): DocumentData {
  const doc: DocumentData = { concepto: gasto.concepto, montoCents: gasto.montoCents };
  if (gasto.descripcion !== undefined) doc.descripcion = gasto.descripcion;
  return doc;
}

function gastoDeDoc(doc: GastoCompraDoc): GastoCompra {
  return {
    concepto: doc.concepto,
    descripcion: doc.descripcion,
    montoCents: money(doc.montoCents),
  };
}

/**
 * Mapea documentos `compras/{id}` ↔ el tipo de dominio `Compra` (doc 03),
 * siguiendo el patrón de `ventaConverter`.
 *
 * - `id` sale de `snapshot.id`, nunca se persiste como campo.
 * - Todos los montos (`totales`, `costo*`, `montoCents`) se reconstruyen con
 *   `money()` y los pesos con `peso()`: un doc corrupto con float explota al leer.
 * - `items` y `gastos` van embebidos (denormalizado). Los campos calculados de
 *   cada ítem (`gastoProrrateadoCents`, `costoRealCents`, `costoRealKgCents`) están
 *   ausentes en un borrador y presentes tras confirmar; ausentes en Firestore ↔
 *   `undefined` en dominio y, al escribir, si están `undefined` se omiten (nunca
 *   `null`). `piezas`/`unidades`/`gramos` siguen el mismo criterio.
 * - `proveedorId` (opcional, doc 07) y `descripcion`/`fechaVencimiento` opcionales
 *   se omiten del doc cuando no vienen.
 */
export const compraConverter: FirestoreDataConverter<Compra> = {
  toFirestore(compra: WithFieldValue<Compra>): DocumentData {
    const {
      fecha,
      usuarioId,
      estado,
      proveedorId,
      proveedorNombre,
      items,
      gastos,
      totalFacturaCents,
      totalGastosCents,
      totalRealCents,
    } = compra;
    const doc: DocumentData = {
      fecha,
      usuarioId,
      estado,
      proveedorNombre,
      items: (items as ItemCompra[]).map(itemADoc),
      gastos: (gastos as GastoCompra[]).map(gastoADoc),
      totalFacturaCents,
      totalGastosCents,
      totalRealCents,
    };
    if (proveedorId !== undefined) doc.proveedorId = proveedorId;
    return doc;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Compra {
    const datos = snapshot.data(options) as CompraDoc;
    return {
      id: snapshot.id,
      fecha: datos.fecha.toDate(),
      usuarioId: datos.usuarioId,
      estado: datos.estado,
      proveedorId: datos.proveedorId,
      proveedorNombre: datos.proveedorNombre,
      items: datos.items.map(itemDeDoc),
      gastos: datos.gastos.map(gastoDeDoc),
      totalFacturaCents: money(datos.totalFacturaCents),
      totalGastosCents: money(datos.totalGastosCents),
      totalRealCents: money(datos.totalRealCents),
    };
  },
};
