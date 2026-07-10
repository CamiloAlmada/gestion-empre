import {
  calcularTicketPromedio as ticketPromedioCents,
  type Money,
  type StatsCliente,
} from '@gestion/core';

/**
 * Estadísticas derivadas de `Cliente.stats` que la ficha del cliente calcula
 * al mostrar (doc 07, decisión 5): `stats` solo guarda los acumuladores que
 * `FieldValue.increment()` puede mantener offline (cantidad, total, fechas);
 * el promedio y "hace cuántos días" no se persisten porque un increment no
 * puede dividir ni recalcular una resta contra "ahora".
 *
 * Pura y sin Firebase: toma el `StatsCliente` ya leído por `useDoc` y devuelve
 * valores de UI. La aritmética de plata (el ticket promedio) vive en core
 * (regla de oro 1); acá queda solo el adapter que le pasa los campos de
 * `StatsCliente` y el cálculo de "días desde la última compra", que no es plata.
 */

/**
 * Ticket promedio de un cliente: adapta `StatsCliente` al helper de `Money` de
 * core (`calcularTicketPromedio`). `null` si el cliente todavía no tiene ventas.
 */
export function calcularTicketPromedio(stats: StatsCliente): Money | null {
  return ticketPromedioCents(stats.totalHistoricoCents, stats.cantidadVentas);
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Días enteros transcurridos entre `stats.ultimaCompra` y `ahora` (por
 * defecto, el momento de la llamada — parametrizado para tests
 * determinísticos). Redondea hacia abajo: comprar "hace 23 horas" cuenta como
 * "0 días". `null` si el cliente no registra ninguna compra todavía.
 *
 * También devuelve `null` con `cantidadVentas <= 0` aunque `ultimaCompra`
 * siga presente: `primeraCompra`/`ultimaCompra` son cache APROXIMADO que la
 * anulación no rebobina (doc 07 — `StatsCliente`, decisión documentada, NO
 * se toca esa fuente). Sin este blindaje, anular la única venta de un
 * cliente dejaría "0 ventas" pero "Última compra: hace N días" en la ficha —
 * números que no reconcilian a la vista. Mismo criterio que
 * `calcularTicketPromedio`, que ya devuelve `null` en ese caso.
 */
export function calcularDiasDesdeUltimaCompra(
  stats: StatsCliente,
  ahora: Date = new Date(),
): number | null {
  if (stats.cantidadVentas <= 0 || stats.ultimaCompra === undefined) return null;
  const diffMs = ahora.getTime() - stats.ultimaCompra.getTime();
  return Math.max(0, Math.floor(diffMs / MS_POR_DIA));
}
