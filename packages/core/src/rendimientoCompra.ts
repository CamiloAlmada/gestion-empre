import { BPS_TOTAL } from './margen.js';
import { costoCongeladoDe } from './costeo.js';
import { money, type Money } from './money.js';
import { peso, type Peso } from './peso.js';
import { redondearHalfUp } from './redondeo.js';
import { ventasVigentes } from './reporteVentas.js';
import type { Compra, Venta } from './tipos.js';

/**
 * Rendimiento de UNA compra confirmada (Fase 3, tanda B4, docs/PLAN-ACTIVO.md):
 * responde la pregunta de negocio más importante del módulo (doc
 * 03-compras-costos-precios.md:148-150) — "¿el último viaje se pagó solo?".
 * Compara cuánto costó el viaje (mercadería + gastos) contra cuánta ganancia
 * bruta YA generó la mercadería que se vendió, y deja igual de visible cuánta
 * mercadería todavía no se vendió: un viaje puede "no rendir todavía" solo
 * porque falta vender la mitad de lo que trajo, que no es lo mismo que un
 * viaje que rindió mal.
 *
 * **Límite de atribución (la regla central de este módulo, no negociable):**
 * la atribución EXACTA solo existe para los ítems de la compra controlados
 * por PIEZA (`ItemCompra.piezas` presente ⇒ `modoStock` `fraccionado_por_pieza`
 * / `pieza_entera`): cada pieza vendida congela `costeo.compraId` en el
 * instante de la venta (ver `costeo.ts`, `congelarCosteo`), así que se sabe
 * con certeza cuánto de ESA pieza se vendió y cuánta ganancia dejó.
 *
 * Para granel y unidad (`modoStock` `granel` / `unidad_simple`) NO hay lote:
 * el stock es un pool promediado por producto, sin ninguna señal —ni
 * siquiera FIFO— que diga "este gramo salió de esta compra en particular".
 * No hay forma honesta de estimarlo, así que esa porción queda EXCLUIDA de
 * `gananciaGeneradaCents` y de `porcentajeVendidoBps`, y su costo (conocido,
 * ya está en la compra) se reporta APARTE en `costoNoAtribuibleCents` — nunca
 * mezclado en silencio con la parte exacta.
 */
export interface RendimientoCompra {
  readonly compraId: string;
  /** Costo total del viaje: mercadería + gastos (`compra.totalRealCents`). Referencia fija, no cambia con lo que se vaya vendiendo. */
  readonly costoTotalCents: Money;
  /** Parte de `costoTotalCents` con atribución EXACTA (ítems por pieza). */
  readonly costoAtribuibleCents: Money;
  /**
   * Parte de `costoTotalCents` SIN atribución exacta (granel/unidad): costo
   * real conocido (ya está en la compra), pero mezclado en un pool con otras
   * compras del mismo producto — por eso no participa de `gananciaGeneradaCents`.
   */
  readonly costoNoAtribuibleCents: Money;
  /**
   * Ganancia bruta YA generada por la mercadería ATRIBUIBLE de esta compra
   * que se vendió (`subtotal − costo`, solo líneas de venta con
   * `costeo.compraId === compraId`, ventas vigentes — ver `ventasVigentes`).
   * NUNCA incluye granel/unidad: no hay forma honesta de saber si esas ventas
   * salieron de esta compra o de otra del mismo producto.
   */
  readonly gananciaGeneradaCents: Money;
  /** Peso total (gramos) de los ítems atribuibles (por pieza) de esta compra. `0` si la compra fue 100% granel/unidad. */
  readonly gramosAtribuiblesComprados: Peso;
  /** Peso (gramos) YA vendido de esos mismos ítems, atribuido con `compraId`. */
  readonly gramosAtribuiblesVendidos: Peso;
  /**
   * % vendido (bps, mismo idioma que `margen.ts`) de la porción atribuible:
   * `gramosAtribuiblesVendidos / gramosAtribuiblesComprados`. `null` cuando
   * `gramosAtribuiblesComprados === 0` (compra 100% granel/unidad): no hay
   * nada atribuible sobre lo que medir "cuánto se vendió" — mostrar `0%`
   * mentiría con precisión donde en realidad no hay dato que dar.
   */
  readonly porcentajeVendidoBps: number | null;
  /**
   * Diagnóstico de un vistazo (criterio del brief: una compra recién
   * confirmada, sin ventas todavía, no debe leerse como un viaje que
   * fracasó):
   * - `'sin_atribucion'`: la compra es 100% granel/unidad, no hay porción medible.
   * - `'sin_ventas'`: hay porción atribuible pero 0% se vendió todavía — "es pronto para juzgar", no "no rindió".
   * - `'en_curso'`: entre 0% y 100% vendido (exclusivo en ambos extremos).
   * - `'agotada'`: 100% de la porción atribuible ya se vendió.
   */
  readonly estado: 'sin_atribucion' | 'sin_ventas' | 'en_curso' | 'agotada';
}

/**
 * Calcula el rendimiento de una compra CONFIRMADA.
 *
 * Recibe `ventas` ya resueltas por el caller (misma arquitectura que
 * `reporteVentas.ts`: de dónde salen esas ventas es problema del hook, acá
 * solo se filtran las vigentes —`ventasVigentes`, único punto del proyecto—
 * y se atribuyen por `compraId`). En la práctica alcanza con las ventas con
 * `fecha >= compra.fecha` (no se puede vender antes de comprar): esta función
 * no le pone cota superior ni inferior a `ventas`, cualquier venta que no
 * pertenezca a esta compra simplemente no aporta (el filtro es por
 * `costeo.compraId`, no por fecha).
 *
 * @throws {RangeError} si `compra.estado !== 'confirmada'`: los montos de
 *   costo real (`ItemCompra.costoRealCents`) y el total del viaje
 *   (`totalRealCents`) solo existen en una compra confirmada — un borrador
 *   no tiene rendimiento que calcular todavía.
 */
export function calcularRendimientoCompra(
  compra: Compra,
  ventas: readonly Venta[],
): RendimientoCompra {
  if (compra.estado !== 'confirmada') {
    throw new RangeError(
      `calcularRendimientoCompra requiere una compra confirmada, recibió estado: '${compra.estado}'`,
    );
  }

  let costoAtribuible = 0;
  let costoNoAtribuible = 0;
  let gramosComprados = 0;

  for (const item of compra.items) {
    const costoReal = item.costoRealCents ?? 0;
    if (item.piezas !== undefined) {
      costoAtribuible += costoReal;
      gramosComprados += item.gramos ?? 0;
    } else {
      costoNoAtribuible += costoReal;
    }
  }

  let ganancia = 0;
  let gramosVendidos = 0;
  for (const venta of ventasVigentes(ventas)) {
    for (const item of venta.items) {
      if (item.costeo?.compraId !== compra.id) continue;
      const costo = costoCongeladoDe(item);
      // Defensivo: `compraId` solo se congela junto con montos (ver
      // `congelarCosteo`), así que `costo` no debería ser `null` acá — pero
      // no se asume, se descarta la línea en vez de sumar un costo inventado.
      if (costo === null) continue;
      ganancia += item.subtotalCents - costo;
      gramosVendidos += item.gramos ?? 0;
    }
  }

  const porcentajeVendidoBps =
    gramosComprados > 0 ? redondearHalfUp((gramosVendidos * BPS_TOTAL) / gramosComprados) : null;

  const estado: RendimientoCompra['estado'] =
    gramosComprados === 0
      ? 'sin_atribucion'
      : gramosVendidos <= 0
        ? 'sin_ventas'
        : gramosVendidos >= gramosComprados
          ? 'agotada'
          : 'en_curso';

  return {
    compraId: compra.id,
    costoTotalCents: money(compra.totalRealCents),
    costoAtribuibleCents: money(costoAtribuible),
    costoNoAtribuibleCents: money(costoNoAtribuible),
    gananciaGeneradaCents: money(ganancia),
    gramosAtribuiblesComprados: peso(gramosComprados),
    gramosAtribuiblesVendidos: peso(gramosVendidos),
    porcentajeVendidoBps,
    estado,
  };
}
