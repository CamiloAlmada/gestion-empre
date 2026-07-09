import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type Timestamp,
  type WithFieldValue,
} from 'firebase/firestore';
import { money, type Cliente, type StatsCliente } from '@gestion/core';

/**
 * Forma del sub-mapa `stats` embebido en `clientes/{id}` (ver `StatsCliente`).
 * `totalHistoricoCents` es entero (centésimos); las fechas son `Timestamp` en
 * Firestore y `Date` en dominio.
 */
interface StatsClienteDoc {
  cantidadVentas: number;
  totalHistoricoCents: number;
  primeraCompra?: Timestamp;
  ultimaCompra?: Timestamp;
}

/**
 * Forma del documento `clientes/{id}` tal como vive en Firestore: los mismos
 * campos que `Cliente` salvo `id`, que sale de `snapshot.id`. `fechaAlta` es
 * `Timestamp` en Firestore y `Date` en dominio; `stats` va embebido.
 */
interface ClienteDoc {
  nombre: string;
  alias?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  notas?: string;
  fechaAlta: Timestamp;
  activo: boolean;
  stats: StatsClienteDoc;
}

function statsADoc(stats: StatsCliente): DocumentData {
  const { cantidadVentas, totalHistoricoCents, primeraCompra, ultimaCompra } = stats;
  const doc: DocumentData = { cantidadVentas, totalHistoricoCents };
  if (primeraCompra !== undefined) doc.primeraCompra = primeraCompra;
  if (ultimaCompra !== undefined) doc.ultimaCompra = ultimaCompra;
  return doc;
}

function statsDeDoc(doc: StatsClienteDoc): StatsCliente {
  return {
    cantidadVentas: doc.cantidadVentas,
    totalHistoricoCents: money(doc.totalHistoricoCents),
    primeraCompra: doc.primeraCompra?.toDate(),
    ultimaCompra: doc.ultimaCompra?.toDate(),
  };
}

/**
 * Mapea documentos `clientes/{id}` ↔ el tipo de dominio `Cliente`, siguiendo el
 * patrón de `usuarioConverter` / `piezaConverter`.
 *
 * - `id` sale de `snapshot.id`, nunca se persiste como campo.
 * - `stats.totalHistoricoCents` se reconstruye con `money()`: un doc corrupto con
 *   float explota al leer en lugar de propagarse.
 * - Campos opcionales de contacto y las fechas de `stats` ausentes en Firestore ↔
 *   `undefined` en dominio; si están `undefined` al escribir, se omiten del doc
 *   (nunca `null`).
 *
 * IMPORTANTE: los increments de `stats` en la venta/anulación NO pasan por este
 * converter (usan `batch.update` sobre rutas de campo `stats.x` con
 * `FieldValue.increment()`, ver `ventas.ts`). El converter solo interviene en el
 * alta completa (`crearCliente`) y en las lecturas.
 */
export const clienteConverter: FirestoreDataConverter<Cliente> = {
  toFirestore(cliente: WithFieldValue<Cliente>): DocumentData {
    const { nombre, alias, telefono, email, direccion, notas, fechaAlta, activo } = cliente;
    const doc: DocumentData = {
      nombre,
      fechaAlta,
      activo,
      stats: statsADoc(cliente.stats as StatsCliente),
    };
    if (alias !== undefined) doc.alias = alias;
    if (telefono !== undefined) doc.telefono = telefono;
    if (email !== undefined) doc.email = email;
    if (direccion !== undefined) doc.direccion = direccion;
    if (notas !== undefined) doc.notas = notas;
    return doc;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Cliente {
    const datos = snapshot.data(options) as ClienteDoc;
    return {
      id: snapshot.id,
      nombre: datos.nombre,
      alias: datos.alias,
      telefono: datos.telefono,
      email: datos.email,
      direccion: datos.direccion,
      notas: datos.notas,
      fechaAlta: datos.fechaAlta.toDate(),
      activo: datos.activo,
      stats: statsDeDoc(datos.stats),
    };
  },
};
