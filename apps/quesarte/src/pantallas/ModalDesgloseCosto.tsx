import { useEffect, useState, type ReactNode } from 'react';
import { Button, Modal } from '@gestion/ui';
import { formatearMoney, type Producto } from '@gestion/core';
import { formatearFecha } from '../componentes/stock/resumen';
import { useDesgloseUltimaCompra } from '../componentes/compras/useDesgloseUltimaCompra';

export interface ModalDesgloseCostoProps {
  abierto: boolean;
  /** `null` solo mientras el modal termina de cerrarse (mismo patrón que
   * `ModalPrecio`: esta instancia no se desmonta al cerrar). */
  producto: Producto | null;
  onCerrar: () => void;
}

/**
 * Modal de SOLO LECTURA con el desglose de costo de la ÚLTIMA compra
 * CONFIRMADA que incluyó el producto (COSTO-1, docs/03-compras-costos-precios.md).
 * Se abre desde el botón ⓘ de `Precios.tsx`.
 *
 * **Query lazy** (`abierto ? query(...) : null` → `useCollection`, que
 * desactiva la suscripción con `query: null`): se suscribe SOLO mientras el
 * modal está abierto, para que la pantalla de Precios no pague una
 * suscripción permanente por esto. `where('estado', '==', 'confirmada') +
 * orderBy('fecha', 'desc')` — cubierta por el índice compuesto `compras
 * (estado ASC, fecha DESC)` YA declarado en `firestore.indexes.json` (lo
 * dejó F2-F1 anticipando exactamente esta query; `Compras.tsx` documenta que
 * hoy no lo consume porque lista sin filtrar — este modal pasa a ser su
 * primer consumidor real). CERO índice nuevo.
 *
 * `ultimaCompraConProducto` filtra client-side por `productoId` (las compras
 * no denormalizan qué productos incluyen — doc 03, cero cambio de modelo) —
 * la colección de compras de un comercio chico (semanales/quincenales) no
 * justifica una query por producto.
 *
 * Offline: con persistencia habilitada, `useCollection` resuelve de caché.
 * Si no se encuentra el producto en ninguna compra cargada, hay dos lecturas
 * posibles e indistinguibles con los datos disponibles: "de verdad no hay
 * compra" o "la caché está incompleta sin conexión". Se desambigua con
 * `useOnlineStatus` (no es una advertencia preventiva: solo aparece cuando
 * la búsqueda YA resolvió "no encontrado" estando offline).
 *
 * COSTO-2: toda la plomería de Firestore (query lazy, búsqueda client-side)
 * vive en `useDesgloseUltimaCompra`, compartida con la línea inline de
 * `ModalPrecio` — este componente solo decide CÓMO mostrarlo (modal
 * detallado con estados de carga/error/vacío, vs. una línea compacta).
 */
export function ModalDesgloseCosto({ abierto, producto, onCerrar }: ModalDesgloseCostoProps) {
  const [productoMostrado, setProductoMostrado] = useState<Producto | null>(null);

  useEffect(() => {
    if (producto !== null) setProductoMostrado(producto);
  }, [producto]);

  const { desglose, cargando, error, enLinea, reintentar } = useDesgloseUltimaCompra(productoMostrado, abierto);

  if (productoMostrado === null) {
    // Nunca se abrió todavía: el `<dialog>` no está `open`, nada visible que
    // perder mostrando el modal vacío (mismo criterio que `ModalPrecio`).
    return (
      <Modal abierto={false} onCerrar={onCerrar} titulo="Desglose de costo">
        {null}
      </Modal>
    );
  }

  let contenido: ReactNode;
  if (cargando) {
    contenido = <p className="text-sm text-texto-secundario">Cargando desglose…</p>;
  } else if (error !== null) {
    contenido = (
      <div role="alert" className="flex flex-col items-center gap-3 text-center">
        <p className="text-peligro">No se pudo cargar el desglose de costo.</p>
        <Button variante="secundaria" onClick={reintentar}>
          Reintentar
        </Button>
      </div>
    );
  } else if (desglose !== null) {
    const sufijo = desglose.unidad === 'kg' ? ' /kg' : ' /u';
    contenido = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 text-sm text-texto-secundario">
          <span>{formatearFecha(desglose.fecha)}</span>
          <span>{desglose.proveedorNombre}</span>
        </div>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-texto-secundario">Mercadería</dt>
            <dd className="tabular-nums text-texto">{`${formatearMoney(desglose.mercaderiaCents)}${sufijo}`}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-texto-secundario">Gastos de viaje prorrateados</dt>
            <dd className="tabular-nums text-texto">{`${formatearMoney(desglose.gastosCents)}${sufijo}`}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-borde pt-2 font-medium">
            <dt className="text-texto">Costo real</dt>
            <dd className="tabular-nums text-texto">{`${formatearMoney(desglose.costoRealCents)}${sufijo}`}</dd>
          </div>
        </dl>
        <p className="text-sm text-texto-secundario">
          El costo promedio vigente puede mezclar esta compra con compras anteriores y stock previo.
        </p>
      </div>
    );
  } else if (!enLinea) {
    contenido = (
      <p role="status" className="text-sm text-advertencia">
        Necesitás conexión para ver el desglose de costo.
      </p>
    );
  } else {
    contenido = (
      <p className="text-sm text-texto-secundario">
        El costo actual no proviene de una compra registrada.
      </p>
    );
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Desglose de costo · ${productoMostrado.nombre}`}
      acciones={
        <Button variante="secundaria" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      {contenido}
    </Modal>
  );
}
