import { useEffect, useState } from 'react';
import { formatearMoney, type MedioPago, type Money } from '@gestion/core';
import { Button, Modal } from '@gestion/ui';

export interface ModalCobroProps {
  abierto: boolean;
  onCerrar: () => void;
  total: Money;
  /** `true` mientras se espera el ack del servidor (solo con conexión, ver Venta.tsx). */
  procesando: boolean;
  onConfirmar: (medioPago: MedioPago) => void;
}

const OPCIONES_MEDIO_PAGO: { valor: MedioPago; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'debito', etiqueta: 'Débito' },
  { valor: 'credito', etiqueta: 'Crédito' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
];

/**
 * Modal de cobro: elegir medio de pago (4 opciones grandes, docs/06-ui-ux.md
 * §6) y confirmar. `Venta.tsx` decide qué hacer con `onConfirmar` según
 * `useOnlineStatus()` (patrón §8: online espera el ack, offline dispara sin
 * esperar).
 */
export function ModalCobro({ abierto, onCerrar, total, procesando, onConfirmar }: ModalCobroProps) {
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);

  useEffect(() => {
    if (abierto) setMedioPago(null);
  }, [abierto]);

  function confirmar() {
    if (medioPago === null || procesando) return;
    onConfirmar(medioPago);
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cobrar"
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={procesando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={medioPago === null || procesando}>
            {procesando ? 'Procesando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-center text-2xl font-bold tabular-nums text-texto">{formatearMoney(total)}</p>

        <div role="group" aria-label="Medio de pago" className="grid grid-cols-2 gap-3">
          {OPCIONES_MEDIO_PAGO.map((opcion) => {
            const activo = medioPago === opcion.valor;
            return (
              <button
                key={opcion.valor}
                type="button"
                aria-pressed={activo}
                disabled={procesando}
                onClick={() => setMedioPago(opcion.valor)}
                className={`flex min-h-[64px] items-center justify-center rounded-xl border px-4 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-50 ${
                  activo ? 'border-primary-600 bg-primary-600 text-white' : 'border-borde bg-superficie text-texto hover:bg-fondo'
                }`}
              >
                {opcion.etiqueta}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
