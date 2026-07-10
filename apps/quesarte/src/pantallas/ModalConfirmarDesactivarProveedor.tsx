import { useEffect, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import type { Proveedor } from '@gestion/core';
import { desactivarProveedor } from '@gestion/firebase-kit';
import { Button, Modal, useToasts } from '@gestion/ui';

export interface ModalConfirmarDesactivarProveedorProps {
  abierto: boolean;
  onCerrar: () => void;
  db: Firestore;
  proveedor: Proveedor;
  enLinea: boolean;
  /** Se llama tras confirmar (con conexión, luego del `await`; sin conexión,
   * al toque): la pantalla llamadora navega de vuelta al listado. */
  onDesactivado: () => void;
}

/**
 * Confirmación de la desactivación de un proveedor: deja de aparecer en el
 * listado por defecto (sigue visible con "Mostrar inactivos" y desde su
 * ficha), así que pide confirmación explícita por prudencia (docs/06-ui-ux.md
 * §6) aunque es reversible (`reactivarProveedor`, botón "Reactivar" en la
 * ficha, tarea RE-1).
 *
 * Sigue el patrón híbrido de escrituras offline del proyecto (§8): en línea
 * espera el ack antes de avisar y cerrar; sin conexión dispara la escritura
 * sin esperar, cierra al toque y avisa con un toast informativo.
 */
export function ModalConfirmarDesactivarProveedor({
  abierto,
  onCerrar,
  db,
  proveedor,
  enLinea,
  onDesactivado,
}: ModalConfirmarDesactivarProveedorProps) {
  const { mostrarToast } = useToasts();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (abierto) setEnviando(false);
  }, [abierto]);

  async function confirmar() {
    if (enviando) return;
    const escritura = desactivarProveedor(db, proveedor.id);

    if (!enLinea) {
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar la desactivación del proveedor.', 'error');
      });
      onDesactivado();
      return;
    }

    setEnviando(true);
    try {
      await escritura;
      mostrarToast('Proveedor desactivado.', 'exito');
      onDesactivado();
    } catch {
      mostrarToast('No se pudo desactivar el proveedor. Intentá de nuevo.', 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Desactivar ${proveedor.nombre}`}
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
        Deja de aparecer en el listado de proveedores. Se puede reactivar desde su ficha cuando haga
        falta.
      </p>
    </Modal>
  );
}
