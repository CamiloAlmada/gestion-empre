import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type WithFieldValue,
} from 'firebase/firestore';

/**
 * Tinte de fondo elegible para el tema del negocio (doc 06 §4, tanda TM).
 *
 * // TODO(merge TM): reemplazar por import de @gestion/core (tema.ts) — otra
 * // tarea de la misma tanda declara `TemaPersonalizado`/`esTemaValido` ahí; este
 * // converter los declara localmente mientras tanto para no bloquearse. El
 * // tech lead consolida el import al mergear (mismo shape, no renombrar).
 */
export type TintePersonalizado = 'neutro' | 'calido' | 'frio';

/**
 * Forma exacta (y única) del documento `configuracion/tema`: la semilla que el
 * admin fija en Ajustes → Apariencia (doc 06 §4). `matiz` es el hue de marca en
 * grados enteros `[0, 360)`; `tinte` el eje de fondo. La paleta completa NO se
 * persiste: se regenera determinista en cada cliente con `generarPaleta` (core).
 *
 * // TODO(merge TM): reemplazar por import de @gestion/core (tema.ts).
 */
export interface TemaPersonalizado {
  version: 1;
  matiz: number;
  tinte: TintePersonalizado;
}

const TINTES_VALIDOS: readonly TintePersonalizado[] = ['neutro', 'calido', 'frio'];
const CLAVES_VALIDAS = new Set(['version', 'matiz', 'tinte']);

/**
 * Type guard de `TemaPersonalizado`: exige EXACTAMENTE las 3 claves del shape
 * (ni de menos ni de más — un doc con una clave ajena es tan inválido como uno
 * al que le falta una), `version === 1`, `matiz` número finito entero en
 * `[0, 360)` y `tinte` en el enum. Usado por el converter para decidir
 * `fromFirestore` y, en espejo, por `guardarTemaNegocio` para el fail-fast local.
 *
 * // TODO(merge TM): reemplazar por import de @gestion/core (tema.ts).
 */
export function esTemaValido(valor: unknown): valor is TemaPersonalizado {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;
  const claves = Object.keys(valor);
  if (claves.length !== CLAVES_VALIDAS.size || !claves.every((clave) => CLAVES_VALIDAS.has(clave))) {
    return false;
  }
  const datos = valor as Record<string, unknown>;
  if (datos.version !== 1) return false;
  if (
    typeof datos.matiz !== 'number' ||
    !Number.isFinite(datos.matiz) ||
    !Number.isInteger(datos.matiz) ||
    datos.matiz < 0 ||
    datos.matiz >= 360
  ) {
    return false;
  }
  return TINTES_VALIDOS.includes(datos.tinte as TintePersonalizado);
}

/**
 * Mapea `configuracion/tema` ↔ `TemaPersonalizado` (doc 06 §4, tanda TM).
 *
 * DECISIÓN DE DISEÑO — difiere a propósito de `configuracionConverter`: ese
 * converter, ante un dato corrupto (p. ej. `umbralPiezaAgotadaGramos` no
 * entero), LANZA (`RangeError` de `peso()`), porque un dato de config de
 * negocio corrupto debe hacerse notar. El tema, en cambio, es puramente
 * COSMÉTICO: un doc corrupto, con claves de más, o de una `version` futura
 * (una instalación vieja leyendo un doc escrito por una versión nueva de la
 * app, con un shape que todavía no entiende) JAMÁS debe romper la app ni
 * tirar abajo la pantalla. Por eso `fromFirestore` es TOLERANTE — devuelve
 * `null` ante cualquier dato que no pase `esTemaValido` en lugar de lanzar —
 * y el llamador (la app) cae al tema base (paleta ámbar/miel default) cuando
 * recibe `null`. Preferible un flash a una pantalla rota.
 *
 * Como `configuracionConverter`, no reconstruye un `id`: es un documento único
 * identificado por su ruta fija (`configuracion/tema`), no una entidad
 * trazable en una colección.
 *
 * `toFirestore` escribe SIEMPRE las 3 claves tal cual, sin merge ni claves
 * extra (shape estricto — ver `guardarTemaNegocio`, que hace el reemplazo
 * completo del doc). En la práctica nunca se invoca con `null`: el único
 * escritor (`guardarTemaNegocio`) siempre arma un `TemaPersonalizado`
 * completo y válido antes de escribir; `borrarTemaNegocio` usa `deleteDoc`
 * directo y no pasa por este converter. El caso `null` queda contemplado solo
 * para que el tipo del converter cierre con el de `fromFirestore` (que sí
 * puede devolver `null`).
 */
export const temaNegocioConverter: FirestoreDataConverter<TemaPersonalizado | null> = {
  toFirestore(tema: WithFieldValue<TemaPersonalizado | null>): DocumentData {
    if (tema === null) return {};
    const { version, matiz, tinte } = tema;
    return { version, matiz, tinte };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions,
  ): TemaPersonalizado | null {
    const datos = snapshot.data(options) as unknown;
    return esTemaValido(datos) ? datos : null;
  },
};
