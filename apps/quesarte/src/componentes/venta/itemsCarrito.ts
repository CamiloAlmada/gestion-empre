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

/**
 * ¿Se puede sumar una unidad más al ítem `clave` (`unidad_simple`)? Cuenta
 * TODAS las unidades de ese producto ya carriteadas (no solo las del propio
 * ítem — puede haber más de un ítem del mismo producto si se agregó por
 * separado más de una vez), igual criterio que los constructores: nunca se
 * valida contra el stock de catálogo a secas, sino contra lo que el carrito
 * ya prometió. `false` si la clave no existe o el ítem no es `unidad_simple`.
 */
export function puedeSumarUnidad(items: ItemCarrito[], clave: string): boolean {
  const item = items.find((i) => i.clave === clave);
  if (item === undefined || item.producto.modoStock !== 'unidad_simple') return false;
  const stock = item.producto.stockUnidades ?? 0;
  return unidadesEnCarrito(items, item.producto.id) < stock;
}

function unidadesEnCarrito(items: ItemCarrito[], productoId: string): number {
  return items.reduce((acc, item) => (item.producto.id === productoId ? acc + (item.unidades ?? 0) : acc), 0);
}

/**
 * Cambia en `delta` (típicamente +1 o -1, el stepper del carrito) las
 * unidades del ítem `clave` (`unidad_simple`). El ítem reconstruido sale de
 * `crearItemUnidad` (subtotal por core, nunca aritmética de plata acá). Si
 * las unidades resultantes son ≤ 0, el ítem se QUITA del carrito. Si `delta`
 * es positivo y no hay stock para sumar (`puedeSumarUnidad` da `false`), es
 * no-op: devuelve `items` sin cambios — el componente ya debe deshabilitar el
 * "+" en ese caso, esto es la garantía de dominio detrás de esa UI.
 */
export function cambiarUnidades(items: ItemCarrito[], clave: string, delta: number): ItemCarrito[] {
  const item = items.find((i) => i.clave === clave);
  if (item === undefined || item.producto.modoStock !== 'unidad_simple') return items;

  const unidadesNuevas = (item.unidades ?? 0) + delta;
  if (unidadesNuevas <= 0) {
    return items.filter((i) => i.clave !== clave);
  }
  if (delta > 0 && !puedeSumarUnidad(items, clave)) {
    return items;
  }

  const itemActualizado = crearItemUnidad(item.producto, unidadesNuevas, clave);
  return items.map((i) => (i.clave === clave ? itemActualizado : i));
}

/** Reemplaza el ítem de clave `clave` por `nuevoItem` (mismo lugar de la lista, misma clave). No-op si `clave` no está. */
export function reemplazarItem(items: ItemCarrito[], clave: string, nuevoItem: ItemCarrito): ItemCarrito[] {
  return items.map((item) => (item.clave === clave ? nuevoItem : item));
}

/**
 * Piezas disponibles para EDITAR el ítem `claveEnEdicion` (`fraccionado_por_pieza`):
 * igual que `piezasAjustadasPorCarrito`, pero excluyendo la reserva del
 * propio ítem que se está editando — esos gramos vuelven a estar "libres"
 * para reasignar. Así, editar un corte de 800 g a 900 g de una pieza con
 * 900 g restantes es válido: los 800 g ya eran del propio ítem, no había que
 * pedírselos a nadie más. Sin este ajuste, `piezasAjustadasPorCarrito`
 * seguiría contando la reserva vieja del ítem Y la nueva, rechazando una
 * edición que en los hechos no pide nada extra.
 */
export function piezasParaEditar(
  piezas: Pieza[],
  productoId: string,
  itemsCarrito: ItemCarrito[],
  claveEnEdicion: string,
): Pieza[] {
  return piezasAjustadasPorCarrito(
    piezas,
    productoId,
    itemsCarrito.filter((item) => item.clave !== claveEnEdicion),
  );
}

/**
 * Stock de `granel` disponible para EDITAR un ítem. A diferencia de
 * `fraccionado_por_pieza`, el carrito NO ajusta `producto.stockGranelGramos`
 * por lo ya reservado (no existe un equivalente a `piezasAjustadasPorCarrito`
 * para granel — ver nota al tech lead): `ModalAgregarGranel` valida siempre
 * contra el stock de catálogo tal cual, sin restar otros ítems `granel` del
 * carrito. Como ese stock nunca se redujo por la reserva del propio ítem en
 * primer lugar, no hay nada que "devolverle": el mismo stock de catálogo que
 * agregar sirve, sin transformación, para editar. Esta función existe para
 * que el modal pida ese valor con la misma forma en ambos modos (paridad de
 * interfaz con `piezasParaEditar`) y para dejar la equivalencia documentada
 * en vez de implícita.
 */
export function stockGranelParaEditar(producto: Producto): Peso {
  return producto.stockGranelGramos ?? peso(0);
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
