import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { collection, deleteField, doc, limit, orderBy, query, updateDoc, where, type UpdateData } from 'firebase/firestore';
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
import { Button, useToasts } from '@gestion/ui';
import { db } from '../firebase';
import { DetalleProducto } from '../componentes/stock/DetalleProducto';
import { ModalAjusteNegativo } from '../componentes/stock/ModalAjusteNegativo';
import { ModalIngresarPiezas } from '../componentes/stock/ModalIngresarPiezas';
import { ModalSumarStock } from '../componentes/stock/ModalSumarStock';
import { agruparPiezasPorProducto, calcularResumen } from '../componentes/stock/resumen';
import { useHeader } from '../componentes/header/ContextoHeader';
import { ModalProducto, type DatosEdicionProducto, type DatosProductoFormulario } from './ModalProducto';

type Modal = 'ingreso' | 'sumar' | 'ajuste' | null;

/** `modoStock` que se controla por piezas físicas (con peso propio). */
function esModoStockPorPieza(modoStock: Producto['modoStock']): boolean {
  return modoStock === 'fraccionado_por_pieza' || modoStock === 'pieza_entera';
}

/**
 * Actualiza un producto existente desde el detalle (UI-5b, docs/06-ui-ux.md
 * §2, "el detalle del producto es el hub único"). Sin `precioVentaCents`: el
 * precio se fija en el alta y se cambia SOLO en la sección Precios (costo y
 * margen a la vista ahí) — la ficha de configuración del detalle NUNCA lo
 * escribe, cierra el doble camino de escritura que había entre el modal de
 * catálogo y el de precios. `modoPrecio`/`modoStock` tampoco se tocan: son
 * inmutables tras el alta (ver `ModalProducto`). `umbralAlertaStock` ausente
 * en el formulario borra el campo con `deleteField()` — Firestore no borra
 * campos con `undefined`.
 */
async function actualizarProducto(id: string, datos: DatosEdicionProducto): Promise<void> {
  const ref = doc(db, 'productos', id).withConverter(productoConverter);
  const cambios: UpdateData<Producto> = {
    nombre: datos.nombre,
    categoria: datos.categoria,
    umbralAlertaStock: datos.umbralAlertaStock ?? deleteField(),
    activo: datos.activo,
    actualizadoEn: new Date(),
  };
  await updateDoc(ref, cambios);
}

/**
 * Detalle de UN producto, en su propia ruta (`/stock/producto/:id`, ver
 * App.tsx). Antes vivía como estado interno de `Stock.tsx`; SH-1 lo mudó a
 * ruta real para que el back del sistema funcione siempre
 * (docs/06-ui-ux.md §2). Trae TODOS los productos (activos e inactivos, UI-5b
 * — hallazgo de UI-5a: la lista fusionada ya navega acá para un producto
 * inactivo, así que el detalle tiene que poder encontrarlo, es la única forma
 * de reactivarlo) y piezas disponibles con las MISMAS queries memoizadas que
 * `Productos.tsx` (no una query por producto) y busca el `id` de la URL
 * client-side — mismo criterio de siempre.
 *
 * El título del header ES el nombre del producto y el volver lleva a Stock
 * (`useHeader`); las acciones de escritura A NIVEL STOCK (ingresar piezas /
 * sumar stock / ajuste) también viven en el header — hasta 2, entran justo
 * en el caso granel/unidad (Sumar stock + Ajuste/merma). Es el hub único del
 * producto: además de existencias/piezas/movimientos, muestra su ficha de
 * configuración (categoría, modo, umbral, estado) con edición SOLO-ADMIN EN
 * EL LUGAR (`DetalleProducto`) — el botón "Editar" es INLINE en esa ficha,
 * no en el cluster flotante: el header ya usa sus 2 acciones de stock
 * (docs/06-ui-ux.md §2 limita a 2, y no tendría sentido competir por ese
 * espacio con una acción de baja frecuencia).
 */
export function DetalleProductoPantalla() {
  const { id } = useParams<{ id: string }>();
  const { perfil } = useAuth();
  const esAdmin = perfil?.rol === 'admin';
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const [intento, setIntento] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [piezaParaAjustar, setPiezaParaAjustar] = useState<Pieza | null>(null);
  const [editando, setEditando] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const productosQuery = useMemo(
    () => query(collection(db, 'productos').withConverter(productoConverter), orderBy('nombre')),
    [intento],
  );
  const piezasQuery = useMemo(
    () =>
      query(collection(db, 'piezas').withConverter(piezaConverter), where('estado', '==', 'disponible')),
    [intento],
  );
  // Vocabulario de categorías, solo para el select de `ModalProducto` en
  // edición (mismo criterio que `Productos.tsx`): colección chica, una sola
  // suscripción memoizada, sin cargando/error propios (la gestión completa
  // vive en Ajustes → Categorías).
  const categoriasQuery = useMemo(
    () => query(collection(db, 'categorias').withConverter(categoriaConverter), orderBy('orden')),
    [],
  );

  const productos = useCollection<Producto>(productosQuery);
  const piezas = useCollection<Pieza>(piezasQuery);
  const categorias = useCollection<Categoria>(categoriasQuery);

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
    // altura mínima propia). SOLO las acciones de STOCK (ingresar/sumar/
    // ajustar) viven acá — "Editar" de la ficha de configuración es inline
    // en la propia ficha (ver `DetalleProducto`), no compite por estos 2
    // lugares (docs/06-ui-ux.md §2).
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

  /**
   * Mismo patrón híbrido de escrituras offline del proyecto
   * (docs/06-ui-ux.md §8, ver `Productos.tsx`): en línea espera el ack antes
   * de avisar; sin conexión dispara sin `await`, cierra el modal al toque y
   * avisa que falta sincronizar.
   */
  async function handleGuardarEdicion(datos: DatosProductoFormulario) {
    // Este flujo es edición-only (`producto` siempre no-null acá, ver el
    // `ModalProducto` de abajo): narrowea el tipo — `ModalProducto` nunca
    // emite `'alta'` acá, pero TS no lo sabe por la sola firma de
    // `onGuardar` (compartida con el alta de `Productos.tsx`).
    if (datos.tipo !== 'edicion' || producto === null) return;
    const escritura = actualizarProducto(producto.id, datos);

    if (!enLinea) {
      setEditando(false);
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => mostrarToast('No se pudo sincronizar la edición del producto.', 'error'));
      return;
    }

    setGuardandoEdicion(true);
    try {
      await escritura;
      mostrarToast('Producto actualizado.', 'exito');
      setEditando(false);
    } catch {
      mostrarToast('No se pudo actualizar el producto. Intentá de nuevo.', 'error');
    } finally {
      setGuardandoEdicion(false);
    }
  }

  if (cargando) {
    return <p className="py-8 text-center text-texto-secundario">Cargando producto…</p>;
  }

  if (productos.error !== null || piezas.error !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar el producto. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  }

  if (noEncontrado || producto === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No encontramos ese producto.
        </p>
        <Link
          to="/stock"
          className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
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
        onEditar={() => setEditando(true)}
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
          <ModalProducto
            abierto={editando}
            producto={producto}
            guardando={guardandoEdicion}
            categorias={categorias.datos}
            onGuardar={handleGuardarEdicion}
            onCerrar={() => setEditando(false)}
          />
        </>
      )}
    </div>
  );
}
