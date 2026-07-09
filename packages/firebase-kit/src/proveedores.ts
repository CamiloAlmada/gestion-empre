import {
  collection,
  doc,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { type DatosPago, type Proveedor } from '@gestion/core';
import { proveedorConverter } from './converters/proveedor';
import { ProveedorInvalidoError } from './errores';

/**
 * ABM de proveedores (`proveedores/{id}`, ver doc 07). Superficie que la pantalla
 * de proveedores (solo admin) consume: alta, edición y desactivación. No hay
 * borrado físico (se desactiva con `activo: false`).
 *
 * A diferencia de clientes, el proveedor no tiene `stats` ni lo escribe el POS:
 * las reglas lo dejan solo para admin (el vendedor no ve datos bancarios).
 */

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
 * Valida y normaliza el nombre: recorta espacios y exige no vacío.
 *
 * @throws {ProveedorInvalidoError} si queda vacío tras `trim()`.
 */
function exigirNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) {
    throw new ProveedorInvalidoError('El nombre del proveedor no puede estar vacío.');
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
 * Crea un proveedor con `fechaAlta = new Date()` y `activo: true`.
 *
 * @throws {ProveedorInvalidoError} si el nombre queda vacío tras `trim()`.
 */
export async function crearProveedor(
  db: Firestore,
  datos: DatosProveedor,
): Promise<{ proveedorId: string }> {
  const nombre = exigirNombre(datos.nombre);

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
  await setDoc(ref, proveedor);

  return { proveedorId: ref.id };
}

/**
 * Actualiza los datos de un proveedor. NO toca `activo` (usar `desactivarProveedor`).
 * Escribe solo los campos provistos; update parcial, no pasa por el converter.
 *
 * @throws {ProveedorInvalidoError} si el nombre queda vacío tras `trim()`.
 */
export async function actualizarProveedor(
  db: Firestore,
  proveedorId: string,
  datos: DatosProveedor,
): Promise<void> {
  const cambios: DocumentData = { nombre: exigirNombre(datos.nombre) };
  copiarDatos(datos, cambios);
  await updateDoc(doc(db, 'proveedores', proveedorId), cambios);
}

/** Desactiva un proveedor (`activo: false`). No borra: preserva historial. */
export async function desactivarProveedor(db: Firestore, proveedorId: string): Promise<void> {
  await updateDoc(doc(db, 'proveedores', proveedorId), { activo: false });
}
