import {
  collection,
  deleteField,
  doc,
  setDoc,
  updateDoc,
  type DocumentData,
  type FieldValue,
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
 * Para evitarlo, `crearProveedor` y `actualizarProveedor` reciben `existentes`
 * —la lista que la pantalla YA tiene suscrita con `useCollection`—, comparan por
 * nombre normalizado y tiran `ProveedorDuplicadoError`.
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
 * Entonces: id autogenerado y chequeo comparar→tirar como ÚNICA defensa. Tiene
 * condición de carrera (dos altas simultáneas del mismo nombre pasan las dos),
 * no cubre al Admin SDK, y puede saltearse entero si `existentes` todavía no
 * trae al homónimo (la suscripción recién montada, o una caché fría). Se acepta:
 * la colección es solo-admin (a diferencia de `clientes`), en la práctica hay un
 * único admin, y la carrera residual no justifica una colección-ledger con
 * `getAfter` en las reglas.
 *
 * ## Por qué el chequeo NO lee del SDK, y la lección que lo puso acá
 *
 * Una versión anterior leía la colección acá adentro con `getDocs`, y para
 * sobrevivir a la red mentirosa —captive portal: red muerta con
 * `navigator.onLine === true`— tenía una escalera `getDocs` → timeout de 5 s →
 * `getDocsFromCache` → lista vacía. Se borró entera, junto con sus nueve tests.
 *
 * Los datos de la suscripción `onSnapshot` que la pantalla ya tiene abierta son
 * estrictamente mejores que "caché o lista vacía": están en memoria, llegan al
 * instante e incluyen las escrituras locales todavía sin ack (latency
 * compensation). Y el chequeo vuelve a ser lógica pura sobre un array, testeable
 * SIN mockear Firebase.
 *
 * La lección, que costó un diagnóstico entero equivocado: **ningún unit test con
 * el SDK mockeado puede validar el acoplamiento entre llamadas dentro del SDK
 * real.** Aquellos nueve tests declaraban por construcción que `getDocs` y
 * `getDocsFromCache` son independientes —que era justo la hipótesis a
 * verificar—, así que pasaban en verde mientras el comportamiento estaba roto, y
 * el cuelgue que decían cubrir vivía en realidad en el caller (que esperaba el
 * ack antes de cerrar el modal). Con este diseño el mock desaparece del camino
 * crítico.
 *
 * ## Contrato en dos fases
 *
 * `crearProveedor` y `actualizarProveedor` devuelven una promesa EXTERNA que
 * resuelve apenas se validó y se disparó la escritura, y adentro un
 * `sincronizacion` con el ack del servidor. El chequeo de duplicados obliga a
 * esta forma: si la función esperara el ack, sin conexión NUNCA resolvería, y ni
 * el id nuevo ni el error de duplicado llegarían a la pantalla —que además usa
 * ese id para seguir armando una compra—. La promesa externa sí resuelve
 * offline: el id sale de `doc(collection(...))`, que no necesita red, y el
 * chequeo de duplicados no toca el SDK (ver la sección anterior).
 *
 * Esto es lo que preserva el patrón híbrido de escrituras offline del proyecto
 * (doc 06 §8): la pantalla dispara la escritura, cierra el modal y le cuelga a
 * `sincronizacion` los avisos de éxito y de fallo.
 *
 * **El caller NUNCA espera el ack para cerrar el modal**, ni siquiera creyéndose
 * en línea: bajo captive portal `navigator.onLine` vale `true` y el ack no llega
 * jamás. `enLinea` puede elegir el TEXTO del aviso, nunca si la UI se bloquea
 * (ver el JSDoc de `handleCrear` en `Proveedores.tsx`).
 *
 * ## El alta OMITE los campos vacíos; la edición los BORRA
 *
 * Las dos superficies interpretan distinto un campo opcional ausente o vacío en
 * `DatosProveedor`, y es a propósito:
 *
 * - `crearProveedor` construye el documento entero y lo escribe con `setDoc` a
 *   través del converter: un campo vacío simplemente no se escribe. Ahí
 *   `deleteField()` sería además un error (no se puede borrar un campo de un
 *   documento que todavía no existe).
 * - `actualizarProveedor` hace un `updateDoc` parcial, donde un campo ausente
 *   quedaría con su valor viejo. Por eso traduce "ausente o vacío" a
 *   `deleteField()`: ver el contrato de reemplazo total en su propio doc.
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
 * Valor de un campo de texto opcional en el update: el texto recortado si trae
 * contenido, y si no la sentinela de borrado. Solo la usa `actualizarProveedor`
 * (el alta arma el documento por su cuenta, ver el doc del módulo).
 */
function textoOBorrado(valor: string | undefined): string | FieldValue {
  const limpio = valor?.trim() ?? '';
  return limpio.length > 0 ? limpio : deleteField();
}

/**
 * Serializa una cuenta de pago para el update, que NO pasa por el converter:
 * omite `titular`/`moneda` ausentes en lugar de escribirlos como `undefined`,
 * que Firestore rechaza (no usamos `ignoreUndefinedProperties`, ver `init.ts`).
 *
 * Espeja `pagoADoc` de `converters/proveedor.ts`, que hace lo mismo en el alta.
 * No se comparte con él a propósito: son dos rutas de escritura distintas (una
 * pasa por el converter y la otra no) y el converter no exporta su interno.
 */
function pagoADocumento(pago: DatosPago): DocumentData {
  const documento: DocumentData = { banco: pago.banco, cuenta: pago.cuenta };
  if (pago.titular !== undefined) documento.titular = pago.titular;
  if (pago.moneda !== undefined) documento.moneda = pago.moneda;
  return documento;
}

/**
 * Valor de `pagos` en el update. "Sin cuentas" se persiste SIEMPRE como campo
 * ausente, nunca como `pagos: []`: tanto `undefined` como la lista vacía se
 * traducen a `deleteField()`.
 *
 * Es la representación que ya asume el resto del sistema —`Proveedor.pagos` es
 * opcional, el converter mapea ausente ↔ `undefined` y los proveedores creados
 * antes de tener cuentas no traen el campo—, así que persistir `[]` obligaría a
 * cada lector a contemplar dos formas del mismo estado.
 */
function pagosOBorrado(pagos: DatosPago[] | undefined): DocumentData[] | FieldValue {
  if (pagos === undefined || pagos.length === 0) return deleteField();
  return pagos.map(pagoADocumento);
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
 * @param existentes Proveedores ya conocidos por la pantalla (los de su
 *   suscripción `useCollection`), contra los que se chequea el duplicado. Es la
 *   colección ENTERA, sin filtrar por `activo`: un homónimo inactivo también es
 *   duplicado.
 * @throws {ProveedorInvalidoError} si el nombre queda vacío tras `trim()` o supera
 *   `LARGO_MAX_NOMBRE_PROVEEDOR`.
 * @throws {ProveedorDuplicadoError} si ya existe un proveedor con ese nombre
 *   (comparación case-insensitive; el homónimo inactivo también cuenta). En ese
 *   caso no se escribe nada. Solo se detecta si el homónimo está en `existentes`.
 */
export async function crearProveedor(
  db: Firestore,
  datos: DatosProveedor,
  existentes: readonly Proveedor[],
): Promise<{ proveedorId: string; sincronizacion: Promise<void> }> {
  const nombre = exigirNombre(datos.nombre);

  const homonimo = buscarHomonimo(existentes, nombre);
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
 * Update parcial: escribe `nombre` y los siete campos opcionales, y no pasa por
 * el converter (no reemplaza el documento: `fechaAlta` y `activo` quedan como
 * están).
 *
 * ## Reemplazo TOTAL de los campos opcionales
 *
 * `datos` es la foto completa de los campos editables, no un delta: un campo
 * opcional ausente o vacío en `DatosProveedor` **borra** el valor guardado
 * (`deleteField()`). Vaciar el teléfono en el modal lo borra de verdad; quitar
 * todas las cuentas de `pagos` las borra de verdad.
 *
 * El caller DEBE, entonces, mandar SIEMPRE todos los campos que quiere conservar.
 * El único caller es el modal de proveedor, que es un formulario de edición
 * completo —trae el proveedor entero cargado— y por eso la condición se cumple.
 *
 * La alternativa (omitir lo ausente, que es lo que esta función hacía) es
 * incompatible con esa UI: `DatosProveedor` no distingue "no lo toqué" de "lo
 * vacié", el formulario manda `undefined` en los dos casos, y el resultado era
 * que el botón "Quitar cuenta" no borraba nada mientras la pantalla informaba
 * "Proveedor actualizado". Una cuenta bancaria dada de baja seguía a la vista
 * para copiar y pegar en una transferencia.
 *
 * `pagos` sin cuentas se persiste como campo AUSENTE, nunca como `[]`
 * (ver `pagosOBorrado`).
 *
 * ### Misma política que `actualizarCliente`
 *
 * `actualizarCliente` sigue hoy el mismo contrato de reemplazo total, por el
 * mismo motivo y sobre el mismo tipo de caller (un modal de edición completo que
 * manda siempre la foto entera). Antes divergían —clientes solo usaba
 * `deleteField()` para el derivado `telefonoE164`—, y ese era el bug simétrico a
 * este. Si se toca una de las dos, revisar la otra.
 *
 * El chequeo de duplicados excluye al propio `proveedorId`, de modo que corregir
 * solo el uso de mayúsculas ("la rural" → "La Rural") es válido. No exige que el
 * proveedor esté en `existentes`: la suscripción puede no haberlo traído
 * todavía, y negarse a editar por eso rompería el uso offline.
 *
 * Mismo contrato en dos fases que `crearProveedor`, con la misma obligación de
 * encadenarle un `catch` a `sincronizacion`.
 *
 * @param existentes Proveedores ya conocidos por la pantalla, igual que en
 *   `crearProveedor`.
 * @throws {ProveedorInvalidoError} si el nombre queda vacío tras `trim()` o supera
 *   `LARGO_MAX_NOMBRE_PROVEEDOR`.
 * @throws {ProveedorDuplicadoError} si OTRO proveedor ya usa ese nombre. En ese
 *   caso no se escribe nada.
 */
export async function actualizarProveedor(
  db: Firestore,
  proveedorId: string,
  datos: DatosProveedor,
  existentes: readonly Proveedor[],
): Promise<{ sincronizacion: Promise<void> }> {
  const nombre = exigirNombre(datos.nombre);

  const homonimo = buscarHomonimo(existentes, nombre, proveedorId);
  if (homonimo !== undefined) {
    throw new ProveedorDuplicadoError(mensajeDuplicado(homonimo));
  }

  const cambios: DocumentData = {
    nombre,
    contactoNombre: textoOBorrado(datos.contactoNombre),
    telefono: textoOBorrado(datos.telefono),
    email: textoOBorrado(datos.email),
    direccion: textoOBorrado(datos.direccion),
    rut: textoOBorrado(datos.rut),
    pagos: pagosOBorrado(datos.pagos),
    notas: textoOBorrado(datos.notas),
  };

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
