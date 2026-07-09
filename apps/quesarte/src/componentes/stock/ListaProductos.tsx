import type { Pieza, Producto } from '@gestion/core';
import { BadgeStock } from './BadgeStock';
import { calcularResumen, peorEstadoVencimiento, stockBajo, textoResumen } from './resumen';

export interface ListaProductosProps {
  productos: Producto[];
  /** Piezas disponibles, ya agrupadas por `productoId` (`agruparPiezasPorProducto`). */
  piezasAgrupadas: Map<string, Pieza[]>;
  onSeleccionar: (producto: Producto) => void;
  /**
   * Oculta el subtítulo de categoría de cada fila. Se usa cuando la lista se
   * renderiza agrupada por categoría (`ListaProductosAgrupada`): el
   * encabezado de sección ya comunica esa información, repetirla por fila es
   * redundante. Por defecto `false` (lista plana, como antes).
   */
  ocultarCategoria?: boolean;
}

/**
 * Lista maestra de productos activos: una fila-botón por producto con su
 * resumen de stock (según `modoStock`) y las alertas visuales que apliquen
 * (vencimiento, stock bajo). Tocar una fila selecciona el producto (el
 * llamador decide qué hacer con eso — ver `Stock.tsx`).
 */
export function ListaProductos({
  productos,
  piezasAgrupadas,
  onSeleccionar,
  ocultarCategoria = false,
}: ListaProductosProps) {
  return (
    <ul className="flex flex-col gap-2">
      {productos.map((producto) => {
        const piezasDelProducto = piezasAgrupadas.get(producto.id) ?? [];
        const resumen = calcularResumen(producto, piezasDelProducto);
        const bajo = stockBajo(producto, resumen);
        const estadoVenc =
          resumen.tipo === 'piezas'
            ? peorEstadoVencimiento(piezasDelProducto.map((p) => p.fechaVencimiento))
            : null;

        return (
          <li key={producto.id}>
            <button
              type="button"
              onClick={() => onSeleccionar(producto)}
              className="flex min-h-[56px] w-full flex-col gap-1 rounded-2xl border border-borde bg-superficie p-4 text-left transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-texto">{producto.nombre}</span>
                {!ocultarCategoria && (
                  <span className="text-sm text-texto-secundario">{producto.categoria}</span>
                )}
              </div>
              <span className="tabular-nums text-texto-secundario">{textoResumen(resumen)}</span>
              {(estadoVenc !== null || bajo) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {estadoVenc === 'vencida' && <BadgeStock variante="peligro">Vencida</BadgeStock>}
                  {estadoVenc === 'vence_pronto' && <BadgeStock variante="advertencia">Vence pronto</BadgeStock>}
                  {bajo && <BadgeStock variante="advertencia">Stock bajo</BadgeStock>}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
