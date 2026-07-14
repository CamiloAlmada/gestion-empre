import { useEffect, useState } from 'react';
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
import {
  CampoPorcentaje,
  formatearBps,
  normalizarPorcentaje,
  textoPorcentajeDesdeBps,
} from '../componentes/stock/CampoPorcentaje';
import { formatearFecha } from '../componentes/stock/resumen';
import { useDesgloseUltimaCompra } from '../componentes/compras/useDesgloseUltimaCompra';

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
 *
 * COSTO-2 (doc 03): bajo "Costo promedio", una línea "Última compra" con el
 * mismo desglose que `ModalDesgloseCosto` (COSTO-1), vía el hook compartido
 * `useDesgloseUltimaCompra` — sin compra confirmada que incluya el producto,
 * la línea no aparece (nada de estados vacíos acá, ver JSDoc del hook).
 *
 * **Fix de corrupción de datos** (COSTO-2, reporte del dueño en producción:
 * el precio de un producto quedaba "clavado" en el de otro, y GUARDAR con
 * ese estado escribía el precio equivocado): `key={aperturaId}` en
 * `MoneyInput` de más abajo. Causa raíz — `MoneyInput` (`@gestion/ui`)
 * guarda su propio buffer de texto y solo lo resincroniza con la prop
 * `value` mientras el input NO está enfocado (para no pisarle el tipeo en
 * vivo al usuario, ver su JSDoc). Como este modal es UNA sola instancia
 * estable que nunca se desmonta (mismo patrón documentado arriba), su
 * `<input>` tampoco se desmonta entre un producto y otro. En un navegador
 * real, `dialog.showModal()` (que dispara el efecto de `Modal` al abrir)
 * autoenfoca el primer elemento enfocable del diálogo — que es justo el
 * `<input>` de precio, el primer campo del formulario — dejando su
 * `enfocadoRef` interno en `true` ANTES de que el efecto de acá abajo llegue
 * a pisar `precio` con el del producto nuevo. Con el buffer de `MoneyInput`
 * bloqueado por ese ref, el texto mostrado queda pegado al del producto con
 * el que se enfocó la primera vez — el margen en vivo de MÁS ABAJO, en
 * cambio, lee el estado `precio` de ESTE componente (que sí se actualiza
 * bien), por eso el margen mostrado no coincidía con el precio mostrado
 * (exactamente la captura del dueño). `aperturaId` se incrementa en el
 * mismo efecto que ya resetea `precio` en cada apertura genuina (mismo
 * producto o distinto): al cambiar la `key`, React desmonta el `MoneyInput`
 * viejo (con su buffer y su `enfocadoRef` atascados) y monta uno nuevo desde
 * cero, ya inicializado con el `precio` correcto — sin depender de la
 * carrera entre el foco nativo del diálogo y este efecto.
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
  // Se incrementa en cada apertura genuina (ver el efecto de abajo) — `key`
  // de `MoneyInput` más abajo, para forzar su remontaje y evitar el bug de
  // corrupción de datos documentado en el JSDoc de arriba.
  const [aperturaId, setAperturaId] = useState(0);

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
    setAperturaId((n) => n + 1);
  }, [abierto, producto]);

  const { desglose: desgloseUltimaCompra } = useDesgloseUltimaCompra(productoMostrado, abierto);

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

        {/* COSTO-2: mismo desglose que el ⓘ de Precios (`ModalDesgloseCosto`),
            en línea y compacto — sin compra confirmada que incluya el
            producto, `desgloseUltimaCompra` es `null` y esta línea no se
            renderiza (doc 03: "el modal no agrega ruido"). */}
        {desgloseUltimaCompra !== null && (
          // Un único string armado antes del JSX (no varios `{expr}` sueltos
          // dentro del `<p>`): queda como UN solo nodo de texto, más simple
          // de testear con `getByText` y sin nodos de texto partidos por
          // interpolación (mismo criterio ya aplicado en `ModalDesgloseCosto`).
          <p className="text-sm text-texto-secundario">
            {`Última compra (${formatearFecha(desgloseUltimaCompra.fecha)} · ${desgloseUltimaCompra.proveedorNombre}): mercadería ${formatearMoney(desgloseUltimaCompra.mercaderiaCents)} · gastos ${formatearMoney(desgloseUltimaCompra.gastosCents)}${desgloseUltimaCompra.unidad === 'kg' ? ' /kg' : ' /u'}`}
          </p>
        )}

        <MoneyInput
          key={aperturaId}
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
