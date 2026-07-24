/**
 * Reseteo de DATOS OPERATIVOS de la quesería, con `firebase-admin` (tarea A5).
 * Se corre UNA sola vez por proyecto, antes de entregarle el sistema al dueño:
 * borra las pruebas del desarrollador y deja la base lista para que todos los
 * datos reales nazcan con la lógica de costeo congelado.
 *
 * ## ESTO BORRA DATOS DE PRODUCCIÓN DE FORMA IRREVERSIBLE — LEER ANTES DE TOCAR
 *
 * El requisito #1 de este archivo NO es la comodidad: es que sea DIFÍCIL hacer
 * daño por accidente. Las salvaguardas, en el orden en que actúan:
 *
 *  1. **Dry-run por defecto.** Sin `--ejecutar` el script solo LEE e informa.
 *     No abre un batch, no crea el directorio de backup, no escribe un byte.
 *  2. **`--project <id>` obligatorio, sin default.** Un default que apunte a
 *     producción es exactamente el accidente que hay que evitar.
 *  3. **Doble señal de proyecto** — el mismo patrón del "GUARDRAIL DURO" de
 *     `seed-demo.mjs`, adaptado. Ninguna señal alcanza sola:
 *       (1) el flag `--project <id>` explícito: la intención DECLARADA por quien corre;
 *       (2) el projectId que se desprende DE VERDAD de las credenciales activas
 *           (`project_id` del JSON de `GOOGLE_APPLICATION_CREDENTIALS`, o
 *           `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT`), leído LOCALMENTE, SIN RED, y
 *           ANTES de inicializar `firebase-admin` — nunca un valor que el script se
 *           autoasigne.
 *     La diferencia con el seed es la dirección del riesgo: aquel tiene una allowlist
 *     de UN projectId (`quesarte-uy-dev`) porque prod jamás debe recibir datos de
 *     demo; acá el objetivo LEGÍTIMO puede ser prod, así que no hay allowlist: se
 *     exige COINCIDENCIA EXACTA entre las dos señales y se aborta ante cualquier
 *     discrepancia. Un `--project quesarte-uy` con credenciales de dev (o al revés)
 *     corta antes de la primera llamada a Firestore.
 *  4. **Confirmación tipeada.** Con `--ejecutar`, después de mostrar el resumen,
 *     hay que TIPEAR el projectId completo. Sin TTY no se ejecuta (no hay bypass
 *     no-interactivo: un script que puede correr desatendido puede correr por error).
 *  5. **Backup primero.** Se exporta TODA la base a un JSON local, se relee del
 *     disco y se verifican los conteos. Si algo de eso falla, no se borra nada.
 *  6. **Colección desconocida ⇒ aborta.** Si Firestore tiene una colección que no
 *     está en `docs/02`/`docs/07`, el script se planta: no sabe si es dato o basura.
 *  7. **Idempotente.** Solo escribe los documentos que realmente cambian, así que
 *     la 2ª corrida reporta 0 borrados y 0 modificados (evidencia, no promesa).
 *  8. **Log verificable.** Backup + log quedan en disco con conteos antes/después.
 *
 * Qué se borra y qué se conserva (con su justificación contra el modelo de
 * dominio) vive en `resetPlan.mjs` → `COLECCIONES_A_BORRAR` /
 * `COLECCIONES_A_RESETEAR` / `COLECCIONES_A_CONSERVAR`. Ese módulo es puro y está
 * testeado; este archivo es solo el shell (guardrails, I/O, batches). Es la misma
 * separación que ya usa el seed de demo (`generador.mjs`/`mapeoAdmin.mjs` puros +
 * `seed-demo.mjs` shell).
 *
 * Uso y credenciales: `README-reset-operativo.md`, al lado de este archivo.
 * Comando declarado: `pnpm run reset:operativo -- --project <id> [...]`.
 */

import process from 'node:process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  AYUDA,
  COLECCIONES_A_BORRAR,
  COLECCIONES_A_RESETEAR,
  COLECCIONES_A_RESPALDAR,
  COLECCIONES_CONOCIDAS,
  deserializarValor,
  lineasResumen,
  marcaTemporal,
  nombreArchivoBackup,
  nombreArchivoLog,
  parchePara,
  parsearArgs,
  serializarValor,
  verificarBackup,
} from './resetPlan.mjs';

/** Máximo de escrituras por batch en Firestore. */
const TAMANO_BATCH = 500;

// ── Bitácora (todo lo que se imprime queda también en el log) ──────────────

const bitacora = [];

function registrar(linea = '') {
  bitacora.push(linea);
  console.log(linea);
}

function registrarVarias(lineas) {
  for (const linea of lineas) registrar(linea);
}

function fallar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

// ── Guardrail de projectId ─────────────────────────────────────────────────

/**
 * Resuelve el projectId de las credenciales activas SIN tocar la red: si hay
 * `GOOGLE_APPLICATION_CREDENTIALS` (service account), lee y parsea ese JSON
 * localmente (`project_id`, el mismo campo que usaría `applicationDefault()`); si
 * no, cae a las env vars estándar del SDK. Deliberadamente NO usa el metadata
 * server de GCP ni ninguna llamada a Firestore: este chequeo tiene que poder
 * decidir ANTES de la primera conexión.
 *
 * (Mismo criterio y misma implementación que el guardrail de `seed-demo.mjs`; se
 * duplica en vez de importarse porque aquel tiene el projectId de dev hardcodeado
 * y este script debe poder apuntar también a prod, con confirmación humana.)
 */
function resolverProjectIdLocal() {
  const rutaCredenciales = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (rutaCredenciales) {
    try {
      const credencial = JSON.parse(readFileSync(rutaCredenciales, 'utf8'));
      if (typeof credencial.project_id === 'string' && credencial.project_id.length > 0) {
        return credencial.project_id;
      }
    } catch {
      // Se ignora acá a propósito: si el archivo no existe o no es JSON válido,
      // `applicationDefault()` falla más abajo con un mensaje más claro sobre EL
      // MISMO archivo al intentar autenticar de verdad.
    }
  }
  const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  return envProjectId && envProjectId.length > 0 ? envProjectId : undefined;
}

/**
 * Exige que el `--project` declarado coincida con el projectId resuelto localmente
 * de las credenciales. Recién si coinciden se inicializa `firebase-admin` (primera
 * llamada de red posible).
 */
function conectar(projectId) {
  const projectIdReal = resolverProjectIdLocal();
  if (projectIdReal !== projectId) {
    fallar(
      `El projectId de las credenciales activas ('${projectIdReal ?? '(indefinido)'}') NO coincide ` +
        `con el --project declarado ('${projectId}').\n` +
        `  Este script se niega a correr: estarías apuntando a un proyecto distinto del que creés.\n` +
        `  Revisá GOOGLE_APPLICATION_CREDENTIALS (service account de '${projectId}') o exportá ` +
        `GOOGLE_CLOUD_PROJECT=${projectId}. Ver README-reset-operativo.md.`,
    );
  }
  try {
    return getFirestore(initializeApp({ credential: applicationDefault(), projectId }));
  } catch (error) {
    return fallar(
      `El projectId local coincide, pero no se pudieron resolver las credenciales de Google Cloud ` +
        `(ADC / GOOGLE_APPLICATION_CREDENTIALS). Detalle: ` +
        `${error instanceof Error ? error.message : error}\n` +
        `  Ver README-reset-operativo.md para cómo autenticar.`,
    );
  }
}

/** Confirmación humana: hay que tipear el projectId completo. Sin TTY, no corre. */
async function confirmarTipeando(projectId, accion) {
  if (!process.stdin.isTTY) {
    fallar(
      `--ejecutar exige confirmación interactiva y la entrada estándar no es una terminal.\n` +
        `  No hay bypass no-interactivo a propósito: un comando que puede correr desatendido ` +
        `puede correr por error, y ${accion} no se deshace sola.`,
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let respuesta;
  try {
    respuesta = await rl.question(
      `\nPara confirmar ${accion} en '${projectId}', tipeá el projectId completo: `,
    );
  } catch {
    // Ctrl+D / entrada cerrada: es un "no" (y NO un stack trace en pantalla).
    rl.close();
    fallar('Confirmación cancelada (entrada cerrada). No se hizo nada.');
  }
  rl.close();
  if (respuesta.trim() !== projectId) {
    fallar(`Lo tipeado ('${respuesta.trim()}') no coincide con '${projectId}'. No se hizo nada.`);
  }
  registrar(`\nConfirmado por tipeo: ${projectId}`);
}

// ── Lectura ────────────────────────────────────────────────────────────────

/** Lee todas las colecciones conocidas. Devuelve `{ nombre: QueryDocumentSnapshot[] }`. */
async function leerTodo(db) {
  const porColeccion = {};
  for (const nombre of COLECCIONES_A_RESPALDAR) {
    const snap = await db.collection(nombre).get();
    porColeccion[nombre] = snap.docs;
  }
  return porColeccion;
}

/** Colecciones presentes en Firestore que no están en el modelo documentado. */
async function detectarDesconocidas(db) {
  const presentes = (await db.listCollections()).map((c) => c.id);
  return presentes.filter((nombre) => !COLECCIONES_CONOCIDAS.includes(nombre)).sort();
}

/**
 * Calcula, para cada colección con contadores derivados, qué documentos necesitan
 * parche. Se usa igual en dry-run (para informar) y en la ejecución (para escribir),
 * así el dry-run no miente: es exactamente el mismo cálculo.
 */
function calcularParches(docsPorColeccion, ahora) {
  const parches = {};
  for (const { nombre } of COLECCIONES_A_RESETEAR) {
    parches[nombre] = [];
    for (const doc of docsPorColeccion[nombre]) {
      const parche = parchePara(nombre, doc.data(), ahora);
      if (parche !== null) parches[nombre].push({ ref: doc.ref, id: doc.id, parche });
    }
  }
  return parches;
}

// ── Backup ─────────────────────────────────────────────────────────────────

/**
 * Serializa TODO lo leído, lo escribe a disco, lo RELEE y verifica los conteos.
 * Si cualquier paso falla, corta el proceso (⇒ no se borra nada).
 *
 * Se respalda la base entera (también lo que no se toca): un snapshot parcial no
 * sirve para volver atrás, y el dataset de esta app es chico.
 */
function escribirBackupVerificado(docsPorColeccion, { projectId, rutaBackup, ahora }) {
  const colecciones = {};
  const conteos = {};
  try {
    for (const [nombre, docs] of Object.entries(docsPorColeccion)) {
      colecciones[nombre] = docs.map((doc) => ({
        id: doc.id,
        datos: serializarValor(doc.data(), `${nombre}/${doc.id}`),
      }));
      conteos[nombre] = docs.length;
    }
  } catch (error) {
    fallar(
      `No se pudo serializar la base para el backup: ${error instanceof Error ? error.message : error}\n` +
        `  NO se borró nada.`,
    );
  }

  const backup = {
    meta: {
      script: 'reset-operativo.mjs',
      version: 1,
      projectId,
      generadoEn: ahora.toISOString(),
      colecciones: Object.keys(colecciones).sort(),
      totalDocumentos: Object.values(conteos).reduce((a, b) => a + b, 0),
    },
    colecciones,
  };

  try {
    const directorio = resolve(rutaBackup, '..');
    if (!existsSync(directorio)) mkdirSync(directorio, { recursive: true });
    writeFileSync(rutaBackup, JSON.stringify(backup, null, 2), 'utf8');
  } catch (error) {
    fallar(
      `No se pudo ESCRIBIR el backup en '${rutaBackup}': ` +
        `${error instanceof Error ? error.message : error}\n  NO se borró nada.`,
    );
  }

  let releido;
  try {
    releido = JSON.parse(readFileSync(rutaBackup, 'utf8'));
  } catch (error) {
    fallar(
      `El backup se escribió pero NO se pudo releer/parsear ('${rutaBackup}'): ` +
        `${error instanceof Error ? error.message : error}\n  NO se borró nada.`,
    );
  }

  const errores = verificarBackup(releido, conteos);
  if (errores.length > 0) {
    fallar(
      `El backup releído no cuadra con lo leído de Firestore:\n  - ${errores.join('\n  - ')}\n` +
        `  NO se borró nada.`,
    );
  }

  registrar(`Backup verificado: ${backup.meta.totalDocumentos} documentos en '${rutaBackup}'.`);
}

// ── Escrituras ─────────────────────────────────────────────────────────────

/** Borra las referencias dadas en batches de 500. Devuelve cuántas borró. */
async function borrarEnLotes(db, refs) {
  for (let i = 0; i < refs.length; i += TAMANO_BATCH) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + TAMANO_BATCH)) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}

/** Aplica los parches en batches de 500. Devuelve cuántos documentos modificó. */
async function parchearEnLotes(db, entradas) {
  for (let i = 0; i < entradas.length; i += TAMANO_BATCH) {
    const batch = db.batch();
    for (const { ref, parche } of entradas.slice(i, i + TAMANO_BATCH)) batch.update(ref, parche);
    await batch.commit();
  }
  return entradas.length;
}

// ── Verificación final ─────────────────────────────────────────────────────

/** Relee Firestore y confirma el estado final. Devuelve la lista de problemas. */
async function verificarEstadoFinal(db, ahora) {
  const problemas = [];
  registrar('');
  registrar('Verificación final (releyendo Firestore):');
  for (const { nombre } of COLECCIONES_A_BORRAR) {
    const { count } = (await db.collection(nombre).count().get()).data();
    registrar(`  ${nombre.padEnd(16)} ${count} documentos ${count === 0 ? '✓' : '✖'}`);
    if (count !== 0) problemas.push(`Quedaron ${count} documentos en '${nombre}'.`);
  }
  for (const { nombre } of COLECCIONES_A_RESETEAR) {
    const docs = (await db.collection(nombre).get()).docs;
    const pendientes = docs.filter((d) => parchePara(nombre, d.data(), ahora) !== null);
    registrar(
      `  ${nombre.padEnd(16)} ${docs.length} documentos, ${pendientes.length} con contadores ` +
        `sin resetear ${pendientes.length === 0 ? '✓' : '✖'}`,
    );
    if (pendientes.length !== 0) {
      problemas.push(
        `Quedaron ${pendientes.length} documentos de '${nombre}' con contadores derivados ` +
          `distintos de cero (ids: ${pendientes
            .slice(0, 5)
            .map((d) => d.id)
            .join(', ')}…).`,
      );
    }
  }
  return problemas;
}

// ── Log ────────────────────────────────────────────────────────────────────

function escribirLog(rutaLog) {
  try {
    const directorio = resolve(rutaLog, '..');
    if (!existsSync(directorio)) mkdirSync(directorio, { recursive: true });
    writeFileSync(rutaLog, `${bitacora.join('\n')}\n`, 'utf8');
    console.log(`\nLog: ${rutaLog}`);
  } catch (error) {
    console.error(
      `\n⚠ No se pudo escribir el log en '${rutaLog}': ` +
        `${error instanceof Error ? error.message : error}\n` +
        `  (la operación en sí ya terminó; el resumen está arriba en pantalla)`,
    );
  }
}

// ── Modo: reseteo ──────────────────────────────────────────────────────────

/**
 * Nota sobre concurrencia: se lee la base UNA vez (antes del resumen) y se borra
 * exactamente ESO. Si alguien registrara una venta entre la lectura y la
 * confirmación, ese documento NO estaría en el backup y por lo tanto TAMPOCO se
 * borra — el error cae siempre del lado de conservar, y la verificación final lo
 * detecta (la colección no queda en 0 y el script sale con código 1). Igual, esta
 * operación se corre con el negocio parado: es un reseteo previo a la entrega.
 */
async function modoReset(db, args, ahora) {
  const projectId = args.project;
  const rutaBackup = resolve(args.backupDir, nombreArchivoBackup(projectId, ahora));
  const rutaLog = resolve(args.backupDir, nombreArchivoLog(projectId, ahora));

  const desconocidas = await detectarDesconocidas(db);
  const docsPorColeccion = await leerTodo(db);
  const parches = calcularParches(docsPorColeccion, ahora);

  const conteos = {};
  for (const [nombre, docs] of Object.entries(docsPorColeccion)) conteos[nombre] = docs.length;
  const aResetear = {};
  for (const [nombre, entradas] of Object.entries(parches)) aResetear[nombre] = entradas.length;

  registrarVarias(
    lineasResumen({
      projectId,
      modo: args.ejecutar ? 'EJECUCIÓN REAL (--ejecutar)' : 'DRY-RUN (no escribe nada)',
      conteos,
      aResetear,
      rutaBackup: args.ejecutar ? rutaBackup : `${rutaBackup}  (dry-run: no se va a escribir)`,
      desconocidas,
    }),
  );

  if (!args.ejecutar) {
    registrar('DRY-RUN: no se escribió NADA. Para ejecutar de verdad, agregá --ejecutar.');
    registrar('');
    return 0;
  }

  if (desconocidas.length > 0 && !args.permitirDesconocidas) {
    fallar(
      `Firestore tiene ${desconocidas.length} colección(es) fuera del modelo documentado ` +
        `(${desconocidas.join(', ')}).\n` +
        `  El script se planta: no sabe si eso es dato del negocio o basura, y decidir por su ` +
        `cuenta sería justo el error que hay que evitar.\n` +
        `  Revisalas a mano. Si confirmás que no hay que tocarlas (el script NUNCA las borra, ` +
        `solo las ignora), repetí con --permitir-desconocidas.`,
    );
  }

  await confirmarTipeando(projectId, 'el BORRADO IRREVERSIBLE de los datos operativos');

  registrar('');
  registrar('1) Backup completo antes de tocar nada…');
  escribirBackupVerificado(docsPorColeccion, { projectId, rutaBackup, ahora });

  registrar('');
  registrar('2) Borrando datos operativos…');
  let totalBorrados = 0;
  for (const { nombre } of COLECCIONES_A_BORRAR) {
    const refs = docsPorColeccion[nombre].map((d) => d.ref);
    const n = await borrarEnLotes(db, refs);
    totalBorrados += n;
    registrar(`  ${nombre.padEnd(16)} ${n} documentos borrados`);
  }

  registrar('');
  registrar('3) Reseteando contadores derivados…');
  let totalParcheados = 0;
  for (const { nombre } of COLECCIONES_A_RESETEAR) {
    const n = await parchearEnLotes(db, parches[nombre]);
    totalParcheados += n;
    registrar(`  ${nombre.padEnd(16)} ${n} documentos modificados`);
  }

  const problemas = await verificarEstadoFinal(db, ahora);

  registrar('');
  registrar(
    `Resultado: ${totalBorrados} documentos borrados, ${totalParcheados} documentos ` +
      `con contadores reseteados, en '${projectId}'.`,
  );
  if (problemas.length > 0) {
    registrar('');
    registrar('✖ La verificación final encontró problemas:');
    for (const p of problemas) registrar(`  - ${p}`);
    registrar(`  El backup completo previo está en: ${rutaBackup}`);
    escribirLog(rutaLog);
    return 1;
  }
  registrar('✓ Verificación final OK. Volver a correr este script debe dar 0 y 0 (idempotencia).');
  registrar('');
  escribirLog(rutaLog);
  return 0;
}

// ── Modo: restauración desde backup ────────────────────────────────────────

async function modoRestaurar(db, args, ahora) {
  const projectId = args.project;
  const rutaArchivo = resolve(args.restaurar);

  let backup;
  try {
    backup = JSON.parse(readFileSync(rutaArchivo, 'utf8'));
  } catch (error) {
    return fallar(
      `No se pudo leer el backup '${rutaArchivo}': ${error instanceof Error ? error.message : error}`,
    );
  }
  if (backup?.meta?.projectId !== projectId) {
    return fallar(
      `El backup fue tomado del proyecto '${backup?.meta?.projectId ?? '(desconocido)'}' y estás ` +
        `restaurando sobre '${projectId}'. Se aborta: restaurar entre proyectos distintos no es ` +
        `una operación que este script vaya a hacer sola.`,
    );
  }

  // Las fábricas cierran sobre `db` (las referencias se resuelven contra ESTA base).
  const fabricas = {
    timestamp: (nodo) =>
      typeof nodo.segundos === 'number'
        ? new Timestamp(nodo.segundos, nodo.nanosegundos ?? 0)
        : Timestamp.fromDate(new Date(nodo.iso)),
    geopoint: (nodo) => new GeoPoint(nodo.latitud, nodo.longitud),
    referencia: (nodo) => db.doc(nodo.path),
  };

  registrar('');
  registrar('─'.repeat(72));
  registrar(`  RESTAURACIÓN DESDE BACKUP — proyecto: ${projectId}`);
  registrar(`  archivo: ${rutaArchivo} (generado ${backup.meta.generadoEn})`);
  registrar(
    `  modo: ${args.ejecutar ? 'EJECUCIÓN REAL (--ejecutar)' : 'DRY-RUN (no escribe nada)'}`,
  );
  registrar('─'.repeat(72));
  registrar('');

  const aEscribir = [];
  for (const [nombre, docs] of Object.entries(backup.colecciones)) {
    registrar(`  ${nombre.padEnd(16)} ${docs.length} documentos a reescribir`);
    for (const doc of docs) {
      aEscribir.push({
        ref: db.collection(nombre).doc(doc.id),
        datos: deserializarValor(doc.datos, fabricas, `${nombre}/${doc.id}`),
      });
    }
  }
  registrar('');
  registrar(`  TOTAL            ${aEscribir.length} documentos`);
  registrar('');
  registrar(
    'Nota: la restauración REESCRIBE cada documento del backup con su id original. NO borra ' +
      'documentos creados después del backup: para volver a un estado exacto, primero revisá ' +
      'qué se creó desde entonces.',
  );

  if (!args.ejecutar) {
    registrar('');
    registrar('DRY-RUN: no se escribió NADA. Para restaurar de verdad, agregá --ejecutar.');
    registrar('');
    return 0;
  }

  await confirmarTipeando(projectId, 'la RESTAURACIÓN (reescribe documentos existentes)');

  for (let i = 0; i < aEscribir.length; i += TAMANO_BATCH) {
    const batch = db.batch();
    for (const { ref, datos } of aEscribir.slice(i, i + TAMANO_BATCH)) batch.set(ref, datos);
    await batch.commit();
  }
  registrar('');
  registrar(`✓ Restaurados ${aEscribir.length} documentos en '${projectId}'.`);
  registrar('');
  escribirLog(resolve(args.backupDir, `restore-${projectId}-${marcaTemporal(ahora)}.log.txt`));
  return 0;
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parsearArgs(process.argv.slice(2));
  if (args.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  if (args.errores.length > 0) {
    fallar(`${args.errores.join('\n  ')}\n\n${AYUDA}`);
  }

  const ahora = new Date();
  const db = conectar(args.project);

  return args.restaurar !== undefined
    ? await modoRestaurar(db, args, ahora)
    : await modoReset(db, args, ahora);
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((error) => {
    console.error('\n✖ El script falló:', error);
    console.error(
      '\n  Si ya había pasado la etapa de backup, el archivo está en el directorio de backup y ' +
        'se puede restaurar con --restaurar.',
    );
    process.exit(1);
  });
