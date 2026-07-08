import {
  formatearPeso,
  peso,
  sumarPeso,
  type MovimientoStock,
  type Peso,
  type Pieza,
  type Producto,
  type TipoMovimiento,
} from '@gestion/core';

/**
 * Cálculos puros de la pantalla Stock: agrupación de piezas por producto,
 * resumen de existencias según `modoStock` y estado de alertas (vencimiento,
 * stock bajo). Sin React, sin Firebase: solo transforma los datos que ya
 * trajeron `useCollection` (productos y piezas disponibles).
 *
 * NO usa aritmética propia de gramos: todo total de peso se arma con
 * `sumarPeso` de `@gestion/core` (regla dura del proyecto).
 */

/** Ventana de "vence pronto": 7 días desde hoy, inclusive. */
export const DIAS_VENCE_PRONTO = 7;

/** Resumen de existencias de UN producto, según su `modoStock`. */
export type ResumenStock =
  | { tipo: 'piezas'; cantidadPiezas: number; pesoTotalGramos: Peso; vencimientoProximo: Date | null }
  | { tipo: 'granel'; pesoTotalGramos: Peso }
  | { tipo: 'unidad'; unidades: number };

/**
 * Agrupa piezas por `productoId`. Base para hacer UNA sola `useCollection` de
 * `piezas` (estado disponible) y derivar el resumen de cada producto
 * client-side, en vez de una query por producto.
 */
export function agruparPiezasPorProducto(piezas: Pieza[]): Map<string, Pieza[]> {
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
 */
export function calcularResumen(producto: Producto, piezasDelProducto: Pieza[]): ResumenStock {
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

/** Piso de un `Date` a medianoche, para comparar fechas ignorando la hora. */
function inicioDeDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

/** Estado de vencimiento de una fecha, o `null` si no aplica ninguna alerta. */
export type EstadoVencimiento = 'vencida' | 'vence_pronto' | null;

/**
 * Compara `fechaVencimiento` contra `ahora` (por defecto, `new Date()`)
 * ignorando la hora del día: anterior a hoy ⇒ `'vencida'`; hoy o dentro de
 * `DIAS_VENCE_PRONTO` días ⇒ `'vence_pronto'`; más lejos, o sin fecha ⇒ `null`.
 */
export function estadoVencimiento(
  fechaVencimiento: Date | undefined,
  ahora: Date = new Date(),
): EstadoVencimiento {
  if (fechaVencimiento === undefined) return null;

  const hoy = inicioDeDia(ahora);
  const vencimiento = inicioDeDia(fechaVencimiento);

  if (vencimiento.getTime() < hoy.getTime()) return 'vencida';

  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + DIAS_VENCE_PRONTO);
  if (vencimiento.getTime() <= limite.getTime()) return 'vence_pronto';

  return null;
}

/** Estado de vencimiento más severo entre varias piezas ('vencida' gana). */
export function peorEstadoVencimiento(fechas: (Date | undefined)[], ahora: Date = new Date()): EstadoVencimiento {
  let peor: EstadoVencimiento = null;
  for (const fecha of fechas) {
    const estado = estadoVencimiento(fecha, ahora);
    if (estado === 'vencida') return 'vencida';
    if (estado === 'vence_pronto') peor = 'vence_pronto';
  }
  return peor;
}

/**
 * `true` si el resumen está por debajo del `umbralAlertaStock` del producto.
 * Sin umbral definido, nunca hay alerta de stock bajo.
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

/** Formatea una fecha como `dd/mm/aaaa`, para vencimientos y movimientos. */
export function formatearFecha(fecha: Date): string {
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getFullYear()}`;
}

/** Texto legible del resumen para la fila del producto en la lista maestra. */
export function textoResumen(resumen: ResumenStock): string {
  switch (resumen.tipo) {
    case 'piezas': {
      const piezas = resumen.cantidadPiezas === 1 ? '1 pieza' : `${resumen.cantidadPiezas} piezas`;
      return `${piezas} · ${formatearPeso(resumen.pesoTotalGramos)}`;
    }
    case 'granel':
      return formatearPeso(resumen.pesoTotalGramos);
    case 'unidad':
      return resumen.unidades === 1 ? '1 unidad' : `${resumen.unidades} unidades`;
  }
}

const ETIQUETAS_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ingreso_compra: 'Ingreso por compra',
  venta: 'Venta',
  ajuste_positivo: 'Ajuste (+)',
  ajuste_negativo: 'Ajuste (-)',
  merma: 'Merma',
  devolucion: 'Devolución',
};

/** Etiqueta en español de un `TipoMovimiento`, para el historial de existencias. */
export function etiquetaTipoMovimiento(tipo: TipoMovimiento): string {
  return ETIQUETAS_TIPO_MOVIMIENTO[tipo];
}

/** Delta de un movimiento (gramos o unidades) formateado con signo `+`/`-` explícito. */
export function formatearDeltaMovimiento(movimiento: MovimientoStock): string {
  if (movimiento.deltaGramos !== undefined) {
    const signo = movimiento.deltaGramos > 0 ? '+' : '';
    return `${signo}${formatearPeso(movimiento.deltaGramos)}`;
  }
  if (movimiento.deltaUnidades !== undefined) {
    const signo = movimiento.deltaUnidades > 0 ? '+' : '';
    return `${signo}${movimiento.deltaUnidades} unidades`;
  }
  return '—';
}
