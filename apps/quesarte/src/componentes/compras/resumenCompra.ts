import {
  calcularCostoRealCents,
  calcularCostoRealKgCents,
  calcularTicketPromedio,
  formatearPeso,
  money,
  nuevoCostoPromedio,
  peso,
  prorratearGastos,
  sumarMoney,
  sumarPeso,
  type GastoCompra,
  type ItemCompra,
  type ItemProrrateable,
  type MetodoProrrateo,
  type ModoStock,
  type Money,
  type Peso,
  type PiezaCompra,
  type Producto,
} from '@gestion/core';
import type { EfectoProductoCompra, ItemBorradorCompra } from '@gestion/firebase-kit';

/**
 * Cálculos puros de la pantalla de Compras (F2-F1, doc 03): construcción de
 * ítems por `modoStock`, prorrateo en vivo y los efectos por producto que
 * necesita `confirmarCompra`. Sin React, sin Firebase — mismo criterio que
 * `componentes/venta/itemsCarrito.ts` / `componentes/stock/resumen.ts`.
 *
 * Regla dura del proyecto: nunca aritmética de plata a mano. Todo acá se
 * arma componiendo funciones de `@gestion/core` (`prorratearGastos`,
 * `calcularCostoRealCents`, `calcularCostoRealKgCents`, `nuevoCostoPromedio`,
 * `sumarMoney`, `sumarPeso`) — ver la nota de `costoRealPorUnidad` más abajo
 * para el único caso sin un helper de core dedicado.
 */

/** Ítem en edición en la pantalla: `ItemBorradorCompra` + el `modoStock` del
 * producto (para saber qué campos mostrar/editar; no se persiste, `core`
 * nunca lo ve — se descarta en `aItemBorrador`). */
export interface ItemCompraForm extends ItemBorradorCompra {
  modoStock: ModoStock;
}

/** Arma un `ItemCompraForm` vacío para un producto recién elegido. */
export function itemVacio(productoId: string, nombreProducto: string, modoStock: ModoStock): ItemCompraForm {
  return { productoId, nombreProducto, modoStock, costoFacturaCents: money(0) };
}

/** Quita `modoStock` (detalle de UI) antes de mandar el ítem a `firebase-kit`. */
export function aItemBorrador(item: ItemCompraForm): ItemBorradorCompra {
  const { productoId, nombreProducto, gramos, unidades, piezas, costoFacturaCents } = item;
  return { productoId, nombreProducto, gramos, unidades, piezas, costoFacturaCents };
}

/**
 * Deriva la categoría de `modoStock` a partir del SHAPE de un `ItemCompra` ya
 * persistido (piezas → por pieza; si no, gramos → granel; si no, unidad).
 * Al recargar un borrador guardado, `core` no persiste el `modoStock` del
 * producto en el ítem (no hace falta para `confirmarCompra`); esta pantalla
 * sí lo necesita para decidir qué formulario mostrar en `ModalItemCompra`.
 *
 * No distingue `fraccionado_por_pieza` de `pieza_entera` (ambas caen en
 * `'fraccionado_por_pieza'`): las dos usan el MISMO formulario de piezas acá
 * (ver `ModalItemCompra`), así que la distinción es irrelevante para esta
 * reconstrucción — mientras el ítem se edite a través de `SelectorProductoCompra`
 * (que sí trae el `Producto` vivo, con su `modoStock` exacto), el valor real
 * nunca se pierde.
 */
export function modoStockDeItem(item: Pick<ItemCompra, 'piezas' | 'gramos' | 'unidades'>): ModoStock {
  if (item.piezas !== undefined && item.piezas.length > 0) return 'fraccionado_por_pieza';
  if (item.gramos !== undefined) return 'granel';
  return 'unidad_simple';
}

/** Reconstruye un `ItemCompraForm` de edición a partir de un `ItemCompra` ya
 * persistido (borrador cargado desde Firestore). */
export function itemCompraAForm(item: ItemCompra): ItemCompraForm {
  return {
    productoId: item.productoId,
    nombreProducto: item.nombreProducto,
    modoStock: modoStockDeItem(item),
    gramos: item.gramos,
    unidades: item.unidades,
    piezas: item.piezas,
    costoFacturaCents: item.costoFacturaCents,
  };
}

/** Suma de `pesoGramos` de una lista de piezas declaradas (identidad 0 vacía). */
export function sumaPiezas(piezas: PiezaCompra[]): Peso {
  return sumarPeso(...piezas.map((p) => p.pesoGramos));
}

/** Totales en vivo de un borrador (mismo criterio que `totalesBorrador` de
 * `firebase-kit/compras.ts`, recalculado acá para reflejar la edición en
 * curso ANTES de guardar). */
export interface TotalesCompra {
  totalFacturaCents: Money;
  totalGastosCents: Money;
  totalRealCents: Money;
}

export function totalesActuales(items: ItemCompraForm[], gastos: GastoCompra[]): TotalesCompra {
  const totalFacturaCents = sumarMoney(...items.map((it) => it.costoFacturaCents));
  const totalGastosCents = sumarMoney(...gastos.map((g) => g.montoCents));
  const totalRealCents = sumarMoney(totalFacturaCents, totalGastosCents);
  return { totalFacturaCents, totalGastosCents, totalRealCents };
}

/** Ítem con el prorrateo y los costos reales ya calculados (lo que muestra
 * el resumen en vivo y lo que se manda a `confirmarCompra`). */
export type ItemProrrateado = ItemCompraForm & {
  gastoProrrateadoCents: Money;
  costoRealCents: Money;
  costoRealKgCents: Money | null;
};

/**
 * Prorratea los gastos del viaje entre los ítems (`core.prorratearGastos`) y
 * deriva el costo real (+ costo real/kg para ítems al peso) de cada uno. Es
 * la MISMA fórmula que corre `confirmarCompra` al validar — se llama acá
 * para mostrarla en vivo antes de confirmar.
 */
export function calcularItemsProrrateados(
  items: ItemCompraForm[],
  totalGastosCents: Money,
  metodo: MetodoProrrateo,
): ItemProrrateado[] {
  const prorrateables: ItemProrrateable[] = items.map((it) => ({
    costoFacturaCents: it.costoFacturaCents,
    gramos: it.gramos,
  }));
  const prorrateados = prorratearGastos(prorrateables, totalGastosCents, metodo);

  return items.map((item, i) => {
    const gastoProrrateadoCents = prorrateados[i]!.gastoProrrateadoCents;
    const costoRealCents = calcularCostoRealCents(item.costoFacturaCents, gastoProrrateadoCents);
    const costoRealKgCents =
      item.gramos !== undefined ? calcularCostoRealKgCents(costoRealCents, item.gramos) : null;
    return { ...item, gastoProrrateadoCents, costoRealCents, costoRealKgCents };
  });
}

/**
 * Costo real "por unidad" de un ítem `unidad_simple`: `costoRealCents /
 * unidades`, redondeado half-up.
 *
 * GAP DE SUPERFICIE (reportado al tech lead): `core` expone
 * `calcularCostoRealKgCents` para ítems al peso, pero no un equivalente para
 * ítems por unidad. La fórmula es EXACTAMENTE la de `calcularTicketPromedio`
 * (total/cantidad, half-up) — se reutiliza esa función de `core` en vez de
 * escribir la división a mano acá (regla dura: nunca aritmética de plata en
 * la app). Candidato a promover a `calcularCostoRealUnidadCents` en core,
 * análogo a `calcularCostoRealKgCents`, en una tarea futura.
 */
function costoRealPorUnidad(item: ItemProrrateado): Money {
  return calcularTicketPromedio(item.costoRealCents, item.unidades ?? 0) ?? money(0);
}

/**
 * Nuevo costo promedio de UN producto tras esta compra, plegando
 * `core.nuevoCostoPromedio` sobre los ítems que lo tocan (normalmente uno
 * solo — la pantalla no permite dos ítems del mismo producto en una misma
 * compra, pero se pliega igual por si acaso, en vez de asumirlo).
 *
 * Cantidad/costo existentes según `modoStock`:
 * - `granel`: `stockGranelGramos` + `costoPromedioCents` (costo por kg).
 * - `unidad_simple`: `stockUnidades` + `costoPromedioCents` (costo por unidad).
 * - `fraccionado_por_pieza` / `pieza_entera`: SIN cache de peso disponible en
 *   `Producto` (a diferencia de granel, que sí lo tiene) — leer el total real
 *   implicaría sumar `piezas` de esa colección, una lectura extra que
 *   `confirmarCompra` (doc: "CERO lecturas en el camino de escritura") pide
 *   evitar. Se arranca en `cantidadActual = 0`: el nuevo promedio queda en el
 *   costo por kg de ESTA compra (rama documentada de `nuevoCostoPromedio`,
 *   "sin stock previo"). Cada pieza igual guarda su propio `costoKgCents`
 *   exacto (fuente de verdad para el costo de venta, doc 03) — este promedio
 *   a nivel producto es informativo/para la pantalla de márgenes, no afecta
 *   el costeo de una venta futura de esas piezas.
 */
function costoPromedioTrasCompra(producto: Producto, items: ItemProrrateado[]): Money {
  let cantidadAcumulada =
    producto.modoStock === 'unidad_simple'
      ? (producto.stockUnidades ?? 0)
      : producto.modoStock === 'granel'
        ? (producto.stockGranelGramos ?? peso(0))
        : 0;
  let costoAcumulado = producto.costoPromedioCents;

  for (const item of items) {
    const cantidadItem = producto.modoStock === 'unidad_simple' ? (item.unidades ?? 0) : (item.gramos ?? peso(0));
    const costoUnitarioItem =
      producto.modoStock === 'unidad_simple' ? costoRealPorUnidad(item) : (item.costoRealKgCents ?? money(0));
    costoAcumulado = nuevoCostoPromedio(cantidadAcumulada, costoAcumulado, cantidadItem, costoUnitarioItem);
    cantidadAcumulada += cantidadItem;
  }
  return costoAcumulado;
}

/**
 * Arma `EfectoProductoCompra[]` para `confirmarCompra`: un efecto por CADA
 * `productoId` distinto de `items` (bijección exigida por `firebase-kit`).
 * `productos` debe traer TODOS los productos referenciados por `items` (ya
 * suscriptos en pantalla — doc 03: "cero lecturas extra").
 *
 * @throws {Error} si falta el producto de algún ítem en el mapa (no debería
 *   pasar: la pantalla solo deja agregar ítems de productos ya cargados).
 */
export function calcularEfectosProducto(
  items: ItemProrrateado[],
  productos: Map<string, Producto>,
): EfectoProductoCompra[] {
  const porProducto = new Map<string, ItemProrrateado[]>();
  for (const item of items) {
    const lista = porProducto.get(item.productoId);
    if (lista !== undefined) lista.push(item);
    else porProducto.set(item.productoId, [item]);
  }

  const efectos: EfectoProductoCompra[] = [];
  for (const [productoId, itemsDelProducto] of porProducto) {
    const producto = productos.get(productoId);
    if (producto === undefined) {
      throw new Error(`Falta el producto ${productoId} en el mapa de productos suscriptos.`);
    }
    efectos.push({
      productoId,
      nuevoCostoPromedioCents: costoPromedioTrasCompra(producto, itemsDelProducto),
    });
  }
  return efectos;
}

/** Texto legible de la cantidad de un ítem, para la fila de la tabla. */
export function textoCantidadItem(item: ItemCompraForm): string {
  if (item.piezas !== undefined) {
    const n = item.piezas.length;
    const etiqueta = n === 1 ? '1 pieza' : `${n} piezas`;
    return item.gramos !== undefined ? `${etiqueta} · ${formatearPeso(item.gramos)}` : etiqueta;
  }
  if (item.gramos !== undefined) return formatearPeso(item.gramos);
  if (item.unidades !== undefined) return item.unidades === 1 ? '1 unidad' : `${item.unidades} unidades`;
  return '—';
}
