import { useEffect, useState } from 'react';
import { elegirPieza, formatearPeso, type Peso, type Pieza, type Producto } from '@gestion/core';
import { Button, Modal } from '@gestion/ui';
import { formatearFecha } from '../stock/resumen';
import { TecladoPeso } from './TecladoPeso';
import type { ItemCarrito } from './itemsCarrito';

export interface ModalAgregarFraccionadoProps {
  abierto: boolean;
  onCerrar: () => void;
  producto: Producto;
  /**
   * Piezas disponibles del producto. En modo agregar, ya ajustadas por lo
   * reservado en el carrito (`piezasAjustadasPorCarrito`); en modo edición
   * (`itemEnEdicion` presente), ajustadas EXCLUYENDO la reserva del propio
   * ítem (`piezasParaEditar`) — quien arma este array decide cuál, el modal
   * solo lo muestra.
   */
  piezasDisponibles: Pieza[];
  onAgregar: (pieza: Pieza, gramos: Peso) => void;
  /**
   * Si se pasa, el modal abre en modo edición: precarga el peso y la pieza
   * actuales de este ítem del carrito, y cambia el copy ("Editar"/"Guardar").
   * `onAgregar` sigue siendo el único callback de confirmación — quien lo
   * escucha decide si agrega un ítem nuevo o reemplaza este (ver Venta.tsx).
   * Si no se pasa: comportamiento actual EXACTO (modo agregar).
   */
  itemEnEdicion?: ItemCarrito;
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
  itemEnEdicion,
}: ModalAgregarFraccionadoProps) {
  const [gramos, setGramos] = useState<Peso | null>(null);
  const [piezaManual, setPiezaManual] = useState<Pieza | null>(null);
  const [mostrarSelector, setMostrarSelector] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    if (itemEnEdicion !== undefined) {
      setGramos(itemEnEdicion.gramos ?? null);
      const piezaId = itemEnEdicion.pieza?.id;
      setPiezaManual(
        piezaId === undefined ? null : (piezasDisponibles.find((p) => p.id === piezaId) ?? itemEnEdicion.pieza ?? null),
      );
    } else {
      setGramos(null);
      setPiezaManual(null);
    }
    setMostrarSelector(false);
    // Solo al transicionar `abierto` (mismo criterio que el resto de los
    // modales del proyecto): la precarga de `itemEnEdicion` es un valor
    // inicial, no un valor que deba seguir sincronizado con las props. A
    // diferencia de lo que decía este comentario antes, `piezasDisponibles`
    // SÍ puede cambiar mientras el modal sigue abierto (Venta.tsx la deriva
    // de un listener de Firestore — la pieza precargada puede agotarse o
    // darse de baja en vivo). No lo resolvemos re-corriendo este efecto con
    // `piezasDisponibles` en las deps (eso pisaría el peso/pieza que el
    // usuario ya esté tipeando/eligiendo a mitad de edición): en cambio,
    // `piezaVigente` de abajo revalida en cada render si la pieza mostrada
    // (precargada o elegida a mano) sigue existiendo en la lista viva.
  }, [abierto]);

  const sinPiezas = piezasDisponibles.length === 0;
  const resultadoFifo =
    !sinPiezas && gramos !== null && gramos > 0 ? elegirPieza(piezasDisponibles, gramos) : null;
  const piezaMostrada = piezaManual ?? resultadoFifo?.pieza ?? null;
  // `resultadoFifo.pieza` sale siempre de `piezasDisponibles` (vigente por
  // construcción); solo `piezaManual` es estado propio que puede haber
  // quedado apuntando a una pieza que ya no está en la lista viva (se agotó,
  // se dio de baja, o — en modo edición — así llegó precargada desde
  // `itemEnEdicion.pieza`). Se revalida por `id` en cada render, no una sola
  // vez al abrir.
  const piezaVigente = piezaMostrada !== null && piezasDisponibles.some((p) => p.id === piezaMostrada.id);
  const suficiente =
    piezaMostrada !== null && gramos !== null ? piezaMostrada.pesoRestanteGramos >= gramos : false;
  const puedeAgregar =
    gramos !== null && gramos > 0 && piezaMostrada !== null && piezaVigente && suficiente;

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

  const editando = itemEnEdicion !== undefined;

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
      {sinPiezas ? (
        <p role="alert" className="text-peligro">
          No hay piezas disponibles de este producto.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <TecladoPeso
            label="Peso a vender"
            abierto={abierto}
            onChange={setGramos}
            unidadInicial="kg"
            valorInicial={itemEnEdicion?.gramos}
          />

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

                {!piezaVigente ? (
                  // La pieza mostrada (precargada al editar, o elegida a
                  // mano) ya no está en la lista viva: se agotó o se dio de
                  // baja mientras el modal seguía abierto. No tiene sentido
                  // mostrar el aviso de "insuficiente" con un `pesoRestanteGramos`
                  // que ya no es real — se pide elegir otra del listado.
                  <div role="alert" className="flex flex-col gap-2 rounded-control bg-fondo p-3 text-sm text-peligro">
                    <p>Esta pieza ya no está disponible (se agotó o se dio de baja). Elegí otra.</p>
                  </div>
                ) : (
                  !suficiente && (
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
                  )
                )}
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}
