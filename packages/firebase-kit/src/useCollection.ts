import { useEffect, useState } from 'react';
import {
  onSnapshot,
  type FirestoreError,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';

/** Estado expuesto por `useCollection`. */
export interface EstadoCollection<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
}

/**
 * Estado expuesto por `useCollection` cuando se pide seguimiento de frescura
 * con `{ seguirFrescura: true }`.
 *
 * `desdeCache` solo existe en este tipo: si no se pidió el seguimiento, el
 * tipo devuelto es `EstadoCollection<T>` y no tiene este campo, así que un
 * caller que no lo pidió no puede leerlo por error y confiar en un valor que
 * nunca fue una señal real. Es el tipo el que lo impide, no un comentario.
 */
export interface EstadoCollectionConFrescura<T> extends EstadoCollection<T> {
  /**
   * `true` si el snapshot vigente proviene de la caché local, todavía sin
   * confirmar por el servidor.
   *
   * Es una señal honesta de conectividad real: a diferencia de
   * `navigator.onLine`, no miente en un escenario de "captive portal" (el
   * wifi dice estar conectado, pero no pasa tráfico). Si `desdeCache` es
   * `true`, no hay servidor del otro lado, por más que `navigator.onLine`
   * diga que sí.
   */
  desdeCache: boolean;
}

/** Opciones de `useCollection`. */
export interface OpcionesUseCollection {
  /**
   * Si es `true`, el listener se suscribe con `includeMetadataChanges: true`
   * y el estado devuelto expone `desdeCache` (ver {@link EstadoCollectionConFrescura}).
   *
   * Por defecto (u omitiendo la opción) el comportamiento es exactamente el
   * de antes de que existiera esta opción: sin `includeMetadataChanges` y sin
   * `desdeCache`. Activarlo para todos los callers sin que lo pidan
   * provocaría renders extra (el de la confirmación del servidor) en toda la
   * app sin que nadie los use.
   */
  seguirFrescura?: boolean;
}

/**
 * Suscribe a una query de Firestore en vivo (`onSnapshot`) con estados
 * completos de carga / datos / error.
 *
 * `query` debe venir memoizada por el llamador (`useMemo` o una referencia
 * estable entre renders): el efecto se vuelve a suscribir cada vez que cambia
 * la *identidad* de `query`, no su contenido — no se implementa comparación
 * profunda, es el comportamiento estándar de `useEffect`.
 *
 * Pasar `query: null` desactiva el hook (para composición condicional sin
 * violar las reglas de hooks, p. ej. "esperar a un filtro antes de suscribir"):
 * no abre ninguna suscripción y devuelve `{ datos: [], cargando: false, error: null }`.
 *
 * Una colección vacía no es un error: resuelve en `datos: []`, `cargando: false`,
 * `error: null`.
 */
export function useCollection<T>(query: Query<T> | null): EstadoCollection<T>;
export function useCollection<T>(
  query: Query<T> | null,
  opciones: { seguirFrescura: true },
): EstadoCollectionConFrescura<T>;
export function useCollection<T>(
  query: Query<T> | null,
  opciones?: OpcionesUseCollection,
): EstadoCollection<T> | EstadoCollectionConFrescura<T> {
  const seguirFrescura = opciones?.seguirFrescura === true;

  const [estado, setEstado] = useState<EstadoCollectionConFrescura<T>>({
    datos: [],
    cargando: query !== null,
    error: null,
    desdeCache: false,
  });

  useEffect(() => {
    if (query === null) {
      setEstado({ datos: [], cargando: false, error: null, desdeCache: false });
      return;
    }

    setEstado({ datos: [], cargando: true, error: null, desdeCache: false });

    const alFallar = (error: FirestoreError) => {
      // Siempre a consola: los errores de Firestore traen información
      // accionable (p. ej. el link de creación de un índice faltante en
      // failed-precondition) que la UI genérica de error no muestra.
      console.error('[useCollection] Error de Firestore:', error);
      setEstado({ datos: [], cargando: false, error, desdeCache: false });
    };

    // Dos callbacks separados (en vez de uno que siempre lea
    // `snapshot.metadata.fromCache`) a propósito: sin `seguirFrescura` no
    // tocamos `.metadata` en absoluto, así que el listener funciona igual
    // que antes de que existiera esta opción.
    const desuscribir = seguirFrescura
      ? onSnapshot(
          query,
          { includeMetadataChanges: true },
          (snapshot: QuerySnapshot<T>) => {
            setEstado({
              datos: snapshot.docs.map((doc) => doc.data()),
              cargando: false,
              error: null,
              desdeCache: snapshot.metadata.fromCache,
            });
          },
          alFallar,
        )
      : onSnapshot(
          query,
          (snapshot: QuerySnapshot<T>) => {
            setEstado({
              datos: snapshot.docs.map((doc) => doc.data()),
              cargando: false,
              error: null,
              desdeCache: false,
            });
          },
          alFallar,
        );

    return desuscribir;
  }, [query, seguirFrescura]);

  if (seguirFrescura) {
    return estado;
  }

  return {
    datos: estado.datos,
    cargando: estado.cargando,
    error: estado.error,
  };
}
