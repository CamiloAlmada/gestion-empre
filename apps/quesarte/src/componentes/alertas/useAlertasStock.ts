import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import {
  agruparPiezasPorProducto,
  evaluarAlertas,
  type Alertas,
  type Pieza,
  type Producto,
} from '@gestion/core';
import { piezaConverter, productoConverter, useCollection } from '@gestion/firebase-kit';
import { db } from '../../firebase';
import { useContextoAlertas } from './useContextoAlertas';

export interface EstadoAlertasStock {
  readonly alertas: Alertas;
  readonly cargando: boolean;
  readonly hayError: boolean;
  /** Ventana de aviso vigente, para nombrarla en la UI. */
  readonly diasAviso: number;
  /** Fuerza un resubscribe de las queries (botón "Reintentar"). */
  readonly reintentar: () => void;
}

/**
 * Alertas de stock listas para pintar, compartidas por la home de Reportes y
 * por su drill-down (`/reportes/alertas`). Una sola definición de qué se
 * consulta y con qué contexto: las dos pantallas no pueden diferir.
 *
 * **Las queries y por qué no necesitan índice nuevo:**
 * - `productos` sin filtro (mismo criterio que `Productos.tsx`): traer todo y
 *   filtrar los activos en memoria evita un `where('activo')` que obligaría a
 *   un índice compuesto en cuanto se le sume un orden. Son decenas de
 *   documentos.
 * - `piezas` con UNA igualdad (`estado == 'disponible'`), sin `orderBy`: una
 *   query de un solo filtro de igualdad se resuelve con el índice de campo
 *   único que Firestore mantiene solo. **No** se le agrega
 *   `orderBy('fechaVencimiento')` —que usaría el índice compuesto
 *   `piezas (estado, fechaVencimiento)` de `firestore.indexes.json`— porque
 *   Firestore EXCLUYE de un `orderBy` los documentos que no tienen ese campo:
 *   las piezas sin vencimiento (frutos secos, especias) desaparecerían del
 *   resultado y su peso dejaría de contar para la alerta de stock bajo. El
 *   orden por urgencia lo hace `evaluarAlertas` sobre el conjunto completo,
 *   que es el único que puede hacerlo bien.
 *
 * **Offline-first** (regla de oro 6): con persistencia habilitada
 * `useCollection` resuelve desde la caché, así que la pantalla no se bloquea
 * sin conexión. Quien consuma esto muestra el aviso correspondiente.
 */
export function useAlertasStock(): EstadoAlertasStock {
  const [intento, setIntento] = useState(0);
  const { contexto, cargando: cargandoContexto } = useContextoAlertas();

  const productosQuery = useMemo(
    () => collection(db, 'productos').withConverter(productoConverter),
    // `intento` fuerza una referencia nueva: `useCollection` resubscribe por
    // IDENTIDAD de la query (ver su doc).
    [intento],
  );
  const piezasQuery = useMemo(
    () =>
      query(collection(db, 'piezas').withConverter(piezaConverter), where('estado', '==', 'disponible')),
    [intento],
  );

  const productos = useCollection<Producto>(productosQuery);
  const piezas = useCollection<Pieza>(piezasQuery);

  const piezasAgrupadas = useMemo(() => agruparPiezasPorProducto(piezas.datos), [piezas.datos]);

  // Solo productos ACTIVOS: un producto dado de baja no se repone ni se
  // remata (mismo contrato que la franja de Productos, docs/06-ui-ux.md §2).
  const productosActivos = useMemo(() => productos.datos.filter((p) => p.activo), [productos.datos]);

  const alertas = useMemo(
    () => evaluarAlertas(productosActivos, piezasAgrupadas, contexto),
    [productosActivos, piezasAgrupadas, contexto],
  );

  return {
    alertas,
    cargando: productos.cargando || piezas.cargando || cargandoContexto,
    hayError: productos.error !== null || piezas.error !== null,
    diasAviso: contexto.diasAviso,
    reintentar: () => setIntento((n) => n + 1),
  };
}
