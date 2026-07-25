import { describe, expect, it } from 'vitest';
import { claveCategoria } from '@gestion/core';
import {
  AYUDA,
  construirPlan,
  elegirGanador,
  lineasResumen,
  nombreArchivoBackup,
  operacionesOrdenadas,
  parsearArgs,
  problemaDeCategoria,
  productosAfectados,
  verificarInvariante,
} from './categoriasPlan.mjs';

// `categoriasPlan.mjs` es la parte de la migración C3 que NO se puede probar
// contra Firestore real (borrar/reescribir prod es irreversible): quién sobrevive
// a un duplicado, qué se reescribe, qué se borra y qué producto se re-etiqueta.
// Estos tests SON la verificación de esa decisión.

// ── Simulador en memoria: aplica el plan y devuelve el estado resultante ────
//
// Existe para probar dos cosas que de otro modo habría que creer: que el plan
// deja el invariante satisfecho, y que volver a construirlo sobre el resultado no
// encuentra nada que hacer (idempotencia).

function aplicarEnMemoria({ categorias, productos }, plan) {
  const cats = new Map(categorias.map((c) => [c.id, { ...c.datos }]));
  const prods = new Map(productos.map((p) => [p.id, p.categoria]));
  const vistos = new Set();

  for (const op of operacionesOrdenadas(plan)) {
    // Un mismo documento no puede recibir dos operaciones en un batch de Firestore:
    // que el plan nunca lo haga es parte de lo que se está verificando.
    const path = `${op.coleccion}/${op.id}`;
    expect(vistos.has(path), `dos operaciones sobre ${path} en el mismo batch`).toBe(false);
    vistos.add(path);

    if (op.tipo === 'set') cats.set(op.id, { ...op.datos });
    else if (op.tipo === 'update') prods.set(op.id, op.datos.categoria);
    else cats.delete(op.id);
  }

  return {
    categorias: [...cats].map(([id, datos]) => ({ id, datos })),
    productos: [...prods].map(([id, categoria]) => ({ id, categoria })),
  };
}

/** Aplica el plan y exige invariante satisfecho + segunda corrida sin cambios. */
function migrarYVerificar(estado) {
  const plan = construirPlan(estado);
  expect(plan.errores).toEqual([]);
  const resultado = aplicarEnMemoria(estado, plan);
  expect(verificarInvariante(resultado.categorias, resultado.productos)).toEqual([]);
  const segundo = construirPlan(resultado);
  expect(operacionesOrdenadas(segundo)).toEqual([]);
  return { plan, resultado };
}

const cat = (id, nombre, orden, extra = {}) => ({
  id,
  datos: { nombre, orden, ...extra },
});
const catCanonica = (nombre, orden) => ({
  id: claveCategoria(nombre),
  datos: { nombre, orden, clave: claveCategoria(nombre) },
});

// ── Documento que ya cumple el invariante ──────────────────────────────────

describe('categoría ya canónica', () => {
  it('no genera ninguna operación (idempotencia: es la 2ª corrida del script)', () => {
    const estado = {
      categorias: [catCanonica('Quesos', 0), catCanonica('Embutidos', 1)],
      productos: [{ id: 'p1', categoria: 'Quesos' }],
    };
    const plan = construirPlan(estado);
    expect(plan.errores).toEqual([]);
    expect(plan.sinCambios).toEqual(['embutidos', 'quesos']);
    expect(operacionesOrdenadas(plan)).toEqual([]);
    expect(plan.reetiquetados).toEqual([]);
  });

  it('con `clave` ausente (documento heredado) se reescribe EN SU LUGAR, sin borrar nada', () => {
    const estado = {
      categorias: [cat('quesos', 'Quesos', 0)],
      productos: [{ id: 'p1', categoria: 'Quesos' }],
    };
    const { plan } = migrarYVerificar(estado);
    expect(plan.escrituras).toEqual([
      {
        id: 'quesos',
        datos: { nombre: 'Quesos', orden: 0, clave: 'quesos' },
        motivo: 'ya estaba en su path: se completa/normaliza el documento',
      },
    ]);
    expect(plan.borrados).toEqual([]);
    expect(plan.reetiquetados).toEqual([]);
  });

  it('con campos de más se reescribe entero (las reglas exigen hasOnly nombre/orden/clave)', () => {
    // Un doc heredado con un campo extra pasaría el chequeo de id pero dejaría el
    // documento IMPOSIBLE de editar desde la app: `categoriaValida` exige
    // `keys().hasOnly([...])` sobre el documento resultante de CUALQUIER update.
    const estado = {
      categorias: [cat('quesos', 'Quesos', 0, { clave: 'quesos', color: '#fff' })],
      productos: [],
    };
    const { plan, resultado } = migrarYVerificar(estado);
    expect(plan.escrituras).toHaveLength(1);
    expect(Object.keys(resultado.categorias[0].datos).sort()).toEqual(['clave', 'nombre', 'orden']);
  });
});

// ── Id autogenerado: mudanza ───────────────────────────────────────────────

describe('id autogenerado (documento previo a la migración)', () => {
  it('muda el documento a su path canónico y borra el viejo, conservando nombre y orden', () => {
    const estado = {
      categorias: [cat('AbC123xyz', 'Frutos secos', 3)],
      productos: [{ id: 'p1', categoria: 'Frutos secos' }],
    };
    const { plan, resultado } = migrarYVerificar(estado);

    expect(plan.escrituras).toEqual([
      {
        id: 'frutos secos',
        datos: { nombre: 'Frutos secos', orden: 3, clave: 'frutos secos' },
        motivo: 'mudanza desde AbC123xyz',
      },
    ]);
    expect(plan.borrados).toEqual([
      {
        id: 'AbC123xyz',
        clave: 'frutos secos',
        nombre: 'Frutos secos',
        motivo: 'id heredado; el documento se mudó a su path canónico',
      },
    ]);
    // El nombre no cambió: los productos NO se tocan.
    expect(plan.reetiquetados).toEqual([]);
    expect(resultado.categorias).toEqual([
      { id: 'frutos secos', datos: { nombre: 'Frutos secos', orden: 3, clave: 'frutos secos' } },
    ]);
  });

  it('recorta los espacios de borde del nombre y re-etiqueta a los productos que los tenían', () => {
    const estado = {
      categorias: [cat('xyz', ' Miel ', 2)],
      productos: [
        { id: 'p1', categoria: ' Miel ' },
        { id: 'p2', categoria: 'Miel' },
      ],
    };
    const { plan, resultado } = migrarYVerificar(estado);
    expect(plan.escrituras[0].datos).toEqual({ nombre: 'Miel', orden: 2, clave: 'miel' });
    expect(plan.reetiquetados).toEqual([
      { id: 'p1', de: ' Miel ', a: 'Miel', causa: 'variante' },
    ]);
    expect(resultado.productos.map((p) => p.categoria)).toEqual(['Miel', 'Miel']);
  });
});

// ── El caso real de quesarte-uy-dev: dos "Quesos" ──────────────────────────

describe('dos homónimas EXACTAS (el caso real de quesarte-uy-dev)', () => {
  const preexistente = cat('7fK2mQ', 'Quesos', 0);
  const delSeed = cat('demo-categoria-quesos', 'Quesos', 4);

  it('sobrevive la de `orden` menor: la preexistente, no la del seed', () => {
    const estado = {
      categorias: [delSeed, preexistente],
      productos: [
        { id: 'p1', categoria: 'Quesos' },
        { id: 'demo-producto-1', categoria: 'Quesos' },
      ],
    };
    const { plan, resultado } = migrarYVerificar(estado);

    expect(plan.grupos).toHaveLength(1);
    expect(plan.grupos[0].ganador.id).toBe('7fK2mQ');
    expect(plan.grupos[0].motivo).toMatch(/orden menor \(0\)/);
    expect(plan.escrituras).toEqual([
      {
        id: 'quesos',
        datos: { nombre: 'Quesos', orden: 0, clave: 'quesos' },
        motivo: 'mudanza desde 7fK2mQ',
      },
    ]);
    expect(plan.borrados.map((b) => b.id).sort()).toEqual(['7fK2mQ', 'demo-categoria-quesos']);
    // Nombre idéntico en ambas ⇒ ningún producto necesita re-etiquetarse.
    expect(plan.reetiquetados).toEqual([]);
    expect(resultado.categorias).toEqual([
      { id: 'quesos', datos: { nombre: 'Quesos', orden: 0, clave: 'quesos' } },
    ]);
  });

  it('el resultado no depende del orden en que Firestore devuelva los documentos', () => {
    const a = construirPlan({ categorias: [preexistente, delSeed], productos: [] });
    const b = construirPlan({ categorias: [delSeed, preexistente], productos: [] });
    expect(operacionesOrdenadas(a)).toEqual(operacionesOrdenadas(b));
  });

  it('con `orden` empatado gana la que ya está en su path canónico (ahorra la mudanza)', () => {
    const plan = construirPlan({
      categorias: [cat('zzz', 'Quesos', 2), cat('quesos', 'Quesos', 2, { clave: 'quesos' })],
      productos: [],
    });
    expect(plan.grupos[0].ganador.id).toBe('quesos');
    expect(plan.grupos[0].motivo).toMatch(/ya está en su path canónico/);
    // Ya es idéntico al objetivo ⇒ no se reescribe, solo se borra el otro.
    expect(plan.escrituras).toEqual([]);
    expect(plan.borrados.map((b) => b.id)).toEqual(['zzz']);
  });

  it('con orden y canonicidad empatados desempata el id menor (solo por determinismo)', () => {
    const plan = construirPlan({
      categorias: [cat('bbb', 'Quesos', 1), cat('aaa', 'Quesos', 1)],
      productos: [],
    });
    expect(plan.grupos[0].ganador.id).toBe('aaa');
    expect(plan.grupos[0].motivo).toMatch(/id menor/);
  });

  it('elegirGanador no muta la lista que recibe', () => {
    const lista = [delSeed, preexistente];
    elegirGanador(lista);
    expect(lista[0].id).toBe('demo-categoria-quesos');
  });
});

// ── Homónimas con distinto caso: hay que re-etiquetar productos ────────────

describe('homónimas con distinto caso o espacios', () => {
  it('re-etiqueta los productos de la que desaparece al nombre que sobrevive', () => {
    const estado = {
      categorias: [cat('id-mayus', 'Quesos', 0), cat('id-minus', 'quesos ', 1)],
      productos: [
        { id: 'p1', categoria: 'Quesos' },
        { id: 'p2', categoria: 'quesos ' },
        { id: 'p3', categoria: 'Embutidos' },
      ],
    };
    const { plan, resultado } = migrarYVerificar(estado);

    expect(plan.grupos[0].ganador.id).toBe('id-mayus');
    expect(plan.grupos[0].objetivo.nombre).toBe('Quesos');
    expect(plan.reetiquetados).toEqual([
      { id: 'p2', de: 'quesos ', a: 'Quesos', causa: 'duplicado' },
    ]);
    expect(productosAfectados(plan)).toEqual(['p2']);
    // El producto de otra categoría inexistente no se toca: la app ya lo muestra
    // bajo "Sin categoría" e inventarle una categoría sería decidir por el dueño.
    expect(resultado.productos.find((p) => p.id === 'p3').categoria).toBe('Embutidos');
    expect(resultado.productos.find((p) => p.id === 'p2').categoria).toBe('Quesos');
  });

  it('re-etiqueta también al perdedor que ocupaba el path canónico, sin borrarlo dos veces', () => {
    // "quesos" (id canónico, orden 5) pierde contra "Quesos" (orden 0). El path
    // `categorias/quesos` NO se borra: se PISA con la escritura del ganador. Emitir
    // delete + set sobre el mismo path en un batch es un error del SDK.
    const estado = {
      categorias: [cat('id-mayus', 'Quesos', 0), cat('quesos', 'quesos', 5, { clave: 'quesos' })],
      productos: [{ id: 'p1', categoria: 'quesos' }],
    };
    const { plan } = migrarYVerificar(estado);

    expect(plan.escrituras).toEqual([
      {
        id: 'quesos',
        datos: { nombre: 'Quesos', orden: 0, clave: 'quesos' },
        motivo: 'absorbe a id-mayus (que gana el duplicado)',
      },
    ]);
    expect(plan.borrados.map((b) => b.id)).toEqual(['id-mayus']);
    expect(plan.reetiquetados).toEqual([
      { id: 'p1', de: 'quesos', a: 'Quesos', causa: 'duplicado' },
    ]);
  });

  it('re-etiqueta variantes de un producto aunque no haya duplicado de categoría', () => {
    // "QUESOS" no existe como documento: hoy ese producto se muestra bajo "Sin
    // categoría". Bajo el invariante nuevo ES la misma categoría que "Quesos", así
    // que se normaliza; se informa aparte (causa 'variante') porque toca un
    // producto que ningún duplicado obligaba a tocar.
    const estado = {
      categorias: [catCanonica('Quesos', 0)],
      productos: [
        { id: 'p1', categoria: 'QUESOS' },
        { id: 'p2', categoria: 'Quesos' },
      ],
    };
    const { plan } = migrarYVerificar(estado);
    expect(plan.reetiquetados).toEqual([
      { id: 'p1', de: 'QUESOS', a: 'Quesos', causa: 'variante' },
    ]);
  });
});

// ── Datos que la migración NO decide sola ──────────────────────────────────

describe('documentos que bloquean la migración (todo-o-nada)', () => {
  it('nombre cuya clave no sirve como id de Firestore', () => {
    for (const nombre of ['a/b', '.', '..', '__proto__', '   ']) {
      const plan = construirPlan({ categorias: [cat('xyz', nombre, 0)], productos: [] });
      expect(plan.errores, `nombre ${JSON.stringify(nombre)}`).toHaveLength(1);
      expect(operacionesOrdenadas(plan)).toEqual([]);
    }
    expect(construirPlan({ categorias: [cat('xyz', 'a/b', 0)], productos: [] }).errores[0]).toMatch(
      /no sirve como id de documento/,
    );
  });

  it('un solo documento problemático aborta TODO el plan, no solo su grupo', () => {
    const plan = construirPlan({
      categorias: [catCanonica('Quesos', 0), cat('xyz', 'Miel/Dulces', 1)],
      productos: [{ id: 'p1', categoria: 'Quesos' }],
    });
    expect(plan.errores).toHaveLength(1);
    expect(plan.escrituras).toEqual([]);
    expect(plan.borrados).toEqual([]);
    expect(plan.reetiquetados).toEqual([]);
  });

  it('nombre ausente, vacío o no textual', () => {
    expect(construirPlan({ categorias: [cat('x', undefined, 0)], productos: [] }).errores[0]).toMatch(
      /'nombre' ausente/,
    );
    expect(construirPlan({ categorias: [cat('x', 42, 0)], productos: [] }).errores[0]).toMatch(
      /'nombre' ausente/,
    );
  });

  it('`orden` que no es entero >= 0 (las reglas lo exigen y el orden decide el duplicado)', () => {
    expect(problemaDeCategoria('x', { nombre: 'Quesos', orden: 1.5 })).toMatch(/'orden'/);
    expect(problemaDeCategoria('x', { nombre: 'Quesos', orden: -1 })).toMatch(/'orden'/);
    expect(problemaDeCategoria('x', { nombre: 'Quesos', orden: undefined })).toMatch(/'orden'/);
    expect(problemaDeCategoria('quesos', { nombre: 'Quesos', orden: 0 })).toBeNull();
  });

  it('un producto con `categoria` no textual se informa pero no bloquea', () => {
    const plan = construirPlan({
      categorias: [catCanonica('Quesos', 0)],
      productos: [{ id: 'p1', categoria: null }],
    });
    expect(plan.errores).toEqual([]);
    expect(plan.advertencias[0]).toMatch(/productos\/p1/);
    expect(plan.reetiquetados).toEqual([]);
  });
});

// ── Escenario completo ─────────────────────────────────────────────────────

describe('escenario completo (los cinco casos juntos)', () => {
  const estado = {
    categorias: [
      catCanonica('Especias', 5), // ya canónica y completa
      cat('quesos', 'Quesos', 0), // canónica pero sin `clave`
      cat('Ab12Cd', 'Frutos secos', 3), // id autogenerado
      cat('Xy34Zw', 'Embutidos', 1), // homónima con distinto caso…
      cat('Qr56St', 'embutidos', 2), // …de esta
      cat('demo-categoria-miel', 'Miel', 4), // homónima exacta…
      cat('Mn78Op', 'Miel', 6), // …de esta
    ],
    productos: [
      { id: 'p1', categoria: 'Quesos' },
      { id: 'p2', categoria: 'Frutos secos' },
      { id: 'p3', categoria: 'embutidos' },
      { id: 'p4', categoria: 'Embutidos' },
      { id: 'p5', categoria: 'Miel' },
      { id: 'p6', categoria: 'Sin definir' },
    ],
  };

  const { plan, resultado } = migrarYVerificar(estado);

  it('deja exactamente una categoría por clave, con id canónico', () => {
    expect(resultado.categorias.map((c) => c.id).sort()).toEqual([
      'embutidos',
      'especias',
      'frutos secos',
      'miel',
      'quesos',
    ]);
    for (const c of resultado.categorias) {
      expect(c.id).toBe(claveCategoria(c.datos.nombre));
      expect(c.datos.clave).toBe(c.id);
    }
  });

  it('conserva el nombre y el orden del ganador de cada duplicado', () => {
    const porId = new Map(resultado.categorias.map((c) => [c.id, c.datos]));
    expect(porId.get('embutidos')).toEqual({ nombre: 'Embutidos', orden: 1, clave: 'embutidos' });
    expect(porId.get('miel')).toEqual({ nombre: 'Miel', orden: 4, clave: 'miel' });
  });

  it('re-etiqueta solo los productos que lo necesitan', () => {
    expect(plan.reetiquetados).toEqual([
      { id: 'p3', de: 'embutidos', a: 'Embutidos', causa: 'duplicado' },
    ]);
    expect(resultado.productos.find((p) => p.id === 'p6').categoria).toBe('Sin definir');
  });

  it('el orden de las operaciones es set → update → delete', () => {
    expect(operacionesOrdenadas(plan).map((o) => o.tipo)).toEqual([
      ...plan.escrituras.map(() => 'set'),
      ...plan.reetiquetados.map(() => 'update'),
      ...plan.borrados.map(() => 'delete'),
    ]);
  });

  it('el informe dice todo lo que va a pasar antes de que pase', () => {
    const texto = lineasResumen({
      projectId: 'quesarte-uy-dev',
      modo: 'DRY-RUN (no escribe nada)',
      plan,
      rutaBackup: '/tmp/backups/categorias.json',
      totales: { categorias: estado.categorias.length, productos: estado.productos.length },
    }).join('\n');

    expect(texto).toContain('quesarte-uy-dev');
    expect(texto).toContain('DRY-RUN');
    expect(texto).toContain('Duplicados encontrados (misma clave): 2');
    expect(texto).toContain('SOBREVIVE');
    expect(texto).toContain('Productos a re-etiquetar: 1');
    expect(texto).toContain('/tmp/backups/categorias.json');
    expect(texto).toContain('operaciones');
  });

  it('el informe de un plan bloqueado grita el problema y no promete ninguna escritura', () => {
    const bloqueado = construirPlan({ categorias: [cat('x', 'a/b', 0)], productos: [] });
    const texto = lineasResumen({
      projectId: 'quesarte-uy',
      modo: 'EJECUCIÓN REAL (--ejecutar)',
      plan: bloqueado,
      rutaBackup: '/tmp/x.json',
      totales: { categorias: 1, productos: 0 },
    }).join('\n');
    expect(texto).toContain('NO PUEDE CORRER');
    expect(texto).not.toContain('a borrar');
  });
});

// ── Verificación del estado final ──────────────────────────────────────────

describe('verificarInvariante', () => {
  it('acepta un estado ya migrado', () => {
    expect(
      verificarInvariante(
        [catCanonica('Quesos', 0), catCanonica('Miel', 1)],
        [{ id: 'p1', categoria: 'Quesos' }],
      ),
    ).toEqual([]);
  });

  it('detecta id que no es la clave, `clave` mal estampada y campos de más', () => {
    expect(verificarInvariante([cat('xyz', 'Quesos', 0, { clave: 'quesos' })], [])[0]).toMatch(
      /el id no es la clave/,
    );
    expect(verificarInvariante([cat('quesos', 'Quesos', 0)], [])[0]).toMatch(/campo 'clave'/);
    expect(
      verificarInvariante([cat('quesos', 'Quesos', 0, { clave: 'quesos', color: 'x' })], [])[0],
    ).toMatch(/fuera del esquema/);
  });

  it('detecta un producto que quedó apuntando a una variante del nombre', () => {
    expect(
      verificarInvariante([catCanonica('Quesos', 0)], [{ id: 'p1', categoria: 'quesos' }])[0],
    ).toMatch(/productos\/p1/);
  });
});

// ── CLI ────────────────────────────────────────────────────────────────────

describe('parsearArgs', () => {
  it('es DRY-RUN por defecto', () => {
    const args = parsearArgs(['--project', 'quesarte-uy']);
    expect(args).toMatchObject({
      project: 'quesarte-uy',
      ejecutar: false,
      backupDir: './backups',
      errores: [],
    });
  });

  it('exige --project: sin él, error (nunca un default a producción)', () => {
    expect(parsearArgs([]).errores[0]).toMatch(/--project/);
    expect(parsearArgs(['--ejecutar']).errores[0]).toMatch(/--project/);
  });

  it('no acepta --project sin valor ni pegado a otro flag', () => {
    expect(parsearArgs(['--project']).errores[0]).toMatch(/necesita un valor/);
    expect(parsearArgs(['--project', '--ejecutar']).errores[0]).toMatch(/necesita un valor/);
  });

  it('reconoce --ejecutar, --backup-dir y --restaurar', () => {
    expect(
      parsearArgs(['--project', 'p', '--ejecutar', '--backup-dir', '/tmp/bk', '--restaurar', 'b.json']),
    ).toMatchObject({ ejecutar: true, backupDir: '/tmp/bk', restaurar: 'b.json', errores: [] });
  });

  it('ignora el separador `--` que pnpm reenvía al script', () => {
    expect(parsearArgs(['--', '--project', 'quesarte-uy'])).toMatchObject({
      project: 'quesarte-uy',
      errores: [],
    });
  });

  it('rechaza argumentos desconocidos (un typo no puede pasar por bueno)', () => {
    expect(parsearArgs(['--project', 'p', '--ejecutar-ya']).errores[0]).toMatch(/--ejecutar-ya/);
  });

  it('--ayuda no exige --project y la ayuda nombra el orden de despliegue', () => {
    expect(parsearArgs(['--ayuda'])).toMatchObject({ ayuda: true, errores: [] });
    expect(AYUDA).toMatch(/ANTES del deploy de reglas/);
  });
});

describe('nombres de archivo', () => {
  it('trazan proyecto e instante y son aptos para el sistema de archivos', () => {
    expect(nombreArchivoBackup('quesarte-uy', new Date('2026-07-25T18:05:31.042Z'))).toBe(
      'categorias-quesarte-uy-2026-07-25T18-05-31-042Z.json',
    );
  });
});
