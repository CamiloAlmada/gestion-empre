import { BPS_TOTAL, type CoberturaCosto, type Granularidad, type VariacionPeriodo } from '@gestion/core';
import type { EstadoComparacionDelta, Tendencia } from '@gestion/ui';

/**
 * Presentación pura (sin React, sin Firebase) de la home de Reportes
 * (Fase 3, tanda B1, docs/PLAN-ACTIVO.md): traduce lo que YA calculó
 * `packages/core` (`periodo.ts`, `reporteVentas.ts`) a texto en español y al
 * `EstadoComparacionDelta` que consume `TarjetaDelta`. Nada acá hace
 * aritmética de plata ni de peso — solo formatea bps y arma strings.
 */

/**
 * Etiquetas en español de un período, según granularidad — CUATRO variantes,
 * no dos: un período puede estar en curso o cerrado (ver `periodoEnCurso`
 * en core), y la comparación honesta contra "en curso" NO es contra el
 * período anterior completo sino contra el mismo TRAMO transcurrido (ver
 * `periodoAnteriorComparable`). Mostrar "Ganancia de este mes" cuando en
 * realidad son 3 días transcurridos sería la misma mentira que motivó la
 * corrección — por eso el título mismo cambia según el estado, sin badge
 * aparte (docs/06-ui-ux.md §3, claridad sobre decoración).
 */
export interface EtiquetasPeriodo {
  /** Ej. "hoy" / "esta semana" / "este mes" — el período YA CERRÓ. */
  readonly actualCerrado: string;
  /** Ej. "lo que va de hoy" / "lo que va de la semana" / "lo que va del mes" — EN CURSO. */
  readonly actualEnCurso: string;
  /** Ej. "ayer" / "la semana anterior" / "el mes anterior" — comparación cerrado-contra-cerrado. */
  readonly anteriorCerrado: string;
  /** Ej. "la misma hora de ayer" — comparación contra el TRAMO equivalente (período en curso). */
  readonly anteriorTramo: string;
}

const ETIQUETAS_POR_GRANULARIDAD: Record<Granularidad, EtiquetasPeriodo> = {
  dia: {
    actualCerrado: 'hoy',
    actualEnCurso: 'lo que va de hoy',
    anteriorCerrado: 'ayer',
    anteriorTramo: 'la misma hora de ayer',
  },
  semana: {
    actualCerrado: 'esta semana',
    actualEnCurso: 'lo que va de la semana',
    anteriorCerrado: 'la semana anterior',
    anteriorTramo: 'el mismo tramo de la semana anterior',
  },
  mes: {
    actualCerrado: 'este mes',
    actualEnCurso: 'lo que va del mes',
    anteriorCerrado: 'el mes anterior',
    anteriorTramo: 'el mismo tramo del mes anterior',
  },
};

/** Las 4 etiquetas en español (actual/anterior × en curso/cerrado) para una `Granularidad`. */
export function etiquetasPeriodo(granularidad: Granularidad): EtiquetasPeriodo {
  return ETIQUETAS_POR_GRANULARIDAD[granularidad];
}

const GRANULARIDADES_VALIDAS: readonly Granularidad[] = ['dia', 'semana', 'mes'];

/**
 * Parsea el query param `periodo` de la URL a una `Granularidad` válida, o
 * `null` si está ausente o no es uno de los tres valores conocidos — el
 * caller decide el default (`Reportes.tsx` y el drill-down de rentabilidad,
 * tarea B2, los dos usan `'mes'`).
 *
 * Vive acá (helper compartido, sin React ni Firebase) para que el período
 * elegido en la home viaje al drill-down con el MISMO criterio de parseo en
 * ambos lados — doc de la tarea B2: "el período seleccionado en la home
 * tiene que viajar… un parámetro en la URL es el camino natural".
 */
export function granularidadDesdeParam(valor: string | null): Granularidad | null {
  return valor !== null && (GRANULARIDADES_VALIDAS as readonly string[]).includes(valor)
    ? (valor as Granularidad)
    : null;
}

/**
 * Título del hero de ganancia. Con el período EN CURSO usa `actualEnCurso`
 * ("Ganancia de lo que va del mes") en vez de `actualCerrado` ("Ganancia de
 * este mes"): es la forma en que esta pantalla responde, sin preguntarle a
 * nadie, "¿esto es el mes entero o lo que va del mes?" — en el propio texto
 * que ya se lee primero, no en un indicador aparte.
 */
export function tituloGanancia(etiquetas: EtiquetasPeriodo, enCurso: boolean): string {
  return `Ganancia de ${enCurso ? etiquetas.actualEnCurso : etiquetas.actualCerrado}`;
}

/**
 * Etiqueta de la base de comparación para el texto de `TarjetaDelta`
 * ("vs. {…}"). En curso, la base TAMBIÉN es un tramo (`anteriorTramo`: la
 * misma porción transcurrida del período anterior, ver
 * `periodoAnteriorComparable` en core) — nunca `anteriorCerrado` (el
 * período anterior completo), que es exactamente la comparación deshonesta
 * que motivó esta corrección.
 */
export function etiquetaComparacion(etiquetas: EtiquetasPeriodo, enCurso: boolean): string {
  return enCurso ? etiquetas.anteriorTramo : etiquetas.anteriorCerrado;
}

/**
 * Offset del huso horario LOCAL del dispositivo en minutos a sumar a UTC
 * (regla de oro del proyecto: `packages/core` recibe el offset por
 * parámetro y no lo adivina — ver el JSDoc de `periodo.ts`). El mostrador
 * opera con la hora del dispositivo donde corre la PWA, mismo criterio que
 * la medianoche LOCAL de `ModalIngresarPiezas`/`componentes/stock/resumen.ts`.
 */
export function offsetMinutosLocal(fecha: Date = new Date()): number {
  return -fecha.getTimezoneOffset();
}

/** `10_000 bps = 100 %` ⇒ `100 bps = 1 %` (mismo idioma que `margen.ts`). */
const BPS_POR_PORCENTAJE = BPS_TOTAL / 100;

/**
 * bps → porcentaje ENTERO sin decimales (ej. `9435` → `"94%"`). A propósito
 * distinto de `formatearBps` (`componentes/stock/CampoPorcentaje.tsx`, 2
 * decimales): ese helper es para la pantalla de Precios, donde el segundo
 * decimal de un margen importa; esta pantalla es de lectura rápida en el
 * mostrador (docs/06-ui-ux.md §1) y el brief pide lenguaje llano ("el 94%
 * de lo vendido", no "94,00 %"). Redondeo half-up estándar de JS
 * (`Math.round`), igual criterio de signo que el resto del proyecto.
 */
export function formatearPorcentajeEntero(bps: number): string {
  return `${Math.round(bps / BPS_POR_PORCENTAJE)}%`;
}

/**
 * Nota de honestidad sobre la ganancia (criterio no negociable del brief de
 * la tarea): si la cobertura de costo es MENOR a 100 %, un texto en
 * lenguaje llano que lo dice. `null` con cobertura completa (100 %) o sin
 * líneas que reportar (`coberturaBps === null`, ver `CoberturaCosto` en
 * `reporteVentas.ts`): no hay nada que aclarar.
 */
export function notaCobertura(cobertura: CoberturaCosto): string | null {
  if (cobertura.coberturaBps === null || cobertura.coberturaBps >= BPS_TOTAL) return null;
  return `Ganancia calculada sobre el ${formatearPorcentajeEntero(cobertura.coberturaBps)} de lo vendido.`;
}

/** La flecha de `TarjetaDelta` depende SOLO del signo (el hecho, nunca el juicio). */
function tendenciaDeVariacion(variacionBps: number): Tendencia {
  if (variacionBps > 0) return 'subida';
  if (variacionBps < 0) return 'bajada';
  return 'igual';
}

/**
 * Texto de variación con signo explícito (`"+12% vs. el mes anterior"`).
 * `formatearPorcentajeEntero` ya conserva el signo negativo (`Math.round` de
 * un bps negativo da un número negativo); acá solo se antepone el `+` que
 * le falta a los positivos — ningún cálculo nuevo, el signo ya lo trae la
 * variación que calculó `variacionPorcentual`.
 */
function textoVariacion(variacionBps: number, etiquetaAnterior: string): string {
  const signo = variacionBps > 0 ? '+' : '';
  return `${signo}${formatearPorcentajeEntero(variacionBps)} vs. ${etiquetaAnterior}`;
}

/**
 * Traduce el `VariacionPeriodo` de core (unión discriminada por `tipo`,
 * ver `periodo.ts`) al `EstadoComparacionDelta` que consume `TarjetaDelta`
 * (`packages/ui`). Los `tipo` de ambas uniones coinciden a propósito
 * (`'sin-base' | 'pocos-datos' | 'normal'`): esta función solo agrega
 * presentación (tendencia + texto), nunca decide si hay base de
 * comparación — esa decisión ya la tomó `variacionPorcentual`, y por eso
 * el caso `'sin-base'` acá tampoco produce ningún número.
 *
 * Para la ganancia, subir es SIEMPRE buena noticia: no se pasa `valoracion`
 * explícita, `TarjetaDelta` la infiere de `tendencia` (ver su JSDoc) —
 * a diferencia de una métrica donde el sentido se invierte (merma, costo
 * promedio), que no es el caso de esta pantalla.
 */
export function comparacionGanancia(
  variacion: VariacionPeriodo,
  etiquetaAnterior: string,
): EstadoComparacionDelta {
  if (variacion.tipo === 'sin-base') return { tipo: 'sin-base' };
  return {
    tipo: variacion.tipo,
    tendencia: tendenciaDeVariacion(variacion.variacionBps),
    variacion: textoVariacion(variacion.variacionBps, etiquetaAnterior),
  };
}
