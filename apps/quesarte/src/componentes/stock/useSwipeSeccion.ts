import { useLocation, useNavigate } from 'react-router';
import { useSwipeHorizontal, type ManejadoresSwipeHorizontal } from '@gestion/ui';
import type { ItemSelectorSeccion } from './SelectorSeccion';

/** Mismo tipo que `ManejadoresSwipeHorizontal` (`@gestion/ui`): se mantiene
 * como alias propio para no romper el import existente en `StockLayout.tsx`
 * ni en `useSwipeSeccion.test.tsx`. */
export type ManejadoresSwipeSeccion = ManejadoresSwipeHorizontal;

/**
 * Swipe horizontal entre secciones RAÍZ de Stock (docs/06-ui-ux.md §2,
 * UI-4c): la DETECCIÓN del gesto (umbral de distancia, dominancia de eje,
 * exclusión de contenedores con scroll horizontal propio, descarte de
 * multitouch) vive en `useSwipeHorizontal` (`@gestion/ui`), compartida con
 * el swipe de período de Reportes (`componentes/reportes/useSwipePeriodo.ts`)
 * — este hook solo traduce "izquierda/derecha" a "sección siguiente/anterior
 * en `items`", con navegación por ruta.
 *
 * `items` es el MISMO array filtrado por rol que recibe `SelectorSeccion`
 * (`itemsSelectorStock(esAdmin)`): el orden de navegación respeta el rol sin
 * recalcularlo acá.
 */
export function useSwipeSeccion(items: ItemSelectorSeccion[]): ManejadoresSwipeSeccion {
  const location = useLocation();
  const navigate = useNavigate();

  return useSwipeHorizontal((direccion) => {
    const indiceActual = items.findIndex((item) => item.a === location.pathname);
    if (indiceActual === -1) return;

    const indiceDestino = indiceActual + (direccion === 'izquierda' ? 1 : -1);
    const destino = items[indiceDestino];
    if (!destino) return; // extremo del array: sin wrap-around, el gesto no hace nada

    navigate(destino.a, { viewTransition: true });
  });
}
