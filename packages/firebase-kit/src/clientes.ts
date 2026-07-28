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
import { money, normalizarTelefono, type Cliente } from '@gestion/core';
import { clienteConverter } from './converters/cliente';
import { ClienteInvalidoError } from './errores';

/**
 * ABM de clientes (`clientes/{id}`, ver doc 07). Superficie completa que las
 * pantallas de Fase 1.5 SOLO consumen: alta (rápida o completa), edición de datos
 * de contacto y desactivación. No hay borrado físico (se desactiva con
 * `activo: false`, coherente con usuarios).
 *
 * `stats` NO se toca desde acá: es un cache que solo mutan `registrarVenta` /
 * `anularVenta` con `FieldValue.increment()` en el batch de la venta (doc 07,
 * decisión 5). `crearCliente` lo inicializa en cero y `actualizarCliente` lo
 * deja intacto (las reglas de vendedor y admin dependen de esa separación).
 *
 * ## El alta OMITE los campos vacíos; la edición los BORRA
 *
 * Las dos superficies interpretan distinto un campo de contacto ausente o vacío
 * en `DatosCliente`, y es a propósito (misma división que en `proveedores.ts`):
 *
 * - `crearCliente` construye el documento entero y lo escribe con `setDoc` a
 *   través del converter: un campo vacío simplemente no se escribe. Ahí
 *   `deleteField()` sería además un error (no se puede borrar un campo de un
 *   documento que todavía no existe).
 * - `actualizarCliente` hace un `updateDoc` parcial, donde un campo ausente
 *   quedaría con su valor viejo. Por eso traduce "ausente o vacío" a
 *   `deleteField()`: ver el contrato de reemplazo total en su propio doc.
 */

/**
 * Datos editables de un cliente (todo opcional salvo `nombre`). Sirve tanto para
 * el alta rápida del POS (solo `nombre`) como para el alta/edición completa.
 */
export interface DatosCliente {
  nombre: string;
  alias?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  notas?: string;
}

/**
 * Valida y normaliza el nombre: recorta espacios y exige no vacío.
 *
 * @throws {ClienteInvalidoError} si queda vacío tras `trim()`.
 */
function exigirNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) {
    throw new ClienteInvalidoError('El nombre del cliente no puede estar vacío.');
  }
  return limpio;
}

/**
 * Valor de un campo de texto opcional en el update: el texto recortado si trae
 * contenido, y si no la sentinela de borrado. Solo la usa `actualizarCliente`
 * (el alta arma el documento por su cuenta, ver el doc del módulo).
 */
function textoOBorrado(valor: string | undefined): string | FieldValue {
  const limpio = valor?.trim() ?? '';
  return limpio.length > 0 ? limpio : deleteField();
}

/**
 * Crea un cliente con `stats` en cero, `fechaAlta = new Date()` y `activo: true`.
 * Sirve para el alta rápida (solo `nombre`) y para el alta completa (con datos de
 * contacto). No lee de Firestore: el alta rápida debe funcionar offline (doc 06 §8).
 *
 * Devuelve el `clienteId` de forma SÍNCRONA: el id se genera 100% client-side
 * (`doc(collection(...))`), sin round-trip al servidor, así que el POS puede
 * asociar el cliente recién creado a la venta EN CURSO al instante, con o sin
 * conexión (criterio del doc 07: "alta rápida desde el POS funcionando offline";
 * patrón de escrituras del doc 06 §8). `confirmacion` es la promesa del `setDoc`:
 * resuelve cuando el servidor acusa la escritura (offline, recién al reconectar).
 * El caller usa el id ya mismo y decide si observa `confirmacion` (para avisar de
 * un fallo de sincronización) o la ignora — nunca necesita esperarla para el id.
 *
 * `codigoPais` (default `'598'`) es el código que la UI toma de
 * `configuracion.general.codigoPaisDefault` en pantalla y pasa acá para derivar
 * `telefonoE164`; no se lee de Firestore (el alta rápida funciona offline).
 *
 * @throws {ClienteInvalidoError} si el nombre queda vacío tras `trim()`. Falla
 *   SINCRÓNICAMENTE, antes de generar id o escribir nada.
 */
export function crearCliente(
  db: Firestore,
  datos: DatosCliente,
  codigoPais: string = '598',
): { clienteId: string; confirmacion: Promise<void> } {
  const nombre = exigirNombre(datos.nombre);

  const telefono = datos.telefono?.trim() || undefined;
  // `telefonoE164` se DERIVA del display (doc 08): normalizable → dígitos E.164;
  // ausente o no normalizable → se omite (el converter no lo escribe), y el botón
  // de WhatsApp no aparece. Cero lecturas: `codigoPais` lo trae el caller.
  const telefonoE164 =
    telefono !== undefined ? (normalizarTelefono(telefono, codigoPais) ?? undefined) : undefined;

  const ref = doc(collection(db, 'clientes')).withConverter(clienteConverter);
  const cliente: Cliente = {
    id: ref.id,
    nombre,
    alias: datos.alias?.trim() || undefined,
    telefono,
    telefonoE164,
    email: datos.email?.trim() || undefined,
    direccion: datos.direccion?.trim() || undefined,
    notas: datos.notas?.trim() || undefined,
    fechaAlta: new Date(),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
  };
  const confirmacion = setDoc(ref, cliente);

  return { clienteId: ref.id, confirmacion };
}

/**
 * Actualiza los datos de contacto de un cliente. NO toca `stats` (cache de ventas),
 * ni `activo` (usar `desactivarCliente`), ni `fechaAlta`. Update parcial: escribe
 * `nombre`, los cinco campos de contacto y el derivado `telefonoE164`, y no pasa
 * por el converter (no reemplaza el documento).
 *
 * ## Reemplazo TOTAL de los campos de contacto
 *
 * `datos` es la foto completa de los campos de contacto editables, no un delta: un
 * campo ausente o vacío en `DatosCliente` **borra** el valor guardado
 * (`deleteField()`). Vaciar el alias, el teléfono, el email, la dirección o las
 * notas en el modal los borra de verdad.
 *
 * El caller DEBE, entonces, mandar SIEMPRE todos los campos que quiere conservar.
 * El único caller es `DetalleClientePantalla`, que pasa el payload de
 * `ModalCliente` —un formulario de edición completo, precargado con el cliente
 * entero—, y por eso la condición se cumple.
 *
 * La alternativa (omitir lo ausente, que es lo que esta función hacía) es
 * incompatible con esa UI: `DatosCliente` no distingue "no lo toqué" de "lo
 * vacié", el formulario manda `undefined` en los dos casos, y el resultado era que
 * vaciar un campo no borraba nada mientras la pantalla informaba "Cliente
 * actualizado".
 *
 * El alcance del reemplazo total son SOLO esos cinco campos más `telefonoE164`;
 * `nombre` se reescribe siempre, y `fechaAlta`, `activo` y `stats` ni aparecen en
 * el payload (`stats` lo escribe el POS al cobrar, doc 07 decisión 5).
 *
 * ## `telefonoE164` sigue al teléfono display
 *
 * `telefonoE164` (derivado, doc 08) espeja el `telefono` que este update escribe:
 * - teléfono con contenido y normalizable → se escriben los dos;
 * - teléfono con contenido pero NO normalizable (p. ej. `'sin numero'`) → se
 *   escribe el display y se BORRA el E164 (un link a un número que ya no coincide
 *   es peor que ninguno);
 * - teléfono ausente o vacío → se borran LOS DOS. Un E164 huérfano seguiría
 *   alimentando los links `wa.me` (doc 08) hacia un número que el admin dio de baja.
 *
 * `normalizarTelefono` solo corre cuando hay un teléfono de verdad.
 *
 * NOTA: hasta este cambio la política era la opuesta —"limpiar el teléfono display
 * no lo modela esta superficie (igual que en Fase 1.5)"— y estaba documentada como
 * deliberada. Ya no aplica: la UI ofrece la acción de vaciar el campo, y no hacer
 * nada mientras se informa "guardado" es peor que no ofrecerla.
 *
 * `codigoPais` (default `'598'`): igual que en `crearCliente`, lo pasa la UI desde
 * la config en pantalla; no se lee de Firestore.
 *
 * @throws {ClienteInvalidoError} si el nombre queda vacío tras `trim()`. Falla
 *   antes de escribir nada.
 */
export async function actualizarCliente(
  db: Firestore,
  clienteId: string,
  datos: DatosCliente,
  codigoPais: string = '598',
): Promise<void> {
  const nombre = exigirNombre(datos.nombre);

  // Se deriva del display recortado, no de `cambios.telefono`: ahí el valor puede
  // ser ya la sentinela de borrado, y pasársela a `normalizarTelefono` exigiría un
  // cast que miente.
  const telefono = datos.telefono?.trim() ?? '';
  const telefonoE164: string | FieldValue =
    telefono.length > 0
      ? (normalizarTelefono(telefono, codigoPais) ?? deleteField())
      : deleteField();

  const cambios: DocumentData = {
    nombre,
    alias: textoOBorrado(datos.alias),
    telefono: textoOBorrado(telefono),
    telefonoE164,
    email: textoOBorrado(datos.email),
    direccion: textoOBorrado(datos.direccion),
    notas: textoOBorrado(datos.notas),
  };

  await updateDoc(doc(db, 'clientes', clienteId), cambios);
}

/** Desactiva un cliente (`activo: false`). No borra: preserva historial y stats. */
export async function desactivarCliente(db: Firestore, clienteId: string): Promise<void> {
  await updateDoc(doc(db, 'clientes', clienteId), { activo: false });
}

/** Reactiva un cliente (`activo: true`). Inversa de `desactivarCliente`. */
export async function reactivarCliente(db: Firestore, clienteId: string): Promise<void> {
  await updateDoc(doc(db, 'clientes', clienteId), { activo: true });
}
