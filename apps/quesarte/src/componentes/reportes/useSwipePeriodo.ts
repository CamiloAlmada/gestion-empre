import { useSwipeHorizontal, type ManejadoresSwipeHorizontal } from '@gestion/ui';
import type { Granularidad } from '@gestion/core';

/**
 * Orden contractual del selector de período de Reportes (`OPCIONES_PERIODO`
 * en `Reportes.tsx`: Día → Semana → Mes). Deslizar hacia la izquierda avanza
 * en este orden, hacia la derecha retrocede — mismo criterio (UI-4c,
 * docs/06-ui-ux.md §2) que ya usa `useSwipeSeccion` para las secciones de
 * Stock, mismo orden que ya usa el selector visible.
 */
const ORDEN_PERIODOS: readonly Granularidad[] = ['dia', 'semana', 'mes'];

/**
 * Swipe horizontal para cambiar el período de la home de Reportes (pedido
 * del dueño: el mismo gesto ya aprendido en Stock, para que se sienta
 * idéntico). Reutiliza la MISMA detección de gesto que `useSwipeSeccion`
 * (umbral de distancia, dominancia de eje, exclusión de contenedores con
 * scroll horizontal propio, descarte de multitouch) vía `useSwipeHorizontal`
 * (`@gestion/ui`) — acá solo se traduce la dirección a "período
 * siguiente/anterior en `ORDEN_PERIODOS`", SIN wrap-around en los extremos
 * (mismo criterio que Stock en los extremos de su selector).
 *
 * `onCambiar` es la MISMA función que ya usa `GrupoSegmentado` en
 * `Reportes.tsx` (`cambiarGranularidad`, que escribe `?periodo=` con
 * `replace: true`): el swipe es un atajo sobre el selector visible, nunca un
 * camino paralelo — no conoce la URL ni el `replace`, solo pide el cambio.
 */
export function useSwipePeriodo(
  granularidadActual: Granularidad,
  onCambiar: (valor: Granularidad) => void,
): ManejadoresSwipeHorizontal {
  return useSwipeHorizontal((direccion) => {
    const indiceActual = ORDEN_PERIODOS.indexOf(granularidadActual);
    if (indiceActual === -1) return;

    const indiceDestino = indiceActual + (direccion === 'izquierda' ? 1 : -1);
    const destino = ORDEN_PERIODOS[indiceDestino];
    if (!destino) return; // extremo: sin wrap-around, el gesto no hace nada

    onCambiar(destino);
  });
}
