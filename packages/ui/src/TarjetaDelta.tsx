import type { ReactNode } from 'react';

/** Hacia dónde se movió el número respecto del período anterior. Es un
 * HECHO observable — nunca depende de si ese movimiento es deseable. */
export type Tendencia = 'subida' | 'bajada' | 'igual';

/**
 * Si ESE cambio es una buena o mala noticia para el negocio. Es un JUICIO,
 * deliberadamente separado de `Tendencia`: la ganancia subiendo es
 * `'buena'`, pero la merma del mes subiendo es `'mala'` — misma `tendencia`
 * ('subida'), `valoracion` opuesta. Antes de esta separación, la única
 * forma de pintar la merma en rojo era pasar `tendencia: 'bajada'` y
 * terminar dibujando una flecha ▼ sobre un número que en realidad subió:
 * una UI que miente sobre el hecho. Con los dos campos independientes eso
 * es irrepresentable: la flecha sale siempre de `tendencia`, el color
 * siempre de `valoracion`.
 */
export type Valoracion = 'buena' | 'mala' | 'neutra';

/**
 * Estado de comparación ya RESUELTO por quien use el componente (a futuro,
 * lógica en `packages/core` — no existe todavía y no es parte de esta
 * tarea). `TarjetaDelta` es puramente de presentación: no decide cuál
 * estado corresponde, solo lo pinta. La forma discriminada por `tipo` hace
 * imposible mostrarse "a medias" (p. ej. una variación sin saber si hay
 * base de comparación).
 *
 * `valoracion` es opcional: para el caso común (una métrica donde subir es
 * buena noticia, como la ganancia) alcanza con `tendencia` y el componente
 * infiere `'subida' → buena`, `'bajada' → mala`, `'igual' → neutra`. Una
 * métrica donde el sentido se invierte (merma, costo promedio, % de ventas
 * sin costo conocido) pasa `valoracion` explícita — sin tocar `tendencia`,
 * que sigue describiendo el hecho tal cual ocurrió.
 */
export type EstadoComparacionDelta =
  | { tipo: 'normal'; tendencia: Tendencia; valoracion?: Valoracion; variacion: string }
  | { tipo: 'pocos-datos'; tendencia: Tendencia; valoracion?: Valoracion; variacion: string }
  | { tipo: 'sin-base' };

export interface TarjetaDeltaProps {
  titulo: string;
  /** Ya formateado (ej. con `formatearMoney` de `@gestion/core`); el componente NO hace aritmética. */
  valor: string;
  comparacion: EstadoComparacionDelta;
  icono?: ReactNode;
}

// La flecha depende SOLO de `tendencia` (el hecho) — nunca de `valoracion`.
const FLECHA_POR_TENDENCIA: Record<Tendencia, string> = {
  subida: '▲',
  bajada: '▼',
  igual: '—',
};

// El color depende SOLO de `valoracion` (el juicio) — nunca directamente de
// `tendencia`. Mismos tokens semánticos que el resto de la UI (docs/06 §7).
const COLOR_POR_VALORACION: Record<Valoracion, string> = {
  buena: 'text-exito',
  mala: 'text-peligro',
  neutra: 'text-texto-secundario',
};

// Valor por defecto cuando el llamador no pasa `valoracion`: cubre el caso
// común (subir es buena noticia) sin obligar a repetirlo en cada uso.
const VALORACION_POR_DEFECTO: Record<Tendencia, Valoracion> = {
  subida: 'buena',
  bajada: 'mala',
  igual: 'neutra',
};

/**
 * Card "hero" de la pantalla de Reportes (docs/06-ui-ux.md, futura Fase 3):
 * métrica principal del período + comparación contra el período anterior.
 * Opaca siempre (§3: translucidez solo en tab bar). Mismo molde visual que
 * `StatCard` (radios, padding, `tabular-nums`), pero con la comparación
 * resuelta por `EstadoComparacionDelta` en vez de un `detalle` libre.
 *
 * - `normal`: variación con color + flecha + texto — tres canales a la vez.
 *   La flecha (▲/▼/—) SIEMPRE refleja `tendencia` (el hecho); el color
 *   SIEMPRE refleja `valoracion` (el juicio, con default derivado de
 *   `tendencia` si no se pasa) — nunca la dirección depende solo del color,
 *   y nunca el color puede torcer qué flecha se dibuja.
 * - `pocos-datos`: misma variación (mismo color/flecha) más un rótulo de
 *   texto visible que baja la confianza del dato — nunca solo un ícono.
 * - `sin-base`: no hay período anterior con qué comparar. NO se inventa un
 *   `+100%`/`+∞`: se muestra un texto explícito en `texto-secundario`, sin
 *   flecha ni porcentaje.
 */
export function TarjetaDelta({ titulo, valor, comparacion, icono }: TarjetaDeltaProps) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-borde bg-superficie p-4">
      {icono !== undefined && (
        <div
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-elemento bg-primary-600 text-white"
        >
          {icono}
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm text-texto-secundario">{titulo}</p>
        <p className="text-2xl font-bold tabular-nums text-texto">{valor}</p>
        {comparacion.tipo === 'sin-base' ? (
          <p className="text-sm text-texto-secundario">
            Sin datos del período anterior para comparar
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p
              className={`flex items-center gap-1 text-sm font-medium tabular-nums ${COLOR_POR_VALORACION[comparacion.valoracion ?? VALORACION_POR_DEFECTO[comparacion.tendencia]]}`}
            >
              <span aria-hidden="true">{FLECHA_POR_TENDENCIA[comparacion.tendencia]}</span>
              {comparacion.variacion}
            </p>
            {comparacion.tipo === 'pocos-datos' && (
              <p className="text-sm text-texto-secundario">Pocos datos para comparar</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
