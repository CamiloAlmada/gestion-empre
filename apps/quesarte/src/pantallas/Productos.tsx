import { useMemo, useState } from 'react';
import { Link } from 'react-router';
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
import { Button, DataTable, Input, useToasts, type ColumnaDataTable } from '@gestion/ui';
import { productoConverter, useAuth, useCollection, useOnlineStatus } from '@gestion/firebase-kit';
import { formatearMoney, money, peso, type Producto } from '@gestion/core';
import { db } from '../firebase';
import {
  ModalProducto,
  ETIQUETAS_MODO_PRECIO,
  ETIQUETAS_MODO_STOCK,
  type DatosProductoFormulario,
} from './ModalProducto';

type EstadoModal = { tipo: 'cerrado' } | { tipo: 'alta' } | { tipo: 'edicion'; producto: Producto };

const coleccionProductos = collection(db, 'productos').withConverter(productoConverter);

/** Minúsculas y sin diacríticos, para que la búsqueda ignore acentos. */
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function etiquetaModo(producto: Producto): string {
  return `${ETIQUETAS_MODO_PRECIO[producto.modoPrecio]} · ${ETIQUETAS_MODO_STOCK[producto.modoStock]}`;
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
  const [estadoModal, setEstadoModal] = useState<EstadoModal>({ tipo: 'cerrado' });
  const [guardando, setGuardando] = useState(false);
  // Se incrementa en "Reintentar": cambia la identidad de `consultaProductos`
  // y fuerza a `useCollection` a resuscribirse (ver su doc: resuscribe por
  // identidad de `query`, no por contenido).
  const [intentoId, setIntentoId] = useState(0);

  const consultaProductos = useMemo(
    () => query(coleccionProductos, orderBy('nombre')),
    [intentoId],
  );
  const { datos: productos, cargando, error } = useCollection(consultaProductos);

  const productosFiltrados = useMemo(() => {
    const consulta = normalizarTexto(busqueda.trim());
    if (consulta === '') return productos;
    return productos.filter(
      (p) =>
        normalizarTexto(p.nombre).includes(consulta) || normalizarTexto(p.categoria).includes(consulta),
    );
  }, [productos, busqueda]);

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
      render: (p) => `${formatearMoney(p.precioVentaCents)}${p.modoPrecio === 'por_kg' ? ' /kg' : ' /u'}`,
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      render: (p) => (
        <span className="flex items-center gap-2 text-sm text-texto">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${p.activo ? 'bg-exito' : 'bg-texto-secundario'}`}
          />
          {p.activo ? 'Activo' : 'Inactivo'}
        </span>
      ),
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

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/stock"
        className="-mx-2 -my-2 flex min-h-[44px] w-fit items-center rounded px-2 py-2 text-sm text-texto-secundario hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        ‹ Stock
      </Link>

      {!enLinea && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-borde bg-superficie px-4 py-3 text-sm text-advertencia"
        >
          <span aria-hidden="true">⚠</span>
          <span>Estás sin conexión. Los cambios se guardan localmente y se sincronizan al reconectar.</span>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input label="Buscar" value={busqueda} onChange={setBusqueda} placeholder="Nombre o categoría" />
        </div>
        {esAdmin && <Button onClick={abrirAlta}>Agregar producto</Button>}
      </div>

      {cargando ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-texto-secundario">Cargando productos…</p>
        </div>
      ) : error !== null ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-2xl border border-borde bg-superficie p-8 text-center"
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
          onGuardar={handleGuardar}
          onCerrar={cerrarModal}
        />
      )}
    </div>
  );
}
