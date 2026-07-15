import { useEffect, useState } from 'react';
import { formatearPeso, peso, sumarPeso, type Money, type Peso, type PiezaCompra, type Producto } from '@gestion/core';
import { Button, Modal, MoneyInput, PesoInput } from '@gestion/ui';
import { CantidadInput } from '../stock/CantidadInput';
import { itemVacio, type ItemCompraForm } from './resumenCompra';

export interface ModalItemCompraProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Producto elegido en `SelectorProductoCompra` (define qué campos pedir). */
  producto: Producto | null;
  /** Ítem ya cargado para este producto, si se está EDITANDO (`null` = alta). */
  itemExistente: ItemCompraForm | null;
  onConfirmar: (item: ItemCompraForm) => void;
}

interface FilaPieza {
  clave: string;
  peso: Peso | null;
  fechaVencimiento: string;
  errorPeso?: string;
  errorFecha?: string;
}

function filaVacia(clave: string): FilaPieza {
  return { clave, peso: null, fechaVencimiento: '' };
}

function filaDePieza(clave: string, pieza: PiezaCompra): FilaPieza {
  return { clave, peso: pieza.pesoGramos, fechaVencimiento: pieza.fechaVencimiento ? fechaISO(pieza.fechaVencimiento) : '' };
}

function fechaISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function parsearFechaLocal(valor: string): Date {
  return new Date(`${valor}T00:00:00`);
}

/**
 * Alta/edición de UN ítem de compra (doc 03). El formulario cambia según el
 * `modoStock` del producto: piezas (lista de peso + vencimiento opcional, con
 * validación de suma) para `fraccionado_por_pieza`/`pieza_entera`, gramos
 * para `granel`, unidades enteras para `unidad_simple` — mismo patrón de
 * `ModalIngresarPiezas`/`ModalSumarStock` (Stock), acá sin escribir a
 * Firestore: `onConfirmar` solo actualiza el borrador en memoria de
 * `CompraPantalla` (que guarda cuando el admin lo pida, doc 06 §8).
 *
 * `costoFacturaCents` es el costo de FACTURA del ítem completo (no por
 * unidad/kg — doc 03): un `MoneyInput` común a los tres modos.
 *
 * **Fix de la misma clase de bug que COSTO-2** (AUDIT-1, docs/03): este modal
 * MONTA de cero en cada apertura (`if (producto === null) return null` más
 * abajo — a diferencia de `ModalPrecio`, acá no hay instancia estable), pero
 * ese primer render ocurre ANTES de que el efecto de acá arriba precargue
 * `itemExistente` — hay un commit intermedio con los valores default (`null`)
 * mientras el `<dialog>` ya se abrió y autoenfocó su primer campo. Cuando ese
 * primer campo es un input bufferizado "desnudo" (`CantidadInput`, rama
 * `unidad_simple` — SIN un grupo de botones por delante que absorba el
 * autofoco, a diferencia de `PesoInput`, que SIEMPRE antepone sus propios
 * botones g/kg y por eso nunca es vulnerable a esto), su guard interno
 * (`enfocadoRef`, ver JSDoc de `CantidadInput`) queda trabado ANTES de que
 * el efecto de acá arriba entregue el valor real — el campo queda VACÍO al
 * editar un ítem existente en vez de mostrar la cantidad ya cargada
 * (confirmado con un `showModal()` fiel a la spec en
 * `ModalItemCompra.test.tsx`). Mismo fix mecánico que `ModalPrecio`:
 * `aperturaId` se incrementa en este mismo efecto y se usa como `key` de los
 * tres inputs bufferizados (`PesoInput`/`CantidadInput`/`MoneyInput`, ver el
 * JSX) — fuerza su remontaje en cada apertura real, sin depender de cuál
 * quede primero en el DOM ni de la carrera contra el autofoco nativo.
 */
export function ModalItemCompra({ abierto, onCerrar, producto, itemExistente, onConfirmar }: ModalItemCompraProps) {
  const [gramos, setGramos] = useState<Peso | null>(null);
  const [unidades, setUnidades] = useState<number | null>(null);
  const [filas, setFilas] = useState<FilaPieza[]>([filaVacia('f0')]);
  const [proximaClave, setProximaClave] = useState(1);
  const [costoFacturaCents, setCostoFacturaCents] = useState<Money | null>(null);
  const [errorGramos, setErrorGramos] = useState<string | undefined>(undefined);
  const [errorUnidades, setErrorUnidades] = useState<string | undefined>(undefined);
  const [errorPiezas, setErrorPiezas] = useState<string | undefined>(undefined);
  const [errorCosto, setErrorCosto] = useState<string | undefined>(undefined);
  const [aperturaId, setAperturaId] = useState(0);

  useEffect(() => {
    if (!abierto || producto === null) return;
    const base = itemExistente ?? itemVacio(producto.id, producto.nombre, producto.modoStock);
    setGramos(base.gramos ?? null);
    setUnidades(base.unidades ?? null);
    setFilas(
      base.piezas !== undefined && base.piezas.length > 0
        ? base.piezas.map((pz, i) => filaDePieza(`f${i}`, pz))
        : [filaVacia('f0')],
    );
    setProximaClave(base.piezas?.length ?? 1);
    setCostoFacturaCents(base.costoFacturaCents > 0 ? base.costoFacturaCents : null);
    setErrorGramos(undefined);
    setErrorUnidades(undefined);
    setErrorPiezas(undefined);
    setErrorCosto(undefined);
    setAperturaId((n) => n + 1);
  }, [abierto, producto, itemExistente]);

  if (producto === null) return null;
  // Copia local: los closures de abajo (confirmar, etc.) no retienen el
  // narrowing de `producto === null` de TypeScript al capturar el parámetro.
  const productoActivo = producto;

  const esPieza = productoActivo.modoStock === 'fraccionado_por_pieza' || productoActivo.modoStock === 'pieza_entera';
  const esGranel = productoActivo.modoStock === 'granel';
  const minFecha = fechaISO(new Date());

  function agregarFila() {
    const clave = `f${proximaClave}`;
    setProximaClave((n) => n + 1);
    setFilas((actuales) => [...actuales, filaVacia(clave)]);
  }

  function quitarFila(clave: string) {
    setFilas((actuales) => (actuales.length <= 1 ? actuales : actuales.filter((f) => f.clave !== clave)));
  }

  function actualizarPesoFila(clave: string, valor: Peso | null) {
    setFilas((actuales) => actuales.map((f) => (f.clave === clave ? { ...f, peso: valor, errorPeso: undefined } : f)));
  }

  function actualizarFechaFila(clave: string, valor: string) {
    setFilas((actuales) =>
      actuales.map((f) => (f.clave === clave ? { ...f, fechaVencimiento: valor, errorFecha: undefined } : f)),
    );
  }

  function validarPiezas(): PiezaCompra[] | null {
    let huboError = false;
    const resultado = filas.map((fila) => {
      let errorPeso: string | undefined;
      if (fila.peso === null || fila.peso <= 0) {
        errorPeso = 'Ingresá el peso (mayor a cero).';
        huboError = true;
      }
      let errorFecha: string | undefined;
      let fechaVencimiento: Date | undefined;
      if (fila.fechaVencimiento !== '') {
        const parseada = parsearFechaLocal(fila.fechaVencimiento);
        if (Number.isNaN(parseada.getTime())) {
          errorFecha = 'Fecha inválida.';
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
      pesoGramos: fila.peso as Peso,
      fechaVencimiento: resultado[i]?.fechaVencimiento,
    }));
  }

  function confirmar() {
    const costo = costoFacturaCents;
    let huboError = false;
    if (costo === null || costo <= 0) {
      setErrorCosto('Ingresá el costo de factura del ítem (mayor a cero).');
      huboError = true;
    } else {
      setErrorCosto(undefined);
    }

    if (esPieza) {
      const piezas = validarPiezas();
      if (piezas === null) {
        setErrorPiezas(undefined);
        return;
      }
      if (huboError || costo === null) return;
      onConfirmar({
        productoId: productoActivo.id,
        nombreProducto: productoActivo.nombre,
        modoStock: productoActivo.modoStock,
        gramos: sumarPeso(...piezas.map((p) => p.pesoGramos)),
        piezas,
        costoFacturaCents: costo,
      });
      return;
    }

    if (esGranel) {
      if (gramos === null || gramos <= 0) {
        setErrorGramos('Ingresá el peso comprado (mayor a cero).');
        huboError = true;
      } else {
        setErrorGramos(undefined);
      }
      if (huboError || costo === null) return;
      onConfirmar({
        productoId: productoActivo.id,
        nombreProducto: productoActivo.nombre,
        modoStock: productoActivo.modoStock,
        gramos: gramos as Peso,
        costoFacturaCents: costo,
      });
      return;
    }

    // unidad_simple
    if (unidades === null || unidades <= 0) {
      setErrorUnidades('Ingresá la cantidad comprada (mayor a cero).');
      huboError = true;
    } else {
      setErrorUnidades(undefined);
    }
    if (huboError || costo === null) return;
    onConfirmar({
      productoId: productoActivo.id,
      nombreProducto: productoActivo.nombre,
      modoStock: productoActivo.modoStock,
      unidades: unidades as number,
      costoFacturaCents: costo,
    });
  }

  const sumaFilas = sumarPeso(...filas.map((f) => f.peso ?? peso(0)));

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`${itemExistente !== null ? 'Editar' : 'Agregar'} · ${productoActivo.nombre}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={confirmar}>{itemExistente !== null ? 'Guardar' : 'Agregar'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {esPieza && (
          <div className="flex flex-col gap-3">
            {filas.map((fila, i) => {
              const idFecha = `item-compra-venc-${fila.clave}`;
              const idErrorFecha = `${idFecha}-error`;
              return (
                <div key={fila.clave} className="flex flex-col gap-2 rounded-elemento border border-borde p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-texto">Pieza {i + 1}</span>
                    {filas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarFila(fila.clave)}
                        aria-label={`Quitar pieza ${i + 1}`}
                        className="inline-flex min-h-[44px] items-center rounded text-sm text-peligro underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <PesoInput
                    key={`${fila.clave}-${aperturaId}`}
                    label="Peso"
                    value={fila.peso}
                    onChange={(valor) => actualizarPesoFila(fila.clave, valor)}
                    error={fila.errorPeso}
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
                      onChange={(e) => actualizarFechaFila(fila.clave, e.target.value)}
                      aria-invalid={fila.errorFecha !== undefined ? true : undefined}
                      aria-describedby={fila.errorFecha !== undefined ? idErrorFecha : undefined}
                      className={`rounded-control border bg-superficie px-3 py-2 text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
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
            <Button variante="secundaria" onClick={agregarFila}>
              Agregar otra pieza
            </Button>
            <p className="text-sm text-texto-secundario">Peso total: {formatearPeso(sumaFilas)}</p>
            {errorPiezas !== undefined && (
              <p role="alert" className="text-sm text-peligro">
                {errorPiezas}
              </p>
            )}
          </div>
        )}

        {esGranel && (
          <PesoInput
            key={`gramos-${aperturaId}`}
            label="Peso comprado"
            value={gramos}
            onChange={setGramos}
            error={errorGramos}
          />
        )}

        {!esPieza && !esGranel && (
          <CantidadInput
            key={`unidades-${aperturaId}`}
            label="Unidades compradas"
            value={unidades}
            onChange={setUnidades}
            error={errorUnidades}
          />
        )}

        <MoneyInput
          key={`costo-${aperturaId}`}
          label="Costo de factura (total del ítem)"
          value={costoFacturaCents}
          onChange={setCostoFacturaCents}
          error={errorCosto}
        />
      </div>
    </Modal>
  );
}
