/**
 * Auditoría de validación del shape de `proveedores` antes del despliegue de las
 * reglas nuevas (tarea A8).
 *
 * Se corre UNA vez por proyecto (dev y prod), **antes de desplegar las reglas
 * nuevas**. Script solo lectura: no modifica nada, no necesita confirmación, no
 * genera backups.
 *
 * ## Por qué existe
 *
 * Las reglas nuevas en `firestore.rules` exigen un shape específico para `proveedores/{id}`.
 * Cualquier documento guardado que no cumpla ese shape rechaza futuras ediciones con
 * `permission-denied`, bloqueando al usuario del comercio. Esta auditoría **identifica
 * esos documentos antes** de desplegar, permitiendo arreglarios a mano si es necesario.
 *
 * ## El shape esperado
 *
 *  1. **Claves permitidas**: nombre, contactoNombre, telefono, email, direccion, rut,
 *     pagos, notas, fechaAlta, activo (máximo 10). Ninguna otra.
 *  2. **Obligatorias**: nombre (string, 1-120 chars), fechaAlta (Timestamp), activo (boolean).
 *  3. **Opcionales string**: contactoNombre, telefono, email, direccion, rut, notas.
 *  4. **Opcionales array**: pagos (max 10 elementos). Cada elemento MUST have:
 *     - banco: string no vacío
 *     - cuenta: string no vacío
 *     - (opcionales) titular, moneda: strings
 *     - (prohibidas) cualquier otra clave
 *
 * Salida: por consola, una línea por violación. Código de salida 0 si no hay
 * violaciones, 1 si las hay.
 */

import process from 'node:process';
import { readFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// ── Bitácora ───────────────────────────────────────────────────────────────

const bitacora = [];

function registrar(linea = '') {
  bitacora.push(linea);
  console.log(linea);
}

function fallar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

// ── Guardrail de projectId ─────────────────────────────────────────────────

/**
 * Resuelve el projectId de las credenciales activas SIN tocar la red: si hay
 * `GOOGLE_APPLICATION_CREDENTIALS` (service account), lee y parsea ese JSON
 * localmente (`project_id`); si no, cae a las env vars estándar del SDK.
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
      // `applicationDefault()` falla más abajo con un mensaje más claro.
    }
  }
  const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  return envProjectId && envProjectId.length > 0 ? envProjectId : undefined;
}

/**
 * Exige que el `--project` declarado coincida con el projectId resuelto localmente
 * de las credenciales. Recién si coinciden se inicializa `firebase-admin`.
 */
function conectar(projectId) {
  const projectIdReal = resolverProjectIdLocal();
  if (projectIdReal !== projectId) {
    fallar(
      `El projectId de las credenciales activas ('${projectIdReal ?? '(indefinido)'}') NO coincide ` +
        `con el --project declarado ('${projectId}').\n` +
        `  Este script se niega a correr: estarías apuntando a un proyecto distinto del que creés.\n` +
        `  Revisá GOOGLE_APPLICATION_CREDENTIALS (service account de '${projectId}') o exportá ` +
        `GOOGLE_CLOUD_PROJECT=${projectId}.`,
    );
  }
  try {
    return getFirestore(initializeApp({ credential: applicationDefault(), projectId }));
  } catch (error) {
    return fallar(
      `El projectId local coincide, pero no se pudieron resolver las credenciales de Google Cloud ` +
        `(ADC / GOOGLE_APPLICATION_CREDENTIALS). Detalle: ` +
        `${error instanceof Error ? error.message : error}`,
    );
  }
}

// ── Validación ─────────────────────────────────────────────────────────────

/**
 * Valida un documento contra el shape especificado.
 * Retorna un array de strings describiendo cada violación.
 */
function validarProveedor(id, datos) {
  const errores = [];

  // Claves permitidas
  const clavesPermitidas = new Set([
    'nombre',
    'contactoNombre',
    'telefono',
    'email',
    'direccion',
    'rut',
    'pagos',
    'notas',
    'fechaAlta',
    'activo',
  ]);

  for (const clave of Object.keys(datos)) {
    if (!clavesPermitidas.has(clave)) {
      errores.push(`clave desconocida '${clave}'`);
    }
  }

  // Obligatorias: nombre
  if (!('nombre' in datos)) {
    errores.push("falta 'nombre'");
  } else if (typeof datos.nombre !== 'string') {
    errores.push(`'nombre' no es string (es ${typeof datos.nombre})`);
  } else if (datos.nombre.length < 1 || datos.nombre.length > 120) {
    errores.push(`'nombre' fuera de rango (${datos.nombre.length} chars, debe ser 1-120)`);
  }

  // Obligatorias: fechaAlta
  if (!('fechaAlta' in datos)) {
    errores.push("falta 'fechaAlta'");
  } else if (!(datos.fechaAlta instanceof Timestamp)) {
    errores.push(`'fechaAlta' no es Timestamp (es ${typeof datos.fechaAlta})`);
  }

  // Obligatorias: activo
  if (!('activo' in datos)) {
    errores.push("falta 'activo'");
  } else if (typeof datos.activo !== 'boolean') {
    errores.push(`'activo' no es booleano (es ${typeof datos.activo})`);
  }

  // Opcionales string
  const opcionalesString = ['contactoNombre', 'telefono', 'email', 'direccion', 'rut', 'notas'];
  for (const clave of opcionalesString) {
    if (clave in datos && typeof datos[clave] !== 'string') {
      errores.push(`'${clave}' debe ser string (es ${typeof datos[clave]})`);
    }
  }

  // Opcionales array: pagos
  if ('pagos' in datos) {
    if (!Array.isArray(datos.pagos)) {
      errores.push(`'pagos' debe ser array (es ${typeof datos.pagos})`);
    } else {
      if (datos.pagos.length > 10) {
        errores.push(`'pagos' excede 10 elementos (tiene ${datos.pagos.length})`);
      }

      // Validar cada elemento del array
      for (let i = 0; i < datos.pagos.length; i++) {
        const pago = datos.pagos[i];
        const prefijo = `pagos[${i}]`;

        if (typeof pago !== 'object' || pago === null) {
          errores.push(`${prefijo} no es un objeto`);
          continue;
        }

        // Claves permitidas en cada pago
        const clavesPermitadasPago = new Set(['banco', 'cuenta', 'titular', 'moneda']);
        for (const clave of Object.keys(pago)) {
          if (!clavesPermitadasPago.has(clave)) {
            errores.push(`${prefijo} clave desconocida '${clave}'`);
          }
        }

        // Obligatorias en cada pago: banco, cuenta
        if (!('banco' in pago)) {
          errores.push(`${prefijo} falta 'banco'`);
        } else if (typeof pago.banco !== 'string') {
          errores.push(`${prefijo} 'banco' no es string`);
        } else if (pago.banco.length === 0) {
          errores.push(`${prefijo} 'banco' está vacío`);
        }

        if (!('cuenta' in pago)) {
          errores.push(`${prefijo} falta 'cuenta'`);
        } else if (typeof pago.cuenta !== 'string') {
          errores.push(`${prefijo} 'cuenta' no es string`);
        } else if (pago.cuenta.length === 0) {
          errores.push(`${prefijo} 'cuenta' está vacía`);
        }

        // Opcionales string en cada pago
        const opcionalesPago = ['titular', 'moneda'];
        for (const clave of opcionalesPago) {
          if (clave in pago && typeof pago[clave] !== 'string') {
            errores.push(`${prefijo} '${clave}' debe ser string`);
          }
        }
      }
    }
  }

  return errores;
}

// ── Lectura y auditoría ────────────────────────────────────────────────────

/**
 * Lee la colección `proveedores` y valida cada documento.
 */
async function auditar(db) {
  const snapshot = await db.collection('proveedores').get();
  const documentos = snapshot.docs.map((d) => ({ id: d.id, datos: d.data() }));

  registrar(`Leyendo ${documentos.length} documentos de proveedores…`);
  registrar('');

  let violacionesEncontradas = 0;

  for (const doc of documentos) {
    const errores = validarProveedor(doc.id, doc.datos);

    if (errores.length > 0) {
      violacionesEncontradas += errores.length;
      const nombre = doc.datos.nombre ? `"${doc.datos.nombre}"` : '(sin nombre)';
      for (const error of errores) {
        registrar(`  ${doc.id} ${nombre}: ${error}`);
      }
    }
  }

  registrar('');
  if (violacionesEncontradas === 0) {
    registrar(`✓ ${documentos.length} documentos, 0 violaciones. Listo para desplegar.`);
    return 0;
  } else {
    registrar(`✖ ${documentos.length} documentos, ${violacionesEncontradas} violación(es) encontrada(s).`);
    return 1;
  }
}

// ── main ───────────────────────────────────────────────────────────────────

/**
 * Parsea argumentos mínimos: solo `--project <id>`.
 */
function parsearArgs(args) {
  const result = { project: undefined, errores: [] };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') {
      if (i + 1 >= args.length) {
        result.errores.push('--project requiere un valor');
      } else {
        result.project = args[i + 1];
        i++;
      }
    } else {
      result.errores.push(`Argumento desconocido: ${args[i]}`);
    }
  }

  if (!result.project) {
    result.errores.push('--project <id> es obligatorio');
  }

  return result;
}

async function main() {
  const args = parsearArgs(process.argv.slice(2));

  if (args.errores.length > 0) {
    fallar(
      `${args.errores.join('\n  ')}\n\nUso: node auditar-proveedores.mjs --project <projectId>`,
    );
  }

  const db = conectar(args.project);
  return await auditar(db);
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((error) => {
    console.error('\n✖ El script falló:', error);
    process.exit(1);
  });
