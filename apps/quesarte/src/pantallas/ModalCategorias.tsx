import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, useToasts } from '@gestion/ui';
import {
  CategoriaDuplicadaError,
  CategoriaInvalidaError,
  crearCategoria,
  intercambiarOrdenCategorias,
  renombrarCategoria,
  useOnlineStatus,
} from '@gestion/firebase-kit';
import type { Categoria, Producto } from '@gestion/core';
import { db } from '../firebase';

export interface ModalCategoriasProps {
  abierto: boolean;
  /** Vocabulario vigente, YA ordenado por `orden` (lo arma `Productos.tsx`
   * con la misma query que alimenta el select de `ModalProducto`: una sola
   * suscripción compartida en vez de dos). */
  categorias: Categoria[];
  cargando: boolean;
  /** Solo se usa como `error !== null` (nunca se leen sus campos): tipado
   * ancho a propósito para no acoplar este componente al tipo de error
   * concreto de `useCollection` (`FirestoreError`), que arma `Productos.tsx`. */
  error: unknown;
  /** Catálogo completo, solo para detectar nombres de categoría "en uso"
   * (texto libre histórico) candidatos al seed inicial. */
  productos: Producto[];
  onReintentar: () => void;
  onCerrar: () => void;
}

/** Edición inline de una fila: id de la categoría y el nombre en borrador. */
interface Edicion {
  id: string;
  nombre: string;
}

/** Nombres distintos de `producto.categoria` (texto libre histórico), sin
 * vacíos, ordenados alfabéticamente (es) — candidatos al seed inicial. */
function nombresEnUso(productos: Producto[]): string[] {
  const vistos = new Set<string>();
  for (const p of productos) {
    const limpio = p.categoria.trim();
    if (limpio !== '') vistos.add(limpio);
  }
  return Array.from(vistos).sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Gestión del vocabulario de categorías (solo admin), embebida como modal
 * dentro de `Productos.tsx` — no como pantalla con ruta propia como
 * `Usuarios.tsx`: el vocabulario es chico (un puñado de entradas) y edición
 * puntual, no amerita una sección de navegación propia (docs/06-ui-ux.md §2
 * ya reserva rutas solo para Stock/Historial/Venta/Reportes/Ajustes).
 *
 * Arquitectura híbrida deliberada: la LECTURA (`categorias`/`cargando`/
 * `error`) llega por props desde `Productos.tsx` (que ya la necesita para el
 * select de `ModalProducto`, evita una segunda suscripción en vivo a la
 * misma colección chica); la ESCRITURA la hace este componente directo
 * (`crearCategoria`/`renombrarCategoria`/`intercambiarOrdenCategorias`),
 * mismo criterio que `Usuarios.tsx` (pantalla de gestión solo-admin que
 * llama Firestore ella misma) en vez de burbujear cinco estados de
 * ocupado/error distintos hasta el padre como hace `ModalProducto`.
 *
 * Todas las mutaciones exigen conexión (a diferencia del resto de la app):
 * leen antes de escribir (chequeo de duplicados, orden a incrementar,
 * producto anterior a renombrar) y esa lectura previa no es confiable
 * offline — no se ofrece un camino "sin conexión" para estas escrituras,
 * mismo criterio que la invitación de usuarios (`ModalInvitarUsuario`).
 */
export function ModalCategorias({
  abierto,
  categorias,
  cargando,
  error,
  productos,
  onReintentar,
  onCerrar,
}: ModalCategoriasProps) {
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

  // Resetea los borradores locales cada vez que el modal se abre: si quedó
  // una edición a mitad de camino de una apertura anterior, no debe
  // reaparecer (mismo criterio que `ModalProducto`/`ModalInvitarUsuario`).
  useEffect(() => {
    if (!abierto) return;
    setNombreNuevo('');
    setErrorCrear(undefined);
    setEdicion(null);
    setErrorRenombrar(undefined);
  }, [abierto]);

  const candidatosSeed = useMemo(() => nombresEnUso(productos), [productos]);
  const mostrarSeed =
    !cargando && error === null && categorias.length === 0 && candidatosSeed.length > 0;

  async function handleCrear() {
    const nombreLimpio = nombreNuevo.trim();
    if (nombreLimpio === '') {
      setErrorCrear('Ingresá el nombre de la categoría.');
      return;
    }
    setErrorCrear(undefined);
    setCreando(true);
    try {
      await crearCategoria(db, nombreLimpio);
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
      await renombrarCategoria(db, edicion.id, nombreLimpio);
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
    if (!enLinea || reordenando !== null) return;
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
   * alfabético (queda como `orden` inicial). Secuencial (no `Promise.all`):
   * `crearCategoria` calcula `orden = max(orden) + 1` leyendo la colección en
   * cada llamada, así que dos altas en paralelo pisarían el mismo `orden`.
   * Si una entrada ya fue creada por una carrera (doble click, u otra
   * pestaña importando al mismo tiempo) `crearCategoria` tira
   * `CategoriaDuplicadaError`: se ignora esa entrada puntual y se sigue con
   * el resto, en vez de abortar todo el import a mitad de camino.
   */
  async function handleImportar() {
    if (!enLinea || seeding) return;
    setSeeding(true);
    try {
      for (const nombre of candidatosSeed) {
        try {
          await crearCategoria(db, nombre);
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
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Categorías"
      acciones={<Button onClick={onCerrar}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-4">
        {!enLinea && (
          <p
            role="status"
            className="rounded-xl border border-borde bg-superficie p-3 text-sm text-advertencia"
          >
            <span aria-hidden="true">⚠</span> Necesitás conexión para gestionar categorías.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Input
            label="Nueva categoría"
            value={nombreNuevo}
            onChange={setNombreNuevo}
            error={errorCrear}
            disabled={creando || !enLinea}
            placeholder="Ej: Especias"
          />
          <Button
            variante="secundaria"
            onClick={() => void handleCrear()}
            disabled={creando || !enLinea}
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
            className="flex flex-col items-center gap-3 rounded-2xl border border-borde p-6 text-center"
          >
            <p className="text-peligro">No se pudieron cargar las categorías.</p>
            <Button variante="secundaria" onClick={onReintentar}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            {mostrarSeed && (
              <div className="flex flex-col gap-2 rounded-xl border border-borde bg-fondo p-3 text-sm text-texto">
                <p>
                  Hay productos con categorías en uso que todavía no están definidas acá (
                  {candidatosSeed.join(', ')}).
                </p>
                <Button
                  variante="secundaria"
                  onClick={() => void handleImportar()}
                  disabled={!enLinea || seeding}
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
                    className="flex items-center gap-2 rounded-xl border border-borde p-3"
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
                          disabled={!enLinea || indice === 0 || reordenando !== null}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-borde text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Bajar ${categoria.nombre}`}
                          onClick={() => bajar(indice)}
                          disabled={!enLinea || indice === categorias.length - 1 || reordenando !== null}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-borde text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <Button
                          variante="secundaria"
                          onClick={() => iniciarEdicion(categoria)}
                          disabled={!enLinea || ocupado}
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
    </Modal>
  );
}
