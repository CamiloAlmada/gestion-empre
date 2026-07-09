import { useEffect, useState } from 'react';
import { formatearPeso, type Peso, type Producto } from '@gestion/core';
import { Button, Modal } from '@gestion/ui';
import { TecladoPeso } from './TecladoPeso';
import { stockGranelParaEditar, type ItemCarrito } from './itemsCarrito';

export interface ModalAgregarGranelProps {
  abierto: boolean;
  onCerrar: () => void;
  producto: Producto;
  onAgregar: (gramos: Peso) => void;
  /**
   * Si se pasa, el modal abre en modo edición: precarga el peso actual de
   * este ítem del carrito y cambia el copy ("Editar"/"Guardar"). `onAgregar`
   * sigue siendo el único callback de confirmación — quien lo escucha decide
   * si agrega un ítem nuevo o reemplaza este (ver Venta.tsx). El stock
   * disponible mostrado sale de `stockGranelParaEditar` (ver esa función:
   * hoy equivale al stock de catálogo tal cual, granel no reserva entre
   * ítems del carrito como sí hace `fraccionado_por_pieza`). Si no se pasa:
   * comportamiento actual EXACTO (modo agregar).
   */
  itemEnEdicion?: ItemCarrito;
}

/**
 * Agregar al carrito un producto `granel`: mismo teclado de peso que
 * `fraccionado_por_pieza`, sin pieza (docs 02: "NO trazamos por bolsa").
 * Valida localmente contra `stockGranelGramos`; `registrarVenta` vuelve a
 * validar contra el estado que conoce el servidor al cobrar.
 */
export function ModalAgregarGranel({
  abierto,
  onCerrar,
  producto,
  onAgregar,
  itemEnEdicion,
}: ModalAgregarGranelProps) {
  const [gramos, setGramos] = useState<Peso | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setGramos(itemEnEdicion?.gramos ?? null);
  }, [abierto]);

  const editando = itemEnEdicion !== undefined;
  const stock = stockGranelParaEditar(producto);
  const excede = gramos !== null && gramos > stock;
  const puedeAgregar = gramos !== null && gramos > 0 && !excede;

  function confirmar() {
    if (!puedeAgregar || gramos === null) return;
    onAgregar(gramos);
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`${editando ? 'Editar' : 'Agregar'} · ${producto.nombre}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!puedeAgregar}>
            {editando ? 'Guardar' : 'Agregar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto-secundario">Disponible: {formatearPeso(stock)}</p>
        <TecladoPeso
          label="Peso a vender"
          abierto={abierto}
          onChange={setGramos}
          unidadInicial="kg"
          valorInicial={itemEnEdicion?.gramos}
        />
        {excede && (
          <p role="alert" className="text-sm text-peligro">
            Superás el stock disponible ({formatearPeso(stock)}).
          </p>
        )}
      </div>
    </Modal>
  );
}
