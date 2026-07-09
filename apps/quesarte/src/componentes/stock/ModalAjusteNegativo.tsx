import { useEffect, useId, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { Button, Modal, PesoInput, useToasts } from '@gestion/ui';
import { AjusteInvalidoError, StockInsuficienteError, ajustarStock, type TipoAjuste } from '@gestion/firebase-kit';
import { formatearPeso, peso, type Peso, type Pieza, type Producto } from '@gestion/core';
import { CantidadInput } from './CantidadInput';

export interface ModalAjusteNegativoProps {
  abierto: boolean;
  onCerrar: () => void;
  db: Firestore;
  producto: Producto;
  usuarioId: string;
  /** Pieza a ajustar. Obligatoria si `producto` va por piezas; ausente para granel/unidad_simple. */
  pieza?: Pieza;
}

const OPCIONES_TIPO: { valor: TipoAjuste; etiqueta: string }[] = [
  { valor: 'ajuste_negativo', etiqueta: 'Ajuste' },
  { valor: 'merma', etiqueta: 'Merma' },
];

function mensajeErrorAjuste(error: unknown): string {
  if (error instanceof StockInsuficienteError) {
    return 'No hay stock suficiente para ese ajuste.';
  }
  if (error instanceof AjusteInvalidoError) {
    return 'No se pudo aplicar el ajuste: revisá la cantidad y el motivo.';
  }
  return 'No se pudo aplicar el ajuste. Intentá de nuevo.';
}

/**
 * Resta manual de stock (ajuste) o pérdida física (merma), con motivo
 * obligatorio. Por pieza (`fraccionado_por_pieza`/`pieza_entera`, con `pieza`
 * puesta) o a nivel de producto (`granel`/`unidad_simple`, sin `pieza`).
 */
export function ModalAjusteNegativo({
  abierto,
  onCerrar,
  db,
  producto,
  usuarioId,
  pieza: piezaAjustada,
}: ModalAjusteNegativoProps) {
  const { mostrarToast } = useToasts();
  const grupoTipoId = useId();
  const notaId = useId();
  const notaErrorId = useId();
  const esPorPieza = piezaAjustada !== undefined;
  const esGranel = producto.modoStock === 'granel';

  const [tipo, setTipo] = useState<TipoAjuste>('ajuste_negativo');
  const [pesoARestar, setPesoARestar] = useState<Peso | null>(null);
  const [cantidadARestar, setCantidadARestar] = useState<number | null>(null);
  const [nota, setNota] = useState('');
  const [errorCantidad, setErrorCantidad] = useState<string | undefined>(undefined);
  const [errorNota, setErrorNota] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setTipo('ajuste_negativo');
      setPesoARestar(null);
      setCantidadARestar(null);
      setNota('');
      setErrorCantidad(undefined);
      setErrorNota(undefined);
      setEnviando(false);
    }
  }, [abierto]);

  const disponible: string | null = esPorPieza
    ? formatearPeso(piezaAjustada.pesoRestanteGramos)
    : esGranel
      ? producto.stockGranelGramos !== undefined
        ? formatearPeso(producto.stockGranelGramos)
        : null
      : producto.stockUnidades !== undefined
        ? `${producto.stockUnidades} unidades`
        : null;

  async function confirmar() {
    if (enviando) return;

    let okCantidad = true;
    if (esPorPieza || esGranel) {
      if (pesoARestar === null || pesoARestar <= 0) {
        setErrorCantidad('Ingresá una cantidad mayor a cero.');
        okCantidad = false;
      }
    } else if (cantidadARestar === null || cantidadARestar <= 0) {
      setErrorCantidad('Ingresá una cantidad mayor a cero.');
      okCantidad = false;
    }
    if (okCantidad) setErrorCantidad(undefined);

    const notaOk = nota.trim() !== '';
    setErrorNota(notaOk ? undefined : 'El motivo es obligatorio.');

    if (!okCantidad || !notaOk) return;

    setEnviando(true);
    try {
      await ajustarStock(db, {
        usuarioId,
        tipo,
        producto,
        pieza: piezaAjustada,
        deltaGramos: esPorPieza || esGranel ? peso(-(pesoARestar as Peso)) : undefined,
        deltaUnidades: esPorPieza || esGranel ? undefined : -(cantidadARestar as number),
        nota: nota.trim(),
      });
      mostrarToast(
        tipo === 'merma' ? `Se registró la merma de ${producto.nombre}.` : `Se aplicó el ajuste de ${producto.nombre}.`,
        'exito',
      );
      onCerrar();
    } catch (error) {
      mostrarToast(mensajeErrorAjuste(error), 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Ajuste / merma · ${producto.nombre}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variante="peligro" onClick={() => void confirmar()} disabled={enviando}>
            {enviando ? 'Aplicando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {disponible !== null && <p className="text-sm text-texto-secundario">Disponible: {disponible}</p>}

        <div className="flex flex-col gap-1">
          <span id={grupoTipoId} className="text-sm font-medium text-texto">
            Tipo
          </span>
          <div role="group" aria-labelledby={grupoTipoId} className="flex gap-1 rounded-elemento border border-borde p-1">
            {OPCIONES_TIPO.map((opcion) => {
              const activo = tipo === opcion.valor;
              return (
                <button
                  key={opcion.valor}
                  type="button"
                  aria-pressed={activo}
                  disabled={enviando}
                  onClick={() => setTipo(opcion.valor)}
                  className={`min-h-[44px] flex-1 rounded-control px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-50 ${
                    activo ? 'bg-primary-600 text-white' : 'text-texto-secundario hover:text-texto'
                  }`}
                >
                  {opcion.etiqueta}
                </button>
              );
            })}
          </div>
        </div>

        {esPorPieza || esGranel ? (
          <PesoInput
            label="Cantidad a restar"
            value={pesoARestar}
            onChange={(valor) => {
              setPesoARestar(valor);
              setErrorCantidad(undefined);
            }}
            error={errorCantidad}
            disabled={enviando}
          />
        ) : (
          <CantidadInput
            label="Cantidad a restar"
            value={cantidadARestar}
            onChange={(valor) => {
              setCantidadARestar(valor);
              setErrorCantidad(undefined);
            }}
            error={errorCantidad}
            disabled={enviando}
          />
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor={notaId} className="text-sm font-medium text-texto">
            Motivo
          </label>
          <textarea
            id={notaId}
            value={nota}
            onChange={(e) => {
              setNota(e.target.value);
              setErrorNota(undefined);
            }}
            disabled={enviando}
            rows={2}
            placeholder="Ej: recuento de fin de mes, pieza en mal estado…"
            aria-invalid={errorNota !== undefined ? true : undefined}
            aria-describedby={errorNota !== undefined ? notaErrorId : undefined}
            className={`resize-none rounded-control border bg-superficie px-3 py-2 text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:bg-fondo disabled:text-texto-secundario ${
              errorNota !== undefined ? 'border-peligro' : 'border-borde'
            }`}
          />
          {errorNota !== undefined && (
            <p id={notaErrorId} className="text-sm text-peligro">
              {errorNota}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
