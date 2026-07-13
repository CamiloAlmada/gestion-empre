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

import { calcularSubtotal, money, normalizarTelefono, peso, sumarMoney } from '@gestion/core';

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
 * `'completada'`, `numero` derivado de la fecha (coherente con `registrarVenta`,
 * que usa el instante de creación).
 *
 * NO registra efectos de stock ni `movimientos/`: el seed de demo solo necesita el
 * historial de ventas y sus stats de cliente (doc 08), no tocar inventario real.
 */
function crearVenta({ id, clienteId, clienteNombre, fecha, cestaIndice, medioPagoIndice }) {
  const items = CESTAS[cestaIndice % CESTAS.length]();
  const totalCents = sumarMoney(...items.map((item) => item.subtotalCents));
  return {
    id,
    numero: fecha.getTime(),
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
  const ventas = [];
  for (const def of definiciones) {
    const { cliente, ventas: ventasCliente } = crearClienteConVentas({ ...def, ahora });
    clientes.push(cliente);
    ventas.push(...ventasCliente);
  }

  return { clientes, ventas };
}
