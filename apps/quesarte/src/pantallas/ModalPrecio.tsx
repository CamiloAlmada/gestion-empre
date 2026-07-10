import { useEffect, useId, useState } from 'react';
import { Button, Modal, MoneyInput } from '@gestion/ui';
import {
  BPS_TOTAL,
  formatearMoney,
  margenDesdePrecio,
  markupDesdePrecio,
  precioSugerido,
  type Money,
  type Producto,
} from '@gestion/core';
import { MULTIPLO_REDONDEO_CENTS_DEFAULT, margenComparable, unidadCosto } from '../componentes/stock/margenes';

/** Datos validados que salen del formulario hacia `Precios.tsx`. `undefined`
 * en `margenObjetivoBps` significa "borrar el campo" (mismo criterio que
 * `umbralAlertaStock` en `ModalProducto`: `Precios.tsx` lo traduce a
 * `deleteField()` al escribir). */
export interface DatosPrecioFormulario {
  precioVentaCents: Money;
  margenObjetivoBps?: number;
}

export interface ModalPrecioProps {
  abierto: boolean;
  /** `null` solo mientras el modal termina de cerrarse (no hay alta acá, a
   * diferencia de `ModalProducto`: esta pantalla solo edita productos
   * existentes). */
  producto: Producto | null;
  /** `true` mientras `onGuardar` está resolviendo (deshabilita los botones). */
  guardando: boolean;
  onGuardar: (datos: DatosPrecioFormulario) => void;
  onCerrar: () => void;
}

interface Errores {
  precio?: string;
  margenObjetivo?: string;
}

/**
 * Interpreta un porcentaje tipeado a mano (coma o punto decimal, hasta 2
 * decimales) a **bps enteros** (doc 03: `40` → `4000`, `33,33` → `3333`).
 * `null` si el texto no matchea el formato — mismo criterio de "marcar
 * error, no bloquear el tipeo" que `MoneyInput` (ver su JSDoc), pero sin la
 * tolerancia de separador de miles: un porcentaje de negocio no llega a esa
 * magnitud.
 */
function normalizarPorcentaje(textoCrudo: string): number | null {
  const texto = textoCrudo.trim();
  if (texto === '') return null;
  const comas = (texto.match(/,/g) ?? []).length;
  if (comas > 1) return null;
  const normalizado = comas === 1 ? texto.replace(',', '.') : texto;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  return Math.round(parseFloat(normalizado) * 100);
}

/** bps → texto de porcentaje con 2 decimales fijos (`4000` → `"40,00"`),
 * simétrico de `normalizarPorcentaje` para el round-trip al reabrir el modal. */
function textoPorcentajeDesdeBps(bps: number): string {
  return (bps / 100).toFixed(2).replace('.', ',');
}

/** bps → `"40,00 %"` para mostrar valores calculados (margen actual, markup,
 * margen efectivo). Conversión de display, a propósito fuera de `core` (doc
 * 03: "conversión SOLO en el borde de UI"; core solo expone bps enteros). */
function formatearBps(bps: number): string {
  const signo = bps < 0 ? '-' : '';
  const abs = Math.abs(bps);
  return `${signo}${textoPorcentajeDesdeBps(abs)} %`;
}

/** Campo de porcentaje: mismo layout que `Input`/`MoneyInput` (label +
 * sufijo fijo + mensaje de error), pero para bps — no existe un componente
 * de `@gestion/ui` para esto y esta tarea tiene alcance estricto (no tocar
 * `packages/`), así que vive local a este modal. */
function CampoPorcentaje({
  label,
  value,
  onChange,
  error,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {label}
      </label>
      <div
        className={`flex items-center gap-1 rounded-control border px-3 py-2 focus-within:ring-2 focus-within:ring-primary-600 ${
          error !== undefined ? 'border-peligro' : 'border-borde'
        } ${disabled === true ? 'bg-fondo' : 'bg-superficie'}`}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error !== undefined ? true : undefined}
          aria-describedby={error !== undefined ? errorId : undefined}
          className="w-full flex-1 bg-transparent text-texto tabular-nums outline-none disabled:text-texto-secundario"
        />
        <span className="select-none text-texto-secundario" aria-hidden="true">
          %
        </span>
      </div>
      {error !== undefined && (
        <p id={errorId} className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Edición de precio y margen objetivo de UN producto (docs/03, "Pantalla
 * Precios y márgenes"). Es UNA sola instancia estable (mismo patrón que
 * `Modal`/`ModalProducto`): no se desmonta al cerrar.
 *
 * Dos ediciones bidireccionales conviven acá:
 * - Tocar el **precio** recalcula el margen actual EN VIVO (debajo del
 *   campo), sin guardar nada todavía.
 * - Tocar el **margen objetivo** muestra el **precio sugerido** (core:
 *   `precioSugerido`, con el redondeo comercial de `MULTIPLO_REDONDEO_CENTS_DEFAULT`)
 *   y el **margen efectivo** que resulta de ESE precio ya redondeado (doc 03:
 *   el redondeo corre el margen real respecto del objetivo en precios
 *   chicos — comportamiento esperado). El botón "Aplicar" copia el precio
 *   sugerido al campo de precio (edición local, todavía no persiste); recién
 *   "Guardar" escribe ambos campos.
 *
 * Sin costo promedio cargado (`costoPromedioCents <= 0`), ningún cálculo de
 * margen es posible (doc 03: "sin división basura") — se muestra una nota y
 * se omiten los bloques de margen actual/sugerido, pero el precio se sigue
 * pudiendo editar (y el margen objetivo se puede seguir cargando de
 * antemano, para cuando el producto tenga costo).
 *
 * Mismo tratamiento (nota + bloques omitidos) cuando el costo y el precio
 * están en unidades distintas (`!margenComparable`, hallazgo **M2** del
 * review de Fase 2): un producto `fraccionado_por_pieza`/`pieza_entera` con
 * `modoPrecio: 'por_unidad'` (combinación legítima para la venta, p. ej. un
 * salame a precio fijo) tiene costo SIEMPRE en $/kg (`unidadCosto`) — acá
 * además el editor de margen objetivo queda deshabilitado con una nota
 * corta (no tiene sentido cargar un objetivo que nunca va a poder sugerir
 * un precio sin el peso de la pieza de por medio).
 */
export function ModalPrecio({ abierto, producto, guardando, onGuardar, onCerrar }: ModalPrecioProps) {
  const [precio, setPrecio] = useState<Money | null>(null);
  const [margenObjetivoTexto, setMargenObjetivoTexto] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  // Último producto no nulo recibido: al cerrar, `Precios.tsx` pasa
  // `producto: null` en el MISMO render en que `abierto` pasa a `false` (ver
  // `cerrarEdicion`). El `<dialog>` nativo ya deja de mostrarse ahí (`Modal`
  // llama a `close()` por su propio efecto sobre `abierto`), pero esta
  // instancia sigue montada (patrón `ModalProducto`/`ModalAjusteNegativo`) y
  // sus cálculos necesitan SIEMPRE un producto concreto para no reventar —
  // se sigue mostrando el último mientras el modal termina de cerrarse, en
  // vez de forzar un estado "vacío" que nunca llega a verse.
  const [productoMostrado, setProductoMostrado] = useState<Producto | null>(null);

  useEffect(() => {
    if (producto !== null) setProductoMostrado(producto);
  }, [producto]);

  useEffect(() => {
    if (!abierto || producto === null) return;
    setPrecio(producto.precioVentaCents);
    setMargenObjetivoTexto(
      producto.margenObjetivoBps !== undefined ? textoPorcentajeDesdeBps(producto.margenObjetivoBps) : '',
    );
    setErrores({});
  }, [abierto, producto]);

  if (productoMostrado === null) {
    // Nunca se abrió todavía: el `<dialog>` no está `open`, no hay nada
    // visible que perder mostrando el modal vacío.
    return (
      <Modal abierto={false} onCerrar={onCerrar} titulo="Editar precio">
        {null}
      </Modal>
    );
  }

  const costoCents = productoMostrado.costoPromedioCents;
  const tieneCosto = costoCents > 0;
  // Unidad del PRECIO de venta (etiqueta del MoneyInput) vs. unidad del
  // COSTO (línea "Costo promedio" más abajo): son campos independientes —
  // confundirlas es exactamente el hallazgo M2 (ver JSDoc de `unidadCosto`).
  const etiquetaUnidadPrecio = productoMostrado.modoPrecio === 'por_kg' ? 'por kg' : 'por unidad';
  const etiquetaUnidadCosto = unidadCosto(productoMostrado) === 'kg' ? 'por kg' : 'por unidad';
  const comparable = margenComparable(productoMostrado);
  const puedeCalcularMargen = tieneCosto && comparable;

  const margenActualBps = puedeCalcularMargen && precio !== null ? margenDesdePrecio(costoCents, precio) : null;
  const markupActualBps = puedeCalcularMargen && precio !== null ? markupDesdePrecio(costoCents, precio) : null;

  const margenObjetivoParseado = normalizarPorcentaje(margenObjetivoTexto);
  const margenObjetivoTextoInvalido = margenObjetivoTexto.trim() !== '' && margenObjetivoParseado === null;
  const margenObjetivoFueraDeRango = margenObjetivoParseado !== null && margenObjetivoParseado >= BPS_TOTAL;

  let sugerido: { precio: Money; margenEfectivoBps: number | null } | null = null;
  if (puedeCalcularMargen && margenObjetivoParseado !== null && !margenObjetivoFueraDeRango) {
    const precioCalc = precioSugerido(costoCents, margenObjetivoParseado, MULTIPLO_REDONDEO_CENTS_DEFAULT);
    sugerido = { precio: precioCalc, margenEfectivoBps: margenDesdePrecio(costoCents, precioCalc) };
  }

  function construirPayload(): DatosPrecioFormulario | null {
    const nuevosErrores: Errores = {};
    if (precio === null) nuevosErrores.precio = 'Ingresá el precio de venta.';
    if (margenObjetivoTextoInvalido) {
      nuevosErrores.margenObjetivo = 'Ingresá un porcentaje válido, ej: 40 o 33,33.';
    } else if (margenObjetivoFueraDeRango) {
      nuevosErrores.margenObjetivo = 'El margen objetivo debe ser menor a 100 %.';
    }

    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return null;

    return {
      precioVentaCents: precio as Money,
      margenObjetivoBps: margenObjetivoTexto.trim() === '' ? undefined : (margenObjetivoParseado as number),
    };
  }

  function handleGuardarClick() {
    const payload = construirPayload();
    if (payload !== null) onGuardar(payload);
  }

  function handleAplicarSugerido() {
    if (sugerido !== null) setPrecio(sugerido.precio);
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Editar precio · ${productoMostrado.nombre}`}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardarClick} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-texto-secundario">
          Costo promedio: {tieneCosto ? `${formatearMoney(costoCents)} ${etiquetaUnidadCosto}` : '—'}
        </p>

        <MoneyInput
          label={`Precio de venta ${etiquetaUnidadPrecio}`}
          value={precio}
          onChange={setPrecio}
          error={errores.precio}
        />

        {puedeCalcularMargen ? (
          <p className="text-sm text-texto-secundario">
            Margen actual:{' '}
            <span className="font-medium text-texto">
              {margenActualBps !== null ? formatearBps(margenActualBps) : '—'}
            </span>
            {' · '}
            Markup:{' '}
            <span className="font-medium text-texto">
              {markupActualBps !== null ? formatearBps(markupActualBps) : '—'}
            </span>
          </p>
        ) : !tieneCosto ? (
          <p className="text-sm text-texto-secundario">
            Sin costo cargado aún: no se puede calcular margen para este producto.
          </p>
        ) : (
          <p className="text-sm text-texto-secundario">Margen actual: —</p>
        )}

        <CampoPorcentaje
          label="Margen objetivo (%)"
          value={margenObjetivoTexto}
          onChange={setMargenObjetivoTexto}
          error={errores.margenObjetivo}
          disabled={!comparable}
          placeholder="Ej: 40"
        />
        {!comparable && (
          <p className="text-sm text-texto-secundario">
            Costo por kg y precio por unidad no son comparables sin el peso de la pieza.
          </p>
        )}

        {sugerido !== null && (
          <div className="flex flex-col gap-2 rounded-elemento border border-borde p-3">
            <p className="text-sm text-texto">
              Precio sugerido:{' '}
              <span className="font-semibold tabular-nums">{formatearMoney(sugerido.precio)}</span>
            </p>
            <p className="text-sm text-texto-secundario">
              Margen efectivo con ese precio:{' '}
              {sugerido.margenEfectivoBps !== null ? formatearBps(sugerido.margenEfectivoBps) : '—'}
            </p>
            <Button variante="secundaria" onClick={handleAplicarSugerido} className="self-start">
              Aplicar al precio
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
