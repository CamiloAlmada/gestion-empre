/**
 * Módulo PURO de la canonicalización de categorías (tarea C3, ver
 * `README-canonicalizar-categorias.md`). Sin `firebase-admin`, sin red y sin
 * `fs`: acá vive TODO lo que DECIDE —qué documento sobrevive a un duplicado, qué
 * se reescribe, qué se borra, qué producto se re-etiqueta y qué aborta la
 * migración— y está testeado en `categoriasPlan.test.mjs`.
 *
 * `canonicalizar-categorias.mjs` es solo el shell: guardrails, I/O y batches.
 *
 * Misma separación que `resetPlan.mjs` + `reset-operativo.mjs`, y por el mismo
 * motivo: el criterio de qué gana y qué se borra es la parte que NO se puede
 * probar contra un Firestore real (borrar prod es irreversible), así que tiene
 * que ser código puro con tests.
 *
 * ## Qué invariante deja satisfecho
 *
 * `categorias/{id}` cumple SIEMPRE `id === clave === claveCategoria(nombre)` y el
 * documento tiene exactamente `{nombre, orden, clave}` (ver `categoriaValida` en
 * `apps/quesarte/firestore.rules` y "Categoría" en `docs/02-dominio-quesarte.md`).
 * Los documentos anteriores a C1+C2 tienen id autogenerado y NO tienen `clave`:
 * con las reglas nuevas desplegadas, renombrarlos o reordenarlos daría
 * `permission-denied`. Esta migración corre con Admin SDK (bypassea reglas)
 * ANTES del deploy de las reglas.
 *
 * `claveCategoria` NO se reimplementa acá: se importa de `@gestion/core`, que es
 * la fuente de verdad compartida con el kit, el seed y las reglas. Dos
 * implementaciones que puedan divergir es exactamente el bug que esta tanda vino
 * a cerrar.
 */

import { claveCategoria, claveCategoriaValida } from '@gestion/core';

/** Los únicos campos que puede tener `categorias/{id}` (ver `categoriaValida`). */
export const CAMPOS_CATEGORIA = ['nombre', 'orden', 'clave'];

/** Máximo de escrituras por batch en Firestore. */
export const TAMANO_BATCH = 500;

// ── CLI ────────────────────────────────────────────────────────────────────

export const AYUDA = `
canonicalizar-categorias.mjs — migración de ids de categoría a su forma canónica
(tarea C3). Admin SDK: bypassea firestore.rules. Corre ANTES del deploy de reglas.

  pnpm run categorias:canonicalizar -- --project <projectId> [opciones]   (desde apps/quesarte)

Modos:
  (sin --ejecutar)          DRY-RUN (default): informa qué haría. No escribe NADA.
  --ejecutar                Ejecuta de verdad. Exige tipear el projectId para confirmar.
  --restaurar <archivo>     Rollback: vuelve al estado del backup (también dry-run por
                            defecto; con --ejecutar escribe).

Opciones:
  --project <projectId>     OBLIGATORIO. Debe coincidir con el projectId de las
                            credenciales activas (no hay default).
  --backup-dir <ruta>       Dónde dejar backup y log. Default: ./backups
  --ayuda                   Esto.
`.trim();

/**
 * Parsea `argv` (sin `node` ni el nombre del script). No lee env ni fs: devuelve
 * los flags y una lista de errores (el shell decide cómo fallar).
 *
 * Mismo contrato que `parsearArgs` de `resetPlan.mjs`; se escribe aparte porque
 * el juego de flags no es el mismo y acoplar dos CLIs distintas para ahorrar 30
 * líneas haría que un flag nuevo de una tarea cambie la otra.
 */
export function parsearArgs(argv) {
  const args = {
    project: undefined,
    ejecutar: false,
    restaurar: undefined,
    backupDir: './backups',
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
      case '--ayuda':
      case '--help':
      case '-h':
        args.ayuda = true;
        break;
      case '--':
        // Separador de pnpm (`pnpm run categorias:canonicalizar -- --project X`).
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

// ── Validación de un documento heredado ────────────────────────────────────

/**
 * Revisa un `categorias/{id}` crudo y devuelve el problema que BLOQUEA la
 * migración, o `null` si se puede canonicalizar.
 *
 * Los tres casos bloquean a propósito, en vez de "arreglarse" solos: cada uno
 * exige una decisión humana sobre datos del negocio, y una migración que adivina
 * es peor que una que se planta. La migración es todo-o-nada: si algún documento
 * tiene problema, no se escribe NADA (ver `construirPlan`).
 */
export function problemaDeCategoria(id, datos) {
  const nombre = datos?.nombre;
  if (typeof nombre !== 'string' || nombre.trim().length === 0) {
    return (
      `categorias/${id}: 'nombre' ausente, vacío o no es texto (${JSON.stringify(nombre)}). ` +
      `Sin nombre no hay clave posible. Arreglalo o borralo desde la consola de Firebase.`
    );
  }

  const orden = datos.orden;
  if (!Number.isInteger(orden) || orden < 0) {
    return (
      `categorias/${id} ("${nombre.trim()}"): 'orden' debería ser un entero >= 0 y es ` +
      `${JSON.stringify(orden)}. Las reglas nuevas lo exigen (\`orden is int && orden >= 0\`) y ` +
      `además el orden decide qué documento sobrevive a un duplicado: no se adivina.`
    );
  }

  const clave = claveCategoria(nombre);
  if (!claveCategoriaValida(clave)) {
    return (
      `categorias/${id} ("${nombre.trim()}"): su clave ("${clave}") no sirve como id de ` +
      `documento de Firestore (vacía, con "/", "." / ".." o de la forma "__algo__"). ` +
      `Renombrá esa categoría desde la app (Ajustes → Categorías) ANTES de correr la ` +
      `migración —todavía se puede, las reglas nuevas no están desplegadas— o borrala ` +
      `desde la consola.`
    );
  }

  return null;
}

// ── Criterio de supervivencia entre homónimas ──────────────────────────────

/**
 * Elige qué documento sobrevive cuando varios comparten clave (dos "Quesos", o
 * "Quesos" y "quesos "). Criterio, en orden, con su fundamento:
 *
 *  1. **`orden` menor.** Es la ÚNICA señal de intención humana que persiste en el
 *     documento: la posición en que el dueño dejó la categoría en las listas de
 *     Stock. Además el sobreviviente hereda su `orden`, así que la lista queda lo
 *     más parecida posible a como estaba.
 *  2. **Empate de `orden` → la que YA está en su path canónico** (`id === clave`).
 *     No es señal de intención (es un accidente de cómo se tipeó el nombre), por
 *     eso va segunda y no primera: si fuera primera, un "quesos" todo en
 *     minúscula le ganaría a un "Quesos" bien escrito y el dueño vería la
 *     regresión en pantalla. Como desempate, en cambio, ahorra una mudanza.
 *  3. **Empate de las dos → id lexicográficamente menor.** No tiene fundamento de
 *     dominio: existe solo para que el plan sea DETERMINISTA (Firestore no
 *     garantiza el orden en que devuelve los documentos, y dos dry-runs seguidos
 *     tienen que decir exactamente lo mismo).
 *
 * Criterios evaluados y DESCARTADOS:
 *
 * - *"la más antigua"*: `categorias/{id}` no guarda fecha de creación (`{nombre,
 *   orden, clave}`, doc 02) y los ids autogenerados de Firestore son aleatorios,
 *   no monótonos. Es indecidible con los datos que hay.
 * - *"la que tiene más productos"*: `Producto.categoria` guarda el NOMBRE, no el
 *   id (`packages/core/src/tipos.ts`). Para homónimas EXACTAS —el caso real de
 *   `quesarte-uy-dev`, dos "Quesos"— los productos apuntan a las dos a la vez:
 *   el criterio no está definido justo donde haría falta.
 *
 * Nota sobre el caso real: si las homónimas son exactas y tienen el mismo
 * `orden`, el documento resultante es idéntico gane quien gane; ahí el desempate
 * solo afecta al texto del informe, no a los datos.
 */
export function elegirGanador(documentos) {
  return ordenarCandidatos(documentos)[0];
}

/**
 * Los documentos de un grupo, del que gana al que más pierde. `construirPlan` usa
 * este orden —y no el de llegada— para TODO lo que emite: Firestore no garantiza
 * en qué orden devuelve los documentos de una colección, y un plan que dependiera
 * de eso mostraría dos informes distintos para el mismo estado.
 */
function ordenarCandidatos(documentos) {
  return [...documentos].sort(comparar);
}

function comparar(a, b) {
  if (a.datos.orden !== b.datos.orden) return a.datos.orden - b.datos.orden;
  const canonicaA = a.id === claveCategoria(a.datos.nombre) ? 0 : 1;
  const canonicaB = b.id === claveCategoria(b.datos.nombre) ? 0 : 1;
  if (canonicaA !== canonicaB) return canonicaA - canonicaB;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Texto del porqué de la elección, para el informe que lee la persona. */
function motivoGanador(ganador, perdedores) {
  const empateOrden = perdedores.some((p) => p.datos.orden === ganador.datos.orden);
  if (!empateOrden) return `tiene el orden menor (${ganador.datos.orden})`;
  if (ganador.id === claveCategoria(ganador.datos.nombre)) {
    return `empata en orden (${ganador.datos.orden}) y ya está en su path canónico`;
  }
  return `empata en orden (${ganador.datos.orden}) y en canonicidad; gana por id menor`;
}

// ── Plan ───────────────────────────────────────────────────────────────────

/** ¿El documento ya es EXACTAMENTE el que la migración querría escribir? */
function yaEsElObjetivo(datos, objetivo) {
  const claves = Object.keys(datos).sort();
  if (claves.length !== CAMPOS_CATEGORIA.length) return false;
  if (!CAMPOS_CATEGORIA.every((c) => claves.includes(c))) return false;
  return (
    datos.nombre === objetivo.nombre &&
    datos.orden === objetivo.orden &&
    datos.clave === objetivo.clave
  );
}

/**
 * Arma el plan completo de la migración a partir del estado crudo de Firestore.
 *
 * @param categorias `[{ id, datos }]` — todos los `categorias/{id}`.
 * @param productos `[{ id, categoria }]` — todos los `productos/{id}` con SOLO su
 *   campo `categoria` (el nombre denormalizado).
 * @returns el plan. Si `errores` no está vacío, el shell aborta SIN escribir nada:
 *   la migración es todo-o-nada.
 *
 * Contenido del plan:
 * - `grupos`: una entrada por clave, con ganador, perdedores y el porqué.
 * - `escrituras`: `set` en `categorias/{clave}` con exactamente `{nombre, orden,
 *   clave}`. Se usa `set` y no `update` a propósito: reemplaza el documento
 *   entero y así se van los campos de más que pudiera tener un doc heredado (las
 *   reglas nuevas exigen `keys().hasOnly(['nombre','orden','clave'])`, o sea que
 *   un campo extra dejaría el documento IMPOSIBLE de editar desde la app).
 * - `borrados`: los perdedores y los ids no canónicos ya migrados.
 * - `reetiquetados`: productos cuyo `categoria` deja de coincidir con el nombre
 *   canónico.
 * - `sinCambios`: los que ya cumplen el invariante (ahí vive la idempotencia).
 * - `advertencias`: cosas raras que NO bloquean (se informan y se siguen).
 */
export function construirPlan({ categorias, productos }) {
  const errores = [];
  const advertencias = [];

  for (const { id, datos } of categorias) {
    const problema = problemaDeCategoria(id, datos);
    if (problema !== null) errores.push(problema);
  }
  if (errores.length > 0) {
    return {
      errores,
      advertencias,
      grupos: [],
      escrituras: [],
      borrados: [],
      reetiquetados: [],
      sinCambios: [],
    };
  }

  // Agrupar por clave canónica. Dos documentos en el mismo grupo son, bajo el
  // invariante nuevo, la misma categoría.
  const porClave = new Map();
  for (const cat of categorias) {
    const clave = claveCategoria(cat.datos.nombre);
    const grupo = porClave.get(clave);
    if (grupo === undefined) porClave.set(clave, [cat]);
    else grupo.push(cat);
  }

  const grupos = [];
  const escrituras = [];
  const borrados = [];
  const sinCambios = [];
  /** clave → nombre que sobrevive (ya recortado). */
  const nombreCanonicoPorClave = new Map();
  /** nombre crudo de un documento que desaparece → clave. */
  const nombresQueDesaparecen = new Map();

  for (const clave of [...porClave.keys()].sort()) {
    const documentos = ordenarCandidatos(porClave.get(clave));
    const ganador = documentos[0];
    const perdedores = documentos.slice(1);
    const objetivo = { nombre: ganador.datos.nombre.trim(), orden: ganador.datos.orden, clave };
    nombreCanonicoPorClave.set(clave, objetivo.nombre);

    grupos.push({
      clave,
      ganador: { id: ganador.id, nombre: ganador.datos.nombre, orden: ganador.datos.orden },
      perdedores: perdedores.map((p) => ({
        id: p.id,
        nombre: p.datos.nombre,
        orden: p.datos.orden,
      })),
      objetivo,
      motivo: perdedores.length === 0 ? null : motivoGanador(ganador, perdedores),
    });

    // ¿Hay ya un documento EN el path canónico? Puede ser el ganador o —cuando el
    // ganador vive en otro path— un perdedor. Si el que está ahí ya es idéntico al
    // objetivo, no se escribe (idempotencia).
    const ocupante = documentos.find((d) => d.id === clave);
    if (ocupante !== undefined && yaEsElObjetivo(ocupante.datos, objetivo)) {
      sinCambios.push(clave);
    } else {
      escrituras.push({
        id: clave,
        datos: objetivo,
        motivo:
          ocupante === undefined
            ? `mudanza desde ${ganador.id}`
            : ocupante.id === ganador.id
              ? 'ya estaba en su path: se completa/normaliza el documento'
              : `absorbe a ${ganador.id} (que gana el duplicado)`,
      });
    }

    // El nombre de cada perdedor deja de existir como categoría: los productos que
    // lo referencian quedan huérfanos si no se re-etiquetan. Se registra aunque el
    // perdedor no se borre (cuando ocupa el path canónico se lo PISA, que para el
    // producto es lo mismo).
    for (const perdedor of perdedores) {
      nombresQueDesaparecen.set(perdedor.datos.nombre, clave);
    }

    // Los perdedores y el id viejo del ganador se borran, SALVO el que ocupa el
    // path canónico: ese no se borra, se PISA con la escritura de arriba. Emitir
    // delete + set sobre el mismo path en un batch es un error del SDK, y aunque
    // no lo fuera, el orden entre ambas operaciones no estaría definido.
    for (const doc of documentos) {
      if (doc.id === clave) continue;
      borrados.push({
        id: doc.id,
        clave,
        nombre: doc.datos.nombre,
        motivo:
          doc.id === ganador.id
            ? 'id heredado; el documento se mudó a su path canónico'
            : `duplicado de "${objetivo.nombre}" (gana ${ganador.id}: ${motivoGanador(ganador, perdedores)})`,
      });
    }
  }

  // ── Productos ────────────────────────────────────────────────────────────
  //
  // `Producto.categoria` guarda el NOMBRE, no un id. Un producto pertenece al
  // grupo cuya clave coincide con la clave de su propio texto, y hay que
  // re-etiquetarlo si ese texto no es exactamente el nombre que sobrevive.
  const reetiquetados = [];
  for (const producto of productos) {
    const categoria = producto.categoria;
    if (typeof categoria !== 'string') {
      advertencias.push(
        `productos/${producto.id}: 'categoria' no es texto (${JSON.stringify(categoria)}). ` +
          `Se deja como está: no hay forma de saber a qué categoría pertenece.`,
      );
      continue;
    }
    const clave = claveCategoria(categoria);
    const nombreCanonico = nombreCanonicoPorClave.get(clave);
    // Sin grupo: es un producto sin categoría o con una categoría que no existe
    // como documento. La app ya lo muestra bajo "Sin categoría" y esta migración
    // no lo cambia: inventarle una categoría sería decidir por el dueño.
    if (nombreCanonico === undefined || categoria === nombreCanonico) continue;
    reetiquetados.push({
      id: producto.id,
      de: categoria,
      a: nombreCanonico,
      causa: nombresQueDesaparecen.has(categoria) ? 'duplicado' : 'variante',
    });
  }

  // Por id, para que el informe y el batch no dependan del orden en que Firestore
  // devolvió los productos (mismo motivo que `ordenarCandidatos`).
  reetiquetados.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { errores, advertencias, grupos, escrituras, borrados, reetiquetados, sinCambios };
}

/**
 * Aplana el plan en la lista de operaciones de Firestore, EN EL ORDEN EN QUE HAY
 * QUE APLICARLAS:
 *
 *   1. `set` de los documentos canónicos,
 *   2. `update` de los productos re-etiquetados,
 *   3. `delete` de los documentos viejos.
 *
 * Con ≤ 500 operaciones (el caso real: un puñado de categorías y decenas de
 * productos) esto entra en UN batch y es atómico, igual que `renombrarCategoria`
 * en el kit. El orden importa igual, para el caso en que no entre: si se cortara
 * la corrida a mitad, el estado intermedio siempre tiene la categoría nueva ya
 * escrita y ningún producto apuntando a un documento inexistente —el error cae
 * del lado de que sobre un documento, no de que falte—, y volver a correr la
 * migración termina el trabajo (es idempotente).
 */
export function operacionesOrdenadas(plan) {
  return [
    ...plan.escrituras.map((e) => ({ tipo: 'set', coleccion: 'categorias', id: e.id, datos: e.datos })),
    ...plan.reetiquetados.map((r) => ({
      tipo: 'update',
      coleccion: 'productos',
      id: r.id,
      datos: { categoria: r.a },
    })),
    ...plan.borrados.map((b) => ({ tipo: 'delete', coleccion: 'categorias', id: b.id })),
  ];
}

/** Ids de productos que toca la migración (los que hay que respaldar). */
export function productosAfectados(plan) {
  return plan.reetiquetados.map((r) => r.id);
}

// ── Verificación del estado final ──────────────────────────────────────────

/**
 * Verifica el invariante sobre el estado RELEÍDO de Firestore. Es lo que
 * convierte "debería haber quedado bien" en evidencia.
 *
 * @returns lista de problemas (vacía = invariante satisfecho).
 */
export function verificarInvariante(categorias, productos) {
  const problemas = [];
  const nombres = new Map();

  for (const { id, datos } of categorias) {
    const problema = problemaDeCategoria(id, datos);
    if (problema !== null) {
      problemas.push(problema);
      continue;
    }
    const clave = claveCategoria(datos.nombre);
    if (id !== clave) {
      problemas.push(`categorias/${id}: el id no es la clave de su nombre ("${clave}").`);
    }
    if (datos.clave !== clave) {
      problemas.push(
        `categorias/${id}: el campo 'clave' es ${JSON.stringify(datos.clave)} y debería ser "${clave}".`,
      );
    }
    if (datos.nombre !== datos.nombre.trim()) {
      problemas.push(`categorias/${id}: 'nombre' conserva espacios de borde.`);
    }
    const extra = Object.keys(datos).filter((k) => !CAMPOS_CATEGORIA.includes(k));
    if (extra.length > 0) {
      problemas.push(
        `categorias/${id}: tiene campos fuera del esquema (${extra.join(', ')}); las reglas ` +
          `exigen exactamente ${CAMPOS_CATEGORIA.join('/')} y con esos campos el documento no ` +
          `se puede editar desde la app.`,
      );
    }
    if (nombres.has(clave)) {
      problemas.push(`Quedaron dos categorías con la clave "${clave}" (imposible bajo el invariante).`);
    }
    nombres.set(clave, datos.nombre);
  }

  for (const producto of productos) {
    if (typeof producto.categoria !== 'string') continue;
    const clave = claveCategoria(producto.categoria);
    const nombre = nombres.get(clave);
    if (nombre !== undefined && producto.categoria !== nombre) {
      problemas.push(
        `productos/${producto.id}: categoria "${producto.categoria}" no es exactamente "${nombre}".`,
      );
    }
  }

  return problemas;
}

// ── Nombres de archivo ─────────────────────────────────────────────────────

/** Marca temporal apta para nombre de archivo: `2026-07-25T18-05-31-042Z`. */
export function marcaTemporal(fecha) {
  return fecha.toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

export function nombreArchivoBackup(projectId, fecha) {
  return `categorias-${projectId}-${marcaTemporal(fecha)}.json`;
}

export function nombreArchivoLog(projectId, fecha) {
  return `categorias-${projectId}-${marcaTemporal(fecha)}.log.txt`;
}

// ── Resumen (mismo texto para consola y log) ───────────────────────────────

/**
 * Arma el informe que se muestra ANTES de tocar nada (y que se guarda en el log).
 * Función pura: recibe el plan ya calculado.
 */
export function lineasResumen({ projectId, modo, plan, rutaBackup, totales }) {
  const lineas = [];
  lineas.push('');
  lineas.push('─'.repeat(78));
  lineas.push(`  CANONICALIZACIÓN DE CATEGORÍAS — proyecto: ${projectId}`);
  lineas.push(`  modo: ${modo}`);
  lineas.push('─'.repeat(78));
  lineas.push('');
  lineas.push(
    `Estado leído: ${totales.categorias} categorías, ${totales.productos} productos.`,
  );
  lineas.push('');

  if (plan.errores.length > 0) {
    lineas.push('✖ LA MIGRACIÓN NO PUEDE CORRER (todo-o-nada, no se escribe nada):');
    for (const e of plan.errores) lineas.push(`  - ${e}`);
    lineas.push('');
    return lineas;
  }

  lineas.push(`Categorías que YA cumplen el invariante: ${plan.sinCambios.length}`);
  for (const clave of plan.sinCambios) lineas.push(`    ✓ categorias/${clave}`);
  lineas.push('');

  const conDuplicados = plan.grupos.filter((g) => g.perdedores.length > 0);
  lineas.push(`Duplicados encontrados (misma clave): ${conDuplicados.length}`);
  for (const g of conDuplicados) {
    lineas.push(`    clave "${g.clave}":`);
    lineas.push(
      `      SOBREVIVE  ${g.ganador.id}  nombre="${g.ganador.nombre}" orden=${g.ganador.orden} — ${g.motivo}`,
    );
    for (const p of g.perdedores) {
      lineas.push(`      se descarta ${p.id}  nombre="${p.nombre}" orden=${p.orden}`);
    }
    lineas.push(`      queda        categorias/${g.clave} → "${g.objetivo.nombre}" (orden ${g.objetivo.orden})`);
  }
  if (conDuplicados.length === 0) lineas.push('    (ninguno)');
  lineas.push('');

  lineas.push(`Categorías a escribir: ${plan.escrituras.length}`);
  for (const e of plan.escrituras) {
    lineas.push(`    categorias/${e.id} ← "${e.datos.nombre}" orden=${e.datos.orden} — ${e.motivo}`);
  }
  lineas.push('');

  lineas.push(`Documentos viejos a borrar: ${plan.borrados.length}`);
  for (const b of plan.borrados) lineas.push(`    categorias/${b.id} — ${b.motivo}`);
  lineas.push('');

  const porDuplicado = plan.reetiquetados.filter((r) => r.causa === 'duplicado');
  const porVariante = plan.reetiquetados.filter((r) => r.causa === 'variante');
  lineas.push(
    `Productos a re-etiquetar: ${plan.reetiquetados.length} ` +
      `(${porDuplicado.length} apuntaban a una categoría que desaparece, ` +
      `${porVariante.length} tenían una variante de mayúsculas/espacios)`,
  );
  for (const r of plan.reetiquetados) {
    lineas.push(`    productos/${r.id}: "${r.de}" → "${r.a}"  [${r.causa}]`);
  }
  lineas.push('');

  if (plan.advertencias.length > 0) {
    lineas.push('⚠ Advertencias (no bloquean, se informan):');
    for (const a of plan.advertencias) lineas.push(`  - ${a}`);
    lineas.push('');
  }

  lineas.push(
    `TOTAL: ${plan.escrituras.length} escrituras + ${plan.reetiquetados.length} productos + ` +
      `${plan.borrados.length} borrados = ${operacionesOrdenadas(plan).length} operaciones.`,
  );
  lineas.push(`Backup: ${rutaBackup}`);
  lineas.push('');
  return lineas;
}
