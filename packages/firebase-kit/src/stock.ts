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
  type EstadoPieza,
  type MovimientoStock,
  type Peso,
  type Pieza,
  type Producto,
} from '@gestion/core';
import { movimientoConverter } from './converters/movimiento';
import { piezaConverter } from './converters/pieza';
import { AjusteInvalidoError, IngresoInvalidoError, StockInsuficienteError } from './errores';

/**
 * Ajustes manuales de stock y mermas (pantallas de Fase C).
 *
 * Comparte las decisiones de arquitectura de `ventas.ts`: un solo `writeBatch`
 * atómico y offline-first, decrementos/incrementos con `increment()` (nunca el
 * valor absoluto del cliente), y validación local que falla rápido con errores
 * de dominio en español antes de tocar el batch.
 */

type UpdateStock = Record<string, FieldValue | EstadoPieza>;

/** Tipo de ajuste manual: suma, resta o merma (pérdida física). */
export type TipoAjuste = 'ajuste_positivo' | 'ajuste_negativo' | 'merma';

/**
 * Entrada de `ajustarStock`. El delta va con SIGNO ya resuelto por la UI y debe
 * ser coherente con `tipo`: `ajuste_positivo` ⇒ delta > 0; `ajuste_negativo` y
 * `merma` ⇒ delta < 0. Según el `modoStock` del producto se usa `deltaGramos`
 * (pieza o granel) o `deltaUnidades` (`unidad_simple`).
 */
export interface EntradaAjuste {
  /** Uid de quien ajusta (en la práctica, admin). */
  usuarioId: string;
  tipo: TipoAjuste;
  producto: Producto;
  /** Pieza a ajustar. Requerida en `fraccionado_por_pieza` y `pieza_entera`. */
  pieza?: Pieza;
  /** Delta con signo en gramos (pieza o granel). */
  deltaGramos?: Peso;
  /** Delta con signo en unidades (`unidad_simple`). */
  deltaUnidades?: number;
  /** Nota de auditoría opcional (motivo del ajuste/merma). */
  nota?: string;
}

interface EfectoAjuste {
  coleccion: 'piezas' | 'productos';
  refId: string;
  stockUpdate: UpdateStock;
  deltaGramos?: Peso;
  deltaUnidades?: number;
}

/**
 * Aplica un ajuste manual o merma en UN batch atómico: un update de stock (pieza
 * o producto, vía `increment()`) + un `movimientos/{id}` del `tipo` indicado con
 * `nota` opcional. Una merma que agota una pieza además la marca `merma_total`.
 *
 * No hay documento de origen separado para los ajustes: el propio movimiento ES
 * el registro del ajuste, por eso `origenTipo: 'ajuste'` y `origenId` apunta a su
 * propio id.
 *
 * @throws {AjusteInvalidoError} si el signo del delta no corresponde al `tipo`,
 *   falta el delta correcto para el `modoStock`, o falta la pieza.
 * @throws {StockInsuficienteError} si el ajuste dejaría el stock negativo.
 */
export async function ajustarStock(db: Firestore, entrada: EntradaAjuste): Promise<void> {
  const efecto = resolverEfectoAjuste(entrada);

  const ahora = new Date();
  const batch = writeBatch(db);

  batch.update(doc(db, efecto.coleccion, efecto.refId), efecto.stockUpdate);

  const movRef = doc(collection(db, 'movimientos')).withConverter(movimientoConverter);
  const movimiento: MovimientoStock = {
    id: movRef.id,
    tipo: entrada.tipo,
    productoId: entrada.producto.id,
    piezaId: entrada.pieza?.id,
    deltaGramos: efecto.deltaGramos,
    deltaUnidades: efecto.deltaUnidades,
    origenTipo: 'ajuste',
    origenId: movRef.id,
    usuarioId: entrada.usuarioId,
    fecha: ahora,
    nota: entrada.nota,
  };
  batch.set(movRef, movimiento);

  await batch.commit();
}

// ── Resolución del efecto ───────────────────────────────────────────────────

function resolverEfectoAjuste(entrada: EntradaAjuste): EfectoAjuste {
  const { tipo, producto } = entrada;

  switch (producto.modoStock) {
    case 'unidad_simple': {
      const delta = exigirDeltaUnidades(entrada);
      validarSigno(delta, tipo);
      const stock = producto.stockUnidades ?? 0;
      exigirResultadoNoNegativo(stock + delta, `unidades de ${producto.id}`);
      return {
        coleccion: 'productos',
        refId: producto.id,
        stockUpdate: { stockUnidades: increment(delta) },
        deltaUnidades: delta,
      };
    }

    case 'granel': {
      const delta = exigirDeltaGramos(entrada);
      validarSigno(delta, tipo);
      const stock = producto.stockGranelGramos ?? 0;
      exigirResultadoNoNegativo(stock + delta, `granel de ${producto.id}`);
      return {
        coleccion: 'productos',
        refId: producto.id,
        stockUpdate: { stockGranelGramos: increment(delta) },
        deltaGramos: peso(delta),
      };
    }

    case 'fraccionado_por_pieza':
    case 'pieza_entera': {
      const pieza = exigirPieza(entrada.pieza, producto);
      const delta = exigirDeltaGramos(entrada);
      validarSigno(delta, tipo);
      const resultante = pieza.pesoRestanteGramos + delta;
      exigirResultadoNoNegativo(resultante, `pieza ${pieza.id}`);
      // Una merma que deja la pieza en 0 la marca como pérdida total.
      const stockUpdate: UpdateStock = { pesoRestanteGramos: increment(delta) };
      if (tipo === 'merma' && resultante === 0) {
        stockUpdate.estado = 'merma_total';
      }
      return {
        coleccion: 'piezas',
        refId: pieza.id,
        stockUpdate,
        deltaGramos: peso(delta),
      };
    }
  }
}

// ── Validaciones ────────────────────────────────────────────────────────────

/** El signo del delta debe corresponder al tipo de ajuste; nunca cero. */
function validarSigno(delta: number, tipo: TipoAjuste): void {
  if (delta === 0) {
    throw new AjusteInvalidoError('El delta de un ajuste no puede ser cero.');
  }
  const debePositivo = tipo === 'ajuste_positivo';
  if (debePositivo && delta < 0) {
    throw new AjusteInvalidoError(`'${tipo}' requiere un delta positivo, recibió ${delta}.`);
  }
  if (!debePositivo && delta > 0) {
    throw new AjusteInvalidoError(`'${tipo}' requiere un delta negativo, recibió ${delta}.`);
  }
}

function exigirResultadoNoNegativo(resultante: number, contexto: string): void {
  if (resultante < 0) {
    throw new StockInsuficienteError(`El ajuste dejaría ${contexto} en ${resultante} (< 0).`);
  }
}

function exigirDeltaGramos(entrada: EntradaAjuste): Peso {
  if (entrada.deltaGramos === undefined) {
    throw new AjusteInvalidoError(
      `El producto ${entrada.producto.id} (${entrada.producto.modoStock}) requiere deltaGramos.`,
    );
  }
  if (entrada.deltaUnidades !== undefined) {
    throw new AjusteInvalidoError(
      `El producto ${entrada.producto.id} va por peso: no lleva deltaUnidades.`,
    );
  }
  return entrada.deltaGramos;
}

function exigirDeltaUnidades(entrada: EntradaAjuste): number {
  if (entrada.deltaUnidades === undefined) {
    throw new AjusteInvalidoError(`El producto ${entrada.producto.id} requiere deltaUnidades.`);
  }
  if (!Number.isInteger(entrada.deltaUnidades)) {
    throw new AjusteInvalidoError(
      `deltaUnidades de ${entrada.producto.id} debe ser entero, recibió ${entrada.deltaUnidades}.`,
    );
  }
  if (entrada.deltaGramos !== undefined) {
    throw new AjusteInvalidoError(
      `El producto ${entrada.producto.id} va por unidades: no lleva deltaGramos.`,
    );
  }
  return entrada.deltaUnidades;
}

function exigirPieza(pieza: Pieza | undefined, producto: Producto): Pieza {
  if (pieza === undefined) {
    throw new AjusteInvalidoError(
      `El producto ${producto.id} (${producto.modoStock}) requiere una pieza.`,
    );
  }
  return pieza;
}

// ── Ingreso manual de piezas ──────────────────────────────────────────────────

/** Una pieza física declarada en el alta manual (peso y vencimiento opcional). */
export interface PiezaIngreso {
  /** Peso de la pieza recién ingresada, en gramos. Debe ser > 0. */
  pesoInicialGramos: Peso;
  /** Vencimiento opcional. No puede ser anterior a hoy. */
  fechaVencimiento?: Date;
}

/**
 * Entrada de `ingresarPiezas`. Da de alta N piezas físicas del mismo `producto`
 * (que debe controlarse por piezas). El costo de cada pieza se hereda del
 * `costoPromedioCents` del producto (ver nota en `ingresarPiezas`).
 */
export interface EntradaIngresoPiezas {
  /** Producto al que pertenecen las piezas. Debe ir por piezas. */
  producto: Producto;
  /** Uid de quien ingresa (en la práctica, admin). */
  usuarioId: string;
  /** Piezas físicas a crear. Al menos una. */
  piezas: PiezaIngreso[];
}

/**
 * Da de alta manual N piezas físicas (ruedas de queso, salames) en UN batch
 * atómico. Es la hermana de `ajustarStock`: aquel incrementa el stock de piezas
 * que YA existen; este CREA piezas nuevas cuando entra mercadería sin pasar por
 * el módulo de compras (Fase 2).
 *
 * Por cada pieza declarada: crea `piezas/{id}` (`pesoInicialGramos` ==
 * `pesoRestanteGramos`, `estado: 'disponible'`, `fechaIngreso` = ahora) y su
 * `movimientos/{id}` de `tipo: 'ajuste_positivo'` con `deltaGramos` positivo. Como
 * en `ajustarStock`, el propio movimiento ES el registro del ingreso:
 * `origenTipo: 'ajuste'` y `origenId` apunta a su propio id.
 *
 * El costo de cada pieza se hereda de `producto.costoPromedioCents`, que en Fase 1
 * puede ser `money(0)`. En Fase 2 el ingreso por compra (`docs/03`) fija el costo
 * real por kg de la mercadería y reemplaza esta herencia.
 *
 * @throws {IngresoInvalidoError} si el producto no va por piezas, la lista está
 *   vacía, algún `pesoInicialGramos` no es positivo, o una `fechaVencimiento` es
 *   anterior a hoy.
 */
export async function ingresarPiezas(
  db: Firestore,
  entrada: EntradaIngresoPiezas,
): Promise<{ piezaIds: string[] }> {
  const { producto, usuarioId, piezas } = entrada;
  validarIngreso(producto, piezas);

  const ahora = new Date();
  const batch = writeBatch(db);
  const piezaIds: string[] = [];

  for (const declarada of piezas) {
    const piezaRef = doc(collection(db, 'piezas')).withConverter(piezaConverter);
    const pieza: Pieza = {
      id: piezaRef.id,
      productoId: producto.id,
      pesoInicialGramos: declarada.pesoInicialGramos,
      pesoRestanteGramos: declarada.pesoInicialGramos,
      // Fase 1: el ingreso manual hereda el costo promedio (puede ser money(0)).
      // Fase 2: lo reemplaza el costo real por kg del módulo de compras (docs/03).
      costoKgCents: producto.costoPromedioCents,
      fechaIngreso: ahora,
      fechaVencimiento: declarada.fechaVencimiento,
      estado: 'disponible',
    };
    batch.set(piezaRef, pieza);

    const movRef = doc(collection(db, 'movimientos')).withConverter(movimientoConverter);
    const movimiento: MovimientoStock = {
      id: movRef.id,
      tipo: 'ajuste_positivo',
      productoId: producto.id,
      piezaId: piezaRef.id,
      deltaGramos: declarada.pesoInicialGramos,
      origenTipo: 'ajuste',
      origenId: movRef.id,
      usuarioId,
      fecha: ahora,
    };
    batch.set(movRef, movimiento);

    piezaIds.push(piezaRef.id);
  }

  await batch.commit();
  return { piezaIds };
}

function validarIngreso(producto: Producto, piezas: PiezaIngreso[]): void {
  if (producto.modoStock !== 'fraccionado_por_pieza' && producto.modoStock !== 'pieza_entera') {
    throw new IngresoInvalidoError(
      `El producto ${producto.id} (${producto.modoStock}) no se controla por piezas; ` +
        'usá ajustarStock para granel o unidades.',
    );
  }
  if (piezas.length === 0) {
    throw new IngresoInvalidoError(`El ingreso de ${producto.id} no tiene piezas.`);
  }
  // Piso del día de hoy: una fecha anterior a la medianoche de hoy es "vencida".
  const inicioDeHoy = new Date();
  inicioDeHoy.setHours(0, 0, 0, 0);
  for (const [i, pieza] of piezas.entries()) {
    if (pieza.pesoInicialGramos <= 0) {
      throw new IngresoInvalidoError(
        `La pieza #${i + 1} de ${producto.id} tiene un peso no positivo (${pieza.pesoInicialGramos} g).`,
      );
    }
    if (pieza.fechaVencimiento !== undefined && pieza.fechaVencimiento < inicioDeHoy) {
      throw new IngresoInvalidoError(
        `La pieza #${i + 1} de ${producto.id} vence antes de hoy (${pieza.fechaVencimiento.toISOString()}).`,
      );
    }
  }
}
