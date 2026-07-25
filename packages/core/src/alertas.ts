import {
  calcularResumen,
  estadoVencimiento,
  diasHastaVencimiento,
  stockBajo,
  type ContextoAlertas,
  type EstadoVencimientoActivo,
} from './stock.js';
import { sumarPeso, type Peso } from './peso.js';
import type { Pieza, Producto } from './tipos.js';

/**
 * Alertas operativas de stock: **qué está por vencer** y **qué está bajo el
 * mínimo**. Tarea B3 de `docs/PLAN-ACTIVO.md` (criterio 3 del dueño,
 * `docs/04-plan-fases.md:480`).
 *
 * La decisión que habilita es de plata concreta: una horma que está por vencer
 * se remata o se promociona ANTES de perderla.
 *
 * **Una sola función para las dos pantallas.** `evaluarAlertas` es el único
 * lugar del proyecto que decide qué está en alerta. La franja de la pantalla
 * Productos y el reporte de Reportes consumen ESTE resultado (la primera
 * cuenta, el segundo detalla): no hay dos caminos que puedan divergir y
 * terminar contradiciéndose en pantalla. Riesgo explícito anotado en el plan.
 *
 * Todo lo temporal viaja en `ContextoAlertas` (ver `stock.ts`): ni `new Date()`
 * ni huso horario acá adentro.
 */

/** Una pieza concreta que dispara alerta de vencimiento. */
export interface PiezaEnAlerta {
  readonly pieza: Pieza;
  readonly estado: EstadoVencimientoActivo;
  /** Días de calendario hasta vencer: `0` = hoy, `-2` = venció anteayer. */
  readonly diasRestantes: number;
}

/**
 * Alerta de vencimiento de UN producto, con el detalle de sus piezas en
 * alerta. Agrupa por producto y no por pieza porque la decisión ("¿remato el
 * queso Colonia?") es por producto; el detalle por pieza está adentro para que
 * la pantalla pueda decir CUÁNTO y PARA CUÁNDO sin recalcular nada.
 */
export interface AlertaVencimiento {
  readonly productoId: string;
  readonly nombreProducto: string;
  /** El estado más severo entre las piezas en alerta ('vencida' gana). */
  readonly peorEstado: EstadoVencimientoActivo;
  /** Días restantes de la pieza MÁS urgente (el mínimo; negativo si venció). */
  readonly diasRestantesMin: number;
  /** Peso restante sumado de las piezas EN ALERTA (no del producto entero). */
  readonly pesoEnAlertaGramos: Peso;
  /** Piezas en alerta, de la más urgente a la menos. */
  readonly piezas: readonly PiezaEnAlerta[];
}

/**
 * En qué se miden `existencia` y `umbral` de una alerta de stock bajo:
 * `'peso'` ⇒ GRAMOS enteros; `'unidades'` ⇒ unidades enteras.
 */
export type MagnitudStock = 'peso' | 'unidades';

/**
 * Alerta de stock bajo de UN producto. `existencia` y `umbral` son números
 * planos en la unidad que indica `magnitud` (mismo criterio que
 * `Producto.umbralAlertaStock`, que tampoco está brandeado): el formateo es
 * responsabilidad de la UI.
 */
export interface AlertaStockBajo {
  readonly productoId: string;
  readonly nombreProducto: string;
  readonly magnitud: MagnitudStock;
  /** Existencia actual, en la unidad de `magnitud`. */
  readonly existencia: number;
  /** Umbral configurado del producto, en la unidad de `magnitud`. */
  readonly umbral: number;
  /**
   * Qué fracción del umbral queda en existencia (`0.4` = 40 % del mínimo).
   * Adimensional a propósito: es lo único que permite ordenar por urgencia una
   * lista que mezcla gramos con unidades. Umbral ≤ 0 ⇒ `0`.
   */
  readonly proporcionDelUmbral: number;
}

/** Las dos listas de alertas, cada una ordenada por urgencia. */
export interface Alertas {
  /** Por vencer, de la más urgente (vencida hace más tiempo) a la menos. */
  readonly porVencer: readonly AlertaVencimiento[];
  /** Bajo el mínimo, del más desabastecido al menos. */
  readonly bajoUmbral: readonly AlertaStockBajo[];
}

function proporcionDelUmbral(existencia: number, umbral: number): number {
  return umbral > 0 ? existencia / umbral : 0;
}

/**
 * Evalúa las dos alertas sobre los productos dados.
 *
 * @param productos productos a evaluar. El llamador decide el recorte —
 *   ambas pantallas pasan SOLO los activos: un producto dado de baja no tiene
 *   que reponerse ni rematarse (contrato de `docs/06-ui-ux.md` §2, "las
 *   alertas se calculan SOLO sobre activos").
 * @param piezasPorProducto piezas DISPONIBLES agrupadas por `productoId`
 *   (`agruparPiezasPorProducto`). Un producto sin entrada se evalúa sin piezas.
 * @param ctx instante, huso y días de anticipación (ver `ContextoAlertas`).
 *
 * Solo entran a `porVencer` los productos POR PIEZA (`fraccionado_por_pieza` /
 * `pieza_entera`) con piezas cuyo `estadoVencimiento` no es `null`: una pieza
 * sin `fechaVencimiento` (frutos secos, especias) nunca alerta, y
 * `pesoEnAlertaGramos` suma únicamente las que alertan — decir "3,2 kg por
 * vencer" cuando 3 de esos kg vencen recién en noviembre sería inflar el
 * problema y enseñar a ignorar el aviso.
 *
 * @throws {RangeError} si `ctx` es inválido (ver `estadoVencimiento`).
 */
export function evaluarAlertas(
  productos: readonly Producto[],
  piezasPorProducto: ReadonlyMap<string, Pieza[]>,
  ctx: ContextoAlertas,
): Alertas {
  const porVencer: AlertaVencimiento[] = [];
  const bajoUmbral: AlertaStockBajo[] = [];

  for (const producto of productos) {
    const piezasDelProducto = piezasPorProducto.get(producto.id) ?? [];
    const resumen = calcularResumen(producto, piezasDelProducto);

    const enAlerta: PiezaEnAlerta[] = [];
    // Solo los productos POR PIEZA tienen vencimiento (contrato de siempre de
    // la franja de Productos). En `granel`/`unidad_simple` el stock es un
    // agregado sin piezas: una pieza colgada de uno de esos productos no cuenta
    // para su existencia, así que tampoco puede alertar por vencer — sería
    // avisar por mercadería que la app no considera que exista.
    if (resumen.tipo === 'piezas') {
      for (const pieza of piezasDelProducto) {
        // El `undefined` se descarta acá (y no vía `estadoVencimiento`) para
        // que `fechaVencimiento` quede narrowada a `Date` en
        // `diasHastaVencimiento`: sin esto haría falta un cast, y un cast es
        // una afirmación sin prueba.
        const fecha = pieza.fechaVencimiento;
        if (fecha === undefined) continue;
        const estado = estadoVencimiento(fecha, ctx);
        if (estado === null) continue;
        enAlerta.push({ pieza, estado, diasRestantes: diasHastaVencimiento(fecha, ctx) });
      }
    }

    if (enAlerta.length > 0) {
      enAlerta.sort((a, b) => a.diasRestantes - b.diasRestantes);
      const primera = enAlerta[0]!;
      porVencer.push({
        productoId: producto.id,
        nombreProducto: producto.nombre,
        peorEstado: enAlerta.some((p) => p.estado === 'vencida') ? 'vencida' : 'vence_pronto',
        diasRestantesMin: primera.diasRestantes,
        pesoEnAlertaGramos: sumarPeso(...enAlerta.map((p) => p.pieza.pesoRestanteGramos)),
        piezas: enAlerta,
      });
    }

    const umbral = producto.umbralAlertaStock;
    // `umbral !== undefined` es redundante con `stockBajo` (sin umbral nunca
    // hay alerta), pero es lo que narrowea el tipo sin recurrir a un `!`.
    if (umbral !== undefined && stockBajo(producto, resumen)) {
      const existencia = resumen.tipo === 'unidad' ? resumen.unidades : resumen.pesoTotalGramos;
      bajoUmbral.push({
        productoId: producto.id,
        nombreProducto: producto.nombre,
        magnitud: resumen.tipo === 'unidad' ? 'unidades' : 'peso',
        existencia,
        umbral,
        proporcionDelUmbral: proporcionDelUmbral(existencia, umbral),
      });
    }
  }

  // Orden por urgencia, con el nombre como desempate estable: dos productos
  // que vencen el mismo día no pueden bailar de posición entre renders.
  porVencer.sort(
    (a, b) =>
      a.diasRestantesMin - b.diasRestantesMin || a.nombreProducto.localeCompare(b.nombreProducto, 'es'),
  );
  bajoUmbral.sort(
    (a, b) =>
      a.proporcionDelUmbral - b.proporcionDelUmbral ||
      a.nombreProducto.localeCompare(b.nombreProducto, 'es'),
  );

  return { porVencer, bajoUmbral };
}
