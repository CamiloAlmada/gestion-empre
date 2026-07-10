import { money, type Money } from './money.js';
import type { Peso } from './peso.js';

/**
 * Método de reparto de los gastos de un viaje entre los ítems de una compra
 * (espeja `Configuracion.metodoProrrateo` en `tipos.ts`):
 *
 * - `por_valor` (default del doc 03): proporcional al `costoFacturaCents` del ítem.
 * - `por_peso`: proporcional a los `gramos` del ítem. Los ítems por unidad (sin
 *   `gramos`) pesan 0 y quedan fuera del reparto (limitación documentada en doc 03).
 */
export type MetodoProrrateo = 'por_valor' | 'por_peso';

/** Mínimo que necesita un ítem para poder prorratearle gastos. */
export interface ItemProrrateable {
  /** Lo que dice la factura por el ítem (total del ítem), en centésimos. */
  readonly costoFacturaCents: Money;
  /** Peso del ítem en gramos. Solo lo usa `por_peso`; ausente en ítems por unidad. */
  readonly gramos?: Peso;
}

/**
 * Reparte un `total` entero entre `n` cubetas según `pesos` enteros ≥ 0,
 * devolviendo enteros que **suman exactamente `total`** — sin perder ni inventar
 * un centésimo, para cualquier combinación de montos.
 *
 * Algoritmo (método del mayor residuo / Hamilton, todo en aritmética entera para
 * no arrastrar error de punto flotante):
 *   1. base_i = ⌊total · peso_i / W⌋  con W = Σ pesos.
 *   2. residuo = total − Σ base_i  (entero en `[0, n)`; es la parte fraccionaria
 *      acumulada que el piso descartó).
 *   3. se reparte +1 a los `residuo` ítems de mayor residuo fraccionario.
 *
 * **Desempate determinístico** de los residuos fraccionarios (para que el reparto
 * sea función pura, reproducible): mayor residuo → mayor `peso` (honra el
 * "residuo al ítem de mayor valor" del doc 03) → menor índice.
 *
 * Casos borde:
 * - `W === 0` (todos los pesos 0, p. ej. gastos por peso con solo ítems por
 *   unidad): se reparte en partes iguales por cantidad de ítems, preservando el
 *   invariante de suma exacta.
 * - lista vacía: solo válida si `total === 0` (no se puede prorratear a nadie).
 *
 * Refina la instrucción del doc 03 ("asignar el residuo al ítem de mayor valor"):
 * el mayor residuo es más justo que volcar todo el sobrante en un único ítem, y en
 * caso de empate el desempate por peso recupera exactamente esa intención. El
 * requisito innegociable (Σ == total) se cumple en ambas lecturas.
 *
 * @throws {RangeError} si `total` no es entero ≥ 0, si algún peso no es entero ≥ 0,
 *   o si la lista es vacía con `total > 0`.
 */
export function repartirProporcional(total: Money, pesos: readonly number[]): Money[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError(`repartirProporcional requiere un total entero ≥ 0, recibió: ${total}`);
  }
  const n = pesos.length;
  for (const p of pesos) {
    if (!Number.isInteger(p) || p < 0) {
      throw new RangeError(`repartirProporcional requiere pesos enteros ≥ 0, recibió: ${p}`);
    }
  }
  if (n === 0) {
    if (total === 0) return [];
    throw new RangeError(`no se puede prorratear un total > 0 sin ítems (total: ${total})`);
  }

  let W = 0;
  for (const p of pesos) W += p;

  // Sin base de reparto: partes iguales por cantidad (cada ítem pesa 1).
  const base = W === 0 ? pesos.map(() => 1) : pesos;
  if (W === 0) W = n;

  const montos = new Array<number>(n);
  const residuos = new Array<number>(n);
  let asignado = 0;
  for (let i = 0; i < n; i++) {
    const producto = total * base[i]!;
    const piso = Math.floor(producto / W);
    montos[i] = piso;
    residuos[i] = producto - piso * W; // residuo fraccionario en unidades de W
    asignado += piso;
  }

  // `residuo` unidades enteras por repartir; 0 ≤ residuo < n (Σ fracciones < n).
  const residuo = total - asignado;
  const orden = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    if (residuos[b]! !== residuos[a]!) return residuos[b]! - residuos[a]!; // mayor residuo
    if (base[b]! !== base[a]!) return base[b]! - base[a]!; // desempate: mayor peso
    return a - b; // desempate final: menor índice
  });
  for (let k = 0; k < residuo; k++) {
    montos[orden[k]!]! += 1;
  }

  return montos.map((c) => money(c));
}

/**
 * Prorratea el `totalGastosCents` de un viaje entre los `items` de la compra según
 * `metodo`, devolviendo cada ítem con su `gastoProrrateadoCents` agregado. Preserva
 * los demás campos del ítem (genérico) para no acoplar core a un shape concreto.
 *
 * **Invariante innegociable**: Σ `gastoProrrateadoCents` === `totalGastosCents`
 * (ver `repartirProporcional`). Testeado con casos de propiedad.
 *
 * @throws {RangeError} si `totalGastosCents` no es entero ≥ 0, o si algún peso
 *   (costo o gramos según el método) es inválido, o si hay gastos > 0 sin ítems.
 */
export function prorratearGastos<T extends ItemProrrateable>(
  items: readonly T[],
  totalGastosCents: Money,
  metodo: MetodoProrrateo,
): Array<T & { readonly gastoProrrateadoCents: Money }> {
  const pesos = items.map((it) => (metodo === 'por_peso' ? (it.gramos ?? 0) : it.costoFacturaCents));
  const repartido = repartirProporcional(totalGastosCents, pesos);
  return items.map((it, i) => ({ ...it, gastoProrrateadoCents: repartido[i]! }));
}
