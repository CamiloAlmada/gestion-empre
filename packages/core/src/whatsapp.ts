/**
 * Plantillas de mensajes y armado de links `wa.me` (doc 08).
 *
 * Restricción de diseño (doc 08): la app **nunca envía** mensajes, los **prepara**.
 * Estas funciones solo resuelven texto y construyen una URL `wa.me`; el envío lo
 * decide el dueño al tocar el link. No hay —ni puede haber— envío automático.
 *
 * TypeScript puro: sin dependencias, sin side effects (regla de oro 1). El formateo
 * de dinero es de la capa UI: los `valores` llegan ya formateados como string.
 */

/** Contexto donde se ofrece la plantilla (dónde aparece el botón, doc 08). */
export type ContextoPlantilla = 'venta' | 'cliente' | 'inactivo' | 'cobro';

/** Plantilla de mensaje de WhatsApp con placeholders `{clave}`. */
export interface PlantillaWhatsApp {
  /** Identificador estable (clave de seed / documento). */
  readonly id: string;
  /** Nombre visible en el selector de plantillas. */
  readonly nombre: string;
  /** Contexto en el que se ofrece. */
  readonly contexto: ContextoPlantilla;
  /**
   * Texto con placeholders `{cliente}`, `{total}`, `{items}`, `{diasSinVenir}`,
   * `{negocio}`, `{deuda}` (deuda pendiente ya formateada) y `{diasDeuda}` (días
   * desde la venta pendiente más vieja).
   */
  readonly texto: string;
  /**
   * Ausente = activa. Solo las plantillas **propias** (las que no son de fábrica,
   * ver `esPlantillaDeFabrica`) pueden tener `false`. Se persiste únicamente
   * `activa: false`: una plantilla activa no lleva la clave, para que el documento
   * de producción y el seed sigan siendo válidos sin migrar datos.
   */
  readonly activa?: boolean;
}

/** Placeholder bien formado: `{` + una clave sin llaves + `}`. */
const PLACEHOLDER = /\{([^{}]+)\}/g;

/**
 * Resuelve los placeholders `{clave}` de `texto` con `valores`. Genérico: reemplaza
 * cualquier `{clave}` cuya `clave` exista como propiedad propia de `valores` (las
 * claves las define el caller; doc 08 usa `cliente`, `total`, `items`,
 * `diasSinVenir`, `negocio`, y el contexto `cobro` suma `deuda` y `diasDeuda`).
 *
 * Decisiones (documentadas a propósito):
 * - **Placeholder sin valor** → se deja **literal** (`{clave}` visible en el
 *   resultado). Así el dueño nota una plantilla mal escrita en vez de que el hueco
 *   desaparezca en silencio.
 * - **Un único pase** sobre el texto original: un valor que contenga `{...}` no se
 *   vuelve a resolver (no hay recursión ni inyección de placeholders).
 * - **Llaves malformadas o anidadas** (`{a{b}}`, `{sin cierre`, `}`) no matchean el
 *   patrón de placeholder bien formado y quedan literales.
 * - Un valor mapeado a `''` resuelve a cadena vacía (es un valor presente, no un
 *   faltante): se distingue por propiedad propia, no por “truthy”.
 *
 * @param texto plantilla con placeholders.
 * @param valores diccionario `clave → valor` (valores ya formateados como string).
 * @returns el texto con los placeholders conocidos reemplazados.
 */
export function resolverPlantilla(texto: string, valores: Record<string, string>): string {
  return texto.replace(PLACEHOLDER, (match, clave: string) =>
    Object.prototype.hasOwnProperty.call(valores, clave) ? valores[clave]! : match,
  );
}

/**
 * Construye el link `wa.me` para abrir WhatsApp con destinatario y texto
 * precargados (doc 08): `https://wa.me/<numero>?text=<encodeURIComponent(mensaje)>`.
 *
 * `encodeURIComponent` codifica correctamente emojis, saltos de línea (`\n` →
 * `%0A`), y `&`, `?`, `=`, `#`, acentos, etc. — imprescindible para que el mensaje
 * llegue intacto.
 *
 * @param telefonoE164 número E.164 **sin `+`** (salida de `normalizarTelefono`).
 * @param mensaje texto ya resuelto (ver `resolverPlantilla`).
 * @returns URL `wa.me` lista para abrir.
 * @throws {RangeError} si `telefonoE164` no es una cadena de solo dígitos: un link a
 *   un número inválido es peor que ningún link (doc 08).
 */
export function construirLinkWhatsApp(telefonoE164: string, mensaje: string): string {
  if (!/^\d+$/.test(telefonoE164)) {
    throw new RangeError(
      `construirLinkWhatsApp requiere un teléfono E.164 sin '+' (solo dígitos), recibió: ${telefonoE164}`,
    );
  }
  return `https://wa.me/${telefonoE164}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Plantillas iniciales (seed) del doc 08. El kit y la UI las consumen para poblar
 * `configuracion/plantillasWhatsApp`; después el dueño las edita a su tono. El texto
 * es **exacto** al del doc 08 (no parafrasear).
 */
export const PLANTILLAS_SEED: readonly PlantillaWhatsApp[] = [
  {
    id: 'pedido-listo',
    nombre: 'Pedido listo',
    contexto: 'venta',
    texto:
      'Hola {cliente}! Tu pedido está listo: {items}. Total: {total}. ¿A qué hora te queda bien pasar a buscarlo?',
  },
  {
    id: 'te-extranamos',
    nombre: 'Te extrañamos',
    contexto: 'inactivo',
    texto:
      'Hola {cliente}! Hace {diasSinVenir} días que no te vemos por {negocio}. Esta semana tenemos novedades que te pueden gustar 😊',
  },
  {
    id: 'aviso-llegada',
    nombre: 'Aviso de llegada',
    contexto: 'cliente',
    texto: 'Hola {cliente}! Llegó mercadería nueva que suele gustarte. ¡Te esperamos!',
  },
  {
    id: 'recordatorio-cobro',
    nombre: 'Recordatorio de cobro',
    contexto: 'cobro',
    texto:
      'Hola {cliente}! Te recuerdo que tenés pendiente {deuda} en {negocio}. Cuando puedas, avisame por acá cómo te queda mejor abonarlo. ¡Gracias!',
  },
] as const;

/**
 * Devuelve `plantillas` más, al final, las plantillas de `seed` cuyo `id` no esté
 * en `plantillas`. Nunca pisa ni reordena las existentes.
 *
 * Motivo: producción tiene guardado un documento con las 3 plantillas viejas; sin
 * esto la plantilla de cobro (agregada después) no aparecería nunca. Así entra sin
 * migrar datos y sin pisar lo que el dueño editó.
 */
export function completarConSeed(
  plantillas: readonly PlantillaWhatsApp[],
  seed: readonly PlantillaWhatsApp[],
): PlantillaWhatsApp[] {
  const ids = new Set(plantillas.map((p) => p.id));
  return [...plantillas, ...seed.filter((p) => !ids.has(p.id))];
}

/**
 * `true` si `id` es el de una plantilla de fábrica (la lista `seed`). Las de fábrica
 * se editan pero nunca se desactivan.
 */
export function esPlantillaDeFabrica(id: string, seed: readonly PlantillaWhatsApp[] = PLANTILLAS_SEED): boolean {
  return seed.some((p) => p.id === id);
}

/**
 * Las plantillas con `activa !== false` (ausente o `true`). Es lo que usa el botón
 * de WhatsApp. Como cada contexto tiene exactamente una plantilla de fábrica y esas
 * no se pueden desactivar, siempre queda al menos una activa por contexto.
 */
export function plantillasActivas(lista: readonly PlantillaWhatsApp[]): PlantillaWhatsApp[] {
  return lista.filter((p) => p.activa !== false);
}

/**
 * Devuelve `lista` completada con `seed` (`completarConSeed`) y con cada plantilla
 * de fábrica vuelta al valor del seed (nombre, texto, contexto; sin `activa`). Las
 * propias quedan intactas, incluidos su `activa` y su posición. No muta la entrada.
 *
 * Reemplaza a la vieja "Restaurar iniciales", que escribía el seed entero y habría
 * borrado las plantillas propias.
 */
export function restaurarPlantillasDeFabrica(
  lista: readonly PlantillaWhatsApp[],
  seed: readonly PlantillaWhatsApp[] = PLANTILLAS_SEED,
): PlantillaWhatsApp[] {
  const porId = new Map(seed.map((p) => [p.id, p]));
  return completarConSeed(lista, seed).map((p) => {
    const fabrica = porId.get(p.id);
    return fabrica ? { ...fabrica } : p;
  });
}
