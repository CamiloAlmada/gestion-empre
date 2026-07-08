import { useEffect, useState } from 'react';
import { onSnapshot, type DocumentReference, type FirestoreError } from 'firebase/firestore';

/** Estado expuesto por `useDoc`. */
export interface EstadoDoc<T> {
  datos: T | null;
  cargando: boolean;
  error: FirestoreError | null;
}

/**
 * Suscribe a un documento de Firestore en vivo (`onSnapshot`) con estados
 * completos de carga / datos / error.
 *
 * `ref` debe venir memoizado por el llamador (`useMemo` o una referencia
 * estable entre renders): el efecto se vuelve a suscribir cada vez que cambia
 * la *identidad* de `ref`, no su contenido — no se implementa comparación
 * profunda, es el comportamiento estándar de `useEffect`.
 *
 * Pasar `ref: null` desactiva el hook (para composición condicional sin violar
 * las reglas de hooks, p. ej. "esperar a tener un id antes de suscribir"): no
 * abre ninguna suscripción y devuelve `{ datos: null, cargando: false, error: null }`.
 *
 * Un documento inexistente (`snapshot.exists() === false`) no es un error de
 * lectura: resuelve en `datos: null`, `cargando: false`, `error: null`.
 */
export function useDoc<T>(ref: DocumentReference<T> | null): EstadoDoc<T> {
  const [estado, setEstado] = useState<EstadoDoc<T>>({
    datos: null,
    cargando: ref !== null,
    error: null,
  });

  useEffect(() => {
    if (ref === null) {
      setEstado({ datos: null, cargando: false, error: null });
      return;
    }

    setEstado({ datos: null, cargando: true, error: null });

    const desuscribir = onSnapshot(
      ref,
      (snapshot) => {
        setEstado({
          datos: snapshot.exists() ? snapshot.data() : null,
          cargando: false,
          error: null,
        });
      },
      (error) => {
        // Siempre a consola: los errores de Firestore traen información
        // accionable que la UI genérica de error no muestra.
        console.error('[useDoc] Error de Firestore:', error);
        setEstado({ datos: null, cargando: false, error });
      },
    );
    return desuscribir;
  }, [ref]);

  return estado;
}
