import { useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { estadoCobro, formatearMoney, pagosDe, saldoPendienteCents, type Venta } from '@gestion/core';
import { deshacerUltimoPago, useAuth, useOnlineStatus } from '@gestion/firebase-kit';
import { Button, Modal, useToasts } from '@gestion/ui';
import { ModalRegistrarPago } from './ModalRegistrarPago';
import { ETIQUETAS_MEDIO_PAGO, formatearFechaHora } from './formato';

export interface SeccionCobroVentaProps {
  venta: Venta;
  esAdmin: boolean;
  db: Firestore;
}

/**
 * Bloque de cobro del detalle de una venta (docs/11-cobros-diferidos.md, A5).
 * No renderiza nada si la venta no tiene qué cobrar ni pagos que mostrar (una
 * venta cobrada en el mostrador): así el detalle de las ventas de siempre queda
 * intacto. La guarda vive acá, separada del cuerpo, para que los hooks del
 * cuerpo (auth, conexión, toasts) solo corran cuando el bloque se muestra.
 */
export function SeccionCobroVenta(props: SeccionCobroVentaProps) {
  const estado = estadoCobro(props.venta);
  const hayPagos = pagosDe(props.venta).length > 0;
  if (estado !== 'pendiente' && estado !== 'parcial' && !hayPagos) return null;
  return <CuerpoSeccionCobro {...props} />;
}

function CuerpoSeccionCobro({ venta, esAdmin, db }: SeccionCobroVentaProps) {
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();
  const [modalPago, setModalPago] = useState(false);
  const [modalDeshacer, setModalDeshacer] = useState(false);
  const [deshaciendo, setDeshaciendo] = useState(false);

  const estado = estadoCobro(venta);
  const debe = estado === 'pendiente' || estado === 'parcial';
  const pagos = pagosDe(venta);
  const ultimoPago = pagos[pagos.length - 1];
  // Solo admin, y solo sobre una venta viva: en una anulada no hay nada que rectificar.
  const puedeDeshacer = esAdmin && venta.estado === 'completada' && ultimoPago !== undefined;

  async function confirmarDeshacer() {
    if (deshaciendo) return;

    let escritura: Promise<void>;
    try {
      escritura = deshacerUltimoPago(db, venta);
    } catch {
      // Validación síncrona (venta ya anulada, sin pagos…): no se escribió nada.
      mostrarToast('No se pudo deshacer el pago. Actualizá la venta e intentá de nuevo.', 'error');
      return;
    }

    if (!enLinea) {
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar el cambio del pago. Revisá la venta.', 'error');
      });
      mostrarToast('Cambio guardado sin conexión. Se sincronizará al reconectar.', 'info');
      setModalDeshacer(false);
      return;
    }

    setDeshaciendo(true);
    try {
      await escritura;
      mostrarToast('Pago deshecho.', 'exito');
      setModalDeshacer(false);
    } catch {
      mostrarToast('No se pudo deshacer el pago. Intentá de nuevo.', 'error');
    } finally {
      setDeshaciendo(false);
    }
  }

  return (
    <section
      aria-label="Cobro"
      className="flex flex-col gap-4 rounded-card border border-borde bg-superficie p-4"
    >
      {debe && (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-texto">Pendiente de cobro</h3>
          <p className="text-lg font-bold tabular-nums text-advertencia">
            Saldo: {formatearMoney(saldoPendienteCents(venta))}
          </p>
          {esAdmin && perfil !== null && (
            <Button className="w-fit" onClick={() => setModalPago(true)}>
              Registrar pago
            </Button>
          )}
        </div>
      )}

      {pagos.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-texto">Pagos registrados</h3>
          <ul aria-label="Pagos registrados" className="flex flex-col gap-2">
            {pagos.map((pago) => (
              <li
                key={pago.id}
                className="flex flex-col gap-0.5 rounded-elemento border border-borde p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-texto">{ETIQUETAS_MEDIO_PAGO[pago.medioPago]}</span>
                  <span className="tabular-nums font-semibold text-texto">
                    {formatearMoney(pago.montoCents)}
                  </span>
                </div>
                <span className="text-sm text-texto-secundario">{formatearFechaHora(pago.fecha)}</span>
                {pago.referencia !== undefined && (
                  <span className="text-sm text-texto-secundario">Operación: {pago.referencia}</span>
                )}
              </li>
            ))}
          </ul>
          {puedeDeshacer && (
            <Button variante="secundaria" className="w-fit" onClick={() => setModalDeshacer(true)}>
              Deshacer último pago
            </Button>
          )}
        </div>
      )}

      {esAdmin && perfil !== null && (
        <ModalRegistrarPago
          abierto={modalPago}
          onCerrar={() => setModalPago(false)}
          db={db}
          venta={venta}
          usuarioId={perfil.uid}
          enLinea={enLinea}
        />
      )}

      {puedeDeshacer && (
        <Modal
          abierto={modalDeshacer}
          onCerrar={() => setModalDeshacer(false)}
          titulo="Deshacer último pago"
          acciones={
            <>
              <Button
                variante="secundaria"
                onClick={() => setModalDeshacer(false)}
                disabled={deshaciendo}
              >
                Cancelar
              </Button>
              {/* Texto distinto del disparador "Deshacer último pago"
                  (docs/06-ui-ux.md §5: nombres accesibles únicos por pantalla). */}
              <Button variante="peligro" onClick={() => void confirmarDeshacer()} disabled={deshaciendo}>
                {deshaciendo ? 'Deshaciendo…' : 'Sí, deshacer'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <p className="text-texto">
              Se quita el pago de {formatearMoney(ultimoPago.montoCents)} (
              {ETIQUETAS_MEDIO_PAGO[ultimoPago.medioPago]}, {formatearFechaHora(ultimoPago.fecha)}) y
              la venta vuelve a quedar con ese saldo pendiente.
            </p>
            <p className="text-sm text-texto-secundario">Usalo si lo cargaste mal.</p>
          </div>
        </Modal>
      )}
    </section>
  );
}
