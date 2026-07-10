import {
  collection,
  doc,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { money, type Cliente } from '@gestion/core';
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
 * Copia a `doc` los campos de contacto opcionales que vengan definidos, ya
 * recortados. Omite los `undefined` (Firestore los rechaza; coherente con los
 * converters). Un opcional en blanco tras `trim()` se omite en el alta y se deja
 * como está en la edición: limpiar un campo es una acción explícita que esta
 * superficie no modela (Fase 1.5 no lo pide).
 */
function copiarContacto(datos: DatosCliente, destino: DocumentData): void {
  const { alias, telefono, email, direccion, notas } = datos;
  if (alias !== undefined && alias.trim().length > 0) destino.alias = alias.trim();
  if (telefono !== undefined && telefono.trim().length > 0) destino.telefono = telefono.trim();
  if (email !== undefined && email.trim().length > 0) destino.email = email.trim();
  if (direccion !== undefined && direccion.trim().length > 0) destino.direccion = direccion.trim();
  if (notas !== undefined && notas.trim().length > 0) destino.notas = notas.trim();
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
 * @throws {ClienteInvalidoError} si el nombre queda vacío tras `trim()`. Falla
 *   SINCRÓNICAMENTE, antes de generar id o escribir nada.
 */
export function crearCliente(
  db: Firestore,
  datos: DatosCliente,
): { clienteId: string; confirmacion: Promise<void> } {
  const nombre = exigirNombre(datos.nombre);

  const ref = doc(collection(db, 'clientes')).withConverter(clienteConverter);
  const cliente: Cliente = {
    id: ref.id,
    nombre,
    alias: datos.alias?.trim() || undefined,
    telefono: datos.telefono?.trim() || undefined,
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
 * Actualiza los datos de contacto de un cliente. NO toca `stats` (cache de ventas)
 * ni `activo` (usar `desactivarCliente`). Escribe solo los campos provistos y no
 * pasa por el converter: es un update parcial, no un reemplazo del doc.
 *
 * @throws {ClienteInvalidoError} si el nombre queda vacío tras `trim()`.
 */
export async function actualizarCliente(
  db: Firestore,
  clienteId: string,
  datos: DatosCliente,
): Promise<void> {
  const cambios: DocumentData = { nombre: exigirNombre(datos.nombre) };
  copiarContacto(datos, cambios);
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
