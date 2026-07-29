import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Suite de reglas de Firestore contra el emulador (levantado por el script
// `test:rules` vía `firebase emulators:exec`). Cubre la matriz de la Fase 1:
// deny por defecto, gating por `usuarios/{uid}.activo`, y permisos por rol.

const PROJECT_ID = 'demo-quesarte';

// Ruta al archivo de reglas, relativa a este test (evita globals de Node como
// `process` que la config de ESLint de la app no declara).
const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(HERE, '../../firestore.rules');

// UIDs de prueba.
const ADMIN = 'admin-uid';
const VENDEDOR = 'vend-uid';
const INACTIVO = 'inact-uid';
const SIN_DOC = 'sindoc-uid';

let testEnv: RulesTestEnvironment;

// Firestore para un usuario autenticado (o anónimo si no se pasa uid).
function db(uid?: string): Firestore {
  return uid
    ? testEnv.authenticatedContext(uid).firestore()
    : testEnv.unauthenticatedContext().firestore();
}

// Payload de venta válido (usuarioId parametrizable para probar el guard).
function ventaValida(usuarioId: string) {
  return {
    numero: 2,
    fecha: Date.now(),
    usuarioId,
    items: [
      {
        productoId: 'prod-nuez',
        gramos: 100,
        precioUnitCents: 45000,
        subtotalCents: 4500,
        nombreProducto: 'Nuez',
      },
    ],
    totalCents: 4500,
    medioPago: 'efectivo',
    estado: 'completada',
  };
}

// Payload de alta rápida de cliente (shape estricto: stats nace en cero).
function clienteAltaRapida(nombre = 'Nuevo') {
  return {
    nombre,
    fechaAlta: Date.now(),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: 0 },
  };
}

// Una plantilla de WhatsApp con shape válido (doc 08). `sobre` permite romperla.
function plantillaWa(sobre: Record<string, unknown> = {}) {
  return { id: 'p1', nombre: 'Pedido listo', contexto: 'venta', texto: 'Hola {cliente}', ...sobre };
}

// Proveedor con shape válido (doc 07), réplica del documento que escribe
// `crearProveedor` (packages/firebase-kit/src/proveedores.ts): los 7 opcionales
// presentes y `pagos` con DOS cuentas (una con `titular`/`moneda`, otra sin),
// para probar que validar solo `pagos[0]` no rechaza la segunda. `sobre` permite
// romper el shape.
function proveedorCompleto(sobre: Record<string, unknown> = {}) {
  return {
    nombre: 'Lácteos del Sur',
    contactoNombre: 'Juan Pérez',
    telefono: '099111222',
    email: 'juan@lacteosdelsur.uy',
    direccion: 'Ruta 5 km 100',
    rut: '210000000012',
    pagos: [
      { banco: 'BROU', cuenta: '001234567', titular: 'Lácteos del Sur SRL', moneda: 'UYU' },
      { banco: 'Itaú', cuenta: '009876543' },
    ],
    notas: 'Entrega los martes',
    fechaAlta: new Date(),
    activo: true,
    ...sobre,
  };
}

// Doc `configuracion/plantillasWhatsApp` con la lista dada (default: una válida).
function plantillasWaDoc(plantillas: unknown[] = [plantillaWa()]) {
  return { plantillas };
}

// Semilla del tema del negocio (doc 06 §4, tanda TM): shape estricto de 3 claves.
// `sobre` permite romper el shape (clave de más, tipo o rango inválido).
function temaSemilla(sobre: Record<string, unknown> = {}) {
  return { version: 1, matiz: 200, tinte: 'calido', ...sobre };
}

// Compra mínima con el `estado` dado (doc 03). Los efectos no importan a las
// reglas, que solo miran el `estado` y su transición.
function compraSeed(estado: 'borrador' | 'confirmada') {
  return {
    fecha: Date.now(),
    usuarioId: ADMIN,
    estado,
    proveedorId: 'prov-1',
    proveedorNombre: 'Lácteos Colonia',
    items: [],
    gastos: [],
    totalFacturaCents: 0,
    totalGastosCents: 0,
    totalRealCents: 0,
  };
}

// Movimiento válido a nombre de un usuario.
function movimientoValido(usuarioId: string) {
  return {
    tipo: 'venta',
    productoId: 'prod-nuez',
    deltaGramos: -100,
    origenTipo: 'venta',
    origenId: 'venta-1',
    usuarioId,
    fecha: Date.now(),
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

// Base limpia y sembrada antes de cada caso (bypassa reglas para el seed).
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const seed = ctx.firestore();
    await setDoc(doc(seed, 'usuarios', ADMIN), {
      nombre: 'Ana',
      email: 'ana@quesarte.uy',
      rol: 'admin',
      activo: true,
    });
    await setDoc(doc(seed, 'usuarios', VENDEDOR), {
      nombre: 'Beto',
      email: 'beto@quesarte.uy',
      rol: 'vendedor',
      activo: true,
    });
    await setDoc(doc(seed, 'usuarios', INACTIVO), {
      nombre: 'Cris',
      email: 'cris@quesarte.uy',
      rol: 'vendedor',
      activo: false,
    });
    // Categoría canónica: el id del documento ES la clave de su nombre
    // (`claveCategoria('Quesos') === 'quesos'`), que es lo que exigen las reglas.
    await setDoc(doc(seed, 'categorias', 'quesos'), {
      nombre: 'Quesos',
      orden: 0,
      clave: 'quesos',
    });
    await setDoc(doc(seed, 'productos', 'prod-nuez'), {
      nombre: 'Nuez mariposa',
      categoria: 'frutos_secos',
      modoPrecio: 'por_kg',
      modoStock: 'granel',
      precioVentaCents: 45000,
      costoPromedioCents: 30000,
      stockGranelGramos: 10000,
      activo: true,
      actualizadoEn: Date.now(),
    });
    await setDoc(doc(seed, 'piezas', 'pieza-1'), {
      productoId: 'prod-queso',
      pesoInicialGramos: 5000,
      pesoRestanteGramos: 4000,
      costoKgCents: 30000,
      fechaIngreso: Date.now(),
      estado: 'disponible',
    });
    await setDoc(doc(seed, 'ventas', 'venta-1'), {
      numero: 1,
      fecha: Date.now(),
      usuarioId: VENDEDOR,
      items: [{ productoId: 'prod-nuez', gramos: 100, subtotalCents: 4500 }],
      totalCents: 4500,
      medioPago: 'efectivo',
      estado: 'completada',
    });
    await setDoc(doc(seed, 'movimientos', 'mov-1'), movimientoValido(VENDEDOR));
    // Compras (doc 03): una en borrador (editable) y una confirmada (inmutable).
    await setDoc(doc(seed, 'compras', 'compra-1'), compraSeed('borrador'));
    await setDoc(doc(seed, 'compras', 'compra-conf'), compraSeed('confirmada'));
    // Cliente con historial (stats no en cero) para probar los updates. Trae
    // `telefonoE164` derivado (doc 08) para poder probar que el admin lo BORRA
    // junto con el display.
    await setDoc(doc(seed, 'clientes', 'cli-1'), {
      nombre: 'Marta',
      telefono: '099111222',
      telefonoE164: '59899111222',
      alias: 'La Marta',
      email: 'marta@x.uy',
      direccion: 'Rivera 1234',
      notas: 'Sábados',
      fechaAlta: Date.now(),
      activo: true,
      stats: {
        cantidadVentas: 2,
        totalHistoricoCents: 5000,
        primeraCompra: Date.now(),
        ultimaCompra: Date.now(),
      },
    });
    await setDoc(doc(seed, 'proveedores', 'prov-1'), {
      nombre: 'Lácteos Colonia',
      rut: '210000000012',
      pagos: [{ banco: 'BROU', cuenta: '001234567' }],
      // `new Date()`, no `Date.now()`: la tanda de endurecimiento exige
      // `fechaAlta is timestamp` (ver `proveedorValido` en firestore.rules).
      // `Date.now()` escribe un NÚMERO plano (milisegundos), no un `Timestamp` de
      // Firestore, y ese tipo lo rechaza. Además es fiel a la escritura real:
      // `crearProveedor` persiste `new Date()`, que el SDK sí convierte a
      // `Timestamp`. Si copiás este patrón para otro seed de `proveedores`, usá
      // `new Date()` acá — el resto de los seeds del archivo sigue con
      // `Date.now()` porque ninguna otra colección valida el tipo de la fecha.
      fechaAlta: new Date(),
      activo: true,
    });
    await setDoc(doc(seed, 'configuracion', 'general'), {
      nombreNegocio: 'Quesarte',
      umbralPiezaAgotadaGramos: 50,
    });
    // Tema del negocio ya persistido (doc 06 §4): habilita probar delete/update.
    await setDoc(doc(seed, 'configuracion', 'tema'), temaSemilla());
  });
});

describe('gating base (autenticación + usuario activo)', () => {
  it('anónimo no lee productos', async () => {
    await assertFails(getDoc(doc(db(), 'productos', 'prod-nuez')));
  });

  it('autenticado sin doc en usuarios no lee productos', async () => {
    await assertFails(getDoc(doc(db(SIN_DOC), 'productos', 'prod-nuez')));
  });

  it('usuario inactivo no lee productos', async () => {
    await assertFails(getDoc(doc(db(INACTIVO), 'productos', 'prod-nuez')));
  });

  it('cada usuario lee su propio doc de usuarios (aunque esté inactivo)', async () => {
    await assertSucceeds(getDoc(doc(db(INACTIVO), 'usuarios', INACTIVO)));
  });

  it('un usuario no lee el doc de otro usuario', async () => {
    await assertFails(getDoc(doc(db(VENDEDOR), 'usuarios', ADMIN)));
  });
});

describe('usuarios', () => {
  it('admin lee todos los usuarios', async () => {
    const snap = await assertSucceeds(getDocs(collection(db(ADMIN), 'usuarios')));
    expect(snap.size).toBe(3);
  });

  it('admin invita usuario con shape válido', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'usuarios', 'nuevo-uid'), {
        nombre: 'Dina',
        email: 'dina@quesarte.uy',
        rol: 'vendedor',
        activo: true,
      }),
    );
  });

  it('admin NO invita usuario con rol inválido', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'usuarios', 'nuevo-uid'), {
        nombre: 'Dina',
        email: 'dina@quesarte.uy',
        rol: 'superadmin',
        activo: true,
      }),
    );
  });

  it('admin NO invita usuario con campos de más', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'usuarios', 'nuevo-uid'), {
        nombre: 'Dina',
        email: 'dina@quesarte.uy',
        rol: 'vendedor',
        activo: true,
        superpoder: true,
      }),
    );
  });

  it('admin actualiza rol/activo/nombre pero NO el email', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'usuarios', VENDEDOR), { activo: false, rol: 'admin' }),
    );
    await assertFails(
      updateDoc(doc(db(ADMIN), 'usuarios', VENDEDOR), { email: 'otro@quesarte.uy' }),
    );
  });

  it('nadie borra usuarios (ni el admin)', async () => {
    await assertFails(deleteDoc(doc(db(ADMIN), 'usuarios', VENDEDOR)));
  });

  it('vendedor NO escribe usuarios (ni su propio doc)', async () => {
    await assertFails(updateDoc(doc(db(VENDEDOR), 'usuarios', VENDEDOR), { nombre: 'Beto II' }));
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'usuarios', 'colado'), {
        nombre: 'Colado',
        email: 'colado@quesarte.uy',
        rol: 'admin',
        activo: true,
      }),
    );
  });
});

describe('categorias', () => {
  it('vendedor lee categorías', async () => {
    await assertSucceeds(getDoc(doc(db(VENDEDOR), 'categorias', 'quesos')));
  });

  it('vendedor NO crea categorías', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'categorias', 'miel'), {
        nombre: 'Miel',
        orden: 1,
        clave: 'miel',
      }),
    );
  });

  it('vendedor NO edita categorías', async () => {
    await assertFails(updateDoc(doc(db(VENDEDOR), 'categorias', 'quesos'), { nombre: 'Otros' }));
  });

  it('admin crea categoría con shape válido', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'categorias', 'miel'), { nombre: 'Miel', orden: 1, clave: 'miel' }),
    );
  });

  it('admin renombra in-place (update de nombre + clave, misma clave)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'categorias', 'quesos'), { nombre: 'QUESOS', clave: 'quesos' }),
    );
  });

  it('admin reordena (update solo orden)', async () => {
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'categorias', 'quesos'), { orden: 5 }));
  });

  it('admin NO crea con nombre vacío', async () => {
    await assertFails(setDoc(doc(db(ADMIN), 'categorias', 'x'), { nombre: '', orden: 1, clave: 'x' }));
  });

  it('admin NO crea con orden negativo', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'categorias', 'miel'), { nombre: 'Miel', orden: -1, clave: 'miel' }),
    );
  });

  it('admin NO crea con orden float', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'categorias', 'miel'), { nombre: 'Miel', orden: 1.5, clave: 'miel' }),
    );
  });

  it('admin NO crea con clave extra', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'categorias', 'miel'), {
        nombre: 'Miel',
        orden: 1,
        clave: 'miel',
        color: 'rojo',
      }),
    );
  });

  it('admin NO agrega una clave extra en un update', async () => {
    await assertFails(updateDoc(doc(db(ADMIN), 'categorias', 'quesos'), { color: 'rojo' }));
  });

  it('admin NO deja el nombre vacío en un update', async () => {
    await assertFails(updateDoc(doc(db(ADMIN), 'categorias', 'quesos'), { nombre: '' }));
  });

  // El invariante que sustituye a la unicidad "entre documentos", que las reglas
  // no pueden expresar porque no hacen queries: el id de CADA documento es su
  // propia clave. Si todos lo cumplen, dos categorías homónimas serían el mismo
  // documento. Ver el comentario de `categoriaValida()` en firestore.rules.
  describe('invariante id == clave', () => {
    it('rechaza un alta cuyo id NO coincide con la clave', async () => {
      await assertFails(
        setDoc(doc(db(ADMIN), 'categorias', 'cat-miel-random'), {
          nombre: 'Miel',
          orden: 1,
          clave: 'miel',
        }),
      );
    });

    it('rechaza un alta SIN el campo clave', async () => {
      await assertFails(
        setDoc(doc(db(ADMIN), 'categorias', 'miel'), { nombre: 'Miel', orden: 1 }),
      );
    });

    it('rechaza un update que rompe la coincidencia (cambia clave, no el id)', async () => {
      await assertFails(
        updateDoc(doc(db(ADMIN), 'categorias', 'quesos'), {
          nombre: 'Fiambres',
          clave: 'fiambres',
        }),
      );
    });

    it('rechaza un update que borra el campo clave', async () => {
      await assertFails(
        updateDoc(doc(db(ADMIN), 'categorias', 'quesos'), { clave: deleteField() }),
      );
    });

    it('rechaza un update con clave vacía', async () => {
      await assertFails(updateDoc(doc(db(ADMIN), 'categorias', 'quesos'), { clave: '' }));
    });
  });

  // El renombrado que cambia de clave muda el documento de path: set del nuevo +
  // delete del viejo en el MISMO batch. Sin delete para admin, el documento viejo
  // quedaría como categoría fantasma y el invariante se rompería.
  describe('delete (necesario para el renombrado que muda de path)', () => {
    it('admin borra una categoría', async () => {
      await assertSucceeds(deleteDoc(doc(db(ADMIN), 'categorias', 'quesos')));
    });

    it('vendedor NO borra categorías', async () => {
      await assertFails(deleteDoc(doc(db(VENDEDOR), 'categorias', 'quesos')));
    });
  });

  // TRIPWIRE Unicode. El `lower()` del lenguaje de reglas SOLO baja A–Z ASCII:
  // deja intactas 'Ñ' y las vocales acentuadas. Por eso la regla NO compara
  // contra `nombre.trim().lower()` sino contra el campo `clave`, calculado en
  // `packages/core` con el `toLowerCase()` de JS (Unicode completo). Estos casos
  // fallarían con permission-denied si alguien "simplificara" la regla a
  // `id == nombre.trim().lower()`, y en una quesería uruguaya son nombres reales.
  describe('Unicode: eñe y acentos', () => {
    // [nombre, clave según claveCategoria() de @gestion/core]
    const casos: [string, string][] = [
      ['Ñoquis', 'ñoquis'],
      ['ÑOQUIS', 'ñoquis'],
      ['Café', 'café'],
      ['CAFÉ', 'café'],
      ['Ñandú', 'ñandú'],
    ];

    for (const [nombre, clave] of casos) {
      it(`admin crea "${nombre}" con id "${clave}"`, async () => {
        await assertSucceeds(
          setDoc(doc(db(ADMIN), 'categorias', clave), { nombre, orden: 1, clave }),
        );
      });
    }

    it('documenta el motivo: lower() de las reglas NO baja la Ñ', async () => {
      // Si lower() bajara la Ñ como JS, la clave de "ÑOQUIS" sería 'ñoquis' y
      // este id incoherente no tendría por qué aceptarse. Se acepta porque la
      // regla compara contra `clave`, no contra `nombre.lower()`: la prueba de
      // que la comparación textual quedó fuera de las reglas a propósito.
      await assertSucceeds(
        setDoc(doc(db(ADMIN), 'categorias', 'ñoquis'), {
          nombre: 'ÑOQUIS',
          orden: 1,
          clave: 'ñoquis',
        }),
      );
    });

    it('un id con la Ñ en MAYÚSCULA sigue siendo rechazado si no coincide con la clave', async () => {
      await assertFails(
        setDoc(doc(db(ADMIN), 'categorias', 'Ñoquis'), {
          nombre: 'Ñoquis',
          orden: 1,
          clave: 'ñoquis',
        }),
      );
    });
  });
});

describe('productos', () => {
  it('vendedor lee productos', async () => {
    await assertSucceeds(getDoc(doc(db(VENDEDOR), 'productos', 'prod-nuez')));
  });

  it('vendedor NO edita precioVentaCents', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'productos', 'prod-nuez'), { precioVentaCents: 40000 }),
    );
  });

  it('vendedor SÍ baja stock con el diff correcto (efecto de venta)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(VENDEDOR), 'productos', 'prod-nuez'), {
        stockGranelGramos: 9900,
        actualizadoEn: Date.now(),
      }),
    );
  });

  it('vendedor SÍ baja stock con increment (valor resultante >= 0)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(VENDEDOR), 'productos', 'prod-nuez'), {
        stockGranelGramos: increment(-100),
      }),
    );
  });

  it('vendedor NO deja el stock granel en negativo (piso cero sobre el resultante)', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'productos', 'prod-nuez'), {
        stockGranelGramos: increment(-99999),
      }),
    );
  });

  it('vendedor NO SUBE el stock granel (una venta solo descuenta)', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'productos', 'prod-nuez'), {
        stockGranelGramos: increment(500),
      }),
    );
  });

  it('vendedor NO SUBE el stock granel con valor absoluto tampoco', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'productos', 'prod-nuez'), { stockGranelGramos: 20000 }),
    );
  });

  it('admin SÍ sube el stock (ingreso de compra / reversa de anulación)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'productos', 'prod-nuez'), {
        stockGranelGramos: increment(500),
      }),
    );
  });

  it('vendedor NO crea productos', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'productos', 'prod-x'), {
        nombre: 'X',
        modoPrecio: 'por_kg',
        modoStock: 'granel',
        precioVentaCents: 1,
        activo: true,
      }),
    );
  });

  it('admin edita precioVentaCents', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'productos', 'prod-nuez'), { precioVentaCents: 48000 }),
    );
  });
});

describe('piezas', () => {
  it('vendedor lee piezas', async () => {
    await assertSucceeds(getDoc(doc(db(VENDEDOR), 'piezas', 'pieza-1')));
  });

  it('vendedor baja pesoRestanteGramos (venta)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(VENDEDOR), 'piezas', 'pieza-1'), { pesoRestanteGramos: 3500 }),
    );
  });

  it('vendedor NO sube pesoRestanteGramos', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'piezas', 'pieza-1'), { pesoRestanteGramos: 4500 }),
    );
  });

  it('vendedor baja pesoRestanteGramos con increment (resultante >= 0)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(VENDEDOR), 'piezas', 'pieza-1'), { pesoRestanteGramos: increment(-500) }),
    );
  });

  it('vendedor NO deja pesoRestanteGramos en negativo (piso cero sobre el resultante)', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'piezas', 'pieza-1'), { pesoRestanteGramos: increment(-99999) }),
    );
  });

  it('vendedor NO edita el costo de la pieza', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'piezas', 'pieza-1'), { costoKgCents: 1 }),
    );
  });

  it('vendedor NO crea ni borra piezas', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'piezas', 'pieza-x'), {
        productoId: 'prod-queso',
        pesoInicialGramos: 1000,
        pesoRestanteGramos: 1000,
        costoKgCents: 1,
        fechaIngreso: Date.now(),
        estado: 'disponible',
      }),
    );
    await assertFails(deleteDoc(doc(db(VENDEDOR), 'piezas', 'pieza-1')));
  });

  it('admin crea piezas', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'piezas', 'pieza-x'), {
        productoId: 'prod-queso',
        pesoInicialGramos: 1000,
        pesoRestanteGramos: 1000,
        costoKgCents: 30000,
        fechaIngreso: Date.now(),
        estado: 'disponible',
      }),
    );
  });
});

describe('ventas', () => {
  it('vendedor crea su propia venta completada', async () => {
    await assertSucceeds(
      setDoc(doc(db(VENDEDOR), 'ventas', 'venta-nueva'), ventaValida(VENDEDOR)),
    );
  });

  it('vendedor NO crea venta con usuarioId ajeno', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'ventas', 'venta-nueva'), ventaValida(ADMIN)),
    );
  });

  it('admin anula una venta (completada -> anulada)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'ventas', 'venta-1'), { estado: 'anulada' }),
    );
  });

  it('vendedor NO anula ventas', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'ventas', 'venta-1'), { estado: 'anulada' }),
    );
  });

  it('admin NO puede tocar otros campos al anular', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'ventas', 'venta-1'), { estado: 'anulada', totalCents: 0 }),
    );
  });

  it('nadie borra ventas', async () => {
    await assertFails(deleteDoc(doc(db(ADMIN), 'ventas', 'venta-1')));
  });

  it('vendedor crea venta CON cliente (clienteId/clienteNombre string)', async () => {
    await assertSucceeds(
      setDoc(doc(db(VENDEDOR), 'ventas', 'venta-con-cli'), {
        ...ventaValida(VENDEDOR),
        clienteId: 'cli-1',
        clienteNombre: 'Marta',
      }),
    );
  });

  it('vendedor NO crea venta con clienteId no-string', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'ventas', 'venta-cli-mala'), {
        ...ventaValida(VENDEDOR),
        clienteId: 123,
      }),
    );
  });
});

describe('clientes', () => {
  it('vendedor lee clientes (los busca en el POS)', async () => {
    await assertSucceeds(getDoc(doc(db(VENDEDOR), 'clientes', 'cli-1')));
  });

  it('vendedor crea cliente válido (alta rápida, stats en cero)', async () => {
    await assertSucceeds(
      setDoc(doc(db(VENDEDOR), 'clientes', 'cli-nuevo'), clienteAltaRapida()),
    );
  });

  it('vendedor NO crea cliente con stats distinto de cero', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'clientes', 'cli-x'), {
        ...clienteAltaRapida(),
        stats: { cantidadVentas: 5, totalHistoricoCents: 9999 },
      }),
    );
  });

  it('vendedor NO crea cliente con nombre vacío', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'clientes', 'cli-x'), clienteAltaRapida('')),
    );
  });

  it('vendedor NO crea cliente con clave desconocida', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'clientes', 'cli-x'), { ...clienteAltaRapida(), rol: 'admin' }),
    );
  });

  it('vendedor NO crea cliente con fechas en stats (las escriben las ventas, no el alta)', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'clientes', 'cli-x'), {
        ...clienteAltaRapida(),
        stats: { cantidadVentas: 0, totalHistoricoCents: 0, primeraCompra: Date.now() },
      }),
    );
  });

  it('vendedor NO crea cliente con un opcional de contacto de tipo inválido (alias numérico)', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'clientes', 'cli-x'), { ...clienteAltaRapida(), alias: 123 }),
    );
  });

  it('vendedor NO edita datos de contacto', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'clientes', 'cli-1'), { telefono: '099000000' }),
    );
  });

  it('vendedor actualiza stats con deltas coherentes de una venta (+1, total sube)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(VENDEDOR), 'clientes', 'cli-1'), {
        'stats.cantidadVentas': increment(1),
        'stats.totalHistoricoCents': increment(4500),
        'stats.ultimaCompra': Date.now(),
      }),
    );
  });

  it('vendedor NO actualiza stats con cantidadVentas +2', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'clientes', 'cli-1'), {
        'stats.cantidadVentas': increment(2),
        'stats.totalHistoricoCents': increment(4500),
      }),
    );
  });

  it('vendedor NO actualiza stats si el total no sube', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'clientes', 'cli-1'), {
        'stats.cantidadVentas': increment(1),
        'stats.totalHistoricoCents': increment(-1000),
      }),
    );
  });

  it('vendedor NO decrementa stats (la reversa de la anulación es de admin)', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'clientes', 'cli-1'), {
        'stats.cantidadVentas': increment(-1),
        'stats.totalHistoricoCents': increment(-4500),
      }),
    );
  });

  it('vendedor NO cuela una sub-clave desconocida dentro de stats', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'clientes', 'cli-1'), {
        'stats.cantidadVentas': increment(1),
        'stats.totalHistoricoCents': increment(4500),
        'stats.loQueSea': 1,
      }),
    );
  });

  it('vendedor NO actualiza stats con un increment fraccionario (total dejaría de ser entero)', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'clientes', 'cli-1'), {
        'stats.cantidadVentas': increment(1),
        'stats.totalHistoricoCents': increment(0.5),
      }),
    );
  });

  it('admin edita datos de contacto', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'clientes', 'cli-1'), { telefono: '099000000', alias: 'La Marta' }),
    );
  });

  it('admin revierte stats al anular (decrementos)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'clientes', 'cli-1'), {
        'stats.cantidadVentas': increment(-1),
        'stats.totalHistoricoCents': increment(-4500),
      }),
    );
  });

  it('admin NO agrega una clave desconocida', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'clientes', 'cli-1'), { superpoder: true }),
    );
  });

  it('vendedor crea cliente CON telefonoE164 válido (derivado, doc 08)', async () => {
    await assertSucceeds(
      setDoc(doc(db(VENDEDOR), 'clientes', 'cli-wa'), {
        ...clienteAltaRapida(),
        telefono: '099 123 456',
        telefonoE164: '59899123456',
      }),
    );
  });

  it('vendedor crea cliente SIN telefonoE164 (sigue siendo válido)', async () => {
    await assertSucceeds(
      setDoc(doc(db(VENDEDOR), 'clientes', 'cli-sin-wa'), {
        ...clienteAltaRapida(),
        telefono: 'no tengo',
      }),
    );
  });

  it('vendedor NO crea cliente con telefonoE164 con letras', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'clientes', 'cli-mal'), {
        ...clienteAltaRapida(),
        telefonoE164: '5989ABC123',
      }),
    );
  });

  it('vendedor NO crea cliente con telefonoE164 fuera de rango (muy corto)', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'clientes', 'cli-corto'), {
        ...clienteAltaRapida(),
        telefonoE164: '123',
      }),
    );
  });

  it('admin setea telefonoE164 válido en un cliente existente', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'clientes', 'cli-1'), {
        telefono: '099 000 111',
        telefonoE164: '59899000111',
      }),
    );
  });

  it('admin update que SOLO cambia telefonoE164 (válido)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'clientes', 'cli-1'), { telefonoE164: '59899000111' }),
    );
  });

  it('admin NO setea un telefonoE164 con letras', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'clientes', 'cli-1'), { telefonoE164: 'ABC12345' }),
    );
  });

  // `actualizarCliente` pasó a un contrato de REEMPLAZO TOTAL de los campos de
  // contacto: vaciar uno en el modal lo borra con `deleteField()`. Estos casos
  // fijan que las reglas dejan pasar ese payload —si no, el arreglo rompería solo
  // en producción con `permission-denied`—. Pasa porque en un update
  // `request.resource.data` es el documento RESULTANTE: un campo borrado no está,
  // `hasOnly` se satisface con la ausencia y `telefonoE164ValidoSiPresente` corta
  // por su primera rama.
  it('admin BORRA telefono y telefonoE164 juntos (el display vaciado se lleva su E164)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'clientes', 'cli-1'), {
        telefono: deleteField(),
        telefonoE164: deleteField(),
      }),
    );
  });

  it('admin BORRA los cinco campos de contacto de una (payload de reemplazo total)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'clientes', 'cli-1'), {
        nombre: 'Marta',
        alias: deleteField(),
        telefono: deleteField(),
        telefonoE164: deleteField(),
        email: deleteField(),
        direccion: deleteField(),
        notas: deleteField(),
      }),
    );
  });

  it('admin BORRA solo telefonoE164 dejando el display (teléfono no normalizable)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'clientes', 'cli-1'), {
        telefono: 'sin numero',
        telefonoE164: deleteField(),
      }),
    );
  });

  it('vendedor NO borra el telefono de un cliente (solo toca stats)', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'clientes', 'cli-1'), { telefono: deleteField() }),
    );
  });

  it('nadie borra clientes (ni el admin)', async () => {
    await assertFails(deleteDoc(doc(db(ADMIN), 'clientes', 'cli-1')));
  });
});

describe('proveedores (solo admin)', () => {
  it('vendedor NO lee proveedores (criterio de aceptación doc 07)', async () => {
    await assertFails(getDoc(doc(db(VENDEDOR), 'proveedores', 'prov-1')));
  });

  it('vendedor NO crea proveedores', async () => {
    // `fechaAlta: new Date()`, no `Date.now()`: con `proveedorValido()` exigiendo
    // `fechaAlta is timestamp`, un `number` ya hace que el documento sea inválido
    // por SHAPE, y este test dejaría de probar lo que dice su nombre (que el
    // vendedor no tiene permiso) para pasar por la razón equivocada.
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'proveedores', 'prov-x'), {
        nombre: 'X',
        fechaAlta: new Date(),
        activo: true,
      }),
    );
  });

  it('admin lee y crea proveedores', async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN), 'proveedores', 'prov-1')));
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-x'), {
        nombre: 'Nuevo proveedor',
        fechaAlta: new Date(),
        activo: true,
      }),
    );
  });

  it('admin actualiza proveedores', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'proveedores', 'prov-1'), { telefono: '099999999' }),
    );
  });

  it('vendedor NO puede actualizar un proveedor', async () => {
    // El único verbo sin cobertura de permisos vendedor en este bloque.
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'proveedores', 'prov-1'), { telefono: '099111222' }),
    );
  });

  it('nadie borra proveedores (ni el admin)', async () => {
    await assertFails(deleteDoc(doc(db(ADMIN), 'proveedores', 'prov-1')));
  });

  // --- Shape estricto (tanda de endurecimiento) ---

  // Positivos primero: protegen al dueño de un falso rechazo en el ABM real.

  it('create réplica exacta de crearProveedor (7 opcionales + pagos de 2 cuentas)', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-completo'), proveedorCompleto()),
    );
  });

  it('create mínimo (solo nombre, fechaAlta, activo)', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-minimo'), {
        nombre: 'Mínimo SRL',
        fechaAlta: new Date(),
        activo: true,
      }),
    );
  });

  it('update réplica exacta de actualizarProveedor (reemplazo total, deleteField en los vacíos)', async () => {
    // Confirma empíricamente que `soloCambian` (affectedKeys) cuenta las claves
    // borradas con `deleteField()` como afectadas, no como ausentes.
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'proveedores', 'prov-1'), {
        nombre: 'Lácteos Colonia SRL',
        contactoNombre: deleteField(),
        telefono: deleteField(),
        email: deleteField(),
        direccion: deleteField(),
        rut: deleteField(),
        pagos: deleteField(),
        notas: deleteField(),
      }),
    );
  });

  it('update de activo (desactivarProveedor / reactivarProveedor)', async () => {
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'proveedores', 'prov-1'), { activo: false }));
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'proveedores', 'prov-1'), { activo: true }));
  });

  it('create con pagos: [] (lista vacía tolerada, ver crearProveedor)', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-sin-pagos'), proveedorCompleto({ pagos: [] })),
    );
  });

  it('create con nombre de exactamente 120 caracteres (borde válido)', async () => {
    await assertSucceeds(
      setDoc(
        doc(db(ADMIN), 'proveedores', 'prov-120'),
        proveedorCompleto({ nombre: 'a'.repeat(120) }),
      ),
    );
  });

  // Negativos.

  it('create con clave desconocida → falla', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-x'), proveedorCompleto({ extra: 'nope' })),
    );
  });

  it('create con nombre no-string → falla', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-x'), proveedorCompleto({ nombre: 42 })),
    );
  });

  it('create con nombre de 121 caracteres (supera el máximo) → falla', async () => {
    await assertFails(
      setDoc(
        doc(db(ADMIN), 'proveedores', 'prov-x'),
        proveedorCompleto({ nombre: 'a'.repeat(121) }),
      ),
    );
  });

  it('create con nombre vacío → falla', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-x'), proveedorCompleto({ nombre: '' })),
    );
  });

  it('create con activo no-bool → falla', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-x'), proveedorCompleto({ activo: 'si' })),
    );
  });

  it('create con activo: false → falla (el alta nace siempre activa)', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-x'), proveedorCompleto({ activo: false })),
    );
  });

  it('update que cambia fechaAlta → falla (inmutable)', async () => {
    await assertFails(updateDoc(doc(db(ADMIN), 'proveedores', 'prov-1'), { fechaAlta: new Date() }));
  });

  it('create con fechaAlta: Date.now() falla', async () => {
    // `Date.now()` devuelve un número; la regla exige `fechaAlta is timestamp`.
    // Este test fija que el SDK siempre convierte con `new Date()`, no `Date.now()`.
    await assertFails(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-fecha-mala'), {
        nombre: 'Test',
        fechaAlta: Date.now(),
        activo: true,
      }),
    );
  });

  it('create con pagos no-lista → falla', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-x'), proveedorCompleto({ pagos: 'x' })),
    );
  });

  it('create con pagos: ["basura"] (elemento no-mapa) → falla', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-x'), proveedorCompleto({ pagos: ['basura'] })),
    );
  });

  it('create con pago sin cuenta → falla', async () => {
    await assertFails(
      setDoc(
        doc(db(ADMIN), 'proveedores', 'prov-x'),
        proveedorCompleto({ pagos: [{ banco: 'BROU' }] }),
      ),
    );
  });

  it('create con pago con banco vacío falla', async () => {
    // La regla exige `p.banco.size() >= 1`: banco vacío viola la restricción.
    await assertFails(
      setDoc(
        doc(db(ADMIN), 'proveedores', 'prov-banco-vacio'),
        proveedorCompleto({ pagos: [{ banco: '', cuenta: '123456' }] }),
      ),
    );
  });

  it('create con pago con clave desconocida → falla', async () => {
    await assertFails(
      setDoc(
        doc(db(ADMIN), 'proveedores', 'prov-x'),
        proveedorCompleto({ pagos: [{ banco: 'BROU', cuenta: '001', extra: 1 }] }),
      ),
    );
  });

  it('create con 11 cuentas de pago (supera el máximo) → falla', async () => {
    const pagos = Array.from({ length: 11 }, (_, i) => ({ banco: 'Banco', cuenta: `cta-${i}` }));
    await assertFails(setDoc(doc(db(ADMIN), 'proveedores', 'prov-x'), proveedorCompleto({ pagos })));
  });
});

describe('movimientos (inmutables)', () => {
  it('vendedor crea movimiento a su nombre', async () => {
    await assertSucceeds(
      addDoc(collection(db(VENDEDOR), 'movimientos'), movimientoValido(VENDEDOR)),
    );
  });

  it('vendedor NO crea movimiento a nombre ajeno', async () => {
    await assertFails(
      addDoc(collection(db(VENDEDOR), 'movimientos'), movimientoValido(ADMIN)),
    );
  });

  it('nadie actualiza movimientos', async () => {
    await assertFails(updateDoc(doc(db(ADMIN), 'movimientos', 'mov-1'), { nota: 'editado' }));
  });

  it('nadie borra movimientos', async () => {
    await assertFails(deleteDoc(doc(db(ADMIN), 'movimientos', 'mov-1')));
  });
});

describe('compras (solo admin, borrador → confirmada)', () => {
  it('vendedor NO crea compras', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'compras', 'compra-x'), compraSeed('borrador')),
    );
  });

  it('vendedor NO lee compras', async () => {
    await assertFails(getDoc(doc(db(VENDEDOR), 'compras', 'compra-1')));
  });

  it('admin lee compras', async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN), 'compras', 'compra-1')));
  });

  it('admin crea una compra en borrador', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'compras', 'compra-x'), compraSeed('borrador')),
    );
  });

  it('admin NO crea una compra directamente en confirmada (debe nacer borrador)', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'compras', 'compra-x'), compraSeed('confirmada')),
    );
  });

  it('admin edita un borrador (borrador → borrador)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'compras', 'compra-1'), { totalFacturaCents: 50000 }),
    );
  });

  it('admin confirma un borrador (borrador → confirmada)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'compras', 'compra-1'), { estado: 'confirmada' }),
    );
  });

  it('una compra confirmada es inmutable (no se puede editar ningún campo)', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'compras', 'compra-conf'), { totalFacturaCents: 50000 }),
    );
  });

  it('una compra confirmada no puede volver a borrador', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'compras', 'compra-conf'), { estado: 'borrador' }),
    );
  });

  it('admin borra un borrador pero NO una confirmada', async () => {
    await assertSucceeds(deleteDoc(doc(db(ADMIN), 'compras', 'compra-1')));
    await assertFails(deleteDoc(doc(db(ADMIN), 'compras', 'compra-conf')));
  });

  it('vendedor NO borra compras', async () => {
    await assertFails(deleteDoc(doc(db(VENDEDOR), 'compras', 'compra-1')));
  });
});

describe('configuracion', () => {
  it('vendedor lee configuración', async () => {
    await assertSucceeds(getDoc(doc(db(VENDEDOR), 'configuracion', 'general')));
  });

  it('vendedor NO modifica configuración', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'configuracion', 'general'), { umbralPiezaAgotadaGramos: 10 }),
    );
  });

  it('admin modifica configuración', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { umbralPiezaAgotadaGramos: 10 }),
    );
  });

  // `general` tiene shape estricto = SUPERSET de claves conocidas (docs 02/03/08),
  // todas opcionales y validadas por tipo/rango. El merge no destructivo del kit
  // deja que un update toque una sola clave.
  it('admin puede agregar codigoPaisDefault a general sin perder la config previa', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), {
        codigoPaisDefault: '598',
        nombreNegocio: 'Quesarte',
      }),
    );
  });

  it('admin acepta cada clave conocida con tipo correcto', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { nombreNegocio: 'Nueva Quesería' }),
    );
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { umbralPiezaAgotadaGramos: 25 }),
    );
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { metodoProrrateo: 'por_peso' }),
    );
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { codigoPaisDefault: '54' }),
    );
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { diasAvisoVencimiento: 14 }),
    );
  });

  // `diasAvisoVencimiento` (tarea B3): la clave que habilita las alertas de
  // vencimiento configurables. Sin su entrada en `configuracionGeneralValida`,
  // el guardado pasa todos los tests de UI y falla SOLO en producción, que es
  // exactamente lo que estos casos existen para impedir.
  it('admin guarda diasAvisoVencimiento en los extremos del rango', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { diasAvisoVencimiento: 1 }),
    );
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { diasAvisoVencimiento: 90 }),
    );
  });

  it('vendedor NO guarda diasAvisoVencimiento', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'configuracion', 'general'), { diasAvisoVencimiento: 14 }),
    );
  });

  it('admin NO pone diasAvisoVencimiento en 0 (avisaría el día del vencimiento)', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { diasAvisoVencimiento: 0 }),
    );
  });

  it('admin NO pone diasAvisoVencimiento negativo', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { diasAvisoVencimiento: -3 }),
    );
  });

  it('admin NO pone diasAvisoVencimiento por encima del máximo', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { diasAvisoVencimiento: 91 }),
    );
  });

  it('admin NO pone diasAvisoVencimiento float (rompería el conteo de días)', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { diasAvisoVencimiento: 7.5 }),
    );
  });

  it('admin NO pone diasAvisoVencimiento como texto', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { diasAvisoVencimiento: '14' }),
    );
  });

  it('admin NO agrega una clave desconocida a general', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { colorTema: 'rojo' }),
    );
  });

  it('admin NO pone umbralPiezaAgotadaGramos negativo', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { umbralPiezaAgotadaGramos: -5 }),
    );
  });

  it('admin NO pone umbralPiezaAgotadaGramos float (no entero)', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { umbralPiezaAgotadaGramos: 5.5 }),
    );
  });

  it('admin NO pone metodoProrrateo fuera de la unión', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { metodoProrrateo: 'por_capricho' }),
    );
  });

  it('admin NO pone nombreNegocio de más de 80 caracteres', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { nombreNegocio: 'x'.repeat(81) }),
    );
  });

  it('admin NO pone codigoPaisDefault con letras', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { codigoPaisDefault: '59A' }),
    );
  });

  it('admin NO pone codigoPaisDefault de más de 4 dígitos', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), { codigoPaisDefault: '12345' }),
    );
  });
});

describe('configuracion/plantillasWhatsApp (doc 08, solo admin, shape estricto)', () => {
  it('admin escribe una lista de plantillas válida', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'configuracion', 'plantillasWhatsApp'), plantillasWaDoc()),
    );
  });

  it('admin escribe una lista vacía (deja sin plantillas)', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'configuracion', 'plantillasWhatsApp'), plantillasWaDoc([])),
    );
  });

  it('vendedor NO escribe plantillas', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'configuracion', 'plantillasWhatsApp'), plantillasWaDoc()),
    );
  });

  it('vendedor SÍ lee plantillas (usuario activo)', async () => {
    await assertSucceeds(getDoc(doc(db(VENDEDOR), 'configuracion', 'plantillasWhatsApp')));
  });

  it('admin NO escribe el doc con una clave de más (fuera de {plantillas})', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'plantillasWhatsApp'), {
        plantillas: [plantillaWa()],
        otra: 1,
      }),
    );
  });

  it('admin NO escribe una plantilla con contexto inválido', async () => {
    await assertFails(
      setDoc(
        doc(db(ADMIN), 'configuracion', 'plantillasWhatsApp'),
        plantillasWaDoc([plantillaWa({ contexto: 'promo' })]),
      ),
    );
  });

  it('admin NO escribe una plantilla con una clave de más', async () => {
    await assertFails(
      setDoc(
        doc(db(ADMIN), 'configuracion', 'plantillasWhatsApp'),
        plantillasWaDoc([plantillaWa({ color: 'rojo' })]),
      ),
    );
  });

  it('admin NO escribe una plantilla con id vacío', async () => {
    await assertFails(
      setDoc(
        doc(db(ADMIN), 'configuracion', 'plantillasWhatsApp'),
        plantillasWaDoc([plantillaWa({ id: '' })]),
      ),
    );
  });

  it('admin NO escribe más de 20 plantillas', async () => {
    const muchas = Array.from({ length: 21 }, (_, i) => plantillaWa({ id: `p${i}` }));
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'plantillasWhatsApp'), plantillasWaDoc(muchas)),
    );
  });

  it('admin NO escribe si plantillas no es lista', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'plantillasWhatsApp'), { plantillas: 'nop' }),
    );
  });
});

describe('configuracion/tema (doc 06 §4, tanda TM, semilla del tema del negocio)', () => {
  it('admin crea un tema válido', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), temaSemilla({ matiz: 42, tinte: 'neutro' })),
    );
  });

  it('admin actualiza un tema existente con valores válidos', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), temaSemilla({ matiz: 0, tinte: 'frio' })),
    );
  });

  it('admin acepta matiz 359 (borde superior incluido)', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), temaSemilla({ matiz: 359 })),
    );
  });

  it('admin borra el tema (Restablecer = borrar el doc)', async () => {
    await assertSucceeds(deleteDoc(doc(db(ADMIN), 'configuracion', 'tema')));
  });

  it('vendedor SÍ lee el tema (usuario activo)', async () => {
    await assertSucceeds(getDoc(doc(db(VENDEDOR), 'configuracion', 'tema')));
  });

  it('vendedor NO crea el tema', async () => {
    await assertFails(setDoc(doc(db(VENDEDOR), 'configuracion', 'tema'), temaSemilla()));
  });

  it('vendedor NO actualiza el tema', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'configuracion', 'tema'), { matiz: 10 }),
    );
  });

  it('vendedor NO borra el tema', async () => {
    await assertFails(deleteDoc(doc(db(VENDEDOR), 'configuracion', 'tema')));
  });

  it('no autenticado NO escribe el tema', async () => {
    await assertFails(setDoc(doc(db(), 'configuracion', 'tema'), temaSemilla()));
  });

  it('usuario inactivo NO escribe el tema', async () => {
    await assertFails(setDoc(doc(db(INACTIVO), 'configuracion', 'tema'), temaSemilla()));
  });

  it('admin NO escribe matiz -1 (fuera de rango inferior)', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), temaSemilla({ matiz: -1 })),
    );
  });

  it('admin NO escribe matiz 360 (fuera de rango superior)', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), temaSemilla({ matiz: 360 })),
    );
  });

  it('admin NO escribe matiz como string', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), temaSemilla({ matiz: '200' })),
    );
  });

  // La regla exige matiz ENTERO: es el backstop de la cuantización client-side. El
  // motor `generarPaleta` (§7) verifica AA exhaustivamente solo sobre matices enteros
  // (espacio finito 360 × 3), así que un float queda fuera del espacio probado.
  it('admin NO escribe matiz float (no entero)', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), temaSemilla({ matiz: 78.5 })),
    );
  });

  it('admin NO escribe tinte fuera de la unión', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), temaSemilla({ tinte: 'pastel' })),
    );
  });

  it('admin NO escribe version 2', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), temaSemilla({ version: 2 })),
    );
  });

  it('admin NO escribe una clave de más', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), temaSemilla({ extra: 'x' })),
    );
  });

  it('admin NO escribe si falta una clave (matiz ausente)', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'configuracion', 'tema'), { version: 1, tinte: 'neutro' }),
    );
  });
});
