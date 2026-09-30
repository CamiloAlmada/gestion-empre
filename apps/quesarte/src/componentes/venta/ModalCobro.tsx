import { useEffect, useState } from 'react';
import { formatearMoney, type MedioPago, type Money } from '@gestion/core';
import { Button, Modal } from '@gestion/ui';

export interface ModalCobroProps {
  abierto: boolean;
  onCerrar: () => void;
  total: Money;
  /** `true` mientras se espera el ack del servidor (solo con conexión, ver Venta.tsx). */
  procesando: boolean;
  /** `true` si la venta en curso tiene cliente asociado: habilita "A cobrar" (docs/11-cobros-diferidos.md). Además exige `total > 0`. */
  hayCliente: boolean;
  onConfirmar: (medioPago: MedioPago) => void;
}

const OPCIONES_MEDIO_PAGO: { valor: MedioPago; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'debito', etiqueta: 'Débito' },
  { valor: 'credito', etiqueta: 'Crédito' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
];

/** Opción aparte: el cliente se lleva la mercadería y paga después. Requiere cliente. */
const OPCION_A_COBRAR: { valor: MedioPago; etiqueta: string } = { valor: 'a_cobrar', etiqueta: 'A cobrar' };

/**
 * Modal de cobro: elegir medio de pago (4 opciones grandes, docs/06-ui-ux.md
 * §6) y confirmar. `Venta.tsx` decide qué hacer con `onConfirmar` según
 * `useOnlineStatus()` (patrón §8: online espera el ack, offline dispara sin
 * esperar).
 */
export function ModalCobro({ abierto, onCerrar, total, procesando, hayCliente, onConfirmar }: ModalCobroProps) {
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);

  useEffect(() => {
    if (abierto) setMedioPago(null);
  }, [abierto]);

  // "A cobrar" necesita cliente y algo que cobrar: un pago exige monto > 0, así
  // que una venta de $0 a cobrar no se podría saldar nunca.
  const totalCero = total <= 0;
  const puedeACobrar = hayCliente && !totalCero;

  // Si se quita el cliente (o el total pasa a 0) con "A cobrar" elegido, la selección se limpia.
  useEffect(() => {
    if (!puedeACobrar) setMedioPago((actual) => (actual === 'a_cobrar' ? null : actual));
  }, [puedeACobrar]);

  // Defensa en profundidad: aunque el efecto aún no haya corrido, si "A cobrar"
  // no está habilitado nunca cuenta como elegido.
  const medioEfectivo = medioPago === 'a_cobrar' && !puedeACobrar ? null : medioPago;

  function confirmar() {
    if (medioEfectivo === null || procesando) return;
    onConfirmar(medioEfectivo);
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
          <Button onClick={confirmar} disabled={medioEfectivo === null || procesando}>
            {procesando ? 'Procesando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-center text-2xl font-bold tabular-nums text-texto">{formatearMoney(total)}</p>

        <div role="group" aria-label="Medio de pago" className="grid grid-cols-2 gap-3">
          {[...OPCIONES_MEDIO_PAGO, OPCION_A_COBRAR].map((opcion) => {
            const esACobrar = opcion.valor === 'a_cobrar';
            const activo = medioEfectivo === opcion.valor;
            const bloqueada = esACobrar && !puedeACobrar;
            // Un solo hint: el del total 0 gana sobre el del cliente.
            const hint = bloqueada ? (totalCero ? 'No hay nada que cobrar' : 'Elegí un cliente') : null;
            return (
              <div key={opcion.valor} className={esACobrar ? 'col-span-2 flex flex-col gap-1' : 'contents'}>
                <button
                  type="button"
                  aria-pressed={activo}
                  aria-describedby={hint !== null ? 'a-cobrar-hint' : undefined}
                  disabled={procesando || bloqueada}
                  onClick={() => setMedioPago(opcion.valor)}
                  className={`flex min-h-[64px] items-center justify-center rounded-elemento border px-4 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-50 ${
                    activo ? 'border-primary-600 bg-primary-600 text-white' : 'border-borde bg-superficie text-texto hover:bg-fondo'
                  }`}
                >
                  {opcion.etiqueta}
                </button>
                {hint !== null && (
                  <p id="a-cobrar-hint" className="text-center text-sm text-texto-secundario">
                    {hint}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
