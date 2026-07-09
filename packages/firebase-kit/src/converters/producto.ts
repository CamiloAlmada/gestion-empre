import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type Timestamp,
  type WithFieldValue,
} from 'firebase/firestore';
import { money, peso, type ModoPrecio, type ModoStock, type Producto } from '@gestion/core';

/**
 * Forma del documento `productos/{id}` tal como vive en Firestore: los mismos
 * campos que `Producto` salvo `id`, que sale de `snapshot.id`. `actualizadoEn`
 * es `Timestamp` en Firestore y `Date` en dominio.
 */
interface ProductoDoc {
  nombre: string;
  categoria: string;
  modoPrecio: ModoPrecio;
  modoStock: ModoStock;
  precioVentaCents: number;
  costoPromedioCents: number;
  margenObjetivoPct?: number;
  stockGranelGramos?: number;
  stockUnidades?: number;
  umbralAlertaStock?: number;
  proveedorPrincipalId?: string;
  activo: boolean;
  actualizadoEn: Timestamp;
}

/**
 * Mapea documentos `productos/{id}` ↔ el tipo de dominio `Producto`, siguiendo el
 * patrón de `usuarioConverter`.
 *
 * - `id` sale de `snapshot.id`, nunca se persiste como campo.
 * - `precioVentaCents` / `costoPromedioCents` se reconstruyen con `money()`:
 *   un doc corrupto con float explota al leer en lugar de propagarse.
 * - `stockGranelGramos` se reconstruye con `peso()`. `stockUnidades`,
 *   `umbralAlertaStock` y `margenObjetivoPct` son `number` planos en dominio
 *   (unidades enteras o puntos porcentuales, no magnitudes de peso/dinero).
 * - Campos opcionales ausentes en Firestore ↔ `undefined` en dominio (nunca
 *   se escribe `null`; si el campo no está definido, se omite del doc).
 */
export const productoConverter: FirestoreDataConverter<Producto> = {
  toFirestore(producto: WithFieldValue<Producto>): DocumentData {
    const {
      nombre,
      categoria,
      modoPrecio,
      modoStock,
      precioVentaCents,
      costoPromedioCents,
      margenObjetivoPct,
      stockGranelGramos,
      stockUnidades,
      umbralAlertaStock,
      proveedorPrincipalId,
      activo,
      actualizadoEn,
    } = producto;
    const doc: DocumentData = {
      nombre,
      categoria,
      modoPrecio,
      modoStock,
      precioVentaCents,
      costoPromedioCents,
      activo,
      actualizadoEn,
    };
    if (margenObjetivoPct !== undefined) doc.margenObjetivoPct = margenObjetivoPct;
    if (stockGranelGramos !== undefined) doc.stockGranelGramos = stockGranelGramos;
    if (stockUnidades !== undefined) doc.stockUnidades = stockUnidades;
    if (umbralAlertaStock !== undefined) doc.umbralAlertaStock = umbralAlertaStock;
    if (proveedorPrincipalId !== undefined) doc.proveedorPrincipalId = proveedorPrincipalId;
    return doc;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Producto {
    const datos = snapshot.data(options) as ProductoDoc;
    return {
      id: snapshot.id,
      nombre: datos.nombre,
      categoria: datos.categoria,
      modoPrecio: datos.modoPrecio,
      modoStock: datos.modoStock,
      precioVentaCents: money(datos.precioVentaCents),
      costoPromedioCents: money(datos.costoPromedioCents),
      margenObjetivoPct: datos.margenObjetivoPct,
      stockGranelGramos:
        datos.stockGranelGramos !== undefined ? peso(datos.stockGranelGramos) : undefined,
      stockUnidades: datos.stockUnidades,
      umbralAlertaStock: datos.umbralAlertaStock,
      proveedorPrincipalId: datos.proveedorPrincipalId,
      activo: datos.activo,
      actualizadoEn: datos.actualizadoEn.toDate(),
    };
  },
};
