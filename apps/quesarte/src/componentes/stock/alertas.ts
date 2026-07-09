import type { Producto } from '@gestion/core';
import { estadoVencimiento, stockBajo, type ResumenStock } from './resumen';

/**
 * Alertas de la franja superior de Stock: conteo y filtrado por tipo, sobre
 * los `ResumenStock` ya calculados por producto (`calcularResumen`, ver
 * `Stock.tsx`). Sin React, sin Firebase: solo transforma datos ya calculados
 * por la pantalla — misma filosofía que `resumen.ts` y `agrupacion.ts`.
 *
 * "Por vencer" agrupa ambos estados de `estadoVencimiento` ('vencida' y
 * 'vence_pronto'): al dueño le interesa la lista de productos a mirar, no
 * distinguir el matiz en la franja (el matiz sigue estando en el badge de
 * cada fila).
 */
export type TipoAlerta = 'por_vencer' | 'stock_bajo';

export interface ConteoAlertas {
  porVencer: number;
  stockBajo: number;
}

/**
 * `true` si el producto (a través de su `resumen`) dispara la alerta de
 * vencimiento. Solo aplica a `modoStock` por pieza (`resumen.tipo ===
 * 'piezas'`); granel/unidad no tienen vencimiento.
 *
 * Usa `resumen.vencimientoProximo` (la fecha MÁS PRÓXIMA entre las piezas del
 * producto, ya calculada por `calcularResumen`) en vez de recorrer piezas de
 * nuevo: al estar ordenada ascendente, esa fecha es siempre la más urgente, y
 * su `estadoVencimiento` coincide exactamente con `peorEstadoVencimiento` de
 * todas las piezas (fechas más próximas ⇒ estados más severos).
 */
function tieneAlertaVencimiento(resumen: ResumenStock): boolean {
  return resumen.tipo === 'piezas' && estadoVencimiento(resumen.vencimientoProximo ?? undefined) !== null;
}

/**
 * Cuenta cuántos `productos` disparan cada tipo de alerta, según sus
 * `resumenes` (mapa `producto.id` → `ResumenStock`, calculado por el
 * llamador). Productos sin resumen en el mapa se ignoran (no deberían
 * ocurrir: el llamador arma el mapa a partir de los mismos `productos`).
 */
export function contarAlertas(productos: Producto[], resumenes: Map<string, ResumenStock>): ConteoAlertas {
  let porVencer = 0;
  let bajo = 0;
  for (const producto of productos) {
    const resumen = resumenes.get(producto.id);
    if (resumen === undefined) continue;
    if (tieneAlertaVencimiento(resumen)) porVencer++;
    if (stockBajo(producto, resumen)) bajo++;
  }
  return { porVencer, stockBajo: bajo };
}

/**
 * Filtra `productos` a los que disparan `alerta`. `alerta === null` es la
 * señal de "sin filtro": devuelve `productos` tal cual (permite implementar
 * el toggle on/off de los chips sin una rama aparte en el llamador).
 */
export function filtrarPorAlerta(
  productos: Producto[],
  resumenes: Map<string, ResumenStock>,
  alerta: TipoAlerta | null,
): Producto[] {
  if (alerta === null) return productos;
  return productos.filter((producto) => {
    const resumen = resumenes.get(producto.id);
    if (resumen === undefined) return false;
    return alerta === 'por_vencer' ? tieneAlertaVencimiento(resumen) : stockBajo(producto, resumen);
  });
}
