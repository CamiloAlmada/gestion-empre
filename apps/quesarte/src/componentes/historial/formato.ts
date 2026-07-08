import { formatearMoney, formatearPeso, type ItemVenta, type MedioPago } from '@gestion/core';

/** Etiquetas en español de `MedioPago`, para la cabecera del listado y el detalle. */
export const ETIQUETAS_MEDIO_PAGO: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
};

/**
 * Formatea una fecha como `dd/mm/aaaa HH:mm` (fecha Y hora, a diferencia de
 * `formatearFecha` de Stock que solo necesita el día). Manual, sin
 * `Intl.DateTimeFormat`, siguiendo el mismo criterio que `@gestion/core`
 * (output estable byte-a-byte entre entornos, sin depender de locale del SO).
 */
export function formatearFechaHora(fecha: Date): string {
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

/** Texto de "cantidad de ítems" para la fila de la lista, con plural correcto. */
export function textoCantidadItems(cantidad: number): string {
  return cantidad === 1 ? '1 ítem' : `${cantidad} ítems`;
}

/**
 * Peso o cantidad de un ítem de venta, ya vendido (`gramos`/`unidades` son
 * excluyentes, ver `ItemVenta`). El `—` es defensivo: un ítem persistido
 * siempre trae uno de los dos, pero el tipo los deja opcionales.
 */
export function textoCantidadItem(item: ItemVenta): string {
  if (item.gramos !== undefined) return formatearPeso(item.gramos);
  if (item.unidades !== undefined)
    return item.unidades === 1 ? '1 unidad' : `${item.unidades} unidades`;
  return '—';
}

/**
 * Precio unitario congelado del ítem con su sufijo (`/kg` o `/u`). El sufijo
 * se infiere de qué campo trae el ítem (gramos ⇒ se vendió al peso, unidades
 * ⇒ por unidad): `ItemVenta` no guarda `modoPrecio` porque es redundante con
 * esa distinción.
 */
export function textoPrecioUnitario(item: ItemVenta): string {
  const monto = formatearMoney(item.precioUnitCents);
  return item.gramos !== undefined ? `${monto} /kg` : `${monto} /u`;
}
