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

/** `true` si el `modoStock` es "por pieza" (objeto físico con peso propio,
 * doc 02): `fraccionado_por_pieza` o `pieza_entera`. */
function esPorPieza(producto: Producto): boolean {
  return producto.modoStock === 'fraccionado_por_pieza' || producto.modoStock === 'pieza_entera';
}

/**
 * Unidad del COSTO PROMEDIO del producto (doc 03) — la determina el
 * **`modoStock`**, NUNCA el `modoPrecio`. `confirmarCompra`
 * (`packages/firebase-kit/src/compras.ts`) y `costoPromedioTrasCompra`
 * (`apps/quesarte/src/componentes/compras/resumenCompra.ts`) acumulan
 * `costoPromedioCents` en costo **por kg** para todo producto medido en
 * gramos (`fraccionado_por_pieza`, `pieza_entera`, `granel` — piezas y
 * granel solo cargan `costoRealKgCents`, nunca un costo por unidad), y en
 * costo **por unidad** solo para `unidad_simple`. Rotular el costo con la
 * unidad de VENTA (`modoPrecio`) en vez de con esta es el hallazgo **M2**
 * del review de Fase 2: un salame `pieza_entera` con `modoPrecio:
 * 'por_unidad'` (precio fijo, doc 02) tiene costo en $/kg pero se mostraba
 * "/u".
 */
export function unidadCosto(producto: Producto): 'kg' | 'unidad' {
  return producto.modoStock === 'unidad_simple' ? 'unidad' : 'kg';
}

/**
 * `true` si el costo y el precio del producto están en la MISMA unidad y el
 * margen es matemáticamente válido (doc 03, hallazgo **M2** del review de
 * Fase 2). Para `fraccionado_por_pieza`/`pieza_entera` el costo SIEMPRE es
 * por kg (`unidadCosto`); si además el producto se vende `por_unidad`
 * (combinación legítima para la venta — decisión del tech lead en M2, NO se
 * restringe en el catálogo: p. ej. un salame `pieza_entera` a precio fijo),
 * comparar ese costo por kg con un precio por unidad mezclaría unidades
 * incompatibles sin el peso de la pieza de por medio — el margen no es
 * calculable. `granel` y `unidad_simple` no tienen esta ambigüedad (doc 02:
 * sus combinaciones canónicas ya son `por_kg`/`por_unidad` respectivamente),
 * así que solo se gatea el caso por pieza.
 */
export function margenComparable(producto: Producto): boolean {
  return !esPorPieza(producto) || producto.modoPrecio === 'por_kg';
}

/**
 * Margen actual del producto (bps sobre venta), o `null` si no se puede
 * calcular. `margenDesdePrecio` (core) solo gatea `precioCents <= 0`; acá se
 * gatea además:
 * - `costoPromedioCents <= 0` — un producto recién creado (costo en cero
 *   hasta su primera compra, ver `Productos.tsx`) todavía no tiene margen
 *   real, mostrar `(precio - 0) / precio = 100 %` sería una división basura
 *   (doc 03: "productos sin costo promedio no muestran márgenes").
 * - `!margenComparable(producto)` — costo y precio en unidades distintas
 *   (hallazgo M2, ver `margenComparable`): mismo tratamiento que "sin
 *   costo", el margen queda indefinido en vez de calcular un número sin
 *   sentido.
 */
export function margenActualBps(producto: Producto): number | null {
  if (producto.costoPromedioCents <= 0) return null;
  if (!margenComparable(producto)) return null;
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
 * objetivo, si costo y precio están en unidades distintas
 * (`!margenComparable`, hallazgo M2 — sin el peso de la pieza no hay forma
 * de pasar de un objetivo "sobre venta por unidad" a un precio coherente
 * con un costo en $/kg), o si el objetivo cargado es `>= 100 %` (rango
 * inválido para `precioDesdeMargen`, dato que en teoría no debería poder
 * cargarse desde `ModalPrecio` pero que se tolera sin romper la pantalla si
 * llegara por otra vía, p. ej. una migración).
 */
export function precioSugeridoDe(
  producto: Producto,
  multiploCents: number = MULTIPLO_REDONDEO_CENTS_DEFAULT,
): Money | null {
  if (producto.margenObjetivoBps === undefined) return null;
  return precioSugeridoConMargen(producto, producto.margenObjetivoBps, multiploCents);
}

/**
 * Igual que `precioSugeridoDe`, pero con un margen objetivo dado en vez del
 * `margenObjetivoBps` ya cargado en el producto (WA-H, doc 03: "Margen
 * masivo sobre los filtrados") — la acción masiva calcula el precio sugerido
 * de un margen que el dueño está por FIJAR, todavía no persistido.
 * `null` en los mismos casos que `precioSugeridoDe` (sin costo, margen no
 * comparable, o `margenSobreVentaBps` fuera de rango).
 */
export function precioSugeridoConMargen(
  producto: Producto,
  margenSobreVentaBps: number,
  multiploCents: number = MULTIPLO_REDONDEO_CENTS_DEFAULT,
): Money | null {
  if (producto.costoPromedioCents <= 0) return null;
  if (!margenComparable(producto)) return null;
  try {
    return precioSugerido(producto.costoPromedioCents, margenSobreVentaBps, multiploCents);
  } catch {
    return null;
  }
}

/** Motivo por el que un producto queda afuera de "Margen para los
 * filtrados" (WA-H, doc 03): sin costo cargado, o costo/precio en unidades
 * distintas (`!margenComparable`, hallazgo M2). `null` si es elegible.
 * Categorías disjuntas — un producto sin costo cuenta como `'sin_costo'`
 * aunque además fuera no comparable, para que el modal reporte un total
 * consistente con la suma de exclusiones. */
export type RazonExclusionMasivo = 'sin_costo' | 'margen_no_comparable';

export function razonExclusionMasivo(producto: Producto): RazonExclusionMasivo | null {
  if (producto.costoPromedioCents <= 0) return 'sin_costo';
  if (!margenComparable(producto)) return 'margen_no_comparable';
  return null;
}

/** `true` si el producto puede recibir un margen objetivo masivo (WA-H): con
 * costo cargado y margen comparable — mismos gates que impiden calcular un
 * precio sugerido para él (ver `razonExclusionMasivo`). No requiere que el
 * producto YA tenga `margenObjetivoBps`: la acción masiva lo está fijando. */
export function elegibleParaMargenMasivo(producto: Producto): boolean {
  return razonExclusionMasivo(producto) === null;
}
