import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { addDoc, collection, orderBy, query, where } from 'firebase/firestore';
import { money, peso, type Categoria, type Pieza, type Producto } from '@gestion/core';
import {
  categoriaConverter,
  piezaConverter,
  productoConverter,
  useAuth,
  useCollection,
  useOnlineStatus,
} from '@gestion/firebase-kit';
import { Button, CampoBusqueda, Chip, ChipsFiltro, normalizarBusqueda, useToasts } from '@gestion/ui';
import { db } from '../firebase';
import { agruparPorCategoria, categoriasVisibles } from '../componentes/stock/agrupacion';
import { contarAlertas, filtrarPorAlerta, type TipoAlerta } from '../componentes/stock/alertas';
import { FranjaAlertas } from '../componentes/stock/FranjaAlertas';
import { ListaProductosAgrupada } from '../componentes/stock/ListaProductosAgrupada';
import { agruparPiezasPorProducto, calcularResumen, type ResumenStock } from '../componentes/stock/resumen';
import { IconoFiltros } from '../componentes/iconos';
import { useHeader } from '../componentes/header/ContextoHeader';
import { ModalProducto, type DatosAltaProducto, type DatosProductoFormulario } from './ModalProducto';

const coleccionProductos = collection(db, 'productos').withConverter(productoConverter);
const coleccionCategorias = collection(db, 'categorias').withConverter(categoriaConverter);

// Acciones compactas del header (docs/06-ui-ux.md §2, hasta 2 por pantalla):
// mismas clases visuales que `Button` de @gestion/ui, pero con `aria-label`
// propio (Button no lo expone) para que "Agregar" pueda mostrarse como ícono
// solo en mobile sin perder un nombre accesible descriptivo. min-h/min-w de
// 48px (no 44): en mobile flotan sobre la tab bar (docs/06 §2 y §5 — targets
// ≥48px ahí).
const CLASE_ACCION_PRIMARIA =
  'inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-control bg-primary-600 px-3 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie';

/**
 * Crea un producto nuevo. Campos fijados por regla de negocio
 * (docs/02-dominio-quesarte.md): costo promedio en cero (todavía no hay
 * compras), stock agregado en cero SOLO para `granel`/`unidad_simple` (las
 * piezas de `fraccionado_por_pieza`/`pieza_entera` se cargan aparte, en el
 * detalle del producto), y `activo: true`. `id` es un valor ficticio: el
 * converter nunca lo persiste (lo asigna Firestore) — ver producto.test.ts.
 */
async function crearProducto(datos: DatosAltaProducto): Promise<void> {
  const camposStock: Partial<Producto> =
    datos.modoStock === 'granel'
      ? { stockGranelGramos: peso(0) }
      : datos.modoStock === 'unidad_simple'
        ? { stockUnidades: 0 }
        : {};

  const documento: Producto = {
    id: '',
    nombre: datos.nombre,
    categoria: datos.categoria,
    modoPrecio: datos.modoPrecio,
    modoStock: datos.modoStock,
    precioVentaCents: datos.precioVentaCents,
    costoPromedioCents: money(0),
    umbralAlertaStock: datos.umbralAlertaStock,
    activo: true,
    actualizadoEn: new Date(),
    ...camposStock,
  };

  await addDoc(coleccionProductos, documento);
}

/**
 * Pantalla "Productos" (sección interna del tab Stock, docs/06-ui-ux.md §2):
 * fusión de las ex `Stock.tsx` (lista agrupada por categoría, franja de
 * alertas) y `Productos.tsx`/Catálogo (búsqueda full-width, alta) — UI-5,
 * decidida por el dueño: para el vendedor eran ~90% la misma pantalla. Es la
 * ÚNICA lista de productos del tab.
 *
 * Tocar una fila navega SIEMPRE a `/stock/producto/:id` (ruta real),
 * inclusive para productos inactivos. La EDICIÓN desde el listado
 * desaparece: la ficha de detalle es el hub único de edición en el lugar
 * (tarea UI-5b, de otro autor — fuera de alcance acá); esta pantalla solo
 * resuelve el ALTA (solo admin).
 *
 * Trae TODOS los productos (activos e inactivos) con UNA sola `useCollection`
 * SIN `where('activo')` — evita una query/índice nuevo (las reglas de
 * Firestore ya permiten a cualquier autenticado leer todo `productos`, la ex
 * Catálogo ya traía todo) — y filtra client-side. Piezas disponibles y
 * categorías (por `orden`) se traen igual que la ex Stock. Los inactivos NO
 * se muestran por defecto: el chip "Inactivos" del panel de filtros extra
 * (WA-H3, solo-admin) los agrega, atenuados y con badge — espejo del
 * criterio de dados de baja en Clientes.
 */
export function Productos() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();
  const esAdmin = perfil?.rol === 'admin';

  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [alertaActiva, setAlertaActiva] = useState<TipoAlerta | null>(null);
  // Chip "Inactivos" del panel de filtros extra (WA-H3, solo-admin): para
  // vendedor queda siempre `false` (ni el botón ni el panel se renderizan
  // para ese rol, ver el JSX de abajo).
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [panelFiltrosAbierto, setPanelFiltrosAbierto] = useState(false);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useHeader({
    titulo: 'Productos',
    acciones: esAdmin ? (
      <button
        type="button"
        onClick={() => setAltaAbierta(true)}
        aria-label="Agregar producto"
        className={CLASE_ACCION_PRIMARIA}
      >
        <span aria-hidden="true">＋</span>
        <span className="hidden md:inline">Agregar</span>
      </button>
    ) : undefined,
  });

  // `db` es el import estable de '../firebase' (no cambia entre renders); la
  // única dependencia real de estas queries es `intento`, que fuerza un
  // resubscribe manual al tocar "Reintentar" (useCollection resubscribe por
  // IDENTIDAD de query, ver su doc).
  const productosQuery = useMemo(() => query(coleccionProductos, orderBy('nombre')), [intento]);
  const piezasQuery = useMemo(
    () =>
      query(collection(db, 'piezas').withConverter(piezaConverter), where('estado', '==', 'disponible')),
    [intento],
  );
  const categoriasQuery = useMemo(() => query(coleccionCategorias, orderBy('orden')), [intento]);

  const productos = useCollection<Producto>(productosQuery);
  const piezas = useCollection<Pieza>(piezasQuery);
  const categorias = useCollection<Categoria>(categoriasQuery);

  const piezasAgrupadas = useMemo(() => agruparPiezasPorProducto(piezas.datos), [piezas.datos]);

  // Resumen por producto (activo O inactivo — una fila inactiva también
  // muestra sus existencias), base tanto de las filas como de la franja de
  // alertas: se calcula UNA vez acá y se reutiliza.
  const resumenesPorProducto = useMemo(() => {
    const mapa = new Map<string, ResumenStock>();
    for (const producto of productos.datos) {
      mapa.set(producto.id, calcularResumen(producto, piezasAgrupadas.get(producto.id) ?? []));
    }
    return mapa;
  }, [productos.datos, piezasAgrupadas]);

  const productosActivos = useMemo(() => productos.datos.filter((p) => p.activo), [productos.datos]);

  // Conteo de alertas: SIEMPRE sobre productos activos (contrato,
  // docs/06-ui-ux.md §2/§3) — nunca se ve afectado por el chip "Inactivos" ni
  // por la búsqueda/categoría elegidas.
  const conteoAlertas = useMemo(
    () => contarAlertas(productosActivos, resumenesPorProducto),
    [productosActivos, resumenesPorProducto],
  );

  function alternarAlerta(alerta: TipoAlerta) {
    setAlertaActiva((actual) => (actual === alerta ? null : alerta));
  }

  // Auto-reset: si el filtro activo queda sin productos (p.ej. una
  // actualización en vivo de Firestore hace que el conteo de esa alerta
  // llegue a 0), el chip correspondiente desaparece de `FranjaAlertas` — sin
  // este efecto, `alertaActiva` quedaría apuntando a una alerta sin chip
  // visible para des-togglearla (docs/06-ui-ux.md §1, "todo estado existe").
  useEffect(() => {
    if (alertaActiva === null) return;
    const cantidad = alertaActiva === 'por_vencer' ? conteoAlertas.porVencer : conteoAlertas.stockBajo;
    if (cantidad === 0) setAlertaActiva(null);
  }, [alertaActiva, conteoAlertas]);

  // Ids de los productos ACTIVOS que cumplen la alerta activa (`null` sin
  // alerta activa): reusa `filtrarPorAlerta` tal cual pero solo sobre
  // `productosActivos` — un producto inactivo nunca "cumple" una alerta,
  // aunque su resumen numérico la satisfaga (las alertas son un concepto de
  // catálogo vivo, mismo contrato que `conteoAlertas` arriba).
  const idsBajoAlerta = useMemo(
    () =>
      alertaActiva === null
        ? null
        : new Set(filtrarPorAlerta(productosActivos, resumenesPorProducto, alertaActiva).map((p) => p.id)),
    [alertaActiva, productosActivos, resumenesPorProducto],
  );

  // Filtro compuesto de estado (activo, o inactivo con el chip "Inactivos") +
  // alerta, en UN solo pase sobre `productos.datos` (ya ordenado por
  // `nombre`): preserva el orden alfabético global en vez de concatenar
  // activos e inactivos por separado. Un producto inactivo queda excluido
  // por `idsBajoAlerta` en cuanto hay una alerta activa (nunca pertenece a
  // ese set), sin necesidad de chequear `p.activo` dos veces.
  const productosPorEstadoYAlerta = useMemo(
    () =>
      productos.datos.filter((p) => {
        if (!p.activo && !mostrarInactivos) return false;
        if (idsBajoAlerta !== null && !idsBajoAlerta.has(p.id)) return false;
        return true;
      }),
    [productos.datos, mostrarInactivos, idsBajoAlerta],
  );

  // Búsqueda de texto (heredada de la ex Catálogo, docs/06-ui-ux.md §3):
  // nombre o categoría, acento-insensible vía el helper compartido.
  const productosPorBusqueda = useMemo(() => {
    const consulta = normalizarBusqueda(busqueda.trim());
    if (consulta === '') return productosPorEstadoYAlerta;
    return productosPorEstadoYAlerta.filter(
      (p) => normalizarBusqueda(p.nombre).includes(consulta) || normalizarBusqueda(p.categoria).includes(consulta),
    );
  }, [productosPorEstadoYAlerta, busqueda]);

  // Chips de filtro por categoría (docs/06-ui-ux.md §3): se calculan sobre
  // `productosPorBusqueda` (ya recortado por estado/alerta/búsqueda) para
  // componer como AND. Mismo auto-reset que `alertaActiva`: si la categoría
  // elegida se queda sin chip, vuelve a "Todas".
  const opcionesCategoria = useMemo(
    () => categoriasVisibles(productosPorBusqueda, categorias.datos),
    [productosPorBusqueda, categorias.datos],
  );

  useEffect(() => {
    if (categoriaFiltro === null) return;
    if (!opcionesCategoria.some((c) => c.nombre === categoriaFiltro)) setCategoriaFiltro(null);
  }, [categoriaFiltro, opcionesCategoria]);

  const productosFiltrados = useMemo(() => {
    if (categoriaFiltro === null) return productosPorBusqueda;
    return productosPorBusqueda.filter((p) => p.categoria === categoriaFiltro);
  }, [productosPorBusqueda, categoriaFiltro]);

  const gruposPorCategoria = useMemo(
    () => agruparPorCategoria(productosFiltrados, categorias.datos),
    [productosFiltrados, categorias.datos],
  );

  function reintentar() {
    setIntento((n) => n + 1);
  }

  /**
   * Patrón estándar de escrituras offline-first del proyecto
   * (docs/06-ui-ux.md §8): con conexión se espera el ack del servidor antes
   * de avisar (éxito/error). Sin conexión la promesa de Firestore no
   * resuelve hasta reconectar (persistencia offline habilitada) —
   * esperarla dejaría el modal colgado indefinidamente. En ese caso la
   * escritura se dispara SIN `await` (la caché local ya la aplicó al
   * instante y `useCollection` ya la refleja en la lista), se cierra el
   * modal ya mismo y se avisa que falta sincronizar; un `.catch` tardío
   * cubre el caso borde de que el servidor la rechace al reconectar.
   */
  async function handleGuardar(datos: DatosProductoFormulario) {
    // Este flujo es alta-only (`producto={null}` siempre, ver el
    // `ModalProducto` de abajo): narrowea el tipo — `ModalProducto` nunca
    // emite `'edicion'` acá, pero TS no lo sabe por la sola firma de
    // `onGuardar` (compartida con la edición del detalle, UI-5b).
    if (datos.tipo !== 'alta') return;
    const escritura = crearProducto(datos);

    if (!enLinea) {
      setAltaAbierta(false);
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => mostrarToast('No se pudo sincronizar el producto creado.', 'error'));
      return;
    }

    setGuardando(true);
    try {
      await escritura;
      mostrarToast('Producto creado.', 'exito');
      setAltaAbierta(false);
    } catch {
      mostrarToast('No se pudo crear el producto. Intentá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  const cargando = productos.cargando || piezas.cargando || categorias.cargando;
  const error = productos.error ?? piezas.error ?? categorias.error;

  // Único filtro "extra" (panel del botón de filtros, WA-H3) hoy — gatea el
  // indicador de filtro activo sobre el ícono cuando el panel está plegado.
  const hayFiltroExtraActivo = mostrarInactivos;

  let contenido;
  if (cargando) {
    contenido = <p className="py-8 text-center text-texto-secundario">Cargando productos…</p>;
  } else if (error !== null) {
    contenido = (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center"
      >
        <p className="text-peligro">No se pudieron cargar los productos.</p>
        <p className="text-sm text-texto-secundario">Revisá tu conexión e intentá de nuevo.</p>
        <Button variante="secundaria" onClick={reintentar}>
          Reintentar
        </Button>
      </div>
    );
  } else if (productos.datos.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">No hay productos todavía.</p>
        {esAdmin && <Button onClick={() => setAltaAbierta(true)}>Agregar producto</Button>}
      </div>
    );
  } else if (productosFiltrados.length === 0) {
    contenido = (
      <div className="rounded-card border border-borde bg-superficie p-8 text-center text-texto-secundario">
        {busqueda.trim() !== ''
          ? `No se encontraron productos para "${busqueda.trim()}".`
          : 'Ningún producto coincide con los filtros aplicados.'}
      </div>
    );
  } else {
    contenido = (
      <ListaProductosAgrupada
        grupos={gruposPorCategoria}
        piezasAgrupadas={piezasAgrupadas}
        onSeleccionar={(producto) => navigate(`/stock/producto/${producto.id}`)}
        atenuarInactivos
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CampoBusqueda
        valor={busqueda}
        onChange={setBusqueda}
        ariaLabel="Buscar producto"
        placeholder="Nombre o categoría"
      />

      {/* Carril de filtros con botón de filtros extra (WA-H3, docs/06-ui-ux.md
          §3): la fila scrolleable lleva SOLO los chips de categoría; a su
          derecha, FIJO y siempre visible, el botón-icono de filtros que
          pliega/despliega el chip "Inactivos" (solo-admin: el vendedor no
          tiene filtros extra, no se le muestra un botón que abre un panel
          vacío). */}
      {(opcionesCategoria.length > 1 || esAdmin) && (
        <div className="flex items-center gap-2">
          {opcionesCategoria.length > 1 && (
            <div className="min-w-0 flex-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ChipsFiltro
                ariaLabel="Filtrar por categoría"
                opciones={opcionesCategoria.map((c) => c.nombre)}
                valor={categoriaFiltro}
                onCambiar={setCategoriaFiltro}
              />
            </div>
          )}
          {esAdmin && (
            <button
              type="button"
              aria-label="Filtros"
              aria-expanded={panelFiltrosAbierto}
              onClick={() => setPanelFiltrosAbierto((v) => !v)}
              className={`relative inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1 focus-visible:ring-offset-superficie ${
                panelFiltrosAbierto
                  ? 'bg-primary-600 text-white'
                  : 'border border-borde bg-superficie text-texto-secundario hover:text-texto'
              }`}
            >
              <IconoFiltros className="h-5 w-5" />
              {hayFiltroExtraActivo && !panelFiltrosAbierto && (
                <span
                  aria-hidden="true"
                  className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-primary-600 ring-2 ring-superficie"
                />
              )}
            </button>
          )}
        </div>
      )}

      {esAdmin && panelFiltrosAbierto && (
        <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip activo={mostrarInactivos} onClick={() => setMostrarInactivos((v) => !v)}>
            Inactivos
          </Chip>
        </div>
      )}

      <FranjaAlertas conteo={conteoAlertas} alertaActiva={alertaActiva} onAlternar={alternarAlerta} />

      {contenido}

      {esAdmin && (
        <ModalProducto
          abierto={altaAbierta}
          producto={null}
          guardando={guardando}
          categorias={categorias.datos}
          onGuardar={handleGuardar}
          onCerrar={() => setAltaAbierta(false)}
        />
      )}
    </div>
  );
}
