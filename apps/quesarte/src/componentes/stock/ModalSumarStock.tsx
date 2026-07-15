import { useEffect, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { Button, Modal, PesoInput, useToasts } from '@gestion/ui';
import { AjusteInvalidoError, ajustarStock } from '@gestion/firebase-kit';
import { formatearPeso, type Peso, type Producto } from '@gestion/core';
import { CantidadInput } from './CantidadInput';

export interface ModalSumarStockProps {
  abierto: boolean;
  onCerrar: () => void;
  db: Firestore;
  /** Producto `granel` o `unidad_simple`: los dos modos sin piezas. */
  producto: Producto;
  usuarioId: string;
}

function mensajeErrorSuma(error: unknown): string {
  if (error instanceof AjusteInvalidoError) {
    return 'No se pudo sumar el stock: revisá la cantidad ingresada.';
  }
  return 'No se pudo sumar el stock. Intentá de nuevo.';
}

/**
 * Suma manual de stock agregado (sin piezas): gramos para `granel`, unidades
 * enteras para `unidad_simple`. Un único `ajustarStock` con `tipo:
 * 'ajuste_positivo'`.
 *
 * **Fix de la misma clase de bug que COSTO-2** (AUDIT-1, docs/03): esta
 * pantalla renderiza el modal como instancia ESTABLE (nunca se desmonta,
 * `abierto` solo alterna un booleano — ver `DetalleProductoPantalla.tsx`).
 * En la rama `unidad_simple`, `CantidadInput` es el primer campo del
 * formulario SIN nada por delante que absorba el autofoco nativo de
 * `dialog.showModal()` (a diferencia de `PesoInput` en la rama `granel`, que
 * siempre antepone sus propios botones g/kg) — confirmado con un
 * `showModal()` fiel a la spec en el test: tipear, cancelar sin confirmar y
 * reabrir deja el campo mostrando el texto viejo aunque el estado interno ya
 * se reseteó a `null` (la validación lo atrapa si se confirma sin tocarlo,
 * pero el campo queda visualmente mintiendo). Mismo fix mecánico que
 * `ModalPrecio`/`ModalItemCompra`: `aperturaId` se incrementa en el mismo
 * efecto que resetea el formulario en cada apertura, y se usa como `key` de
 * ambos inputs (el que esté activo según `esGranel`) para forzar su
 * remontaje.
 */
export function ModalSumarStock({ abierto, onCerrar, db, producto, usuarioId }: ModalSumarStockProps) {
  const { mostrarToast } = useToasts();
  const esGranel = producto.modoStock === 'granel';

  const [pesoASumar, setPesoASumar] = useState<Peso | null>(null);
  const [cantidadASumar, setCantidadASumar] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const [aperturaId, setAperturaId] = useState(0);

  useEffect(() => {
    if (abierto) {
      setPesoASumar(null);
      setCantidadASumar(null);
      setError(undefined);
      setEnviando(false);
      setAperturaId((n) => n + 1);
    }
  }, [abierto]);

  async function confirmar() {
    if (enviando) return;

    if (esGranel) {
      if (pesoASumar === null || pesoASumar <= 0) {
        setError('Ingresá un peso mayor a cero.');
        return;
      }
    } else if (cantidadASumar === null || cantidadASumar <= 0) {
      setError('Ingresá una cantidad mayor a cero.');
      return;
    }
    setError(undefined);

    setEnviando(true);
    try {
      await ajustarStock(db, {
        usuarioId,
        tipo: 'ajuste_positivo',
        producto,
        deltaGramos: esGranel ? (pesoASumar as Peso) : undefined,
        deltaUnidades: esGranel ? undefined : (cantidadASumar as number),
      });
      const detalle = esGranel
        ? formatearPeso(pesoASumar as Peso)
        : `${cantidadASumar as number} unidades`;
      mostrarToast(`Se sumaron ${detalle} a ${producto.nombre}.`, 'exito');
      onCerrar();
    } catch (err) {
      mostrarToast(mensajeErrorSuma(err), 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Sumar stock · ${producto.nombre}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={enviando}>
            {enviando ? 'Sumando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {esGranel ? (
          <PesoInput
            key={aperturaId}
            label="Cantidad a sumar"
            value={pesoASumar}
            onChange={(valor) => {
              setPesoASumar(valor);
              setError(undefined);
            }}
            error={error}
            disabled={enviando}
          />
        ) : (
          <CantidadInput
            key={aperturaId}
            label="Cantidad a sumar"
            value={cantidadASumar}
            onChange={(valor) => {
              setCantidadASumar(valor);
              setError(undefined);
            }}
            error={error}
            disabled={enviando}
          />
        )}
      </div>
    </Modal>
  );
}
