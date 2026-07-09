import { calcularSubtotal, formatearMoney, formatearPeso, type Pieza, type Producto } from '@gestion/core';
import { Button, Modal } from '@gestion/ui';
import { formatearFecha } from '../stock/resumen';

export interface ModalAgregarPiezaEnteraProps {
  abierto: boolean;
  onCerrar: () => void;
  producto: Producto;
  /** Piezas disponibles del producto, ya excluyendo las que están en el carrito (`piezaIdsEnCarrito`). */
  piezasDisponibles: Pieza[];
  onAgregar: (pieza: Pieza) => void;
}

/**
 * Agregar al carrito un producto `pieza_entera`: el vendedor elige LA pieza
 * concreta que se lleva el cliente (docs/02-dominio-quesarte.md — "acá sí
 * suele importar cuál"). Tocar una fila agrega directo (2 toques totales:
 * producto → pieza), sin paso de confirmación extra: no es una acción
 * destructiva (docs/06-ui-ux.md §6). Una vez agregada, esa pieza puntual no
 * vuelve a ofrecerse (se filtra vía `piezaIdsEnCarrito`, afuera).
 */
export function ModalAgregarPiezaEntera({
  abierto,
  onCerrar,
  producto,
  piezasDisponibles,
  onAgregar,
}: ModalAgregarPiezaEnteraProps) {
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Elegir pieza · ${producto.nombre}`}
      acciones={
        <Button variante="secundaria" onClick={onCerrar}>
          Cancelar
        </Button>
      }
    >
      {piezasDisponibles.length === 0 ? (
        <p role="alert" className="text-peligro">
          No hay piezas disponibles de este producto.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {piezasDisponibles.map((pieza) => {
            const subtotal = calcularSubtotal({
              modoPrecio: 'por_kg',
              precioKgCents: producto.precioVentaCents,
              gramos: pieza.pesoRestanteGramos,
            });
            return (
              <li key={pieza.id}>
                <button
                  type="button"
                  onClick={() => onAgregar(pieza)}
                  className="flex min-h-[56px] w-full items-center justify-between gap-2 rounded-elemento border border-borde bg-superficie p-3 text-left hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-texto">{formatearPeso(pieza.pesoRestanteGramos)}</span>
                    <span className="text-xs text-texto-secundario">
                      Ingreso {formatearFecha(pieza.fechaIngreso)}
                    </span>
                  </span>
                  <span className="tabular-nums font-semibold text-texto">{formatearMoney(subtotal)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
