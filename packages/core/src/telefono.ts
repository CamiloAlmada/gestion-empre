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

/**
 * Un código de país para el selector de teléfono de la app de clientes.
 */
export interface CodigoPais {
  /** Código sin `+`, solo dígitos. */
  codigo: string;
  /** Nombre en español para el selector. */
  nombre: string;
}

/**
 * Códigos de país habilitados en el selector. Uruguay (`598`) encabeza la lista
 * porque es el default del negocio; el resto cubre la región (compradores de
 * países vecinos) y los destinos europeos más frecuentes.
 */
export const CODIGOS_PAIS: readonly CodigoPais[] = [
  { codigo: '598', nombre: 'Uruguay' },
  { codigo: '54', nombre: 'Argentina' },
  { codigo: '55', nombre: 'Brasil' },
  { codigo: '595', nombre: 'Paraguay' },
  { codigo: '591', nombre: 'Bolivia' },
  { codigo: '56', nombre: 'Chile' },
  { codigo: '34', nombre: 'España' },
  { codigo: '1', nombre: 'Estados Unidos' },
  { codigo: '39', nombre: 'Italia' },
  { codigo: '351', nombre: 'Portugal' },
  { codigo: '49', nombre: 'Alemania' },
  { codigo: '33', nombre: 'Francia' },
  { codigo: '44', nombre: 'Reino Unido' },
];

/**
 * Quita espacios y `+` de un código de país y valida que quede numérico, con el
 * mismo criterio que `normalizarTelefono` aplica a su `codigoPais`.
 *
 * @throws {RangeError} si, tras normalizarlo, no queda una cadena de dígitos.
 */
function normalizarCodigo(codigo: string, quien: string): string {
  const cc = codigo.replace(/[\s+]/g, '');
  if (!/^\d+$/.test(cc)) {
    throw new RangeError(`${quien} requiere un código de país numérico, recibió: ${codigo}`);
  }
  return cc;
}

/**
 * Compone el teléfono a mostrar/guardar a partir del código de país elegido en el
 * selector (uno de `CODIGOS_PAIS`) y la parte nacional que escribió el usuario.
 *
 * El display de un teléfono con el código **default del negocio** (`codigoDefault`,
 * normalmente `'598'`) no lleva prefijo `+cc`: queda igual que siempre. Es
 * deliberado — los clientes cargados antes de que existiera este selector tienen
 * el teléfono guardado sin `+598`, y si esta función le antepusiera el prefijo
 * cuando el código coincide con el default, cada cliente existente cambiaría de
 * shape la primera vez que alguien tocara su ficha. Con un código distinto del
 * default sí se antepone `+cc`, porque ahí no hay compatibilidad hacia atrás que
 * preservar: son casos nuevos que el selector recién habilita.
 *
 * `normalizarTelefono` (más arriba en este archivo) **no se toca**: ya sabe derivar
 * el E.164 correcto tanto de un display sin prefijo (lo asume local del
 * `codigoPais` que se le pase) como de uno con `+cc` (lo toma como internacional
 * explícito y confía en sus dígitos). Esta función solo arma, del lado de la UI, el
 * string que `normalizarTelefono` va a leer después.
 *
 * @param codigo código de país elegido en el selector (tolera espacios y `+`).
 * @param nacional número tal como lo escribió el usuario en "Número".
 * @param codigoDefault código de país default del negocio, para decidir si hace
 *   falta anteponer el prefijo.
 * @returns el display a guardar, o `''` si `nacional` queda vacío tras recortarlo.
 * @throws {RangeError} si `codigo` o `codigoDefault` no son numéricos.
 */
export function componerTelefono(codigo: string, nacional: string, codigoDefault: string): string {
  const cc = normalizarCodigo(codigo, 'componerTelefono');
  const ccDefault = normalizarCodigo(codigoDefault, 'componerTelefono');

  const nacionalTrim = nacional.trim();
  if (nacionalTrim === '') return '';

  // El usuario ya escribió un internacional completo (con + o 00): no duplicar
  // el código elegido en el selector.
  if (nacionalTrim.startsWith('+') || nacionalTrim.startsWith('00')) return nacionalTrim;

  if (cc === ccDefault) return nacionalTrim;

  return `+${cc} ${nacionalTrim}`;
}

/** Resultado de separar un display de teléfono en código de país y parte nacional. */
export interface TelefonoSeparado {
  /** Código de país sin `+` (uno de `CODIGOS_PAIS`, o `codigoDefault` en el fallback). */
  codigo: string;
  /** Parte nacional, o —en el fallback— el display crudo intacto. */
  nacional: string;
}

/**
 * Inversa de `componerTelefono`: separa un display guardado en código de país y
 * parte nacional, para precargar el selector al editar un cliente existente.
 *
 * Si `display` (recortado) no empieza con `+` ni con `00` se asume local del
 * `codigoDefault` —mismo criterio que `normalizarTelefono`— y se devuelve tal cual,
 * sin tocarlo.
 *
 * Si empieza con `+`/`00`, se le quita ese prefijo y se busca en `CODIGOS_PAIS` el
 * código **más largo** que sea prefijo de los dígitos que siguen — así `+5989…`
 * matchea `598` y no `5`, y `+5491…` matchea `54` y no `59`—.
 *
 * Si ningún código de la lista matchea, o el resto tras quitarlo queda vacío, se
 * devuelve `{ codigo: codigoDefault, nacional: display }` con el display **crudo**
 * intacto (incluido su `+`/`00`). Es deliberado: así un número de un país que no
 * está en la lista (o mal formado) sobrevive a una edición sin corromperse — la UI
 * lo muestra tal cual en "Número", y como sigue arrancando con `+`/`00`, un
 * `componerTelefono` posterior no le vuelve a anteponer nada.
 *
 * @param display teléfono guardado, tal como lo devuelve `componerTelefono`.
 * @param codigoDefault código de país default del negocio.
 */
export function separarCodigoPais(display: string, codigoDefault: string): TelefonoSeparado {
  const trimmed = display.trim();

  if (!trimmed.startsWith('+') && !trimmed.startsWith('00')) {
    return { codigo: codigoDefault, nacional: trimmed };
  }

  const restante = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed.slice(2);
  const leadingDigits = restante.match(/^\d+/)?.[0] ?? '';

  const candidato = CODIGOS_PAIS.filter((c) => leadingDigits.startsWith(c.codigo)).sort(
    (a, b) => b.codigo.length - a.codigo.length,
  )[0];

  if (candidato) {
    const nacional = restante.slice(candidato.codigo.length).replace(/^\s+/, '');
    if (nacional !== '') return { codigo: candidato.codigo, nacional };
  }

  return { codigo: codigoDefault, nacional: trimmed };
}
