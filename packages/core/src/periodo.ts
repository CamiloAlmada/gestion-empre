import { BPS_TOTAL } from './margen.js';
import { redondearHalfUp } from './redondeo.js';

/**
 * Períodos de calendario (día/semana/mes) y su comparación porcentual, para el
 * futuro módulo de Reportes (Fase 3, doc 04).
 *
 * TypeScript puro (regla de oro 1): el huso horario NO se decide acá — igual
 * que `fidelizacion.ts` recibe `ahora` por parámetro, estas funciones reciben
 * `offsetMinutos` (minutos a sumar a UTC para obtener la hora local del
 * negocio). `packages/core` no puede depender del huso del dispositivo ni
 * asumir Uruguay: quien llama (el hook de la app) es responsable de pasar el
 * offset correcto.
 */

const MS_POR_MINUTO = 60_000;

/** Granularidad de agrupación de un período. */
export type Granularidad = 'dia' | 'semana' | 'mes';

/**
 * Rango de tiempo semiabierto: `desde` inclusive, `hasta` exclusivo. Así se
 * usa directamente como filtro de query (`fecha >= desde && fecha < hasta`)
 * sin ambigüedad de si el último instante del período cuenta o no.
 */
export interface Periodo {
  readonly desde: Date;
  readonly hasta: Date;
}

/** `true` si `d` es un `Date` válido (no `Invalid Date`). */
function esFechaValida(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function validarEntrada(fecha: Date, offsetMinutos: number): void {
  if (!esFechaValida(fecha)) {
    throw new RangeError('se requiere una fecha válida');
  }
  if (!Number.isFinite(offsetMinutos)) {
    throw new RangeError(`offsetMinutos debe ser un número finito, recibió: ${offsetMinutos}`);
  }
}

/**
 * Traduce un instante UTC a un `Date` "espejo": sus getters `UTC*` devuelven
 * los campos de calendario (año, mes, día, día de semana) tal como se ven en
 * el huso `offsetMinutos`. Es un truco de representación, no un instante real
 * — nunca se expone fuera de este módulo.
 */
function comoLocal(fecha: Date, offsetMinutos: number): Date {
  return new Date(fecha.getTime() + offsetMinutos * MS_POR_MINUTO);
}

/** Inversa de `comoLocal`: de un `Date` "espejo" (campos UTC = campos locales) al instante UTC real. */
function comoUtc(fechaLocal: Date, offsetMinutos: number): Date {
  return new Date(fechaLocal.getTime() - offsetMinutos * MS_POR_MINUTO);
}

/**
 * Período de calendario (día/semana/mes en el huso `offsetMinutos`) que
 * contiene a `fecha`.
 *
 * La semana empieza el **lunes** (ISO), independiente del locale del
 * dispositivo — otra decisión que no puede depender de dónde corre el código.
 *
 * @throws {RangeError} si `fecha` es inválida o `offsetMinutos` no es finito.
 */
export function periodoDe(fecha: Date, granularidad: Granularidad, offsetMinutos: number): Periodo {
  validarEntrada(fecha, offsetMinutos);
  const local = comoLocal(fecha, offsetMinutos);
  const anio = local.getUTCFullYear();
  const mes = local.getUTCMonth();
  const dia = local.getUTCDate();

  let inicioLocal: Date;
  let finLocal: Date;

  switch (granularidad) {
    case 'dia':
      inicioLocal = new Date(Date.UTC(anio, mes, dia));
      finLocal = new Date(Date.UTC(anio, mes, dia + 1));
      break;
    case 'semana': {
      // getUTCDay(): 0=domingo..6=sábado. Se remapea a 0=lunes..6=domingo.
      const diaIso = (local.getUTCDay() + 6) % 7;
      inicioLocal = new Date(Date.UTC(anio, mes, dia - diaIso));
      finLocal = new Date(Date.UTC(anio, mes, dia - diaIso + 7));
      break;
    }
    case 'mes':
      inicioLocal = new Date(Date.UTC(anio, mes, 1));
      finLocal = new Date(Date.UTC(anio, mes + 1, 1));
      break;
    default: {
      const exhaustivo: never = granularidad;
      throw new RangeError(`granularidad desconocida: ${String(exhaustivo)}`);
    }
  }

  return { desde: comoUtc(inicioLocal, offsetMinutos), hasta: comoUtc(finLocal, offsetMinutos) };
}

/**
 * Período anterior comparable al recibido: el día/semana/mes de calendario
 * inmediatamente previo, en el mismo huso.
 *
 * Asume que `periodo` viene de `periodoDe` con la misma `granularidad`
 * (alineado a un límite de calendario) — es el caso de uso real (comparar
 * "este mes" contra "el mes pasado"). Con un `periodo` no alineado igual
 * devuelve un período válido de esa `granularidad` conteniendo el instante
 * anterior a `desde`, pero no necesariamente "mismo largo, un paso antes".
 *
 * Nunca resta milisegundos fijos para 'mes' (los meses no miden lo mismo):
 * se recalcula con `periodoDe` sobre un instante dentro del período anterior,
 * para heredar la misma lógica de límites que la construcción original.
 *
 * @throws {RangeError} si `periodo.desde` es inválida o `offsetMinutos` no es finito.
 */
export function periodoAnterior(
  periodo: Periodo,
  granularidad: Granularidad,
  offsetMinutos: number,
): Periodo {
  validarEntrada(periodo.desde, offsetMinutos);
  const instanteAnterior = new Date(periodo.desde.getTime() - 1);
  return periodoDe(instanteAnterior, granularidad, offsetMinutos);
}

/** Un bucket de `agruparPorPeriodo`: el período y los items que cayeron en él. */
export interface BucketPeriodo<T> {
  readonly periodo: Periodo;
  readonly items: readonly T[];
}

/**
 * Agrupa `items` en buckets de `granularidad`, usando `fechaDe` para obtener
 * la fecha de cada uno. Devuelve los buckets ordenados cronológicamente y
 * **solo los que tienen al menos un item**: no rellena huecos (un mes sin
 * ventas no aparece como bucket vacío) — eso es una decisión de presentación,
 * no de agregación, y le toca a quien consuma esto (una futura pantalla de
 * tendencia).
 *
 * @throws {RangeError} si alguna fecha resuelta es inválida o `offsetMinutos` no es finito.
 */
export function agruparPorPeriodo<T>(
  items: readonly T[],
  fechaDe: (item: T) => Date,
  granularidad: Granularidad,
  offsetMinutos: number,
): BucketPeriodo<T>[] {
  const buckets = new Map<number, { periodo: Periodo; items: T[] }>();

  for (const item of items) {
    const periodo = periodoDe(fechaDe(item), granularidad, offsetMinutos);
    const clave = periodo.desde.getTime();
    const existente = buckets.get(clave);
    if (existente !== undefined) {
      existente.items.push(item);
    } else {
      buckets.set(clave, { periodo, items: [item] });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.periodo.desde.getTime() - b.periodo.desde.getTime())
    .map((b) => ({ periodo: b.periodo, items: b.items }));
}

/**
 * Un valor de un período junto con el tamaño de muestra que lo respalda
 * (cantidad de ventas, piezas, lo que aplique). El tamaño de muestra es lo que
 * permite decidir si una variación es una tendencia o ruido — ver
 * `ConfigVariacion.umbralPocosDatos`.
 *
 * `valor` es un `number` genérico (no `Money`): la comparación porcentual es
 * la misma aritmética sea plata, gramos o un conteo, y así este módulo no se
 * acopla a ningún tipo de dominio. `Money`/`Peso` son subtipos de `number`
 * (branded types), así que se pasan tal cual sin conversión.
 */
export interface PuntoComparable {
  readonly valor: number;
  readonly cantidadDatos: number;
}

/**
 * Resultado de comparar dos períodos. Discriminado por `tipo` para que sea
 * IMPOSIBLE leer un `variacionBps` inventado cuando no hay base de
 * comparación — el caso `'sin-base'` no lleva el campo.
 *
 * - `'sin-base'`: no hay período anterior con datos (o su valor es 0, lo que
 *   haría la variación indefinida). No se produce ningún porcentaje: nada de
 *   `+100 %` ni `+∞`.
 * - `'pocos-datos'`: hay variación calculable, pero alguno de los dos períodos
 *   tiene menos datos que `umbralPocosDatos` — no alcanza para llamarlo
 *   tendencia. Se informa igual (con una salvedad para quien lo muestre).
 * - `'normal'`: variación calculable con base suficiente en ambos períodos.
 */
export type VariacionPeriodo =
  | { readonly tipo: 'sin-base' }
  | { readonly tipo: 'pocos-datos'; readonly variacionBps: number }
  | { readonly tipo: 'normal'; readonly variacionBps: number };

/** Config de `variacionPorcentual`. */
export interface ConfigVariacion {
  /**
   * Mínimo de `cantidadDatos` que necesita CADA período (actual y anterior)
   * para que la variación cuente como tendencia. Default `5`: menos que eso,
   * una sola venta grande o chica mueve el porcentaje sin decir nada real.
   */
  readonly umbralPocosDatos?: number;
}

const DEFAULT_UMBRAL_POCOS_DATOS = 5;

/**
 * Variación porcentual de `actual` respecto de `anterior`, en bps enteros
 * (mismo idioma que `margen.ts`: `10_000 bps = 100 %`).
 *
 * Política de honestidad (no negociable, ver doc de la tarea):
 * - **Sin período anterior con datos** (`anterior.cantidadDatos <= 0`) o con
 *   **valor 0** (división indefinida): devuelve `{ tipo: 'sin-base' }`, sin
 *   ningún número. Un 0 en el denominador no es "creció infinito", es "no hay
 *   con qué comparar".
 * - **Pocos datos**: si `actual` o `anterior` tienen menos de
 *   `umbralPocosDatos`, se calcula igual el porcentaje pero se marca
 *   `'pocos-datos'` — la variación existe, la tendencia no está probada.
 *
 * @throws {RangeError} si `umbralPocosDatos` no es un número finito ≥ 0.
 */
export function variacionPorcentual(
  actual: PuntoComparable,
  anterior: PuntoComparable,
  config: ConfigVariacion = {},
): VariacionPeriodo {
  const umbral = config.umbralPocosDatos ?? DEFAULT_UMBRAL_POCOS_DATOS;
  if (!Number.isFinite(umbral) || umbral < 0) {
    throw new RangeError(`umbralPocosDatos debe ser un número finito ≥ 0, recibió: ${umbral}`);
  }

  if (anterior.cantidadDatos <= 0 || anterior.valor === 0) {
    return { tipo: 'sin-base' };
  }

  const variacionBps = redondearHalfUp(((actual.valor - anterior.valor) * BPS_TOTAL) / anterior.valor);

  if (actual.cantidadDatos < umbral || anterior.cantidadDatos < umbral) {
    return { tipo: 'pocos-datos', variacionBps };
  }
  return { tipo: 'normal', variacionBps };
}
