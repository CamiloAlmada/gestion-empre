import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { Categoria } from '@gestion/core';
import { categoriaConverter } from './converters/categoria';
import { CategoriaDuplicadaError, CategoriaInvalidaError } from './errores';

/**
 * Gestión del vocabulario de categorías (`categorias/{id} → { nombre, orden }`),
 * usado por la pantalla de administración de categorías (solo admin).
 *
 * A diferencia de las escrituras del POS (`ventas.ts`, `stock.ts`), estas
 * funciones SÍ leen de Firestore antes de escribir: el chequeo de duplicados y el
 * cálculo de `orden` necesitan conocer las categorías existentes, y el renombre
 * necesita saber el nombre anterior para actualizar los productos. No son
 * operaciones de mostrador offline-first: las hace el admin, con conexión, sobre
 * un catálogo chico. Las mutaciones multi-documento (renombrar, reordenar) van en
 * un `writeBatch` atómico, coherente con el resto del kit (nunca `runTransaction`,
 * que exigiría servidor).
 */

/** Nombre canónico para comparar duplicados: sin espacios de borde, minúsculas. */
function clave(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/**
 * Valida y normaliza un nombre de categoría: recorta espacios y exige no vacío.
 *
 * @throws {CategoriaInvalidaError} si queda vacío tras `trim()`.
 */
function exigirNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) {
    throw new CategoriaInvalidaError('El nombre de la categoría no puede estar vacío.');
  }
  return limpio;
}

/** Lee todas las categorías existentes (validadas por el converter). */
async function leerCategorias(db: Firestore): Promise<Categoria[]> {
  const snap = await getDocs(collection(db, 'categorias').withConverter(categoriaConverter));
  return snap.docs.map((d) => d.data());
}

/**
 * Crea una categoría nueva con nombre normalizado y `orden = max(orden) + 1` (0 si
 * no hay ninguna). Lee la colección para detectar duplicados (case-insensitive) y
 * calcular el orden.
 *
 * @throws {CategoriaInvalidaError} si el nombre queda vacío tras `trim()`.
 * @throws {CategoriaDuplicadaError} si ya existe una categoría con ese nombre.
 */
export async function crearCategoria(
  db: Firestore,
  nombre: string,
): Promise<{ categoriaId: string }> {
  const nombreLimpio = exigirNombre(nombre);
  const existentes = await leerCategorias(db);

  if (existentes.some((c) => clave(c.nombre) === clave(nombreLimpio))) {
    throw new CategoriaDuplicadaError(`Ya existe una categoría llamada "${nombreLimpio}".`);
  }

  const orden =
    existentes.length === 0 ? 0 : Math.max(...existentes.map((c) => c.orden)) + 1;

  const ref = doc(collection(db, 'categorias')).withConverter(categoriaConverter);
  const categoria: Categoria = { id: ref.id, nombre: nombreLimpio, orden };
  await setDoc(ref, categoria);

  return { categoriaId: ref.id };
}

/**
 * Renombra una categoría y propaga el nuevo nombre al campo `categoria` de TODOS
 * los productos que lo referencian (denormalizado), en UN batch atómico: o se
 * renombra y se re-etiquetan todos los productos, o no cambia nada.
 *
 * El chequeo de duplicados excluye la propia categoría, de modo que corregir solo
 * el uso de mayúsculas ("quesos" → "Quesos") es válido.
 *
 * @throws {CategoriaInvalidaError} si el nombre nuevo queda vacío, o si la
 *   categoría `categoriaId` no existe.
 * @throws {CategoriaDuplicadaError} si otra categoría ya usa ese nombre.
 */
export async function renombrarCategoria(
  db: Firestore,
  categoriaId: string,
  nombreNuevo: string,
): Promise<void> {
  const nombreLimpio = exigirNombre(nombreNuevo);
  const existentes = await leerCategorias(db);

  const actual = existentes.find((c) => c.id === categoriaId);
  if (actual === undefined) {
    throw new CategoriaInvalidaError(`No existe la categoría ${categoriaId}.`);
  }

  const chocaConOtra = existentes.some(
    (c) => c.id !== categoriaId && clave(c.nombre) === clave(nombreLimpio),
  );
  if (chocaConOtra) {
    throw new CategoriaDuplicadaError(`Ya existe una categoría llamada "${nombreLimpio}".`);
  }

  const nombreAnterior = actual.nombre;

  // Productos que referencian el nombre anterior (denormalizado). Query por
  // igualdad exacta contra el nombre viejo. Escala esperada: decenas de productos,
  // muy lejos del límite de 500 operaciones del batch de Firestore; si esto
  // creciera a cientos, habría que paginar el batch.
  const productosSnap = await getDocs(
    query(collection(db, 'productos'), where('categoria', '==', nombreAnterior)),
  );

  const batch = writeBatch(db);
  batch.update(doc(db, 'categorias', categoriaId), { nombre: nombreLimpio });
  for (const productoDoc of productosSnap.docs) {
    batch.update(productoDoc.ref, { categoria: nombreLimpio });
  }
  await batch.commit();
}

/**
 * Intercambia los `orden` de dos categorías en UN batch atómico (subir/bajar una
 * categoría en la lista de Stock). Recibe las entidades ya resueltas por la UI
 * (que ya tiene la lista cargada), sin leer de Firestore.
 */
export async function intercambiarOrdenCategorias(
  db: Firestore,
  categoriaA: Categoria,
  categoriaB: Categoria,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'categorias', categoriaA.id), { orden: categoriaB.orden });
  batch.update(doc(db, 'categorias', categoriaB.id), { orden: categoriaA.orden });
  await batch.commit();
}
