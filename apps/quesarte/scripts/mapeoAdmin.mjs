/**
 * Mapea `Cliente`/`Venta` (dominio) → la forma exacta de documento que persiste
 * Firestore, para escrituras con `firebase-admin` (Admin SDK, sin `withConverter`).
 *
 * Es un ESPEJO deliberado de `clienteConverter.toFirestore` / `ventaConverter.toFirestore`
 * de `@gestion/firebase-kit` (mismos campos, mismo criterio de omitir `undefined`
 * en vez de escribir `null` — ver esos converters). NO se importan esos converters
 * acá: están tipados para `firebase/firestore` (SDK cliente, `FirestoreDataConverter`
 * con `WithFieldValue`/`DocumentData` de esa librería) y este script corre con
 * `firebase-admin` (SDK servidor, sus propios tipos). Mezclar ambos SDKs en un
 * mismo módulo es más confuso que rehacer el mapeo puro (son ~15 líneas).
 *
 * La garantía de que este mapeo NO diverge del real la da el test
 * `mapeoAdmin.test.mjs`: compara, campo a campo, la salida de acá contra la
 * salida de los converters reales del kit (ejecutados con el SDK cliente en
 * jsdom, donde sí es seguro importarlos) para los mismos objetos de dominio. Si
 * un converter cambia de forma y este archivo no se actualiza, ese test rompe.
 */

/** Espejo de `statsADoc` en `converters/cliente.ts`. */
function statsADoc(stats) {
  const { cantidadVentas, totalHistoricoCents, primeraCompra, ultimaCompra } = stats;
  const doc = { cantidadVentas, totalHistoricoCents };
  if (primeraCompra !== undefined) doc.primeraCompra = primeraCompra;
  if (ultimaCompra !== undefined) doc.ultimaCompra = ultimaCompra;
  return doc;
}

/** Espejo de `clienteConverter.toFirestore` en `converters/cliente.ts`. */
export function clienteADoc(cliente) {
  const { nombre, alias, telefono, telefonoE164, email, direccion, notas, fechaAlta, activo, stats } =
    cliente;
  const doc = { nombre, fechaAlta, activo, stats: statsADoc(stats) };
  if (alias !== undefined) doc.alias = alias;
  if (telefono !== undefined) doc.telefono = telefono;
  if (telefonoE164 !== undefined) doc.telefonoE164 = telefonoE164;
  if (email !== undefined) doc.email = email;
  if (direccion !== undefined) doc.direccion = direccion;
  if (notas !== undefined) doc.notas = notas;
  return doc;
}

/** Espejo de `itemADoc` en `converters/venta.ts`. */
function itemADoc(item) {
  const { productoId, nombreProducto, piezaId, gramos, unidades, precioUnitCents, subtotalCents } = item;
  const doc = { productoId, nombreProducto, precioUnitCents, subtotalCents };
  if (piezaId !== undefined) doc.piezaId = piezaId;
  if (gramos !== undefined) doc.gramos = gramos;
  if (unidades !== undefined) doc.unidades = unidades;
  return doc;
}

/** Espejo de `ventaConverter.toFirestore` en `converters/venta.ts`. */
export function ventaADoc(venta) {
  const { numero, fecha, usuarioId, items, totalCents, medioPago, estado, clienteId, clienteNombre } =
    venta;
  const doc = {
    numero,
    fecha,
    usuarioId,
    items: items.map(itemADoc),
    totalCents,
    medioPago,
    estado,
  };
  if (clienteId !== undefined) doc.clienteId = clienteId;
  if (clienteNombre !== undefined) doc.clienteNombre = clienteNombre;
  return doc;
}
