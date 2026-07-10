import { useEffect, useMemo, useState } from 'react';
import { formatearMoney, peso, type Categoria, type ModoStock, type Pieza, type Producto } from '@gestion/core';
import { CampoBusqueda, ChipsFiltro, normalizarBusqueda } from '@gestion/ui';
import { BadgeStock } from '../stock/BadgeStock';
import { categoriasVisibles } from '../stock/agrupacion';

export interface GrillaProductosProps {
  productos: Producto[];
  /** Piezas disponibles, ya agrupadas por `productoId` (`agruparPiezasPorProducto`). */
  piezasAgrupadas: Map<string, Pieza[]>;
  /** Vocabulario de categorías (docs/06-ui-ux.md §3): con 0 o 1 categoría los
   * chips de filtro no aportan y no se muestran. */
  categorias: Categoria[];
  onSeleccionar: (producto: Producto) => void;
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
 *
 * Chips de filtro por categoría (docs/06-ui-ux.md §3, tarea UI-3d): debajo
 * de la búsqueda, calculados sobre el resultado YA filtrado por texto
 * (`categoriasVisibles`) para que compongan como AND — un chip sin match
 * bajo la búsqueda actual desaparece solo. Si la categoría elegida deja de
 * tener chip (p. ej. porque se tipeó una búsqueda que la excluye), el filtro
 * se resetea a "Todas" en vez de dejar la grilla en un callejón sin salida
 * (mismo criterio que el auto-reset de `alertaActiva` en `Stock.tsx`).
 */
export function GrillaProductos({ productos, piezasAgrupadas, categorias, onSeleccionar }: GrillaProductosProps) {
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);

  const filtradosPorBusqueda = useMemo(() => {
    const consulta = normalizarBusqueda(busqueda.trim());
    if (consulta === '') return productos;
    return productos.filter(
      (p) => normalizarBusqueda(p.nombre).includes(consulta) || normalizarBusqueda(p.categoria).includes(consulta),
    );
  }, [productos, busqueda]);

  const opcionesCategoria = useMemo(
    () => categoriasVisibles(filtradosPorBusqueda, categorias),
    [filtradosPorBusqueda, categorias],
  );

  useEffect(() => {
    if (categoriaFiltro === null) return;
    if (!opcionesCategoria.some((c) => c.nombre === categoriaFiltro)) setCategoriaFiltro(null);
  }, [categoriaFiltro, opcionesCategoria]);

  const filtrados = useMemo(() => {
    if (categoriaFiltro === null) return filtradosPorBusqueda;
    return filtradosPorBusqueda.filter((p) => p.categoria === categoriaFiltro);
  }, [filtradosPorBusqueda, categoriaFiltro]);

  return (
    <div className="flex flex-col gap-3">
      <CampoBusqueda
        valor={busqueda}
        onChange={setBusqueda}
        ariaLabel="Buscar producto"
        placeholder="Nombre o categoría"
      />

      {opcionesCategoria.length > 1 && (
        <ChipsFiltro
          ariaLabel="Filtrar por categoría"
          opciones={opcionesCategoria.map((c) => c.nombre)}
          valor={categoriaFiltro}
          onCambiar={setCategoriaFiltro}
        />
      )}

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
