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
import { AjusteInvalidoError, StockInsuficienteError } from './errores';

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
