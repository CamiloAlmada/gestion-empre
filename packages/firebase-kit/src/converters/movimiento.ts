import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type Timestamp,
  type WithFieldValue,
} from 'firebase/firestore';
import { peso, type MovimientoStock, type TipoMovimiento } from '@gestion/core';

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
    };
  },
};
