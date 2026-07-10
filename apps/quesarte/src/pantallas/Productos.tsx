import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteField,
  doc,
  orderBy,
  query,
  updateDoc,
  type UpdateData,
} from 'firebase/firestore';
import { Button, CampoBusqueda, ChipsFiltro, DataTable, normalizarBusqueda, useToasts, type ColumnaDataTable } from '@gestion/ui';
import {
  categoriaConverter,
  productoConverter,
  useAuth,
  useCollection,
  useOnlineStatus,
} from '@gestion/firebase-kit';
import { formatearMoney, money, peso, type Producto } from '@gestion/core';
import { db } from '../firebase';
import {
  ModalProducto,
  ETIQUETAS_MODO_PRECIO,
  ETIQUETAS_MODO_STOCK,
  type DatosProductoFormulario,
} from './ModalProducto';
import { categoriasVisibles } from '../componentes/stock/agrupacion';
import { useHeader } from '../componentes/header/ContextoHeader';

// Acciones compactas del header (docs/06-ui-ux.md §2, hasta 2 por pantalla):
// mismas clases visuales que `Button` de @gestion/ui, pero con `aria-label`
// propio (Button no lo expone) para que "Agregar" pueda mostrarse como ícono
// solo en mobile sin perder un nombre accesible descriptivo. min-h/min-w de
// 48px (no 44): en mobile flotan sobre la tab bar (docs/06 §2 y §5 — targets
// ≥48px ahí).
const CLASE_ACCION_PRIMARIA =
  'inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-control bg-primary-600 px-3 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie';

type EstadoModal = { tipo: 'cerrado' } | { tipo: 'alta' } | { tipo: 'edicion'; producto: Producto };

const coleccionProductos = collection(db, 'productos').withConverter(productoConverter);
const coleccionCategorias = collection(db, 'categorias').withConverter(categoriaConverter);

function etiquetaModo(producto: Producto): string {
  return `${ETIQUETAS_MODO_PRECIO[producto.modoPrecio]} · ${ETIQUETAS_MODO_STOCK[producto.modoStock]}`;
}

function textoPrecio(producto: Producto): string {
  return `${formatearMoney(producto.precioVentaCents)}${producto.modoPrecio === 'por_kg' ? ' /kg' : ' /u'}`;
}

/** Punto de color + texto ("Activo"/"Inactivo"): nada se comunica solo por
 * color (docs/06-ui-ux.md §5). Compartido entre la columna "Estado" de la
 * tabla y la fila compacta. */
function IndicadorEstado({ activo }: { activo: boolean }) {
  return (
    <span className="flex items-center gap-2 text-sm text-texto">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${activo ? 'bg-exito' : 'bg-texto-secundario'}`} />
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

/**
 * Crea un producto nuevo. Campos fijados por regla de negocio
 * (docs/02-dominio-quesarte.md): costo promedio en cero (todavía no hay
 * compras), stock agregado en cero SOLO para `granel`/`unidad_simple` (las
 * piezas de `fraccionado_por_pieza`/`pieza_entera` se cargan aparte, en la
 * pantalla de Stock), y `activo: true`. `id` es un valor ficticio: el
 * converter nunca lo persiste (lo asigna Firestore) — ver producto.test.ts.
 */
async function crearProducto(datos: DatosProductoFormulario): Promise<void> {
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
 * Actualiza un producto existente. `modoPrecio`/`modoStock` son inmutables
 * tras el alta y por eso no forman parte de este update (ver ModalProducto).
 * `umbralAlertaStock` ausente en el formulario borra el campo con
 * `deleteField()` en vez de ignorarlo (Firestore no borra campos con
 * `undefined`).
 */
async function actualizarProducto(id: string, datos: DatosProductoFormulario): Promise<void> {
  const ref = doc(db, 'productos', id).withConverter(productoConverter);
  const cambios: UpdateData<Producto> = {
    nombre: datos.nombre,
    categoria: datos.categoria,
    precioVentaCents: datos.precioVentaCents,
    umbralAlertaStock: datos.umbralAlertaStock ?? deleteField(),
    activo: datos.activo,
    actualizadoEn: new Date(),
  };
  await updateDoc(ref, cambios);
}

/**
 * Catálogo de productos (sección interna del tab Stock, docs/06-ui-ux.md
 * §2). Listado con búsqueda + alta/edición en modal. `vendedor` ve el
 * listado (es catálogo, necesario para el POS) pero sin botones de
 * alta/edición: las reglas de Firestore ya lo bloquean del lado del
 * servidor, esto es además la UI correcta (nunca se muestra deshabilitado,
 * directamente no se ofrece).
 */
export function Productos() {
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();
  const esAdmin = perfil?.rol === 'admin';

  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [estadoModal, setEstadoModal] = useState<EstadoModal>({ tipo: 'cerrado' });
  const [guardando, setGuardando] = useState(false);
  // Se incrementa en "Reintentar": cambia la identidad de `consultaProductos`
  // y fuerza a `useCollection` a resuscribirse (ver su doc: resuscribe por
  // identidad de `query`, no por contenido).
  const [intentoId, setIntentoId] = useState(0);

  useHeader({
    // Título "Catálogo" (docs/06-ui-ux.md §2, 2026-07-10): coincide con el
    // ítem del `SelectorSeccion` del layout compartido (`StockLayout`, UI-4).
    // Ya no declara `volverA` — el selector ES la navegación entre hermanas
    // dentro de Stock; el back del sistema sigue funcionando por history.
    titulo: 'Catálogo',
    acciones: esAdmin ? (
      <button type="button" onClick={abrirAlta} aria-label="Agregar producto" className={CLASE_ACCION_PRIMARIA}>
        <span aria-hidden="true">＋</span>
        <span className="hidden md:inline">Agregar</span>
      </button>
    ) : undefined,
  });

  const consultaProductos = useMemo(
    () => query(coleccionProductos, orderBy('nombre')),
    [intentoId],
  );
  const { datos: productos, cargando, error } = useCollection(consultaProductos);

  // Categorías (una sola suscripción, colección chica): solo alimentan el
  // select de `ModalProducto` y los chips de filtro de abajo. La gestión del
  // vocabulario (alta/renombrar/reordenar) se mudó a su propia pantalla
  // (`Categorias.tsx`, UI-4, docs/06-ui-ux.md §2) con su propia suscripción —
  // ya no hace falta cargando/error/reintentar acá (mismo criterio que
  // `Precios.tsx`).
  const consultaCategorias = useMemo(() => query(coleccionCategorias, orderBy('orden')), []);
  const { datos: categorias } = useCollection(consultaCategorias);

  const productosPorBusqueda = useMemo(() => {
    const consulta = normalizarBusqueda(busqueda.trim());
    if (consulta === '') return productos;
    return productos.filter(
      (p) =>
        normalizarBusqueda(p.nombre).includes(consulta) || normalizarBusqueda(p.categoria).includes(consulta),
    );
  }, [productos, busqueda]);

  // Chips de filtro por categoría (docs/06-ui-ux.md §3, tarea UI-3d): mismo
  // criterio que `GrillaProductos` — se calculan sobre el resultado YA
  // filtrado por texto, para componer como AND, y con auto-reset si la
  // categoría elegida se queda sin chip (p. ej. al tipear una búsqueda que
  // la excluye), para no dejar la tabla en un callejón sin salida.
  const opcionesCategoria = useMemo(
    () => categoriasVisibles(productosPorBusqueda, categorias),
    [productosPorBusqueda, categorias],
  );

  useEffect(() => {
    if (categoriaFiltro === null) return;
    if (!opcionesCategoria.some((c) => c.nombre === categoriaFiltro)) setCategoriaFiltro(null);
  }, [categoriaFiltro, opcionesCategoria]);

  const productosFiltrados = useMemo(() => {
    if (categoriaFiltro === null) return productosPorBusqueda;
    return productosPorBusqueda.filter((p) => p.categoria === categoriaFiltro);
  }, [productosPorBusqueda, categoriaFiltro]);

  function abrirAlta() {
    setEstadoModal({ tipo: 'alta' });
  }

  function abrirEdicion(producto: Producto) {
    setEstadoModal({ tipo: 'edicion', producto });
  }

  function cerrarModal() {
    setEstadoModal({ tipo: 'cerrado' });
  }

  function reintentar() {
    setIntentoId((n) => n + 1);
  }

  /**
   * Patrón estándar del proyecto para escrituras offline-first (el POS va a
   * reusarlo): con conexión, se espera el ack del servidor antes de avisar
   * (éxito/error). Sin conexión, la promesa de Firestore NO resuelve hasta
   * reconectar (persistencia offline habilitada en `initFirebase`) —
   * esperarla dejaría el modal colgado indefinidamente. En ese caso la
   * escritura se dispara SIN `await` (la caché local ya la aplicó al
   * instante y `useCollection` ya la refleja en la lista), se cierra el
   * modal ya mismo y se avisa que falta sincronizar; un `.catch` tardío
   * cubre el caso borde de que el servidor la rechace al reconectar (p.ej.
   * una regla de Firestore).
   */
  async function handleGuardar(datos: DatosProductoFormulario) {
    const enEdicion = estadoModal.tipo === 'edicion';
    const escritura =
      estadoModal.tipo === 'edicion'
        ? actualizarProducto(estadoModal.producto.id, datos)
        : crearProducto(datos);

    if (!enLinea) {
      cerrarModal();
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast(
          enEdicion
            ? 'No se pudo sincronizar la edición del producto.'
            : 'No se pudo sincronizar el producto creado.',
          'error',
        );
      });
      return;
    }

    setGuardando(true);
    try {
      await escritura;
      mostrarToast(enEdicion ? 'Producto actualizado.' : 'Producto creado.', 'exito');
      cerrarModal();
    } catch {
      mostrarToast(
        enEdicion
          ? 'No se pudo actualizar el producto. Intentá de nuevo.'
          : 'No se pudo crear el producto. Intentá de nuevo.',
        'error',
      );
    } finally {
      setGuardando(false);
    }
  }

  const columnas: ColumnaDataTable<Producto>[] = [
    { clave: 'nombre', titulo: 'Nombre', render: (p) => p.nombre },
    { clave: 'categoria', titulo: 'Categoría', render: (p) => p.categoria },
    { clave: 'modo', titulo: 'Modo', render: etiquetaModo },
    {
      clave: 'precio',
      titulo: 'Precio',
      alinear: 'derecha',
      render: textoPrecio,
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      render: (p) => <IndicadorEstado activo={p.activo} />,
    },
  ];
  if (esAdmin) {
    columnas.push({
      clave: 'acciones',
      titulo: 'Acciones',
      alinear: 'derecha',
      render: (p) => (
        <Button variante="secundaria" onClick={() => abrirEdicion(p)}>
          Editar
        </Button>
      ),
    });
  }

  /**
   * Fila compacta para mobile (`< md`, docs/06-ui-ux.md §3): nombre + precio
   * arriba, categoría + estado en el medio, modo abajo. Para `esAdmin`, toda
   * la fila es tappable y dispara el mismo handler que "Editar" en desktop
   * (`abrirEdicion`); para `vendedor` (sin permiso de edición, igual que en
   * la tabla) es una fila estática.
   */
  function filaCompactaProducto(p: Producto) {
    const contenido = (
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-texto">{p.nombre}</span>
          <span className="tabular-nums font-semibold text-texto">{textoPrecio(p)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-texto-secundario">{p.categoria}</span>
          <IndicadorEstado activo={p.activo} />
        </div>
        <p className="text-sm text-texto-secundario">{etiquetaModo(p)}</p>
      </div>
    );

    if (!esAdmin) {
      return <div className="flex min-h-[56px] flex-col justify-center gap-1 p-4">{contenido}</div>;
    }

    return (
      <button
        type="button"
        onClick={() => abrirEdicion(p)}
        aria-label={`Editar ${p.nombre}`}
        className="flex min-h-[56px] w-full items-center gap-2 p-4 text-left transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        {contenido}
        <span aria-hidden="true" className="text-texto-secundario">
          ›
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full max-w-xs">
        <CampoBusqueda
          valor={busqueda}
          onChange={setBusqueda}
          ariaLabel="Buscar producto"
          placeholder="Nombre o categoría"
        />
      </div>

      {opcionesCategoria.length > 1 && (
        <ChipsFiltro
          ariaLabel="Filtrar por categoría"
          opciones={opcionesCategoria.map((c) => c.nombre)}
          valor={categoriaFiltro}
          onCambiar={setCategoriaFiltro}
        />
      )}

      {cargando ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-texto-secundario">Cargando productos…</p>
        </div>
      ) : error !== null ? (
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
      ) : (
        <DataTable
          columnas={columnas}
          filas={productosFiltrados}
          claveFila={(p) => p.id}
          etiqueta="Productos"
          filaCompacta={filaCompactaProducto}
          vacio={
            productos.length === 0 ? (
              <div className="flex flex-col items-center gap-3">
                <p>No hay productos todavía.</p>
                {esAdmin && <Button onClick={abrirAlta}>Agregar producto</Button>}
              </div>
            ) : (
              `No se encontraron productos para "${busqueda.trim()}".`
            )
          }
        />
      )}

      {esAdmin && (
        <ModalProducto
          abierto={estadoModal.tipo !== 'cerrado'}
          producto={estadoModal.tipo === 'edicion' ? estadoModal.producto : null}
          guardando={guardando}
          categorias={categorias}
          onGuardar={handleGuardar}
          onCerrar={cerrarModal}
        />
      )}
    </div>
  );
}
