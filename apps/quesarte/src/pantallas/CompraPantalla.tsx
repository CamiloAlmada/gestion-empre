import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { collection, doc, query, where } from 'firebase/firestore';
import { formatearMoney, type Compra, type GastoCompra, type Producto } from '@gestion/core';
import {
  CompraIncoherenteError,
  CompraVaciaError,
  EstadoCompraInvalidoError,
  ProrateoIncoherenteError,
  ProveedorInvalidoError,
  actualizarBorradorCompra,
  compraConverter,
  confirmarCompra,
  configuracionConverter,
  crearProveedor,
  guardarBorradorCompra,
  productoConverter,
  proveedorConverter,
  useAuth,
  useCollection,
  useDoc,
  useOnlineStatus,
  type DatosBorradorCompra,
  type DatosProveedor,
} from '@gestion/firebase-kit';
import { Button, SearchSelect, useToasts } from '@gestion/ui';
import { db } from '../firebase';
import { useHeader } from '../componentes/header/ContextoHeader';
import { formatearFecha } from '../componentes/stock/resumen';
import { BadgeEstadoCompra } from '../componentes/compras/BadgeEstadoCompra';
import { ModalConfirmarBorrarBorrador } from '../componentes/compras/ModalConfirmarBorrarBorrador';
import { ModalGastoCompra } from '../componentes/compras/ModalGastoCompra';
import { ModalItemCompra } from '../componentes/compras/ModalItemCompra';
import { SelectorProductoCompra } from '../componentes/compras/SelectorProductoCompra';
import {
  aItemBorrador,
  calcularEfectosProducto,
  calcularItemsProrrateados,
  itemCompraAForm,
  textoCantidadItem,
  totalesActuales,
  type ItemCompraForm,
} from '../componentes/compras/resumenCompra';
import { ModalProveedor } from './ModalProveedor';

interface ProveedorElegido {
  id?: string;
  nombre: string;
}

function mensajeErrorGuardar(error: unknown): string {
  if (error instanceof ProveedorInvalidoError) return 'Elegí un proveedor para la compra.';
  return 'No se pudo guardar el borrador. Intentá de nuevo.';
}

function mensajeErrorConfirmar(error: unknown): string {
  if (error instanceof CompraVaciaError) return 'Agregá al menos un ítem antes de confirmar.';
  if (error instanceof ProrateoIncoherenteError || error instanceof CompraIncoherenteError) {
    return 'Los totales de la compra no cierran. Revisá los ítems y los gastos.';
  }
  if (error instanceof EstadoCompraInvalidoError) {
    return 'Esta compra ya no se puede confirmar (puede haberse confirmado o borrado desde otro lugar).';
  }
  return 'No se pudo confirmar la compra. Intentá de nuevo.';
}

/**
 * Detalle/edición de UNA compra (F2-F1, doc 03): drill-down sin selector de
 * sección (docs/06-ui-ux.md §2 — "en drill-down el selector desaparece y
 * rige la flecha ‹"). Ruta `/stock/compra/:id`; `id === 'nueva'` es el
 * sentinel de alta (sin documento todavía — ver más abajo).
 *
 * Flujo borrador → confirmada (doc 03):
 * - Mientras `estado === 'borrador'`, todo el formulario (proveedor, ítems,
 *   gastos) es editable en memoria; "Guardar borrador" persiste con
 *   `guardarBorradorCompra`/`actualizarBorradorCompra`.
 * - "Confirmar compra" recalcula el prorrateo EN VIVO con `core`
 *   (`calcularItemsProrrateados`/`calcularEfectosProducto`, sobre los
 *   productos YA suscriptos acá — cero lecturas extra) y llama a
 *   `confirmarCompra` con la compra + sus `efectosProducto`. Como esa función
 *   sobrescribe el documento COMPLETO, no hace falta guardar el borrador por
 *   separado antes: confirmar con cambios sin guardar los persiste igual.
 * - Una compra `confirmada` se muestra de solo lectura (inmutable, doc 03).
 *
 * Offline (matiz sobre docs/06-ui-ux.md §8, decidido con el tech lead para
 * esta tarea):
 * - Guardar/editar un borrador YA EXISTENTE sigue el patrón híbrido estándar
 *   (online: `await`; offline: dispara sin esperar + toast informativo).
 * - Guardar el PRIMER borrador de una compra nueva SÍ requiere conexión: el
 *   id lo genera `guardarBorradorCompra` recién al resolver (a diferencia de
 *   `crearCliente`, no expone un id sincrónico — fuera de alcance tocar
 *   `firebase-kit` en esta tarea), y sin id no hay a dónde navegar. Se
 *   deshabilita el botón offline con un banner local que lo explica (caso
 *   sancionado por doc 06 §2: "se justifica cuando explica una acción
 *   deshabilitada de esa pantalla").
 * - Confirmar SIEMPRE requiere conexión (pedido explícito de la tarea): el
 *   prorrateo y el costo promedio deben calcularse sobre datos frescos, y es
 *   un flujo de escritorio del admin, no el mostrador — no es el mismo
 *   presupuesto de "nunca bloquear" que rige el cobro del POS.
 */
export function CompraPantalla() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const esNueva = id === 'nueva';

  const compraRef = useMemo(
    () => (!esNueva && id !== undefined ? doc(db, 'compras', id).withConverter(compraConverter) : null),
    [esNueva, id],
  );
  const { datos: compraCargada, cargando: cargandoCompra, error: errorCompra } = useDoc(compraRef);

  const configuracionRef = useMemo(
    () => doc(db, 'configuracion', 'general').withConverter(configuracionConverter),
    [],
  );
  const { datos: configuracion } = useDoc(configuracionRef);

  const productosQuery = useMemo(
    () => query(collection(db, 'productos').withConverter(productoConverter), where('activo', '==', true)),
    [],
  );
  const productos = useCollection<Producto>(productosQuery);
  const productosPorId = useMemo(() => new Map(productos.datos.map((p) => [p.id, p])), [productos.datos]);

  const proveedoresQuery = useMemo(
    () => query(collection(db, 'proveedores').withConverter(proveedorConverter)),
    [],
  );
  const proveedores = useCollection(proveedoresQuery);

  // Borrador en memoria. Se sincroniza UNA sola vez por `id` cargado (ver
  // efecto abajo): después, la edición local manda — no queremos que un
  // snapshot en vivo (p. ej. el eco de nuestra propia escritura) pise lo que
  // el admin está tipeando.
  const [proveedor, setProveedor] = useState<ProveedorElegido | null>(null);
  const [items, setItems] = useState<ItemCompraForm[]>([]);
  const [gastos, setGastos] = useState<GastoCompra[]>([]);
  const idSincronizadoRef = useRef<string | null>(null);

  useEffect(() => {
    if (compraCargada === null) return;
    if (idSincronizadoRef.current === compraCargada.id) return;
    idSincronizadoRef.current = compraCargada.id;
    setProveedor({ id: compraCargada.proveedorId, nombre: compraCargada.proveedorNombre });
    setItems(compraCargada.items.map(itemCompraAForm));
    setGastos(compraCargada.gastos);
  }, [compraCargada]);

  const [modalProveedorAbierto, setModalProveedorAbierto] = useState(false);
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [selectorProductoAbierto, setSelectorProductoAbierto] = useState(false);
  const [productoParaItem, setProductoParaItem] = useState<Producto | null>(null);
  const [gastoEnEdicion, setGastoEnEdicion] = useState<{ indice: number; gasto: GastoCompra } | null>(null);
  const [modalGastoAbierto, setModalGastoAbierto] = useState(false);
  const [modalBorrarAbierto, setModalBorrarAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const estado = compraCargada?.estado ?? 'borrador';
  const esConfirmada = estado === 'confirmada';
  const compraId = compraCargada?.id ?? null;

  const totales = totalesActuales(items, gastos);
  const metodo = configuracion?.metodoProrrateo ?? 'por_valor';
  const itemsProrrateados = calcularItemsProrrateados(items, totales.totalGastosCents, metodo);

  // Sin `acciones` de header a propósito (a diferencia de Proveedores/
  // Productos): `useHeader` cachea `acciones` en un efecto que SOLO se
  // vuelve a disparar si cambian `titulo`/`volverA` (ver el JSDoc de
  // `useHeader` en ContextoHeader.tsx — "seguro mientras el contenido de
  // `acciones` solo cierre sobre setters estables"). Acá `titulo` es el
  // nombre del proveedor, que NO cambia cuando se edita un ítem/gasto o se
  // sincroniza el borrador cargado — unos botones de header hubieran quedado
  // con `proveedor`/`items`/`gastos` STALE (probado con un test que
  // reprodujo justo ese bug). Guardar/Confirmar viven en el cuerpo de la
  // página, como botones React normales: siempre ven el estado fresco.
  useHeader({
    titulo: esNueva ? 'Nueva compra' : (compraCargada?.proveedorNombre ?? 'Compra'),
    volverA: { etiqueta: 'Compras', a: '/stock/compras' },
  });

  function datosBorrador(): DatosBorradorCompra {
    return {
      usuarioId: perfil?.uid ?? '',
      proveedorId: proveedor?.id,
      proveedorNombre: proveedor?.nombre ?? '',
      items: items.map(aItemBorrador),
      gastos,
      fecha: compraCargada?.fecha,
    };
  }

  async function handleGuardar() {
    if (guardando || perfil === null) return;

    if (esNueva) {
      if (!enLinea) return; // botón ya deshabilitado; banner explica por qué
      setGuardando(true);
      try {
        const { compraId: nuevoId } = await guardarBorradorCompra(db, datosBorrador());
        mostrarToast('Borrador guardado.', 'exito');
        navigate(`/stock/compra/${nuevoId}`, { replace: true });
      } catch (error) {
        mostrarToast(mensajeErrorGuardar(error), 'error');
      } finally {
        setGuardando(false);
      }
      return;
    }

    if (compraId === null) return;
    const escritura = actualizarBorradorCompra(db, compraId, datosBorrador());

    if (!enLinea) {
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar la compra. Revisá al reconectar.', 'error');
      });
      return;
    }

    setGuardando(true);
    try {
      await escritura;
      mostrarToast('Borrador guardado.', 'exito');
    } catch (error) {
      mostrarToast(mensajeErrorGuardar(error), 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function handleConfirmar() {
    if (confirmando || compraCargada === null || perfil === null) return;
    if (proveedor === null || proveedor.nombre.trim() === '') {
      mostrarToast('Elegí un proveedor antes de confirmar.', 'error');
      return;
    }
    if (items.length === 0) {
      mostrarToast('Agregá al menos un ítem antes de confirmar.', 'error');
      return;
    }

    let efectosProducto;
    try {
      efectosProducto = calcularEfectosProducto(itemsProrrateados, productosPorId);
    } catch {
      mostrarToast('Falta cargar algún producto de la compra. Revisá tu conexión e intentá de nuevo.', 'error');
      return;
    }

    const compraParaConfirmar: Compra = {
      id: compraCargada.id,
      fecha: compraCargada.fecha,
      usuarioId: compraCargada.usuarioId,
      estado: 'borrador',
      proveedorId: proveedor.id,
      proveedorNombre: proveedor.nombre,
      items: itemsProrrateados.map((it) => ({
        productoId: it.productoId,
        nombreProducto: it.nombreProducto,
        gramos: it.gramos,
        unidades: it.unidades,
        piezas: it.piezas,
        costoFacturaCents: it.costoFacturaCents,
        gastoProrrateadoCents: it.gastoProrrateadoCents,
        costoRealCents: it.costoRealCents,
        costoRealKgCents: it.costoRealKgCents ?? undefined,
      })),
      gastos,
      ...totales,
    };

    setConfirmando(true);
    try {
      await confirmarCompra(db, { compra: compraParaConfirmar, usuarioId: perfil.uid, efectosProducto });
      mostrarToast('Compra confirmada.', 'exito');
    } catch (error) {
      mostrarToast(mensajeErrorConfirmar(error), 'error');
    } finally {
      setConfirmando(false);
    }
  }

  async function handleCrearProveedorInline(datos: DatosProveedor) {
    const escritura = crearProveedor(db, datos);
    if (!enLinea) {
      setModalProveedorAbierto(false);
      mostrarToast('Necesitás conexión para crear un proveedor nuevo.', 'error');
      return;
    }
    setGuardandoProveedor(true);
    try {
      const { proveedorId } = await escritura;
      setProveedor({ id: proveedorId, nombre: datos.nombre.trim() });
      mostrarToast('Proveedor creado.', 'exito');
      setModalProveedorAbierto(false);
    } catch {
      mostrarToast('No se pudo crear el proveedor. Intentá de nuevo.', 'error');
    } finally {
      setGuardandoProveedor(false);
    }
  }

  function abrirSelectorProducto() {
    setSelectorProductoAbierto(true);
  }

  function elegirProductoParaItem(producto: Producto) {
    setSelectorProductoAbierto(false);
    setProductoParaItem(producto);
  }

  function confirmarItem(item: ItemCompraForm) {
    setItems((actuales) => {
      const existe = actuales.some((it) => it.productoId === item.productoId);
      return existe ? actuales.map((it) => (it.productoId === item.productoId ? item : it)) : [...actuales, item];
    });
    setProductoParaItem(null);
  }

  function quitarItem(productoId: string) {
    setItems((actuales) => actuales.filter((it) => it.productoId !== productoId));
  }

  function abrirGastoNuevo() {
    setGastoEnEdicion(null);
    setModalGastoAbierto(true);
  }

  function abrirGastoEdicion(indice: number, gasto: GastoCompra) {
    setGastoEnEdicion({ indice, gasto });
    setModalGastoAbierto(true);
  }

  function confirmarGasto(gasto: GastoCompra) {
    setGastos((actuales) =>
      gastoEnEdicion !== null
        ? actuales.map((g, i) => (i === gastoEnEdicion.indice ? gasto : g))
        : [...actuales, gasto],
    );
    setModalGastoAbierto(false);
    setGastoEnEdicion(null);
  }

  function quitarGasto(indice: number) {
    setGastos((actuales) => actuales.filter((_, i) => i !== indice));
  }

  const opcionesProveedor = proveedores.datos.map((p) => ({ id: p.id, etiqueta: p.nombre }));
  const productoIdsAgregados = useMemo(() => new Set(items.map((it) => it.productoId)), [items]);
  const itemParaModal = productoParaItem !== null ? items.find((it) => it.productoId === productoParaItem.id) ?? null : null;

  if (!esNueva && cargandoCompra) {
    return <p className="py-8 text-center text-texto-secundario">Cargando compra…</p>;
  }
  if (!esNueva && errorCompra !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar la compra. Revisá tu conexión e intentá de nuevo.
        </p>
        <Link
          to="/stock/compras"
          className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
        >
          Volver a Compras
        </Link>
      </div>
    );
  }
  if (!esNueva && compraCargada === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No encontramos esa compra.
        </p>
        <Link
          to="/stock/compras"
          className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
        >
          Volver a Compras
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {compraCargada !== null && (
        <div className="flex items-center gap-2">
          <BadgeEstadoCompra estado={compraCargada.estado} />
          <span className="text-sm text-texto-secundario">{formatearFecha(compraCargada.fecha)}</span>
        </div>
      )}

      {!esConfirmada && (
        <div className="flex flex-col gap-2 rounded-card border border-borde bg-superficie p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variante="secundaria"
              onClick={() => void handleGuardar()}
              disabled={guardando || (esNueva && !enLinea)}
            >
              {guardando ? 'Guardando…' : 'Guardar borrador'}
            </Button>
            <Button onClick={() => void handleConfirmar()} disabled={confirmando || compraId === null || !enLinea}>
              {confirmando ? 'Confirmando…' : 'Confirmar compra'}
            </Button>
          </div>
          {esNueva && !enLinea && (
            <p className="text-sm text-advertencia">Necesitás conexión para guardar una compra nueva.</p>
          )}
          {!enLinea && (
            <p className="text-sm text-advertencia">Necesitás conexión para confirmar la compra.</p>
          )}
        </div>
      )}

      {esConfirmada && (
        <div className="flex flex-col gap-2 rounded-card border border-exito bg-superficie p-4">
          <p className="text-texto">
            Esta compra está confirmada: los ítems, el prorrateo y los costos quedaron fijos y ya se aplicaron
            al stock y al costo promedio del catálogo.
          </p>
          <Link
            to="/stock/precios"
            className="font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
          >
            Revisar precios y márgenes →
          </Link>
        </div>
      )}

      <section className="flex flex-col gap-2 rounded-card border border-borde bg-superficie p-4">
        <h2 className="text-lg font-semibold text-texto">Proveedor</h2>
        {esConfirmada ? (
          <p className="text-texto">{compraCargada?.proveedorNombre}</p>
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <SearchSelect
                label="Proveedor"
                opciones={opcionesProveedor}
                value={proveedor?.id ?? null}
                onChange={(idElegido) => {
                  const p = proveedores.datos.find((x) => x.id === idElegido);
                  setProveedor(p !== undefined ? { id: p.id, nombre: p.nombre } : null);
                }}
                placeholder="Buscar proveedor"
              />
            </div>
            <Button
              variante="secundaria"
              onClick={() => setModalProveedorAbierto(true)}
              disabled={!enLinea}
              className="min-h-11"
            >
              + Nuevo
            </Button>
          </div>
        )}
        {!esConfirmada && !enLinea && (
          <p className="text-sm text-advertencia">Necesitás conexión para crear un proveedor nuevo.</p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-borde bg-superficie p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-texto">Ítems</h2>
          {!esConfirmada && (
            <Button variante="secundaria" onClick={abrirSelectorProducto} disabled={productos.cargando}>
              + Agregar producto
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-texto-secundario">Todavía no hay ítems cargados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {itemsProrrateados.map((item) => (
              <li key={item.productoId} className="flex flex-col gap-1 rounded-elemento border border-borde p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-texto">{item.nombreProducto}</span>
                  <span className="tabular-nums text-texto">{formatearMoney(item.costoFacturaCents)}</span>
                </div>
                <span className="text-sm text-texto-secundario">{textoCantidadItem(item)}</span>
                {!esConfirmada && totales.totalGastosCents > 0 && (
                  <span className="text-sm text-texto-secundario">
                    + gasto prorrateado {formatearMoney(item.gastoProrrateadoCents)} = costo real{' '}
                    {formatearMoney(item.costoRealCents)}
                    {item.costoRealKgCents !== null && ` (${formatearMoney(item.costoRealKgCents)}/kg)`}
                  </span>
                )}
                {esConfirmada && (
                  <span className="text-sm text-texto-secundario">
                    Costo real {formatearMoney(item.costoRealCents)}
                    {item.costoRealKgCents !== null && ` (${formatearMoney(item.costoRealKgCents)}/kg)`}
                  </span>
                )}
                {!esConfirmada && (
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const producto = productosPorId.get(item.productoId);
                        if (producto !== undefined) setProductoParaItem(producto);
                      }}
                      className="text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:text-primary-300"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => quitarItem(item.productoId)}
                      className="text-sm font-medium text-peligro underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-borde bg-superficie p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-texto">Gastos del viaje</h2>
          {!esConfirmada && (
            <Button variante="secundaria" onClick={abrirGastoNuevo}>
              + Agregar gasto
            </Button>
          )}
        </div>

        {gastos.length === 0 ? (
          <p className="text-texto-secundario">Sin gastos cargados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {gastos.map((gasto, indice) => (
              <li
                key={indice}
                className="flex items-center justify-between gap-2 rounded-elemento border border-borde p-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium capitalize text-texto">{gasto.concepto}</span>
                  {gasto.descripcion !== undefined && (
                    <span className="text-sm text-texto-secundario">{gasto.descripcion}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-texto">{formatearMoney(gasto.montoCents)}</span>
                  {!esConfirmada && (
                    <>
                      <button
                        type="button"
                        onClick={() => abrirGastoEdicion(indice, gasto)}
                        className="text-sm font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => quitarGasto(indice)}
                        className="text-sm font-medium text-peligro underline-offset-2 hover:underline"
                      >
                        Quitar
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-1 rounded-card border border-borde bg-superficie p-4">
        <h2 className="text-lg font-semibold text-texto">Totales</h2>
        <div className="flex justify-between text-texto">
          <span>Factura</span>
          <span className="tabular-nums">{formatearMoney(totales.totalFacturaCents)}</span>
        </div>
        <div className="flex justify-between text-texto">
          <span>Gastos</span>
          <span className="tabular-nums">{formatearMoney(totales.totalGastosCents)}</span>
        </div>
        <div className="flex justify-between text-lg font-semibold text-texto">
          <span>Total real</span>
          <span className="tabular-nums">{formatearMoney(totales.totalRealCents)}</span>
        </div>
        {!esConfirmada && metodo === 'por_peso' && items.some((it) => it.gramos === undefined) && (
          <p className="pt-1 text-sm text-advertencia">
            El prorrateo "por peso" no reparte gasto a los ítems por unidad (sin peso propio).
          </p>
        )}
      </section>

      {!esConfirmada && compraId !== null && (
        <Button variante="peligro" onClick={() => setModalBorrarAbierto(true)} className="self-start">
          Eliminar borrador
        </Button>
      )}

      <SelectorProductoCompra
        abierto={selectorProductoAbierto}
        onCerrar={() => setSelectorProductoAbierto(false)}
        productos={productos.datos}
        cargando={productos.cargando}
        error={productos.error !== null}
        proveedorId={proveedor?.id ?? null}
        productoIdsAgregados={productoIdsAgregados}
        onSeleccionar={elegirProductoParaItem}
      />

      <ModalItemCompra
        abierto={productoParaItem !== null}
        onCerrar={() => setProductoParaItem(null)}
        producto={productoParaItem}
        itemExistente={itemParaModal}
        onConfirmar={confirmarItem}
      />

      <ModalGastoCompra
        abierto={modalGastoAbierto}
        onCerrar={() => {
          setModalGastoAbierto(false);
          setGastoEnEdicion(null);
        }}
        gastoExistente={gastoEnEdicion?.gasto ?? null}
        onConfirmar={confirmarGasto}
      />

      <ModalProveedor
        abierto={modalProveedorAbierto}
        proveedor={null}
        guardando={guardandoProveedor}
        onGuardar={(datos) => void handleCrearProveedorInline(datos)}
        onCerrar={() => setModalProveedorAbierto(false)}
      />

      {compraId !== null && (
        <ModalConfirmarBorrarBorrador
          abierto={modalBorrarAbierto}
          onCerrar={() => setModalBorrarAbierto(false)}
          db={db}
          compraId={compraId}
          proveedorNombre={proveedor?.nombre ?? ''}
          enLinea={enLinea}
          onBorrado={() => navigate('/stock/compras')}
        />
      )}
    </div>
  );
}
