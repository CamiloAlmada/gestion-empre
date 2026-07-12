/**
 * Normalización de teléfonos a E.164 sin `+` para armar links `wa.me` (doc 08).
 *
 * Contrato del módulo WhatsApp: si un teléfono no es normalizable, el botón de
 * WhatsApp NO se muestra. Por eso el criterio es **conservador**: ante cualquier
 * ambigüedad se devuelve `null` (no mostrar el botón) en vez de arriesgar un link a
 * un número equivocado — un mensaje al destinatario incorrecto es peor que no
 * ofrecer el botón.
 *
 * TypeScript puro: sin dependencias, sin side effects (regla de oro 1).
 */

/** Mínimo plausible de dígitos de un E.164 (incluye código de país). */
const MIN_DIGITOS_E164 = 8;
/** Máximo del estándar E.164: 15 dígitos incluyendo el código de país. */
const MAX_DIGITOS_E164 = 15;

/** Solo se toleran dígitos, separadores comunes y un `+` inicial opcional. */
const ENTRADA_VALIDA = /^\+?[\d\s.\-()]+$/;

/**
 * Normaliza un teléfono escrito por el usuario a **E.164 sin `+`** (solo dígitos,
 * con código de país) o devuelve `null` si no es normalizable de forma inequívoca.
 *
 * `codigoPais` (default `'598'`, Uruguay) es el código que se antepone a los
 * números escritos en formato local. Debe ser una cadena de dígitos (se le toleran
 * espacios y un `+` inicial); un `codigoPais` no numérico es error de programación.
 *
 * Separadores tolerados en `raw`: espacios, guiones, paréntesis y puntos. Un `+`
 * solo se acepta al inicio; en cualquier otra posición hace `raw` no normalizable.
 *
 * ## Criterio de clasificación (determinista, conservador)
 *
 * 1. **`+` inicial** → internacional explícito: se confía en los dígitos tal cual
 *    (el usuario afirmó que ya es el número completo). Solo se valida el largo.
 * 2. **`00…`** (código de acceso internacional) → se quita el `00` y se trata como
 *    internacional explícito. Solo se valida el largo.
 * 3. **`0…` (un solo cero de troncal)** → local con prefijo troncal: se quita ese
 *    `0` y se antepone `codigoPais`.
 * 4. **Sin `+`, sin `00`, sin `0` inicial**:
 *    - si empieza con `codigoPais` → ya internacional (se devuelve tal cual);
 *    - si no → local sin troncal, se antepone `codigoPais`.
 *
 * ## Rechazos (`→ null`)
 *
 * - Vacío, solo separadores, letras u otros símbolos, o un `+` fuera del inicio.
 * - Resultado final fuera de `[8, 15]` dígitos (rango plausible de E.164).
 * - **Parte nacional con `0` inicial tras el código de país** que nosotros mismos
 *   identificamos (casos 3 y 4). Un número nacional E.164 nunca arranca con el `0`
 *   de troncal, así que `598099123456` (código `598` + `099…`) es una mezcla
 *   malformada → `null`. (No se aplica a los casos 1 y 2: si el usuario puso `+`/
 *   `00` con un código de país arbitrario, no sabemos dónde termina el país.)
 * - **Doble código de país** detectable: `0598…` (troncal `0` + `598…`) tras quitar
 *   el `0` deja `598…`, que vuelve a empezar con el código de país → ambiguo
 *   (¿quiso decir `00598…`?) → `null`.
 *
 * ## Ambigüedad residual asumida
 *
 * Un número local sin `+`/`00` que casualmente empiece con los dígitos del código de
 * país se interpreta como ya-internacional (caso 4). Los números extranjeros deben
 * ingresarse con `+` o `00`; sin ellos se asumen locales. Ambas son decisiones
 * deterministas y se cubren con tests.
 *
 * @param raw teléfono tal como lo escribió el usuario.
 * @param codigoPais código de país a anteponer a los locales (default `'598'`).
 * @returns E.164 sin `+` (p. ej. `'59899123456'`) o `null` si no es normalizable.
 * @throws {RangeError} si `codigoPais` no es una cadena de dígitos.
 */
export function normalizarTelefono(raw: string, codigoPais: string = '598'): string | null {
  const cc = codigoPais.replace(/[\s+]/g, '');
  if (!/^\d+$/.test(cc)) {
    throw new RangeError(`normalizarTelefono requiere un codigoPais numérico, recibió: ${codigoPais}`);
  }

  const trimmed = raw.trim();
  if (trimmed === '' || !ENTRADA_VALIDA.test(trimmed)) return null;

  const tienePlus = trimmed.startsWith('+');
  const digitos = trimmed.replace(/[\s.\-()+]/g, '');
  if (digitos === '') return null; // solo separadores / solo '+'

  // Caso 1: '+' inicial → internacional explícito, se confía en los dígitos.
  if (tienePlus) return enRango(digitos);

  // Caso 2: '00' → código de acceso internacional, se quita y se confía.
  if (digitos.startsWith('00')) return enRango(digitos.slice(2));

  // Caso 3: un solo '0' de troncal → local con prefijo. (El '00' ya se descartó,
  // así que acá el segundo dígito nunca es '0'.)
  if (digitos.startsWith('0')) {
    const nacional = digitos.slice(1);
    if (nacional === '' || nacional.startsWith(cc)) return null; // vacío o doble código de país
    return enRango(cc + nacional);
  }

  // Caso 4a: ya trae el código de país al frente.
  if (digitos.startsWith(cc)) {
    const nacional = digitos.slice(cc.length);
    if (nacional === '' || nacional.startsWith('0')) return null; // solo código, o troncal filtrado
    return enRango(digitos);
  }

  // Caso 4b: local sin troncal → se antepone el código de país.
  return enRango(cc + digitos);
}

/** Devuelve `digitos` si su largo cae en el rango plausible de E.164, o `null`. */
function enRango(digitos: string): string | null {
  return digitos.length >= MIN_DIGITOS_E164 && digitos.length <= MAX_DIGITOS_E164 ? digitos : null;
}
