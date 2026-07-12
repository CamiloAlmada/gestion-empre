import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type WithFieldValue,
} from 'firebase/firestore';
import type { ContextoPlantilla, PlantillaWhatsApp } from '@gestion/core';

/**
 * Forma del documento `configuracion/plantillasWhatsApp` tal como vive en
 * Firestore: UN documento con el array de plantillas (doc 08). Es una colección
 * chica y de edición atómica (el admin guarda toda la lista de una), por eso va en
 * un único doc en vez de un doc por plantilla.
 */
interface PlantillasWhatsAppDoc {
  plantillas?: PlantillaWhatsApp[];
}

/**
 * Mapea `configuracion/plantillasWhatsApp` ↔ `PlantillaWhatsApp[]` (el tipo de
 * dominio vive en `@gestion/core`). Como `configuracionConverter`, no reconstruye
 * un `id` de `snapshot.id`: es un documento único identificado por su ruta fija; el
 * `id` que importa es el de cada plantilla, embebido en el array.
 *
 * `fromFirestore` reconstruye cada plantilla campo a campo (no devuelve el objeto
 * crudo de Firestore) y tolera el doc ausente o sin `plantillas` devolviendo `[]`.
 * La validación de shape/tamaño es de la escritura (`guardarPlantillasWhatsApp`) y
 * de las reglas, no del converter.
 */
export const plantillasWhatsAppConverter: FirestoreDataConverter<PlantillaWhatsApp[]> = {
  toFirestore(plantillas: WithFieldValue<PlantillaWhatsApp[]>): DocumentData {
    const lista = plantillas as PlantillaWhatsApp[];
    return {
      plantillas: lista.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        contexto: p.contexto,
        texto: p.texto,
      })),
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): PlantillaWhatsApp[] {
    const datos = snapshot.data(options) as PlantillasWhatsAppDoc;
    return (datos.plantillas ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      contexto: p.contexto as ContextoPlantilla,
      texto: p.texto,
    }));
  },
};
