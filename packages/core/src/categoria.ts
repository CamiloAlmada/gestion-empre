/**
 * Normalización canónica del nombre de una categoría.
 *
 * La unicidad de categorías ("no hay dos categorías con el mismo nombre") NO se
 * puede expresar en `firestore.rules`: las reglas no hacen queries, así que no
 * pueden mirar los otros documentos de la colección. El invariante ENTRE
 * documentos se convierte entonces en un invariante DE cada documento:
 *
 *   el id del documento `categorias/{id}` es la clave de su propio nombre.
 *
 * Si TODO documento lo cumple, dos categorías con el mismo nombre serían el
 * mismo documento: la unicidad queda garantizada por una condición que las
 * reglas sí pueden evaluar. Como efecto secundario deseable, la carrera
 * offline converge en vez de duplicar: dos dispositivos sin conexión que dan de
 * alta "Quesos" escriben ambos en `categorias/quesos` y al sincronizar queda un
 * solo documento.
 *
 * Este módulo es la fuente de verdad compartida de esa clave: la usan el kit de
 * Firebase (para elegir el id al crear y al renombrar) y el script de seed. Vive
 * en `core` —TypeScript puro, sin Firebase— justamente para que no haya dos
 * implementaciones que puedan divergir.
 */

/**
 * Largo máximo de una clave, en caracteres.
 *
 * Firestore limita el id de un documento a 1500 bytes UTF-8. Un carácter ocupa
 * como mucho 4 bytes, así que 300 caracteres entran siempre (≤ 1200 bytes) y
 * sobran de lejos para el nombre de una categoría de almacén.
 */
export const LARGO_MAX_CLAVE_CATEGORIA = 300;

/**
 * Clave canónica de un nombre de categoría: sin espacios de borde, en
 * minúsculas. Es el id del documento en `categorias/{id}` y el criterio de
 * comparación de duplicados.
 *
 * Deliberadamente NO pliega acentos ni la eñe: "Café" y "Cafe" son palabras
 * distintas y quedan como categorías distintas, con ids legibles (`café`,
 * `ñoquis`). Firestore acepta cualquier UTF-8 en el id, y la regla que protege
 * el invariante es una igualdad exacta contra un campo del documento, no una
 * transformación de texto, así que no hay ninguna necesidad de reducir a ASCII.
 * (Ver el comentario de `categorias/{id}` en `firestore.rules`: el `lower()` del
 * lenguaje de reglas solo baja A–Z ASCII y por eso NO se usa acá.)
 */
export function claveCategoria(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/**
 * ¿Esta clave sirve como id de documento de Firestore?
 *
 * Firestore rechaza cuatro formas de id, y lo hace con un error críptico del SDK
 * si le llegan. Detectarlas acá permite abortar antes con un mensaje en español:
 * vacío, con `/`, `.` o `..`, y la forma reservada `__algo__`.
 */
export function claveCategoriaValida(clave: string): boolean {
  if (clave.length === 0 || clave.length > LARGO_MAX_CLAVE_CATEGORIA) return false;
  if (clave.includes('/')) return false;
  if (clave === '.' || clave === '..') return false;
  if (/^__.*__$/.test(clave)) return false;
  return true;
}
