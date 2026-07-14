import {
  calcularCostoRealKgCents,
  calcularTicketPromedio,
  money,
  type Compra,
  type ItemCompra,
  type Money,
  type Producto,
} from '@gestion/core';
import { unidadCosto } from '../stock/margenes';

/** Un ítem de compra ya localizado, junto con la compra a la que pertenece
 * (para leer `fecha`/`proveedorNombre` sin otra lectura). */
export interface CompraConItem {
  compra: Compra;
  item: ItemCompra;
}

/**
 * Busca, entre `compras` (se asume YA ordenadas por `fecha` desc — mismo
 * orden que entrega la query de `ModalDesgloseCosto`, calcada de
 * `Compras.tsx`), la más reciente **confirmada** que incluya `productoId`
 * (COSTO-1, doc 03). Ignora borradores explícitamente: aunque la query ya
 * filtra `estado == 'confirmada'` con `where`, este chequeo extra hace la
 * función correcta también si algún día se le pasa una lista sin filtrar
 * (p. ej. en un test), sin depender de que el llamador nunca se equivoque.
 */
export function ultimaCompraConProducto(compras: Compra[], productoId: string): CompraConItem | null {
  for (const compra of compras) {
    if (compra.estado !== 'confirmada') continue;
    const item = compra.items.find((it) => it.productoId === productoId);
    if (item !== undefined) return { compra, item };
  }
  return null;
}

/** Desglose de costo de UNA compra, ya normalizado a la unidad del costo del
 * producto (`unidadCosto`: /kg o /u) — lo que muestra `ModalDesgloseCosto`. */
export interface DesgloseCosto {
  fecha: Date;
  proveedorNombre: string;
  unidad: 'kg' | 'unidad';
  mercaderiaCents: Money;
  gastosCents: Money;
  /** SIEMPRE el campo persistido por la confirmación (`costoRealKgCents` o,
   * para ítems por unidad, `costoRealCents` normalizado con el mismo helper
   * que `costoRealPorUnidad` de `resumenCompra.ts`) — nunca la suma de
   * `mercaderiaCents + gastosCents` ya normalizados por separado: por
   * redondeo (half-up en cada normalización), esa suma puede diferir en 1
   * centésimo del total real. Aceptado por contrato (docs/03, COSTO-1). */
  costoRealCents: Money;
}

/**
 * Deriva el `DesgloseCosto` de un `ItemCompra` ya confirmado (campos
 * inmutables persistidos por `confirmarCompra`, doc 03). CERO aritmética de
 * plata nueva: compone `calcularCostoRealKgCents` (core, ítems al peso) o
 * `calcularTicketPromedio` (core, ítems por unidad — mismo "gap de
 * superficie" documentado en `costoRealPorUnidad` de `resumenCompra.ts": no
 * hay un `calcularCostoRealUnidadCents` en core todavía) sobre los mismos
 * campos que ya usa la pantalla de Compras para calcular el prorrateo en
 * vivo.
 *
 * `null` si el ítem no trae los campos que le corresponden por su unidad
 * (gramos/`costoRealKgCents` para /kg, unidades/`costoRealCents` para /u) —
 * no debería pasar con una compra confirmada real (invariante que garantiza
 * `confirmarCompra`), pero evita un cálculo con `undefined` si algún dato
 * está corrupto o incompleto en vez de reventar.
 */
export function desglosarCosto(producto: Producto, compra: Compra, item: ItemCompra): DesgloseCosto | null {
  const unidad = unidadCosto(producto);
  const gastoProrrateadoCents = item.gastoProrrateadoCents ?? money(0);

  if (unidad === 'kg') {
    if (item.gramos === undefined || item.costoRealKgCents === undefined) return null;
    const mercaderiaCents = calcularCostoRealKgCents(item.costoFacturaCents, item.gramos) ?? money(0);
    const gastosCents = calcularCostoRealKgCents(gastoProrrateadoCents, item.gramos) ?? money(0);
    return {
      fecha: compra.fecha,
      proveedorNombre: compra.proveedorNombre,
      unidad,
      mercaderiaCents,
      gastosCents,
      costoRealCents: item.costoRealKgCents,
    };
  }

  if (item.unidades === undefined || item.costoRealCents === undefined) return null;
  const mercaderiaCents = calcularTicketPromedio(item.costoFacturaCents, item.unidades) ?? money(0);
  const gastosCents = calcularTicketPromedio(gastoProrrateadoCents, item.unidades) ?? money(0);
  const costoRealCents = calcularTicketPromedio(item.costoRealCents, item.unidades) ?? money(0);
  return { fecha: compra.fecha, proveedorNombre: compra.proveedorNombre, unidad, mercaderiaCents, gastosCents, costoRealCents };
}
