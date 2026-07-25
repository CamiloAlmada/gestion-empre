import {
  formatearPeso,
  type MovimientoStock,
  type ResumenStock,
  type TipoMovimiento,
} from '@gestion/core';

/**
 * **Presentación** de las existencias en la pantalla Stock: texto del resumen,
 * fechas y etiquetas de movimientos. Sin React, sin Firebase.
 *
 * El CÁLCULO (agrupar piezas, resumir existencias, decidir si algo está por
 * vencer o bajo el mínimo) ya no vive acá: se mudó a `packages/core`
 * (`stock.ts` + `alertas.ts`) en la tarea B3 del plan, porque Reportes necesita
 * exactamente las mismas respuestas que Productos y dos implementaciones
 * paralelas terminan contradiciéndose en pantalla. Lo que quedó es lo que sí
 * es de esta app: cómo se escriben esos datos en español.
 */

/** Formatea una fecha como `dd/mm/aaaa`, para vencimientos y movimientos. */
export function formatearFecha(fecha: Date): string {
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getFullYear()}`;
}

/** Texto legible del resumen para la fila del producto en la lista maestra. */
export function textoResumen(resumen: ResumenStock): string {
  switch (resumen.tipo) {
    case 'piezas': {
      const piezas = resumen.cantidadPiezas === 1 ? '1 pieza' : `${resumen.cantidadPiezas} piezas`;
      return `${piezas} · ${formatearPeso(resumen.pesoTotalGramos)}`;
    }
    case 'granel':
      return formatearPeso(resumen.pesoTotalGramos);
    case 'unidad':
      return resumen.unidades === 1 ? '1 unidad' : `${resumen.unidades} unidades`;
  }
}

const ETIQUETAS_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ingreso_compra: 'Ingreso por compra',
  venta: 'Venta',
  ajuste_positivo: 'Ajuste (+)',
  ajuste_negativo: 'Ajuste (-)',
  merma: 'Merma',
  devolucion: 'Devolución',
};

/** Etiqueta en español de un `TipoMovimiento`, para el historial de existencias. */
export function etiquetaTipoMovimiento(tipo: TipoMovimiento): string {
  return ETIQUETAS_TIPO_MOVIMIENTO[tipo];
}

/** Delta de un movimiento (gramos o unidades) formateado con signo `+`/`-` explícito. */
export function formatearDeltaMovimiento(movimiento: MovimientoStock): string {
  if (movimiento.deltaGramos !== undefined) {
    const signo = movimiento.deltaGramos > 0 ? '+' : '';
    return `${signo}${formatearPeso(movimiento.deltaGramos)}`;
  }
  if (movimiento.deltaUnidades !== undefined) {
    const signo = movimiento.deltaUnidades > 0 ? '+' : '';
    return `${signo}${movimiento.deltaUnidades} unidades`;
  }
  return '—';
}
