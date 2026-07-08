import { useEffect, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { formatearMoney, type Venta } from '@gestion/core';
import { AnulacionInvalidaError, anularVenta } from '@gestion/firebase-kit';
import { Button, Modal, useToasts } from '@gestion/ui';

export interface ModalConfirmarAnulacionProps {
  abierto: boolean;
  onCerrar: () => void;
  db: Firestore;
  venta: Venta;
  /** Uid de quien anula (el admin logueado), no el vendedor original de la venta. */
  usuarioId: string;
  enLinea: boolean;
}

function mensajeErrorAnulacion(error: unknown): string {
  if (error instanceof AnulacionInvalidaError) {
    return 'Esta venta ya fue anulada.';
  }
  return 'No se pudo anular la venta. Intentá de nuevo.';
}

/**
 * Confirmación explícita de la anulación: es una acción destructiva
 * (docs/06-ui-ux.md §6) que restaura stock y no se puede deshacer, así que
 * nunca se dispara directo desde el botón del detalle.
 *
 * Sigue el patrón híbrido de escrituras offline del proyecto (§8):
 * - **En línea**: `await` + toast de éxito o error, recién ahí se cierra.
 * - **Offline**: dispara `anularVenta` SIN `await` (Firestore la encola
 *   localmente), cierra el modal al toque y avisa con un toast `info`. Un
 *   `.catch` encadenado cubre el caso en que el servidor la rechace al
 *   sincronizar (ej. otro dispositivo ya la había anulado).
 *
 * Nunca deja el botón "Anulando…" esperando un ack que sin conexión no va a
 * llegar.
 */
export function ModalConfirmarAnulacion({
  abierto,
  onCerrar,
  db,
  venta,
  usuarioId,
  enLinea,
}: ModalConfirmarAnulacionProps) {
  const { mostrarToast } = useToasts();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (abierto) setEnviando(false);
  }, [abierto]);

  async function confirmar() {
    if (enviando) return;
    setEnviando(true);

    if (enLinea) {
      try {
        await anularVenta(db, venta, usuarioId);
        mostrarToast('Venta anulada. Se restauró el stock.', 'exito');
        onCerrar();
      } catch (error) {
        mostrarToast(mensajeErrorAnulacion(error), 'error');
      } finally {
        setEnviando(false);
      }
      return;
    }

    anularVenta(db, venta, usuarioId).catch(() => {
      mostrarToast('No se pudo anular la venta al sincronizar. Revisala en el historial.', 'error');
    });
    mostrarToast('Anulación guardada sin conexión. Se sincronizará al reconectar.', 'info');
    onCerrar();
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Anular venta #${venta.numero}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          {/* Texto distinto del botón disparador "Anular venta" del detalle
              (docs/06-ui-ux.md §5: nombres accesibles únicos por pantalla). */}
          <Button variante="peligro" onClick={() => void confirmar()} disabled={enviando}>
            {enviando ? 'Anulando…' : 'Confirmar anulación'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-texto">
          Restaura el stock descontado y marca la venta como anulada. No se puede deshacer.
        </p>
        <p className="text-sm text-texto-secundario">Total: {formatearMoney(venta.totalCents)}</p>
      </div>
    </Modal>
  );
}
