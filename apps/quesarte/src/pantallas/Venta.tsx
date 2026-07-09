import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { collection, query, where } from 'firebase/firestore';
import type { MedioPago, Peso, Pieza, Producto } from '@gestion/core';
import {
  ItemInvalidoError,
  StockInsuficienteError,
  TotalIncoherenteError,
  VentaVaciaError,
  piezaConverter,
  productoConverter,
  registrarVenta,
  useAuth,
  useCollection,
  useOnlineStatus,
  type EntradaVenta,
} from '@gestion/firebase-kit';
import { Button, useToasts } from '@gestion/ui';
import { db } from '../firebase';
import { agruparPiezasPorProducto } from '../componentes/stock/resumen';
import { Carrito } from '../componentes/venta/Carrito';
import { useCarrito } from '../componentes/venta/ContextoCarrito';
import { GrillaProductos } from '../componentes/venta/GrillaProductos';
import {
  cambiarUnidades,
  crearItemFraccionado,
  crearItemGranel,
  crearItemPiezaEntera,
  crearItemUnidad,
  piezaIdsEnCarrito,
  piezasAjustadasPorCarrito,
  piezasParaEditar,
  reemplazarItem,
  totalCarrito,
  type ItemCarrito,
} from '../componentes/venta/itemsCarrito';
import { ModalAgregarFraccionado } from '../componentes/venta/ModalAgregarFraccionado';
import { ModalAgregarGranel } from '../componentes/venta/ModalAgregarGranel';
import { ModalAgregarPiezaEntera } from '../componentes/venta/ModalAgregarPiezaEntera';
import { ModalAgregarUnidad } from '../componentes/venta/ModalAgregarUnidad';
import { ModalCobro } from '../componentes/venta/ModalCobro';
import { useHeader } from '../componentes/header/ContextoHeader';

function mensajeErrorCobro(error: unknown): string {
  if (error instanceof StockInsuficienteError) {
    return 'No hay stock suficiente para completar la venta. Revisá los ítems del carrito.';
  }
  if (error instanceof TotalIncoherenteError) {
    return 'El total no coincide con los ítems del carrito. Volvé a intentar.';
  }
  if (error instanceof VentaVaciaError) {
    return 'El carrito está vacío.';
  }
  if (error instanceof ItemInvalidoError) {
    return 'Uno de los ítems del carrito quedó inválido. Quitalo y agregalo de nuevo.';
  }
  return 'No se pudo registrar la venta. Intentá de nuevo.';
}

/**
 * Detalle breve para el catch tardío del cobro offline (ver `confirmarCobro`):
 * mismo catálogo de errores tipados que `mensajeErrorCobro`, pero recortado a
 * la causa puntual, sin la frase de acción ("Revisá…") que ahí tiene sentido
 * porque el usuario está viendo el carrito, y acá no.
 */
function detalleErrorTipado(error: unknown): string | null {
  if (error instanceof StockInsuficienteError) return 'no hay stock suficiente';
  if (error instanceof TotalIncoherenteError) return 'el total no coincide con los ítems';
  if (error instanceof VentaVaciaError) return 'el carrito estaba vacío';
  if (error instanceof ItemInvalidoError) return 'un ítem del carrito quedó inválido';
  return null;
}

/**
 * POS de venta (home de la app, docs/06-ui-ux.md §1-§2): buscador + grilla de
 * productos, carrito, cobro. Trae productos activos y piezas disponibles con
 * las MISMAS queries memoizadas que `Stock.tsx` (agrupadas client-side con
 * `agruparPiezasPorProducto`), nunca una query por producto.
 *
 * Agregar al carrito arma el `ItemCarrito` correspondiente al `modoStock` del
 * producto tocado (ver `componentes/venta/itemsCarrito.ts`); cobrar arma un
 * `EntradaVenta` y llama a `registrarVenta` siguiendo el patrón §8 de
 * escrituras offline-first (mismo criterio que `Productos.tsx`).
 */
export function Venta() {
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  useHeader({ titulo: 'Venta' });

  // La venta en curso vive en `ProveedorCarrito` (docs/06-ui-ux.md §6,
  // montado en Shell.tsx por encima del Outlet), no en estado local: así
  // sobrevive a la navegación entre tabs.
  const {
    items: carrito,
    agregar: agregarItemAlCarrito,
    quitar: quitarDelCarrito,
    vaciar: vaciarCarrito,
    actualizar: actualizarCarrito,
    proximaClave,
  } = useCarrito();

  const [intento, setIntento] = useState(0);
  const [productoParaAgregar, setProductoParaAgregar] = useState<Producto | null>(null);
  // Ítem del carrito que se está EDITANDO (docs/06-ui-ux.md §6: tocar un
  // ítem al peso reabre su modal precargado). Mutuamente excluyente con
  // `productoParaAgregar` — `abrirParaAgregar`/`editarAlPeso` garantizan que
  // solo uno de los dos esté seteado a la vez.
  const [itemParaEditar, setItemParaEditar] = useState<ItemCarrito | null>(null);
  const [modalCobroAbierto, setModalCobroAbierto] = useState(false);
  const [cobrando, setCobrando] = useState(false);

  const productosQuery = useMemo(
    () =>
      query(
        collection(db, 'productos').withConverter(productoConverter),
        where('activo', '==', true),
      ),
    [intento],
  );
  const piezasQuery = useMemo(
    () =>
      query(collection(db, 'piezas').withConverter(piezaConverter), where('estado', '==', 'disponible')),
    [intento],
  );

  const productos = useCollection<Producto>(productosQuery);
  const piezas = useCollection<Pieza>(piezasQuery);

  const piezasAgrupadas = useMemo(() => agruparPiezasPorProducto(piezas.datos), [piezas.datos]);

  function reintentar() {
    setIntento((n) => n + 1);
  }

  // Producto activo para los modales de "agregar" (grilla tocada, o "+" de
  // pieza_entera/agregar otra pieza) O el producto del ítem en edición (fila
  // del carrito tocada) — nunca ambos a la vez.
  const productoActivo = itemParaEditar?.producto ?? productoParaAgregar;

  // `itemEnEdicion` se le pasa SOLO al modal cuyo `modoStock` coincide con el
  // del ítem en edición: los otros tres modales siguen montados en el DOM
  // (con `abierto={false}`) mientras `productoActivo !== null`, así que si
  // les pasáramos `itemParaEditar` sin filtrar, cada uno calcularía su propio
  // título "Editar · …" aunque esté cerrado (no visible, pero sí presente en
  // el DOM — confunde queries de test y, en general, es un estado interno
  // que no le corresponde a ese modal).
  const itemFraccionadoEnEdicion =
    itemParaEditar !== null && itemParaEditar.producto.modoStock === 'fraccionado_por_pieza'
      ? itemParaEditar
      : undefined;
  const itemGranelEnEdicion =
    itemParaEditar !== null && itemParaEditar.producto.modoStock === 'granel' ? itemParaEditar : undefined;

  function cerrarModales() {
    setProductoParaAgregar(null);
    setItemParaEditar(null);
  }

  function abrirParaAgregar(producto: Producto) {
    setItemParaEditar(null);
    setProductoParaAgregar(producto);
  }

  function editarAlPeso(item: ItemCarrito) {
    setProductoParaAgregar(null);
    setItemParaEditar(item);
  }

  function agregarAlCarrito(item: ItemCarrito) {
    agregarItemAlCarrito(item);
    cerrarModales();
  }

  /**
   * Confirmar el modal de `fraccionado_por_pieza`/`granel`: si hay un ítem en
   * edición, REEMPLAZA ese ítem por uno nuevo con la MISMA clave (mismo lugar
   * de la lista, misma identidad de React — `reemplazarItem`); si no,
   * agrega un ítem nuevo (flujo de siempre). La aritmética de "cuánto hay
   * disponible" ya la resolvió `piezasParaEditar`/`stockGranelParaEditar`
   * antes de llegar acá (ver props de los modales, abajo).
   */
  function confirmarFraccionado(pieza: Pieza, gramos: Peso) {
    if (productoActivo === null) return;
    if (itemParaEditar !== null) {
      actualizarCarrito(
        reemplazarItem(
          carrito,
          itemParaEditar.clave,
          crearItemFraccionado(productoActivo, pieza, gramos, itemParaEditar.clave),
        ),
      );
      cerrarModales();
    } else {
      agregarAlCarrito(crearItemFraccionado(productoActivo, pieza, gramos, proximaClave()));
    }
  }

  function confirmarGranel(gramos: Peso) {
    if (productoActivo === null) return;
    if (itemParaEditar !== null) {
      actualizarCarrito(
        reemplazarItem(
          carrito,
          itemParaEditar.clave,
          crearItemGranel(productoActivo, gramos, itemParaEditar.clave),
        ),
      );
      cerrarModales();
    } else {
      agregarAlCarrito(crearItemGranel(productoActivo, gramos, proximaClave()));
    }
  }

  async function confirmarCobro(medioPago: MedioPago) {
    if (perfil === null) return;

    const entrada: EntradaVenta = {
      usuarioId: perfil.uid,
      medioPago,
      // `ItemCarrito` es un `ItemEntradaVenta` + `clave` de lista de React;
      // se arma explícito acá (en vez de desestructurar `clave` afuera) para
      // no dejar una variable descartada sin uso.
      items: carrito.map((item) => ({
        producto: item.producto,
        pieza: item.pieza,
        gramos: item.gramos,
        unidades: item.unidades,
        precioUnitCents: item.precioUnitCents,
        subtotalCents: item.subtotalCents,
      })),
      totalCents: totalCarrito(carrito),
    };

    const escritura = registrarVenta(db, entrada);

    if (!enLinea) {
      setModalCobroAbierto(false);
      vaciarCarrito();
      mostrarToast('Venta guardada sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch((error: unknown) => {
        // Si `registrarVenta` rechaza (p. ej. por validación), la venta
        // nunca llegó a escribirse: NO está en Historial, así que el toast
        // no puede prometer eso — solo puede avisar que se perdió.
        const detalle = detalleErrorTipado(error);
        const mensaje =
          detalle !== null
            ? `No se pudo registrar la venta: ${detalle}. La venta no quedó guardada.`
            : 'No se pudo registrar la venta. La venta no quedó guardada.';
        mostrarToast(mensaje, 'error');
      });
      return;
    }

    setCobrando(true);
    try {
      await escritura;
      mostrarToast('Venta registrada.', 'exito');
      vaciarCarrito();
      setModalCobroAbierto(false);
    } catch (error) {
      mostrarToast(mensajeErrorCobro(error), 'error');
    } finally {
      setCobrando(false);
    }
  }

  const cargando = productos.cargando || piezas.cargando;
  const error = productos.error ?? piezas.error;

  let contenido;
  if (cargando) {
    contenido = <p className="py-8 text-center text-texto-secundario">Cargando productos…</p>;
  } else if (error !== null) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar el catálogo. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  } else if (productos.datos.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">Sin productos — creá el catálogo primero.</p>
        <Link
          to="/stock/productos"
          className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
        >
          Ir a Productos
        </Link>
      </div>
    );
  } else {
    contenido = (
      <GrillaProductos
        productos={productos.datos}
        piezasAgrupadas={piezasAgrupadas}
        onSeleccionar={abrirParaAgregar}
      />
    );
  }

  return (
    // pb-24 reserva espacio para que la hoja fija del carrito mobile
    // (Carrito.tsx) no tape el final de la grilla. En Cálido esa hoja flota
    // 0.75rem más arriba que en Minimalista (mismo delta que
    // calido:bottom-[calc(var(--altura-zona-inferior)+0.75rem)] en
    // Carrito.tsx) — se suma el mismo hueco acá para que el clearance siga
    // alcanzando. lg:pb-0 anula todo esto en desktop (el carrito pasa a ser
    // el <aside> lateral, no la hoja fija).
    <div className="flex flex-col gap-4 pb-24 calido:pb-27 lg:grid lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-6 lg:pb-0">
      <div className="flex flex-col gap-4">
        {contenido}
      </div>

      <Carrito
        items={carrito}
        onQuitar={quitarDelCarrito}
        onCobrar={() => setModalCobroAbierto(true)}
        procesando={cobrando}
        onCambiarUnidades={(clave, delta) => actualizarCarrito(cambiarUnidades(carrito, clave, delta))}
        onEditarAlPeso={editarAlPeso}
        onAgregarOtraPieza={(item) => abrirParaAgregar(item.producto)}
      />

      {productoActivo !== null && (
        <>
          <ModalAgregarFraccionado
            abierto={productoActivo.modoStock === 'fraccionado_por_pieza'}
            onCerrar={cerrarModales}
            producto={productoActivo}
            piezasDisponibles={
              itemFraccionadoEnEdicion !== undefined
                ? piezasParaEditar(
                    piezasAgrupadas.get(productoActivo.id) ?? [],
                    productoActivo.id,
                    carrito,
                    itemFraccionadoEnEdicion.clave,
                  )
                : piezasAjustadasPorCarrito(piezasAgrupadas.get(productoActivo.id) ?? [], productoActivo.id, carrito)
            }
            itemEnEdicion={itemFraccionadoEnEdicion}
            onAgregar={confirmarFraccionado}
          />
          <ModalAgregarPiezaEntera
            abierto={productoActivo.modoStock === 'pieza_entera'}
            onCerrar={cerrarModales}
            producto={productoActivo}
            piezasDisponibles={(piezasAgrupadas.get(productoActivo.id) ?? []).filter(
              (pieza) => !piezaIdsEnCarrito(carrito).has(pieza.id),
            )}
            onAgregar={(pieza) => agregarAlCarrito(crearItemPiezaEntera(productoActivo, pieza, proximaClave()))}
          />
          <ModalAgregarGranel
            abierto={productoActivo.modoStock === 'granel'}
            onCerrar={cerrarModales}
            producto={productoActivo}
            itemEnEdicion={itemGranelEnEdicion}
            onAgregar={confirmarGranel}
          />
          <ModalAgregarUnidad
            abierto={productoActivo.modoStock === 'unidad_simple'}
            onCerrar={cerrarModales}
            producto={productoActivo}
            onAgregar={(unidades) => agregarAlCarrito(crearItemUnidad(productoActivo, unidades, proximaClave()))}
          />
        </>
      )}

      <ModalCobro
        abierto={modalCobroAbierto}
        onCerrar={() => setModalCobroAbierto(false)}
        total={totalCarrito(carrito)}
        procesando={cobrando}
        onConfirmar={(medioPago) => void confirmarCobro(medioPago)}
      />
    </div>
  );
}
