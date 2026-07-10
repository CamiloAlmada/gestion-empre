import { margenDesdePrecio, precioSugerido, type Money, type Producto } from '@gestion/core';

/**
 * Multiplo de redondeo comercial para el precio sugerido (docs/03-compras-costos-precios.md):
 * default **$5**, decidido con el dueño. El doc lo describe como configurable vía
 * `configuracion.multiploRedondeoCents`, pero ese campo TODAVÍA no existe en el
 * modelo `Configuracion` ni en su converter (`packages/core`/`packages/firebase-kit`)
 * — no hay UI que lo escriba, y esta tarea tiene alcance estricto (no tocar
 * `packages/`). Hasta que exista esa superficie, la pantalla de Precios usa
 * este default fijo (el mismo default que trae `redondearComercial`/
 * `precioSugerido` de core si no se les pasa `multiploCents`). Reportado al
 * tech lead como deuda pendiente.
 */
export const MULTIPLO_REDONDEO_CENTS_DEFAULT = 500;

/**
 * Margen actual del producto (bps sobre venta), o `null` si no se puede
 * calcular. `margenDesdePrecio` (core) solo gatea `precioCents <= 0`; acá se
 * gatea además `costoPromedioCents <= 0` — un producto recién creado (costo en
 * cero hasta su primera compra, ver `Productos.tsx`) todavía no tiene margen
 * real, mostrar `(precio - 0) / precio = 100 %` sería una división basura
 * (doc 03: "productos sin costo promedio no muestran márgenes").
 */
export function margenActualBps(producto: Producto): number | null {
  if (producto.costoPromedioCents <= 0) return null;
  return margenDesdePrecio(producto.costoPromedioCents, producto.precioVentaCents);
}

/**
 * `true` si el margen actual del producto quedó por debajo de su margen
 * objetivo (doc 03, "alerta de margen"). `false` si falta costo, falta precio
 * o no tiene objetivo definido — no hay nada que comparar en esos casos.
 */
export function estaBajoObjetivo(producto: Producto): boolean {
  const actual = margenActualBps(producto);
  return actual !== null && producto.margenObjetivoBps !== undefined && actual < producto.margenObjetivoBps;
}

/**
 * Precio sugerido para alcanzar el margen objetivo del producto, con
 * redondeo comercial (`precioSugerido` de core). `null` si falta costo u
 * objetivo, o si el objetivo cargado es `>= 100 %` (rango inválido para
 * `precioDesdeMargen`, dato que en teoría no debería poder cargarse desde
 * `ModalPrecio` pero que se tolera sin romper la pantalla si llegara por otra
 * vía, p. ej. una migración).
 */
export function precioSugeridoDe(
  producto: Producto,
  multiploCents: number = MULTIPLO_REDONDEO_CENTS_DEFAULT,
): Money | null {
  if (producto.margenObjetivoBps === undefined || producto.costoPromedioCents <= 0) return null;
  try {
    return precioSugerido(producto.costoPromedioCents, producto.margenObjetivoBps, multiploCents);
  } catch {
    return null;
  }
}
