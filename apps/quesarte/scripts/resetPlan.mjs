/**
 * Módulo PURO del reseteo de datos operativos (tarea A5, ver
 * `README-reset-operativo.md`). Sin `firebase-admin`, sin red y sin `fs`: acá vive
 * TODO lo que decide **qué** se toca —el catálogo de colecciones, el parseo de
 * argumentos, el cálculo de los parches de contadores derivados y la
 * (de)serialización de documentos para el backup— y está testeado en
 * `resetPlan.test.mjs`.
 *
 * `reset-operativo.mjs` es solo el shell: guardrails, I/O y batches.
 *
 * Separar así no es prolijidad: el criterio de qué se borra y qué se conserva es
 * la parte de esta operación que NO se puede probar contra un Firestore real
 * (borrar prod es irreversible), así que tiene que ser código puro con tests.
 */

// ── Catálogo de colecciones ────────────────────────────────────────────────
//
// Fuente: `docs/02-dominio-quesarte.md` ("Colecciones Firestore") +
// `docs/07-clientes-proveedores.md` ("Colecciones"). Verificado contra el código:
// las únicas 10 colecciones que la app nombra son las de acá (grep de
// `collection(db, '…')` / `doc(db, '…')` en `apps/quesarte/src` y
// `packages/firebase-kit/src`).
//
// Criterio: se borra el DATO OPERATIVO (lo que generó la operación del negocio) y
// se conserva la CONFIGURACIÓN y el CATÁLOGO (lo que el negocio definió). Ante la
// duda, se conserva: conservar de más es recuperable, borrar de más no.

/** Datos operativos: se borran documento por documento. */
export const COLECCIONES_A_BORRAR = [
  {
    nombre: 'ventas',
    motivo:
      'Ticket de mostrador (doc 02 "Venta"). Es el hecho operativo por excelencia; ' +
      'todo lo de acá son pruebas del desarrollador.',
  },
  {
    nombre: 'movimientos',
    motivo:
      'Auditoría de cambios de stock (doc 02 "Movimiento de stock"). Solo tiene sentido ' +
      'como historia de las ventas/compras/ajustes que se borran con ella.',
  },
  {
    nombre: 'piezas',
    motivo:
      'Stock físico por pieza (doc 02 "Pieza"). ES el stock de los productos por pieza: ' +
      'si queda, el sistema arranca con mercadería que no existe.',
  },
  {
    nombre: 'compras',
    motivo:
      'Compras con prorrateo de gastos (doc 03). Incluye borradores y confirmadas: una ' +
      'compra confirmada de prueba distorsiona costos y el reporte de rendimiento de viaje.',
  },
];

/**
 * Colecciones que se CONSERVAN pero que guardan contadores DERIVADOS de lo que se
 * borra. El documento queda; los números que "recuerdan" datos borrados van a cero.
 */
export const COLECCIONES_A_RESETEAR = [
  {
    nombre: 'clientes',
    motivo:
      'El cliente se conserva (dato del negocio). Su `stats` es cache denormalizado de las ' +
      'ventas (doc 07, decisión 5): con las ventas borradas, queda mintiendo.',
    campos:
      'stats.cantidadVentas, stats.totalHistoricoCents, stats.primeraCompra, stats.ultimaCompra',
  },
  {
    nombre: 'productos',
    motivo:
      'El catálogo se conserva (nombre, categoría, modos, precio, umbrales, proveedor ' +
      'principal). Se ponen en cero el stock AGREGADO (granel/unidad, que es stock real ' +
      'de prueba) y `costoPromedioCents`, que es cache derivado de las compras (doc 02, ' +
      '"Notas": la fuente de verdad son compras y piezas).',
    campos: 'costoPromedioCents, stockGranelGramos, stockUnidades (+ actualizadoEn)',
  },
];

/** Configuración y catálogo: no se tocan en absoluto. */
export const COLECCIONES_A_CONSERVAR = [
  {
    nombre: 'usuarios',
    motivo: 'Altas por invitación (doc 04). Perder esto deja al dueño sin poder entrar.',
  },
  {
    nombre: 'categorias',
    motivo: 'Vocabulario controlado del catálogo (doc 02 "Categoría"). No tiene campos derivados.',
  },
  {
    nombre: 'proveedores',
    motivo:
      'Datos de contacto y de pago (doc 07). No tiene contadores derivados: su historial ' +
      'se calcula leyendo compras, no se cachea en el doc.',
  },
  {
    nombre: 'configuracion',
    motivo:
      'Documentos `general`, `tema` y `plantillasWhatsApp` (docs 02/03/06/08). Es la ' +
      'configuración que el dueño ya dejó como la quiere.',
  },
];

/** Las 10 colecciones conocidas del modelo. Cualquier otra es una sorpresa. */
export const COLECCIONES_CONOCIDAS = [
  ...COLECCIONES_A_BORRAR,
  ...COLECCIONES_A_RESETEAR,
  ...COLECCIONES_A_CONSERVAR,
].map((c) => c.nombre);

/** Colecciones que entran al backup: TODAS. Un snapshot parcial no restaura nada. */
export const COLECCIONES_A_RESPALDAR = [...COLECCIONES_CONOCIDAS].sort();

// ── CLI ────────────────────────────────────────────────────────────────────

export const AYUDA = `
reset-operativo.mjs — reseteo de datos operativos de la quesería (Admin SDK).

  pnpm run reset:operativo -- --project <projectId> [opciones]     (desde apps/quesarte)

Modos:
  (sin --ejecutar)          DRY-RUN (default): informa qué haría. No escribe NADA.
  --ejecutar                Ejecuta de verdad. Exige tipear el projectId para confirmar.
  --restaurar <archivo>     Restaura desde un backup en vez de borrar (también dry-run
                            por defecto; con --ejecutar escribe).

Opciones:
  --project <projectId>     OBLIGATORIO. Debe coincidir con el projectId de las
                            credenciales activas (no hay default).
  --backup-dir <ruta>       Dónde dejar backup y log. Default: ./backups
  --permitir-desconocidas   Sigue aunque Firestore tenga colecciones fuera del modelo
                            (por default aborta: no sabe si son datos o basura).
  --ayuda                   Esto.
`.trim();

/**
 * Parsea `argv` (sin `node` ni el nombre del script). No lee env ni fs: devuelve
 * los flags y una lista de errores (el shell decide cómo fallar).
 */
export function parsearArgs(argv) {
  const args = {
    project: undefined,
    ejecutar: false,
    restaurar: undefined,
    backupDir: './backups',
    permitirDesconocidas: false,
    ayuda: false,
    errores: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--project':
      case '--backup-dir':
      case '--restaurar': {
        const valor = argv[i + 1];
        if (valor === undefined || valor.startsWith('--')) {
          args.errores.push(`El flag ${arg} necesita un valor.`);
          break;
        }
        if (arg === '--project') args.project = valor;
        else if (arg === '--backup-dir') args.backupDir = valor;
        else args.restaurar = valor;
        i++;
        break;
      }
      case '--ejecutar':
        args.ejecutar = true;
        break;
      case '--permitir-desconocidas':
        args.permitirDesconocidas = true;
        break;
      case '--ayuda':
      case '--help':
      case '-h':
        args.ayuda = true;
        break;
      case '--':
        // Separador de pnpm (`pnpm run reset:operativo -- --project X`). pnpm 9 lo
        // reenvía tal cual al script, así que se ignora: no es un argumento.
        break;
      default:
        args.errores.push(`Argumento desconocido: ${arg}`);
    }
  }

  if (!args.ayuda && (args.project === undefined || args.project.length === 0)) {
    args.errores.push(
      'Falta --project <projectId>. Es obligatorio y NO tiene default: un default que ' +
        'apunte a producción es exactamente el accidente que este script evita.',
    );
  }

  return args;
}

// ── Parches de contadores derivados ────────────────────────────────────────

/**
 * Parche para poner en cero los contadores derivados de un `productos/{id}`.
 *
 * Reglas (ver `COLECCIONES_A_RESETEAR`):
 * - `costoPromedioCents` → 0 SIEMPRE que no lo esté ya. Es cache del promedio
 *   ponderado de las compras borradas. Cero (o ausente) significa "sin base de
 *   costo" en el resto del sistema (`FuenteCosteo` = `'sin_costo'`, doc PLAN-ACTIVO),
 *   que es exactamente la verdad después de borrar las compras.
 * - `stockGranelGramos` / `stockUnidades` → 0 si el campo ESTÁ presente y no es cero.
 *   **No se crean campos ausentes**: un campo que no existe no recuerda nada, y
 *   crearlo cambiaría la forma del documento sin necesidad.
 * - El stock de los productos por pieza NO vive acá (vive en `piezas`, que se borra).
 * - `actualizadoEn` se refresca solo si algo cambió (el doc efectivamente se tocó).
 *
 * @returns el parche, o `null` si el producto ya está en cero (⇒ no se escribe:
 *   esto es lo que hace verificable la idempotencia — la 2ª corrida da 0 escrituras).
 */
export function parcheProducto(datos, ahora) {
  const parche = {};
  if (datos.costoPromedioCents !== 0) parche.costoPromedioCents = 0;
  if (datos.stockGranelGramos !== undefined && datos.stockGranelGramos !== 0) {
    parche.stockGranelGramos = 0;
  }
  if (datos.stockUnidades !== undefined && datos.stockUnidades !== 0) {
    parche.stockUnidades = 0;
  }
  if (Object.keys(parche).length === 0) return null;
  parche.actualizadoEn = ahora;
  return parche;
}

/**
 * Parche para poner en cero el cache `stats` de un `clientes/{id}` (doc 07).
 *
 * Se reescribe el mapa `stats` ENTERO con `{cantidadVentas: 0, totalHistoricoCents: 0}`:
 * en un `update()` de Firestore, pasar un mapa como valor de campo REEMPLAZA el campo
 * completo, así que esto también elimina `primeraCompra`/`ultimaCompra` sin necesidad
 * de `FieldValue.delete()`. Es la misma forma que escribe el alta de cliente
 * (`clienteAltaValida` en `firestore.rules`: stats nace en cero y SIN fechas).
 *
 * Los datos personales (nombre, alias, teléfono, notas…) y `fechaAlta` no se tocan:
 * no son derivados de las ventas.
 *
 * @returns el parche, o `null` si ya está en cero y sin fechas (idempotencia).
 */
export function parcheCliente(datos) {
  const stats = datos.stats;
  const yaEnCero =
    stats !== null &&
    typeof stats === 'object' &&
    stats.cantidadVentas === 0 &&
    stats.totalHistoricoCents === 0 &&
    !('primeraCompra' in stats) &&
    !('ultimaCompra' in stats);
  if (yaEnCero) return null;
  return { stats: { cantidadVentas: 0, totalHistoricoCents: 0 } };
}

/** Qué función de parche le corresponde a cada colección de `COLECCIONES_A_RESETEAR`. */
export function parchePara(coleccion, datos, ahora) {
  if (coleccion === 'productos') return parcheProducto(datos, ahora);
  if (coleccion === 'clientes') return parcheCliente(datos);
  throw new Error(`No hay parche definido para la colección '${coleccion}'.`);
}

// ── (De)serialización del backup ───────────────────────────────────────────
//
// El backup tiene que poder RESTAURARSE, así que no alcanza con `JSON.stringify`:
// un `Timestamp` de Firestore se serializaría como `{_seconds, _nanoseconds}` (o
// como string si alguien le mete un `toJSON`) y volvería como un mapa cualquiera,
// convirtiendo silenciosamente todas las fechas del sistema en basura. Se usa un
// marcador explícito por tipo y se FALLA RUIDOSAMENTE ante cualquier tipo que no
// se sepa reconstruir: en este script, fallar aborta el borrado, que es lo correcto.

/** Marcador de tipo en el JSON del backup. */
export const CLAVE_TIPO = '__tipo__';

function esTimestampFirestore(valor) {
  return (
    typeof valor.toDate === 'function' &&
    typeof valor.seconds === 'number' &&
    typeof valor.nanoseconds === 'number'
  );
}

function esReferencia(valor) {
  return (
    typeof valor.path === 'string' &&
    typeof valor.id === 'string' &&
    typeof valor.collection === 'function'
  );
}

function esGeoPoint(valor) {
  return typeof valor.latitude === 'number' && typeof valor.longitude === 'number';
}

function esObjetoPlano(valor) {
  const proto = Object.getPrototypeOf(valor);
  return proto === Object.prototype || proto === null;
}

/**
 * Convierte un valor leído de Firestore a JSON restaurable.
 * @param valor valor crudo (`snapshot.data()` o cualquier nivel de anidamiento).
 * @param ruta ruta del campo, solo para el mensaje de error.
 */
export function serializarValor(valor, ruta = '') {
  if (valor === null) return null;

  const tipo = typeof valor;
  if (tipo === 'string' || tipo === 'boolean') return valor;
  if (tipo === 'number') {
    if (!Number.isFinite(valor)) {
      throw new Error(`Número no finito en '${ruta}' (${valor}): no es serializable a JSON.`);
    }
    return valor;
  }
  if (tipo === 'undefined') {
    // Firestore no persiste `undefined`; si aparece es del lado del SDK. Se omite
    // (el caller filtra las claves con `undefined`), pero nunca se escribe `null`.
    return undefined;
  }
  if (Array.isArray(valor)) {
    return valor.map((v, i) => serializarValor(v, `${ruta}[${i}]`));
  }
  if (tipo !== 'object') {
    throw new Error(`Tipo no soportado en '${ruta}': ${tipo}.`);
  }

  if (valor instanceof Date) {
    return { [CLAVE_TIPO]: 'timestamp', iso: valor.toISOString() };
  }
  if (esTimestampFirestore(valor)) {
    return {
      [CLAVE_TIPO]: 'timestamp',
      iso: valor.toDate().toISOString(),
      segundos: valor.seconds,
      nanosegundos: valor.nanoseconds,
    };
  }
  if (esReferencia(valor)) {
    return { [CLAVE_TIPO]: 'referencia', path: valor.path };
  }
  if (esGeoPoint(valor)) {
    return { [CLAVE_TIPO]: 'geopoint', latitud: valor.latitude, longitud: valor.longitude };
  }
  if (!esObjetoPlano(valor)) {
    throw new Error(
      `Valor de tipo desconocido en '${ruta}' (${valor.constructor?.name ?? '¿?'}): el backup ` +
        `no sabría restaurarlo. Se aborta antes de borrar nada.`,
    );
  }

  const salida = {};
  for (const [clave, v] of Object.entries(valor)) {
    if (clave === CLAVE_TIPO) {
      throw new Error(
        `El documento tiene un campo literal '${CLAVE_TIPO}' en '${ruta}': colisiona con el ` +
          `marcador de tipo del backup y haría irrestaurable el archivo.`,
      );
    }
    const serializado = serializarValor(v, ruta ? `${ruta}.${clave}` : clave);
    if (serializado !== undefined) salida[clave] = serializado;
  }
  return salida;
}

/**
 * Inversa de `serializarValor`. `fabricas` inyecta los constructores del SDK
 * (`timestamp`, `geopoint`, `referencia`) para que este módulo siga sin importar
 * `firebase-admin`.
 */
export function deserializarValor(valor, fabricas, ruta = '') {
  if (valor === null) return null;
  const tipo = typeof valor;
  if (tipo === 'string' || tipo === 'boolean' || tipo === 'number') return valor;
  if (Array.isArray(valor)) {
    return valor.map((v, i) => deserializarValor(v, fabricas, `${ruta}[${i}]`));
  }
  if (tipo !== 'object') {
    throw new Error(`Tipo no soportado en el backup, campo '${ruta}': ${tipo}.`);
  }

  const marcador = valor[CLAVE_TIPO];
  if (marcador !== undefined) {
    switch (marcador) {
      // Cada fábrica recibe el NODO entero del backup (no campos sueltos): así el
      // shell puede preferir `segundos`/`nanosegundos` sobre `iso` (que solo tiene
      // precisión de milisegundos) sin que este módulo sepa nada del SDK.
      case 'timestamp':
        return fabricas.timestamp(valor);
      case 'referencia':
        return fabricas.referencia(valor);
      case 'geopoint':
        return fabricas.geopoint(valor);
      default:
        throw new Error(`Marcador de tipo desconocido '${marcador}' en el campo '${ruta}'.`);
    }
  }

  const salida = {};
  for (const [clave, v] of Object.entries(valor)) {
    salida[clave] = deserializarValor(v, fabricas, ruta ? `${ruta}.${clave}` : clave);
  }
  return salida;
}

// ── Backup: nombre, forma y verificación ───────────────────────────────────

/** Marca temporal apta para nombre de archivo: `2026-07-24T18-05-31-042Z`. */
export function marcaTemporal(fecha) {
  return fecha.toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

export function nombreArchivoBackup(projectId, fecha) {
  return `reset-${projectId}-${marcaTemporal(fecha)}.json`;
}

export function nombreArchivoLog(projectId, fecha) {
  return `reset-${projectId}-${marcaTemporal(fecha)}.log.txt`;
}

/**
 * Verifica que el backup RELEÍDO del disco tenga exactamente lo que se acababa de
 * leer de Firestore. Es el chequeo que habilita el borrado: si esto devuelve algún
 * error, no se borra nada.
 *
 * @param backupLeido objeto parseado del archivo escrito.
 * @param conteosEsperados `{ coleccion: cantidadDeDocs }`.
 * @returns lista de errores (vacía = backup válido).
 */
export function verificarBackup(backupLeido, conteosEsperados) {
  const errores = [];
  if (backupLeido === null || typeof backupLeido !== 'object') {
    return ['El archivo de backup no contiene un objeto JSON.'];
  }
  if (backupLeido.meta === undefined || typeof backupLeido.meta.projectId !== 'string') {
    errores.push('El backup no tiene `meta.projectId`.');
  }
  const colecciones = backupLeido.colecciones;
  if (colecciones === undefined || typeof colecciones !== 'object') {
    return [...errores, 'El backup no tiene el objeto `colecciones`.'];
  }
  for (const [nombre, esperados] of Object.entries(conteosEsperados)) {
    const docs = colecciones[nombre];
    if (!Array.isArray(docs)) {
      errores.push(`Falta la colección '${nombre}' en el backup escrito.`);
      continue;
    }
    if (docs.length !== esperados) {
      errores.push(
        `La colección '${nombre}' quedó con ${docs.length} documentos en el backup, ` +
          `pero Firestore devolvió ${esperados}.`,
      );
    }
    for (const doc of docs) {
      if (doc === null || typeof doc !== 'object' || typeof doc.id !== 'string') {
        errores.push(`La colección '${nombre}' tiene un documento sin \`id\` en el backup.`);
        break;
      }
    }
  }
  return errores;
}

// ── Resumen (mismo texto para consola y log) ───────────────────────────────

function fila(nombre, valor) {
  return `  ${nombre.padEnd(16)} ${valor}`;
}

/**
 * Arma el resumen que se muestra ANTES de pedir confirmación (y que se guarda en
 * el log). Función pura: recibe los conteos ya calculados.
 */
export function lineasResumen({ projectId, modo, conteos, aResetear, rutaBackup, desconocidas }) {
  const lineas = [];
  lineas.push('');
  lineas.push('─'.repeat(72));
  lineas.push(`  RESETEO DE DATOS OPERATIVOS — proyecto: ${projectId}`);
  lineas.push(`  modo: ${modo}`);
  lineas.push('─'.repeat(72));
  lineas.push('');
  lineas.push('BORRAR (datos operativos):');
  let totalBorrar = 0;
  for (const { nombre } of COLECCIONES_A_BORRAR) {
    const n = conteos[nombre] ?? 0;
    totalBorrar += n;
    lineas.push(fila(nombre, `${n} documentos`));
  }
  lineas.push(fila('TOTAL', `${totalBorrar} documentos a borrar`));
  lineas.push('');
  lineas.push('RESETEAR contadores derivados (los documentos se conservan):');
  for (const { nombre, campos } of COLECCIONES_A_RESETEAR) {
    const n = conteos[nombre] ?? 0;
    const aTocar = aResetear[nombre] ?? 0;
    lineas.push(fila(nombre, `${aTocar} de ${n} documentos a modificar — ${campos}`));
  }
  lineas.push('');
  lineas.push('CONSERVAR intactas:');
  for (const { nombre } of COLECCIONES_A_CONSERVAR) {
    lineas.push(fila(nombre, `${conteos[nombre] ?? 0} documentos — sin cambios`));
  }
  lineas.push('');
  if (desconocidas.length > 0) {
    lineas.push('⚠ COLECCIONES DESCONOCIDAS (no están en docs/02 ni en docs/07):');
    for (const nombre of desconocidas) {
      lineas.push(fila(nombre, 'NO se toca. Revisar a mano antes de seguir.'));
    }
    lineas.push('');
  }
  lineas.push(`Backup: ${rutaBackup}`);
  lineas.push('');
  return lineas;
}
