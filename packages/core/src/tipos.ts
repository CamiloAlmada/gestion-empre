import type { Money } from './money.js';
import type { Peso } from './peso.js';

/**
 * Tipos de dominio de la quesería (ver `docs/02-dominio-quesarte.md`).
 *
 * Convenciones:
 * - Dinero como `Money` (centésimos, entero), peso como `Peso` (gramos, entero).
 *   Nunca `number` pelado para esas magnitudes.
 * - Fechas como `Date`. La conversión a/desde `Timestamp` de Firestore es
 *   responsabilidad de `firebase-kit`, no de dominio.
 * - `id` / `uid`: identificador del documento. En Firestore vive en la ruta
 *   (`productos/{id}`), pero el dominio lo transporta embebido en la entidad para
 *   trazar referencias (p. ej. el desempate por `id` del selector FIFO).
 */

// ── Enumeraciones de dominio ────────────────────────────────────────────────

/** Cómo se le cobra al cliente. */
export type ModoPrecio = 'por_kg' | 'por_unidad';

/** Cómo se controla la existencia del producto. */
export type ModoStock = 'fraccionado_por_pieza' | 'pieza_entera' | 'granel' | 'unidad_simple';

/** Estado de una pieza física. */
export type EstadoPieza = 'disponible' | 'agotada' | 'merma_total';

/** Medio de pago de una venta. */
export type MedioPago = 'efectivo' | 'debito' | 'credito' | 'transferencia';

/** Estado de una venta. La anulación no borra: cambia estado y genera reversos. */
export type EstadoVenta = 'completada' | 'anulada';

/** Tipo de un movimiento de stock (auditoría inmutable). */
export type TipoMovimiento =
  | 'ingreso_compra'
  | 'venta'
  | 'ajuste_positivo'
  | 'ajuste_negativo'
  | 'merma'
  | 'devolucion';

/** Rol del usuario. Gobierna permisos en las reglas de Firestore. */
export type Rol = 'admin' | 'vendedor';

// ── Entidades ───────────────────────────────────────────────────────────────

/**
 * Catálogo. Combina dos dimensiones independientes: `modoPrecio` (cómo se cobra) y
 * `modoStock` (cómo se controla la existencia).
 */
export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  modoPrecio: ModoPrecio;
  modoStock: ModoStock;
  /** Precio de venta: por kg si `modoPrecio === 'por_kg'`, por unidad si `'por_unidad'`. */
  precioVentaCents: Money;
  /** Cache derivado (promedio ponderado de ingresos). Fuente de verdad: compras/piezas. */
  costoPromedioCents: Money;
  /** Margen objetivo en puntos porcentuales (p. ej. `40` = 40 %). Opcional. */
  margenObjetivoPct?: number;
  /** Stock agregado en gramos. Solo `modoStock === 'granel'`. */
  stockGranelGramos?: Peso;
  /** Stock agregado en unidades enteras. Solo `modoStock === 'unidad_simple'`. */
  stockUnidades?: number;
  /** Umbral para alertar stock bajo (gramos o unidades según `modoStock`). */
  umbralAlertaStock?: number;
  activo: boolean;
  actualizadoEn: Date;
}

/**
 * Objeto físico con peso propio: una rueda de queso, un salame. Solo para
 * productos con `modoStock` `fraccionado_por_pieza` o `pieza_entera`.
 */
export interface Pieza {
  id: string;
  productoId: string;
  pesoInicialGramos: Peso;
  pesoRestanteGramos: Peso;
  /** Costo real por kg, heredado de la compra de origen (ver `docs/03`). */
  costoKgCents: Money;
  /** Compra de origen. Ausente si la pieza se cargó manualmente sin compra. */
  compraId?: string;
  fechaIngreso: Date;
  fechaVencimiento?: Date;
  estado: EstadoPieza;
}

/**
 * Ítem de una venta, embebido y denormalizado: nombre y precio quedan congelados
 * al momento de la venta (las ventas son inmutables).
 */
export interface ItemVenta {
  productoId: string;
  /** Nombre del producto congelado al momento de la venta. */
  nombreProducto: string;
  /** Pieza descontada, si el producto se controla por piezas. */
  piezaId?: string;
  /** Peso vendido (productos al peso). Excluyente con `unidades`. */
  gramos?: Peso;
  /** Cantidad vendida (productos por unidad). Excluyente con `gramos`. */
  unidades?: number;
  /** Precio unitario congelado: por kg o por unidad según el producto. */
  precioUnitCents: Money;
  subtotalCents: Money;
}

/** Ticket de mostrador. Cabecera + ítems embebidos. */
export interface Venta {
  id: string;
  /** Número correlativo de comprobante, legible por humanos. */
  numero: number;
  fecha: Date;
  usuarioId: string;
  items: ItemVenta[];
  totalCents: Money;
  medioPago: MedioPago;
  estado: EstadoVenta;
}

/**
 * Registro inmutable de auditoría de todo cambio de stock. Referencia el documento
 * de origen (venta / compra / ajuste) que lo provocó.
 */
export interface MovimientoStock {
  id: string;
  tipo: TipoMovimiento;
  productoId: string;
  /** Pieza afectada, si el movimiento es a nivel de pieza. */
  piezaId?: string;
  /** Delta en gramos (productos al peso). Positivo suma, negativo descuenta. */
  deltaGramos?: Peso;
  /** Delta en unidades (`unidad_simple`). Positivo suma, negativo descuenta. */
  deltaUnidades?: number;
  /** Clase de documento que originó el movimiento. */
  origenTipo: 'venta' | 'compra' | 'ajuste';
  /** Id del documento de origen (`origenTipo`). */
  origenId: string;
  usuarioId: string;
  fecha: Date;
  nota?: string;
}

/** Usuario de la app. `uid` proviene de Firebase Auth y es la clave del documento. */
export interface Usuario {
  uid: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}
