import { deleteDoc, doc, setDoc, type Firestore } from 'firebase/firestore';
import {
  temaNegocioConverter,
  type TemaPersonalizado,
  type TinteFondo,
} from './converters/temaNegocio';
import { ConfiguracionInvalidaError } from './errores';

/**
 * Escritura del tema del negocio (`configuracion/tema`, doc 06 §4, tanda TM;
 * solo admin en Ajustes → Apariencia, lectura de todo usuario activo). A
 * diferencia de `guardarConfiguracionGeneral` (merge no destructivo, porque
 * `configuracion/general` acumula claves de distintas fases que conviven en
 * el mismo doc), acá el doc es CHICO y de SHAPE ESTRICTO — exactamente
 * `{version, matiz, tinte}`, nunca más ni menos — así que cada guardado es un
 * REEMPLAZO COMPLETO (`setDoc` sin `merge: true`): no hay nada parcial que
 * preservar, y un reemplazo total evita que quede una clave vieja huérfana si
 * el shape cambiara de versión más adelante.
 *
 * Validación en dos capas, como el resto del kit: esta función valida
 * TODO el shape client-side (fail fast, español); las reglas son el backstop
 * en el servidor. `version` no es parámetro: esta escritura siempre fija `1`
 * (la única versión que existe hoy).
 */

/** Datos editables del tema del negocio (la semilla; la paleta se regenera en cliente). */
export interface DatosTemaNegocio {
  /** Matiz de marca, grados enteros en `[0, 360)`. */
  matiz: number;
  /** Tinte de fondo. */
  tinte: TinteFondo;
}

const TINTES_VALIDOS: readonly TinteFondo[] = ['neutro', 'calido', 'frio'];

function exigirMatiz(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || !Number.isInteger(valor)) {
    throw new ConfiguracionInvalidaError('El matiz debe ser un número entero.');
  }
  if (valor < 0 || valor > 359) {
    throw new ConfiguracionInvalidaError('El matiz debe estar entre 0 y 359 grados.');
  }
  return valor;
}

function exigirTinte(valor: unknown): TinteFondo {
  if (!TINTES_VALIDOS.includes(valor as TinteFondo)) {
    throw new ConfiguracionInvalidaError(
      `El tinte debe ser uno de ${TINTES_VALIDOS.join(', ')}.`,
    );
  }
  return valor as TinteFondo;
}

/**
 * Guarda `configuracion/tema` con REEMPLAZO COMPLETO del doc (ver nota de
 * arriba): crea el doc si no existe, o lo reescribe entero si ya existía.
 * Fija `version: 1`.
 *
 * @throws {ConfiguracionInvalidaError} si `matiz` no es un entero en
 *   `[0, 359]` o `tinte` no está en la unión.
 */
export async function guardarTemaNegocio(db: Firestore, datos: DatosTemaNegocio): Promise<void> {
  const matiz = exigirMatiz(datos.matiz);
  const tinte = exigirTinte(datos.tinte);
  const tema: TemaPersonalizado = { version: 1, matiz, tinte };
  await setDoc(doc(db, 'configuracion', 'tema').withConverter(temaNegocioConverter), tema);
}

/**
 * Borra `configuracion/tema` ("Volver a los colores originales", doc 06 §4):
 * sin doc, la app cae a la paleta base (ámbar/miel) — mismo comportamiento
 * que un doc corrupto o de versión futura (`temaNegocioConverter` § tolerante).
 */
export async function borrarTemaNegocio(db: Firestore): Promise<void> {
  await deleteDoc(doc(db, 'configuracion', 'tema'));
}
