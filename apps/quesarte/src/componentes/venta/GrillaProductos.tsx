import { useMemo, useState } from 'react';
import { formatearMoney, peso, type ModoStock, type Pieza, type Producto } from '@gestion/core';
import { Input } from '@gestion/ui';
import { BadgeStock } from '../stock/BadgeStock';

export interface GrillaProductosProps {
  productos: Producto[];
  /** Piezas disponibles, ya agrupadas por `productoId` (`agruparPiezasPorProducto`). */
  piezasAgrupadas: Map<string, Pieza[]>;
  onSeleccionar: (producto: Producto) => void;
}

/** Minúsculas y sin diacríticos, para que la búsqueda ignore acentos (mismo criterio que `Productos.tsx`). */
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Qué le espera al vendedor al tocar la card, según `modoStock` (docs/02). */
const INDICACION_MODO: Record<ModoStock, string> = {
  fraccionado_por_pieza: 'Al peso',
  pieza_entera: 'Pieza entera',
  granel: 'Granel · al peso',
  unidad_simple: 'Por unidad',
};

function sinStock(producto: Producto, piezasAgrupadas: Map<string, Pieza[]>): boolean {
  switch (producto.modoStock) {
    case 'fraccionado_por_pieza':
    case 'pieza_entera':
      return (piezasAgrupadas.get(producto.id) ?? []).length === 0;
    case 'granel':
      return (producto.stockGranelGramos ?? peso(0)) <= 0;
    case 'unidad_simple':
      return (producto.stockUnidades ?? 0) <= 0;
  }
}

/**
 * Buscador + grilla de productos activos del POS (docs/06-ui-ux.md §6:
 * "búsqueda con teclado arriba, resultados en grilla de cards grandes").
 * Tocar una card dispara `onSeleccionar`; el llamador decide qué modal de
 * "agregar" abrir según el `modoStock` del producto.
 */
export function GrillaProductos({ productos, piezasAgrupadas, onSeleccionar }: GrillaProductosProps) {
  const [busqueda, setBusqueda] = useState('');

  const filtrados = useMemo(() => {
    const consulta = normalizarTexto(busqueda.trim());
    if (consulta === '') return productos;
    return productos.filter(
      (p) => normalizarTexto(p.nombre).includes(consulta) || normalizarTexto(p.categoria).includes(consulta),
    );
  }, [productos, busqueda]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        label="Buscar producto"
        value={busqueda}
        onChange={setBusqueda}
        placeholder="Nombre o categoría"
      />

      {filtrados.length === 0 ? (
        <p className="py-4 text-center text-texto-secundario">
          Sin resultados para &quot;{busqueda.trim()}&quot;.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((producto) => {
            const agotado = sinStock(producto, piezasAgrupadas);
            return (
              <li key={producto.id}>
                <button
                  type="button"
                  onClick={() => onSeleccionar(producto)}
                  disabled={agotado}
                  className="flex min-h-[96px] w-full flex-col justify-between gap-1 rounded-card border border-borde bg-superficie p-4 text-left transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-superficie"
                >
                  <span className="font-semibold text-texto">{producto.nombre}</span>
                  <span className="tabular-nums text-texto">
                    {formatearMoney(producto.precioVentaCents)}
                    {producto.modoPrecio === 'por_kg' ? ' /kg' : ' /u'}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-texto-secundario">
                      {INDICACION_MODO[producto.modoStock]}
                    </span>
                    {agotado && <BadgeStock variante="peligro">Sin stock</BadgeStock>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
