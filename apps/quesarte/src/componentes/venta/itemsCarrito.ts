import {
  calcularSubtotal,
  formatearPeso,
  peso,
  pesoNoNegativo,
  restarPeso,
  sumarMoney,
  sumarPeso,
  type ItemCobrable,
  type Money,
  type Peso,
  type Pieza,
  type Producto,
} from '@gestion/core';
import type { ItemEntradaVenta } from '@gestion/firebase-kit';
import { formatearFecha } from '../stock/resumen';

/**
 * Cálculos puros del carrito del POS: construcción de ítems por `modoStock`,
 * total, y las derivaciones que necesitan los modales de "agregar" (piezas ya
 * reservadas por el propio carrito, piezas ya usadas para `pieza_entera`).
 * Sin React, sin Firebase — mismo criterio que `componentes/stock/resumen.ts`.
 *
 * Un `ItemCarrito` es exactamente un `ItemEntradaVenta` (de
 * `@gestion/firebase-kit`) más una `clave` de lista de React: al cobrar, se
 * arma `EntradaVenta.items` quitando `clave` sin ninguna transformación.
 */
export interface ItemCarrito extends ItemEntradaVenta {
  /** Clave estable de lista (React). No se persiste. */
  clave: string;
}

function itemCobrablePorKg(producto: Producto, gramos: Peso): ItemCobrable {
  return { modoPrecio: 'por_kg', precioKgCents: producto.precioVentaCents, gramos };
}

/**
 * Ítem de `fraccionado_por_pieza`: se corta `gramos` de `pieza` (elegida por
 * FIFO o a mano). El subtotal sale de `calcularSubtotal`, nunca de
 * aritmética propia.
 */
export function crearItemFraccionado(
  producto: Producto,
  pieza: Pieza,
  gramos: Peso,
  clave: string,
): ItemCarrito {
  return {
    clave,
    producto,
    pieza,
    gramos,
    precioUnitCents: producto.precioVentaCents,
    subtotalCents: calcularSubtotal(itemCobrablePorKg(producto, gramos)),
  };
}

/**
 * Ítem de `pieza_entera`: se lleva la pieza completa. El peso vendido (y por
 * lo tanto el precio) ES el peso restante de esa pieza puntual (docs 02).
 */
export function crearItemPiezaEntera(producto: Producto, pieza: Pieza, clave: string): ItemCarrito {
  const gramos = pieza.pesoRestanteGramos;
  return {
    clave,
    producto,
    pieza,
    gramos,
    precioUnitCents: producto.precioVentaCents,
    subtotalCents: calcularSubtotal(itemCobrablePorKg(producto, gramos)),
  };
}

/** Ítem de `granel`: sin pieza, descuenta del stock agregado del producto. */
export function crearItemGranel(producto: Producto, gramos: Peso, clave: string): ItemCarrito {
  return {
    clave,
    producto,
    gramos,
    precioUnitCents: producto.precioVentaCents,
    subtotalCents: calcularSubtotal(itemCobrablePorKg(producto, gramos)),
  };
}

/** Ítem de `unidad_simple`: unidades enteras, precio fijo por unidad. */
export function crearItemUnidad(producto: Producto, unidades: number, clave: string): ItemCarrito {
  return {
    clave,
    producto,
    unidades,
    precioUnitCents: producto.precioVentaCents,
    subtotalCents: calcularSubtotal({
      modoPrecio: 'por_unidad',
      precioUnitCents: producto.precioVentaCents,
      unidades,
    }),
  };
}

/** Total del carrito: SIEMPRE `sumarMoney` de los subtotales, nunca `+`. */
export function totalCarrito(items: ItemCarrito[]): Money {
  return sumarMoney(...items.map((item) => item.subtotalCents));
}

/** Ids de las piezas que ya están reservadas en el carrito (cualquier modo). */
export function piezaIdsEnCarrito(items: ItemCarrito[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.pieza !== undefined) ids.add(item.pieza.id);
  }
  return ids;
}

/**
 * Piezas de `productoId` con su `pesoRestanteGramos` AJUSTADO por lo que el
 * propio carrito ya reservó de `fraccionado_por_pieza` (no persistido
 * todavía). Sin este ajuste, agregar dos cortes de la misma pieza en el
 * mismo ticket dejaría que el FIFO ofrezca de nuevo el peso "de catálogo"
 * completo, permitiendo pedir más de lo que en verdad queda disponible antes
 * de cobrar. `pieza_entera` no necesita este ajuste: esa pieza se excluye
 * directamente de la lista (ver `piezaIdsEnCarrito`), no se resta un delta.
 *
 * No muta `piezas`; devuelve piezas nuevas (mismo patrón que el resto de
 * `@gestion/core`: nunca aritmética de peso fuera de sus helpers, acá se usan
 * `sumarPeso` para acumular reservas y `pesoNoNegativo(restarPeso(...))` para el
 * `Peso` ajustado, clampeado a 0).
 */
export function piezasAjustadasPorCarrito(
  piezas: Pieza[],
  productoId: string,
  itemsCarrito: ItemCarrito[],
): Pieza[] {
  const reservas = new Map<string, Peso>();
  for (const item of itemsCarrito) {
    if (
      item.producto.id !== productoId ||
      item.producto.modoStock !== 'fraccionado_por_pieza' ||
      item.pieza === undefined ||
      item.gramos === undefined
    ) {
      continue;
    }
    reservas.set(item.pieza.id, sumarPeso(reservas.get(item.pieza.id) ?? peso(0), item.gramos));
  }
  if (reservas.size === 0) return piezas;

  return piezas.map((pieza) => {
    const reservado = reservas.get(pieza.id);
    if (reservado === undefined) return pieza;
    return {
      ...pieza,
      pesoRestanteGramos: pesoNoNegativo(restarPeso(pieza.pesoRestanteGramos, reservado)),
    };
  });
}

/** Línea de detalle de un ítem para la fila del carrito (peso/pieza/unidades). */
export function detalleItem(item: ItemCarrito): string {
  if (item.producto.modoStock === 'unidad_simple') {
    const unidades = item.unidades ?? 0;
    return unidades === 1 ? '1 unidad' : `${unidades} unidades`;
  }

  const gramos = item.gramos ?? peso(0);
  if (item.producto.modoStock === 'pieza_entera') {
    return `Pieza entera · ${formatearPeso(gramos)}`;
  }
  if (item.producto.modoStock === 'fraccionado_por_pieza' && item.pieza !== undefined) {
    return `${formatearPeso(gramos)} · pieza del ${formatearFecha(item.pieza.fechaIngreso)}`;
  }
  return formatearPeso(gramos);
}
