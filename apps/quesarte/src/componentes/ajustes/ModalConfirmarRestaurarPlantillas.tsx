import { Button, Modal } from '@gestion/ui';

export interface ModalConfirmarRestaurarPlantillasProps {
  abierto: boolean;
  restaurando: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}

/**
 * Confirma "Restaurar iniciales" (todas las plantillas, no solo una):
 * a diferencia de "Restaurar texto original" dentro de `ModalPlantillaWhatsApp`
 * (que solo cambia un borrador que todavía requiere "Guardar"), este botón
 * pisa las 3 plantillas de una sola vez sin paso intermedio de revisión —
 * amerita confirmación explícita (docs/06-ui-ux.md §6).
 */
export function ModalConfirmarRestaurarPlantillas({
  abierto,
  restaurando,
  onConfirmar,
  onCerrar,
}: ModalConfirmarRestaurarPlantillasProps) {
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Restaurar plantillas iniciales"
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={restaurando}>
            Cancelar
          </Button>
          <Button variante="peligro" onClick={onConfirmar} disabled={restaurando}>
            {restaurando ? 'Restaurando…' : 'Restaurar'}
          </Button>
        </>
      }
    >
      <p className="text-texto">
        Se pierden los cambios que hayas hecho en las 3 plantillas y vuelven a su texto original.
      </p>
    </Modal>
  );
}
