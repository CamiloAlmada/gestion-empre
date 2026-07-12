/**
 * Seed de datos de DEMO para clientes + WhatsApp (WA-D, doc 08). Crea 6 clientes
 * y sus ventas históricas con ids prefijados `demo-`, pensados para mostrarle al
 * dueño la lista de "clientes inactivos" (ritmo propio vs. umbral global) y los
 * botones de WhatsApp (con teléfono / sin teléfono / no normalizable).
 *
 * ## GUARDRAIL DURO — LEER ANTES DE TOCAR ESTE ARCHIVO
 *
 * Este script BORRA y ESCRIBE datos. Solo puede correr contra el proyecto DEV
 * (`quesarte-uy-dev`). El proyecto PROD es `quesarte-uy` (ver `.firebaserc`) y
 * jamás debe recibir estos datos. La verificación de abajo exige DOS señales
 * independientes, ninguna alcanza sola:
 *
 *   1. El flag `--project quesarte-uy-dev` explícito en la línea de comandos
 *      (intención declarada por quien corre el script).
 *   2. El `projectId` que se desprende DE VERDAD de las credenciales activas
 *      (el `project_id` embebido en el JSON de `GOOGLE_APPLICATION_CREDENTIALS`,
 *      o si no hay archivo, `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT` — las mismas
 *      variables que usa `applicationDefault()` del SDK) — no un valor que el
 *      propio script se autoasigne.
 *
 * Si cualquiera de las dos no es EXACTAMENTE `'quesarte-uy-dev'`, el script se
 * niega a correr (`process.exit(1)`) ANTES de inicializar `firebase-admin` y
 * ANTES de que exista la más mínima chance de una llamada de red a Firestore
 * (ni siquiera una lectura): la señal 2 se resuelve leyendo el archivo de
 * credenciales LOCALMENTE (sin red), a propósito — un entorno con alguna
 * credencial ambiente de OTRO proyecto de Google Cloud (no `quesarte-uy-dev`)
 * jamás debe hacer ni una sola llamada saliente antes de que este chequeo
 * decida si sigue o corta.
 *
 * NUNCA agregar otro projectId a `PROJECT_ID_PERMITIDO`. Si algún día hace falta
 * un segundo entorno de demo, es una decisión de tech lead — no un cambio de
 * una línea acá.
 *
 * Uso (ver README.md de esta carpeta para credenciales):
 *   pnpm run seed:demo             -- limpia, siembra y verifica
 *   pnpm run seed:demo:limpiar     -- solo borra los docs demo-*
 *   pnpm run seed:demo:verificar   -- solo relee y muestra el resumen (no escribe)
 */

import process from 'node:process';
import { readFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { clasificarInactividad, formatearMoney } from '@gestion/core';
import { construirDatosDemo, PREFIJO_DEMO } from './generador.mjs';
import { clienteADoc, ventaADoc } from './mapeoAdmin.mjs';

// ── Guardrail de projectId ───────────────────────────────────────────────────

// Allowlist de UN solo elemento, hardcodeada. NUNCA agregar otro projectId acá.
const PROJECT_ID_PERMITIDO = 'quesarte-uy-dev';

function fallar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

/**
 * Resuelve el projectId de las credenciales activas SIN tocar la red: si hay
 * `GOOGLE_APPLICATION_CREDENTIALS` (service account), lee y parsea ese JSON
 * localmente (`project_id`, el mismo campo que usaría `applicationDefault()`);
 * si no, cae a las env vars estándar del SDK (`GOOGLE_CLOUD_PROJECT` /
 * `GCLOUD_PROJECT`). Deliberadamente NO intenta el descubrimiento vía metadata
 * server de GCP (que sí requiere red) ni ninguna llamada a Firestore: este
 * guardrail tiene que poder decidir ANTES de la primera conexión.
 *
 * @returns el `projectId` resuelto, o `undefined` si no se pudo determinar sin
 *   red (en cuyo caso el script se niega a correr, ver `verificarGuardrailProjectId`).
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
      // `applicationDefault()` (más abajo) va a fallar con un mensaje más claro
      // sobre EL MISMO archivo al intentar autenticar de verdad.
    }
  }
  const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  return envProjectId && envProjectId.length > 0 ? envProjectId : undefined;
}

/**
 * Exige el flag `--project quesarte-uy-dev` Y que el projectId resuelto
 * LOCALMENTE (sin red, ver `resolverProjectIdLocal`) sea el mismo. Solo si
 * ambas señales coinciden con el allowlist se inicializa `firebase-admin` y se
 * abre la conexión a Firestore — recién ahí existe la primera llamada de red.
 */
function verificarGuardrailProjectId(args) {
  if (args.project !== PROJECT_ID_PERMITIDO) {
    fallar(
      `Falta el flag --project ${PROJECT_ID_PERMITIDO} explícito (doble confirmación ` +
        `requerida). Recibido: ${args.project ?? '(ninguno)'}.\n` +
        `  Ejemplo: pnpm run seed:demo -- --project ${PROJECT_ID_PERMITIDO}`,
    );
  }

  const projectIdReal = resolverProjectIdLocal();
  if (projectIdReal !== PROJECT_ID_PERMITIDO) {
    fallar(
      `El projectId resuelto de las credenciales activas ('${projectIdReal ?? '(indefinido)'}') no ` +
        `es '${PROJECT_ID_PERMITIDO}'. Este script se niega a correr: podría estar apuntando a otro ` +
        `proyecto (¡o a PROD!). Revisá GOOGLE_APPLICATION_CREDENTIALS (service account de ` +
        `${PROJECT_ID_PERMITIDO}) o exportá GOOGLE_CLOUD_PROJECT=${PROJECT_ID_PERMITIDO}. Ver README.md.`,
    );
  }

  let app;
  try {
    app = initializeApp({ credential: applicationDefault(), projectId: projectIdReal });
  } catch (error) {
    fallar(
      `El projectId local ('${projectIdReal}') coincide, pero no se pudieron resolver las ` +
        `credenciales de Google Cloud (ADC / GOOGLE_APPLICATION_CREDENTIALS) al inicializar el SDK. ` +
        `Detalle: ${error instanceof Error ? error.message : error}\n` +
        `  Ver README.md de esta carpeta para cómo autenticar.`,
    );
  }

  return getFirestore(app);
}

// ── CLI ───────────────────────────────────────────────────────────────────

function parsearArgs(argv) {
  const args = { project: undefined, limpiar: false, verificar: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') {
      args.project = argv[i + 1];
      i++;
    } else if (argv[i] === '--limpiar') {
      args.limpiar = true;
    } else if (argv[i] === '--verificar') {
      args.verificar = true;
    }
  }
  return args;
}

// ── Limpieza (borra SOLO docs con id prefijado `demo-`) ─────────────────────

async function borrarPorPrefijo(db, coleccionNombre) {
  const snap = await db.collection(coleccionNombre).get();
  const objetivo = snap.docs.filter((d) => d.id.startsWith(PREFIJO_DEMO));
  // Batches de Firestore: máx. 500 escrituras. El dataset de demo es chico,
  // pero se trocea igual para no romper si algún día crece.
  for (let i = 0; i < objetivo.length; i += 500) {
    const lote = objetivo.slice(i, i + 500);
    const batch = db.batch();
    for (const d of lote) batch.delete(d.ref);
    await batch.commit();
  }
  return objetivo.length;
}

async function limpiarDemo(db) {
  const nClientes = await borrarPorPrefijo(db, 'clientes');
  const nVentas = await borrarPorPrefijo(db, 'ventas');
  console.log(`  clientes borrados: ${nClientes}`);
  console.log(`  ventas borradas:   ${nVentas}`);
}

// ── Siembra ───────────────────────────────────────────────────────────────

async function sembrarDemo(db) {
  const ahora = new Date();
  const { clientes, ventas } = construirDatosDemo(ahora);

  for (let i = 0; i < clientes.length; i += 500) {
    const lote = clientes.slice(i, i + 500);
    const batch = db.batch();
    for (const cliente of lote) {
      batch.set(db.collection('clientes').doc(cliente.id), clienteADoc(cliente));
    }
    await batch.commit();
  }
  for (let i = 0; i < ventas.length; i += 500) {
    const lote = ventas.slice(i, i + 500);
    const batch = db.batch();
    for (const venta of lote) {
      batch.set(db.collection('ventas').doc(venta.id), ventaADoc(venta));
    }
    await batch.commit();
  }

  console.log(`  clientes creados: ${clientes.length}`);
  console.log(`  ventas creadas:   ${ventas.length}`);
}

// ── Verificación (relee lo escrito, corre clasificarInactividad) ────────────

async function imprimirVerificacion(db) {
  const ahora = new Date();
  const snapClientes = await db.collection('clientes').get();
  const clientesDemo = snapClientes.docs
    .filter((d) => d.id.startsWith(PREFIJO_DEMO))
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const snapVentas = await db.collection('ventas').get();
  const ventasDemo = snapVentas.docs.filter((d) => d.id.startsWith(PREFIJO_DEMO)).map((d) => d.data());

  console.log(`\nResumen de datos demo en '${PROJECT_ID_PERMITIDO}':\n`);
  if (clientesDemo.length === 0) {
    console.log('  (no hay clientes demo-* — ¿corriste el seed?)');
    return;
  }

  for (const cliente of clientesDemo) {
    const ventasCliente = ventasDemo.filter((v) => v.clienteId === cliente.id);
    // `stats` viene de Firestore con Timestamp; clasificarInactividad espera Date.
    const stats = {
      cantidadVentas: cliente.stats.cantidadVentas,
      primeraCompra: cliente.stats.primeraCompra?.toDate?.() ?? cliente.stats.primeraCompra,
      ultimaCompra: cliente.stats.ultimaCompra?.toDate?.() ?? cliente.stats.ultimaCompra,
    };
    const resultado = clasificarInactividad(stats, ahora);
    const telefonoLabel = cliente.telefonoE164
      ? `wa: ${cliente.telefonoE164}`
      : cliente.telefono
        ? 'wa: NO (no normalizable)'
        : 'wa: NO (sin teléfono)';

    console.log(`  ${cliente.id}`);
    console.log(
      `    ${cliente.nombre} — ${ventasCliente.length} ventas, ` +
        `total ${formatearMoney(cliente.stats.totalHistoricoCents)}, ` +
        `hace ${resultado.diasSinVenir}d, ${telefonoLabel}`,
    );
    console.log(
      `    clasificarInactividad(defaults): inactivo=${resultado.inactivo}` +
        (resultado.promedioDiasEntreCompras !== undefined
          ? `, ritmo≈${resultado.promedioDiasEntreCompras.toFixed(1)}d`
          : ', <3 compras → umbral global'),
    );
  }
  console.log('');
}

// ── main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parsearArgs(process.argv.slice(2));
  if (args.limpiar && args.verificar) {
    fallar('--limpiar y --verificar son excluyentes: elegí uno solo (o ninguno para el ciclo completo).');
  }

  const db = verificarGuardrailProjectId(args);

  if (args.verificar) {
    await imprimirVerificacion(db);
    return;
  }

  console.log(`Limpiando datos demo previos en '${PROJECT_ID_PERMITIDO}'...`);
  await limpiarDemo(db);

  if (args.limpiar) {
    console.log('Listo (--limpiar): no se sembró nada nuevo.');
    return;
  }

  console.log('Sembrando datos demo...');
  await sembrarDemo(db);

  await imprimirVerificacion(db);
  console.log('Listo. Revisá la clasificación de arriba antes de la demo.');
}

main().catch((error) => {
  console.error('\n✖ El seed falló:', error);
  process.exit(1);
});
