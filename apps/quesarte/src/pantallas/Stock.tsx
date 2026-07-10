import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { collection, orderBy, query, where } from 'firebase/firestore';
import type { Categoria, Pieza, Producto } from '@gestion/core';
import {
  categoriaConverter,
  piezaConverter,
  productoConverter,
  useCollection,
} from '@gestion/firebase-kit';
import { Button, ChipsFiltro } from '@gestion/ui';
import { db } from '../firebase';
import { agruparPorCategoria, categoriasVisibles } from '../componentes/stock/agrupacion';
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
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);

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

  // Auto-reset: si el filtro activo queda sin productos (p.ej. una
  // actualización en vivo de Firestore hace que el conteo de esa alerta
  // llegue a 0), el chip correspondiente desaparece de `FranjaAlertas` — sin
  // este efecto, `alertaActiva` quedaría apuntando a una alerta sin chip
  // visible para des-togglearla, y la lista se vería vacía sin salida
  // (docs/06-ui-ux.md §1, "todo estado existe"). Se compara contra el
  // conteo ya recalculado, así que vuelve a `null` apenas ese conteo cae a 0;
  // no hay riesgo de loop: una vez en `null` la condición de guarda corta acá.
  useEffect(() => {
    if (alertaActiva === null) return;
    const cantidad = alertaActiva === 'por_vencer' ? conteoAlertas.porVencer : conteoAlertas.stockBajo;
    if (cantidad === 0) setAlertaActiva(null);
  }, [alertaActiva, conteoAlertas]);

  const productosFiltrados = useMemo(
    () => filtrarPorAlerta(productos.datos, resumenesPorProducto, alertaActiva),
    [productos.datos, resumenesPorProducto, alertaActiva],
  );

  // Chips de filtro por categoría (docs/06-ui-ux.md §3, tarea UI-3d): se
  // calculan sobre `productosFiltrados` (YA recortado por la alerta activa,
  // si hay una) para componer como AND con `FranjaAlertas`. Mismo auto-reset
  // que `alertaActiva` arriba: si la categoría elegida se queda sin chip
  // (p. ej. se activa una alerta que la deja sin productos), vuelve a
  // "Todas" en vez de dejar la lista en un callejón sin salida.
  const opcionesCategoria = useMemo(
    () => categoriasVisibles(productosFiltrados, categorias.datos),
    [productosFiltrados, categorias.datos],
  );

  useEffect(() => {
    if (categoriaFiltro === null) return;
    if (!opcionesCategoria.some((c) => c.nombre === categoriaFiltro)) setCategoriaFiltro(null);
  }, [categoriaFiltro, opcionesCategoria]);

  const productosParaAgrupar = useMemo(() => {
    if (categoriaFiltro === null) return productosFiltrados;
    return productosFiltrados.filter((p) => p.categoria === categoriaFiltro);
  }, [productosFiltrados, categoriaFiltro]);

  const gruposPorCategoria = useMemo(
    () => agruparPorCategoria(productosParaAgrupar, categorias.datos),
    [productosParaAgrupar, categorias.datos],
  );

  // Stock ya NO declara acciones de navegación en el header (docs/06-ui-ux.md
  // §2, 2026-07-10): el `SelectorSeccion` del layout compartido (`StockLayout`,
  // UI-4) las reemplaza. Sin acciones contextuales propias, el cluster
  // flotante queda libre para las de la sección activa.
  useHeader({ titulo: 'Stock' });

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
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar el stock. Revisá tu conexión e intentá de nuevo.
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
          Ir a Catálogo
        </Link>
      </div>
    );
  } else {
    contenido = (
      <>
        {opcionesCategoria.length > 1 && (
          <ChipsFiltro
            ariaLabel="Filtrar por categoría"
            opciones={opcionesCategoria.map((c) => c.nombre)}
            valor={categoriaFiltro}
            onCambiar={setCategoriaFiltro}
          />
        )}
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
