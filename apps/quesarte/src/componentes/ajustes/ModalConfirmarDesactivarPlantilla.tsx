import { Button, Modal } from '@gestion/ui';

export interface ModalConfirmarDesactivarPlantillaProps {
  abierto: boolean;
  /** Nombre de la plantilla a desactivar (`null` mientras el modal está cerrado). */
  nombre: string | null;
  desactivando: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}

/**
 * Confirma la desactivación de una plantilla PROPIA de WhatsApp: deja de aparecer
 * en el botón de WhatsApp. Es reversible ("Reactivar", sin confirmación), pero
 * cambia lo que ve el vendedor en el mostrador, así que pide confirmación
 * explícita (docs/06-ui-ux.md §6), mismo patrón que
 * `ModalConfirmarDesactivarProveedor`. La escritura y el manejo offline (§8) los
 * hace la sección, que es la dueña de la lista completa.
 */
export function ModalConfirmarDesactivarPlantilla({
  abierto,
  nombre,
  desactivando,
  onConfirmar,
  onCerrar,
}: ModalConfirmarDesactivarPlantillaProps) {
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Desactivar ${nombre ?? 'plantilla'}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={desactivando}>
            Cancelar
          </Button>
          <Button variante="peligro" onClick={onConfirmar} disabled={desactivando}>
            {desactivando ? 'Desactivando…' : 'Confirmar desactivación'}
          </Button>
        </>
      }
    >
      <p className="text-texto">
        La plantilla deja de aparecer en el botón de WhatsApp. Podés reactivarla cuando quieras.
      </p>
    </Modal>
  );
}
