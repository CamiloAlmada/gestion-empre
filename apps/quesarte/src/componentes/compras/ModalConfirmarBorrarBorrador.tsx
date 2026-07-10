import { useEffect, useState } from 'react';
import { deleteDoc, doc, type Firestore } from 'firebase/firestore';
import { Button, Modal, useToasts } from '@gestion/ui';

export interface ModalConfirmarBorrarBorradorProps {
  abierto: boolean;
  onCerrar: () => void;
  db: Firestore;
  compraId: string;
  proveedorNombre: string;
  enLinea: boolean;
  /** Se llama tras borrar (con conexión, luego del `await`; sin conexión, al
   * toque): la pantalla llamadora navega de vuelta al listado. */
  onBorrado: () => void;
}

/**
 * Confirmación de borrado de un borrador de compra (doc 03: solo se pueden
 * borrar borradores — una compra `confirmada` es inmutable y las reglas de
 * Firestore rechazan el delete). Acción destructiva e IRREVERSIBLE (a
 * diferencia de desactivar un proveedor): pide confirmación explícita
 * (docs/06-ui-ux.md §6).
 *
 * No hay wrapper en `packages/firebase-kit` para esto (superficie de la
 * tarea F2-F1: solo trae `guardarBorradorCompra` / `actualizarBorradorCompra`
 * / `confirmarCompra`) — se usa `deleteDoc` directo de 'firebase/firestore',
 * mismo criterio que `Productos.tsx`/`Usuarios.tsx` cuando `firebase-kit` no
 * expone una mutación puntual. Mismo patrón híbrido de escrituras offline del
 * proyecto (§8) que `ModalConfirmarDesactivarProveedor`.
 */
export function ModalConfirmarBorrarBorrador({
  abierto,
  onCerrar,
  db,
  compraId,
  proveedorNombre,
  enLinea,
  onBorrado,
}: ModalConfirmarBorrarBorradorProps) {
  const { mostrarToast } = useToasts();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (abierto) setEnviando(false);
  }, [abierto]);

  async function confirmar() {
    if (enviando) return;
    const escritura = deleteDoc(doc(db, 'compras', compraId));

    if (!enLinea) {
      mostrarToast('Borrador eliminado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar la eliminación del borrador.', 'error');
      });
      onBorrado();
      return;
    }

    setEnviando(true);
    try {
      await escritura;
      mostrarToast('Borrador eliminado.', 'exito');
      onBorrado();
    } catch {
      mostrarToast('No se pudo eliminar el borrador. Intentá de nuevo.', 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Eliminar borrador${proveedorNombre !== '' ? ` · ${proveedorNombre}` : ''}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variante="peligro" onClick={() => void confirmar()} disabled={enviando}>
            {enviando ? 'Eliminando…' : 'Eliminar borrador'}
          </Button>
        </>
      }
    >
      <p className="text-texto">
        Se pierden el proveedor, los ítems y los gastos cargados. Esta acción no se puede deshacer.
      </p>
    </Modal>
  );
}
