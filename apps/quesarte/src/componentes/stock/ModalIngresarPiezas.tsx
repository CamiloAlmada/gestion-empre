import { useEffect, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { Button, Modal, PesoInput, useToasts } from '@gestion/ui';
import { ingresarPiezas, IngresoInvalidoError, type PiezaIngreso } from '@gestion/firebase-kit';
import type { Peso, Producto } from '@gestion/core';

export interface ModalIngresarPiezasProps {
  abierto: boolean;
  onCerrar: () => void;
  db: Firestore;
  producto: Producto;
  usuarioId: string;
}

interface FilaIngreso {
  clave: string;
  peso: Peso | null;
  fechaVencimiento: string; // value crudo del <input type="date"> (yyyy-mm-dd) o ''
  errorPeso?: string;
  errorFecha?: string;
}

function filaVacia(clave: string): FilaIngreso {
  return { clave, peso: null, fechaVencimiento: '' };
}

/** yyyy-mm-dd de HOY en horario local, para el `min` del date picker. */
function fechaISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Parsea el `value` de un `<input type="date">` (siempre `yyyy-mm-dd`) a
 * medianoche LOCAL. Un `new Date('yyyy-mm-dd')` a secas se interpreta como
 * medianoche UTC, que en UY (UTC-3) cae en el día anterior — agregar
 * `T00:00:00` fuerza la interpretación local.
 */
function parsearFechaLocal(valor: string): Date {
  return new Date(`${valor}T00:00:00`);
}

function inicioDeHoy(): Date {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}

function mensajeErrorIngreso(error: unknown): string {
  if (error instanceof IngresoInvalidoError) {
    return 'No se pudo ingresar el stock: revisá los pesos y las fechas de vencimiento de cada pieza.';
  }
  return 'No se pudo ingresar el stock. Intentá de nuevo.';
}

/**
 * Alta manual de N piezas (ruedas de queso, salames) de un producto que se
 * controla por piezas. Lista dinámica: cada fila es una pieza (peso inicial +
 * vencimiento opcional), con "Agregar otra" / "Quitar". Un submit confirma
 * TODAS las filas en un solo llamado a `ingresarPiezas` (batch atómico).
 */
export function ModalIngresarPiezas({ abierto, onCerrar, db, producto, usuarioId }: ModalIngresarPiezasProps) {
  const { mostrarToast } = useToasts();
  const [filas, setFilas] = useState<FilaIngreso[]>([filaVacia('f0')]);
  const [proximaClave, setProximaClave] = useState(1);
  const [enviando, setEnviando] = useState(false);

  // Reinicia el formulario cada vez que el modal se vuelve a abrir.
  useEffect(() => {
    if (abierto) {
      setFilas([filaVacia('f0')]);
      setProximaClave(1);
      setEnviando(false);
    }
  }, [abierto]);

  function agregarFila() {
    const clave = `f${proximaClave}`;
    setProximaClave((n) => n + 1);
    setFilas((actuales) => [...actuales, filaVacia(clave)]);
  }

  function quitarFila(clave: string) {
    setFilas((actuales) => (actuales.length <= 1 ? actuales : actuales.filter((f) => f.clave !== clave)));
  }

  function actualizarPeso(clave: string, valor: Peso | null) {
    setFilas((actuales) =>
      actuales.map((f) => (f.clave === clave ? { ...f, peso: valor, errorPeso: undefined } : f)),
    );
  }

  function actualizarFecha(clave: string, valor: string) {
    setFilas((actuales) =>
      actuales.map((f) => (f.clave === clave ? { ...f, fechaVencimiento: valor, errorFecha: undefined } : f)),
    );
  }

  /** Valida todas las filas; si hay errores, los deja marcados y devuelve `null`. */
  function validar(): PiezaIngreso[] | null {
    const hoy = inicioDeHoy();
    let huboError = false;

    const resultado = filas.map((fila) => {
      let errorPeso: string | undefined;
      if (fila.peso === null || fila.peso <= 0) {
        errorPeso = 'Ingresá el peso de la pieza (mayor a cero).';
        huboError = true;
      }

      let errorFecha: string | undefined;
      let fechaVencimiento: Date | undefined;
      if (fila.fechaVencimiento !== '') {
        const parseada = parsearFechaLocal(fila.fechaVencimiento);
        if (Number.isNaN(parseada.getTime())) {
          errorFecha = 'Fecha inválida.';
          huboError = true;
        } else if (parseada < hoy) {
          errorFecha = 'No puede ser anterior a hoy.';
          huboError = true;
        } else {
          fechaVencimiento = parseada;
        }
      }

      return { fila: { ...fila, errorPeso, errorFecha }, fechaVencimiento };
    });

    setFilas(resultado.map((r) => r.fila));
    if (huboError) return null;

    return filas.map((fila, i) => ({
      pesoInicialGramos: fila.peso as Peso,
      fechaVencimiento: resultado[i]?.fechaVencimiento,
    }));
  }

  async function confirmar() {
    if (enviando) return;
    const piezas = validar();
    if (piezas === null) return;

    setEnviando(true);
    try {
      await ingresarPiezas(db, { producto, usuarioId, piezas });
      mostrarToast(
        piezas.length === 1
          ? `Se ingresó 1 pieza de ${producto.nombre}.`
          : `Se ingresaron ${piezas.length} piezas de ${producto.nombre}.`,
        'exito',
      );
      onCerrar();
    } catch (error) {
      mostrarToast(mensajeErrorIngreso(error), 'error');
    } finally {
      setEnviando(false);
    }
  }

  const minFecha = fechaISO(new Date());

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Ingresar piezas · ${producto.nombre}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {filas.map((fila, i) => {
          const idFecha = `ingreso-venc-${fila.clave}`;
          const idErrorFecha = `${idFecha}-error`;
          return (
            <div key={fila.clave} className="flex flex-col gap-2 rounded-elemento border border-borde p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-texto">Pieza {i + 1}</span>
                {filas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => quitarFila(fila.clave)}
                    disabled={enviando}
                    aria-label={`Quitar pieza ${i + 1}`}
                    className="inline-flex min-h-[44px] items-center rounded text-sm text-peligro underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <PesoInput
                label="Peso inicial"
                value={fila.peso}
                onChange={(valor) => actualizarPeso(fila.clave, valor)}
                error={fila.errorPeso}
                disabled={enviando}
              />
              <div className="flex flex-col gap-1">
                <label htmlFor={idFecha} className="text-sm font-medium text-texto">
                  Vencimiento (opcional)
                </label>
                <input
                  id={idFecha}
                  type="date"
                  min={minFecha}
                  value={fila.fechaVencimiento}
                  onChange={(e) => actualizarFecha(fila.clave, e.target.value)}
                  disabled={enviando}
                  aria-invalid={fila.errorFecha !== undefined ? true : undefined}
                  aria-describedby={fila.errorFecha !== undefined ? idErrorFecha : undefined}
                  className={`rounded-control border bg-superficie px-3 py-2 text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:bg-fondo disabled:text-texto-secundario ${
                    fila.errorFecha !== undefined ? 'border-peligro' : 'border-borde'
                  }`}
                />
                {fila.errorFecha !== undefined && (
                  <p id={idErrorFecha} className="text-sm text-peligro">
                    {fila.errorFecha}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <Button variante="secundaria" onClick={agregarFila} disabled={enviando}>
          Agregar otra pieza
        </Button>
      </div>
    </Modal>
  );
}
