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

/** Espejo de `costeoADoc` en `converters/venta.ts` (Fase 3, congelado de costo). */
function costeoADoc(costeo) {
  const doc = { v: costeo.v, fuente: costeo.fuente, origen: costeo.origen };
  if (costeo.costoUnitCents !== undefined) doc.costoUnitCents = costeo.costoUnitCents;
  if (costeo.costoItemCents !== undefined) doc.costoItemCents = costeo.costoItemCents;
  if (costeo.compraId !== undefined) doc.compraId = costeo.compraId;
  return doc;
}

/** Espejo de `itemADoc` en `converters/venta.ts` (incluye `costeo`, Fase 3). */
function itemADoc(item) {
  const { productoId, nombreProducto, piezaId, gramos, unidades, precioUnitCents, subtotalCents } = item;
  const doc = { productoId, nombreProducto, precioUnitCents, subtotalCents };
  if (piezaId !== undefined) doc.piezaId = piezaId;
  if (gramos !== undefined) doc.gramos = gramos;
  if (unidades !== undefined) doc.unidades = unidades;
  if (item.costeo !== undefined) doc.costeo = costeoADoc(item.costeo);
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

// ════════════════════════════════════════════════════════════════════════════
// Reportes (Fase 3): espejos de productoConverter/proveedorConverter/
// categoriaConverter/compraConverter/piezaConverter/movimientoConverter.
// Mismo criterio que arriba: duplicado a mano para `firebase-admin`, con el
// test `mapeoAdmin.test.mjs` como red de seguridad byte a byte contra los
// converters REALES del SDK cliente.
// ════════════════════════════════════════════════════════════════════════════

/** Espejo de `productoConverter.toFirestore` en `converters/producto.ts`. */
export function productoADoc(producto) {
  const {
    nombre,
    categoria,
    modoPrecio,
    modoStock,
    precioVentaCents,
    costoPromedioCents,
    margenObjetivoBps,
    stockGranelGramos,
    stockUnidades,
    umbralAlertaStock,
    proveedorPrincipalId,
    activo,
    actualizadoEn,
  } = producto;
  const doc = { nombre, categoria, modoPrecio, modoStock, precioVentaCents, costoPromedioCents, activo, actualizadoEn };
  if (margenObjetivoBps !== undefined) doc.margenObjetivoBps = margenObjetivoBps;
  if (stockGranelGramos !== undefined) doc.stockGranelGramos = stockGranelGramos;
  if (stockUnidades !== undefined) doc.stockUnidades = stockUnidades;
  if (umbralAlertaStock !== undefined) doc.umbralAlertaStock = umbralAlertaStock;
  if (proveedorPrincipalId !== undefined) doc.proveedorPrincipalId = proveedorPrincipalId;
  return doc;
}

/** Espejo de `proveedorConverter.toFirestore` en `converters/proveedor.ts`. */
export function proveedorADoc(proveedor) {
  const { nombre, contactoNombre, telefono, email, direccion, rut, pagos, notas, fechaAlta, activo } =
    proveedor;
  const doc = { nombre, fechaAlta, activo };
  if (contactoNombre !== undefined) doc.contactoNombre = contactoNombre;
  if (telefono !== undefined) doc.telefono = telefono;
  if (email !== undefined) doc.email = email;
  if (direccion !== undefined) doc.direccion = direccion;
  if (rut !== undefined) doc.rut = rut;
  if (pagos !== undefined) doc.pagos = pagos;
  if (notas !== undefined) doc.notas = notas;
  return doc;
}

/** Espejo de `categoriaConverter.toFirestore` en `converters/categoria.ts`. */
export function categoriaADoc(categoria) {
  const { nombre, orden } = categoria;
  return { nombre, orden };
}

/** Espejo de `piezaADoc`/`piezaConverter.toFirestore` en `converters/compra.ts`
 * (detalle de pieza EMBEBIDO en un ítem de compra — no confundir con
 * `piezaADoc` de más abajo, el documento `piezas/{id}` top-level). */
function piezaCompraADoc(pz) {
  const doc = { pesoGramos: pz.pesoGramos };
  if (pz.fechaVencimiento !== undefined) doc.fechaVencimiento = pz.fechaVencimiento;
  return doc;
}

/** Espejo de `itemADoc` en `converters/compra.ts`. */
function itemCompraADoc(item) {
  const doc = {
    productoId: item.productoId,
    nombreProducto: item.nombreProducto,
    costoFacturaCents: item.costoFacturaCents,
  };
  if (item.gramos !== undefined) doc.gramos = item.gramos;
  if (item.unidades !== undefined) doc.unidades = item.unidades;
  if (item.piezas !== undefined) doc.piezas = item.piezas.map(piezaCompraADoc);
  if (item.gastoProrrateadoCents !== undefined) doc.gastoProrrateadoCents = item.gastoProrrateadoCents;
  if (item.costoRealCents !== undefined) doc.costoRealCents = item.costoRealCents;
  if (item.costoRealKgCents !== undefined) doc.costoRealKgCents = item.costoRealKgCents;
  return doc;
}

/** Espejo de `gastoADoc` en `converters/compra.ts`. */
function gastoADoc(gasto) {
  const doc = { concepto: gasto.concepto, montoCents: gasto.montoCents };
  if (gasto.descripcion !== undefined) doc.descripcion = gasto.descripcion;
  return doc;
}

/** Espejo de `compraConverter.toFirestore` en `converters/compra.ts`. */
export function compraADoc(compra) {
  const {
    fecha,
    usuarioId,
    estado,
    proveedorId,
    proveedorNombre,
    items,
    gastos,
    totalFacturaCents,
    totalGastosCents,
    totalRealCents,
  } = compra;
  const doc = {
    fecha,
    usuarioId,
    estado,
    proveedorNombre,
    items: items.map(itemCompraADoc),
    gastos: gastos.map(gastoADoc),
    totalFacturaCents,
    totalGastosCents,
    totalRealCents,
  };
  if (proveedorId !== undefined) doc.proveedorId = proveedorId;
  return doc;
}

/** Espejo de `piezaConverter.toFirestore` en `converters/pieza.ts` (documento
 * `piezas/{id}` top-level, distinto del detalle embebido en una compra). */
export function piezaADoc(pieza) {
  const { productoId, pesoInicialGramos, pesoRestanteGramos, costoKgCents, compraId, fechaIngreso, fechaVencimiento, estado } =
    pieza;
  const doc = { productoId, pesoInicialGramos, pesoRestanteGramos, costoKgCents, fechaIngreso, estado };
  if (compraId !== undefined) doc.compraId = compraId;
  if (fechaVencimiento !== undefined) doc.fechaVencimiento = fechaVencimiento;
  return doc;
}

/** Espejo de `movimientoConverter.toFirestore` en `converters/movimiento.ts`. */
export function movimientoADoc(movimiento) {
  const { tipo, productoId, piezaId, deltaGramos, deltaUnidades, origenTipo, origenId, usuarioId, fecha, nota } =
    movimiento;
  const doc = { tipo, productoId, origenTipo, origenId, usuarioId, fecha };
  if (piezaId !== undefined) doc.piezaId = piezaId;
  if (deltaGramos !== undefined) doc.deltaGramos = deltaGramos;
  if (deltaUnidades !== undefined) doc.deltaUnidades = deltaUnidades;
  if (nota !== undefined) doc.nota = nota;
  return doc;
}
