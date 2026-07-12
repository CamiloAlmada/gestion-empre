import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type WithFieldValue,
} from 'firebase/firestore';
import { peso, type Configuracion, type MetodoProrrateo } from '@gestion/core';

/**
 * Forma del documento `configuracion/general` tal como vive en Firestore: los
 * mismos campos que `Configuracion` (no tiene `id` propio, es un documento
 * único identificado por su ruta fija).
 */
interface ConfiguracionDoc {
  nombreNegocio: string;
  umbralPiezaAgotadaGramos: number;
  metodoProrrateo: MetodoProrrateo;
  codigoPaisDefault?: string;
}

/**
 * Mapea el documento `configuracion/general` ↔ el tipo de dominio `Configuracion`.
 *
 * A diferencia del resto de los converters, no hay `id` que reconstruir desde
 * `snapshot.id`: `Configuracion` no lo tiene, porque no es una entidad
 * trazable en una colección sino el único documento de configuración del
 * negocio.
 *
 * `umbralPiezaAgotadaGramos` se reconstruye con `peso()`: un doc corrupto con
 * float explota al leer en lugar de propagarse.
 */
export const configuracionConverter: FirestoreDataConverter<Configuracion> = {
  toFirestore(configuracion: WithFieldValue<Configuracion>): DocumentData {
    const { nombreNegocio, umbralPiezaAgotadaGramos, metodoProrrateo, codigoPaisDefault } =
      configuracion;
    const doc: DocumentData = { nombreNegocio, umbralPiezaAgotadaGramos, metodoProrrateo };
    // `codigoPaisDefault` es opcional (doc 08): ausente en negocios previos a WA.
    // Se omite si `undefined` (coherente con el resto de converters: nunca `null`).
    if (codigoPaisDefault !== undefined) doc.codigoPaisDefault = codigoPaisDefault;
    return doc;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Configuracion {
    const datos = snapshot.data(options) as ConfiguracionDoc;
    return {
      nombreNegocio: datos.nombreNegocio,
      umbralPiezaAgotadaGramos: peso(datos.umbralPiezaAgotadaGramos),
      metodoProrrateo: datos.metodoProrrateo,
      codigoPaisDefault: datos.codigoPaisDefault,
    };
  },
};
