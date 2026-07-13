import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  type UpdateData,
  type WriteBatch,
} from 'firebase/firestore';
import {
  Button,
  CampoBusqueda,
  Chip,
  ChipsFiltro,
  DataTable,
  Modal,
  normalizarBusqueda,
  useToasts,
  type ColumnaDataTable,
} from '@gestion/ui';
import { categoriaConverter, productoConverter, useCollection, useOnlineStatus } from '@gestion/firebase-kit';
import { formatearMoney, type Money, type Producto } from '@gestion/core';
import { db } from '../firebase';
import { BadgeStock } from '../componentes/stock/BadgeStock';
import { categoriasVisibles } from '../componentes/stock/agrupacion';
import {
  elegibleParaMargenMasivo,
  estaBajoObjetivo,
  margenActualBps,
  precioSugeridoConMargen,
  precioSugeridoDe,
  razonExclusionMasivo,
  unidadCosto,
} from '../componentes/stock/margenes';
import { formatearBps } from '../componentes/stock/CampoPorcentaje';
import { useHeader } from '../componentes/header/ContextoHeader';
import { ModalPrecio, type DatosPrecioFormulario } from './ModalPrecio';
import { ModalMargenMasivo } from './ModalMargenMasivo';

const coleccionProductos = collection(db, 'productos').withConverter(productoConverter);
const coleccionCategorias = collection(db, 'categorias').withConverter(categoriaConverter);

function textoPrecio(producto: Producto): string {
  return `${formatearMoney(producto.precioVentaCents)}${producto.modoPrecio === 'por_kg' ? ' /kg' : ' /u'}`;
}

/** La unidad del costo la determina el `modoStock` (`unidadCosto`), NUNCA el
 * `modoPrecio` de venta — hallazgo M2 del review de Fase 2 (ver JSDoc de
 * `unidadCosto` en `margenes.ts`). */
function textoCosto(producto: Producto): string {
  if (producto.costoPromedioCents <= 0) return '—';
  return `${formatearMoney(producto.costoPromedioCents)}${unidadCosto(producto) === 'kg' ? ' /kg' : ' /u'}`;
}

function textoMargenActual(producto: Producto): string {
  const bps = margenActualBps(producto);
  return bps === null ? '—' : formatearBps(bps);
}

function textoMargenObjetivo(producto: Producto): string {
  return producto.margenObjetivoBps === undefined ? '—' : formatearBps(producto.margenObjetivoBps);
}

/** Actualiza precio y margen objetivo de un producto. `margenObjetivoBps`
 * ausente en el formulario borra el campo con `deleteField()` — no lo
 * ignora (Firestore no borra campos con `undefined`), mismo criterio que
 * `umbralAlertaStock` en `Productos.tsx`. */
async function actualizarPrecioProducto(id: string, datos: DatosPrecioFormulario): Promise<void> {
  const ref = doc(db, 'productos', id).withConverter(productoConverter);
  const cambios: UpdateData<Producto> = {
    precioVentaCents: datos.precioVentaCents,
    margenObjetivoBps: datos.margenObjetivoBps ?? deleteField(),
    actualizadoEn: new Date(),
  };
  await updateDoc(ref, cambios);
}

/** Un candidato de "Aplicar sugeridos": el producto bajo objetivo visible y
 * su precio sugerido ya calculado (nunca `null` acá — se filtra antes). */
interface CandidatoMasivo {
  producto: Producto;
  sugeridoCents: Money;
}

/** Aplica el precio sugerido a varios productos en un único `writeBatch`
 * atómico (patrón del proyecto, ver `categorias.ts`: mutaciones
 * multi-documento van en batch, nunca `runTransaction`). Solo toca
 * `precioVentaCents`: el margen objetivo de cada producto no cambia, sigue
 * siendo la referencia contra la que se va a comparar el margen actual la
 * próxima vez. */
async function aplicarPreciosSugeridos(candidatos: CandidatoMasivo[]): Promise<void> {
  const batch = writeBatch(db);
  const ahora = new Date();
  for (const { producto, sugeridoCents } of candidatos) {
    const ref = doc(db, 'productos', producto.id).withConverter(productoConverter);
    const cambios: UpdateData<Producto> = { precioVentaCents: sugeridoCents, actualizadoEn: ahora };
    batch.update(ref, cambios);
  }
  await batch.commit();
}

/** Un `writeBatch` de Firestore admite hasta 500 escrituras (límite duro del
 * SDK) — 400 deja margen sin acercarse al techo. Hoy "Margen para los
 * filtrados" opera sobre ~7 productos (catálogo real de la quesería), pero
 * el límite queda resuelto de una vez en vez de latente (WA-H). Cada lote es
 * su PROPIO batch atómico: con más de 400 elegibles, la operación completa
 * ya no es un único átomo (un lote puede fallar sin deshacer los anteriores)
 * — aceptable acá porque cada escritura es independiente por producto (no
 * hay invariante cruzado entre productos distintos, a diferencia de una
 * venta o una compra). */
export const TAMANIO_LOTE_MASIVO = 400;

/** Exportada (solo esta y `TAMANIO_LOTE_MASIVO`) para poder testear el
 * chunking en aislamiento: renderizar 400+ filas reales en `DataTable` para
 * probar este invariante hace al test lento e inestable bajo carga (CI con
 * corridas en paralelo) sin aportar nada que un test directo de esta función
 * no cubra igual. Ver Precios.test.tsx. */
export async function commitEnLotes<T>(items: T[], aplicar: (batch: WriteBatch, item: T) => void): Promise<void> {
  for (let inicio = 0; inicio < items.length; inicio += TAMANIO_LOTE_MASIVO) {
    const lote = items.slice(inicio, inicio + TAMANIO_LOTE_MASIVO);
    const batch = writeBatch(db);
    for (const item of lote) aplicar(batch, item);
    await batch.commit();
  }
}

/** "Fijar objetivo" de "Margen para los filtrados" (WA-H, doc 03): escribe
 * el mismo `margenObjetivoBps` en todos los productos elegibles filtrados.
 * No toca `precioVentaCents` — los sugeridos se recalculan solos (mismo
 * `margenActualBps`/`precioSugeridoDe` que ya usa la tabla) y el dueño los
 * revisa 1 a 1 o con "Aplicar sugeridos". */
async function fijarMargenObjetivoMasivo(productos: Producto[], margenBps: number): Promise<void> {
  const ahora = new Date();
  await commitEnLotes(productos, (batch, producto) => {
    const ref = doc(db, 'productos', producto.id).withConverter(productoConverter);
    const cambios: UpdateData<Producto> = { margenObjetivoBps: margenBps, actualizadoEn: ahora };
    batch.update(ref, cambios);
  });
}

/** "Fijar y aplicar precios" de "Margen para los filtrados" (WA-H, doc 03):
 * mismo batch que `fijarMargenObjetivoMasivo`, pero además escribe
 * `precioVentaCents` con el precio sugerido para ESE margen nuevo (ya
 * calculado por el llamador con `precioSugeridoConMargen`). */
async function fijarYAplicarMargenMasivo(candidatos: CandidatoMasivo[], margenBps: number): Promise<void> {
  const ahora = new Date();
  await commitEnLotes(candidatos, (batch, { producto, sugeridoCents }) => {
    const ref = doc(db, 'productos', producto.id).withConverter(productoConverter);
    const cambios: UpdateData<Producto> = {
      margenObjetivoBps: margenBps,
      precioVentaCents: sugeridoCents,
      actualizadoEn: ahora,
    };
    batch.update(ref, cambios);
  });
}

/**
 * Pantalla "Precios y márgenes" (docs/03-compras-costos-precios.md), sección
 * Stock, solo admin (`RutaSoloAdmin`, doc 06 §2). Tabla de productos con
 * costo, precio, margen actual y margen objetivo; edición individual en
 * `ModalPrecio` (precio ↔ margen objetivo bidireccional) y aplicación masiva
 * de precios sugeridos para los productos bajo objetivo visibles.
 *
 * Decisión de UX (edición): modal, no fila expandible ni subvista — mismo
 * patrón que `Productos.tsx`/`ModalProducto` (la pantalla ya es una tabla de
 * gestión análoga, y el modal reusa `Modal` con focus trap/Escape ya
 * resueltos, sin inventar una variante de fila expandible solo para esto).
 */
export function Precios() {
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [soloBajoObjetivo, setSoloBajoObjetivo] = useState(false);
  const [productoEnEdicion, setProductoEnEdicion] = useState<Producto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoMasivo, setConfirmandoMasivo] = useState(false);
  const [aplicandoMasivo, setAplicandoMasivo] = useState(false);
  // "Margen para los filtrados" (WA-H): modal de porcentaje + confirmación
  // separada para "Fijar y aplicar precios" (mismo criterio que
  // confirmandoMasivo/aplicandoMasivo de "Aplicar sugeridos" — dos pasos
  // porque esa acción cambia precios en masa).
  const [modalMargenMasivoAbierto, setModalMargenMasivoAbierto] = useState(false);
  const [guardandoMargenMasivo, setGuardandoMargenMasivo] = useState(false);
  const [confirmandoAplicarMargenMasivo, setConfirmandoAplicarMargenMasivo] = useState<{
    margenBps: number;
    candidatos: CandidatoMasivo[];
  } | null>(null);
  const [aplicandoMargenMasivo, setAplicandoMargenMasivo] = useState(false);
  // Se incrementa en "Reintentar": cambia la identidad de la query y fuerza
  // a `useCollection` a resuscribirse (mismo patrón que Productos.tsx).
  const [intentoId, setIntentoId] = useState(0);

  useHeader({ titulo: 'Precios' });

  const consultaProductos = useMemo(() => query(coleccionProductos, orderBy('nombre')), [intentoId]);
  const { datos: productos, cargando, error } = useCollection(consultaProductos);

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

  const opcionesCategoria = useMemo(
    () => categoriasVisibles(productosPorBusqueda, categorias),
    [productosPorBusqueda, categorias],
  );

  useEffect(() => {
    if (categoriaFiltro === null) return;
    if (!opcionesCategoria.some((c) => c.nombre === categoriaFiltro)) setCategoriaFiltro(null);
  }, [categoriaFiltro, opcionesCategoria]);

  const productosPorCategoria = useMemo(() => {
    if (categoriaFiltro === null) return productosPorBusqueda;
    return productosPorBusqueda.filter((p) => p.categoria === categoriaFiltro);
  }, [productosPorBusqueda, categoriaFiltro]);

  const productosFiltrados = useMemo(() => {
    if (!soloBajoObjetivo) return productosPorCategoria;
    return productosPorCategoria.filter(estaBajoObjetivo);
  }, [productosPorCategoria, soloBajoObjetivo]);

  // "Aplicar sugeridos" opera sobre los productos VISIBLES (post búsqueda +
  // categoría + el propio toggle "Solo bajo objetivo") que además tengan un
  // precio sugerido calculable (costo y margen objetivo cargados, doc 03).
  const candidatosMasivo: CandidatoMasivo[] = useMemo(
    () =>
      productosFiltrados.flatMap((producto) => {
        if (!estaBajoObjetivo(producto)) return [];
        const sugeridoCents = precioSugeridoDe(producto);
        return sugeridoCents === null ? [] : [{ producto, sugeridoCents }];
      }),
    [productosFiltrados],
  );

  // "Margen para los filtrados" (WA-H) opera sobre los MISMOS productos
  // VISIBLES que "Aplicar sugeridos" (búsqueda + categoría + "solo bajo
  // objetivo"), elegibles = con costo y margen comparable (no requiere que
  // ya tengan `margenObjetivoBps`: esta acción lo está fijando).
  const elegiblesMargenMasivo = useMemo(
    () => productosFiltrados.filter(elegibleParaMargenMasivo),
    [productosFiltrados],
  );
  const excluidosSinCostoMargenMasivo = useMemo(
    () => productosFiltrados.filter((p) => razonExclusionMasivo(p) === 'sin_costo').length,
    [productosFiltrados],
  );
  const excluidosNoComparableMargenMasivo = useMemo(
    () => productosFiltrados.filter((p) => razonExclusionMasivo(p) === 'margen_no_comparable').length,
    [productosFiltrados],
  );

  function abrirEdicion(producto: Producto) {
    setProductoEnEdicion(producto);
  }

  function cerrarEdicion() {
    setProductoEnEdicion(null);
  }

  function reintentar() {
    setIntentoId((n) => n + 1);
  }

  /** Mismo patrón híbrido offline-first del proyecto (docs/06-ui-ux.md §8,
   * ver `Productos.tsx`): con conexión se espera el ack antes de avisar; sin
   * conexión se dispara sin `await`, se cierra el modal ya mismo y se avisa
   * que falta sincronizar. */
  async function handleGuardarPrecio(datos: DatosPrecioFormulario) {
    if (productoEnEdicion === null) return;
    const escritura = actualizarPrecioProducto(productoEnEdicion.id, datos);

    if (!enLinea) {
      cerrarEdicion();
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => mostrarToast('No se pudo sincronizar el precio.', 'error'));
      return;
    }

    setGuardando(true);
    try {
      await escritura;
      mostrarToast('Precio actualizado.', 'exito');
      cerrarEdicion();
    } catch {
      mostrarToast('No se pudo actualizar el precio. Intentá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function handleConfirmarMasivo() {
    if (candidatosMasivo.length === 0) return;
    const cantidad = candidatosMasivo.length;
    const escritura = aplicarPreciosSugeridos(candidatosMasivo);

    if (!enLinea) {
      setConfirmandoMasivo(false);
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => mostrarToast('No se pudieron sincronizar los precios sugeridos.', 'error'));
      return;
    }

    setAplicandoMasivo(true);
    try {
      await escritura;
      mostrarToast(
        cantidad === 1 ? 'Se actualizó el precio de 1 producto.' : `Se actualizaron los precios de ${cantidad} productos.`,
        'exito',
      );
      setConfirmandoMasivo(false);
    } catch {
      mostrarToast('No se pudieron aplicar los precios sugeridos. Intentá de nuevo.', 'error');
    } finally {
      setAplicandoMasivo(false);
    }
  }

  /** "Fijar objetivo" de "Margen para los filtrados" (WA-H): no toca precios
   * (mismo riesgo que editar el margen objetivo a mano desde `ModalPrecio`),
   * se ejecuta al toque con el mismo patrón offline-first híbrido del resto
   * de la pantalla. */
  async function handleFijarObjetivoMasivo(margenBps: number) {
    const productos = elegiblesMargenMasivo;
    if (productos.length === 0) return;
    const cantidad = productos.length;
    const escritura = fijarMargenObjetivoMasivo(productos, margenBps);

    if (!enLinea) {
      setModalMargenMasivoAbierto(false);
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => mostrarToast('No se pudo sincronizar el margen objetivo.', 'error'));
      return;
    }

    setGuardandoMargenMasivo(true);
    try {
      await escritura;
      mostrarToast(
        cantidad === 1
          ? 'Se fijó el margen objetivo de 1 producto.'
          : `Se fijó el margen objetivo de ${cantidad} productos.`,
        'exito',
      );
      setModalMargenMasivoAbierto(false);
    } catch {
      mostrarToast('No se pudo fijar el margen objetivo. Intentá de nuevo.', 'error');
    } finally {
      setGuardandoMargenMasivo(false);
    }
  }

  /** "Fijar y aplicar precios" de "Margen para los filtrados" (WA-H): cambia
   * precios en masa, así que NO escribe nada todavía — calcula los
   * candidatos con el precio sugerido para el margen tipeado, cierra el
   * modal de porcentaje y abre la confirmación explícita (mismo patrón que
   * "Aplicar sugeridos": lista actual → sugerido antes de tocar un precio). */
  function handleIniciarFijarYAplicarMargenMasivo(margenBps: number) {
    const candidatos: CandidatoMasivo[] = elegiblesMargenMasivo.flatMap((producto) => {
      const sugeridoCents = precioSugeridoConMargen(producto, margenBps);
      return sugeridoCents === null ? [] : [{ producto, sugeridoCents }];
    });
    if (candidatos.length === 0) return;
    setModalMargenMasivoAbierto(false);
    setConfirmandoAplicarMargenMasivo({ margenBps, candidatos });
  }

  async function handleConfirmarAplicarMargenMasivo() {
    if (confirmandoAplicarMargenMasivo === null) return;
    const { margenBps, candidatos } = confirmandoAplicarMargenMasivo;
    const cantidad = candidatos.length;
    const escritura = fijarYAplicarMargenMasivo(candidatos, margenBps);

    if (!enLinea) {
      setConfirmandoAplicarMargenMasivo(null);
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => mostrarToast('No se pudieron sincronizar el margen y los precios.', 'error'));
      return;
    }

    setAplicandoMargenMasivo(true);
    try {
      await escritura;
      mostrarToast(
        cantidad === 1
          ? 'Se actualizó el margen y el precio de 1 producto.'
          : `Se actualizaron el margen y el precio de ${cantidad} productos.`,
        'exito',
      );
      setConfirmandoAplicarMargenMasivo(null);
    } catch {
      mostrarToast('No se pudieron aplicar el margen y los precios. Intentá de nuevo.', 'error');
    } finally {
      setAplicandoMargenMasivo(false);
    }
  }

  const columnas: ColumnaDataTable<Producto>[] = [
    {
      clave: 'nombre',
      titulo: 'Producto',
      render: (p) => (
        <div className="flex flex-col items-start gap-1">
          <span className="font-medium text-texto">{p.nombre}</span>
          {estaBajoObjetivo(p) && <BadgeStock variante="advertencia">Bajo objetivo</BadgeStock>}
        </div>
      ),
    },
    { clave: 'costo', titulo: 'Costo', alinear: 'derecha', render: textoCosto },
    { clave: 'precio', titulo: 'Precio', alinear: 'derecha', render: textoPrecio },
    { clave: 'margenActual', titulo: 'Margen actual', alinear: 'derecha', render: textoMargenActual },
    { clave: 'margenObjetivo', titulo: 'Margen objetivo', alinear: 'derecha', render: textoMargenObjetivo },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alinear: 'derecha',
      render: (p) => (
        <Button variante="secundaria" onClick={() => abrirEdicion(p)}>
          Editar
        </Button>
      ),
    },
  ];

  function filaCompactaPrecio(p: Producto) {
    return (
      <button
        type="button"
        onClick={() => abrirEdicion(p)}
        aria-label={`Editar precio de ${p.nombre}`}
        className="flex min-h-[56px] w-full items-center gap-2 p-4 text-left transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-texto">{p.nombre}</span>
            <span className="tabular-nums font-semibold text-texto">{textoPrecio(p)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-texto-secundario">Costo: {textoCosto(p)}</span>
            <span className="tabular-nums text-sm text-texto-secundario">Margen: {textoMargenActual(p)}</span>
          </div>
          {estaBajoObjetivo(p) && <BadgeStock variante="advertencia">Bajo objetivo</BadgeStock>}
        </div>
        <span aria-hidden="true" className="text-texto-secundario">
          ›
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!enLinea && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-elemento border border-borde bg-superficie px-4 py-3 text-sm text-advertencia"
        >
          <span aria-hidden="true">⚠</span>
          <span>Sin conexión: los cambios se sincronizarán al reconectar.</span>
        </div>
      )}

      <CampoBusqueda
        valor={busqueda}
        onChange={setBusqueda}
        ariaLabel="Buscar producto"
        placeholder="Nombre o categoría"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chip activo={soloBajoObjetivo} onClick={() => setSoloBajoObjetivo((v) => !v)}>
          Solo bajo objetivo
        </Chip>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variante="secundaria"
            disabled={elegiblesMargenMasivo.length === 0}
            onClick={() => setModalMargenMasivoAbierto(true)}
          >
            Margen para los filtrados ({elegiblesMargenMasivo.length})
          </Button>
          <Button
            variante="secundaria"
            disabled={candidatosMasivo.length === 0}
            onClick={() => setConfirmandoMasivo(true)}
          >
            Aplicar sugeridos ({candidatosMasivo.length})
          </Button>
        </div>
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
          etiqueta="Precios y márgenes"
          filaCompacta={filaCompactaPrecio}
          vacio={
            productos.length === 0
              ? 'No hay productos todavía. Cargalos desde Catálogo.'
              : soloBajoObjetivo
                ? 'Ningún producto visible está bajo su margen objetivo.'
                : `No se encontraron productos para "${busqueda.trim()}".`
          }
        />
      )}

      <ModalPrecio
        abierto={productoEnEdicion !== null}
        producto={productoEnEdicion}
        guardando={guardando}
        onGuardar={handleGuardarPrecio}
        onCerrar={cerrarEdicion}
      />

      <Modal
        abierto={confirmandoMasivo}
        onCerrar={() => setConfirmandoMasivo(false)}
        titulo="Aplicar precios sugeridos"
        acciones={
          <>
            <Button variante="secundaria" onClick={() => setConfirmandoMasivo(false)} disabled={aplicandoMasivo}>
              Cancelar
            </Button>
            <Button onClick={() => void handleConfirmarMasivo()} disabled={aplicandoMasivo}>
              {aplicandoMasivo ? 'Aplicando…' : `Aplicar a ${candidatosMasivo.length} producto(s)`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-texto-secundario">
            Se va a actualizar el precio de venta real de estos productos. Esta acción no se puede deshacer.
          </p>
          <ul className="flex flex-col gap-1 text-sm text-texto">
            {candidatosMasivo.map(({ producto, sugeridoCents }) => (
              <li key={producto.id} className="flex items-center justify-between gap-2">
                <span>{producto.nombre}</span>
                <span className="tabular-nums text-texto-secundario">
                  {formatearMoney(producto.precioVentaCents)} → {formatearMoney(sugeridoCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <ModalMargenMasivo
        abierto={modalMargenMasivoAbierto}
        cantidadElegibles={elegiblesMargenMasivo.length}
        cantidadSinCosto={excluidosSinCostoMargenMasivo}
        cantidadNoComparable={excluidosNoComparableMargenMasivo}
        guardando={guardandoMargenMasivo}
        onCerrar={() => setModalMargenMasivoAbierto(false)}
        onFijarObjetivo={(bps) => void handleFijarObjetivoMasivo(bps)}
        onFijarYAplicar={handleIniciarFijarYAplicarMargenMasivo}
      />

      <Modal
        abierto={confirmandoAplicarMargenMasivo !== null}
        onCerrar={() => setConfirmandoAplicarMargenMasivo(null)}
        titulo="Fijar y aplicar margen a los filtrados"
        acciones={
          <>
            <Button
              variante="secundaria"
              onClick={() => setConfirmandoAplicarMargenMasivo(null)}
              disabled={aplicandoMargenMasivo}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleConfirmarAplicarMargenMasivo()} disabled={aplicandoMargenMasivo}>
              {aplicandoMargenMasivo
                ? 'Aplicando…'
                : `Aplicar a ${confirmandoAplicarMargenMasivo?.candidatos.length ?? 0} producto(s)`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-texto-secundario">
            Se va a fijar el margen objetivo en{' '}
            <span className="font-medium text-texto">
              {confirmandoAplicarMargenMasivo !== null ? formatearBps(confirmandoAplicarMargenMasivo.margenBps) : ''}
            </span>{' '}
            y actualizar el precio de venta de estos productos. Esta acción no se puede deshacer.
          </p>
          <ul className="flex flex-col gap-1 text-sm text-texto">
            {confirmandoAplicarMargenMasivo?.candidatos.map(({ producto, sugeridoCents }) => (
              <li key={producto.id} className="flex items-center justify-between gap-2">
                <span>{producto.nombre}</span>
                <span className="tabular-nums text-texto-secundario">
                  {formatearMoney(producto.precioVentaCents)} → {formatearMoney(sugeridoCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
