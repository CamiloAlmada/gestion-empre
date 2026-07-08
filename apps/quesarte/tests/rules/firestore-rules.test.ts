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
    await setDoc(doc(seed, 'compras', 'compra-1'), { proveedor: 'X', totalCents: 100000 });
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

describe('compras (solo admin)', () => {
  it('vendedor NO crea compras', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'compras', 'compra-x'), { proveedor: 'Y', totalCents: 1 }),
    );
  });

  it('vendedor NO lee compras', async () => {
    await assertFails(getDoc(doc(db(VENDEDOR), 'compras', 'compra-1')));
  });

  it('admin lee y crea compras', async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN), 'compras', 'compra-1')));
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'compras', 'compra-x'), { proveedor: 'Y', totalCents: 1 }),
    );
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
});
