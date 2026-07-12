import { doc, setDoc, type Firestore } from 'firebase/firestore';
import type { PlantillaWhatsApp } from '@gestion/core';
import { plantillasWhatsAppConverter } from './converters/plantillasWhatsApp';
import { ConfiguracionInvalidaError } from './errores';

/**
 * Escritura de la configuración del negocio (`configuracion/*`, solo admin en
 * Ajustes, doc 08). Dos documentos:
 *
 * - `configuracion/general`: config transversal del negocio. WA-B agrega
 *   `codigoPaisDefault` (para derivar `telefonoE164`) y `nombreNegocio` (alimenta
 *   el placeholder `{negocio}`). El doc puede ya existir con otra config viva
 *   (Fase 2: `umbralPiezaAgotadaGramos`, `metodoProrrateo`), así que la escritura
 *   es un MERGE no destructivo: nunca pisa ni borra las claves que no toca.
 * - `configuracion/plantillasWhatsApp`: un único doc con el array de plantillas.
 *
 * Ambos pueden NO existir (negocio recién instalado): `setDoc` los crea. La lectura
 * es responsabilidad de la UI (suscripción con `useDoc` + el converter
 * correspondiente); acá solo vive la escritura, con validación previa en español
 * (fail fast) — las reglas son el backstop en el servidor.
 *
 * Validación en dos capas (como el resto del kit): esta función valida TODO el
 * shape client-side; las reglas revalidan lo que el lenguaje de reglas permite.
 */

// ── Límites (espejan `firestore.rules`; ver reporte WA-B) ───────────────────
const MAX_CODIGO_PAIS = 4;
const MAX_NOMBRE_NEGOCIO = 80;
const MAX_PLANTILLAS = 20;
const MAX_ID_PLANTILLA = 40;
const MAX_NOMBRE_PLANTILLA = 60;
const MAX_TEXTO_PLANTILLA = 1000;
const CONTEXTOS_VALIDOS = ['venta', 'cliente', 'inactivo'] as const;

/** Datos editables de `configuracion/general` que administra WA-B (doc 08). */
export interface DatosConfiguracionGeneral {
  /** Código de país (solo dígitos, sin `+`), 1-4 dígitos. Ej.: `'598'`. */
  codigoPaisDefault: string;
  /** Nombre del negocio (placeholder `{negocio}`), 1-80 chars tras `trim()`. */
  nombreNegocio: string;
}

function exigirCadenaAcotada(valor: unknown, campo: string, max: number): string {
  if (typeof valor !== 'string') {
    throw new ConfiguracionInvalidaError(`${campo} debe ser texto.`);
  }
  const limpio = valor.trim();
  if (limpio.length === 0) {
    throw new ConfiguracionInvalidaError(`${campo} no puede estar vacío.`);
  }
  if (limpio.length > max) {
    throw new ConfiguracionInvalidaError(`${campo} no puede superar ${max} caracteres.`);
  }
  return limpio;
}

/**
 * Guarda `configuracion/general` con MERGE no destructivo: crea el doc si no existe
 * y actualiza solo `codigoPaisDefault` y `nombreNegocio`, dejando intacta cualquier
 * otra clave (config de Fase 2). Ambos campos se validan y recortan antes de escribir.
 *
 * @throws {ConfiguracionInvalidaError} si `codigoPaisDefault` no es 1-4 dígitos o
 *   `nombreNegocio` queda vacío / supera 80 chars.
 */
export async function guardarConfiguracionGeneral(
  db: Firestore,
  datos: DatosConfiguracionGeneral,
): Promise<void> {
  const codigoPaisDefault = exigirCadenaAcotada(
    datos.codigoPaisDefault,
    'El código de país',
    MAX_CODIGO_PAIS,
  );
  if (!/^\d+$/.test(codigoPaisDefault)) {
    throw new ConfiguracionInvalidaError('El código de país debe ser solo dígitos (sin +).');
  }
  const nombreNegocio = exigirCadenaAcotada(
    datos.nombreNegocio,
    'El nombre del negocio',
    MAX_NOMBRE_NEGOCIO,
  );
  await setDoc(
    doc(db, 'configuracion', 'general'),
    { codigoPaisDefault, nombreNegocio },
    { merge: true },
  );
}

/**
 * Valida y normaliza una plantilla: recorta strings, exige campos en rango y
 * `contexto` en la unión. Devuelve la plantilla limpia (solo las 4 claves de dominio).
 *
 * @throws {ConfiguracionInvalidaError} si algún campo está fuera de rango.
 */
function exigirPlantillaValida(p: unknown, indice: number): PlantillaWhatsApp {
  const donde = `La plantilla #${indice + 1}`;
  if (typeof p !== 'object' || p === null) {
    throw new ConfiguracionInvalidaError(`${donde}: debe ser un objeto.`);
  }
  const cruda = p as Record<string, unknown>;
  const id = exigirCadenaAcotada(cruda.id, `${donde}: id`, MAX_ID_PLANTILLA);
  const nombre = exigirCadenaAcotada(cruda.nombre, `${donde}: nombre`, MAX_NOMBRE_PLANTILLA);
  const texto = exigirCadenaAcotada(cruda.texto, `${donde}: texto`, MAX_TEXTO_PLANTILLA);
  const contexto = cruda.contexto;
  if (contexto !== 'venta' && contexto !== 'cliente' && contexto !== 'inactivo') {
    throw new ConfiguracionInvalidaError(
      `${donde}: contexto inválido (debe ser uno de ${CONTEXTOS_VALIDOS.join(', ')}).`,
    );
  }
  return { id, nombre, contexto, texto };
}

/**
 * Guarda `configuracion/plantillasWhatsApp` (reemplaza la lista completa: es la
 * edición atómica de una colección chica). Valida cantidad (≤20), ids únicos y el
 * shape/rango de cada plantilla antes de escribir. Sirve también para sembrar:
 * `guardarPlantillasWhatsApp(db, PLANTILLAS_SEED)` (doc 08).
 *
 * @throws {ConfiguracionInvalidaError} si hay más de 20, ids duplicados, o alguna
 *   plantilla con un campo fuera de rango / contexto inválido.
 */
export async function guardarPlantillasWhatsApp(
  db: Firestore,
  plantillas: readonly PlantillaWhatsApp[],
): Promise<void> {
  if (!Array.isArray(plantillas)) {
    throw new ConfiguracionInvalidaError('Las plantillas deben ser una lista.');
  }
  if (plantillas.length > MAX_PLANTILLAS) {
    throw new ConfiguracionInvalidaError(
      `No puede haber más de ${MAX_PLANTILLAS} plantillas (hay ${plantillas.length}).`,
    );
  }
  const limpias = plantillas.map((p, i) => exigirPlantillaValida(p, i));
  const ids = new Set<string>();
  for (const p of limpias) {
    if (ids.has(p.id)) {
      throw new ConfiguracionInvalidaError(`Hay plantillas con id repetido: "${p.id}".`);
    }
    ids.add(p.id);
  }
  await setDoc(
    doc(db, 'configuracion', 'plantillasWhatsApp').withConverter(plantillasWhatsAppConverter),
    limpias,
  );
}
