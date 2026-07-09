import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type WithFieldValue,
} from 'firebase/firestore';
import type { Categoria } from '@gestion/core';

/**
 * Forma del documento `categorias/{id}` tal como vive en Firestore: los mismos
 * campos que `Categoria` salvo `id`, que sale de `snapshot.id`.
 */
interface CategoriaDoc {
  nombre: string;
  orden: number;
}

/**
 * `orden` es un entero ≥ 0 (posición en las listas de Stock). No hay branded type
 * de dominio que lo garantice —es un `number` plano en `Categoria`—, así que el
 * converter valida la invariante al leer: un doc corrupto (float o negativo)
 * explota con `RangeError` al reconstruirse, igual que `money()`/`peso()` explotan
 * con floats, en lugar de propagar un valor inválido al dominio.
 */
function ordenValido(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`categoriaConverter: 'orden' debe ser un entero >= 0, recibió: ${n}`);
  }
  return n;
}

/**
 * Mapea documentos `categorias/{id}` ↔ el tipo de dominio `Categoria`, siguiendo el
 * patrón de `usuarioConverter` / `productoConverter`.
 *
 * - `id` sale de `snapshot.id`, nunca se persiste como campo.
 * - `orden` se re-valida con `ordenValido()`: un doc corrupto explota al leer.
 */
export const categoriaConverter: FirestoreDataConverter<Categoria> = {
  toFirestore(categoria: WithFieldValue<Categoria>): DocumentData {
    const { nombre, orden } = categoria;
    return { nombre, orden };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Categoria {
    const datos = snapshot.data(options) as CategoriaDoc;
    return {
      id: snapshot.id,
      nombre: datos.nombre,
      orden: ordenValido(datos.orden),
    };
  },
};
