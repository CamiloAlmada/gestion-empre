import type { Money } from './money.js';
import type { Peso } from './peso.js';
import { calcularSubtotal } from './precio.js';
import type { CosteoItem, FuenteCosteo, OrigenCosteo, Pieza } from './tipos.js';

/**
 * Congelado y lectura del costo de una línea de operación (`CosteoItem`).
 *
 * Dos responsabilidades, las dos puras (regla de oro 1):
 *
 * 1. **`congelarCosteo`** — decide fuente y montos en el instante de la
 *    operación, a partir de datos que el caller YA tiene en memoria. No lee nada:
 *    el camino de venta es offline-first y no admite lecturas nuevas.
 * 2. **`clasificarCosteo` / `costoCongeladoDe`** — el ÚNICO lugar (junto al
 *    converter) que pregunta si el mapa `costeo` existe. Las agregaciones y las
 *    pantallas consumen estos selectores y nunca vuelven a escribir
 *    `if (item.costeo === undefined)`: esa rama, esparcida, es la que termina
 *    contando un ítem sin costo como si tuviera 100 % de ganancia.
 *
 * El tipo `CosteoItem` NO es exclusivo de ventas: la merma va a congelar costo
 * con el mismo tipo y las mismas funciones de este módulo.
 */

/** Versión del esquema de costeo que escribe esta build. */
export const VERSION_COSTEO = 1;

/**
 * Magnitud costeada, discriminada para que no se puedan cruzar los casos (nunca
 * gramos con un costo por unidad, ni al revés), igual que `ItemCobrable`.
 *
 * Se pasa en POSITIVO: el signo (p. ej. el delta negativo de una merma) es
 * responsabilidad del consumidor, no del costeo.
 */
export type MagnitudCosteada =
  | { readonly medida: 'peso'; readonly gramos: Peso }
  | { readonly medida: 'unidades'; readonly unidades: number };

/**
 * Datos disponibles al congelar. `pieza` y `costoPromedioCents` son las dos bases
 * posibles y la pieza tiene prioridad: es el costo REAL de ese objeto físico,
 * mientras que el promedio es un cache derivado del producto.
 */
export interface EntradaCosteo {
  /**
   * Pieza descontada, si la línea va por pieza. Aporta el costo real y la
   * procedencia (`compraId`). Basta con esos dos campos: la pieza completa ya
   * viene en memoria en el POS, pero el costeo no necesita más.
   */
  readonly pieza?: Pick<Pieza, 'costoKgCents' | 'compraId'>;
  /** Costo promedio vigente del producto (granel / unidad). */
  readonly costoPromedioCents?: Money;
  /** Cuánto se costea. */
  readonly magnitud: MagnitudCosteada;
  /** Quién produce el dato. Default `'venta'`; el backfill pasa `'backfill'`. */
  readonly origen?: OrigenCosteo;
}

/**
 * Congela el costo de una línea.
 *
 * Fuente:
 * - con `pieza` ⇒ `'pieza'`, base `pieza.costoKgCents`, y se copia `compraId`;
 * - sin pieza ⇒ `'promedio'`, base `costoPromedioCents`;
 * - base ausente o ≤ 0 ⇒ `'sin_costo'`, SIN montos.
 *
 * Decisiones de borde (todas testeadas):
 * - **Base ≤ 0 = sin base.** `costoPromedioCents` vale 0 en un producto que nunca
 *   entró por Compras; congelarlo declararía 100 % de ganancia. Un 0 no se
 *   distingue de "no sé", así que se trata como "no sé" y el dato queda ausente.
 * - **Pieza sin costo NO cae al promedio.** Una pieza de ingreso manual puede
 *   tener `costoKgCents` 0 (regalo, muestra, corrección: por decisión del dueño
 *   no afecta el costo promedio, doc 03). Usar el promedio del producto para ella
 *   sería estimar en silencio, indistinguible de un promedio genuino: queda
 *   `'sin_costo'` (plan activo, decisión "lo no recuperable queda sin costo").
 * - **`costoItemCents` sale de `calcularSubtotal`**, la misma función que produce
 *   `subtotalCents`. No es "la misma regla de redondeo" por convención: es
 *   literalmente el mismo código, así que no puede divergir. Con eso,
 *   `ganancia = subtotalCents − costoItemCents` es reproducible siempre.
 *
 * @throws {RangeError} si la magnitud en unidades no es entera (vía
 *   `calcularSubtotal`), o si el costo resultante no es un entero de centésimos.
 */
export function congelarCosteo(entrada: EntradaCosteo): CosteoItem {
  const { pieza, costoPromedioCents, magnitud, origen = 'venta' } = entrada;

  const fuente: FuenteCosteo = pieza !== undefined ? 'pieza' : 'promedio';
  const base = pieza !== undefined ? pieza.costoKgCents : costoPromedioCents;

  if (base === undefined || base <= 0) {
    return { v: VERSION_COSTEO, fuente: 'sin_costo', origen };
  }

  const costeo: CosteoItem = {
    v: VERSION_COSTEO,
    fuente,
    origen,
    costoUnitCents: base,
    costoItemCents: costoDeLaMagnitud(base, magnitud),
  };
  // La procedencia solo existe si la pieza vino de una compra; nunca `undefined`
  // explícito (el converter omite ausentes, no escribe `null`).
  if (pieza?.compraId !== undefined) costeo.compraId = pieza.compraId;
  return costeo;
}

/** Costo total de la magnitud, con la MISMA aritmética que el subtotal cobrado. */
function costoDeLaMagnitud(costoUnitCents: Money, magnitud: MagnitudCosteada): Money {
  return magnitud.medida === 'peso'
    ? calcularSubtotal({ modoPrecio: 'por_kg', precioKgCents: costoUnitCents, gramos: magnitud.gramos })
    : calcularSubtotal({
        modoPrecio: 'por_unidad',
        precioUnitCents: costoUnitCents,
        unidades: magnitud.unidades,
      });
}

/**
 * Qué confianza tiene el costo de una línea:
 * - `real`: congelado por la operación misma, con montos.
 * - `estimado`: reconstruido por un backfill posterior, con montos.
 * - `sin_dato`: la operación SÍ registró costeo, y no había base de costo.
 * - `legado`: la línea es anterior al congelado (no hay mapa `costeo`, "versión 0").
 *
 * `sin_dato` y `legado` son distintos a propósito: el primero es una afirmación
 * ("se miró y no había costo"), el segundo una ausencia de información.
 */
export type ClaseCosteo = 'real' | 'estimado' | 'sin_dato' | 'legado';

/** Cualquier línea que pueda llevar costo congelado (ítem de venta, merma…). */
export interface ConCosteo {
  readonly costeo?: CosteoItem;
}

/**
 * Clasifica el costo de una línea. Punto ÚNICO de la rama "¿existe el mapa?".
 *
 * Notas de clasificación:
 * - Un mapa de versión desconocida (futura) se trata como `legado`: esta build no
 *   sabe interpretarlo, y decir "no sé" es honesto; inventar un monto no.
 * - Sin montos ⇒ `sin_dato`, sea cual sea el `origen`: un backfill que no pudo
 *   reconstruir nada no aporta un estimado.
 * - Con montos, manda `origen`: `backfill` es `estimado` aunque la fuente sea la
 *   pieza. Reconstruido es reconstruido.
 */
export function clasificarCosteo(linea: ConCosteo): ClaseCosteo {
  const costeo = linea.costeo;
  if (costeo === undefined || costeo.v !== VERSION_COSTEO) return 'legado';
  if (costeo.costoItemCents === undefined) return 'sin_dato';
  return costeo.origen === 'backfill' ? 'estimado' : 'real';
}

/**
 * Costo total congelado de una línea, o `null` si no lo tiene (`sin_dato` /
 * `legado`). Compañero de `clasificarCosteo`: juntos son la única puerta al mapa,
 * así que ninguna agregación necesita destapar `costeo` ni asumir un 0.
 *
 * `null` (y no 0) a propósito: quien agrega debe decidir explícitamente qué hacer
 * con una línea sin costo — nunca sumarle un cero silencioso.
 */
export function costoCongeladoDe(linea: ConCosteo): Money | null {
  if (clasificarCosteo(linea) === 'legado') return null;
  return linea.costeo?.costoItemCents ?? null;
}
