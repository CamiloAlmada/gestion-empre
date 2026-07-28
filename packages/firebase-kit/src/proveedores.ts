import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { type DatosPago, type Proveedor } from '@gestion/core';
import { proveedorConverter } from './converters/proveedor';
import { ProveedorDuplicadoError, ProveedorInvalidoError } from './errores';

/**
 * ABM de proveedores (`proveedores/{id}`, ver doc 07). Superficie que la pantalla
 * de proveedores (solo admin) consume: alta, edición y desactivación. No hay
 * borrado físico (se desactiva con `activo: false`).
 *
 * A diferencia de clientes, el proveedor no tiene `stats` ni lo escribe el POS:
 * las reglas lo dejan solo para admin (el vendedor no ve datos bancarios).
 *
 * ## Unicidad del nombre: best-effort en el cliente, y por qué no hay más
 *
 * Dos fichas "La Rural" parten en dos el historial de compras de ese proveedor.
 * Para evitarlo, `crearProveedor` y `actualizarProveedor` leen la colección,
 * comparan por nombre normalizado y tiran `ProveedorDuplicadoError`.
 *
 * Deliberadamente NO se usa el patrón de id canónico de `categorias` (donde el id
 * del documento ES la clave del nombre y las reglas garantizan la unicidad). Al
 * proveedor lo referencian POR ID `Compra.proveedorId` y
 * `Producto.proveedorPrincipalId`; con id canónico un renombre convierte al
 * documento en una mudanza de path, y las compras ya confirmadas —INMUTABLES por
 * reglas: `match /compras/{id}` solo permite update en estado `borrador`—
 * quedarían apuntando a un id inexistente, sin forma de arreglarlas. Además ese
 * patrón exige `allow delete`, y `proveedores` tiene `allow delete: if false` a
 * propósito ("no se borran: se desactivan").
 *
 * Entonces: id autogenerado y chequeo leer→comparar→tirar como ÚNICA defensa.
 * Tiene condición de carrera (dos altas simultáneas del mismo nombre pasan las
 * dos) y no cubre al Admin SDK. Se acepta: la colección es solo-admin (a
 * diferencia de `clientes`), en la práctica hay un único admin, y la carrera
 * residual no justifica una colección-ledger con `getAfter` en las reglas.
 *
 * ## Contrato en dos fases
 *
 * `crearProveedor` y `actualizarProveedor` devuelven una promesa EXTERNA que
 * resuelve apenas se validó y se disparó la escritura, y adentro un
 * `sincronizacion` con el ack del servidor. El chequeo de duplicados obliga a
 * esta forma: si la función esperara el ack, sin conexión NUNCA resolvería, y ni
 * el id nuevo ni el error de duplicado llegarían a la pantalla —que además usa
 * ese id para seguir armando una compra—. La promesa externa sí resuelve
 * offline: `getDocs` responde de la caché de persistencia y el id sale de
 * `doc(collection(...))`, que no necesita red.
 *
 * Esto es lo que preserva el patrón híbrido de escrituras offline del proyecto
 * (doc 06 §8): la pantalla dispara la escritura, y si está sin conexión cierra el
 * modal, avisa "se sincronizará al reconectar" y le encadena un `.catch` a
 * `sincronizacion`.
 */

/**
 * Largo máximo del nombre de un proveedor, en caracteres tras `trim()`.
 *
 * Es un tope de sanidad de UI —el nombre se denormaliza en las compras y se
 * muestra en listas—, NO una restricción sobre el id: acá el id es autogenerado,
 * así que un nombre con "/" o "." es perfectamente válido.
 */
export const LARGO_MAX_NOMBRE_PROVEEDOR = 120;

/** Datos editables de un proveedor (todo opcional salvo `nombre`). */
export interface DatosProveedor {
  nombre: string;
  contactoNombre?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  rut?: string;
  pagos?: DatosPago[];
  notas?: string;
}

/**
 * Clave de comparación de nombres de proveedor: sin espacios de borde, en
 * minúsculas. Solo se usa para detectar duplicados; no es un id ni se persiste.
 *
 * Deliberadamente NO pliega acentos ni la eñe (nada de `normalize('NFD')`):
 * "Café" y "Cafe" son palabras distintas y son dos proveedores distintos. Es la
 * misma decisión, y por las mismas razones, que documenta `claveCategoria` en
 * `packages/core/src/categoria.ts` (líneas 33-45).
 *
 * Vive acá y no en `core`, ni reusa `claveCategoria`: son dos llamadas de stdlib
 * y compartirlas sería abstracción prematura. Si aparece un tercer consumidor
 * (clientes), ahí se extrae.
 */
function claveNombre(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/**
 * Valida y normaliza el nombre: recorta espacios, exige no vacío y exige no
 * pasarse de `LARGO_MAX_NOMBRE_PROVEEDOR`.
 *
 * @throws {ProveedorInvalidoError} si queda vacío tras `trim()` o si es
 *   demasiado largo.
 */
function exigirNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) {
    throw new ProveedorInvalidoError('El nombre del proveedor no puede estar vacío.');
  }
  if (limpio.length > LARGO_MAX_NOMBRE_PROVEEDOR) {
    throw new ProveedorInvalidoError(
      `El nombre del proveedor no puede superar los ${LARGO_MAX_NOMBRE_PROVEEDOR} caracteres.`,
    );
  }
  return limpio;
}

/**
 * Copia a `destino` los campos opcionales definidos y no vacíos, ya recortados.
 * `pagos` se copia tal cual si viene (el converter omite los sub-campos ausentes
 * de cada cuenta). Omite `undefined` (Firestore los rechaza).
 */
function copiarDatos(datos: DatosProveedor, destino: DocumentData): void {
  const { contactoNombre, telefono, email, direccion, rut, pagos, notas } = datos;
  if (contactoNombre !== undefined && contactoNombre.trim().length > 0)
    destino.contactoNombre = contactoNombre.trim();
  if (telefono !== undefined && telefono.trim().length > 0) destino.telefono = telefono.trim();
  if (email !== undefined && email.trim().length > 0) destino.email = email.trim();
  if (direccion !== undefined && direccion.trim().length > 0) destino.direccion = direccion.trim();
  if (rut !== undefined && rut.trim().length > 0) destino.rut = rut.trim();
  if (pagos !== undefined) destino.pagos = pagos;
  if (notas !== undefined && notas.trim().length > 0) destino.notas = notas.trim();
}

/**
 * Lee todos los proveedores existentes (validados por el converter). Escala
 * esperada: decenas, igual que categorías. Sin conexión responde de la caché de
 * persistencia, que puede estar incompleta: por eso el chequeo es best-effort.
 */
async function leerProveedores(db: Firestore): Promise<Proveedor[]> {
  const snap = await getDocs(collection(db, 'proveedores').withConverter(proveedorConverter));
  return snap.docs.map((d) => d.data());
}

/**
 * Busca entre `existentes` un proveedor homónimo de `nombre`, ignorando el de id
 * `excluirId` (el propio, en una edición) si se pasa.
 */
function buscarHomonimo(
  existentes: readonly Proveedor[],
  nombre: string,
  excluirId?: string,
): Proveedor | undefined {
  const clave = claveNombre(nombre);
  return existentes.find((p) => p.id !== excluirId && claveNombre(p.nombre) === clave);
}

/**
 * Mensaje del duplicado. Nombra al proveedor EXISTENTE (no al que se tipeó) para
 * que el admin lo encuentre en la lista, y distingue el caso inactivo, donde la
 * salida es reactivarlo y no crear una ficha nueva.
 */
function mensajeDuplicado(existente: Proveedor): string {
  return existente.activo
    ? `Ya existe un proveedor llamado "${existente.nombre}".`
    : `Ya existe un proveedor llamado "${existente.nombre}" (está inactivo, podés reactivarlo).`;
}

/**
 * Crea un proveedor con `fechaAlta = new Date()` y `activo: true`.
 *
 * Contrato en dos fases (ver el doc del módulo): la promesa que devuelve resuelve
 * apenas validó y disparó el `setDoc` —también sin conexión—, con el id ya
 * asignado; `sincronizacion` es el ack del servidor.
 *
 * El caller DEBE encadenarle un `catch` a `sincronizacion`, incluso si no le
 * interesa el resultado: es una promesa ya en vuelo, y si nadie la maneja un
 * rechazo del servidor termina en un unhandled rejection.
 *
 * @throws {ProveedorInvalidoError} si el nombre queda vacío tras `trim()` o supera
 *   `LARGO_MAX_NOMBRE_PROVEEDOR`.
 * @throws {ProveedorDuplicadoError} si ya existe un proveedor con ese nombre
 *   (comparación case-insensitive; el homónimo inactivo también cuenta). En ese
 *   caso no se escribe nada.
 */
export async function crearProveedor(
  db: Firestore,
  datos: DatosProveedor,
): Promise<{ proveedorId: string; sincronizacion: Promise<void> }> {
  const nombre = exigirNombre(datos.nombre);

  const homonimo = buscarHomonimo(await leerProveedores(db), nombre);
  if (homonimo !== undefined) {
    throw new ProveedorDuplicadoError(mensajeDuplicado(homonimo));
  }

  const ref = doc(collection(db, 'proveedores')).withConverter(proveedorConverter);
  const proveedor: Proveedor = {
    id: ref.id,
    nombre,
    contactoNombre: datos.contactoNombre?.trim() || undefined,
    telefono: datos.telefono?.trim() || undefined,
    email: datos.email?.trim() || undefined,
    direccion: datos.direccion?.trim() || undefined,
    rut: datos.rut?.trim() || undefined,
    pagos: datos.pagos,
    notas: datos.notas?.trim() || undefined,
    fechaAlta: new Date(),
    activo: true,
  };

  // Sin `await`: la fase 2 es del caller. Ver el doc del módulo.
  const sincronizacion = setDoc(ref, proveedor);

  return { proveedorId: ref.id, sincronizacion };
}

/**
 * Actualiza los datos de un proveedor. NO toca `activo` (usar `desactivarProveedor`).
 * Escribe solo los campos provistos; update parcial, no pasa por el converter.
 *
 * El chequeo de duplicados excluye al propio `proveedorId`, de modo que corregir
 * solo el uso de mayúsculas ("la rural" → "La Rural") es válido. No exige que el
 * proveedor exista en la lectura: sin conexión la caché puede no tenerlo, y
 * negarse a editar por eso rompería el uso offline.
 *
 * Mismo contrato en dos fases que `crearProveedor`, con la misma obligación de
 * encadenarle un `catch` a `sincronizacion`.
 *
 * @throws {ProveedorInvalidoError} si el nombre queda vacío tras `trim()` o supera
 *   `LARGO_MAX_NOMBRE_PROVEEDOR`.
 * @throws {ProveedorDuplicadoError} si OTRO proveedor ya usa ese nombre. En ese
 *   caso no se escribe nada.
 */
export async function actualizarProveedor(
  db: Firestore,
  proveedorId: string,
  datos: DatosProveedor,
): Promise<{ sincronizacion: Promise<void> }> {
  const nombre = exigirNombre(datos.nombre);

  const homonimo = buscarHomonimo(await leerProveedores(db), nombre, proveedorId);
  if (homonimo !== undefined) {
    throw new ProveedorDuplicadoError(mensajeDuplicado(homonimo));
  }

  const cambios: DocumentData = { nombre };
  copiarDatos(datos, cambios);

  // Sin `await`: la fase 2 es del caller. Ver el doc del módulo.
  const sincronizacion = updateDoc(doc(db, 'proveedores', proveedorId), cambios);

  return { sincronizacion };
}

/** Desactiva un proveedor (`activo: false`). No borra: preserva historial. */
export async function desactivarProveedor(db: Firestore, proveedorId: string): Promise<void> {
  await updateDoc(doc(db, 'proveedores', proveedorId), { activo: false });
}

/** Reactiva un proveedor (`activo: true`). Inversa de `desactivarProveedor`. */
export async function reactivarProveedor(db: Firestore, proveedorId: string): Promise<void> {
  await updateDoc(doc(db, 'proveedores', proveedorId), { activo: true });
}
