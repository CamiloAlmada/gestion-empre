import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import type { Categoria, MovimientoStock, Pieza, Producto } from '@gestion/core';
import {
  categoriaConverter,
  movimientoConverter,
  piezaConverter,
  productoConverter,
  useAuth,
  useCollection,
  useOnlineStatus,
} from '@gestion/firebase-kit';
import { Button } from '@gestion/ui';
import { db } from '../firebase';
import { agruparPorCategoria } from '../componentes/stock/agrupacion';
import { contarAlertas, filtrarPorAlerta, type TipoAlerta } from '../componentes/stock/alertas';
import { DetalleProducto } from '../componentes/stock/DetalleProducto';
import { FranjaAlertas } from '../componentes/stock/FranjaAlertas';
import { ListaProductosAgrupada } from '../componentes/stock/ListaProductosAgrupada';
import { ModalAjusteNegativo } from '../componentes/stock/ModalAjusteNegativo';
import { ModalIngresarPiezas } from '../componentes/stock/ModalIngresarPiezas';
import { ModalSumarStock } from '../componentes/stock/ModalSumarStock';
import { agruparPiezasPorProducto, calcularResumen, type ResumenStock } from '../componentes/stock/resumen';

type Modal = 'ingreso' | 'sumar' | 'ajuste' | null;

/** `modoStock` que se controla por piezas físicas (con peso propio). */
function esModoStockPorPieza(modoStock: Producto['modoStock']): boolean {
  return modoStock === 'fraccionado_por_pieza' || modoStock === 'pieza_entera';
}

/**
 * Pantalla Stock: lista maestra de productos con su resumen de existencias
 * (según `modoStock`) y, al tocar uno, su detalle en la misma pantalla (sin
 * ruta nueva). Admin puede ingresar piezas manualmente, sumar granel/unidades
 * y aplicar ajustes/merma con motivo; vendedor solo mira.
 *
 * Trae productos activos, piezas disponibles y categorías (ordenadas por
 * `orden`) con UNA sola `useCollection` cada una (memoizadas), y agrupa
 * client-side: piezas por producto, y productos por categoría para la lista
 * maestra — nunca una query por producto ni por categoría.
 */
export function Stock() {
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();
  const esAdmin = perfil?.rol === 'admin';

  const [intento, setIntento] = useState(0);
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [piezaParaAjustar, setPiezaParaAjustar] = useState<Pieza | null>(null);
  const [alertaActiva, setAlertaActiva] = useState<TipoAlerta | null>(null);

  // `db` es el import estable de '../firebase' (no cambia entre renders); la
  // única dependencia real de estas queries es `intento`, que fuerza un
  // resubscribe manual al tocar "Reintentar" (useCollection resubscribe por
  // IDENTIDAD de query, ver su doc).
  const productosQuery = useMemo(
    () =>
      query(
        collection(db, 'productos').withConverter(productoConverter),
        where('activo', '==', true),
        orderBy('nombre'),
      ),
    [intento],
  );
  const piezasQuery = useMemo(
    () =>
      query(collection(db, 'piezas').withConverter(piezaConverter), where('estado', '==', 'disponible')),
    [intento],
  );
  const categoriasQuery = useMemo(
    () => query(collection(db, 'categorias').withConverter(categoriaConverter), orderBy('orden')),
    [intento],
  );

  const productos = useCollection<Producto>(productosQuery);
  const piezas = useCollection<Pieza>(piezasQuery);
  const categorias = useCollection<Categoria>(categoriasQuery);

  const piezasAgrupadas = useMemo(() => agruparPiezasPorProducto(piezas.datos), [piezas.datos]);

  // Resumen por producto, base tanto de las filas (peso/vencimiento) como de
  // la franja de alertas: se calcula UNA vez acá y se reutiliza, en vez de
  // recalcularlo en `ListaProductos` y en la franja por separado.
  const resumenesPorProducto = useMemo(() => {
    const mapa = new Map<string, ResumenStock>();
    for (const producto of productos.datos) {
      mapa.set(producto.id, calcularResumen(producto, piezasAgrupadas.get(producto.id) ?? []));
    }
    return mapa;
  }, [productos.datos, piezasAgrupadas]);

  const conteoAlertas = useMemo(
    () => contarAlertas(productos.datos, resumenesPorProducto),
    [productos.datos, resumenesPorProducto],
  );

  function alternarAlerta(alerta: TipoAlerta) {
    setAlertaActiva((actual) => (actual === alerta ? null : alerta));
  }

  const productosFiltrados = useMemo(
    () => filtrarPorAlerta(productos.datos, resumenesPorProducto, alertaActiva),
    [productos.datos, resumenesPorProducto, alertaActiva],
  );

  const gruposPorCategoria = useMemo(
    () => agruparPorCategoria(productosFiltrados, categorias.datos),
    [productosFiltrados, categorias.datos],
  );

  const productoSeleccionado = productos.datos.find((p) => p.id === productoSeleccionadoId) ?? null;

  // Últimas existencias (movimientos) solo aplican a granel/unidad_simple: los
  // productos por pieza ya muestran su historial completo vía la tabla de
  // piezas (peso restante/inicial/vencimiento). `query: null` desactiva el
  // hook sin romper las reglas de hooks (ver useCollection.ts).
  const movimientosQuery = useMemo(() => {
    if (productoSeleccionadoId === null || productoSeleccionado === null) return null;
    if (esModoStockPorPieza(productoSeleccionado.modoStock)) return null;
    return query(
      collection(db, 'movimientos').withConverter(movimientoConverter),
      where('productoId', '==', productoSeleccionadoId),
      orderBy('fecha', 'desc'),
      limit(10),
    );
  }, [productoSeleccionadoId, productoSeleccionado?.modoStock]);
  const movimientos = useCollection<MovimientoStock>(movimientosQuery);

  function reintentar() {
    setIntento((n) => n + 1);
  }

  function cerrarModal() {
    setModal(null);
    setPiezaParaAjustar(null);
  }

  function abrirAjusteProducto() {
    setPiezaParaAjustar(null);
    setModal('ajuste');
  }

  function abrirAjustePieza(pieza: Pieza) {
    setPiezaParaAjustar(pieza);
    setModal('ajuste');
  }

  const cargando = productos.cargando || piezas.cargando || categorias.cargando;
  const error = productos.error ?? piezas.error ?? categorias.error;

  let contenido;
  if (cargando) {
    contenido = <p className="py-8 text-center text-texto-secundario">Cargando stock…</p>;
  } else if (error !== null) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar el stock. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  } else if (productos.datos.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">Sin productos — creá el catálogo primero.</p>
        <Link
          to="/stock/productos"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
        >
          Ir a Productos
        </Link>
      </div>
    );
  } else if (productoSeleccionado === null) {
    contenido = (
      <>
        <FranjaAlertas conteo={conteoAlertas} alertaActiva={alertaActiva} onAlternar={alternarAlerta} />
        <div className="flex justify-end">
          <Link
            to="/stock/productos"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-borde bg-superficie px-4 text-sm font-medium text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            Gestionar catálogo
          </Link>
        </div>
        <ListaProductosAgrupada
          grupos={gruposPorCategoria}
          piezasAgrupadas={piezasAgrupadas}
          onSeleccionar={(producto) => setProductoSeleccionadoId(producto.id)}
        />
      </>
    );
  } else {
    contenido = (
      <DetalleProducto
        producto={productoSeleccionado}
        piezasDelProducto={piezasAgrupadas.get(productoSeleccionado.id) ?? []}
        resumen={calcularResumen(productoSeleccionado, piezasAgrupadas.get(productoSeleccionado.id) ?? [])}
        estadoMovimientos={movimientos}
        esAdmin={esAdmin}
        onVolver={() => setProductoSeleccionadoId(null)}
        onIngresarPiezas={() => setModal('ingreso')}
        onSumarStock={() => setModal('sumar')}
        onAjustarProducto={abrirAjusteProducto}
        onAjustarPieza={abrirAjustePieza}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!enLinea && (
        <p role="status" className="rounded-xl border border-borde bg-superficie p-3 text-sm text-texto-secundario">
          Sin conexión: los cambios se guardan localmente y se sincronizan al reconectar.
        </p>
      )}

      {contenido}

      {esAdmin && perfil !== null && productoSeleccionado !== null && (
        <>
          <ModalIngresarPiezas
            abierto={modal === 'ingreso'}
            onCerrar={cerrarModal}
            db={db}
            producto={productoSeleccionado}
            usuarioId={perfil.uid}
          />
          <ModalSumarStock
            abierto={modal === 'sumar'}
            onCerrar={cerrarModal}
            db={db}
            producto={productoSeleccionado}
            usuarioId={perfil.uid}
          />
          <ModalAjusteNegativo
            abierto={modal === 'ajuste'}
            onCerrar={cerrarModal}
            db={db}
            producto={productoSeleccionado}
            usuarioId={perfil.uid}
            pieza={piezaParaAjustar ?? undefined}
          />
        </>
      )}
    </div>
  );
}
