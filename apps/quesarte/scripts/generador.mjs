/**
 * Generador PURO de datos de demo (WA-D — doc 08, fidelización + WhatsApp).
 *
 * Construye objetos de dominio (`Cliente`, `Venta`) 100% en memoria, sin tocar
 * Firestore ni ningún módulo con side effects: recibe `ahora` como parámetro
 * (nunca lee el reloj) para ser determinista y testeable con Vitest, siguiendo
 * la regla de oro 1 del monorepo (la lógica de dominio vive en TypeScript puro).
 *
 * `seed-demo.mjs` (el shell con `firebase-admin`) es el ÚNICO lugar que escribe:
 * este módulo solo arma los objetos y los entrega listos para persistir con la
 * MISMA forma que producen los converters de `@gestion/firebase-kit`
 * (`clienteConverter`, `ventaConverter`), para que la demo sea indistinguible de
 * datos reales.
 *
 * Reutiliza `@gestion/core` en vez de reimplementar: `normalizarTelefono` para
 * derivar `telefonoE164` (igual que `crearCliente`), `calcularSubtotal` para los
 * montos de cada ítem (igual que hace la UI de venta) y `sumarMoney`/`money`/
 * `peso` para no hacer aritmética de plata/peso a mano.
 */

import {
  calcularSubtotal,
  congelarCosteo,
  elegirPieza,
  money,
  normalizarTelefono,
  peso,
  sumarMoney,
  sumarPeso,
} from '@gestion/core';
// Módulo puro de la propia app (sin React, sin Firebase — mismo criterio que
// `itemsCarrito.ts`): pliega `prorratearGastos`/`calcularCostoRealCents`/
// `calcularCostoRealKgCents`/`nuevoCostoPromedio` de `@gestion/core` EXACTAMENTE
// como lo hace `CompraPantalla.tsx` al confirmar una compra real. Se reusa tal
// cual (no se reimplementa la aritmética acá) para que el costo promedio
// resultante sea indistinguible del que dejaría una confirmación real.
import {
  calcularEfectosProducto,
  calcularItemsProrrateados,
} from '../src/componentes/compras/resumenCompra.ts';

/** Prefijo de TODOS los ids que este generador crea (clientes y ventas). */
export const PREFIJO_DEMO = 'demo-';

const MS_POR_DIA = 86_400_000;
const CODIGO_PAIS_DEFAULT = '598';
/** Vendedor sintético: no referencia un usuario real (doc 07, fallback a uid corto). */
const USUARIO_ID_SEED = 'demo-usuario-seed';

const MEDIOS_PAGO = ['efectivo', 'debito', 'credito', 'transferencia'];

/** Catálogo mínimo de productos verosímiles de quesería para armar los tickets. */
const CATALOGO = {
  quesoColonia: {
    productoId: 'demo-prod-queso-colonia',
    nombre: 'Queso Colonia',
    modo: 'por_kg',
    precioCents: money(68000), // $ 680/kg
  },
  quesoParmesano: {
    productoId: 'demo-prod-queso-parmesano',
    nombre: 'Queso Parmesano',
    modo: 'por_kg',
    precioCents: money(120000), // $ 1.200/kg
  },
  quesoFresco: {
    productoId: 'demo-prod-queso-fresco',
    nombre: 'Queso Fresco',
    modo: 'por_kg',
    precioCents: money(55000), // $ 550/kg
  },
  salame: {
    productoId: 'demo-prod-salame-colonia',
    nombre: 'Salame Colonia',
    modo: 'por_unidad',
    precioCents: money(45000), // $ 450 c/u
  },
  miel: {
    productoId: 'demo-prod-miel',
    nombre: 'Miel',
    modo: 'por_unidad',
    precioCents: money(28000), // $ 280 c/u
  },
  nueces: {
    productoId: 'demo-prod-nueces',
    nombre: 'Nueces',
    modo: 'por_kg',
    precioCents: money(90000), // $ 900/kg
  },
};

/** Arma un `ItemVenta` al peso (gramos), con `subtotalCents` vía `calcularSubtotal`. */
function itemPorKg(entradaCatalogo, gramos) {
  const g = peso(gramos);
  const subtotalCents = calcularSubtotal({
    modoPrecio: 'por_kg',
    precioKgCents: entradaCatalogo.precioCents,
    gramos: g,
  });
  return {
    productoId: entradaCatalogo.productoId,
    nombreProducto: entradaCatalogo.nombre,
    gramos: g,
    precioUnitCents: entradaCatalogo.precioCents,
    subtotalCents,
  };
}

/** Arma un `ItemVenta` por unidad, con `subtotalCents` vía `calcularSubtotal`. */
function itemPorUnidad(entradaCatalogo, unidades) {
  const subtotalCents = calcularSubtotal({
    modoPrecio: 'por_unidad',
    precioUnitCents: entradaCatalogo.precioCents,
    unidades,
  });
  return {
    productoId: entradaCatalogo.productoId,
    nombreProducto: entradaCatalogo.nombre,
    unidades,
    precioUnitCents: entradaCatalogo.precioCents,
    subtotalCents,
  };
}

/**
 * "Cestas" (canastos) típicos de mostrador, ordenados de más chico a más grande.
 * Cada uno es una lista de ítems ya armados con `itemPorKg`/`itemPorUnidad`.
 */
const CESTAS = [
  () => [itemPorKg(CATALOGO.quesoFresco, 800), itemPorKg(CATALOGO.nueces, 200)],
  () => [itemPorKg(CATALOGO.quesoParmesano, 300), itemPorUnidad(CATALOGO.miel, 1)],
  () => [itemPorKg(CATALOGO.quesoColonia, 500), itemPorUnidad(CATALOGO.salame, 1)],
  () => [itemPorUnidad(CATALOGO.miel, 2), itemPorKg(CATALOGO.nueces, 300)],
  () => [
    itemPorKg(CATALOGO.quesoColonia, 1000),
    itemPorKg(CATALOGO.quesoParmesano, 200),
    itemPorUnidad(CATALOGO.salame, 1),
  ],
];

/** `ahora` menos `dias` días completos, preservando hora/minutos de `ahora`. */
function haceDias(ahora, dias) {
  return new Date(ahora.getTime() - dias * MS_POR_DIA);
}

/**
 * Arma UNA venta completa (shape de `Venta`, ver converter de `@gestion/firebase-kit`)
 * ya asociada a un cliente: `clienteId`/`clienteNombre` denormalizados, `estado`
 * `'completada'`.
 *
 * `numero` queda en `0` acá a propósito: es un placeholder. `construirDatosDemo`
 * lo reasigna en una segunda pasada, GLOBAL a las 6 clientes (no por cliente) y en
 * orden cronológico por `fecha` — ver el comentario grande sobre `numero` en esa
 * función para el porqué (spoiler: NO es lo mismo que hace `registrarVenta` hoy, a
 * propósito).
 *
 * NO registra efectos de stock ni `movimientos/`: el seed de demo solo necesita el
 * historial de ventas y sus stats de cliente (doc 08), no tocar inventario real.
 */
function crearVenta({ id, clienteId, clienteNombre, fecha, cestaIndice, medioPagoIndice }) {
  const items = CESTAS[cestaIndice % CESTAS.length]();
  const totalCents = sumarMoney(...items.map((item) => item.subtotalCents));
  return {
    id,
    numero: 0, // placeholder — ver comentario arriba, `construirDatosDemo` lo reasigna.
    fecha,
    usuarioId: USUARIO_ID_SEED,
    items,
    totalCents,
    medioPago: MEDIOS_PAGO[medioPagoIndice % MEDIOS_PAGO.length],
    estado: 'completada',
    clienteId,
    clienteNombre,
  };
}

/**
 * Calcula el `StatsCliente` EXACTAMENTE coherente con un array de ventas del
 * cliente (misma fuente de verdad que documenta doc 07): cuenta, suma exacta con
 * `sumarMoney`, y `primeraCompra`/`ultimaCompra` como mín/máx de `fecha`.
 *
 * @throws {RangeError} si `ventas` está vacío (un cliente demo siempre tiene
 *   al menos una compra; si esto dispara, hay un error de programación en el
 *   armado del cliente).
 */
export function statsDesdeVentas(ventas) {
  if (ventas.length === 0) {
    throw new RangeError('statsDesdeVentas requiere al menos una venta.');
  }
  const fechas = ventas.map((v) => v.fecha.getTime());
  return {
    cantidadVentas: ventas.length,
    totalHistoricoCents: sumarMoney(...ventas.map((v) => v.totalCents)),
    primeraCompra: new Date(Math.min(...fechas)),
    ultimaCompra: new Date(Math.max(...fechas)),
  };
}

/**
 * Deriva `telefono`/`telefonoE164` de un teléfono display, igual que `crearCliente`
 * (doc 08): normalizable → dígitos E.164; ausente o no normalizable → `telefonoE164`
 * se omite (`undefined`), replicando el comportamiento real de la app.
 */
function contactoTelefono(telefonoDisplay) {
  if (telefonoDisplay === undefined) return {};
  const telefonoE164 = normalizarTelefono(telefonoDisplay, CODIGO_PAIS_DEFAULT) ?? undefined;
  return telefonoE164 !== undefined
    ? { telefono: telefonoDisplay, telefonoE164 }
    : { telefono: telefonoDisplay };
}

/**
 * Arma un cliente demo completo (shape de `Cliente`) + sus ventas, a partir de una
 * lista de "días atrás" (una entrada por compra, la posición determina la cesta y
 * el medio de pago para variar el ticket). `fechaAlta` se fija el día anterior a la
 * primera compra (un cliente existe antes de comprar).
 */
function crearClienteConVentas({ slug, nombre, alias, telefonoDisplay, diasAtras, ahora }) {
  const clienteId = `${PREFIJO_DEMO}cliente-${slug}`;

  const ventas = diasAtras.map((dias, indice) =>
    crearVenta({
      id: `${PREFIJO_DEMO}venta-${slug}-${indice + 1}`,
      clienteId,
      clienteNombre: nombre,
      fecha: haceDias(ahora, dias),
      cestaIndice: indice,
      medioPagoIndice: indice,
    }),
  );

  const stats = statsDesdeVentas(ventas);
  const cliente = {
    id: clienteId,
    nombre,
    ...(alias !== undefined ? { alias } : {}),
    ...contactoTelefono(telefonoDisplay),
    fechaAlta: haceDias(ahora, Math.max(...diasAtras) + 1),
    activo: true,
    stats,
  };

  return { cliente, ventas };
}

/**
 * Construye el dataset completo de demo (6 clientes + sus ventas históricas),
 * relativo a `ahora` (doc 08: "sirve la demo cualquier día que se corra").
 *
 * Los 6 casos (ver WA-D):
 * 1. Frecuente activo: 9 compras, ritmo ~7 días, última hace 3 días.
 * 2. Frecuente INACTIVO por ritmo propio: 6 compras, ritmo ~7 días, última hace
 *    30 días (30 > 2×7=14 → inactivo). Total alto: debe liderar la lista de
 *    inactivos.
 * 3. Ocasional INACTIVO por umbral global: 2 compras (<3 → umbral 30), última
 *    hace 45 días (45 > 30 → inactivo). Total bajo: va después del cliente 2.
 * 4. Nuevo activo: 1 compra hace 5 días (<30 → activo).
 * 5. Sin teléfono: 3 compras recientes, sin campo `telefono`.
 * 6. Teléfono no normalizable: 1 compra reciente, `telefono: 'consultar en
 *    mostrador'` (no deriva `telefonoE164`).
 *
 * ## `numero` de venta (hallazgo del review de WA-D, corregido en WA-F3)
 *
 * `Venta.numero` está documentado en `packages/core/src/tipos.ts` como "Número
 * correlativo de comprobante, legible por humanos". La implementación real,
 * `registrarVenta` (`packages/firebase-kit/src/ventas.ts`), NO honra eso: usa
 * `ahora.getTime()` (epoch en milisegundos, 13 dígitos) y no existe ningún doc
 * "contador" en Firestore que lleve una secuencia — se verificó que no hay tal
 * patrón en `firebase-kit` ni en `firestore.rules`. Es decir, HOY, una venta real
 * en producción también muestra "Venta #1752332400000" en el historial: es una
 * divergencia preexistente entre el modelo documentado y la implementación, y
 * queda FUERA de alcance acá (esta tarea no toca `registrarVenta`) — anotado como
 * nota para el tech lead, no corregido en este módulo.
 *
 * Lo que SÍ hace este generador, a propósito, es NO copiar ese patrón para la
 * demo: mostrarle al dueño "Venta #1752332400000" en vivo sería un artefacto feo
 * y injustificable (no hay ninguna razón de negocio para que la demo lo tenga,
 * aun si la app real hoy lo tiene). En cambio, numera las ventas 1..N con un
 * correlativo chico y GLOBAL a los 6 clientes (no reiniciado por cliente), en
 * orden CRONOLÓGICO por `fecha` — así los números crecen junto con las fechas,
 * como se espera de un comprobante real. Al no haber contador real que la app
 * incremente, no hay ningún estado compartido con el que este rango 1..N (chico,
 * de un solo dígito o dos) pueda colisionar: la próxima venta real en dev seguirá
 * usando un timestamp de 13 dígitos hasta que se resuelva el hallazgo de arriba.
 *
 * @param {Date} ahora instante de referencia (lo decide el caller; este módulo
 *   nunca lee el reloj).
 */
export function construirDatosDemo(ahora) {
  const definiciones = [
    {
      slug: '01-frecuente-activo',
      nombre: 'Marta Etchandy',
      alias: 'Marta la de la esquina',
      telefonoDisplay: '099 123 456',
      diasAtras: [3, 10, 17, 24, 31, 38, 45, 52, 59],
    },
    {
      slug: '02-inactivo-ritmo-propio',
      nombre: 'Rodrigo Ferreira',
      telefonoDisplay: '+598 98 765 432',
      diasAtras: [30, 37, 44, 51, 58, 65],
    },
    {
      slug: '03-inactivo-umbral-global',
      nombre: 'Lucía Bentancor',
      telefonoDisplay: '098 234 567',
      diasAtras: [45, 70],
    },
    {
      slug: '04-nuevo-activo',
      nombre: 'Ignacio Silveira',
      telefonoDisplay: '099 876 543',
      diasAtras: [5],
    },
    {
      slug: '05-sin-telefono',
      nombre: 'Valentina Correa',
      diasAtras: [2, 9, 16],
    },
    {
      slug: '06-telefono-no-normalizable',
      nombre: 'Pedro Machado',
      telefonoDisplay: 'consultar en mostrador',
      diasAtras: [4],
    },
  ];

  const clientes = [];
  const ventasSinNumerar = [];
  for (const def of definiciones) {
    const { cliente, ventas: ventasCliente } = crearClienteConVentas({ ...def, ahora });
    clientes.push(cliente);
    ventasSinNumerar.push(...ventasCliente);
  }

  // Numeración GLOBAL y cronológica (ver el comentario grande de esta función):
  // se ordena por `fecha` ascendente y se asigna 1..N, reemplazando el `numero: 0`
  // placeholder de `crearVenta`. El array devuelto queda en ESE orden (cronológico
  // global), no en el orden en que se armó por cliente.
  const ventas = [...ventasSinNumerar]
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .map((venta, indice) => ({ ...venta, numero: indice + 1 }));

  return { clientes, ventas };
}

// ════════════════════════════════════════════════════════════════════════════
// Reportes (Fase 3): catálogo + compras (con costo real) + ventas (con costeo
// congelado) + ajustes/merma + una anulación, a lo largo de varios meses.
//
// Extiende el mismo generador PURO de arriba (WA-D): nunca lee el reloj (recibe
// `ahora`), nunca importa Firebase, y usa el MISMO prefijo `demo-` para que
// `seed-demo.mjs` pueda barrer/limpiar todas las colecciones con un solo
// criterio (`id.startsWith(PREFIJO_DEMO)`).
//
// Por qué el costo promedio y el prorrateo se calculan con las funciones REALES
// de `@gestion/core` (`calcularItemsProrrateados`/`calcularEfectosProducto`,
// reexportadas desde `src/componentes/compras/resumenCompra.ts`, el módulo puro
// que usa `CompraPantalla.tsx` para confirmar una compra real): así el costo
// promedio resultante es BYTE A BYTE el que dejaría una confirmación real, sin
// reimplementar esa aritmética acá (regla dura del proyecto).
//
// Por qué el `costeo` de cada `ItemVenta` se arma con `congelarCosteo` (mismo
// `@gestion/core` que usa `resolverEfectoVenta` en `packages/firebase-kit/src/
// ventas.ts`): es la ÚNICA función que decide `fuente`/`origen`/montos, y es la
// que hace que Orégano (nunca comprado por Compras) nazca `sin_costo` en vez de
// declarar un 0 congelado que mentiría 100% de ganancia.
// ════════════════════════════════════════════════════════════════════════════

/** PRNG determinista (mulberry32): misma semilla ⇒ misma secuencia siempre. */
function crearRng(semilla) {
  let estado = semilla >>> 0;
  return function rng() {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `ahora` menos `dias` días, con la hora/minuto fijados (por defecto mediodía). */
function fechaEvento(ahora, dias, hora = 12, minuto = 0) {
  const fecha = haceDias(ahora, dias);
  fecha.setHours(hora, minuto, 0, 0);
  return fecha;
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

const CATEGORIAS_REPORTES = [
  { slug: 'quesos', nombre: 'Quesos', orden: 0 },
  { slug: 'embutidos', nombre: 'Embutidos', orden: 1 },
  { slug: 'miel-dulces', nombre: 'Miel y dulces', orden: 2 },
  { slug: 'frutos-secos', nombre: 'Frutos secos', orden: 3 },
  { slug: 'especias', nombre: 'Especias', orden: 4 },
];

const PROVEEDORES_REPORTES = [
  {
    slug: 'san-isidro',
    nombre: 'Quesería San Isidro',
    contactoNombre: 'Susana Ibarra',
    telefono: '099 111 222',
    direccion: 'Ruta 5 km 120, San Isidro',
  },
  {
    slug: 'almacen-norte',
    nombre: 'Almacén del Norte',
    contactoNombre: 'Jorge Pintos',
    telefono: '099 333 444',
    direccion: 'Camino a la costa, Salto',
  },
];

/**
 * Catálogo mínimo de la demo de Reportes: cubre los 4 `modoStock` y los 4 casos
 * borde pedidos por la tarea (`casoBorde`, solo informativo para los tests — no
 * se persiste). Precios/costos son SUPUESTOS de negocio (ver README) fáciles de
 * corregir si no se parecen a la operación real.
 */
export const PRODUCTOS_REPORTES = [
  {
    slug: 'queso-colonia',
    nombre: 'Queso Colonia',
    categoriaSlug: 'quesos',
    modoPrecio: 'por_kg',
    modoStock: 'fraccionado_por_pieza',
    precioVentaCents: money(65000),
    proveedorSlug: 'san-isidro',
  },
  {
    slug: 'parmesano-reserva',
    nombre: 'Queso Parmesano Reserva Especial Añejado Doce Meses',
    categoriaSlug: 'quesos',
    modoPrecio: 'por_kg',
    modoStock: 'fraccionado_por_pieza',
    precioVentaCents: money(140000),
    proveedorSlug: 'san-isidro',
    casoBorde: 'nombre-largo',
  },
  {
    slug: 'queso-fresco',
    nombre: 'Queso Fresco',
    categoriaSlug: 'quesos',
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(48000),
    umbralAlertaStock: peso(3000),
    proveedorSlug: 'almacen-norte',
    casoBorde: 'alto-volumen-bajo-margen',
  },
  {
    slug: 'miel',
    nombre: 'Miel',
    categoriaSlug: 'miel-dulces',
    modoPrecio: 'por_unidad',
    modoStock: 'unidad_simple',
    precioVentaCents: money(32000),
    umbralAlertaStock: 6,
    proveedorSlug: 'almacen-norte',
    casoBorde: 'bajo-volumen-alto-margen',
  },
  {
    slug: 'salame-colonia',
    nombre: 'Salame Colonia',
    categoriaSlug: 'embutidos',
    modoPrecio: 'por_kg',
    modoStock: 'pieza_entera',
    precioVentaCents: money(60000),
    proveedorSlug: 'san-isidro',
  },
  {
    slug: 'nueces',
    nombre: 'Nueces',
    categoriaSlug: 'frutos-secos',
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(95000),
    umbralAlertaStock: peso(2000),
    proveedorSlug: 'almacen-norte',
  },
  {
    slug: 'membrillo',
    nombre: 'Dulce de Membrillo',
    categoriaSlug: 'miel-dulces',
    modoPrecio: 'por_unidad',
    modoStock: 'unidad_simple',
    precioVentaCents: money(38000),
    umbralAlertaStock: 5,
    proveedorSlug: 'almacen-norte',
  },
  {
    slug: 'oregano',
    nombre: 'Orégano',
    categoriaSlug: 'especias',
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(60000),
    umbralAlertaStock: peso(500),
    proveedorSlug: undefined, // nunca entra por Compras (ver AJUSTES_REPORTES): a propósito, es el caso "sin costo conocido".
    casoBorde: 'sin-costo-conocido',
  },
];

/** Costo de factura (ANTES de gastos) por kg o por unidad, en centésimos. Múltiplo
 * de 1000 en los ítems al peso a propósito: `tarifa * gramos / 1000` da un entero
 * exacto para cualquier `gramos`, sin necesitar redondeo (`money()` exige entero). */
const TARIFA_FACTURA = {
  'queso-colonia': 41000,
  'parmesano-reserva': 95000,
  'queso-fresco': 43000,
  'salame-colonia': 38000,
  nueces: 70000,
  miel: 12000,
  membrillo: 22000,
};

// ── Compras (viajes, cada ~3 semanas a lo largo de ~4 meses) ────────────────

const COMPRAS_REPORTES = [
  {
    slug: 'viaje-01',
    diasAtras: 118,
    proveedorSlug: 'san-isidro',
    items: [
      { productoSlug: 'queso-colonia', piezasGramos: [4000, 4200, 3800] },
      { productoSlug: 'parmesano-reserva', piezasGramos: [7000, 7500] },
      { productoSlug: 'salame-colonia', piezasGramos: [900, 1000, 850, 950, 1050, 900] },
    ],
    gastos: [
      { concepto: 'flete', montoCents: money(180000) },
      { concepto: 'combustible', montoCents: money(90000) },
    ],
  },
  {
    slug: 'viaje-02',
    diasAtras: 97,
    proveedorSlug: 'almacen-norte',
    items: [
      { productoSlug: 'queso-fresco', gramos: 20000 },
      { productoSlug: 'nueces', gramos: 10000 },
      { productoSlug: 'miel', unidades: 24 },
      { productoSlug: 'membrillo', unidades: 20 },
    ],
    gastos: [
      { concepto: 'flete', montoCents: money(120000) },
      { concepto: 'combustible', montoCents: money(70000) },
      { concepto: 'peaje', montoCents: money(15000) },
    ],
  },
  {
    slug: 'viaje-03',
    diasAtras: 76,
    proveedorSlug: 'san-isidro',
    items: [
      { productoSlug: 'queso-colonia', piezasGramos: [4100, 3900, 4300] },
      { productoSlug: 'salame-colonia', piezasGramos: [950, 1000, 880, 920, 1020] },
    ],
    gastos: [
      { concepto: 'flete', montoCents: money(190000) },
      { concepto: 'combustible', montoCents: money(95000) },
    ],
  },
  {
    slug: 'viaje-04',
    diasAtras: 55,
    proveedorSlug: 'almacen-norte',
    items: [
      { productoSlug: 'queso-fresco', gramos: 21000 },
      { productoSlug: 'nueces', gramos: 9000 },
      { productoSlug: 'miel', unidades: 18 },
      { productoSlug: 'membrillo', unidades: 22 },
    ],
    gastos: [
      { concepto: 'flete', montoCents: money(125000) },
      { concepto: 'combustible', montoCents: money(72000) },
    ],
  },
  {
    slug: 'viaje-05',
    diasAtras: 34,
    proveedorSlug: 'san-isidro',
    items: [
      { productoSlug: 'queso-colonia', piezasGramos: [4000, 4400, 3700, 4100] },
      { productoSlug: 'parmesano-reserva', piezasGramos: [7200, 6800] },
      { productoSlug: 'salame-colonia', piezasGramos: [900, 950, 1000, 880, 930, 1050] },
    ],
    gastos: [
      { concepto: 'flete', montoCents: money(200000) },
      { concepto: 'combustible', montoCents: money(100000) },
      { concepto: 'peaje', montoCents: money(15000) },
    ],
  },
  {
    slug: 'viaje-06',
    diasAtras: 13,
    proveedorSlug: 'almacen-norte',
    items: [
      { productoSlug: 'queso-fresco', gramos: 19000 },
      { productoSlug: 'nueces', gramos: 11000 },
      { productoSlug: 'miel', unidades: 20 },
      { productoSlug: 'membrillo', unidades: 18 },
    ],
    gastos: [
      { concepto: 'flete', montoCents: money(130000) },
      { concepto: 'combustible', montoCents: money(75000) },
    ],
  },
];

// ── Ajustes y merma (ocasionales, incluye el alta de Orégano SIN compra) ────

const AJUSTES_REPORTES = [
  {
    productoSlug: 'oregano',
    diasAtras: 110,
    tipo: 'ajuste_positivo',
    deltaGramos: 6000,
    nota: 'Carga inicial de stock (compra directa al productor, sin proveedor asociado)',
  },
  {
    productoSlug: 'oregano',
    diasAtras: 40,
    tipo: 'ajuste_positivo',
    deltaGramos: 4000,
    nota: 'Reposición de stock (mismo origen, sin proveedor asociado)',
  },
  {
    productoSlug: 'queso-fresco',
    diasAtras: 90,
    tipo: 'merma',
    deltaGramos: -700,
    nota: 'Merma: una porción de queso fresco se venció en la cámara',
  },
  {
    productoSlug: 'queso-colonia',
    diasAtras: 60,
    tipo: 'merma',
    deltaGramos: -400,
    requierePieza: true,
    nota: 'Merma: se descartó un trozo con hongo',
  },
  {
    productoSlug: 'nueces',
    diasAtras: 45,
    tipo: 'ajuste_negativo',
    deltaGramos: -300,
    nota: 'Corrección de conteo de stock',
  },
  {
    productoSlug: 'miel',
    diasAtras: 20,
    tipo: 'ajuste_negativo',
    deltaUnidades: -1,
    nota: 'Rotura de un frasco',
  },
];

// ── Clientes de la demo de reportes (además de los 6 de WA-D) ───────────────

const CLIENTES_REPORTES = [
  { slug: 'marcelo', nombre: 'Marcelo Bentos' },
  { slug: 'estela', nombre: 'Estela Píriz' },
];

// ── Ventas: distribución procedural verosímil (más peso fin de semana/feria) ─

const DIAS_HISTORIA_VENTAS = 116;
/** Picos de feria: días sueltos con volumen extra, más allá del patrón semanal. */
const DIAS_FERIA = new Set([100, 30]);
/** Clave interna de la ÚNICA venta que el generador anula (ver `procesarAnulacion`). */
const CLAVE_VENTA_ANULAR = 'anular-especial';

const PERFIL_VENTA = {
  'queso-colonia': { peso: 3.0, rango: [200, 900] },
  'parmesano-reserva': { peso: 0.5, rango: [150, 400] },
  'queso-fresco': { peso: 5.0, rango: [200, 700] },
  miel: { peso: 0.5, rango: [1, 2] },
  'salame-colonia': { peso: 1.4, rango: null }, // pieza_entera: se vende la pieza completa
  nueces: { peso: 1.2, rango: [150, 500] },
  membrillo: { peso: 1.0, rango: [1, 2] },
  oregano: { peso: 0.9, rango: [50, 200] },
};
const PRODUCTOS_SLUGS_VENTA = Object.keys(PERFIL_VENTA);
const PESO_TOTAL_VENTA = PRODUCTOS_SLUGS_VENTA.reduce((acc, s) => acc + PERFIL_VENTA[s].peso, 0);

const MEDIOS_PAGO_VENTA = ['efectivo', 'debito', 'credito', 'transferencia'];
const PESOS_MEDIO_PAGO = [0.45, 0.25, 0.15, 0.15];

/** Peso relativo del día (fin de semana y feria pesan más que un día de semana). */
function pesoDelDia(fecha, diasAtras) {
  if (DIAS_FERIA.has(diasAtras)) return 3.4;
  const diaSemana = fecha.getDay(); // 0 domingo .. 6 sábado
  if (diaSemana === 6) return 2.2;
  if (diaSemana === 5) return 1.5;
  if (diaSemana === 0) return 0.5;
  return 1.0;
}

function elegirProductoSlugVenta(rng) {
  let r = rng() * PESO_TOTAL_VENTA;
  for (const slug of PRODUCTOS_SLUGS_VENTA) {
    r -= PERFIL_VENTA[slug].peso;
    if (r <= 0) return slug;
  }
  return PRODUCTOS_SLUGS_VENTA[PRODUCTOS_SLUGS_VENTA.length - 1];
}

function cantidadDeseadaVenta(slug, rng) {
  const { rango } = PERFIL_VENTA[slug];
  if (rango === null) return 1; // pieza_entera: valor nominal, no se usa (se vende la pieza entera)
  const [min, max] = rango;
  return Math.round(min + rng() * (max - min));
}

function elegirMedioPago(rng) {
  const r = rng();
  let acumulado = 0;
  for (let i = 0; i < MEDIOS_PAGO_VENTA.length; i++) {
    acumulado += PESOS_MEDIO_PAGO[i];
    if (r <= acumulado) return MEDIOS_PAGO_VENTA[i];
  }
  return MEDIOS_PAGO_VENTA[MEDIOS_PAGO_VENTA.length - 1];
}

/** 1 a 3 ítems de productos distintos, elegidos con el perfil de popularidad. */
function construirItemsAleatorios(rng) {
  const nItems = 1 + Math.floor(rng() * 3);
  const items = [];
  const usados = new Set();
  for (let i = 0; i < nItems; i++) {
    const slug = elegirProductoSlugVenta(rng);
    if (usados.has(slug)) continue;
    usados.add(slug);
    items.push({ productoSlug: slug });
  }
  return items;
}

/** Arma los eventos de venta: uno por día activo del período + la venta especial
 * reservada para anular (ver `CLAVE_VENTA_ANULAR`). Sin fecha resuelta todavía
 * (la agrega `construirDatosReportes` junto con compras/ajustes, antes de
 * ordenar todo el timeline). */
function construirEventosVenta(ahora, rng) {
  const eventos = [];
  for (let diasAtras = DIAS_HISTORIA_VENTAS; diasAtras >= 1; diasAtras--) {
    const fechaBase = fechaEvento(ahora, diasAtras);
    const pesoDia = pesoDelDia(fechaBase, diasAtras);
    const n = Math.max(0, Math.round(pesoDia * 1.3 + (rng() - 0.5)));
    for (let i = 0; i < n; i++) {
      const hora = 9 + Math.floor(rng() * 10); // 9..18
      const minuto = Math.floor(rng() * 60);
      eventos.push({ tipo: 'venta', diasAtras, hora, minuto, generada: true });
    }
  }
  // Venta especial, simple a propósito (un solo ítem granel): es la que anula
  // `construirDatosReportes` para que "al menos una venta anulada" no dependa
  // de qué haya tocado generar al azar.
  eventos.push({
    tipo: 'venta',
    diasAtras: 60,
    hora: 11,
    minuto: 15,
    clave: CLAVE_VENTA_ANULAR,
    itemsForzados: [{ productoSlug: 'queso-fresco', gramos: 500 }],
    medioPagoForzado: 'efectivo',
  });
  return eventos;
}

// ── Movimientos ──────────────────────────────────────────────────────────────

/** Crea un `MovimientoStock` con id correlativo (`estado.movContador`). Sin
 * `origenId` explícito, apunta a su PROPIO id (mismo criterio que `ajustarStock`/
 * `ingresarPiezas` en `firebase-kit/stock.ts`: el movimiento ES el registro). */
function crearMovimiento(estado, datos) {
  estado.movContador += 1;
  const id = `${PREFIJO_DEMO}mov-${estado.movContador}`;
  const mov = {
    id,
    tipo: datos.tipo,
    productoId: datos.productoId,
    usuarioId: USUARIO_ID_SEED,
    origenTipo: datos.origenTipo,
    origenId: datos.origenId ?? id,
    fecha: datos.fecha,
  };
  if (datos.piezaId !== undefined) mov.piezaId = datos.piezaId;
  if (datos.deltaGramos !== undefined) mov.deltaGramos = datos.deltaGramos;
  if (datos.deltaUnidades !== undefined) mov.deltaUnidades = datos.deltaUnidades;
  if (datos.nota !== undefined) mov.nota = datos.nota;
  return mov;
}

// ── Compras: prorrateo + costo real + costo promedio (vía `resumenCompra.ts`) ─

function procesarCompra(def, estado, productosPorSlug, proveedorIdPorSlug, fecha) {
  const proveedorId = proveedorIdPorSlug.get(def.proveedorSlug);
  const proveedorNombre = PROVEEDORES_REPORTES.find((p) => p.slug === def.proveedorSlug).nombre;
  const compraId = `${PREFIJO_DEMO}compra-${def.slug}`;

  const itemsForm = def.items.map((it) => {
    const productoId = productosPorSlug.get(it.productoSlug);
    const producto = estado.productos.get(productoId);
    const tarifa = TARIFA_FACTURA[it.productoSlug];
    const base = { productoId, nombreProducto: producto.nombre, modoStock: producto.modoStock };

    if (it.piezasGramos !== undefined) {
      const piezas = it.piezasGramos.map((g) => ({ pesoGramos: peso(g) }));
      const gramos = sumarPeso(...piezas.map((p) => p.pesoGramos));
      return { ...base, piezas, gramos, costoFacturaCents: money((tarifa * gramos) / 1000) };
    }
    if (it.gramos !== undefined) {
      const gramos = peso(it.gramos);
      return { ...base, gramos, costoFacturaCents: money((tarifa * gramos) / 1000) };
    }
    return { ...base, unidades: it.unidades, costoFacturaCents: money(tarifa * it.unidades) };
  });

  const totalGastosCents = sumarMoney(...def.gastos.map((g) => g.montoCents));
  const itemsProrrateados = calcularItemsProrrateados(itemsForm, totalGastosCents, 'por_valor');
  const efectos = calcularEfectosProducto(itemsProrrateados, estado.productos);

  const itemsCompraFinal = itemsProrrateados.map((ip) => {
    const item = {
      productoId: ip.productoId,
      nombreProducto: ip.nombreProducto,
      costoFacturaCents: ip.costoFacturaCents,
      gastoProrrateadoCents: ip.gastoProrrateadoCents,
      costoRealCents: ip.costoRealCents,
    };
    if (ip.gramos !== undefined) item.gramos = ip.gramos;
    if (ip.unidades !== undefined) item.unidades = ip.unidades;
    if (ip.piezas !== undefined) item.piezas = ip.piezas;
    if (ip.costoRealKgCents !== null && ip.costoRealKgCents !== undefined) {
      item.costoRealKgCents = ip.costoRealKgCents;
    }
    return item;
  });

  const totalFacturaCents = sumarMoney(...itemsCompraFinal.map((i) => i.costoFacturaCents));
  const compra = {
    id: compraId,
    fecha,
    usuarioId: USUARIO_ID_SEED,
    estado: 'confirmada',
    proveedorId,
    proveedorNombre,
    items: itemsCompraFinal,
    gastos: def.gastos,
    totalFacturaCents,
    totalGastosCents,
    totalRealCents: sumarMoney(totalFacturaCents, totalGastosCents),
  };

  const piezasCreadas = [];
  const movimientos = [];
  let contadorPieza = 0;
  for (const item of itemsCompraFinal) {
    const producto = estado.productos.get(item.productoId);
    if (item.piezas !== undefined) {
      for (const pz of item.piezas) {
        contadorPieza += 1;
        const piezaId = `${compraId}-pieza-${contadorPieza}`;
        const pieza = {
          id: piezaId,
          productoId: item.productoId,
          pesoInicialGramos: pz.pesoGramos,
          pesoRestanteGramos: pz.pesoGramos,
          costoKgCents: item.costoRealKgCents,
          compraId,
          fechaIngreso: fecha,
          estado: 'disponible',
        };
        piezasCreadas.push(pieza);
        estado.piezasPorProducto.get(item.productoId).push(pieza);
        movimientos.push(
          crearMovimiento(estado, {
            tipo: 'ingreso_compra',
            productoId: item.productoId,
            piezaId,
            deltaGramos: pz.pesoGramos,
            origenTipo: 'compra',
            origenId: compraId,
            fecha,
          }),
        );
      }
    } else if (item.gramos !== undefined) {
      producto.stockGranelGramos = sumarPeso(producto.stockGranelGramos ?? peso(0), item.gramos);
      movimientos.push(
        crearMovimiento(estado, {
          tipo: 'ingreso_compra',
          productoId: item.productoId,
          deltaGramos: item.gramos,
          origenTipo: 'compra',
          origenId: compraId,
          fecha,
        }),
      );
    } else {
      producto.stockUnidades = (producto.stockUnidades ?? 0) + item.unidades;
      movimientos.push(
        crearMovimiento(estado, {
          tipo: 'ingreso_compra',
          productoId: item.productoId,
          deltaUnidades: item.unidades,
          origenTipo: 'compra',
          origenId: compraId,
          fecha,
        }),
      );
    }
  }

  for (const efecto of efectos) {
    const producto = estado.productos.get(efecto.productoId);
    producto.costoPromedioCents = efecto.nuevoCostoPromedioCents;
    producto.actualizadoEn = fecha;
  }

  return { compra, piezas: piezasCreadas, movimientos };
}

// ── Ajustes/merma: mismo criterio de piso-cero que `ajustarStock` (clampea en
// vez de dejar stock negativo; un seed determinista no debería necesitarlo,
// pero es la misma defensa que tiene el dominio real). ──────────────────────

function procesarAjuste(def, estado, productosPorSlug, fecha) {
  const productoId = productosPorSlug.get(def.productoSlug);
  const producto = estado.productos.get(productoId);

  if (def.requierePieza === true) {
    const disponibles = estado.piezasPorProducto
      .get(productoId)
      .filter((p) => p.estado === 'disponible' && p.pesoRestanteGramos > 0);
    if (disponibles.length === 0) return null;
    const pieza = elegirPieza(disponibles, peso(1)).pieza;
    const delta = -Math.min(-def.deltaGramos, pieza.pesoRestanteGramos);
    pieza.pesoRestanteGramos = peso(pieza.pesoRestanteGramos + delta);
    if (pieza.pesoRestanteGramos === 0) pieza.estado = 'merma_total';
    return crearMovimiento(estado, {
      tipo: def.tipo,
      productoId,
      piezaId: pieza.id,
      deltaGramos: peso(delta),
      origenTipo: 'ajuste',
      fecha,
      nota: def.nota,
    });
  }

  if (def.deltaGramos !== undefined) {
    const actual = producto.stockGranelGramos ?? peso(0);
    const delta = def.deltaGramos < 0 ? -Math.min(-def.deltaGramos, actual) : def.deltaGramos;
    producto.stockGranelGramos = peso(actual + delta);
    return crearMovimiento(estado, {
      tipo: def.tipo,
      productoId,
      deltaGramos: peso(delta),
      origenTipo: 'ajuste',
      fecha,
      nota: def.nota,
    });
  }

  const actual = producto.stockUnidades ?? 0;
  const delta = def.deltaUnidades < 0 ? -Math.min(-def.deltaUnidades, actual) : def.deltaUnidades;
  producto.stockUnidades = actual + delta;
  return crearMovimiento(estado, {
    tipo: def.tipo,
    productoId,
    deltaUnidades: delta,
    origenTipo: 'ajuste',
    fecha,
    nota: def.nota,
  });
}

// ── Ventas: resuelve cada ítem contra el stock EN VIVO (FIFO con `elegirPieza`
// de core para los modos por pieza) y congela su costo con `congelarCosteo`. ──

/** Resuelve UN ítem de venta contra el estado vivo. `null` si no hay stock (se
 * descarta el ítem; si la venta entera queda vacía, `procesarVenta` la descarta). */
function resolverItemVenta(productoSlug, cantidadDeseada, estado, productosPorSlug) {
  const productoId = productosPorSlug.get(productoSlug);
  const producto = estado.productos.get(productoId);
  const base = { productoId, nombreProducto: producto.nombre };

  if (producto.modoStock === 'fraccionado_por_pieza' || producto.modoStock === 'pieza_entera') {
    const disponibles = estado.piezasPorProducto
      .get(productoId)
      .filter((p) => p.estado === 'disponible' && p.pesoRestanteGramos > 0);
    if (disponibles.length === 0) return null;
    const elegido = elegirPieza(disponibles, peso(1));
    if (elegido === null) return null;
    const pieza = elegido.pieza;
    const gramos =
      producto.modoStock === 'pieza_entera'
        ? pieza.pesoRestanteGramos
        : Math.min(cantidadDeseada, pieza.pesoRestanteGramos);
    if (gramos <= 0) return null;
    pieza.pesoRestanteGramos = peso(pieza.pesoRestanteGramos - gramos);
    if (producto.modoStock === 'pieza_entera') pieza.estado = 'agotada';
    const gramosVendidos = peso(gramos);
    const subtotalCents = calcularSubtotal({
      modoPrecio: 'por_kg',
      precioKgCents: producto.precioVentaCents,
      gramos: gramosVendidos,
    });
    const costeo = congelarCosteo({
      pieza: { costoKgCents: pieza.costoKgCents, compraId: pieza.compraId },
      magnitud: { medida: 'peso', gramos: gramosVendidos },
    });
    return {
      ...base,
      piezaId: pieza.id,
      gramos: gramosVendidos,
      precioUnitCents: producto.precioVentaCents,
      subtotalCents,
      costeo,
    };
  }

  if (producto.modoStock === 'granel') {
    const stockActual = producto.stockGranelGramos ?? peso(0);
    const gramos = Math.min(cantidadDeseada, stockActual);
    if (gramos <= 0) return null;
    producto.stockGranelGramos = peso(stockActual - gramos);
    const gramosVendidos = peso(gramos);
    const subtotalCents = calcularSubtotal({
      modoPrecio: 'por_kg',
      precioKgCents: producto.precioVentaCents,
      gramos: gramosVendidos,
    });
    const costeo = congelarCosteo({
      costoPromedioCents: producto.costoPromedioCents,
      magnitud: { medida: 'peso', gramos: gramosVendidos },
    });
    return { ...base, gramos: gramosVendidos, precioUnitCents: producto.precioVentaCents, subtotalCents, costeo };
  }

  // unidad_simple
  const stockActual = producto.stockUnidades ?? 0;
  const unidades = Math.min(cantidadDeseada, stockActual);
  if (unidades <= 0) return null;
  producto.stockUnidades = stockActual - unidades;
  const subtotalCents = calcularSubtotal({
    modoPrecio: 'por_unidad',
    precioUnitCents: producto.precioVentaCents,
    unidades,
  });
  const costeo = congelarCosteo({
    costoPromedioCents: producto.costoPromedioCents,
    magnitud: { medida: 'unidades', unidades },
  });
  return { ...base, unidades, precioUnitCents: producto.precioVentaCents, subtotalCents, costeo };
}

/** `null` si, tras resolver sus ítems contra el stock vivo, la venta queda vacía
 * (se descarta entera: nunca se persiste un ticket sin ítems). */
function procesarVenta(ev, estado, productosPorSlug, rng, numero) {
  const itemsDef = ev.itemsForzados ?? construirItemsAleatorios(rng);
  const medioPago = ev.medioPagoForzado ?? elegirMedioPago(rng);

  const items = [];
  for (const it of itemsDef) {
    const cantidad = it.gramos ?? it.unidades ?? cantidadDeseadaVenta(it.productoSlug, rng);
    const item = resolverItemVenta(it.productoSlug, cantidad, estado, productosPorSlug);
    if (item !== null) items.push(item);
  }
  if (items.length === 0) return null;

  const totalCents = sumarMoney(...items.map((i) => i.subtotalCents));
  const venta = {
    id: `${PREFIJO_DEMO}venta-reportes-${numero}`,
    numero,
    fecha: ev.fecha,
    usuarioId: USUARIO_ID_SEED,
    items,
    totalCents,
    medioPago,
    estado: 'completada',
  };
  const movimientos = items.map((item) =>
    crearMovimiento(estado, {
      tipo: 'venta',
      productoId: item.productoId,
      piezaId: item.piezaId,
      deltaGramos: item.gramos !== undefined ? peso(-item.gramos) : undefined,
      deltaUnidades: item.unidades !== undefined ? -item.unidades : undefined,
      origenTipo: 'venta',
      origenId: venta.id,
      fecha: ev.fecha,
    }),
  );
  return { venta, movimientos };
}

/** Anula la venta especial (`CLAVE_VENTA_ANULAR`): un solo ítem granel, así la
 * reversa es simétrica a `anularVenta` sin los matices de pieza (disponible de
 * nuevo) que no hacen falta para ejercitar "hay una venta anulada" en Reportes. */
function procesarAnulacion(venta, estado, fecha) {
  venta.estado = 'anulada';
  const item = venta.items[0];
  const producto = estado.productos.get(item.productoId);
  producto.stockGranelGramos = sumarPeso(producto.stockGranelGramos ?? peso(0), item.gramos);
  return crearMovimiento(estado, {
    tipo: 'devolucion',
    productoId: item.productoId,
    deltaGramos: item.gramos,
    origenTipo: 'venta',
    origenId: venta.id,
    fecha,
  });
}

/**
 * Construye el dataset completo de la demo de Reportes: catálogo (categorías,
 * proveedores, productos), compras confirmadas (con piezas/movimientos de
 * ingreso), ventas con costeo congelado (incluida una anulada), ajustes/merma,
 * y 2 clientes nuevos (`demo-cliente-reportes-*`) para las ventas "con
 * cliente" — independientes de los 6 clientes de WA-D (sus `stats` no se
 * tocan: mezclar ventas de dos datasets distintos en el mismo cliente
 * rompería la coherencia stats↔ventas que `generador.test.mjs` verifica).
 *
 * Determinista: misma `ahora` + misma `seed` (default `20260724`) ⇒ mismo
 * dataset siempre (mismo criterio que `construirDatosDemo`: nunca lee el
 * reloj ni usa aleatoriedad sin semilla).
 */
export function construirDatosReportes(ahora, opciones = {}) {
  const seed = opciones.seed ?? 20260724;
  const rng = crearRng(seed);

  const categorias = CATEGORIAS_REPORTES.map((c) => ({
    id: `${PREFIJO_DEMO}categoria-${c.slug}`,
    nombre: c.nombre,
    orden: c.orden,
  }));
  const categoriaNombrePorSlug = new Map(CATEGORIAS_REPORTES.map((c) => [c.slug, c.nombre]));

  const proveedores = PROVEEDORES_REPORTES.map((p) => ({
    id: `${PREFIJO_DEMO}proveedor-${p.slug}`,
    nombre: p.nombre,
    contactoNombre: p.contactoNombre,
    telefono: p.telefono,
    direccion: p.direccion,
    fechaAlta: haceDias(ahora, 130),
    activo: true,
  }));
  const proveedorIdPorSlug = new Map(PROVEEDORES_REPORTES.map((p, i) => [p.slug, proveedores[i].id]));

  const productosPorSlug = new Map();
  const estadoProductos = new Map();
  for (const def of PRODUCTOS_REPORTES) {
    const id = `${PREFIJO_DEMO}prod-${def.slug}`;
    productosPorSlug.set(def.slug, id);
    estadoProductos.set(id, {
      id,
      nombre: def.nombre,
      categoria: categoriaNombrePorSlug.get(def.categoriaSlug),
      modoPrecio: def.modoPrecio,
      modoStock: def.modoStock,
      precioVentaCents: def.precioVentaCents,
      costoPromedioCents: money(0),
      stockGranelGramos: def.modoStock === 'granel' ? peso(0) : undefined,
      stockUnidades: def.modoStock === 'unidad_simple' ? 0 : undefined,
      umbralAlertaStock: def.umbralAlertaStock,
      proveedorPrincipalId:
        def.proveedorSlug !== undefined ? proveedorIdPorSlug.get(def.proveedorSlug) : undefined,
      activo: true,
      actualizadoEn: haceDias(ahora, 130),
    });
  }

  const piezasPorProducto = new Map();
  for (const def of PRODUCTOS_REPORTES) {
    if (def.modoStock === 'fraccionado_por_pieza' || def.modoStock === 'pieza_entera') {
      piezasPorProducto.set(productosPorSlug.get(def.slug), []);
    }
  }

  const estado = { productos: estadoProductos, piezasPorProducto, movContador: 0 };

  const eventos = [
    ...COMPRAS_REPORTES.map((def) => ({ tipo: 'compra', diasAtras: def.diasAtras, def })),
    ...AJUSTES_REPORTES.map((def) => ({ tipo: 'ajuste', diasAtras: def.diasAtras, def })),
    ...construirEventosVenta(ahora, rng),
    { tipo: 'anulacion', diasAtras: 59, clave: CLAVE_VENTA_ANULAR },
  ];
  for (const ev of eventos) {
    ev.fecha = fechaEvento(ahora, ev.diasAtras, ev.hora ?? 12, ev.minuto ?? 0);
  }
  eventos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const piezas = [];
  const compras = [];
  const movimientos = [];
  const ventas = [];
  const ventasPorClave = new Map();
  const clientesReportes = new Map();
  for (const def of CLIENTES_REPORTES) {
    clientesReportes.set(def.slug, {
      id: `${PREFIJO_DEMO}cliente-reportes-${def.slug}`,
      nombre: def.nombre,
      ventasPropias: [],
    });
  }

  let numeroVenta = 1000; // rango propio (WA-D usa 1..N chico): evita coincidencias confusas en el historial.
  let contadorVentaCliente = 0;

  for (const ev of eventos) {
    if (ev.tipo === 'compra') {
      const resultado = procesarCompra(ev.def, estado, productosPorSlug, proveedorIdPorSlug, ev.fecha);
      compras.push(resultado.compra);
      piezas.push(...resultado.piezas);
      movimientos.push(...resultado.movimientos);
    } else if (ev.tipo === 'ajuste') {
      const mov = procesarAjuste(ev.def, estado, productosPorSlug, ev.fecha);
      if (mov !== null) movimientos.push(mov);
    } else if (ev.tipo === 'venta') {
      const resultado = procesarVenta(ev, estado, productosPorSlug, rng, numeroVenta);
      if (resultado === null) continue;
      numeroVenta += 1;
      const { venta, movimientos: movsVenta } = resultado;

      if (ev.generada === true) {
        contadorVentaCliente += 1;
        let cliente;
        if (contadorVentaCliente % 7 === 0) cliente = clientesReportes.get('marcelo');
        else if (contadorVentaCliente % 11 === 0) cliente = clientesReportes.get('estela');
        if (cliente !== undefined) {
          venta.clienteId = cliente.id;
          venta.clienteNombre = cliente.nombre;
          cliente.ventasPropias.push(venta);
        }
      }

      ventas.push(venta);
      movimientos.push(...movsVenta);
      if (ev.clave !== undefined) ventasPorClave.set(ev.clave, venta);
    } else {
      // 'anulacion'
      const venta = ventasPorClave.get(ev.clave);
      movimientos.push(procesarAnulacion(venta, estado, ev.fecha));
    }
  }

  const clientes = [];
  for (const cliente of clientesReportes.values()) {
    if (cliente.ventasPropias.length === 0) continue; // no debería pasar (ver test de cobertura mínima)
    const propias = [...cliente.ventasPropias].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    clientes.push({
      id: cliente.id,
      nombre: cliente.nombre,
      fechaAlta: new Date(propias[0].fecha.getTime() - MS_POR_DIA),
      activo: true,
      stats: statsDesdeVentas(propias),
    });
  }

  return {
    categorias,
    proveedores,
    productos: [...estado.productos.values()],
    piezas,
    compras,
    movimientos,
    ventas,
    clientes,
  };
}
