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
  type FuenteCosteo,
  type MovimientoStock,
  type OrigenCosteo,
  type TipoMovimiento,
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

/**
 * Forma del documento `movimientos/{id}` tal como vive en Firestore: los mismos
 * campos que `MovimientoStock` salvo `id`, que sale de `snapshot.id`. `fecha` es
 * `Timestamp` en Firestore y `Date` en dominio.
 */
interface MovimientoDoc {
  tipo: TipoMovimiento;
  productoId: string;
  piezaId?: string;
  deltaGramos?: number;
  deltaUnidades?: number;
  origenTipo: 'venta' | 'compra' | 'ajuste';
  origenId: string;
  usuarioId: string;
  fecha: Timestamp;
  nota?: string;
  costeo?: CosteoItemDoc;
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
 * `'legado'`) cuando el movimiento no lo trae o cuando trae una versión que esta
 * build no sabe interpretar: degradar a "no sé" es honesto y no rompe el
 * historial; inventar un monto, no.
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

/**
 * Mapea documentos `movimientos/{id}` ↔ el tipo de dominio `MovimientoStock`,
 * siguiendo el patrón de `usuarioConverter`.
 *
 * - `id` sale de `snapshot.id`, nunca se persiste como campo.
 * - `deltaGramos` se reconstruye con `peso()` cuando está presente (puede ser
 *   negativo: descuenta stock). Un doc corrupto con float explota al leer.
 * - `piezaId` / `deltaGramos` / `deltaUnidades` / `nota` ausentes en Firestore
 *   ↔ `undefined` en dominio; al escribir, si están `undefined` se omiten
 *   (nunca `null`). `movimientos` es colección de solo-alta (auditoría
 *   inmutable), pero el converter igual soporta `toFirestore` para el `create`.
 * - `costeo` (tarea A1b) es opcional y versionado, igual que `ItemVenta.costeo`:
 *   los movimientos escritos antes del congelado NO lo traen y deben seguir
 *   leyéndose sin error — su ausencia es la "versión 0". Este converter, junto
 *   con `clasificarCosteo` de core, es el ÚNICO lugar autorizado a preguntar si
 *   el mapa existe.
 */
export const movimientoConverter: FirestoreDataConverter<MovimientoStock> = {
  toFirestore(movimiento: WithFieldValue<MovimientoStock>): DocumentData {
    const {
      tipo,
      productoId,
      piezaId,
      deltaGramos,
      deltaUnidades,
      origenTipo,
      origenId,
      usuarioId,
      fecha,
      nota,
      costeo,
    } = movimiento;
    const doc: DocumentData = {
      tipo,
      productoId,
      origenTipo,
      origenId,
      usuarioId,
      fecha,
    };
    if (piezaId !== undefined) doc.piezaId = piezaId;
    if (deltaGramos !== undefined) doc.deltaGramos = deltaGramos;
    if (deltaUnidades !== undefined) doc.deltaUnidades = deltaUnidades;
    if (nota !== undefined) doc.nota = nota;
    if (costeo !== undefined) doc.costeo = costeoADoc(costeo as CosteoItem);
    return doc;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): MovimientoStock {
    const datos = snapshot.data(options) as MovimientoDoc;
    return {
      id: snapshot.id,
      tipo: datos.tipo,
      productoId: datos.productoId,
      piezaId: datos.piezaId,
      deltaGramos: datos.deltaGramos !== undefined ? peso(datos.deltaGramos) : undefined,
      deltaUnidades: datos.deltaUnidades,
      origenTipo: datos.origenTipo,
      origenId: datos.origenId,
      usuarioId: datos.usuarioId,
      fecha: datos.fecha.toDate(),
      nota: datos.nota,
      costeo: costeoDeDoc(datos.costeo),
    };
  },
};
