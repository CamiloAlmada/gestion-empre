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

// Doc `configuracion/plantillasWhatsApp` con la lista dada (default: una válida).
function plantillasWaDoc(plantillas: unknown[] = [plantillaWa()]) {
  return { plantillas };
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
    await setDoc(doc(seed, 'categorias', 'cat-quesos'), { nombre: 'Quesos', orden: 0 });
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
    // Cliente con historial (stats no en cero) para probar los updates.
    await setDoc(doc(seed, 'clientes', 'cli-1'), {
      nombre: 'Marta',
      telefono: '099111222',
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
      fechaAlta: Date.now(),
      activo: true,
    });
    await setDoc(doc(seed, 'configuracion', 'general'), {
      nombreNegocio: 'Quesarte',
      umbralPiezaAgotadaGramos: 50,
    });
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
    await assertSucceeds(getDoc(doc(db(VENDEDOR), 'categorias', 'cat-quesos')));
  });

  it('vendedor NO crea categorías', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'categorias', 'cat-x'), { nombre: 'Miel', orden: 1 }),
    );
  });

  it('vendedor NO edita categorías', async () => {
    await assertFails(
      updateDoc(doc(db(VENDEDOR), 'categorias', 'cat-quesos'), { nombre: 'Otros' }),
    );
  });

  it('admin crea categoría con shape válido', async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'categorias', 'cat-miel'), { nombre: 'Miel', orden: 1 }),
    );
  });

  it('admin renombra (update solo nombre)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'categorias', 'cat-quesos'), { nombre: 'Quesos artesanales' }),
    );
  });

  it('admin reordena (update solo orden)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'categorias', 'cat-quesos'), { orden: 5 }),
    );
  });

  it('nadie borra categorías (ni el admin)', async () => {
    await assertFails(deleteDoc(doc(db(ADMIN), 'categorias', 'cat-quesos')));
  });

  it('admin NO crea con nombre vacío', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'categorias', 'cat-x'), { nombre: '', orden: 1 }),
    );
  });

  it('admin NO crea con orden negativo', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'categorias', 'cat-x'), { nombre: 'Miel', orden: -1 }),
    );
  });

  it('admin NO crea con orden float', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'categorias', 'cat-x'), { nombre: 'Miel', orden: 1.5 }),
    );
  });

  it('admin NO crea con clave extra', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'categorias', 'cat-x'), { nombre: 'Miel', orden: 1, color: 'rojo' }),
    );
  });

  it('admin NO agrega una clave extra en un update', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'categorias', 'cat-quesos'), { color: 'rojo' }),
    );
  });

  it('admin NO deja el nombre vacío en un update', async () => {
    await assertFails(updateDoc(doc(db(ADMIN), 'categorias', 'cat-quesos'), { nombre: '' }));
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

  it('nadie borra clientes (ni el admin)', async () => {
    await assertFails(deleteDoc(doc(db(ADMIN), 'clientes', 'cli-1')));
  });
});

describe('proveedores (solo admin)', () => {
  it('vendedor NO lee proveedores (criterio de aceptación doc 07)', async () => {
    await assertFails(getDoc(doc(db(VENDEDOR), 'proveedores', 'prov-1')));
  });

  it('vendedor NO crea proveedores', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'proveedores', 'prov-x'), {
        nombre: 'X',
        fechaAlta: Date.now(),
        activo: true,
      }),
    );
  });

  it('admin lee y crea proveedores', async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN), 'proveedores', 'prov-1')));
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'proveedores', 'prov-x'), {
        nombre: 'Nuevo proveedor',
        fechaAlta: Date.now(),
        activo: true,
      }),
    );
  });

  it('admin actualiza proveedores', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'proveedores', 'prov-1'), { telefono: '099999999' }),
    );
  });

  it('nadie borra proveedores (ni el admin)', async () => {
    await assertFails(deleteDoc(doc(db(ADMIN), 'proveedores', 'prov-1')));
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

  // `general` mantiene la config viva de Fase 2 (WA-B no la endureció; ver reporte):
  // el admin puede seguir agregando/tocando esas claves.
  it('admin puede agregar codigoPaisDefault a general sin perder la config previa', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'configuracion', 'general'), {
        codigoPaisDefault: '598',
        nombreNegocio: 'Quesarte',
      }),
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
