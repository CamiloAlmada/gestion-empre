import {
  collection,
  doc,
  increment,
  writeBatch,
  type FieldValue,
  type Firestore,
} from 'firebase/firestore';
import {
  peso,
  sumarMoney,
  type EstadoPieza,
  type ItemVenta,
  type MedioPago,
  type Money,
  type MovimientoStock,
  type Peso,
  type Pieza,
  type Producto,
  type Venta,
} from '@gestion/core';
import { ventaConverter } from './converters/venta';
import { movimientoConverter } from './converters/movimiento';
import {
  AnulacionInvalidaError,
  ItemInvalidoError,
  StockInsuficienteError,
  TotalIncoherenteError,
  VentaVaciaError,
} from './errores';

/**
 * Escrituras multi-documento del POS (`registrarVenta`, `anularVenta`).
 *
 * Decisiones de arquitectura (ver la tarea B4 y `docs/02-dominio-quesarte.md`):
 *
 * - **`writeBatch`, no `runTransaction`.** El POS debe funcionar OFFLINE (regla
 *   de oro 6). Una transacción exige round-trip al servidor; un batch se encola
 *   offline y se sincroniza al reconectar, manteniendo la atomicidad en el
 *   commit.
 * - **Decrementos con `increment()`.** `pesoRestanteGramos`, `stockGranelGramos`
 *   y `stockUnidades` se modifican con `FieldValue.increment(delta)`, que es
 *   conmutativo: dos ventas offline concurrentes desde dos dispositivos se
 *   fusionan sin perderse al sincronizar. NUNCA se escribe el valor absoluto
 *   calculado en el cliente.
 * - **Validación en dos capas.** (a) Esta capa valida contra el estado local que
 *   recibe por parámetro (producto/pieza ya leídos por los hooks de la pantalla)
 *   y falla rápido con errores de dominio en español. (b) Las reglas de Firestore
 *   son el backstop en el servidor. La validación local puede quedar
 *   desactualizada offline; el diseño con `increment` + reglas con piso cero lo
 *   tolera (el commit se rechaza en el servidor si el stock quedara negativo).
 *   Estas funciones NO leen de Firestore: reciben los datos ya resueltos.
 * - **Sin lógica de precios.** Los precios y subtotales vienen calculados por
 *   `@gestion/core` desde la UI; acá solo se validan como coherentes.
 */

// Un update parcial de stock: campos con `increment()` (FieldValue) y, para
// piezas, el `estado`. Tipado explícito para no caer en `any`.
type UpdateStock = Record<string, FieldValue | EstadoPieza>;

/** Ítem de venta ya resuelto por la UI: producto, pieza elegida y montos congelados. */
export interface ItemEntradaVenta {
  /** Producto del catálogo (aporta `id`, `nombre` y `modoStock`). */
  producto: Producto;
  /** Pieza elegida (FIFO o manual). Requerida en modos por pieza. */
  pieza?: Pieza;
  /** Peso vendido en gramos. Requerido en `fraccionado_por_pieza` y `granel`. */
  gramos?: Peso;
  /** Cantidad vendida. Requerida en `unidad_simple`. */
  unidades?: number;
  /** Precio unitario congelado (por kg o por unidad), calculado por core. */
  precioUnitCents: Money;
  /** Subtotal del ítem, calculado por core. */
  subtotalCents: Money;
}

/**
 * Cliente asociado a una venta (opcional). Lo resuelve la UI, que ya tiene el
 * cliente elegido cargado en pantalla; `registrarVenta` NO lee Firestore para
 * saber nada de él (camino de escritura offline-first, sin lecturas).
 *
 * `esPrimeraCompra` lo decide el caller a partir del cliente que tiene delante
 * (p. ej. `stats.primeraCompra === undefined` o `cantidadVentas === 0`): si es su
 * primera compra, la venta inicializa `stats.primeraCompra`; si no, no la toca (no
 * se puede recalcular sin leer, y la fecha real ya está guardada).
 */
export interface ClienteVenta {
  /** Id del doc `clientes/{id}` a asociar y cuyos `stats` se incrementan. */
  id: string;
  /** Nombre congelado que se denormaliza en la venta (`clienteNombre`). */
  nombre: string;
  /** El caller sabe (tiene el cliente en pantalla) si esta es su primera compra. */
  esPrimeraCompra: boolean;
}

/** Entrada de `registrarVenta`: cabecera + ítems ya resueltos por la UI. */
export interface EntradaVenta {
  /** Uid del vendedor que registra (debe coincidir con `request.auth.uid`). */
  usuarioId: string;
  medioPago: MedioPago;
  items: ItemEntradaVenta[];
  /** Total de la venta; debe ser la suma exacta de los subtotales. */
  totalCents: Money;
  /** Cliente a asociar (opcional). Sin él, la venta es anónima (caso por defecto). */
  cliente?: ClienteVenta;
}

// Update de `stats` de un cliente por rutas de campo (`stats.x`): los contadores
// con `increment()` (FieldValue) y las fechas de cache como `Date`. Se usan RUTAS
// (`'stats.cantidadVentas'`), no un objeto `stats` anidado, para no pisar los
// otros sub-campos del mapa. Tipado explícito para no caer en `any`.
type UpdateStatsCliente = Record<string, FieldValue | Date>;

// Efecto de un ítem sobre el stock + su movimiento de auditoría, ya resuelto y
// validado, pero sin las refs (que se crean dentro del batch).
interface EfectoVenta {
  itemVenta: ItemVenta;
  coleccion: 'piezas' | 'productos';
  refId: string;
  stockUpdate: UpdateStock;
  deltaGramos?: Peso;
  deltaUnidades?: number;
}

/**
 * Registra una venta y sus efectos de stock en UN batch atómico y offline-first.
 *
 * En un solo `writeBatch`:
 * - Crea `ventas/{id}` (`estado: 'completada'`, `numero` = `Date.now()`, `fecha`).
 *   Si viene `cliente`, denormaliza `clienteId` + `clienteNombre` en la venta.
 * - Por ítem, según `modoStock`, decrementa con `increment()` el peso de la pieza
 *   / el stock granel / las unidades (y marca la pieza `agotada` en `pieza_entera`).
 * - Crea un `movimientos/{id}` tipo `venta` por ítem (delta negativo,
 *   `origenTipo: 'venta'`, `origenId` = id de la venta).
 * - Si viene `cliente`, actualiza `clientes/{id}.stats` en el MISMO batch con
 *   `increment(1)` en `cantidadVentas`, `increment(totalCents)` en
 *   `totalHistoricoCents` y la fecha en `ultimaCompra` (y `primeraCompra` si el
 *   caller marca `esPrimeraCompra`). Todo con increments/rutas de campo: sin
 *   lecturas, compatible offline (doc 07, decisión 5). El cache
 *   `primeraCompra`/`ultimaCompra` es last-write-wins: dos ventas offline
 *   concurrentes pueden pisarse la fecha, aceptable para un cache aproximado.
 *
 * Valida antes de tocar el batch: ítems no vacíos, `totalCents` == suma de
 * subtotales, y stock/peso suficiente según los datos recibidos.
 *
 * @throws {VentaVaciaError} si no hay ítems.
 * @throws {TotalIncoherenteError} si `totalCents` no es la suma de subtotales.
 * @throws {ItemInvalidoError} si un ítem no trae los datos que su `modoStock` exige.
 * @throws {StockInsuficienteError} si el stock/peso local no alcanza para un ítem.
 */
export async function registrarVenta(
  db: Firestore,
  entrada: EntradaVenta,
): Promise<{ ventaId: string }> {
  const { usuarioId, medioPago, items, totalCents, cliente } = entrada;

  if (items.length === 0) {
    throw new VentaVaciaError('No se puede registrar una venta sin ítems.');
  }

  // El total debe ser la suma EXACTA de los subtotales (sin perder ni inventar
  // centésimos). `sumarMoney` opera sobre enteros branded.
  const suma = sumarMoney(...items.map((item) => item.subtotalCents));
  if (suma !== totalCents) {
    throw new TotalIncoherenteError(
      `totalCents (${totalCents}) no coincide con la suma de subtotales (${suma}).`,
    );
  }

  // Resolver y VALIDAR todos los efectos antes de abrir el batch: si algo falla,
  // no se escribió nada.
  const efectos = items.map(resolverEfectoVenta);

  const ahora = new Date();
  const batch = writeBatch(db);

  const ventaRef = doc(collection(db, 'ventas')).withConverter(ventaConverter);
  const venta: Venta = {
    id: ventaRef.id,
    numero: ahora.getTime(),
    fecha: ahora,
    usuarioId,
    items: efectos.map((efecto) => efecto.itemVenta),
    totalCents,
    medioPago,
    estado: 'completada',
    // Denormalizado: solo si hay cliente. El converter omite los `undefined`, así
    // que una venta anónima queda byte-idéntica a como era antes de la Fase 1.5.
    clienteId: cliente?.id,
    clienteNombre: cliente?.nombre,
  };
  batch.set(ventaRef, venta);

  // Cache de estadísticas del cliente en el MISMO batch (ver doc del método). Va
  // por rutas de campo con `increment()` para no leer ni pisar otros sub-campos.
  if (cliente !== undefined) {
    const statsUpdate: UpdateStatsCliente = {
      'stats.cantidadVentas': increment(1),
      'stats.totalHistoricoCents': increment(totalCents),
      'stats.ultimaCompra': ahora,
    };
    if (cliente.esPrimeraCompra) {
      statsUpdate['stats.primeraCompra'] = ahora;
    }
    batch.update(doc(db, 'clientes', cliente.id), statsUpdate);
  }

  for (const efecto of efectos) {
    batch.update(doc(db, efecto.coleccion, efecto.refId), efecto.stockUpdate);

    const movRef = doc(collection(db, 'movimientos')).withConverter(movimientoConverter);
    const movimiento: MovimientoStock = {
      id: movRef.id,
      tipo: 'venta',
      productoId: efecto.itemVenta.productoId,
      piezaId: efecto.itemVenta.piezaId,
      deltaGramos: efecto.deltaGramos,
      deltaUnidades: efecto.deltaUnidades,
      origenTipo: 'venta',
      origenId: ventaRef.id,
      usuarioId,
      fecha: ahora,
    };
    batch.set(movRef, movimiento);
  }

  await batch.commit();
  return { ventaId: ventaRef.id };
}

/**
 * Anula una venta `completada` restaurando el stock en UN batch atómico.
 *
 * En un solo `writeBatch`:
 * - Actualiza `ventas/{id}` cambiando SOLO `estado` a `'anulada'` (las reglas
 *   exigen que no cambie ningún otro campo; la reversa de stock va por
 *   movimientos e increments).
 * - Por ítem, aplica el efecto inverso con `increment()` positivo (restaura peso
 *   de pieza / granel / unidades). En ítems por pieza, además marca la pieza
 *   `disponible`: al devolverle peso, la pieza vuelve a estar disponible para
 *   FIFO (correcto tanto si venía de `fraccionado_por_pieza` como de
 *   `pieza_entera`, que la había dejado `agotada`).
 * - Crea un `movimientos/{id}` tipo `devolucion` por ítem (delta positivo,
 *   `origenTipo: 'venta'`, `origenId` = id de la venta).
 * - Si la venta tenía `clienteId`, revierte los contadores de `clientes/{id}.stats`
 *   en el MISMO batch: `increment(-1)` en `cantidadVentas` y `increment(-totalCents)`
 *   en `totalHistoricoCents`. NO rebobina `primeraCompra`/`ultimaCompra`: son cache
 *   aproximado y su fuente de verdad son las ventas (doc 04, Fase 1.5). Esta reversa
 *   la ejecuta el admin (anular es solo-admin), único rol que las reglas dejan
 *   decrementar `stats`.
 *
 * @throws {AnulacionInvalidaError} si `venta.estado !== 'completada'`.
 * @throws {ItemInvalidoError} si un ítem no tiene gramos ni unidades (dato corrupto).
 */
export async function anularVenta(db: Firestore, venta: Venta, usuarioId: string): Promise<void> {
  if (venta.estado !== 'completada') {
    throw new AnulacionInvalidaError(
      `Solo se puede anular una venta 'completada'; estado actual: '${venta.estado}'.`,
    );
  }

  const ahora = new Date();
  const batch = writeBatch(db);

  // Update de la venta: SOLO estado (las reglas rechazan cualquier otro cambio).
  batch.update(doc(db, 'ventas', venta.id), { estado: 'anulada' });

  // Reversa del cache de stats del cliente (si la venta lo tenía). Solo los
  // contadores; las fechas no se rebobinan (cache aproximado, ver doc del método).
  if (venta.clienteId !== undefined) {
    const statsReversa: UpdateStatsCliente = {
      'stats.cantidadVentas': increment(-1),
      'stats.totalHistoricoCents': increment(-venta.totalCents),
    };
    batch.update(doc(db, 'clientes', venta.clienteId), statsReversa);
  }

  for (const item of venta.items) {
    const reversa = resolverReversaVenta(item);
    batch.update(doc(db, reversa.coleccion, reversa.refId), reversa.stockUpdate);

    const movRef = doc(collection(db, 'movimientos')).withConverter(movimientoConverter);
    const movimiento: MovimientoStock = {
      id: movRef.id,
      tipo: 'devolucion',
      productoId: item.productoId,
      piezaId: item.piezaId,
      deltaGramos: reversa.deltaGramos,
      deltaUnidades: reversa.deltaUnidades,
      origenTipo: 'venta',
      origenId: venta.id,
      usuarioId,
      fecha: ahora,
    };
    batch.set(movRef, movimiento);
  }

  await batch.commit();
}

// ── Resolución de efectos por ítem ──────────────────────────────────────────

/** Resuelve y valida el efecto de stock + movimiento de un ítem de venta. */
function resolverEfectoVenta(item: ItemEntradaVenta): EfectoVenta {
  const { producto, pieza, precioUnitCents, subtotalCents } = item;
  const base = {
    productoId: producto.id,
    nombreProducto: producto.nombre,
    precioUnitCents,
    subtotalCents,
  } as const;

  switch (producto.modoStock) {
    case 'fraccionado_por_pieza': {
      const p = exigirPieza(pieza, producto);
      const gramos = exigirGramos(item.gramos, producto);
      if (p.pesoRestanteGramos < gramos) {
        throw new StockInsuficienteError(
          `La pieza ${p.id} tiene ${p.pesoRestanteGramos} g, se pidieron ${gramos} g.`,
        );
      }
      return {
        itemVenta: { ...base, piezaId: p.id, gramos },
        coleccion: 'piezas',
        refId: p.id,
        stockUpdate: { pesoRestanteGramos: increment(-gramos) },
        deltaGramos: peso(-gramos),
      };
    }

    case 'pieza_entera': {
      const p = exigirPieza(pieza, producto);
      // Se lleva la pieza completa: el peso vendido ES su peso restante.
      const gramos = p.pesoRestanteGramos;
      if (gramos <= 0) {
        throw new StockInsuficienteError(`La pieza ${p.id} no tiene peso restante para vender.`);
      }
      return {
        itemVenta: { ...base, piezaId: p.id, gramos },
        coleccion: 'piezas',
        refId: p.id,
        stockUpdate: { pesoRestanteGramos: increment(-gramos), estado: 'agotada' },
        deltaGramos: peso(-gramos),
      };
    }

    case 'granel': {
      const gramos = exigirGramos(item.gramos, producto);
      const stock = producto.stockGranelGramos;
      if (stock === undefined) {
        throw new ItemInvalidoError(`El producto granel ${producto.id} no tiene stockGranelGramos.`);
      }
      if (stock < gramos) {
        throw new StockInsuficienteError(
          `Stock granel de ${producto.id}: ${stock} g, se pidieron ${gramos} g.`,
        );
      }
      return {
        itemVenta: { ...base, gramos },
        coleccion: 'productos',
        refId: producto.id,
        stockUpdate: { stockGranelGramos: increment(-gramos) },
        deltaGramos: peso(-gramos),
      };
    }

    case 'unidad_simple': {
      const unidades = exigirUnidades(item.unidades, producto);
      const stock = producto.stockUnidades;
      if (stock === undefined) {
        throw new ItemInvalidoError(`El producto ${producto.id} no tiene stockUnidades.`);
      }
      if (stock < unidades) {
        throw new StockInsuficienteError(
          `Stock de ${producto.id}: ${stock} unidades, se pidieron ${unidades}.`,
        );
      }
      return {
        itemVenta: { ...base, unidades },
        coleccion: 'productos',
        refId: producto.id,
        stockUpdate: { stockUnidades: increment(-unidades) },
        deltaUnidades: -unidades,
      };
    }
  }
}

// Reversa de un ítem ya persistido en la venta (solo lleva ids + magnitudes).
interface ReversaVenta {
  coleccion: 'piezas' | 'productos';
  refId: string;
  stockUpdate: UpdateStock;
  deltaGramos?: Peso;
  deltaUnidades?: number;
}

/**
 * Resuelve el efecto inverso de un ítem al anular. Se deriva del propio
 * `ItemVenta` (que no guarda `modoStock`):
 * - con `unidades` ⇒ era `unidad_simple` (restaura `stockUnidades`);
 * - con `piezaId` ⇒ iba por pieza (restaura `pesoRestanteGramos` y la deja
 *   `disponible`);
 * - solo con `gramos` ⇒ era `granel` (restaura `stockGranelGramos`).
 */
function resolverReversaVenta(item: ItemVenta): ReversaVenta {
  if (item.unidades !== undefined) {
    return {
      coleccion: 'productos',
      refId: item.productoId,
      stockUpdate: { stockUnidades: increment(item.unidades) },
      deltaUnidades: item.unidades,
    };
  }

  if (item.gramos === undefined) {
    throw new ItemInvalidoError(
      `El ítem de producto ${item.productoId} no tiene gramos ni unidades para revertir.`,
    );
  }
  const gramos = item.gramos;

  if (item.piezaId !== undefined) {
    return {
      coleccion: 'piezas',
      refId: item.piezaId,
      stockUpdate: { pesoRestanteGramos: increment(gramos), estado: 'disponible' },
      deltaGramos: gramos,
    };
  }

  return {
    coleccion: 'productos',
    refId: item.productoId,
    stockUpdate: { stockGranelGramos: increment(gramos) },
    deltaGramos: gramos,
  };
}

// ── Validaciones de datos por ítem ──────────────────────────────────────────

function exigirPieza(pieza: Pieza | undefined, producto: Producto): Pieza {
  if (pieza === undefined) {
    throw new ItemInvalidoError(
      `El producto ${producto.id} (${producto.modoStock}) requiere una pieza.`,
    );
  }
  if (pieza.estado !== 'disponible') {
    throw new StockInsuficienteError(
      `La pieza ${pieza.id} no está disponible (estado: '${pieza.estado}').`,
    );
  }
  return pieza;
}

function exigirGramos(gramos: Peso | undefined, producto: Producto): Peso {
  if (gramos === undefined || gramos <= 0) {
    throw new ItemInvalidoError(
      `El producto ${producto.id} (${producto.modoStock}) requiere gramos > 0.`,
    );
  }
  return gramos;
}

function exigirUnidades(unidades: number | undefined, producto: Producto): number {
  if (unidades === undefined || !Number.isInteger(unidades) || unidades <= 0) {
    throw new ItemInvalidoError(`El producto ${producto.id} requiere unidades enteras > 0.`);
  }
  return unidades;
}
