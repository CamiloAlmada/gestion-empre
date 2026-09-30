import {
  formatearMoney,
  formatearPeso,
  type ItemVenta,
  type MedioPago,
  type MedioPagoReal,
} from '@gestion/core';

/** Etiquetas en español de `MedioPago`, para la cabecera del listado y el detalle. */
export const ETIQUETAS_MEDIO_PAGO: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  a_cobrar: 'A cobrar',
};

/** Los cuatro medios en los que se cobra de verdad (sin `a_cobrar`), en el orden del POS. */
export const MEDIOS_PAGO_REALES: readonly MedioPagoReal[] = [
  'efectivo',
  'debito',
  'credito',
  'transferencia',
];

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

/**
 * Resumen legible de los ítems de una venta, para el placeholder `{items}`
 * del mensaje de WhatsApp "Pedido listo" (doc 08, WA-C2): nombre + peso o
 * cantidad de cada ítem, separados por coma (p. ej. "Queso Colonia 500 g,
 * Miel 500g 2 unidades"). Reusa `textoCantidadItem` (mismo texto que ya
 * muestra la tabla/lista compacta del detalle) para no duplicar el
 * formateo de peso/unidades.
 */
export function textoResumenItems(items: ItemVenta[]): string {
  return items.map((item) => `${item.nombreProducto} ${textoCantidadItem(item)}`).join(', ');
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Fecha → valor de un `<input type="datetime-local">` (`aaaa-mm-ddTHH:mm`, hora
 * LOCAL, sin zona ni segundos).
 */
export function fechaAValorDatetimeLocal(fecha: Date): string {
  return (
    `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}` +
    `T${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
  );
}

/**
 * Valor de un `<input type="datetime-local">` → `Date` (hora local), o `null` si
 * está vacío o no tiene el formato `aaaa-mm-ddTHH:mm[:ss]`. Parseo manual: el
 * `new Date('aaaa-mm-ddTHH:mm')` de cada motor no es del todo homogéneo.
 */
export function valorDatetimeLocalAFecha(valor: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(valor);
  if (m === null) return null;
  const [anio, mes, dia, horas, minutos] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const fecha = new Date(anio, mes - 1, dia, horas, minutos);
  // `new Date` desborda en silencio (31/02 → 3/03): se descarta si no vuelve igual.
  if (fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return null;
  return fecha;
}
