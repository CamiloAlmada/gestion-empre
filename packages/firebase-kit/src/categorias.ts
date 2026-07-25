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
import { type Categoria, claveCategoria, claveCategoriaValida } from '@gestion/core';
import { categoriaConverter } from './converters/categoria';
import { CategoriaDuplicadaError, CategoriaInvalidaError } from './errores';

/**
 * Gestión del vocabulario de categorías (`categorias/{id} → { nombre, orden,
 * clave }`), usado por la pantalla de administración de categorías (solo admin).
 *
 * A diferencia de las escrituras del POS (`ventas.ts`, `stock.ts`), estas
 * funciones SÍ leen de Firestore antes de escribir: el chequeo de duplicados y el
 * cálculo de `orden` necesitan conocer las categorías existentes, y el renombre
 * necesita saber el nombre anterior para actualizar los productos. No son
 * operaciones de mostrador offline-first: las hace el admin, con conexión, sobre
 * un catálogo chico. Las mutaciones multi-documento (renombrar, reordenar) van en
 * un `writeBatch` atómico, coherente con el resto del kit (nunca `runTransaction`,
 * que exigiría servidor).
 *
 * ## El id del documento ES la clave del nombre
 *
 * `categorias/{id}` cumple SIEMPRE `id === claveCategoria(nombre)`. Esa es la
 * garantía estructural de que no hay dos categorías con el mismo nombre: dos
 * categorías homónimas serían literalmente el mismo documento. El chequeo de
 * duplicados que hacen estas funciones (leer → comparar → escribir) se conserva,
 * pero cambió de rol: ya NO es la garantía —tiene condición de carrera y no
 * cubre al Admin SDK—, es la fuente del mensaje de error amigable. La garantía
 * la da `firestore.rules`, que exige `categoriaId == request.resource.data.clave`
 * en create y en update. Ver `categoria.ts` en `core`.
 *
 * Consecuencia para el renombre: si la clave cambia, el documento se MUEVE de
 * path (set del nuevo + delete del viejo en el mismo batch). Dejar el id viejo
 * rompería el invariante y, peor, un alta posterior del nombre viejo pisaría el
 * documento renombrado.
 */

/**
 * Valida y normaliza un nombre de categoría: recorta espacios, exige no vacío y
 * exige que su clave sirva como id de documento de Firestore.
 *
 * Sin la segunda validación, un nombre como `.` o `a/b` llegaría al SDK y
 * explotaría con un error críptico en inglés en vez de un mensaje de dominio.
 *
 * @throws {CategoriaInvalidaError} si queda vacío tras `trim()` o si su clave no
 *   es un id válido.
 */
function exigirNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) {
    throw new CategoriaInvalidaError('El nombre de la categoría no puede estar vacío.');
  }
  if (!claveCategoriaValida(claveCategoria(limpio))) {
    throw new CategoriaInvalidaError(
      `"${limpio}" no es un nombre de categoría válido: no puede contener "/", ni ser "." o "..", ni tener la forma "__nombre__".`,
    );
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
 * no hay ninguna). El id del documento ES la clave del nombre, nunca un id
 * autogenerado: ahí vive la garantía de unicidad.
 *
 * Lee la colección para calcular el orden y para detectar duplicados. Ese chequeo
 * ya no es la garantía (dos dispositivos offline pueden pasarlo los dos), pero es
 * lo que produce el mensaje amigable; si igual se cuelan las dos escrituras, van
 * al MISMO path y convergen en un solo documento al sincronizar.
 *
 * @throws {CategoriaInvalidaError} si el nombre queda vacío o su clave no sirve
 *   como id de documento.
 * @throws {CategoriaDuplicadaError} si ya existe una categoría con ese nombre.
 */
export async function crearCategoria(
  db: Firestore,
  nombre: string,
): Promise<{ categoriaId: string }> {
  const nombreLimpio = exigirNombre(nombre);
  const claveNueva = claveCategoria(nombreLimpio);
  const existentes = await leerCategorias(db);

  if (existentes.some((c) => claveCategoria(c.nombre) === claveNueva)) {
    throw new CategoriaDuplicadaError(`Ya existe una categoría llamada "${nombreLimpio}".`);
  }

  const orden =
    existentes.length === 0 ? 0 : Math.max(...existentes.map((c) => c.orden)) + 1;

  const ref = doc(db, 'categorias', claveNueva).withConverter(categoriaConverter);
  const categoria: Categoria = { id: claveNueva, nombre: nombreLimpio, orden };
  await setDoc(ref, categoria);

  return { categoriaId: claveNueva };
}

/**
 * Renombra una categoría y propaga el nuevo nombre al campo `categoria` de TODOS
 * los productos que lo referencian (denormalizado), en UN batch atómico: o se
 * renombra y se re-etiquetan todos los productos, o no cambia nada.
 *
 * El chequeo de duplicados excluye la propia categoría, de modo que corregir solo
 * el uso de mayúsculas ("quesos" → "Quesos") es válido.
 *
 * Como el id del documento ES la clave del nombre, hay dos casos:
 *
 * - **La clave no cambia** (solo cambiaron mayúsculas o espacios de borde): el
 *   documento se queda donde está y se actualiza in-place.
 * - **La clave cambia**: el documento se MUEVE a su nuevo path, con un `set` del
 *   nuevo (conservando `orden`) y un `delete` del viejo dentro del MISMO batch,
 *   junto al fan-out a productos. Conservar el id viejo no es opción: si "Quesos"
 *   (id `quesos`) pasara a llamarse "Fiambres" pero siguiera viviendo en `quesos`,
 *   un alta posterior de "Quesos" escribiría en ese mismo path y PISARÍA a
 *   Fiambres. El invariante tiene que valer siempre, no solo en el alta.
 *
 * Efecto colateral útil: renombrar un documento heredado (id autogenerado, previo
 * a la migración de ids) lo reubica en su path canónico.
 *
 * @throws {CategoriaInvalidaError} si el nombre nuevo queda vacío, si su clave no
 *   sirve como id de documento, o si la categoría `categoriaId` no existe.
 * @throws {CategoriaDuplicadaError} si otra categoría ya usa ese nombre.
 */
export async function renombrarCategoria(
  db: Firestore,
  categoriaId: string,
  nombreNuevo: string,
): Promise<void> {
  const nombreLimpio = exigirNombre(nombreNuevo);
  const claveNueva = claveCategoria(nombreLimpio);
  const existentes = await leerCategorias(db);

  const actual = existentes.find((c) => c.id === categoriaId);
  if (actual === undefined) {
    throw new CategoriaInvalidaError(`No existe la categoría ${categoriaId}.`);
  }

  const chocaConOtra = existentes.some(
    (c) => c.id !== categoriaId && claveCategoria(c.nombre) === claveNueva,
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
  if (claveNueva === categoriaId) {
    // La clave no cambió: el documento ya está en su path canónico. Se reescribe
    // `clave` junto al nombre para que un documento heredado (sin el campo) quede
    // completo sin necesidad de moverlo.
    batch.update(doc(db, 'categorias', categoriaId), {
      nombre: nombreLimpio,
      clave: claveNueva,
    });
  } else {
    // La clave cambió: el documento se muda de path. `set` + `delete` en el mismo
    // batch, así nunca existen las dos versiones ni ninguna.
    batch.set(doc(db, 'categorias', claveNueva).withConverter(categoriaConverter), {
      id: claveNueva,
      nombre: nombreLimpio,
      orden: actual.orden,
    });
    batch.delete(doc(db, 'categorias', categoriaId));
  }
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
