import {
  collection,
  doc,
  increment,
  setDoc,
  writeBatch,
  type FieldValue,
  type Firestore,
} from 'firebase/firestore';
import {
  calcularCostoRealCents,
  calcularCostoRealKgCents,
  sumarMoney,
  type Compra,
  type GastoCompra,
  type ItemCompra,
  type Money,
  type MovimientoStock,
  type Peso,
  type Pieza,
  type PiezaCompra,
} from '@gestion/core';
import { compraConverter } from './converters/compra';
import { piezaConverter } from './converters/pieza';
import { movimientoConverter } from './converters/movimiento';
import {
  CompraIncoherenteError,
  CompraVaciaError,
  EstadoCompraInvalidoError,
  ProrateoIncoherenteError,
  ProveedorInvalidoError,
} from './errores';

/**
 * Módulo de compras (`compras/{id}`, doc 03). Flujo borrador → confirmada:
 *
 * - `guardarBorradorCompra` / `actualizarBorradorCompra`: crean o editan una compra
 *   en estado `borrador`, sin efectos de stock ni costo. Escritura de UN documento
 *   (sin `writeBatch`: no hay multi-documento que hacer atómico).
 * - `confirmarCompra`: aplica en UN `writeBatch` atómico los efectos de la compra
 *   (piezas, stock, movimientos, costo promedio) y la deja `confirmada` e inmutable.
 *
 * Comparte las decisiones de arquitectura del POS (ver `ventas.ts`):
 * - **`writeBatch`, no `runTransaction`.** Aunque las compras las hace el admin con
 *   conexión, se respeta la misma regla del proyecto (offline-first, sin transacciones).
 * - **CERO lecturas en el camino de escritura.** El caller pasa TODO ya resuelto:
 *   los ítems prorrateados por `core` (`prorratearGastos` + `calcularCostoReal*`) y
 *   el nuevo costo promedio por producto (`nuevoCostoPromedio`, calculado a partir
 *   del producto que ya tiene en pantalla). `confirmarCompra` solo VALIDA coherencia.
 * - **Incrementos con `increment()`.** El stock agregado (granel/unidades) se sube
 *   con `FieldValue.increment()`, nunca con el valor absoluto del cliente.
 * - **Validación completa ANTES de abrir el batch** (patrón `registrarVenta`): si
 *   algo no cierra, no se escribió nada.
 *
 * ## Creación de piezas: inline, NO `ingresarPiezas` (decisión F2-E)
 *
 * `ingresarPiezas` (`stock.ts`) nació para el ingreso MANUAL de piezas y difiere de
 * la confirmación de compra en todos los ejes que importan: (1) commitea su PROPIO
 * batch (no se puede componer dentro del batch atómico de la compra); (2) su
 * movimiento es `ajuste_positivo` con `origenTipo: 'ajuste'`, acá es `ingreso_compra`
 * con `origenTipo: 'compra'` y `origenId` = la compra; (3) el costo de la pieza sale
 * de `producto.costoPromedioCents`, acá del `costoRealKgCents` real del ítem; (4) las
 * piezas de compra llevan `compraId`. Reusarlo obligaría a parametrizar `ingresarPiezas`
 * con conceptos de compra (batch externo, tipo/origen de movimiento, costo, compraId),
 * rompiendo su única responsabilidad para deduplicar ~8 líneas de construcción de doc.
 * Por eso la pieza se crea INLINE acá (ya anticipado en el JSDoc de `ingresarPiezas`).
 *
 * ## Sin anulación de compras
 *
 * El doc 03 define una compra confirmada como INMUTABLE ("correcciones = ajustes"):
 * no hay reversa de compra. Un error se corrige con ajustes de stock (`ajustarStock`),
 * no reabriendo ni anulando la compra. Por eso este módulo no expone `anularCompra` y
 * las reglas hacen la `confirmada` inmutable y no borrable.
 */

// Update parcial de un producto en la confirmación: costo promedio (Money → number),
// `actualizadoEn` (Date) e incrementos de stock agregado (FieldValue). Tipado
// explícito para no caer en `any` (mismo criterio que `UpdateStock` en ventas.ts).
type UpdateProducto = Record<string, FieldValue | number | Date>;

/** Ítem de un borrador de compra: aún sin los campos que calcula la confirmación. */
export type ItemBorradorCompra = Pick<
  ItemCompra,
  'productoId' | 'nombreProducto' | 'gramos' | 'unidades' | 'piezas' | 'costoFacturaCents'
>;

/**
 * Datos de un borrador de compra. Los totales NO se piden: se derivan de `items` y
 * `gastos` (un borrador es un draft; forzar totales coherentes mid-edición sería
 * fricción). El prorrateo y los costos reales se calculan recién al confirmar.
 */
export interface DatosBorradorCompra {
  /** Uid de quien arma la compra (admin). */
  usuarioId: string;
  /** Proveedor elegido (doc 07). `proveedorId` opcional; `proveedorNombre` denormalizado. */
  proveedorId?: string;
  proveedorNombre: string;
  items: ItemBorradorCompra[];
  gastos: GastoCompra[];
  /** Fecha de la compra. Default: ahora. En `actualizar`, pasar la fecha original. */
  fecha?: Date;
}

/** Nuevo costo promedio de un producto tocado por la compra, calculado por el caller. */
export interface EfectoProductoCompra {
  productoId: string;
  /**
   * Costo promedio resultante tras el ingreso, calculado por el caller con
   * `nuevoCostoPromedio` (core) a partir del producto que tiene en pantalla. Su
   * unidad es la del `costoPromedioCents` del producto (por kg o por unidad).
   */
  nuevoCostoPromedioCents: Money;
}

/** Entrada de `confirmarCompra`: la compra prorrateada + los efectos por producto. */
export interface EntradaConfirmarCompra {
  /**
   * La compra a confirmar, tal como está guardada (estado `borrador`), con los ítems
   * YA prorrateados por el caller (`gastoProrrateadoCents`, `costoRealCents` y
   * `costoRealKgCents` para ítems al peso). `confirmarCompra` valida su coherencia.
   */
  compra: Compra;
  /** Uid de quien confirma (admin); va en los movimientos de auditoría. */
  usuarioId: string;
  /** Un efecto por CADA productoId distinto de los ítems (bijección exacta). */
  efectosProducto: EfectoProductoCompra[];
}

// ── Borrador ────────────────────────────────────────────────────────────────

/** Valida y normaliza el nombre del proveedor: recorta y exige no vacío. */
function exigirProveedorNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) {
    throw new ProveedorInvalidoError('El nombre del proveedor de la compra no puede estar vacío.');
  }
  return limpio;
}

/** Suma de montos de una lista (identidad `money(0)` si viene vacía). */
function totalesBorrador(
  items: ItemBorradorCompra[],
  gastos: GastoCompra[],
): { totalFacturaCents: Money; totalGastosCents: Money; totalRealCents: Money } {
  const totalFacturaCents = sumarMoney(...items.map((it) => it.costoFacturaCents));
  const totalGastosCents = sumarMoney(...gastos.map((g) => g.montoCents));
  const totalRealCents = sumarMoney(totalFacturaCents, totalGastosCents);
  return { totalFacturaCents, totalGastosCents, totalRealCents };
}

/**
 * Arma el objeto `Compra` de un borrador: estado `borrador`, totales derivados y los
 * ítems SIN campos calculados (los pone la confirmación). El converter omite los
 * `undefined`, así que un borrador nunca persiste prorrateo ni costos reales.
 */
function construirBorrador(id: string, datos: DatosBorradorCompra, proveedorNombre: string): Compra {
  const items: ItemCompra[] = datos.items.map((it) => ({
    productoId: it.productoId,
    nombreProducto: it.nombreProducto,
    gramos: it.gramos,
    unidades: it.unidades,
    piezas: it.piezas,
    costoFacturaCents: it.costoFacturaCents,
  }));
  return {
    id,
    fecha: datos.fecha ?? new Date(),
    usuarioId: datos.usuarioId,
    estado: 'borrador',
    proveedorId: datos.proveedorId,
    proveedorNombre,
    items,
    gastos: datos.gastos,
    ...totalesBorrador(datos.items, datos.gastos),
  };
}

/**
 * Crea una compra en estado `borrador` (editable, sin efectos). Escritura de un solo
 * documento; los totales se derivan de ítems y gastos.
 *
 * @throws {ProveedorInvalidoError} si `proveedorNombre` queda vacío tras `trim()`.
 */
export async function guardarBorradorCompra(
  db: Firestore,
  datos: DatosBorradorCompra,
): Promise<{ compraId: string }> {
  const proveedorNombre = exigirProveedorNombre(datos.proveedorNombre);
  const ref = doc(collection(db, 'compras')).withConverter(compraConverter);
  await setDoc(ref, construirBorrador(ref.id, datos, proveedorNombre));
  return { compraId: ref.id };
}

/**
 * Reemplaza el contenido de un borrador existente (sigue en estado `borrador`). Las
 * reglas rechazan tocar una compra `confirmada` (inmutable), así que esta función
 * solo tiene efecto sobre borradores. Pasar `datos.fecha` con la fecha original para
 * no reescribirla.
 *
 * @throws {ProveedorInvalidoError} si `proveedorNombre` queda vacío tras `trim()`.
 */
export async function actualizarBorradorCompra(
  db: Firestore,
  compraId: string,
  datos: DatosBorradorCompra,
): Promise<void> {
  const proveedorNombre = exigirProveedorNombre(datos.proveedorNombre);
  const ref = doc(db, 'compras', compraId).withConverter(compraConverter);
  await setDoc(ref, construirBorrador(compraId, datos, proveedorNombre));
}

// ── Confirmación ────────────────────────────────────────────────────────────

/** Efecto de stock resuelto de un ítem, discriminado por cómo controla existencia. */
type EfectoItemCompra =
  | { tipo: 'pieza'; productoId: string; piezas: PiezaCompra[]; costoRealKgCents: Money }
  | { tipo: 'granel'; productoId: string; gramos: Peso }
  | { tipo: 'unidad'; productoId: string; unidades: number };

/** Cantidades agregadas a incrementar y nuevo costo promedio de un producto. */
interface AgregadoProducto {
  nuevoCostoPromedioCents: Money;
  granelGramos: number;
  unidades: number;
}

/**
 * Confirma una compra y aplica sus efectos en UN `writeBatch` atómico:
 * (a) la compra pasa a `confirmada` (inmutable) con los ítems prorrateados;
 * (b) se crea una pieza por cada `PiezaCompra` declarada, heredando el
 *     `costoRealKgCents` del ítem y ligada a la compra (`compraId`);
 * (c) se incrementa el stock agregado (`stockGranelGramos` / `stockUnidades`) con
 *     `increment()`;
 * (d) se registra un movimiento `ingreso_compra` por pieza (ítems por pieza) o por
 *     ítem (granel/unidad), con `origenTipo: 'compra'`;
 * (e) se actualiza `costoPromedioCents` (+ `actualizadoEn`) de cada producto con el
 *     valor que calculó el caller.
 *
 * Valida TODO antes de abrir el batch (coherencia de totales, invariante de
 * prorrateo, shape y costos de cada ítem, bijección de efectos por producto).
 *
 * @throws {EstadoCompraInvalidoError} si la compra no está en `borrador`, o si
 *   `efectosProducto` no cubre exactamente los productos de los ítems.
 * @throws {CompraVaciaError} si la compra no tiene ítems.
 * @throws {ProrateoIncoherenteError} si Σ `gastoProrrateadoCents` ≠ `totalGastosCents`.
 * @throws {CompraIncoherenteError} si un total no cierra, un ítem no trae los datos
 *   que su tipo exige, o un costo derivado no coincide con el recálculo de `core`.
 */
export async function confirmarCompra(db: Firestore, entrada: EntradaConfirmarCompra): Promise<void> {
  const { compra, usuarioId, efectosProducto } = entrada;

  if (compra.estado !== 'borrador') {
    throw new EstadoCompraInvalidoError(
      `Solo se confirma una compra en 'borrador'; estado actual: '${compra.estado}'.`,
    );
  }
  if (compra.items.length === 0) {
    throw new CompraVaciaError('No se puede confirmar una compra sin ítems.');
  }

  validarTotalesYProrrateo(compra);
  const efectos = compra.items.map(resolverEfectoItemCompra);
  const agregados = resolverAgregadosProducto(efectos, efectosProducto);

  const ahora = new Date();
  const batch = writeBatch(db);

  // (a) La compra pasa a confirmada (set completo por converter; los ítems ya traen
  // el prorrateo). Las reglas permiten la transición borrador→confirmada.
  const compraRef = doc(db, 'compras', compra.id).withConverter(compraConverter);
  batch.set(compraRef, { ...compra, estado: 'confirmada' });

  // (e)+(c) Un solo update por producto: costo promedio + actualizadoEn + increments.
  for (const [productoId, ag] of agregados) {
    const update: UpdateProducto = {
      costoPromedioCents: ag.nuevoCostoPromedioCents,
      actualizadoEn: ahora,
    };
    if (ag.granelGramos > 0) update.stockGranelGramos = increment(ag.granelGramos);
    if (ag.unidades > 0) update.stockUnidades = increment(ag.unidades);
    batch.update(doc(db, 'productos', productoId), update);
  }

  // (b)+(d) Piezas y movimientos de ingreso.
  for (const efecto of efectos) {
    if (efecto.tipo === 'pieza') {
      for (const pz of efecto.piezas) {
        const piezaRef = doc(collection(db, 'piezas')).withConverter(piezaConverter);
        const pieza: Pieza = {
          id: piezaRef.id,
          productoId: efecto.productoId,
          pesoInicialGramos: pz.pesoGramos,
          pesoRestanteGramos: pz.pesoGramos,
          costoKgCents: efecto.costoRealKgCents,
          compraId: compra.id,
          fechaIngreso: ahora,
          fechaVencimiento: pz.fechaVencimiento,
          estado: 'disponible',
        };
        batch.set(piezaRef, pieza);
        agregarMovimientoIngreso(batch, db, compra.id, usuarioId, ahora, {
          productoId: efecto.productoId,
          piezaId: piezaRef.id,
          deltaGramos: pz.pesoGramos,
        });
      }
    } else if (efecto.tipo === 'granel') {
      agregarMovimientoIngreso(batch, db, compra.id, usuarioId, ahora, {
        productoId: efecto.productoId,
        deltaGramos: efecto.gramos,
      });
    } else {
      agregarMovimientoIngreso(batch, db, compra.id, usuarioId, ahora, {
        productoId: efecto.productoId,
        deltaUnidades: efecto.unidades,
      });
    }
  }

  await batch.commit();
}

// ── Validaciones y resolución de efectos ────────────────────────────────────

/** Verifica que los totales cierren y que el prorrateo sume exacto (invariante doc 03). */
function validarTotalesYProrrateo(compra: Compra): void {
  const sumaFactura = sumarMoney(...compra.items.map((it) => it.costoFacturaCents));
  if (sumaFactura !== compra.totalFacturaCents) {
    throw new CompraIncoherenteError(
      `totalFacturaCents (${compra.totalFacturaCents}) ≠ Σ costoFacturaCents (${sumaFactura}).`,
    );
  }
  const sumaGastos = sumarMoney(...compra.gastos.map((g) => g.montoCents));
  if (sumaGastos !== compra.totalGastosCents) {
    throw new CompraIncoherenteError(
      `totalGastosCents (${compra.totalGastosCents}) ≠ Σ montoCents de gastos (${sumaGastos}).`,
    );
  }
  const totalReal = sumarMoney(compra.totalFacturaCents, compra.totalGastosCents);
  if (totalReal !== compra.totalRealCents) {
    throw new CompraIncoherenteError(
      `totalRealCents (${compra.totalRealCents}) ≠ totalFactura + totalGastos (${totalReal}).`,
    );
  }

  const prorrateados = compra.items.map((it, i) => {
    if (it.gastoProrrateadoCents === undefined) {
      throw new CompraIncoherenteError(
        `El ítem #${i + 1} (${it.productoId}) no tiene gastoProrrateadoCents: falta correr el prorrateo.`,
      );
    }
    return it.gastoProrrateadoCents;
  });
  const sumaProrrateo = sumarMoney(...prorrateados);
  if (sumaProrrateo !== compra.totalGastosCents) {
    throw new ProrateoIncoherenteError(
      `Σ gastoProrrateadoCents (${sumaProrrateo}) ≠ totalGastosCents (${compra.totalGastosCents}).`,
    );
  }
}

/**
 * Valida el shape y los costos de un ítem confirmado y devuelve su efecto de stock.
 * Distingue el tipo por presencia de campos: `piezas` (por pieza) → `gramos` (granel)
 * → `unidades` (unidad). El costo real y (para ítems al peso) el costo por kg se
 * revalidan recomputándolos con `core`.
 */
function resolverEfectoItemCompra(item: ItemCompra, i: number): EfectoItemCompra {
  const idx = i + 1;
  const { productoId, costoFacturaCents, gastoProrrateadoCents, costoRealCents, costoRealKgCents } =
    item;

  if (gastoProrrateadoCents === undefined || costoRealCents === undefined) {
    throw new CompraIncoherenteError(
      `El ítem #${idx} (${productoId}) no trae los costos calculados (prorrateo/costo real).`,
    );
  }
  const esperadoReal = calcularCostoRealCents(costoFacturaCents, gastoProrrateadoCents);
  if (costoRealCents !== esperadoReal) {
    throw new CompraIncoherenteError(
      `costoRealCents del ítem #${idx} (${costoRealCents}) ≠ costoFactura + prorrateo (${esperadoReal}).`,
    );
  }

  const piezas = item.piezas;
  if (piezas !== undefined && piezas.length > 0) {
    const gramos = exigirGramosPositivos(item.gramos, idx, productoId, 'por pieza');
    if (item.unidades !== undefined) {
      throw new CompraIncoherenteError(`El ítem #${idx} (${productoId}) por pieza no lleva unidades.`);
    }
    let suma = 0;
    for (const [j, pz] of piezas.entries()) {
      if (pz.pesoGramos <= 0) {
        throw new CompraIncoherenteError(
          `La pieza #${j + 1} del ítem #${idx} (${productoId}) tiene peso no positivo (${pz.pesoGramos} g).`,
        );
      }
      suma += pz.pesoGramos;
    }
    if (suma !== gramos) {
      throw new CompraIncoherenteError(
        `Σ pesoGramos de las piezas del ítem #${idx} (${suma}) ≠ gramos del ítem (${gramos}).`,
      );
    }
    const costoKg = exigirCostoRealKgCoherente(costoRealKgCents, costoRealCents, gramos, idx, productoId);
    return { tipo: 'pieza', productoId, piezas, costoRealKgCents: costoKg };
  }

  if (item.gramos !== undefined) {
    const gramos = exigirGramosPositivos(item.gramos, idx, productoId, 'granel');
    if (item.unidades !== undefined) {
      throw new CompraIncoherenteError(`El ítem #${idx} (${productoId}) granel no lleva unidades.`);
    }
    exigirCostoRealKgCoherente(costoRealKgCents, costoRealCents, gramos, idx, productoId);
    return { tipo: 'granel', productoId, gramos };
  }

  if (item.unidades !== undefined) {
    if (!Number.isInteger(item.unidades) || item.unidades <= 0) {
      throw new CompraIncoherenteError(
        `El ítem #${idx} (${productoId}) por unidad requiere unidades enteras > 0, recibió ${item.unidades}.`,
      );
    }
    if (costoRealKgCents !== undefined) {
      throw new CompraIncoherenteError(
        `El ítem #${idx} (${productoId}) por unidad no lleva costoRealKgCents (no tiene costo por kg).`,
      );
    }
    return { tipo: 'unidad', productoId, unidades: item.unidades };
  }

  throw new CompraIncoherenteError(
    `El ítem #${idx} (${productoId}) no trae gramos, unidades ni piezas.`,
  );
}

function exigirGramosPositivos(
  gramos: Peso | undefined,
  idx: number,
  productoId: string,
  tipo: string,
): Peso {
  if (gramos === undefined || gramos <= 0) {
    throw new CompraIncoherenteError(
      `El ítem #${idx} (${productoId}) ${tipo} requiere gramos > 0.`,
    );
  }
  return gramos;
}

/** El `costoRealKgCents` debe existir y coincidir con el recálculo de `core`; lo devuelve validado. */
function exigirCostoRealKgCoherente(
  costoRealKgCents: Money | undefined,
  costoRealCents: Money,
  gramos: Peso,
  idx: number,
  productoId: string,
): Money {
  const esperado = calcularCostoRealKgCents(costoRealCents, gramos);
  if (costoRealKgCents === undefined || esperado === null || costoRealKgCents !== esperado) {
    throw new CompraIncoherenteError(
      `costoRealKgCents del ítem #${idx} (${productoId}) (${costoRealKgCents}) ≠ recálculo por core (${esperado}).`,
    );
  }
  return costoRealKgCents;
}

/**
 * Agrupa los efectos por producto (sumando granel/unidades) y valida que
 * `efectosProducto` cubra EXACTAMENTE los productos de los ítems (bijección): un
 * efecto por producto, sin faltantes ni sobrantes ni duplicados.
 */
function resolverAgregadosProducto(
  efectos: EfectoItemCompra[],
  efectosProducto: EfectoProductoCompra[],
): Map<string, AgregadoProducto> {
  const costos = new Map<string, Money>();
  for (const ep of efectosProducto) {
    if (costos.has(ep.productoId)) {
      throw new EstadoCompraInvalidoError(
        `efectosProducto duplica el producto ${ep.productoId}.`,
      );
    }
    costos.set(ep.productoId, ep.nuevoCostoPromedioCents);
  }

  const agregados = new Map<string, AgregadoProducto>();
  for (const efecto of efectos) {
    const costo = costos.get(efecto.productoId);
    if (costo === undefined) {
      throw new EstadoCompraInvalidoError(
        `Falta el efecto de costo promedio del producto ${efecto.productoId}.`,
      );
    }
    const ag = agregados.get(efecto.productoId) ?? {
      nuevoCostoPromedioCents: costo,
      granelGramos: 0,
      unidades: 0,
    };
    if (efecto.tipo === 'granel') ag.granelGramos += efecto.gramos;
    else if (efecto.tipo === 'unidad') ag.unidades += efecto.unidades;
    agregados.set(efecto.productoId, ag);
  }

  if (costos.size !== agregados.size) {
    throw new EstadoCompraInvalidoError(
      `efectosProducto trae ${costos.size} productos y los ítems referencian ${agregados.size}.`,
    );
  }
  return agregados;
}

/** Crea un movimiento `ingreso_compra` (origen la compra) dentro del batch. */
function agregarMovimientoIngreso(
  batch: ReturnType<typeof writeBatch>,
  db: Firestore,
  compraId: string,
  usuarioId: string,
  fecha: Date,
  delta: { productoId: string; piezaId?: string; deltaGramos?: Peso; deltaUnidades?: number },
): void {
  const movRef = doc(collection(db, 'movimientos')).withConverter(movimientoConverter);
  const movimiento: MovimientoStock = {
    id: movRef.id,
    tipo: 'ingreso_compra',
    productoId: delta.productoId,
    piezaId: delta.piezaId,
    deltaGramos: delta.deltaGramos,
    deltaUnidades: delta.deltaUnidades,
    origenTipo: 'compra',
    origenId: compraId,
    usuarioId,
    fecha,
  };
  batch.set(movRef, movimiento);
}
