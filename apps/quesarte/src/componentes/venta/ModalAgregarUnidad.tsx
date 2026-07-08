import { useEffect, useId, useState } from 'react';
import type { Producto } from '@gestion/core';
import { Button, Modal } from '@gestion/ui';

export interface ModalAgregarUnidadProps {
  abierto: boolean;
  onCerrar: () => void;
  producto: Producto;
  onAgregar: (unidades: number) => void;
}

/**
 * Agregar al carrito un producto `unidad_simple`: stepper de unidades
 * enteras (miel en frasco, etc.), tope en `stockUnidades`.
 */
export function ModalAgregarUnidad({ abierto, onCerrar, producto, onAgregar }: ModalAgregarUnidadProps) {
  const idCantidad = useId();
  const [unidades, setUnidades] = useState(1);

  useEffect(() => {
    if (abierto) setUnidades(1);
  }, [abierto]);

  const stock = producto.stockUnidades ?? 0;
  const puedeRestar = unidades > 1;
  const puedeSumar = unidades < stock;
  const puedeAgregar = stock > 0 && unidades > 0 && unidades <= stock;

  function confirmar() {
    if (!puedeAgregar) return;
    onAgregar(unidades);
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Agregar · ${producto.nombre}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!puedeAgregar}>
            Agregar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto-secundario">
          Disponible: {stock === 1 ? '1 unidad' : `${stock} unidades`}
        </p>

        {stock === 0 ? (
          <p role="alert" className="text-sm text-peligro">
            Sin stock disponible.
          </p>
        ) : (
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              aria-label="Quitar una unidad"
              onClick={() => setUnidades((n) => Math.max(1, n - 1))}
              disabled={!puedeRestar}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-borde text-2xl font-semibold text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <span
              id={idCantidad}
              aria-live="polite"
              className="min-w-[3ch] text-center text-3xl font-bold tabular-nums text-texto"
            >
              {unidades}
            </span>
            <button
              type="button"
              aria-label="Agregar una unidad"
              onClick={() => setUnidades((n) => Math.min(stock, n + 1))}
              disabled={!puedeSumar}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-borde text-2xl font-semibold text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
