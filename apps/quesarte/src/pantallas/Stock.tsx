import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { collection, orderBy, query, where } from 'firebase/firestore';
import type { Categoria, Pieza, Producto } from '@gestion/core';
import { categoriaConverter, piezaConverter, productoConverter, useCollection } from '@gestion/firebase-kit';
import { Button } from '@gestion/ui';
import { db } from '../firebase';
import { agruparPorCategoria } from '../componentes/stock/agrupacion';
import { contarAlertas, filtrarPorAlerta, type TipoAlerta } from '../componentes/stock/alertas';
import { FranjaAlertas } from '../componentes/stock/FranjaAlertas';
import { ListaProductosAgrupada } from '../componentes/stock/ListaProductosAgrupada';
import { agruparPiezasPorProducto, calcularResumen, type ResumenStock } from '../componentes/stock/resumen';
import { useHeader } from '../componentes/header/ContextoHeader';

/**
 * Pantalla Stock: lista maestra de productos con su resumen de existencias
 * (según `modoStock`), agrupada por categoría. Tocar un producto navega a su
 * detalle en `/stock/producto/:id` (ruta real, ver `DetalleProductoPantalla`
 * y App.tsx — antes era estado interno, SH-1 lo mudó para que el back del
 * sistema funcione siempre, docs/06-ui-ux.md §2).
 *
 * Trae productos activos, piezas disponibles y categorías (ordenadas por
 * `orden`) con UNA sola `useCollection` cada una (memoizadas), y agrupa
 * client-side: piezas por producto, y productos por categoría para la lista
 * maestra — nunca una query por producto ni por categoría.
 */
export function Stock() {
  const navigate = useNavigate();

  const [intento, setIntento] = useState(0);
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

  useHeader({
    titulo: 'Stock',
    acciones: (
      <Link
        to="/stock/productos"
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-borde bg-superficie px-3 text-sm font-medium text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        Catálogo
      </Link>
    ),
  });

  function reintentar() {
    setIntento((n) => n + 1);
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
  } else {
    contenido = (
      <>
        <FranjaAlertas conteo={conteoAlertas} alertaActiva={alertaActiva} onAlternar={alternarAlerta} />
        <ListaProductosAgrupada
          grupos={gruposPorCategoria}
          piezasAgrupadas={piezasAgrupadas}
          onSeleccionar={(producto) => navigate(`/stock/producto/${producto.id}`)}
        />
      </>
    );
  }

  return <div className="flex flex-col gap-4">{contenido}</div>;
}
