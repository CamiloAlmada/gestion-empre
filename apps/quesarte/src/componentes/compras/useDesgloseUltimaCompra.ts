import { useEffect, useMemo, useState } from 'react';
import { collection, orderBy, query, where, type FirestoreError } from 'firebase/firestore';
import type { Producto } from '@gestion/core';
import { compraConverter, useCollection, useOnlineStatus } from '@gestion/firebase-kit';
import { db } from '../../firebase';
import { desglosarCosto, ultimaCompraConProducto, type DesgloseCosto } from './desgloseCosto';

const coleccionCompras = collection(db, 'compras').withConverter(compraConverter);

export interface EstadoDesgloseUltimaCompra {
  /** `null` mientras carga, si hubo error, si `producto` es `null`, o si no
   * hay ninguna compra CONFIRMADA que incluya el producto (costo por ingreso
   * manual — ver `desgloseCosto.ts`). Los tres casos son indistinguibles
   * mirando solo este campo A PROPÓSITO: cada llamador decide cuánto detalle
   * de ese "no hay nada que mostrar" necesita (`ModalDesgloseCosto` sí lo
   * distingue con `cargando`/`error`/`enLinea`; la línea inline de
   * `ModalPrecio`, COSTO-2, los trata todos igual: no aparece). */
  desglose: DesgloseCosto | null;
  cargando: boolean;
  error: FirestoreError | null;
  enLinea: boolean;
  reintentar: () => void;
}

/**
 * Hook compartido entre `ModalDesgloseCosto` (COSTO-1, modal ⓘ de Precios) y
 * `ModalPrecio` (COSTO-2, línea inline "Última compra") — mismo dato, dos
 * presentaciones. Encapsula TODA la plomería de Firestore de COSTO-1 para
 * que ningún llamador la reimplemente:
 *
 * - **Query lazy**: se suscribe a `compras` (`where estado==confirmada +
 *   orderBy fecha desc` — cubierta por el índice compuesto `compras(estado,
 *   fecha)` ya declarado en `firestore.indexes.json`, cero índice nuevo)
 *   SOLO mientras `activo` es `true`. Cada llamador ata `activo` a su propio
 *   `abierto`: ninguno paga una suscripción permanente por esto.
 * - **Búsqueda client-side**: `ultimaCompraConProducto` + `desglosarCosto`
 *   (mismos helpers puros de COSTO-1, sin cambios) sobre `producto`.
 *
 * `producto: null` (aún no se abrió ningún producto, o el modal está
 * terminando de cerrarse) devuelve `desglose: null` sin tocar la
 * suscripción — el llamador decide qué `producto` pasarle (típicamente su
 * propio "último producto mostrado" estable, ver `ModalPrecio`/
 * `ModalDesgloseCosto`).
 */
export function useDesgloseUltimaCompra(producto: Producto | null, activo: boolean): EstadoDesgloseUltimaCompra {
  const enLinea = useOnlineStatus();
  const [intentoId, setIntentoId] = useState(0);

  // Reintentar (más abajo) solo tiene sentido mientras sigue activo para el
  // mismo producto; al reactivar para otro se resetea solo.
  useEffect(() => {
    setIntentoId(0);
  }, [activo, producto]);

  const consultaCompras = useMemo(
    () =>
      activo ? query(coleccionCompras, where('estado', '==', 'confirmada'), orderBy('fecha', 'desc')) : null,
    [activo, intentoId],
  );
  const { datos: compras, cargando, error } = useCollection(consultaCompras);

  const desglose = useMemo(() => {
    if (producto === null) return null;
    const encontrado = ultimaCompraConProducto(compras, producto.id);
    return encontrado !== null ? desglosarCosto(producto, encontrado.compra, encontrado.item) : null;
  }, [compras, producto]);

  function reintentar() {
    setIntentoId((n) => n + 1);
  }

  return { desglose, cargando, error, enLinea, reintentar };
}
