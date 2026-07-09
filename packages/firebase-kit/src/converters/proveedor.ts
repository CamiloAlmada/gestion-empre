import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type Timestamp,
  type WithFieldValue,
} from 'firebase/firestore';
import { type DatosPago, type Proveedor } from '@gestion/core';

/** Forma de una cuenta de pago embebida en `proveedores/{id}` (ver `DatosPago`). */
interface DatosPagoDoc {
  banco: string;
  cuenta: string;
  titular?: string;
  moneda?: string;
}

/**
 * Forma del documento `proveedores/{id}` tal como vive en Firestore: los mismos
 * campos que `Proveedor` salvo `id`, que sale de `snapshot.id`. `fechaAlta` es
 * `Timestamp` en Firestore y `Date` en dominio; `pagos` va embebido.
 */
interface ProveedorDoc {
  nombre: string;
  contactoNombre?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  rut?: string;
  pagos?: DatosPagoDoc[];
  notas?: string;
  fechaAlta: Timestamp;
  activo: boolean;
}

function pagoADoc(pago: DatosPago): DatosPagoDoc {
  const { banco, cuenta, titular, moneda } = pago;
  const doc: DatosPagoDoc = { banco, cuenta };
  if (titular !== undefined) doc.titular = titular;
  if (moneda !== undefined) doc.moneda = moneda;
  return doc;
}

function pagoDeDoc(doc: DatosPagoDoc): DatosPago {
  return {
    banco: doc.banco,
    cuenta: doc.cuenta,
    titular: doc.titular,
    moneda: doc.moneda,
  };
}

/**
 * Mapea documentos `proveedores/{id}` ↔ el tipo de dominio `Proveedor`, siguiendo
 * el patrón de `usuarioConverter`. El proveedor no tiene magnitudes de dinero ni
 * peso propias (los costos viven en las compras), así que no hay `money()`/`peso()`
 * que revalidar acá.
 *
 * - `id` sale de `snapshot.id`, nunca se persiste como campo.
 * - Campos opcionales ausentes en Firestore ↔ `undefined` en dominio; si están
 *   `undefined` al escribir, se omiten del doc (nunca `null`). Cada `DatosPago`
 *   embebido se mapea con el mismo cuidado (omite `titular`/`moneda` ausentes).
 */
export const proveedorConverter: FirestoreDataConverter<Proveedor> = {
  toFirestore(proveedor: WithFieldValue<Proveedor>): DocumentData {
    const { nombre, contactoNombre, telefono, email, direccion, rut, pagos, notas, fechaAlta, activo } =
      proveedor;
    const doc: DocumentData = { nombre, fechaAlta, activo };
    if (contactoNombre !== undefined) doc.contactoNombre = contactoNombre;
    if (telefono !== undefined) doc.telefono = telefono;
    if (email !== undefined) doc.email = email;
    if (direccion !== undefined) doc.direccion = direccion;
    if (rut !== undefined) doc.rut = rut;
    if (pagos !== undefined) doc.pagos = (pagos as DatosPago[]).map(pagoADoc);
    if (notas !== undefined) doc.notas = notas;
    return doc;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Proveedor {
    const datos = snapshot.data(options) as ProveedorDoc;
    return {
      id: snapshot.id,
      nombre: datos.nombre,
      contactoNombre: datos.contactoNombre,
      telefono: datos.telefono,
      email: datos.email,
      direccion: datos.direccion,
      rut: datos.rut,
      pagos: datos.pagos?.map(pagoDeDoc),
      notas: datos.notas,
      fechaAlta: datos.fechaAlta.toDate(),
      activo: datos.activo,
    };
  },
};
