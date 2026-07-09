import { money, redondearHalfUp, type Money, type StatsCliente } from '@gestion/core';

/**
 * Estadísticas derivadas de `Cliente.stats` que la ficha del cliente calcula
 * al mostrar (doc 07, decisión 5): `stats` solo guarda los acumuladores que
 * `FieldValue.increment()` puede mantener offline (cantidad, total, fechas);
 * el promedio y "hace cuántos días" no se persisten porque un increment no
 * puede dividir ni recalcular una resta contra "ahora".
 *
 * Pura y sin Firebase: toma el `StatsCliente` ya leído por `useDoc` y devuelve
 * valores de UI. Vive en la app (no en `packages/core`) porque la tarea CP-B
 * tiene prohibido tocar `core`/`firebase-kit` — ver nota en el reporte de la
 * tarea: idealmente `calcularTicketPromedio` sería un helper de `Money` más
 * en core, junto a `multiplicarMoney`.
 */

/**
 * Ticket promedio: `totalHistoricoCents / cantidadVentas`, redondeado
 * half-up con el mismo helper de core que usa `multiplicarMoney` (nunca se
 * inventa una regla de redondeo nueva acá). `null` si el cliente todavía no
 * tiene ventas — evita la división por cero en vez de propagar `NaN`/`Infinity`.
 */
export function calcularTicketPromedio(stats: StatsCliente): Money | null {
  if (stats.cantidadVentas <= 0) return null;
  return money(redondearHalfUp(stats.totalHistoricoCents / stats.cantidadVentas));
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Días enteros transcurridos entre `stats.ultimaCompra` y `ahora` (por
 * defecto, el momento de la llamada — parametrizado para tests
 * determinísticos). Redondea hacia abajo: comprar "hace 23 horas" cuenta como
 * "0 días". `null` si el cliente no registra ninguna compra todavía.
 */
export function calcularDiasDesdeUltimaCompra(
  stats: StatsCliente,
  ahora: Date = new Date(),
): number | null {
  if (stats.ultimaCompra === undefined) return null;
  const diffMs = ahora.getTime() - stats.ultimaCompra.getTime();
  return Math.max(0, Math.floor(diffMs / MS_POR_DIA));
}
