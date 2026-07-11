import { useEffect, useMemo, useState } from 'react';
import type { Producto } from '@gestion/core';
import { CampoBusqueda, Modal, normalizarBusqueda } from '@gestion/ui';

export interface SelectorProductoCompraProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Productos activos, ya suscriptos por `CompraPantalla` (sin lectura propia). */
  productos: Producto[];
  cargando: boolean;
  error: boolean;
  /** Proveedor elegido de la compra (para la sugerencia), o `null`. */
  proveedorId: string | null;
  /** `productoId` de los ítems que YA están en la compra: se marcan "Agregado"
   * pero siguen tocables (tocarlos abre el ítem para EDITARLO, decisión de
   * `CompraPantalla`). */
  productoIdsAgregados: Set<string>;
  onSeleccionar: (producto: Producto) => void;
}

function coincide(producto: Producto, consulta: string): boolean {
  if (consulta === '') return true;
  return normalizarBusqueda(producto.nombre).includes(consulta);
}

/**
 * Selector de producto para agregar/editar un ítem de compra (doc 03 + doc 07
 * pantalla 4). Cuando hay un proveedor elegido, los productos cuyo
 * `proveedorPrincipalId` coincide se listan primero, bajo "Sugeridos de
 * {proveedor}" — el resto del catálogo activo queda debajo, todo filtrable
 * por la misma búsqueda.
 *
 * La sugerencia "productos que se le compraron antes a este proveedor"
 * (doc 07) requeriría leer el historial de compras del proveedor — fuera de
 * alcance de esta tarea (reportado como extensión natural de Fase 3, ver
 * reporte de la tarea F2-F1); acá solo se usa `proveedorPrincipalId`.
 */
export function SelectorProductoCompra({
  abierto,
  onCerrar,
  productos,
  cargando,
  error,
  proveedorId,
  productoIdsAgregados,
  onSeleccionar,
}: SelectorProductoCompraProps) {
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (abierto) setTexto('');
  }, [abierto]);

  const { sugeridos, resto } = useMemo(() => {
    const consulta = normalizarBusqueda(texto.trim());
    const filtrados = productos.filter((p) => coincide(p, consulta));
    if (proveedorId === null) {
      return { sugeridos: [] as Producto[], resto: filtrados };
    }
    const sugeridos = filtrados.filter((p) => p.proveedorPrincipalId === proveedorId);
    const idsSugeridos = new Set(sugeridos.map((p) => p.id));
    return { sugeridos, resto: filtrados.filter((p) => !idsSugeridos.has(p.id)) };
  }, [productos, texto, proveedorId]);

  function fila(producto: Producto) {
    const agregado = productoIdsAgregados.has(producto.id);
    return (
      <li key={producto.id}>
        <button
          type="button"
          onClick={() => onSeleccionar(producto)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
        >
          <span className="font-medium">{producto.nombre}</span>
          {agregado && (
            <span className="rounded-full border border-borde px-2 py-0.5 text-xs text-texto-secundario">
              Agregado
            </span>
          )}
        </button>
      </li>
    );
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Agregar producto">
      <div className="flex flex-col gap-3">
        <CampoBusqueda valor={texto} onChange={setTexto} ariaLabel="Buscar producto" placeholder="Nombre" />

        {cargando ? (
          <p className="text-sm text-texto-secundario">Cargando catálogo…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-peligro">
            No se pudo cargar el catálogo. Revisá tu conexión e intentá de nuevo.
          </p>
        ) : sugeridos.length === 0 && resto.length === 0 ? (
          <p className="px-1 py-2 text-sm text-texto-secundario">Sin resultados.</p>
        ) : (
          // `px-0.5 -mx-0.5` (UI-4f, mismo recorte y mismo fix que
          // `packages/ui/src/Modal.tsx`): los botones de `fila()` son
          // `w-full`, tocan los bordes de este `div` con `overflow-y-auto`
          // (que también recorta en X, gotcha de CSS Overflow: no hay forma
          // de que un eje quede realmente `visible` si el otro no lo es).
          // `px-0.5` da los 2px que el `focus-visible:ring-2` necesita antes
          // del borde de recorte; `-mx-0.5` compensa para no correr el
          // ancho visible del listado.
          <div className="-mx-0.5 flex max-h-80 flex-col gap-3 overflow-y-auto px-0.5">
            {sugeridos.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="px-1 text-xs font-medium uppercase tracking-wide text-texto-secundario">
                  Sugeridos de este proveedor
                </p>
                <ul className="flex flex-col gap-1">{sugeridos.map(fila)}</ul>
              </div>
            )}
            {resto.length > 0 && (
              <div className="flex flex-col gap-1">
                {sugeridos.length > 0 && (
                  <p className="px-1 text-xs font-medium uppercase tracking-wide text-texto-secundario">
                    Todos los productos
                  </p>
                )}
                <ul className="flex flex-col gap-1">{resto.map(fila)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
