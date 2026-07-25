import type { Alertas } from '@gestion/core';

/**
 * Adaptación de las alertas de dominio (`evaluarAlertas`, `packages/core`) a lo
 * que necesita la franja de chips de la pantalla Productos: un conteo y el
 * conjunto de ids a filtrar.
 *
 * Acá NO se decide qué está en alerta — eso ya lo decidió core, una sola vez,
 * para esta pantalla y para Reportes (tarea B3 de `docs/PLAN-ACTIVO.md`). Estas
 * dos funciones solo proyectan ese resultado; si alguna vez difieren de lo que
 * muestra Reportes, es porque se le pasó otro `ContextoAlertas`, nunca porque
 * el criterio sea otro.
 *
 * "Por vencer" agrupa los dos estados de vencimiento ('vencida' y
 * 'vence_pronto'): al dueño le interesa la lista de productos a mirar, no
 * distinguir el matiz en la franja (el matiz sigue estando en el badge de cada
 * fila, y desglosado en el reporte de Reportes).
 */
export type TipoAlerta = 'por_vencer' | 'stock_bajo';

export interface ConteoAlertas {
  porVencer: number;
  stockBajo: number;
}

/** Cuántos productos dispara cada tipo de alerta. */
export function conteoDeAlertas(alertas: Alertas): ConteoAlertas {
  return { porVencer: alertas.porVencer.length, stockBajo: alertas.bajoUmbral.length };
}

/**
 * Ids de los productos que disparan `alerta`, para filtrar la lista maestra.
 * `alerta === null` es la señal de "sin filtro": devuelve `null` (permite
 * implementar el toggle on/off de los chips sin una rama aparte en el llamador).
 */
export function idsEnAlerta(alertas: Alertas, alerta: TipoAlerta | null): Set<string> | null {
  if (alerta === null) return null;
  const lista = alerta === 'por_vencer' ? alertas.porVencer : alertas.bajoUmbral;
  return new Set(lista.map((a) => a.productoId));
}
