import { useEffect, useState } from 'react';
import { onSnapshot, type FirestoreError, type Query } from 'firebase/firestore';

/** Estado expuesto por `useCollection`. */
export interface EstadoCollection<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
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
export function useCollection<T>(query: Query<T> | null): EstadoCollection<T> {
  const [estado, setEstado] = useState<EstadoCollection<T>>({
    datos: [],
    cargando: query !== null,
    error: null,
  });

  useEffect(() => {
    if (query === null) {
      setEstado({ datos: [], cargando: false, error: null });
      return;
    }

    setEstado({ datos: [], cargando: true, error: null });

    const desuscribir = onSnapshot(
      query,
      (snapshot) => {
        setEstado({
          datos: snapshot.docs.map((doc) => doc.data()),
          cargando: false,
          error: null,
        });
      },
      (error) => {
        // Siempre a consola: los errores de Firestore traen información
        // accionable (p. ej. el link de creación de un índice faltante en
        // failed-precondition) que la UI genérica de error no muestra.
        console.error('[useCollection] Error de Firestore:', error);
        setEstado({ datos: [], cargando: false, error });
      },
    );
    return desuscribir;
  }, [query]);

  return estado;
}
