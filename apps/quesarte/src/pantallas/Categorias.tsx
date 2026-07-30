import { useMemo, useState } from 'react';
import { collection, orderBy, query } from 'firebase/firestore';
import { Button, Input, useToasts } from '@gestion/ui';
import {
  CategoriaDuplicadaError,
  CategoriaInvalidaError,
  categoriaConverter,
  crearCategoria,
  intercambiarOrdenCategorias,
  productoConverter,
  renombrarCategoria,
  useCollection,
  useOnlineStatus,
} from '@gestion/firebase-kit';
import type { Categoria, Producto } from '@gestion/core';
import { db } from '../firebase';
import { useHeader } from '../componentes/header/ContextoHeader';

const coleccionCategorias = collection(db, 'categorias').withConverter(categoriaConverter);
const coleccionProductos = collection(db, 'productos').withConverter(productoConverter);

/** Edición inline de una fila: id de la categoría y el nombre en borrador. */
interface Edicion {
  id: string;
  nombre: string;
}

/** Nombres distintos de `producto.categoria` (texto libre histórico), sin
 * vacíos, ordenados alfabéticamente (es) — candidatos al seed inicial. Idéntico
 * al helper que tenía `ModalCategorias` (migrado tal cual, UI-4). */
function nombresEnUso(productos: Producto[]): string[] {
  const vistos = new Set<string>();
  for (const p of productos) {
    const limpio = p.categoria.trim();
    if (limpio !== '') vistos.add(limpio);
  }
  return Array.from(vistos).sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Gestión del vocabulario de categorías (solo admin, protegida además por
 * `RutaSoloAdmin` en App.tsx). Sección raíz de Stock (docs/06-ui-ux.md §2,
 * UI-4, 2026-07-10): dejó de ser un modal embebido en `Productos.tsx`
 * (`ModalCategorias`, eliminado en esta tarea) para ser una pantalla más del
 * `SelectorSeccion` — al final, por baja frecuencia de uso.
 *
 * A diferencia de la versión modal (que recibía `categorias`/`productos` por
 * props desde `Productos.tsx`, que ya las necesitaba para su propio select/
 * chips), esta pantalla es la única consumidora de sus datos: arma sus DOS
 * suscripciones (`categorias` para el listado, `productos` solo para
 * calcular los candidatos de seed) — ya no hay padre con quien compartirlas.
 *
 * Todas las mutaciones exigen conexión CONFIRMADA (a diferencia del resto de
 * la app): `crearCategoria`/`renombrarCategoria` ya no leen de Firestore
 * (reciben `categorias`/`productos` por parámetro, ver su JSDoc en
 * `firebase-kit`), pero esos datos vienen de estas mismas suscripciones y
 * pueden estar stale mientras no estén confirmados por el servidor. Por eso
 * el gate no es `enLinea` (que bajo "captive portal" miente: dice `true` sin
 * que pase tráfico) sino `desdeCache` de `useCollection({ seguirFrescura:
 * true })` — la señal honesta de si hay servidor del otro lado. Mismo
 * criterio de fondo que tenía `ModalCategorias` (evitar mutar contra datos
 * potencialmente desactualizados), ajustado a la señal correcta.
 */
export function Categorias() {
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const [nombreNuevo, setNombreNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | undefined>();

  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [errorRenombrar, setErrorRenombrar] = useState<string | undefined>();

  const [reordenando, setReordenando] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Se incrementa en "Reintentar": cambia la identidad de `consultaCategorias`
  // y fuerza a `useCollection` a resuscribirse (mismo patrón que el resto de
  // las pantallas de Stock).
  const [intentoId, setIntentoId] = useState(0);

  // Subvista de Ajustes (UI-5c): ahora sí tiene `volverA` para regresar al tab
  // de Ajustes (flecha ‹ en el header, docs/06-ui-ux.md §2).
  useHeader({ titulo: 'Categorías', volverA: { etiqueta: 'Ajustes', a: '/ajustes' } });

  const consultaCategorias = useMemo(
    () => query(coleccionCategorias, orderBy('orden')),
    [intentoId],
  );
  const {
    datos: categorias,
    cargando,
    error,
    desdeCache: categoriasDesdeCache,
  } = useCollection(consultaCategorias, { seguirFrescura: true });

  // Catálogo completo (sin filtrar por `activo`): además de detectar nombres
  // de categoría "en uso" (texto libre histórico) candidatos al seed inicial,
  // ahora también se le pasa a `crearCategoria`/`renombrarCategoria` (ya no
  // leen de Firestore, ver su JSDoc en firebase-kit) y a su frescura entra en
  // el gate del renombre (el fan-out re-etiqueta productos).
  const consultaProductos = useMemo(() => query(coleccionProductos, orderBy('nombre')), []);
  const { datos: productos, desdeCache: productosDesdeCache } = useCollection(consultaProductos, {
    seguirFrescura: true,
  });

  const candidatosSeed = useMemo(() => nombresEnUso(productos), [productos]);
  const mostrarSeed =
    !cargando && error === null && categorias.length === 0 && candidatosSeed.length > 0;

  // La señal honesta de "hay servidor del otro lado" es si el ÚLTIMO
  // snapshot vino de la caché (`desdeCache`), no `navigator.onLine`: bajo
  // "captive portal" el wifi dice estar conectado (`enLinea` en `true`) pero
  // no pasa tráfico, y un `getDocs`/`setDoc` esperando confirmación se
  // cuelga. `enLinea` puede elegir el TEXTO de un aviso, pero NUNCA es lo
  // único que decide si una mutación está permitida — esa regla ya vale en
  // el resto del repo (ver `proveedores.ts`).
  const puedeEscribir = enLinea && !categoriasDesdeCache;
  // Renombrar, además, re-etiqueta productos (fan-out denormalizado): exige
  // que esa suscripción también esté confirmada por el servidor.
  const puedeRenombrar = puedeEscribir && !productosDesdeCache;

  function reintentar() {
    setIntentoId((n) => n + 1);
  }

  async function handleCrear() {
    const nombreLimpio = nombreNuevo.trim();
    if (nombreLimpio === '') {
      setErrorCrear('Ingresá el nombre de la categoría.');
      return;
    }
    setErrorCrear(undefined);
    setCreando(true);
    try {
      await crearCategoria(db, nombreLimpio, categorias);
      mostrarToast('Categoría creada.', 'exito');
      setNombreNuevo('');
    } catch (err) {
      if (err instanceof CategoriaDuplicadaError || err instanceof CategoriaInvalidaError) {
        setErrorCrear(err.message);
      } else {
        mostrarToast('No se pudo crear la categoría. Intentá de nuevo.', 'error');
      }
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(categoria: Categoria) {
    setEdicion({ id: categoria.id, nombre: categoria.nombre });
    setErrorRenombrar(undefined);
  }

  function cancelarEdicion() {
    setEdicion(null);
    setErrorRenombrar(undefined);
  }

  async function confirmarRenombrar() {
    if (edicion === null) return;
    const nombreLimpio = edicion.nombre.trim();
    if (nombreLimpio === '') {
      setErrorRenombrar('Ingresá el nombre de la categoría.');
      return;
    }
    setErrorRenombrar(undefined);
    setRenombrando(edicion.id);
    try {
      await renombrarCategoria(db, edicion.id, nombreLimpio, categorias, productos);
      mostrarToast('Categoría renombrada.', 'exito');
      setEdicion(null);
    } catch (err) {
      if (err instanceof CategoriaDuplicadaError || err instanceof CategoriaInvalidaError) {
        setErrorRenombrar(err.message);
      } else {
        mostrarToast('No se pudo renombrar la categoría. Intentá de nuevo.', 'error');
      }
    } finally {
      setRenombrando(null);
    }
  }

  async function intercambiar(a: Categoria, b: Categoria) {
    if (!puedeEscribir || reordenando !== null) return;
    setReordenando(a.id);
    try {
      await intercambiarOrdenCategorias(db, a, b);
    } catch {
      mostrarToast('No se pudo reordenar. Intentá de nuevo.', 'error');
    } finally {
      setReordenando(null);
    }
  }

  function subir(indice: number) {
    if (indice <= 0) return;
    void intercambiar(categorias[indice]!, categorias[indice - 1]!);
  }

  function bajar(indice: number) {
    if (indice >= categorias.length - 1) return;
    void intercambiar(categorias[indice]!, categorias[indice + 1]!);
  }

  /**
   * Crea una categoría por cada nombre en uso todavía sin definir, en orden
   * alfabético (queda como `orden` inicial). Secuencial (no `Promise.all`),
   * pero YA NO porque `crearCategoria` releía la colección en cada llamada
   * (eso cambió: ahora recibe `existentes` por parámetro, ver su JSDoc en
   * `firebase-kit`) — sino porque el bucle tiene que ACUMULAR LOCALMENTE lo
   * que va creando. Si en cambio le pasara siempre `categorias` (la lista
   * suscrita, fija durante todo el bucle), las N altas calcularían el MISMO
   * `orden` (`max + 1` sobre una lista que no cambia) y quedarían todas
   * pisadas en la misma posición; y el `CategoriaDuplicadaError` que este
   * bucle usa para tolerar carreras dejaría de dispararse DENTRO de la propia
   * tanda, porque ninguna alta vería a las anteriores. Por eso se arranca de
   * `categorias` y cada categoría creada se agrega a un array local que es lo
   * que se pasa a la vuelta siguiente — leer el estado de React acá no
   * serviría: el closure de este `async function` no ve las actualizaciones
   * de la suscripción a mitad de bucle.
   *
   * Si una entrada ya fue creada por una carrera (doble click, u otra
   * pestaña importando al mismo tiempo) `crearCategoria` tira
   * `CategoriaDuplicadaError` contra la lista acumulada: se ignora esa
   * entrada puntual y se sigue con el resto, en vez de abortar todo el
   * import a mitad de camino.
   */
  async function handleImportar() {
    if (!puedeEscribir || seeding) return;
    setSeeding(true);
    try {
      let acumuladas: readonly Categoria[] = categorias;
      for (const nombre of candidatosSeed) {
        try {
          const orden =
            acumuladas.length === 0 ? 0 : Math.max(...acumuladas.map((c) => c.orden)) + 1;
          const { categoriaId } = await crearCategoria(db, nombre, acumuladas);
          acumuladas = [...acumuladas, { id: categoriaId, nombre, orden }];
        } catch (err) {
          if (!(err instanceof CategoriaDuplicadaError)) throw err;
        }
      }
      mostrarToast('Se cargaron tus categorías existentes.', 'exito');
    } catch {
      mostrarToast('No se pudieron importar todas las categorías. Intentá de nuevo.', 'error');
    } finally {
      setSeeding(false);
    }
  }

  const ocupado = creando || renombrando !== null || reordenando !== null || seeding;

  return (
    <div className="flex flex-col gap-4">
      {/* Cubre TANTO sin conexión (`!enLinea`) COMO "captive portal" (el wifi
          dice estar conectado pero no pasa tráfico: `puedeRenombrar` en
          `false` con `enLinea` en `true`, ver el cálculo arriba) — al dueño
          del comercio no le importa la causa técnica, solo que no puede
          guardar todavía. */}
      {!puedeRenombrar && (
        <p
          role="status"
          className="rounded-elemento border border-borde bg-superficie p-3 text-sm text-advertencia"
        >
          <span aria-hidden="true">⚠</span> No se puede guardar hasta recuperar la conexión.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Input
          label="Nueva categoría"
          value={nombreNuevo}
          onChange={setNombreNuevo}
          error={errorCrear}
          disabled={creando || !puedeEscribir}
          placeholder="Ej: Especias"
        />
        <Button
          variante="secundaria"
          onClick={() => void handleCrear()}
          disabled={creando || !puedeEscribir}
          className="self-end"
        >
          {creando ? 'Creando…' : 'Crear categoría'}
        </Button>
      </div>

      {cargando ? (
        <p className="py-6 text-center text-texto-secundario">Cargando categorías…</p>
      ) : error !== null ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-6 text-center"
        >
          <p className="text-peligro">No se pudieron cargar las categorías.</p>
          <Button variante="secundaria" onClick={reintentar}>
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          {mostrarSeed && (
            <div className="flex flex-col gap-2 rounded-elemento border border-borde bg-superficie p-3 text-sm text-texto">
              <p>
                Hay productos con categorías en uso que todavía no están definidas acá (
                {candidatosSeed.join(', ')}).
              </p>
              <Button
                variante="secundaria"
                onClick={() => void handleImportar()}
                disabled={!puedeEscribir || seeding}
                className="self-start"
              >
                {seeding ? 'Importando…' : 'Importar las categorías en uso'}
              </Button>
            </div>
          )}

          {categorias.length === 0 ? (
            <p className="py-6 text-center text-texto-secundario">
              No hay categorías todavía. Creá la primera arriba.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {categorias.map((categoria, indice) => (
                <li
                  key={categoria.id}
                  className="flex items-center gap-2 rounded-elemento border border-borde bg-superficie p-3"
                >
                  {edicion?.id === categoria.id ? (
                    <div className="flex flex-1 flex-col gap-2">
                      <Input
                        label="Nuevo nombre"
                        value={edicion.nombre}
                        onChange={(valor) => setEdicion({ id: categoria.id, nombre: valor })}
                        error={errorRenombrar}
                        disabled={renombrando === categoria.id}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variante="secundaria"
                          onClick={cancelarEdicion}
                          disabled={renombrando === categoria.id}
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={() => void confirmarRenombrar()}
                          disabled={renombrando === categoria.id}
                        >
                          {renombrando === categoria.id ? 'Guardando…' : 'Guardar'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-texto">{categoria.nombre}</span>
                      <button
                        type="button"
                        aria-label={`Subir ${categoria.nombre}`}
                        onClick={() => subir(indice)}
                        disabled={!puedeEscribir || indice === 0 || reordenando !== null}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-control border border-borde text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Bajar ${categoria.nombre}`}
                        onClick={() => bajar(indice)}
                        disabled={!puedeEscribir || indice === categorias.length - 1 || reordenando !== null}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-control border border-borde text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <Button
                        variante="secundaria"
                        onClick={() => iniciarEdicion(categoria)}
                        disabled={!puedeRenombrar || ocupado}
                      >
                        Renombrar
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
