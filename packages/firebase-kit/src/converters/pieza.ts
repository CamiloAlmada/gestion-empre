import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type Timestamp,
  type WithFieldValue,
} from 'firebase/firestore';
import { money, peso, type EstadoPieza, type Pieza } from '@gestion/core';

/**
 * Forma del documento `piezas/{id}` tal como vive en Firestore: los mismos campos
 * que `Pieza` salvo `id`, que sale de `snapshot.id`. `fechaIngreso` /
 * `fechaVencimiento` son `Timestamp` en Firestore y `Date` en dominio.
 */
interface PiezaDoc {
  productoId: string;
  pesoInicialGramos: number;
  pesoRestanteGramos: number;
  costoKgCents: number;
  compraId?: string;
  fechaIngreso: Timestamp;
  fechaVencimiento?: Timestamp;
  estado: EstadoPieza;
}

/**
 * Mapea documentos `piezas/{id}` ↔ el tipo de dominio `Pieza`, siguiendo el
 * patrón de `usuarioConverter`.
 *
 * - `id` sale de `snapshot.id`, nunca se persiste como campo.
 * - `pesoInicialGramos` / `pesoRestanteGramos` se reconstruyen con `peso()`;
 *   `costoKgCents` con `money()`. Un doc corrupto con float explota al leer.
 * - `compraId` / `fechaVencimiento` ausentes en Firestore ↔ `undefined` en
 *   dominio; si están `undefined` al escribir, se omiten del doc (nunca `null`).
 */
export const piezaConverter: FirestoreDataConverter<Pieza> = {
  toFirestore(pieza: WithFieldValue<Pieza>): DocumentData {
    const {
      productoId,
      pesoInicialGramos,
      pesoRestanteGramos,
      costoKgCents,
      compraId,
      fechaIngreso,
      fechaVencimiento,
      estado,
    } = pieza;
    const doc: DocumentData = {
      productoId,
      pesoInicialGramos,
      pesoRestanteGramos,
      costoKgCents,
      fechaIngreso,
      estado,
    };
    if (compraId !== undefined) doc.compraId = compraId;
    if (fechaVencimiento !== undefined) doc.fechaVencimiento = fechaVencimiento;
    return doc;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Pieza {
    const datos = snapshot.data(options) as PiezaDoc;
    return {
      id: snapshot.id,
      productoId: datos.productoId,
      pesoInicialGramos: peso(datos.pesoInicialGramos),
      pesoRestanteGramos: peso(datos.pesoRestanteGramos),
      costoKgCents: money(datos.costoKgCents),
      compraId: datos.compraId,
      fechaIngreso: datos.fechaIngreso.toDate(),
      fechaVencimiento: datos.fechaVencimiento?.toDate(),
      estado: datos.estado,
    };
  },
};
