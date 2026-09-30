import { useEffect, useId, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { saldoPendienteCents, type MedioPagoReal, type Venta } from '@gestion/core';
import { CobroInvalidoError, registrarPago } from '@gestion/firebase-kit';
import { Button, Input, Modal, MoneyInput, Select, useToasts } from '@gestion/ui';
import {
  ETIQUETAS_MEDIO_PAGO,
  MEDIOS_PAGO_REALES,
  fechaAValorDatetimeLocal,
  valorDatetimeLocalAFecha,
} from './formato';

export interface ModalRegistrarPagoProps {
  abierto: boolean;
  onCerrar: () => void;
  db: Firestore;
  venta: Venta;
  /** Uid de quien registra (el admin logueado); las reglas exigen que sea `request.auth.uid`. */
  usuarioId: string;
  enLinea: boolean;
}

/** Tope de la referencia; espeja `LARGO_MAX_REFERENCIA_PAGO` del kit / `firestore.rules`. */
const LARGO_MAX_REFERENCIA = 60;

const OPCIONES_MEDIO = [
  { valor: '', etiqueta: 'Elegí un medio de pago' },
  ...MEDIOS_PAGO_REALES.map((valor) => ({ valor, etiqueta: ETIQUETAS_MEDIO_PAGO[valor] })),
];

function mensajeErrorSincrono(error: unknown): string {
  if (error instanceof CobroInvalidoError) return error.message;
  if (error instanceof RangeError) {
    return 'El monto no es válido: supera lo que falta cobrar de la venta.';
  }
  return 'No se pudo registrar el pago. Intentá de nuevo.';
}

/**
 * Registro del pago de una venta a cobrar (docs/11-cobros-diferidos.md, A5).
 *
 * - **Monto**: siempre el saldo pendiente, visible pero deshabilitado. La Fase A
 *   no ofrece pagos parciales; el campo se habilita en la Fase C del doc 11 (el
 *   modelo y las reglas ya los soportan).
 * - **Medio**: los cuatro reales, sin default (hay que elegir).
 * - **Fecha y hora**: `datetime-local`, default ahora y editable (Adrián copia
 *   la hora del comprobante); nunca en el futuro.
 * - **Referencia**: número de operación, opcional.
 *
 * `registrarPago` valida de forma SÍNCRONA (lanza antes de escribir) y devuelve
 * la promesa del commit sin esperarla. Un error síncrono se muestra dentro del
 * modal, que sigue abierto. Después sigue el patrón híbrido de escrituras
 * offline (docs/06-ui-ux.md §8): en línea espera el ack y avisa con un toast de
 * éxito; sin conexión NO espera (el ack no llegaría), cierra, avisa con un toast
 * `info` y un `.catch` encadenado cubre el rechazo tardío del servidor.
 */
export function ModalRegistrarPago({
  abierto,
  onCerrar,
  db,
  venta,
  usuarioId,
  enLinea,
}: ModalRegistrarPagoProps) {
  const { mostrarToast } = useToasts();
  const idFecha = useId();
  const idErrorFecha = `${idFecha}-error`;

  const [medio, setMedio] = useState<MedioPagoReal | ''>('');
  const [fecha, setFecha] = useState('');
  const [referencia, setReferencia] = useState('');
  const [errorFecha, setErrorFecha] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Tope del selector de fecha (`max`), fijado al abrir: un valor que cambia en
  // cada render movería el atributo por debajo del usuario.
  const [maxFecha, setMaxFecha] = useState('');

  useEffect(() => {
    if (!abierto) return;
    const ahora = new Date();
    setMedio('');
    setFecha(fechaAValorDatetimeLocal(ahora));
    setMaxFecha(fechaAValorDatetimeLocal(ahora));
    setReferencia('');
    setErrorFecha(null);
    setErrorEnvio(null);
    setEnviando(false);
  }, [abierto]);

  const saldoCents = saldoPendienteCents(venta);

  async function confirmar() {
    if (enviando || medio === '') return;

    const fechaPago = valorDatetimeLocalAFecha(fecha);
    if (fechaPago === null) {
      setErrorFecha('Indicá la fecha y hora del pago.');
      return;
    }
    if (fechaPago.getTime() > Date.now()) {
      setErrorFecha('La fecha del pago no puede ser futura.');
      return;
    }
    setErrorFecha(null);
    setErrorEnvio(null);

    let escritura: Promise<void>;
    try {
      escritura = registrarPago(db, venta, {
        montoCents: saldoCents,
        medioPago: medio,
        fecha: fechaPago,
        referencia: referencia.trim() === '' ? undefined : referencia.trim(),
        usuarioId,
      });
    } catch (error) {
      // Validación síncrona del kit / de core: no se escribió nada.
      setErrorEnvio(mensajeErrorSincrono(error));
      return;
    }

    if (!enLinea) {
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar el pago. Revisá la venta en el historial.', 'error');
      });
      mostrarToast('Pago guardado sin conexión. Se sincronizará al reconectar.', 'info');
      onCerrar();
      return;
    }

    setEnviando(true);
    try {
      await escritura;
      mostrarToast('Pago registrado.', 'exito');
      onCerrar();
    } catch {
      mostrarToast('No se pudo registrar el pago. Intentá de nuevo.', 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Registrar pago de la venta #${venta.numero}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={medio === '' || enviando}>
            {enviando ? 'Registrando…' : 'Confirmar pago'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Fase A: pago total. El campo se habilita con los parciales (doc 11, Fase C). */}
        <MoneyInput label="Monto" value={saldoCents} onChange={() => {}} disabled />

        <Select
          label="Medio de pago"
          value={medio}
          onChange={(valor) => setMedio(valor as MedioPagoReal | '')}
          opciones={OPCIONES_MEDIO}
          disabled={enviando}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor={idFecha} className="text-sm font-medium text-texto">
            Fecha y hora del pago
          </label>
          <input
            id={idFecha}
            type="datetime-local"
            max={maxFecha}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={enviando}
            aria-invalid={errorFecha !== null ? true : undefined}
            aria-describedby={errorFecha !== null ? idErrorFecha : undefined}
            className={`rounded-control border bg-superficie px-3 py-2 text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:bg-fondo disabled:text-texto-secundario ${
              errorFecha !== null ? 'border-peligro' : 'border-borde'
            }`}
          />
          {errorFecha !== null && (
            <p id={idErrorFecha} className="text-sm text-peligro">
              {errorFecha}
            </p>
          )}
        </div>

        <Input
          label="Número de operación (opcional)"
          value={referencia}
          onChange={setReferencia}
          maxLength={LARGO_MAX_REFERENCIA}
          disabled={enviando}
        />

        {errorEnvio !== null && (
          <p role="alert" className="text-sm text-peligro">
            {errorEnvio}
          </p>
        )}
      </div>
    </Modal>
  );
}
