import { useEffect, useState } from 'react';
import type { ConceptoGasto, GastoCompra, Money } from '@gestion/core';
import { Button, Input, Modal, MoneyInput } from '@gestion/ui';

export interface ModalGastoCompraProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Gasto ya cargado, si se está EDITANDO (`null` = alta). */
  gastoExistente: GastoCompra | null;
  onConfirmar: (gasto: GastoCompra) => void;
}

const OPCIONES_CONCEPTO: { valor: ConceptoGasto; etiqueta: string }[] = [
  { valor: 'combustible', etiqueta: 'Combustible' },
  { valor: 'peaje', etiqueta: 'Peaje' },
  { valor: 'flete', etiqueta: 'Flete' },
  { valor: 'otro', etiqueta: 'Otro' },
];

/**
 * Alta/edición de UN gasto de viaje de la compra (doc 03): concepto (grupo
 * segmentado de 4 opciones, mismo patrón que el medio de pago de
 * `ModalCobro`), descripción opcional y monto. Se prorratea entre los ítems
 * recién al confirmar la compra (`core.prorratearGastos`, ver
 * `resumenCompra.ts`) — este modal solo captura el dato.
 */
export function ModalGastoCompra({ abierto, onCerrar, gastoExistente, onConfirmar }: ModalGastoCompraProps) {
  const [concepto, setConcepto] = useState<ConceptoGasto>('combustible');
  const [descripcion, setDescripcion] = useState('');
  const [montoCents, setMontoCents] = useState<Money | null>(null);
  const [errorMonto, setErrorMonto] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!abierto) return;
    setConcepto(gastoExistente?.concepto ?? 'combustible');
    setDescripcion(gastoExistente?.descripcion ?? '');
    setMontoCents(gastoExistente?.montoCents ?? null);
    setErrorMonto(undefined);
  }, [abierto, gastoExistente]);

  function confirmar() {
    if (montoCents === null || montoCents <= 0) {
      setErrorMonto('Ingresá un monto mayor a cero.');
      return;
    }
    onConfirmar({
      concepto,
      descripcion: descripcion.trim() || undefined,
      montoCents,
    });
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={gastoExistente !== null ? 'Editar gasto' : 'Agregar gasto'}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={confirmar}>{gastoExistente !== null ? 'Guardar' : 'Agregar'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Concepto" className="grid grid-cols-2 gap-2">
          {OPCIONES_CONCEPTO.map((opcion) => {
            const activo = concepto === opcion.valor;
            return (
              <button
                key={opcion.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => setConcepto(opcion.valor)}
                className={`flex min-h-[44px] items-center justify-center rounded-control border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
                  activo ? 'border-primary-600 bg-primary-600 text-white' : 'border-borde bg-superficie text-texto hover:bg-fondo'
                }`}
              >
                {opcion.etiqueta}
              </button>
            );
          })}
        </div>

        <Input label="Descripción (opcional)" value={descripcion} onChange={setDescripcion} />

        <MoneyInput label="Monto" value={montoCents} onChange={setMontoCents} error={errorMonto} />
      </div>
    </Modal>
  );
}
