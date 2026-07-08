import { useEffect, useState } from 'react';
import { formatearPeso, peso, type Peso, type Producto } from '@gestion/core';
import { Button, Modal } from '@gestion/ui';
import { TecladoPeso } from './TecladoPeso';

export interface ModalAgregarGranelProps {
  abierto: boolean;
  onCerrar: () => void;
  producto: Producto;
  onAgregar: (gramos: Peso) => void;
}

/**
 * Agregar al carrito un producto `granel`: mismo teclado de peso que
 * `fraccionado_por_pieza`, sin pieza (docs 02: "NO trazamos por bolsa").
 * Valida localmente contra `stockGranelGramos`; `registrarVenta` vuelve a
 * validar contra el estado que conoce el servidor al cobrar.
 */
export function ModalAgregarGranel({ abierto, onCerrar, producto, onAgregar }: ModalAgregarGranelProps) {
  const [gramos, setGramos] = useState<Peso | null>(null);

  useEffect(() => {
    if (abierto) setGramos(null);
  }, [abierto]);

  const stock = producto.stockGranelGramos ?? peso(0);
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
        <p className="text-sm text-texto-secundario">Disponible: {formatearPeso(stock)}</p>
        <TecladoPeso label="Peso a vender" abierto={abierto} onChange={setGramos} unidadInicial="kg" />
        {excede && (
          <p role="alert" className="text-sm text-peligro">
            Superás el stock disponible ({formatearPeso(stock)}).
          </p>
        )}
      </div>
    </Modal>
  );
}
