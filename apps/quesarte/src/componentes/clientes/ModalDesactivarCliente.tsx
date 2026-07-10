import { useEffect, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import type { Cliente } from '@gestion/core';
import { desactivarCliente } from '@gestion/firebase-kit';
import { Button, Modal, useToasts } from '@gestion/ui';

export interface ModalDesactivarClienteProps {
  abierto: boolean;
  onCerrar: () => void;
  db: Firestore;
  cliente: Cliente;
  enLinea: boolean;
}

/**
 * Confirmación explícita de la desactivación de un cliente: es una acción
 * poco frecuente y con efecto visible (deja de aparecer en el listado) así
 * que no se dispara directo desde el botón de la ficha (docs/06-ui-ux.md §6).
 * No es destructiva en el sentido de borrar datos — no hay borrado físico,
 * doc 07 — pero sigue el mismo patrón de confirmación que
 * `ModalConfirmarAnulacion` de Historial por prudencia.
 *
 * Escrituras offline (docs/06-ui-ux.md §8): en línea espera el ack antes de
 * avisar; sin conexión dispara sin esperar, cierra al toque y avisa que falta
 * sincronizar.
 */
export function ModalDesactivarCliente({
  abierto,
  onCerrar,
  db,
  cliente,
  enLinea,
}: ModalDesactivarClienteProps) {
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
        await desactivarCliente(db, cliente.id);
        mostrarToast('Cliente desactivado.', 'exito');
        onCerrar();
      } catch {
        mostrarToast('No se pudo desactivar el cliente. Intentá de nuevo.', 'error');
      } finally {
        setEnviando(false);
      }
      return;
    }

    desactivarCliente(db, cliente.id).catch(() => {
      mostrarToast('No se pudo sincronizar la desactivación del cliente.', 'error');
    });
    mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
    onCerrar();
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Desactivar a ${cliente.nombre}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variante="peligro" onClick={() => void confirmar()} disabled={enviando}>
            {enviando ? 'Desactivando…' : 'Confirmar desactivación'}
          </Button>
        </>
      }
    >
      <p className="text-texto">
        Deja de aparecer en el listado de clientes. No se borra: conserva su historial de ventas y
        estadísticas.
      </p>
    </Modal>
  );
}
