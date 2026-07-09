import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import type { MovimientoStock, Pieza, Producto } from '@gestion/core';
import {
  movimientoConverter,
  piezaConverter,
  productoConverter,
  useAuth,
  useCollection,
} from '@gestion/firebase-kit';
import { Button } from '@gestion/ui';
import { db } from '../firebase';
import { DetalleProducto } from '../componentes/stock/DetalleProducto';
import { ModalAjusteNegativo } from '../componentes/stock/ModalAjusteNegativo';
import { ModalIngresarPiezas } from '../componentes/stock/ModalIngresarPiezas';
import { ModalSumarStock } from '../componentes/stock/ModalSumarStock';
import { agruparPiezasPorProducto, calcularResumen } from '../componentes/stock/resumen';
import { useHeader } from '../componentes/header/ContextoHeader';

type Modal = 'ingreso' | 'sumar' | 'ajuste' | null;

/** `modoStock` que se controla por piezas físicas (con peso propio). */
function esModoStockPorPieza(modoStock: Producto['modoStock']): boolean {
  return modoStock === 'fraccionado_por_pieza' || modoStock === 'pieza_entera';
}

/**
 * Detalle de UN producto, en su propia ruta (`/stock/producto/:id`, ver
 * App.tsx). Antes vivía como estado interno de `Stock.tsx`; SH-1 lo mudó a
 * ruta real para que el back del sistema funcione siempre
 * (docs/06-ui-ux.md §2). Trae productos activos y piezas disponibles con las
 * MISMAS queries memoizadas que `Stock.tsx` (no una query por producto) y
 * busca el `id` de la URL client-side — mismo criterio de siempre.
 *
 * El título del header ES el nombre del producto y el volver lleva a Stock
 * (`useHeader`); las acciones de escritura a nivel producto (ingresar
 * piezas / sumar stock / ajuste) también viven en el header — hasta 2, entran
 * justo en el caso granel/unidad (Sumar stock + Ajuste/merma).
 */
export function DetalleProductoPantalla() {
  const { id } = useParams<{ id: string }>();
  const { perfil } = useAuth();
  const esAdmin = perfil?.rol === 'admin';

  const [intento, setIntento] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [piezaParaAjustar, setPiezaParaAjustar] = useState<Pieza | null>(null);

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

  const productos = useCollection<Producto>(productosQuery);
  const piezas = useCollection<Pieza>(piezasQuery);

  const piezasAgrupadas = useMemo(() => agruparPiezasPorProducto(piezas.datos), [piezas.datos]);
  const producto = productos.datos.find((p) => p.id === id) ?? null;

  // Últimas existencias (movimientos) solo aplican a granel/unidad_simple: los
  // productos por pieza ya muestran su historial completo vía la tabla de
  // piezas. `query: null` desactiva el hook sin romper las reglas de hooks
  // (ver useCollection.ts).
  const movimientosQuery = useMemo(() => {
    if (id === undefined || producto === null) return null;
    if (esModoStockPorPieza(producto.modoStock)) return null;
    return query(
      collection(db, 'movimientos').withConverter(movimientoConverter),
      where('productoId', '==', id),
      orderBy('fecha', 'desc'),
      limit(10),
    );
  }, [id, producto?.modoStock]);
  const movimientos = useCollection<MovimientoStock>(movimientosQuery);

  const cargando = productos.cargando || piezas.cargando;
  const noEncontrado = !cargando && productos.error === null && producto === null;

  const tituloHeader = cargando ? 'Producto' : (producto?.nombre ?? 'Producto no encontrado');

  useHeader({
    titulo: tituloHeader,
    volverA: { etiqueta: 'Stock', a: '/stock' },
    // min-h-[48px] en las tres: en mobile flotan sobre la tab bar
    // (docs/06-ui-ux.md §2 y §5 — targets ≥48px ahí; `Button` no fuerza una
    // altura mínima propia).
    acciones:
      esAdmin && producto !== null ? (
        esModoStockPorPieza(producto.modoStock) ? (
          <Button onClick={() => setModal('ingreso')} className="min-h-[48px]">
            Ingresar piezas
          </Button>
        ) : (
          <>
            <Button onClick={() => setModal('sumar')} className="min-h-[48px]">
              Sumar stock
            </Button>
            <Button variante="secundaria" onClick={() => setModal('ajuste')} className="min-h-[48px]">
              Ajuste / merma
            </Button>
          </>
        )
      ) : undefined,
  });

  function reintentar() {
    setIntento((n) => n + 1);
  }

  function cerrarModal() {
    setModal(null);
    setPiezaParaAjustar(null);
  }

  function abrirAjustePieza(pieza: Pieza) {
    setPiezaParaAjustar(pieza);
    setModal('ajuste');
  }

  if (cargando) {
    return <p className="py-8 text-center text-texto-secundario">Cargando producto…</p>;
  }

  if (productos.error !== null || piezas.error !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar el producto. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  }

  if (noEncontrado || producto === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No encontramos ese producto. Puede haberse desactivado.
        </p>
        <Link
          to="/stock"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
        >
          Volver a Stock
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DetalleProducto
        producto={producto}
        piezasDelProducto={piezasAgrupadas.get(producto.id) ?? []}
        resumen={calcularResumen(producto, piezasAgrupadas.get(producto.id) ?? [])}
        estadoMovimientos={movimientos}
        esAdmin={esAdmin}
        onAjustarPieza={abrirAjustePieza}
      />

      {esAdmin && perfil !== null && (
        <>
          <ModalIngresarPiezas
            abierto={modal === 'ingreso'}
            onCerrar={cerrarModal}
            db={db}
            producto={producto}
            usuarioId={perfil.uid}
          />
          <ModalSumarStock
            abierto={modal === 'sumar'}
            onCerrar={cerrarModal}
            db={db}
            producto={producto}
            usuarioId={perfil.uid}
          />
          <ModalAjusteNegativo
            abierto={modal === 'ajuste'}
            onCerrar={cerrarModal}
            db={db}
            producto={producto}
            usuarioId={perfil.uid}
            pieza={piezaParaAjustar ?? undefined}
          />
        </>
      )}
    </div>
  );
}
