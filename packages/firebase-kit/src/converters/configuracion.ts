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
 * único identificado por su ruta fija). TODAS las claves son opcionales: el doc se
 * escribe con merge parcial (`guardarConfiguracionGeneral`) y las reglas las
 * declaran opcionales, así que cualquier subconjunto —incluido el doc vacío— es legal.
 */
interface ConfiguracionDoc {
  nombreNegocio?: string;
  umbralPiezaAgotadaGramos?: number;
  metodoProrrateo?: MetodoProrrateo;
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
 * `fromFirestore` TOLERA cualquier subconjunto de las 4 claves conocidas: una clave
 * ausente ⇒ `undefined` en el objeto (nunca rompe). Concretamente, guardar solo
 * `{nombreNegocio, codigoPaisDefault}` desde Ajustes deja el doc sin
 * `umbralPiezaAgotadaGramos`/`metodoProrrateo`, y esto NO debe explotar (WA-B2). El
 * default lo pone cada consumidor en su punto de uso.
 *
 * `umbralPiezaAgotadaGramos`, si está PRESENTE, se reconstruye con `peso()`: un doc
 * corrupto con float explota al leer en lugar de propagarse (comportamiento previo,
 * correcto). Ausente ⇒ `undefined` (no se llama a `peso()`).
 *
 * `toFirestore` omite cada clave `undefined` (coherente con el resto de converters:
 * nunca `null`). No lo usa ningún escritor de producción —`guardarConfiguracionGeneral`
 * escribe con merge directo—, pero se mantiene simétrico y seguro para el round-trip.
 */
export const configuracionConverter: FirestoreDataConverter<Configuracion> = {
  toFirestore(configuracion: WithFieldValue<Configuracion>): DocumentData {
    const { nombreNegocio, umbralPiezaAgotadaGramos, metodoProrrateo, codigoPaisDefault } =
      configuracion;
    const doc: DocumentData = {};
    if (nombreNegocio !== undefined) doc.nombreNegocio = nombreNegocio;
    if (umbralPiezaAgotadaGramos !== undefined) doc.umbralPiezaAgotadaGramos = umbralPiezaAgotadaGramos;
    if (metodoProrrateo !== undefined) doc.metodoProrrateo = metodoProrrateo;
    if (codigoPaisDefault !== undefined) doc.codigoPaisDefault = codigoPaisDefault;
    return doc;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Configuracion {
    const datos = snapshot.data(options) as ConfiguracionDoc;
    return {
      nombreNegocio: datos.nombreNegocio,
      umbralPiezaAgotadaGramos:
        datos.umbralPiezaAgotadaGramos === undefined
          ? undefined
          : peso(datos.umbralPiezaAgotadaGramos),
      metodoProrrateo: datos.metodoProrrateo,
      codigoPaisDefault: datos.codigoPaisDefault,
    };
  },
};
