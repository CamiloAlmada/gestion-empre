import type { Peso } from './peso.js';
import type { Pieza } from './tipos.js';

/** Resultado de `elegirPieza`: la pieza FIFO y si su peso restante alcanza. */
export interface PiezaElegida {
  readonly pieza: Pieza;
  /** `true` si `pieza.pesoRestanteGramos >= gramosSolicitados`. */
  readonly suficiente: boolean;
}

/**
 * Selector FIFO: entre las piezas `disponible` con peso restante > 0, elige la de
 * `fechaIngreso` más antigua. Empates de fecha se desempatan por `id` ascendente
 * para determinismo total.
 *
 * Devuelve `null` si no hay candidata. Si la hay, informa además si su peso
 * restante alcanza para `gramosSolicitados`; qué hacer cuando no alcanza (avisar,
 * dividir entre piezas) es decisión de la UI, no de dominio.
 *
 * No muta el array de entrada (busca el mínimo sin ordenar; el parámetro es
 * `readonly`).
 */
export function elegirPieza(
  piezas: readonly Pieza[],
  gramosSolicitados: Peso,
): PiezaElegida | null {
  let elegida: Pieza | undefined;
  for (const pieza of piezas) {
    if (pieza.estado !== 'disponible' || pieza.pesoRestanteGramos <= 0) {
      continue;
    }
    if (elegida === undefined || esMasAntigua(pieza, elegida)) {
      elegida = pieza;
    }
  }
  if (elegida === undefined) {
    return null;
  }
  return { pieza: elegida, suficiente: elegida.pesoRestanteGramos >= gramosSolicitados };
}

/**
 * ¿`candidata` es FIFO-anterior a `actual`? Más antigua por `fechaIngreso`; a
 * igual fecha, menor `id` (desempate determinista).
 */
function esMasAntigua(candidata: Pieza, actual: Pieza): boolean {
  const tiempoCandidata = candidata.fechaIngreso.getTime();
  const tiempoActual = actual.fechaIngreso.getTime();
  if (tiempoCandidata !== tiempoActual) {
    return tiempoCandidata < tiempoActual;
  }
  return candidata.id < actual.id;
}
