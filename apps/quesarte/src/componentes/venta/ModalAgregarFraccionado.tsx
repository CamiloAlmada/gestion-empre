import { useEffect, useState } from 'react';
import { elegirPieza, formatearPeso, type Peso, type Pieza, type Producto } from '@gestion/core';
import { Button, Modal } from '@gestion/ui';
import { formatearFecha } from '../stock/resumen';
import { TecladoPeso } from './TecladoPeso';

export interface ModalAgregarFraccionadoProps {
  abierto: boolean;
  onCerrar: () => void;
  producto: Producto;
  /** Piezas disponibles del producto, ya ajustadas por lo reservado en el carrito (`piezasAjustadasPorCarrito`). */
  piezasDisponibles: Pieza[];
  onAgregar: (pieza: Pieza, gramos: Peso) => void;
}

/**
 * Agregar al carrito un producto `fraccionado_por_pieza`: pesás con el
 * teclado propio y el sistema elige la pieza FIFO automáticamente, con
 * override manual siempre disponible (docs/02-dominio-quesarte.md, "Regla
 * FIFO con override" — nunca es obligatorio elegir). Si la pieza mostrada no
 * alcanza, se avisa y se ofrece elegir otra o cargar el resto de la pieza
 * actual (la división entre piezas se resuelve agregando dos ítems).
 */
export function ModalAgregarFraccionado({
  abierto,
  onCerrar,
  producto,
  piezasDisponibles,
  onAgregar,
}: ModalAgregarFraccionadoProps) {
  const [gramos, setGramos] = useState<Peso | null>(null);
  const [piezaManual, setPiezaManual] = useState<Pieza | null>(null);
  const [mostrarSelector, setMostrarSelector] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setGramos(null);
    setPiezaManual(null);
    setMostrarSelector(false);
  }, [abierto]);

  const sinPiezas = piezasDisponibles.length === 0;
  const resultadoFifo =
    !sinPiezas && gramos !== null && gramos > 0 ? elegirPieza(piezasDisponibles, gramos) : null;
  const piezaMostrada = piezaManual ?? resultadoFifo?.pieza ?? null;
  const suficiente =
    piezaMostrada !== null && gramos !== null ? piezaMostrada.pesoRestanteGramos >= gramos : false;
  const puedeAgregar = gramos !== null && gramos > 0 && piezaMostrada !== null && suficiente;

  function confirmar() {
    if (!puedeAgregar || gramos === null || piezaMostrada === null) return;
    onAgregar(piezaMostrada, gramos);
  }

  function elegirPiezaManual(pieza: Pieza) {
    setPiezaManual(pieza);
    setMostrarSelector(false);
  }

  function usarRestoDeEstaPieza() {
    if (piezaMostrada === null) return;
    setGramos(piezaMostrada.pesoRestanteGramos);
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
      {sinPiezas ? (
        <p role="alert" className="text-peligro">
          No hay piezas disponibles de este producto.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <TecladoPeso label="Peso a vender" abierto={abierto} onChange={setGramos} unidadInicial="kg" />

          {gramos !== null &&
            gramos > 0 &&
            (piezaMostrada === null ? (
              <p role="alert" className="text-peligro">
                No hay piezas disponibles de este producto.
              </p>
            ) : (
              <div className="flex flex-col gap-2 rounded-elemento border border-borde p-3">
                <p className="text-sm text-texto">
                  De: pieza del {formatearFecha(piezaMostrada.fechaIngreso)} (
                  {formatearPeso(piezaMostrada.pesoRestanteGramos)} restante)
                </p>
                <Button
                  variante="secundaria"
                  onClick={() => setMostrarSelector((v) => !v)}
                  className="self-start"
                >
                  Cambiar pieza
                </Button>

                {mostrarSelector && (
                  <ul role="listbox" aria-label="Elegir pieza" className="flex flex-col gap-1">
                    {piezasDisponibles.map((pieza) => (
                      <li key={pieza.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={pieza.id === piezaMostrada.id}
                          onClick={() => elegirPiezaManual(pieza)}
                          className="flex min-h-[44px] w-full items-center justify-between rounded-control border border-borde px-3 py-2 text-left text-sm text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                        >
                          <span>Pieza del {formatearFecha(pieza.fechaIngreso)}</span>
                          <span className="tabular-nums">{formatearPeso(pieza.pesoRestanteGramos)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {!suficiente && (
                  <div role="alert" className="flex flex-col gap-2 rounded-control bg-fondo p-3 text-sm text-peligro">
                    <p>
                      Esta pieza tiene {formatearPeso(piezaMostrada.pesoRestanteGramos)}, menos de lo
                      pedido. Elegí otra pieza o ajustá el peso. También podés agregar lo que queda de esta
                      pieza y el resto de otra.
                    </p>
                    <Button variante="secundaria" onClick={usarRestoDeEstaPieza} className="self-start">
                      Usar lo que queda ({formatearPeso(piezaMostrada.pesoRestanteGramos)})
                    </Button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}
