import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type WithFieldValue,
} from 'firebase/firestore';
import { type Categoria, claveCategoria } from '@gestion/core';

/**
 * Forma del documento `categorias/{id}` tal como vive en Firestore: los mismos
 * campos que `Categoria` salvo `id` (que sale de `snapshot.id`), más `clave`.
 *
 * `clave` es un campo de PERSISTENCIA, no de dominio: no aparece en `Categoria`
 * porque es redundante —se deriva de `nombre` con `claveCategoria()`— y ningún
 * consumidor de la app lo necesita. Existe únicamente para que `firestore.rules`
 * pueda exigir `categoriaId == request.resource.data.clave` y así garantizar la
 * unicidad de nombres desde la capa autoritativa (ver `categoria.ts` en `core`).
 * Al ser derivado, el converter lo estampa solo: nadie puede olvidarse de él.
 */
interface CategoriaDoc {
  nombre: string;
  orden: number;
  /** Ausente en documentos anteriores a la migración de ids. */
  clave?: string;
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
 * - `clave` se DERIVA de `nombre` al escribir y se descarta al leer: es un campo
 *   de persistencia que solo existe para las reglas (ver `CategoriaDoc`).
 */
export const categoriaConverter: FirestoreDataConverter<Categoria> = {
  toFirestore(categoria: WithFieldValue<Categoria>): DocumentData {
    const { nombre, orden } = categoria;
    if (typeof nombre !== 'string') {
      throw new TypeError(
        "categoriaConverter: 'nombre' debe ser un string plano (no un FieldValue): la clave se deriva de él.",
      );
    }
    return { nombre, orden, clave: claveCategoria(nombre) };
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
