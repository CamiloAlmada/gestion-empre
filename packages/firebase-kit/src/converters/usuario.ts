import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type WithFieldValue,
} from 'firebase/firestore';
import type { Rol, Usuario } from '@gestion/core';

/**
 * Forma del documento `usuarios/{uid}` tal como vive en Firestore: los mismos
 * campos que `Usuario` salvo `uid`, que no se persiste como campo porque ya es
 * la clave del documento (la ruta `usuarios/{uid}`).
 */
interface UsuarioDoc {
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}

/**
 * Mapea documentos `usuarios/{uid}` ↔ el tipo de dominio `Usuario`.
 *
 * Este es el primer converter del kit y fija el patrón que replicarán el resto
 * de las colecciones (tarea 1.4):
 * - `fromFirestore` reconstruye la entidad de dominio; el `uid` sale del id del
 *   documento (`snapshot.id`), no de un campo.
 * - `toFirestore` escribe solo los campos persistidos, nunca el `uid`.
 */
export const usuarioConverter: FirestoreDataConverter<Usuario> = {
  toFirestore(usuario: WithFieldValue<Usuario>): DocumentData {
    const { nombre, email, rol, activo } = usuario;
    return { nombre, email, rol, activo };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Usuario {
    const datos = snapshot.data(options) as UsuarioDoc;
    return {
      uid: snapshot.id,
      nombre: datos.nombre,
      email: datos.email,
      rol: datos.rol,
      activo: datos.activo,
    };
  },
};
