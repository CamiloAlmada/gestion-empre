import { periodoDe } from './periodo.js';
import { peso, sumarPeso, type Peso } from './peso.js';
import type { Pieza, Producto } from './tipos.js';

/**
 * Existencias y estado de vencimiento de un producto: agrupación de piezas,
 * resumen según `modoStock`, y los dos criterios de alerta del negocio
 * (**por vencer** y **bajo el umbral de stock**).
 *
 * Vivía en `apps/quesarte/src/componentes/stock/resumen.ts` (pantalla
 * Productos). Se mudó acá en la tarea B3 (alertas de Reportes,
 * `docs/PLAN-ACTIVO.md`) porque dos pantallas distintas necesitan la MISMA
 * respuesta a "¿esto está por vencer?" / "¿esto está bajo mínimo?": con dos
 * implementaciones se contradicen y el usuario no sabe a cuál creerle. Lo que
 * quedó en la app es solo presentación (`formatearFecha`, `textoResumen`).
 *
 * **Fechas y huso por parámetro** (regla de oro 1, mismo criterio que
 * `periodo.ts`): nada de `new Date()` ni de la zona horaria del dispositivo
 * acá adentro. Todo el estado de vencimiento se calcula contra un
 * `ContextoAlertas` explícito — quien llama decide cuál es el "hoy", en qué
 * huso, y con cuántos días de anticipación se avisa.
 */

const MS_POR_DIA = 86_400_000;

// ── Días de aviso de vencimiento (config del negocio) ───────────────────────

/**
 * Anticipación por defecto con la que se avisa un vencimiento, cuando el
 * negocio no configuró la suya (`configuracion/general.diasAvisoVencimiento`).
 *
 * Siete días por dos motivos, en este orden:
 * 1. Es **una semana entera de venta**. La quesería vende en ferias y en el
 *    mostrador con ciclo semanal: una pieza marcada hoy tiene garantizada al
 *    menos una feria más antes de vencer, que es exactamente la ventana en la
 *    que rematarla o promocionarla todavía sirve.
 * 2. Es el valor que la app YA usaba (constante `DIAS_VENCE_PRONTO` de la
 *    pantalla Productos). Hacer configurable un umbral NO es excusa para
 *    cambiarle el significado al badge que el dueño ya viene leyendo: sin
 *    tocar nada, la app se comporta igual que antes.
 */
export const DIAS_AVISO_VENCIMIENTO_DEFAULT = 7;

/** Mínimo configurable. Con 0 el aviso llegaría el día del vencimiento: tarde. */
export const DIAS_AVISO_VENCIMIENTO_MIN = 1;

/**
 * Máximo configurable. Más allá de un trimestre el aviso deja de señalar algo
 * a resolver y pasa a marcar el inventario entero — un aviso que grita todos
 * los días por cosas que no importan enseña a ignorarlo.
 */
export const DIAS_AVISO_VENCIMIENTO_MAX = 90;

/** `true` si `valor` es un entero dentro del rango configurable de días de aviso. */
export function diasAvisoValido(valor: unknown): valor is number {
  return (
    typeof valor === 'number' &&
    Number.isInteger(valor) &&
    valor >= DIAS_AVISO_VENCIMIENTO_MIN &&
    valor <= DIAS_AVISO_VENCIMIENTO_MAX
  );
}

/**
 * Días de aviso efectivos a partir de lo que traiga la configuración: el valor
 * configurado si es válido, el default si está ausente o fuera de rango.
 *
 * Nunca lanza: un documento de configuración corrupto no puede dejar sin
 * alertas a la pantalla (las reglas de Firestore ya son el backstop del rango;
 * esto es la red de la red).
 */
export function normalizarDiasAviso(valor: number | undefined): number {
  return diasAvisoValido(valor) ? valor : DIAS_AVISO_VENCIMIENTO_DEFAULT;
}

// ── Contexto de evaluación ──────────────────────────────────────────────────

/**
 * Todo lo que hace falta para decidir si algo "está por vencer", explícito y
 * sin ambigüedad. Lo arma quien llama (un hook de la app), una vez por
 * pantalla, y viaja igual a todos los cálculos: así el conteo de la franja, el
 * badge de cada fila y el reporte de Reportes NO pueden discrepar.
 */
export interface ContextoAlertas {
  /** Instante de referencia ("hoy"). Fijo mientras dure la pantalla. */
  readonly ahora: Date;
  /** Minutos a sumar a UTC para obtener la fecha local del negocio (ver `periodo.ts`). */
  readonly offsetMinutos: number;
  /** Anticipación del aviso, en días de calendario. Entero ≥ 0. */
  readonly diasAviso: number;
}

function exigirDiasAviso(diasAviso: number): void {
  if (!Number.isInteger(diasAviso) || diasAviso < 0) {
    throw new RangeError(`diasAviso debe ser un entero ≥ 0, recibió: ${diasAviso}`);
  }
}

// ── Agrupación y resumen de existencias ─────────────────────────────────────

/** Resumen de existencias de UN producto, según su `modoStock`. */
export type ResumenStock =
  | { tipo: 'piezas'; cantidadPiezas: number; pesoTotalGramos: Peso; vencimientoProximo: Date | null }
  | { tipo: 'granel'; pesoTotalGramos: Peso }
  | { tipo: 'unidad'; unidades: number };

/**
 * Agrupa piezas por `productoId`. Base para hacer UNA sola query de `piezas`
 * (estado disponible) y derivar el resumen de cada producto en memoria, en vez
 * de una query por producto.
 */
export function agruparPiezasPorProducto(piezas: readonly Pieza[]): Map<string, Pieza[]> {
  const mapa = new Map<string, Pieza[]>();
  for (const pieza of piezas) {
    const lista = mapa.get(pieza.productoId);
    if (lista !== undefined) {
      lista.push(pieza);
    } else {
      mapa.set(pieza.productoId, [pieza]);
    }
  }
  return mapa;
}

/**
 * Calcula el resumen de existencias de un producto. `piezasDelProducto` debe
 * venir ya filtrada (piezas disponibles de ESE producto); se ignora si el
 * `modoStock` es `granel`/`unidad_simple`.
 *
 * NO usa aritmética propia de gramos: todo total de peso se arma con
 * `sumarPeso` (regla dura del proyecto).
 */
export function calcularResumen(producto: Producto, piezasDelProducto: readonly Pieza[]): ResumenStock {
  switch (producto.modoStock) {
    case 'fraccionado_por_pieza':
    case 'pieza_entera': {
      const pesoTotalGramos = sumarPeso(...piezasDelProducto.map((p) => p.pesoRestanteGramos));
      const vencimientos = piezasDelProducto
        .map((p) => p.fechaVencimiento)
        .filter((fecha): fecha is Date => fecha !== undefined)
        .sort((a, b) => a.getTime() - b.getTime());
      return {
        tipo: 'piezas',
        cantidadPiezas: piezasDelProducto.length,
        pesoTotalGramos,
        vencimientoProximo: vencimientos[0] ?? null,
      };
    }
    case 'granel':
      return { tipo: 'granel', pesoTotalGramos: producto.stockGranelGramos ?? peso(0) };
    case 'unidad_simple':
      return { tipo: 'unidad', unidades: producto.stockUnidades ?? 0 };
  }
}

// ── Vencimiento ─────────────────────────────────────────────────────────────

/** Estado de vencimiento de una fecha, o `null` si no aplica ninguna alerta. */
export type EstadoVencimiento = 'vencida' | 'vence_pronto' | null;

/** Estado de vencimiento que SÍ es una alerta (el `null` excluido del tipo). */
export type EstadoVencimientoActivo = Exclude<EstadoVencimiento, null>;

/**
 * Días de calendario entre "hoy" y `fechaVencimiento`, en el huso del negocio:
 * `0` = vence hoy, `3` = vence en tres días, `-2` = venció anteayer.
 *
 * Compara días de calendario, NO instantes: una pieza que vence hoy a las 8 de
 * la mañana sigue siendo "vence hoy" a las 6 de la tarde. Ambas fechas se
 * pisan a la medianoche local con `periodoDe(…, 'dia', …)` — la misma
 * definición de "día" que usan los reportes de período, no una segunda.
 *
 * @throws {RangeError} si alguna fecha es inválida o `offsetMinutos` no es finito.
 */
export function diasHastaVencimiento(fechaVencimiento: Date, ctx: ContextoAlertas): number {
  const inicioHoy = periodoDe(ctx.ahora, 'dia', ctx.offsetMinutos).desde.getTime();
  const inicioVencimiento = periodoDe(fechaVencimiento, 'dia', ctx.offsetMinutos).desde.getTime();
  // Ambos extremos son medianoches locales del mismo huso fijo: la diferencia
  // es un múltiplo exacto de un día. `Math.round` solo blinda contra el error
  // de punto flotante de la división.
  return Math.round((inicioVencimiento - inicioHoy) / MS_POR_DIA);
}

/**
 * Estado de vencimiento de una fecha contra el contexto dado: anterior a hoy ⇒
 * `'vencida'`; hoy o dentro de `ctx.diasAviso` días ⇒ `'vence_pronto'`; más
 * lejos, o sin fecha ⇒ `null`.
 *
 * @throws {RangeError} si `ctx.diasAviso` no es un entero ≥ 0, la fecha es
 *   inválida o `ctx.offsetMinutos` no es finito.
 */
export function estadoVencimiento(
  fechaVencimiento: Date | undefined,
  ctx: ContextoAlertas,
): EstadoVencimiento {
  if (fechaVencimiento === undefined) return null;
  exigirDiasAviso(ctx.diasAviso);

  const dias = diasHastaVencimiento(fechaVencimiento, ctx);
  if (dias < 0) return 'vencida';
  return dias <= ctx.diasAviso ? 'vence_pronto' : null;
}

/** Estado de vencimiento más severo entre varias fechas ('vencida' gana). */
export function peorEstadoVencimiento(
  fechas: readonly (Date | undefined)[],
  ctx: ContextoAlertas,
): EstadoVencimiento {
  let peor: EstadoVencimiento = null;
  for (const fecha of fechas) {
    const estado = estadoVencimiento(fecha, ctx);
    if (estado === 'vencida') return 'vencida';
    if (estado === 'vence_pronto') peor = 'vence_pronto';
  }
  return peor;
}

// ── Stock bajo ──────────────────────────────────────────────────────────────

/**
 * `true` si el resumen está por debajo del `umbralAlertaStock` del producto.
 * Sin umbral definido, nunca hay alerta de stock bajo: la ausencia del umbral
 * es "no me avises", no "avisame siempre".
 */
export function stockBajo(producto: Producto, resumen: ResumenStock): boolean {
  if (producto.umbralAlertaStock === undefined) return false;
  switch (resumen.tipo) {
    case 'piezas':
      return resumen.pesoTotalGramos < producto.umbralAlertaStock;
    case 'granel':
      return resumen.pesoTotalGramos < producto.umbralAlertaStock;
    case 'unidad':
      return resumen.unidades < producto.umbralAlertaStock;
  }
}
