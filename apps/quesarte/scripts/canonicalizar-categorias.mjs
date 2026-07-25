/**
 * Canonicalización de los ids de `categorias`, con `firebase-admin` (tarea C3).
 * Se corre UNA vez por proyecto (dev y prod), **antes de desplegar las reglas
 * nuevas**. Ver `README-canonicalizar-categorias.md`, al lado de este archivo.
 *
 * ## Por qué existe y por qué corre con Admin SDK
 *
 * C1+C2 hizo estructural la unicidad del nombre de categoría: `categorias/{id}`
 * cumple siempre `id === claveCategoria(nombre)` y persiste ese valor en el campo
 * `clave`, que `firestore.rules` exige en create y en update. Los documentos que
 * ya existen tienen id autogenerado y no tienen `clave`: con las reglas nuevas
 * desplegadas y sin migrar, renombrar o reordenar una categoría existente falla
 * con `permission-denied`. Esta migración usa el Admin SDK —que bypassea las
 * reglas— justamente para poder arreglar eso, y por eso corre ANTES del deploy.
 *
 * ## ESTO REESCRIBE Y BORRA DOCUMENTOS — LEER ANTES DE TOCAR
 *
 * Las salvaguardas, en el orden en que actúan (mismas que `reset-operativo.mjs`):
 *
 *  1. **Dry-run por defecto.** Sin `--ejecutar` solo LEE e informa. No crea el
 *     directorio de backup, no abre un batch, no escribe un byte.
 *  2. **`--project <id>` obligatorio, sin default.** Un default que apunte a
 *     producción es exactamente el accidente que hay que evitar.
 *  3. **Doble señal de proyecto.** El `--project` declarado tiene que coincidir
 *     EXACTAMENTE con el projectId que se desprende de las credenciales activas,
 *     resuelto LOCALMENTE, SIN RED y ANTES de inicializar `firebase-admin`. Acá el
 *     objetivo legítimo puede ser producción, así que no hay allowlist (a
 *     diferencia de `seed-demo.mjs`): hay coincidencia exacta o aborto.
 *  4. **Confirmación tipeada.** Con `--ejecutar` hay que tipear el projectId
 *     completo. Sin TTY no corre: no hay bypass no-interactivo.
 *  5. **Backup primero.** Se exportan TODAS las categorías y los productos
 *     afectados a un JSON local, se relee del disco y se verifican los conteos.
 *     Si algo de eso falla, no se escribe nada.
 *  6. **Todo-o-nada ante un dato que no se puede migrar.** Un nombre vacío, un
 *     `orden` que no es entero ≥ 0 o un nombre cuya clave no sirve como id de
 *     Firestore abortan la corrida entera: son decisiones del dueño, no del script.
 *  7. **Idempotente.** Solo escribe lo que realmente cambia: la 2ª corrida reporta
 *     0 operaciones (evidencia, no promesa).
 *  8. **Rollback real.** `--restaurar <backup>` vuelve al estado previo: reescribe
 *     lo respaldado y borra las categorías que la migración creó.
 *
 * Qué decide qué —quién sobrevive a un duplicado, qué se reescribe, qué producto
 * se re-etiqueta— vive en `categoriasPlan.mjs`, que es puro y está testeado. Este
 * archivo es solo el shell: guardrails, I/O y batches.
 *
 * Comando declarado: `pnpm run categorias:canonicalizar -- --project <id> [...]`.
 */

import process from 'node:process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  AYUDA,
  construirPlan,
  lineasResumen,
  marcaTemporal,
  nombreArchivoBackup,
  nombreArchivoLog,
  operacionesOrdenadas,
  parsearArgs,
  productosAfectados,
  TAMANO_BATCH,
  verificarInvariante,
} from './categoriasPlan.mjs';
// La (de)serialización de documentos de Firestore para el backup se REUSA de
// `resetPlan.mjs` (módulo puro y testeado de la tarea A5) en vez de duplicarse:
// dos serializadores que puedan divergir son la misma clase de bug que esta tanda
// vino a cerrar con `claveCategoria`. Acá no se modifica nada de aquel script.
import { deserializarValor, serializarValor, verificarBackup } from './resetPlan.mjs';

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
 * (Mismo criterio e implementación que el guardrail de `seed-demo.mjs` y
 * `reset-operativo.mjs`; se duplica en vez de importarse porque cada script tiene
 * su propia política de destino —el seed, allowlist fija de dev; estos dos,
 * coincidencia exacta con confirmación humana— y compartir el guardrail haría que
 * relajarlo en uno lo relaje en todos.)
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
        `GOOGLE_CLOUD_PROJECT=${projectId}. Ver README-canonicalizar-categorias.md.`,
    );
  }
  try {
    return getFirestore(initializeApp({ credential: applicationDefault(), projectId }));
  } catch (error) {
    return fallar(
      `El projectId local coincide, pero no se pudieron resolver las credenciales de Google Cloud ` +
        `(ADC / GOOGLE_APPLICATION_CREDENTIALS). Detalle: ` +
        `${error instanceof Error ? error.message : error}\n` +
        `  Ver README-canonicalizar-categorias.md para cómo autenticar.`,
    );
  }
}

/** Confirmación humana: hay que tipear el projectId completo. Sin TTY, no corre. */
async function confirmarTipeando(projectId, accion) {
  if (!process.stdin.isTTY) {
    fallar(
      `--ejecutar exige confirmación interactiva y la entrada estándar no es una terminal.\n` +
        `  No hay bypass no-interactivo a propósito: un comando que puede correr desatendido ` +
        `puede correr por error, y ${accion} toca datos del negocio.`,
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let respuesta;
  try {
    respuesta = await rl.question(
      `\nPara confirmar ${accion} en '${projectId}', tipeá el projectId completo: `,
    );
  } catch {
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

/** Lee `categorias` y `productos` crudos. El plan se calcula sobre esto. */
async function leerEstado(db) {
  const [categoriasSnap, productosSnap] = await Promise.all([
    db.collection('categorias').get(),
    db.collection('productos').get(),
  ]);
  return {
    categorias: categoriasSnap.docs.map((d) => ({ id: d.id, datos: d.data() })),
    productos: productosSnap.docs.map((d) => ({ id: d.id, datos: d.data() })),
  };
}

// ── Backup ─────────────────────────────────────────────────────────────────

/**
 * Serializa lo que la migración puede tocar, lo escribe a disco, lo RELEE y
 * verifica los conteos. Si cualquier paso falla, corta el proceso (⇒ no se escribe
 * nada en Firestore).
 *
 * Se respalda `categorias` ENTERA (es chica y es la colección que se reescribe) y
 * los productos AFECTADOS con su documento completo, para que la restauración
 * pueda devolverlos tal cual estaban sin tocar a los demás.
 */
function escribirBackupVerificado({ categorias, productos, projectId, rutaBackup, ahora }) {
  const colecciones = { categorias: [], productos: [] };
  try {
    for (const c of categorias) {
      colecciones.categorias.push({ id: c.id, datos: serializarValor(c.datos, `categorias/${c.id}`) });
    }
    for (const p of productos) {
      colecciones.productos.push({ id: p.id, datos: serializarValor(p.datos, `productos/${p.id}`) });
    }
  } catch (error) {
    fallar(
      `No se pudo serializar el estado para el backup: ${error instanceof Error ? error.message : error}\n` +
        `  NO se escribió nada en Firestore.`,
    );
  }

  const backup = {
    meta: {
      script: 'canonicalizar-categorias.mjs',
      version: 1,
      projectId,
      generadoEn: ahora.toISOString(),
      colecciones: ['categorias', 'productos'],
      totalDocumentos: colecciones.categorias.length + colecciones.productos.length,
      nota:
        'categorias está COMPLETA; productos incluye SOLO los que la migración re-etiqueta. ' +
        'La restauración reescribe todo esto y borra las categorías que no figuren acá.',
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
        `${error instanceof Error ? error.message : error}\n  NO se escribió nada en Firestore.`,
    );
  }

  let releido;
  try {
    releido = JSON.parse(readFileSync(rutaBackup, 'utf8'));
  } catch (error) {
    fallar(
      `El backup se escribió pero NO se pudo releer/parsear ('${rutaBackup}'): ` +
        `${error instanceof Error ? error.message : error}\n  NO se escribió nada en Firestore.`,
    );
  }

  const errores = verificarBackup(releido, {
    categorias: colecciones.categorias.length,
    productos: colecciones.productos.length,
  });
  if (errores.length > 0) {
    fallar(
      `El backup releído no cuadra con lo leído de Firestore:\n  - ${errores.join('\n  - ')}\n` +
        `  NO se escribió nada en Firestore.`,
    );
  }

  registrar(
    `Backup verificado: ${colecciones.categorias.length} categorías + ` +
      `${colecciones.productos.length} productos en '${rutaBackup}'.`,
  );
}

// ── Escrituras ─────────────────────────────────────────────────────────────

/**
 * Aplica las operaciones EN ORDEN, en batches de 500. Con el volumen real (un
 * puñado de categorías y decenas de productos) es UN solo batch, o sea atómico.
 */
async function aplicar(db, operaciones) {
  for (let i = 0; i < operaciones.length; i += TAMANO_BATCH) {
    const batch = db.batch();
    for (const op of operaciones.slice(i, i + TAMANO_BATCH)) {
      const ref = db.collection(op.coleccion).doc(op.id);
      if (op.tipo === 'set') batch.set(ref, op.datos);
      else if (op.tipo === 'update') batch.update(ref, op.datos);
      else batch.delete(ref);
    }
    await batch.commit();
  }
  return operaciones.length;
}

// ── Modo: migración ────────────────────────────────────────────────────────

async function modoMigrar(db, args, ahora) {
  const projectId = args.project;
  const rutaBackup = resolve(args.backupDir, nombreArchivoBackup(projectId, ahora));
  const rutaLog = resolve(args.backupDir, nombreArchivoLog(projectId, ahora));

  const estado = await leerEstado(db);
  const plan = construirPlan({
    categorias: estado.categorias,
    productos: estado.productos.map((p) => ({ id: p.id, categoria: p.datos.categoria })),
  });

  registrarVarias(
    lineasResumen({
      projectId,
      modo: args.ejecutar ? 'EJECUCIÓN REAL (--ejecutar)' : 'DRY-RUN (no escribe nada)',
      plan,
      rutaBackup: args.ejecutar ? rutaBackup : `${rutaBackup}  (dry-run: no se va a escribir)`,
      totales: { categorias: estado.categorias.length, productos: estado.productos.length },
    }),
  );

  if (plan.errores.length > 0) {
    fallar(
      `Hay ${plan.errores.length} documento(s) que la migración no puede canonicalizar sola ` +
        `(detalle arriba). No se escribió nada: la migración es todo-o-nada.`,
    );
  }

  const operaciones = operacionesOrdenadas(plan);

  if (!args.ejecutar) {
    registrar('DRY-RUN: no se escribió NADA. Para ejecutar de verdad, agregá --ejecutar.');
    registrar('');
    return 0;
  }

  if (operaciones.length === 0) {
    registrar('No hay nada que hacer: el invariante ya se cumple. (Idempotencia.)');
    registrar('');
    return 0;
  }

  await confirmarTipeando(projectId, 'la MIGRACIÓN de categorías (reescribe y borra documentos)');

  registrar('');
  registrar('1) Backup antes de tocar nada…');
  const idsAfectados = new Set(productosAfectados(plan));
  escribirBackupVerificado({
    categorias: estado.categorias,
    productos: estado.productos.filter((p) => idsAfectados.has(p.id)),
    projectId,
    rutaBackup,
    ahora,
  });

  registrar('');
  registrar(
    `2) Aplicando ${operaciones.length} operaciones` +
      `${operaciones.length <= TAMANO_BATCH ? ' en UN batch atómico' : ` en ${Math.ceil(operaciones.length / TAMANO_BATCH)} batches`}…`,
  );
  await aplicar(db, operaciones);
  registrar(
    `   ${plan.escrituras.length} categorías escritas, ${plan.reetiquetados.length} productos ` +
      `re-etiquetados, ${plan.borrados.length} documentos viejos borrados.`,
  );

  registrar('');
  registrar('3) Verificación final (releyendo Firestore)…');
  const final = await leerEstado(db);
  const problemas = verificarInvariante(
    final.categorias,
    final.productos.map((p) => ({ id: p.id, categoria: p.datos.categoria })),
  );
  registrar(
    `   ${final.categorias.length} categorías tras la migración ` +
      `(antes ${estado.categorias.length}).`,
  );

  if (problemas.length > 0) {
    registrar('');
    registrar('✖ La verificación final encontró problemas:');
    for (const p of problemas) registrar(`  - ${p}`);
    registrar(`  El backup previo está en: ${rutaBackup} (rollback con --restaurar).`);
    escribirLog(rutaLog);
    return 1;
  }

  registrar('   ✓ Toda categoría cumple id === clave === claveCategoria(nombre), con exactamente');
  registrar('     los campos {nombre, orden, clave}, sin homónimas, y ningún producto quedó');
  registrar('     apuntando a un nombre que no existe.');
  registrar('');
  registrar('Volver a correr este script debe reportar 0 operaciones (idempotencia).');
  registrar('Siguiente paso del despliegue: recién ahora, `firebase deploy --only firestore:rules`.');
  registrar('');
  escribirLog(rutaLog);
  return 0;
}

// ── Modo: rollback desde backup ────────────────────────────────────────────

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
  if (backup?.meta?.script !== 'canonicalizar-categorias.mjs') {
    return fallar(
      `'${rutaArchivo}' no es un backup de esta migración (meta.script = ` +
        `${JSON.stringify(backup?.meta?.script)}). Se aborta: restaurar con el script equivocado ` +
        `borraría categorías que este backup no conoce.`,
    );
  }
  if (backup.meta.projectId !== projectId) {
    return fallar(
      `El backup fue tomado del proyecto '${backup.meta.projectId}' y estás restaurando sobre ` +
        `'${projectId}'. Se aborta.`,
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

  const idsRespaldados = new Set(backup.colecciones.categorias.map((d) => d.id));
  const categoriasAhora = (await db.collection('categorias').get()).docs.map((d) => d.id);
  const aBorrar = categoriasAhora.filter((id) => !idsRespaldados.has(id));

  registrar('');
  registrar('─'.repeat(78));
  registrar(`  ROLLBACK DE LA CANONICALIZACIÓN — proyecto: ${projectId}`);
  registrar(`  archivo: ${rutaArchivo} (generado ${backup.meta.generadoEn})`);
  registrar(
    `  modo: ${args.ejecutar ? 'EJECUCIÓN REAL (--ejecutar)' : 'DRY-RUN (no escribe nada)'}`,
  );
  registrar('─'.repeat(78));
  registrar('');
  registrar(`  categorias  ${backup.colecciones.categorias.length} documentos a reescribir`);
  registrar(`  productos   ${backup.colecciones.productos.length} documentos a reescribir`);
  registrar(
    `  categorias  ${aBorrar.length} documentos a BORRAR (existen hoy y no están en el backup: ` +
      `los creó la migración)`,
  );
  for (const id of aBorrar) registrar(`     categorias/${id}`);
  registrar('');
  registrar(
    'Nota: los productos que la migración NO tocó no se tocan tampoco acá. Si después de la ' +
      'migración alguien creó categorías nuevas desde la app, este rollback también las borra: ' +
      'revisá la lista de arriba antes de confirmar.',
  );

  if (!args.ejecutar) {
    registrar('');
    registrar('DRY-RUN: no se escribió NADA. Para restaurar de verdad, agregá --ejecutar.');
    registrar('');
    return 0;
  }

  await confirmarTipeando(projectId, 'el ROLLBACK (reescribe y borra categorías)');

  const operaciones = [];
  for (const doc of backup.colecciones.categorias) {
    operaciones.push({
      tipo: 'set',
      coleccion: 'categorias',
      id: doc.id,
      datos: deserializarValor(doc.datos, fabricas, `categorias/${doc.id}`),
    });
  }
  for (const doc of backup.colecciones.productos) {
    operaciones.push({
      tipo: 'set',
      coleccion: 'productos',
      id: doc.id,
      datos: deserializarValor(doc.datos, fabricas, `productos/${doc.id}`),
    });
  }
  for (const id of aBorrar) {
    operaciones.push({ tipo: 'delete', coleccion: 'categorias', id });
  }

  await aplicar(db, operaciones);
  registrar('');
  registrar(`✓ Rollback aplicado: ${operaciones.length} operaciones en '${projectId}'.`);
  registrar('');
  escribirLog(resolve(args.backupDir, `categorias-rollback-${projectId}-${marcaTemporal(ahora)}.log.txt`));
  return 0;
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
    : await modoMigrar(db, args, ahora);
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((error) => {
    console.error('\n✖ El script falló:', error);
    console.error(
      '\n  Si ya había pasado la etapa de backup, el archivo está en el directorio de backup y ' +
        'se puede volver atrás con --restaurar.',
    );
    process.exit(1);
  });
