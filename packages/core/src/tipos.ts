import type { Money } from './money.js';
import type { Peso } from './peso.js';
import type { MetodoProrrateo } from './prorrateo.js';

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
  'ingreso_compra' | 'venta' | 'ajuste_positivo' | 'ajuste_negativo' | 'merma' | 'devolucion';

/** Rol del usuario. Gobierna permisos en las reglas de Firestore. */
export type Rol = 'admin' | 'vendedor';

/**
 * De dónde sale la base de costo congelada (ver `CosteoItem`).
 *
 * - `pieza`: el producto se controla por piezas y el costo salió del
 *   `costoKgCents` de la pieza descontada (costo real de su compra de origen).
 * - `promedio`: granel / unidad, SIN una pieza física de por medio. Dos orígenes
 *   posibles según quién congela: una VENTA usa `Producto.costoPromedioCents`
 *   (el cache ponderado vigente); un movimiento `ingreso_compra` (tarea A1b)
 *   usa el costo REAL de ESE ítem (`calcularCostoRealKgCents` /
 *   `calcularCostoRealUnitCents`), nunca el promedio — un ingreso es un hecho
 *   puntual y el promedio mezclaría el stock viejo con el que entra.
 * - `sin_costo`: no había base de costo (producto nunca comprado por el módulo de
 *   Compras). NO se congelan montos: ver la nota de honestidad en `CosteoItem`.
 */
export type FuenteCosteo = 'pieza' | 'promedio' | 'sin_costo';

/**
 * Quién produjo el costo congelado. Es **ortogonal** a `FuenteCosteo`: un costo
 * puede venir de la pieza Y haber sido reconstruido después.
 *
 * - `venta`: lo congeló la operación misma, con los datos vigentes en ese instante.
 * - `backfill`: lo reconstruyó una migración posterior sobre ventas ya escritas.
 *
 * Es el bit que impide que un reporte mezcle dato real con dato estimado.
 */
export type OrigenCosteo = 'venta' | 'backfill';

// ── Entidades ───────────────────────────────────────────────────────────────

/**
 * Vocabulario controlado para agrupar productos (Quesos, Embutidos, Miel…). La
 * define el admin (crear, renombrar, reordenar) y **no se borra** (evita productos
 * huérfanos: una categoría en desuso simplemente no se elige más).
 *
 * El producto guarda el **nombre** de la categoría, no su `id` (denormalizado):
 * renombrar una categoría actualiza su doc y todos sus productos en un batch
 * atómico (ver `renombrarCategoria` en `firebase-kit`). `orden` (entero ≥ 0)
 * controla cómo se agrupan las listas de Stock.
 */
export interface Categoria {
  id: string;
  nombre: string;
  /** Posición en las listas agrupadas de Stock. Entero ≥ 0. */
  orden: number;
}

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
  /**
   * Cache derivado (promedio ponderado de ingresos). Fuente de verdad:
   * compras/piezas. Su unidad depende del `modoStock`: costo por kg para
   * productos al peso, costo por unidad para `unidad_simple`. Lo recalcula la
   * confirmación de una compra (`nuevoCostoPromedio`, doc 03).
   */
  costoPromedioCents: Money;
  /**
   * Margen objetivo **sobre venta**, en basis points enteros (`4000` = 40 %,
   * `10000` = 100 %; ver `BPS_TOTAL` en `margen.ts`). Opcional, aún sin UI que lo
   * escriba. Migró de `margenObjetivoPct` (puntos porcentuales) en F2-E: nunca
   * floats en dominio ni persistencia (doc 03, decisión F2-D).
   */
  margenObjetivoBps?: number;
  /** Stock agregado en gramos. Solo `modoStock === 'granel'`. */
  stockGranelGramos?: Peso;
  /** Stock agregado en unidades enteras. Solo `modoStock === 'unidad_simple'`. */
  stockUnidades?: number;
  /** Umbral para alertar stock bajo (gramos o unidades según `modoStock`). */
  umbralAlertaStock?: number;
  /**
   * Proveedor por defecto al armar una compra de este producto (doc 07). Es solo
   * una sugerencia: la verdad de a quién se le compró está en el historial de
   * compras (Fase 2), no acá.
   */
  proveedorPrincipalId?: string;
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
 * Costo congelado de una línea de operación (ítem de venta hoy; movimiento de
 * merma más adelante). Mapa **opcional y versionado**, embebido en la línea.
 *
 * Por qué congelar: el costo de un producto cambia con cada compra. Leerlo
 * después de vender da un número equivocado, así que la ganancia real solo es
 * calculable si el costo queda fijado en el instante de la operación.
 *
 * Reglas del mapa (no negociables, ver `costeo.ts`):
 * - **`v` adentro; la AUSENCIA del mapa es la versión 0** (líneas escritas antes
 *   de que existiera el congelado). Un consumidor NUNCA pregunta por
 *   `costeo === undefined` a mano: usa `clasificarCosteo`.
 * - **Van los dos montos.** El unitario hace el número auditable ("¿a cuánto me
 *   salía el kg ese día?"); el total elimina la ambigüedad de redondeo:
 *   `ganancia = subtotalCents − costoItemCents` tiene que ser reproducible dentro
 *   de un año sin re-derivar nada.
 * - **Honestidad**: si no hay base de costo (0 o ausente), `fuente` es
 *   `'sin_costo'` y NO se congela ningún monto. Congelar un costo 0 declararía
 *   100 % de ganancia — una mentira que después ningún reporte puede detectar.
 */
export interface CosteoItem {
  /** Versión del esquema de costeo. Hoy siempre `1`. */
  v: 1;
  /** De dónde salió la base de costo (o `'sin_costo'` si no había). */
  fuente: FuenteCosteo;
  /** Dato real de la operación (`'venta'`) o reconstruido (`'backfill'`). */
  origen: OrigenCosteo;
  /**
   * Costo unitario congelado: por kg (líneas al peso) o por unidad — misma
   * convención que `ItemVenta.precioUnitCents`. Ausente si `fuente === 'sin_costo'`.
   */
  costoUnitCents?: Money;
  /**
   * Costo total de la línea, YA redondeado con la MISMA regla que el subtotal
   * (`calcularSubtotal`). Ausente si `fuente === 'sin_costo'`.
   */
  costoItemCents?: Money;
  /**
   * Compra de origen de la pieza (`fuente === 'pieza'`), copiada de
   * `Pieza.compraId`. Deja el reporte "¿el viaje a Colonia rindió?" en un scan
   * plano de ventas, sin join ventas→piezas→compras en el cliente.
   */
  compraId?: string;
}

/**
 * Ítem de una venta, embebido y denormalizado: nombre, precio y costo quedan
 * congelados al momento de la venta (las ventas son inmutables).
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
  /**
   * Costo congelado del ítem. OPCIONAL por retrocompatibilidad: las ventas
   * escritas antes de esta capacidad no lo tienen y su ausencia significa
   * "versión 0", no "costo cero" (ver `CosteoItem` y `clasificarCosteo`).
   */
  costeo?: CosteoItem;
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
  /**
   * Cliente asociado a la venta (opcional). El POS nunca lo exige: la venta
   * anónima es el caso por defecto. Denormalizado: se guardan `id` y `nombre`
   * congelado para no depender de un join al mostrar el historial (ver doc 07).
   */
  clienteId?: string;
  clienteNombre?: string;
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
  /**
   * Costo congelado del movimiento (tarea A1b). OPCIONAL por retrocompatibilidad:
   * los movimientos escritos antes de esta capacidad no lo tienen y su ausencia
   * significa "versión 0", no "costo cero" (mismo criterio que `ItemVenta.costeo`;
   * ver `CosteoItem` y `clasificarCosteo`). Base según el movimiento: el costo de
   * la pieza afectada si el movimiento es a nivel de pieza, o el costo promedio
   * vigente del producto si es a granel/unidad.
   */
  costeo?: CosteoItem;
}

/** Usuario de la app. `uid` proviene de Firebase Auth y es la clave del documento. */
export interface Usuario {
  uid: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}

/**
 * Configuración general del negocio. Documento único (`configuracion/general`),
 * sin `id` propio: no hay colección de configuraciones que trazar por id.
 *
 * TODOS los campos son OPCIONALES: el doc se escribe con merge parcial
 * (`guardarConfiguracionGeneral`, doc 08) y las reglas (`configuracionGeneralValida`)
 * declaran las 4 claves opcionales, así que cualquier subconjunto es un doc legal —
 * incluido el vacío en una instalación recién creada. Cada consumidor aplica su
 * propio default en el punto de uso (p. ej. `metodoProrrateo ?? 'por_valor'`).
 */
export interface Configuracion {
  nombreNegocio?: string;
  /** Umbral de peso restante (gramos) para ofrecer marcar una pieza como agotada. */
  umbralPiezaAgotadaGramos?: Peso;
  /** Reparto de gastos de viaje al confirmar una compra (dedup con `core`). */
  metodoProrrateo?: MetodoProrrateo;
  /**
   * Código de país (solo dígitos, sin `+`) que se antepone a los teléfonos
   * locales al derivar `Cliente.telefonoE164` para armar links `wa.me` (doc 08).
   * Lo edita el admin en Ajustes; la UI se lo pasa a `crearCliente` /
   * `actualizarCliente`. Ausente en un negocio recién instalado: el caller usa el
   * default `'598'` (Uruguay). No es un umbral ni dinero: es una cadena de dígitos.
   */
  codigoPaisDefault?: string;
}

/**
 * Cache denormalizado de estadísticas por cliente (doc 07). NO es la fuente de
 * verdad: se agrega con `FieldValue.increment()` en el mismo batch de la venta y
 * su reversa en la anulación (compatible offline — nunca read-modify-write). La
 * verdad son siempre las ventas.
 *
 * `ticketPromedio` NO se persiste (`increment` no divide): se calcula al mostrar
 * como `totalHistoricoCents / cantidadVentas`.
 */
export interface StatsCliente {
  /** Cantidad de ventas asociadas. `+1` al vender, `−1` al anular. */
  cantidadVentas: number;
  /** Suma histórica gastada. `+total` al vender, `−total` al anular. */
  totalHistoricoCents: Money;
  /**
   * Fechas de primera y última compra: cache APROXIMADO. Se escriben desde el
   * cliente con la fecha de la venta; la anulación NO las rebobina (ver doc 04,
   * Fase 1.5). Para el dato exacto, consultar las ventas del cliente.
   */
  primeraCompra?: Date;
  ultimaCompra?: Date;
}

/**
 * Cliente del mostrador (doc 07). Negocio informal: el único campo obligatorio es
 * `nombre` (un solo campo, con `alias` opcional; no se fuerza apellido). El resto
 * son datos personales de gente real: se guarda lo que sirve al negocio, nada más.
 *
 * No hay borrado físico: se desactiva con `activo: false` (coherente con usuarios).
 */
export interface Cliente {
  id: string;
  nombre: string;
  /** Apodo de mostrador ("Marta la de enfrente"). */
  alias?: string;
  telefono?: string;
  /**
   * Teléfono normalizado a E.164 sin `+` (solo dígitos, con código de país),
   * DERIVADO de `telefono` vía `normalizarTelefono(telefono, codigoPais)` en la
   * escritura (`crearCliente` / `actualizarCliente`, doc 08). Es el número que
   * consume el link `wa.me`; `telefono` guarda el display tal como lo tipeó el
   * usuario. AUSENTE si no hay teléfono o si no es normalizable de forma
   * inequívoca (en ese caso el botón de WhatsApp no se muestra). Los clientes de
   * Fase 1.5 no lo tienen: es válido, la lectura hace fallback (WA-C2).
   */
  telefonoE164?: string;
  email?: string;
  direccion?: string;
  notas?: string;
  fechaAlta: Date;
  activo: boolean;
  stats: StatsCliente;
}

/**
 * Datos de una cuenta bancaria de un proveedor, para transferencias (doc 07).
 * `banco` y `cuenta` obligatorios; `titular` y `moneda` opcionales.
 */
export interface DatosPago {
  banco: string;
  cuenta: string;
  titular?: string;
  moneda?: string;
}

/**
 * Proveedor de mercadería (doc 07). A quién se le compra qué, con datos de pago y
 * de contacto para el viaje/transferencia. Solo lo ve y edita el `admin`: el
 * vendedor no accede a datos bancarios ni costos de proveedor.
 *
 * No hay borrado físico: se desactiva con `activo: false`.
 */
export interface Proveedor {
  id: string;
  /** Razón social o nombre de fantasía. */
  nombre: string;
  contactoNombre?: string;
  telefono?: string;
  email?: string;
  /** Útil: es a dónde hay que viajar a comprar. */
  direccion?: string;
  rut?: string;
  /** Cuentas para transferencias. */
  pagos?: DatosPago[];
  notas?: string;
  fechaAlta: Date;
  activo: boolean;
}

// ── Compras (doc 03) ────────────────────────────────────────────────────────

/**
 * Estado de una compra. Nace en `borrador` (editable, sin efectos); la
 * confirmación la pasa a `confirmada`, que es **inmutable** (correcciones =
 * ajustes de stock, no reversión de la compra — doc 03).
 */
export type EstadoCompra = 'borrador' | 'confirmada';

/** Concepto de un gasto de viaje imputado a una compra (doc 03). */
export type ConceptoGasto = 'combustible' | 'peaje' | 'flete' | 'otro';

/**
 * Gasto de viaje de una compra (combustible, peaje, flete u otro). Al confirmar,
 * el total de gastos se prorratea entre los ítems (doc 03).
 */
export interface GastoCompra {
  concepto: ConceptoGasto;
  descripcion?: string;
  montoCents: Money;
}

/**
 * Detalle de una pieza física declarada en un ítem de compra (productos por
 * pieza). Al confirmar, cada una se materializa como un doc `piezas/{id}` que
 * hereda el `costoRealKgCents` del ítem y queda ligado a la compra (`compraId`).
 */
export interface PiezaCompra {
  pesoGramos: Peso;
  fechaVencimiento?: Date;
}

/**
 * Ítem de una compra. Según el `modoStock` del producto lleva `gramos` (al peso:
 * `fraccionado_por_pieza`, `pieza_entera`, `granel`) o `unidades`
 * (`unidad_simple`), y `piezas` con el detalle físico cuando el producto va por
 * pieza.
 *
 * `gastoProrrateadoCents`, `costoRealCents` y `costoRealKgCents` los calcula la
 * **confirmación** (prorrateo con `core`): están AUSENTES en un borrador y
 * presentes en una compra confirmada. `costoRealKgCents` solo existe para ítems
 * al peso (los de unidad no tienen costo por kg).
 */
export interface ItemCompra {
  productoId: string;
  /** Nombre del producto congelado al momento de la compra (denormalizado). */
  nombreProducto: string;
  /** Peso comprado (ítems al peso). Excluyente con `unidades`. */
  gramos?: Peso;
  /** Cantidad comprada (`unidad_simple`). Excluyente con `gramos`. */
  unidades?: number;
  /** Detalle físico de piezas (productos por pieza). */
  piezas?: PiezaCompra[];
  /** Lo que dice la factura por este ítem (total del ítem). */
  costoFacturaCents: Money;
  /** Gasto de viaje imputado en el prorrateo. Ausente en borrador. */
  gastoProrrateadoCents?: Money;
  /** `costoFacturaCents + gastoProrrateadoCents`. Ausente en borrador. */
  costoRealCents?: Money;
  /** Costo real por kg (ítems al peso). Ausente en borrador y en ítems por unidad. */
  costoRealKgCents?: Money;
}

/**
 * Compra de mercadería con costos de viaje (doc 03). Flujo borrador → confirmada:
 * el borrador es editable y sin efectos; la confirmación (en un batch atómico)
 * aplica el prorrateo, crea las piezas, incrementa el stock agregado, registra los
 * movimientos y recalcula el costo promedio, dejando la compra inmutable.
 *
 * `proveedorId` es opcional solo por retrocompatibilidad (doc 07): las compras
 * nuevas siempre lo llevan; `proveedorNombre` va denormalizado para no depender de
 * un join al listar.
 */
export interface Compra {
  id: string;
  fecha: Date;
  usuarioId: string;
  estado: EstadoCompra;
  proveedorId?: string;
  proveedorNombre: string;
  items: ItemCompra[];
  gastos: GastoCompra[];
  totalFacturaCents: Money;
  totalGastosCents: Money;
  totalRealCents: Money;
}
