import {
  formatearPeso,
  peso,
  type AlertaStockBajo,
  type AlertaVencimiento,
  type Alertas,
  type MagnitudStock,
} from '@gestion/core';

/**
 * Presentación en español de las alertas de stock (`evaluarAlertas`, core).
 * Sin React ni Firebase: solo traduce a texto lo que ya decidió el dominio.
 *
 * Regla de docs/06-ui-ux.md §5 que gobierna todo este archivo: **nada se
 * comunica solo por color**. Cada estado de vencimiento tiene su palabra
 * ("Vencida", "Vence hoy", "Vence en 4 días"), no solo su tono.
 */

/**
 * Plazo en lenguaje llano a partir de los días restantes: `-3` → "Venció hace
 * 3 días", `0` → "Vence hoy", `1` → "Vence mañana", `4` → "Vence en 4 días".
 *
 * "Hoy" y "mañana" en vez de "en 0 días"/"en 1 día" a propósito: el reporte se
 * lee de pie y con apuro (§1), y esas dos son las únicas dos filas sobre las
 * que se puede hacer algo HOY.
 */
export function textoPlazo(diasRestantes: number): string {
  if (diasRestantes < 0) {
    const dias = Math.abs(diasRestantes);
    return dias === 1 ? 'Venció ayer' : `Venció hace ${dias} días`;
  }
  if (diasRestantes === 0) return 'Vence hoy';
  if (diasRestantes === 1) return 'Vence mañana';
  return `Vence en ${diasRestantes} días`;
}

/**
 * Existencia o umbral con su unidad, según la magnitud de la alerta.
 *
 * `Math.round` sobre los gramos: `Producto.umbralAlertaStock` es un `number`
 * plano sin validación de entero en las reglas (ver `tipos.ts`), y `peso()`
 * lanza con un float. Un umbral mal cargado tiene que degradar el texto, no
 * tumbar la pantalla de alertas entera.
 */
export function textoExistencia(magnitud: MagnitudStock, valor: number): string {
  if (magnitud === 'unidades') {
    return valor === 1 ? '1 unidad' : `${valor} unidades`;
  }
  return formatearPeso(peso(Math.round(valor)));
}

/** "1 pieza" / "N piezas". */
export function textoCantidadPiezas(cantidad: number): string {
  return cantidad === 1 ? '1 pieza' : `${cantidad} piezas`;
}

/** Línea secundaria de una alerta de vencimiento: cuántas piezas y cuánto peso. */
export function detalleVencimiento(alerta: AlertaVencimiento): string {
  return `${textoCantidadPiezas(alerta.piezas.length)} · ${formatearPeso(alerta.pesoEnAlertaGramos)}`;
}

/** Línea secundaria de una alerta de stock bajo: cuánto queda contra el mínimo. */
export function detalleStockBajo(alerta: AlertaStockBajo): string {
  const hay = textoExistencia(alerta.magnitud, alerta.existencia);
  const minimo = textoExistencia(alerta.magnitud, alerta.umbral);
  return `Quedan ${hay} · mínimo ${minimo}`;
}

/** `"N productos"` / `"1 producto"`, para los encabezados de cada grupo. */
export function textoCantidadProductos(cantidad: number): string {
  return cantidad === 1 ? '1 producto' : `${cantidad} productos`;
}

/**
 * Titular del bloque de alertas en la home de Reportes: la frase que Adrián
 * lee sin navegar. `null` cuando no hay nada que avisar — ese caso NO es una
 * variante de este texto sino una buena noticia con su propio diseño (ver
 * `ResumenAlertas`).
 *
 * Menciona solo lo que existe: con vencimientos y sin faltantes no dice "y 0
 * bajo el mínimo". Un cero explícito ocupa lugar y no habilita ninguna
 * decisión.
 */
export function titularAlertas(alertas: Alertas): string | null {
  const partes: string[] = [];
  if (alertas.porVencer.length > 0) {
    partes.push(`${textoCantidadProductos(alertas.porVencer.length)} por vencer`);
  }
  if (alertas.bajoUmbral.length > 0) {
    partes.push(`${textoCantidadProductos(alertas.bajoUmbral.length)} bajo el mínimo`);
  }
  return partes.length === 0 ? null : partes.join(' · ');
}

/**
 * Lo más urgente de todo, para la segunda línea del bloque de la home: el
 * producto que peor está y por qué. `null` si no hay alertas.
 *
 * Un vencimiento gana siempre a un faltante: la mercadería que vence se pierde
 * (plata que se tira), la que falta se repone.
 */
export function loMasUrgente(alertas: Alertas): string | null {
  const [vencimiento] = alertas.porVencer;
  if (vencimiento !== undefined) {
    return `${vencimiento.nombreProducto}: ${textoPlazo(vencimiento.diasRestantesMin).toLowerCase()}`;
  }
  const [faltante] = alertas.bajoUmbral;
  if (faltante !== undefined) {
    return `${faltante.nombreProducto}: quedan ${textoExistencia(faltante.magnitud, faltante.existencia)}`;
  }
  return null;
}
