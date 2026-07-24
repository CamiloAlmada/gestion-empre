import { Button, Modal } from '@gestion/ui';

export interface ModalConfirmarRestablecerTemaNegocioProps {
  abierto: boolean;
  restableciendo: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}

/**
 * Confirma "Volver a los colores originales" (docs/06-ui-ux.md §4): borra
 * `configuracion/tema` — todos los usuarios del negocio, en todos sus
 * dispositivos, dejan de ver la personalización. Mismo criterio de
 * confirmación explícita que `ModalConfirmarRestaurarPlantillas` (una acción
 * de un solo paso que pisa algo compartido por todo el equipo, sin
 * revisión intermedia).
 */
export function ModalConfirmarRestablecerTemaNegocio({
  abierto,
  restableciendo,
  onConfirmar,
  onCerrar,
}: ModalConfirmarRestablecerTemaNegocioProps) {
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Volver a los colores originales"
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={restableciendo}>
            Cancelar
          </Button>
          <Button variante="peligro" onClick={onConfirmar} disabled={restableciendo}>
            {restableciendo ? 'Restableciendo…' : 'Restablecer'}
          </Button>
        </>
      }
    >
      <p className="text-texto">
        Todos los usuarios van a volver a ver los colores estándar.
      </p>
    </Modal>
  );
}
