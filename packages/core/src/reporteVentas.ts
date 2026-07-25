import { BPS_TOTAL } from './margen.js';
import { money, sumarMoney, type Money } from './money.js';
import { costoCongeladoDe } from './costeo.js';
import { redondearHalfUp } from './redondeo.js';
import type { ItemVenta, Venta } from './tipos.js';

/**
 * Agregación de ventas para el módulo de Reportes (Fase 3, doc 04).
 *
 * Todo acceso al costo de una línea pasa por `costoCongeladoDe` (la única
 * puerta autorizada al mapa `costeo`, ver `costeo.ts`): nunca `item.costeo?.…`
 * ni un `0` asumido. Cuando no hay costo congelado, la línea se excluye de la
 * ganancia (no suma 0) y queda contabilizada aparte en `CoberturaCosto` — un
 * resumen que dice "ganaste X" sin decir que un % de lo vendido no tenía costo
 * conocido es exactamente el número que miente.
 *
 * **Las ventas anuladas se excluyen siempre**, en el único punto de filtro de
 * este módulo (`ventasVigentes`): la anulación no borra, cambia `estado`, y si
 * alguna función olvidara filtrarla los reportes mentirían para siempre.
 */

/**
 * Ventas no anuladas. Único filtro de estado de todo el módulo.
 *
 * Exportada (tarea B4, `rendimientoCompra.ts`): es el mismo filtro que
 * necesita cualquier otra agregación sobre `Venta[]`, y la regla del proyecto
 * es "el filtro ya existe en core, no se reimplementa" — un segundo
 * `v.estado !== 'anulada'` esparcido es exactamente el riesgo que este único
 * punto existía para evitar.
 */
export function ventasVigentes(ventas: readonly Venta[]): Venta[] {
  return ventas.filter((v) => v.estado !== 'anulada');
}

/**
 * Cobertura del costo sobre un conjunto de líneas: cuántas tienen costo
 * congelado (base para calcular ganancia) y cuántas no.
 */
export interface CoberturaCosto {
  /** Líneas con costo congelado (`costoCongeladoDe` ≠ `null`): entran en la ganancia. */
  readonly lineasConCosto: number;
  /** Líneas SIN costo congelado (`sin_dato` o `legado`): no aportan a la ganancia. */
  readonly lineasSinCosto: number;
  /** `lineasConCosto + lineasSinCosto`. */
  readonly totalLineas: number;
  /**
   * `lineasConCosto / totalLineas` en bps enteros (mismo idioma que
   * `margen.ts`). `null` si `totalLineas === 0`: sin líneas no hay cobertura
   * que reportar — ni `0 %` ni `100 %` serían honestos.
   */
  readonly coberturaBps: number | null;
  /** Subtotal vendido de las líneas SIN costo conocido: cuánta plata del total no tiene ganancia calculable. */
  readonly montoSinCostoCents: Money;
}

function calcularCobertura(items: readonly ItemVenta[]): CoberturaCosto {
  let lineasConCosto = 0;
  let montoSinCosto = 0;

  for (const item of items) {
    if (costoCongeladoDe(item) !== null) {
      lineasConCosto += 1;
    } else {
      montoSinCosto += item.subtotalCents;
    }
  }

  const totalLineas = items.length;
  return {
    lineasConCosto,
    lineasSinCosto: totalLineas - lineasConCosto,
    totalLineas,
    coberturaBps: totalLineas > 0 ? redondearHalfUp((lineasConCosto * BPS_TOTAL) / totalLineas) : null,
    montoSinCostoCents: money(montoSinCosto),
  };
}

/** Resumen agregado de un conjunto de ventas (ya acotado al período por el caller). */
export interface ResumenPeriodo {
  /** Suma de `totalCents` de las ventas no anuladas. Cuánto se vendió (facturación). */
  readonly totalVendidoCents: Money;
  /**
   * Ganancia bruta: suma de `subtotal − costo` **solo** de las líneas con
   * costo congelado conocido. Las líneas sin costo NO restan ni suman 0: se
   * excluyen del cálculo y quedan visibles en `cobertura`. Por eso este número
   * puede estar SUBESTIMADO cuando `cobertura.coberturaBps < 10_000`: siempre
   * mostrar la cobertura junto a la ganancia, nunca la ganancia sola.
   */
  readonly gananciaBrutaCents: Money;
  /** Cantidad de ventas no anuladas incluidas. */
  readonly cantidadVentas: number;
  /** Cobertura de costo sobre TODAS las líneas de las ventas incluidas. */
  readonly cobertura: CoberturaCosto;
}

/**
 * Resume un conjunto de ventas: total vendido, ganancia bruta real y cantidad
 * de ventas, junto con la cobertura de costo que respalda la ganancia.
 *
 * No filtra por fecha (el "período" ya lo resolvió el caller, vía `periodo.ts`
 * y su query — ver la nota de arquitectura del plan activo: "las funciones de
 * core reciben `Venta[]`, de dónde salen es problema del hook"). SÍ filtra
 * siempre las anuladas.
 *
 * Con `ventas` vacío (o con todas anuladas) devuelve el resumen "cero": total
 * y ganancia en `money(0)`, `cantidadVentas: 0`, cobertura con
 * `totalLineas: 0` y `coberturaBps: null`.
 */
export function resumenPeriodo(ventas: readonly Venta[]): ResumenPeriodo {
  const vigentes = ventasVigentes(ventas);
  const items = vigentes.flatMap((v) => v.items);

  let ganancia = 0;
  for (const item of items) {
    const costo = costoCongeladoDe(item);
    if (costo !== null) ganancia += item.subtotalCents - costo;
  }

  return {
    totalVendidoCents: sumarMoney(...vigentes.map((v) => v.totalCents)),
    gananciaBrutaCents: money(ganancia),
    cantidadVentas: vigentes.length,
    cobertura: calcularCobertura(items),
  };
}

/** Rótulo para líneas cuyo producto no se pudo resolver a una categoría (ver `rankingPorCategoria`). */
const SIN_CATEGORIA = 'Sin categoría';

/** Una fila del ranking de rentabilidad (por producto o por categoría). */
export interface ItemRanking {
  /** `productoId` (ranking por producto) o nombre de categoría (ranking por categoría). */
  readonly clave: string;
  /** Nombre a mostrar. */
  readonly etiqueta: string;
  /** Facturación (suma de subtotales) de esta clave. NO es el criterio de orden. */
  readonly facturacionCents: Money;
  /** Ganancia aportada (misma política que `resumenPeriodo`: solo líneas con costo conocido). Criterio de orden. */
  readonly gananciaCents: Money;
  /**
   * Cuántas de sus líneas SÍ tenían costo congelado. `0` significa que
   * `gananciaCents` es `money(0)` porque no se supo el costo de NINGUNA
   * línea, no porque la clave haya dejado 0 de ganancia real — la pantalla
   * (tarea B2) usa este campo para separar esas claves en un grupo aparte,
   * en vez de mostrarlas mezcladas en el ranking como si "no dejaran plata".
   */
  readonly lineasConCosto: number;
  /** Cuántas de sus líneas no tenían costo congelado (para que la pantalla pueda rotular el dato como parcial). */
  readonly lineasSinCosto: number;
}

interface AcumuladorRanking {
  etiqueta: string;
  facturacion: number;
  ganancia: number;
  conCosto: number;
  sinCosto: number;
}

/**
 * Agrupa las líneas de las ventas vigentes por `claveDe`, acumula facturación
 * y ganancia, y ordena por **ganancia aportada** — nunca por facturación: que
 * un producto venda mucho no significa que deje plata, y confundir los dos
 * criterios es exactamente lo que este ranking existe para evitar.
 *
 * La `etiqueta` de cada clave es la del PRIMER ítem encontrado para esa clave
 * (asunción documentada: un nombre puede diferir entre ventas si el producto
 * se renombró; no afecta el agregado, solo el rótulo).
 */
function rankingPor(
  ventas: readonly Venta[],
  claveDe: (item: ItemVenta) => string,
  etiquetaDe: (item: ItemVenta) => string,
): ItemRanking[] {
  const acumulado = new Map<string, AcumuladorRanking>();

  for (const venta of ventasVigentes(ventas)) {
    for (const item of venta.items) {
      const clave = claveDe(item);
      const entrada = acumulado.get(clave) ?? {
        etiqueta: etiquetaDe(item),
        facturacion: 0,
        ganancia: 0,
        conCosto: 0,
        sinCosto: 0,
      };

      entrada.facturacion += item.subtotalCents;
      const costo = costoCongeladoDe(item);
      if (costo !== null) {
        entrada.ganancia += item.subtotalCents - costo;
        entrada.conCosto += 1;
      } else {
        entrada.sinCosto += 1;
      }

      acumulado.set(clave, entrada);
    }
  }

  return [...acumulado.entries()]
    .map(([clave, v]) => ({
      clave,
      etiqueta: v.etiqueta,
      facturacionCents: money(v.facturacion),
      gananciaCents: money(v.ganancia),
      lineasConCosto: v.conCosto,
      lineasSinCosto: v.sinCosto,
    }))
    .sort((a, b) => b.gananciaCents - a.gananciaCents);
}

/** Ranking de rentabilidad por producto (`productoId`), ordenado por ganancia aportada. */
export function rankingPorProducto(ventas: readonly Venta[]): ItemRanking[] {
  return rankingPor(
    ventas,
    (item) => item.productoId,
    (item) => item.nombreProducto,
  );
}

/**
 * Ranking de rentabilidad por categoría, ordenado por ganancia aportada.
 *
 * `categoriaDeProducto` resuelve `productoId` → nombre de categoría (el
 * ítem de venta no lo lleva denormalizado). Si no puede resolverlo —producto
 * borrado, dato legado— la línea cae en el bucket rotulado `'Sin categoría'`
 * en vez de desaparecer silenciosamente del reporte.
 */
export function rankingPorCategoria(
  ventas: readonly Venta[],
  categoriaDeProducto: (productoId: string) => string | undefined,
): ItemRanking[] {
  const etiquetaDe = (item: ItemVenta): string => categoriaDeProducto(item.productoId) ?? SIN_CATEGORIA;
  return rankingPor(ventas, etiquetaDe, etiquetaDe);
}

/**
 * Margen sobre facturación de una fila del ranking (`gananciaCents /
 * facturacionCents`, en bps enteros — mismo idioma que `margen.ts`).
 *
 * Es el número que hace evidente "vende mucho, deja poco" en una sola cifra
 * por fila (tarea B2: consumido como `valorSecundario` de `FilaRanking`,
 * `packages/ui`) — sin él, distinguir un producto de alta facturación y baja
 * ganancia exige comparar dos listas mentalmente, que es justo lo que el
 * drill-down existe para evitar. Vive en `packages/core` (regla de oro 3:
 * cero aritmética de plata en un componente) aunque el consumidor sea una
 * sola pantalla.
 *
 * `null` si `facturacionCents <= 0`: sin facturación no hay margen que
 * expresar (evita dividir por cero, mismo criterio que `margenDesdePrecio`).
 */
export function margenDeRanking(
  item: Pick<ItemRanking, 'facturacionCents' | 'gananciaCents'>,
): number | null {
  if (item.facturacionCents <= 0) return null;
  return redondearHalfUp((item.gananciaCents * BPS_TOTAL) / item.facturacionCents);
}

/**
 * Proporción `0-100` de `gananciaCents` respecto de `maxGananciaCents` (la
 * mayor ganancia del ranking que se está mostrando) — el ancho de la barra
 * de `FilaRanking`. El resultado no es una cifra de negocio (es layout), pero
 * la operación de origen SÍ es aritmética de plata, así que vive acá y no en
 * la pantalla (regla de oro 3). `FilaRanking` clampea el resultado a `[0,
 * 100]` por robustez de rango (una ganancia negativa, venta a pérdida, no
 * debe romper el layout); acá no hace falta duplicar ese clamp.
 *
 * `0` si `maxGananciaCents <= 0`: sin una ganancia máxima positiva no hay
 * proporción que calcular (evita dividir por cero).
 */
export function proporcionGanancia(gananciaCents: Money, maxGananciaCents: Money): number {
  if (maxGananciaCents <= 0) return 0;
  return (gananciaCents / maxGananciaCents) * 100;
}
