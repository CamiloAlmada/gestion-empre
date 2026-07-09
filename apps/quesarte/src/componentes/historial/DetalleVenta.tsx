import { useMemo } from 'react';
import { doc, type Firestore } from 'firebase/firestore';
import { formatearMoney, type ItemVenta, type Venta } from '@gestion/core';
import { useDoc, usuarioConverter } from '@gestion/firebase-kit';
import { Button, DataTable, type ColumnaDataTable } from '@gestion/ui';
import { BadgeEstadoVenta } from './BadgeEstadoVenta';
import {
  ETIQUETAS_MEDIO_PAGO,
  formatearFechaHora,
  textoCantidadItem,
  textoPrecioUnitario,
} from './formato';

export interface DetalleVentaProps {
  venta: Venta;
  esAdmin: boolean;
  db: Firestore;
  onVolver: () => void;
  onAnular: () => void;
}

// Cada ítem de venta no trae id propio (es un array embebido, ver
// docs/02-dominio-quesarte.md): la clave de fila combina producto + pieza +
// posición para cubrir el caso (raro pero posible) de dos ítems del mismo
// producto/pieza en un mismo ticket.
interface FilaItem {
  item: ItemVenta;
  clave: string;
}

/**
 * Detalle de UNA venta, mostrado en la misma pantalla (sin ruta nueva) al
 * tocar una fila del listado — mismo patrón de drill-down que
 * `DetalleProducto` en Stock. Cabecera con número/fecha/vendedor/medio de
 * pago/estado, tabla de ítems y total. La acción de anular (solo admin, solo
 * si la venta sigue `completada`) la dispara acá pero la resuelve el modal de
 * confirmación en `Historial.tsx` (mismo patrón que los modales de escritura
 * de Stock: se abren desde el detalle, se orquestan desde la pantalla).
 */
export function DetalleVenta({ venta, esAdmin, db, onVolver, onAnular }: DetalleVentaProps) {
  // Lookup del nombre del vendedor: SOLO si `esAdmin`. Las reglas de
  // Firestore (`usuarios/{uid}`) dejan leer el doc de OTRO usuario únicamente
  // a un admin; un vendedor solo puede leer su propio doc (ver
  // firestore.rules, match /usuarios/{uid}). Para un vendedor, mostrar el uid
  // (aunque acortado) de quien vendió no aporta nada identificable —no tiene
  // con qué cruzarlo—, así que directamente mostramos "—". El admin ve el
  // nombre resuelto; mientras carga o si el doc no existe (usuario borrado),
  // cae al uid acortado en vez de dejar un hueco vacío.
  const usuarioRef = useMemo(
    () => (esAdmin ? doc(db, 'usuarios', venta.usuarioId).withConverter(usuarioConverter) : null),
    [esAdmin, db, venta.usuarioId],
  );
  const usuarioVendedor = useDoc(usuarioRef);
  const idCorto = venta.usuarioId.slice(0, 8);
  const vendedorLabel = esAdmin ? (usuarioVendedor.datos?.nombre ?? idCorto) : '—';

  const filasItems: FilaItem[] = venta.items.map((item, indice) => ({
    item,
    clave: `${item.productoId}-${item.piezaId ?? 'g'}-${indice}`,
  }));

  const columnas: ColumnaDataTable<FilaItem>[] = [
    { clave: 'producto', titulo: 'Producto', render: (f) => f.item.nombreProducto },
    {
      clave: 'cantidad',
      titulo: 'Peso/Cant.',
      render: (f) => textoCantidadItem(f.item),
      alinear: 'derecha',
    },
    {
      clave: 'precio',
      titulo: 'Precio unit.',
      render: (f) => textoPrecioUnitario(f.item),
      alinear: 'derecha',
    },
    {
      clave: 'subtotal',
      titulo: 'Subtotal',
      render: (f) => formatearMoney(f.item.subtotalCents),
      alinear: 'derecha',
    },
  ];

  // Con 4 columnas (nombre + 3 numéricas) y nombres de producto reales que no
  // son cortos ("Queso Colonia", "Salame tandilero"...), esta tabla desborda
  // en 360px — modo compacto obligatorio (docs/06-ui-ux.md §3). Fila
  // estática (los ítems de una venta ya cerrada no se editan).
  function filaCompactaItem(f: FilaItem) {
    return (
      <div className="flex min-h-[56px] flex-col gap-1 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-texto">{f.item.nombreProducto}</span>
          <span className="tabular-nums font-semibold text-texto">
            {formatearMoney(f.item.subtotalCents)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm text-texto-secundario">
          <span className="tabular-nums">{textoCantidadItem(f.item)}</span>
          <span className="tabular-nums">{textoPrecioUnitario(f.item)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onVolver}
        className="flex min-h-[44px] w-fit items-center gap-1 rounded text-sm font-medium text-texto-secundario hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        <span aria-hidden="true">‹</span> Volver a Historial
      </button>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-texto">Venta #{venta.numero}</h2>
          <BadgeEstadoVenta estado={venta.estado} />
        </div>
        <p className="text-texto-secundario">{formatearFechaHora(venta.fecha)}</p>
        <p className="text-sm text-texto-secundario">Vendedor: {vendedorLabel}</p>
        <p className="text-sm text-texto-secundario">
          Medio de pago: {ETIQUETAS_MEDIO_PAGO[venta.medioPago]}
        </p>
      </div>

      <DataTable
        columnas={columnas}
        filas={filasItems}
        claveFila={(f) => f.clave}
        etiqueta={`Ítems de la venta #${venta.numero}`}
        filaCompacta={filaCompactaItem}
        vacio="Esta venta no tiene ítems."
      />

      <p className="text-right text-lg font-bold tabular-nums text-texto">
        Total: {formatearMoney(venta.totalCents)}
      </p>

      {esAdmin && venta.estado === 'completada' && (
        <div className="flex justify-end">
          <Button variante="peligro" onClick={onAnular}>
            Anular venta
          </Button>
        </div>
      )}
    </div>
  );
}
