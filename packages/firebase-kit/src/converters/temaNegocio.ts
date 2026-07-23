import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type WithFieldValue,
} from 'firebase/firestore';

import { esTemaValido, type TemaPersonalizado, type TinteFondo } from '@gestion/core';

// Consolidación post-merge de la Wave 1 (tech lead): los tipos y el guard
// canónicos viven en @gestion/core (tema.ts) — este converter los importa en
// vez de duplicarlos. `esTemaValido` de core valida el MISMO shape estricto
// (3 claves exactas, version 1, matiz entero [0,360), tinte del enum).
export type { TemaPersonalizado, TinteFondo };
export { esTemaValido };

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
