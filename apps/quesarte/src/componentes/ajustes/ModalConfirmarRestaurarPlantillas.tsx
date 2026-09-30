import { Button, Modal } from '@gestion/ui';

export interface ModalConfirmarRestaurarPlantillasProps {
  abierto: boolean;
  restaurando: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}

/**
 * Confirma "Restaurar iniciales" (todas las plantillas de fábrica, no solo una):
 * a diferencia de "Restaurar texto original" dentro de `ModalPlantillaWhatsApp`
 * (que solo cambia un borrador que todavía requiere "Guardar"), este botón
 * pisa todas las plantillas de una sola vez sin paso intermedio de revisión —
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
        Repone nombre y texto de las plantillas iniciales. Tus plantillas propias no cambian.
      </p>
    </Modal>
  );
}
