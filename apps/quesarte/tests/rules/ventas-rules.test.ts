import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, increment, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { money, peso, type Pieza, type Producto, type Venta } from '@gestion/core';
import {
  anularVenta,
  registrarVenta,
  ventaConverter,
  type EntradaVenta,
} from '@gestion/firebase-kit';

// Suite de integración de las escrituras del POS (tarea B4) contra el emulador
// CON LAS REGLAS REALES. A diferencia de la unitaria (mocks de writeBatch), acá
// se ejerce `registrarVenta`/`anularVenta` sobre Firestore real para probar que
// los efectos atómicos PASAN (o son RECHAZADOS) por `firestore.rules`. Es la
// evidencia del criterio "bloqueado por reglas, no solo por la UI".
//
// De paso verifica la premisa de diseño del increment: como el vendedor solo
// puede escribir con `increment()` un valor RESULTANTE >= 0, un batch crudo que
// underflowea es rechazado ⇒ las reglas evalúan el valor post-increment en
// `request.resource.data` (no el delta).

const PROJECT_ID = 'demo-quesarte';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(HERE, '../../firestore.rules');

const ADMIN = 'admin-uid';
const VENDEDOR = 'vend-uid';

let testEnv: RulesTestEnvironment;

function db(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore();
}

// ── Factories de dominio para armar las entradas de registrarVenta ──────────

function producto(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'cat',
    modoPrecio: 'por_kg',
    precioVentaCents: money(45000),
    costoPromedioCents: money(30000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function pieza(over: Partial<Pieza> & Pick<Pieza, 'id' | 'productoId'>): Pieza {
  return {
    pesoInicialGramos: peso(5000),
    pesoRestanteGramos: peso(4000),
    costoKgCents: money(30000),
    fechaIngreso: new Date('2026-01-01'),
    estado: 'disponible',
    ...over,
  };
}

// Productos y piezas de los 4 modoStock.
const PROD_GRANEL = producto({ id: 'prod-granel', modoStock: 'granel', stockGranelGramos: peso(10000) });
const PROD_UNIDAD = producto({
  id: 'prod-unidad',
  modoPrecio: 'por_unidad',
  modoStock: 'unidad_simple',
  precioVentaCents: money(15000),
  stockUnidades: 20,
});
const PROD_FRAC = producto({ id: 'prod-frac', modoStock: 'fraccionado_por_pieza' });
const PROD_ENTERA = producto({ id: 'prod-entera', modoStock: 'pieza_entera' });
const PZ_FRAC = pieza({ id: 'pz-frac', productoId: 'prod-frac', pesoRestanteGramos: peso(4000) });
const PZ_ENTERA = pieza({ id: 'pz-entera', productoId: 'prod-entera', pesoRestanteGramos: peso(1500) });

function ventaGranel(): EntradaVenta {
  return {
    usuarioId: VENDEDOR,
    medioPago: 'efectivo',
    items: [
      { producto: PROD_GRANEL, gramos: peso(100), precioUnitCents: money(45000), subtotalCents: money(4500) },
    ],
    totalCents: money(4500),
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
    // Productos de los 4 modoStock (actualizadoEn como número: irrelevante a las
    // reglas, que solo miran el valor resultante del stock).
    await setDoc(doc(seed, 'productos', 'prod-granel'), {
      nombre: 'Nuez',
      categoria: 'frutos_secos',
      modoPrecio: 'por_kg',
      modoStock: 'granel',
      precioVentaCents: 45000,
      costoPromedioCents: 30000,
      stockGranelGramos: 10000,
      activo: true,
      actualizadoEn: Date.now(),
    });
    await setDoc(doc(seed, 'productos', 'prod-unidad'), {
      nombre: 'Miel',
      categoria: 'miel',
      modoPrecio: 'por_unidad',
      modoStock: 'unidad_simple',
      precioVentaCents: 15000,
      costoPromedioCents: 9000,
      stockUnidades: 20,
      activo: true,
      actualizadoEn: Date.now(),
    });
    await setDoc(doc(seed, 'productos', 'prod-frac'), {
      nombre: 'Colonia',
      categoria: 'quesos',
      modoPrecio: 'por_kg',
      modoStock: 'fraccionado_por_pieza',
      precioVentaCents: 45000,
      costoPromedioCents: 30000,
      activo: true,
      actualizadoEn: Date.now(),
    });
    await setDoc(doc(seed, 'productos', 'prod-entera'), {
      nombre: 'Salame',
      categoria: 'embutidos',
      modoPrecio: 'por_kg',
      modoStock: 'pieza_entera',
      precioVentaCents: 45000,
      costoPromedioCents: 30000,
      activo: true,
      actualizadoEn: Date.now(),
    });
    await setDoc(doc(seed, 'piezas', 'pz-frac'), {
      productoId: 'prod-frac',
      pesoInicialGramos: 5000,
      pesoRestanteGramos: 4000,
      costoKgCents: 30000,
      fechaIngreso: Date.now(),
      estado: 'disponible',
    });
    await setDoc(doc(seed, 'piezas', 'pz-entera'), {
      productoId: 'prod-entera',
      pesoInicialGramos: 1500,
      pesoRestanteGramos: 1500,
      costoKgCents: 30000,
      fechaIngreso: Date.now(),
      estado: 'disponible',
    });
    // Cliente sin historial (stats en cero) para probar la asociación en la venta.
    await setDoc(doc(seed, 'clientes', 'cli-1'), {
      nombre: 'Marta',
      fechaAlta: Date.now(),
      activo: true,
      stats: { cantidadVentas: 0, totalHistoricoCents: 0 },
    });
  });
});

describe('registrarVenta pasa las reglas como vendedor (4 modoStock)', () => {
  it('granel', async () => {
    await assertSucceeds(registrarVenta(db(VENDEDOR), ventaGranel()));
    const snap = await getDoc(doc(db(ADMIN), 'productos', 'prod-granel'));
    expect(snap.data()?.stockGranelGramos).toBe(9900);
  });

  it('unidad_simple', async () => {
    const entrada: EntradaVenta = {
      usuarioId: VENDEDOR,
      medioPago: 'debito',
      items: [
        { producto: PROD_UNIDAD, unidades: 3, precioUnitCents: money(15000), subtotalCents: money(45000) },
      ],
      totalCents: money(45000),
    };
    await assertSucceeds(registrarVenta(db(VENDEDOR), entrada));
    const snap = await getDoc(doc(db(ADMIN), 'productos', 'prod-unidad'));
    expect(snap.data()?.stockUnidades).toBe(17);
  });

  it('fraccionado_por_pieza', async () => {
    const entrada: EntradaVenta = {
      usuarioId: VENDEDOR,
      medioPago: 'efectivo',
      items: [
        {
          producto: PROD_FRAC,
          pieza: PZ_FRAC,
          gramos: peso(350),
          precioUnitCents: money(45000),
          subtotalCents: money(15750),
        },
      ],
      totalCents: money(15750),
    };
    await assertSucceeds(registrarVenta(db(VENDEDOR), entrada));
    const snap = await getDoc(doc(db(ADMIN), 'piezas', 'pz-frac'));
    expect(snap.data()?.pesoRestanteGramos).toBe(3650);
    expect(snap.data()?.estado).toBe('disponible');
  });

  it('pieza_entera (consume la pieza y la marca agotada)', async () => {
    const entrada: EntradaVenta = {
      usuarioId: VENDEDOR,
      medioPago: 'efectivo',
      items: [
        {
          producto: PROD_ENTERA,
          pieza: PZ_ENTERA,
          precioUnitCents: money(45000),
          subtotalCents: money(6750),
        },
      ],
      totalCents: money(6750),
    };
    await assertSucceeds(registrarVenta(db(VENDEDOR), entrada));
    const snap = await getDoc(doc(db(ADMIN), 'piezas', 'pz-entera'));
    expect(snap.data()?.pesoRestanteGramos).toBe(0);
    expect(snap.data()?.estado).toBe('agotada');
  });
});

describe('las reglas bloquean lo que la UI no debería mandar', () => {
  it('un batch que cuela un cambio de precioVentaCents es rechazado', async () => {
    // Batch crudo (no registrarVenta) que arma una venta válida PERO además toca
    // el precio del producto: la regla de productos para vendedor lo rechaza y,
    // por atomicidad, cae todo el batch.
    const vend = db(VENDEDOR);
    const batch = writeBatch(vend);
    batch.set(doc(vend, 'ventas', 'venta-colada'), {
      numero: Date.now(),
      fecha: Date.now(),
      usuarioId: VENDEDOR,
      items: [{ productoId: 'prod-granel', gramos: 100, precioUnitCents: 45000, subtotalCents: 4500 }],
      totalCents: 4500,
      medioPago: 'efectivo',
      estado: 'completada',
    });
    batch.update(doc(vend, 'productos', 'prod-granel'), {
      stockGranelGramos: increment(-100),
      precioVentaCents: 40000,
    });
    await assertFails(batch.commit());
  });

  it('increment que dejaría el stock granel bajo 0 es rechazado (piso cero)', async () => {
    // Decremento válido en dirección (<=) pero que underflowea: solo la regla
    // nueva de piso cero lo puede frenar ⇒ evalúa el valor resultante del
    // increment en request.resource.data.
    const vend = db(VENDEDOR);
    await assertFails(
      setDoc(doc(vend, 'productos', 'prod-granel'), { stockGranelGramos: increment(-99999) }, { merge: true }),
    );
  });

  it('increment que dejaría el peso de la pieza bajo 0 es rechazado (piso cero)', async () => {
    const vend = db(VENDEDOR);
    await assertFails(
      setDoc(doc(vend, 'piezas', 'pz-frac'), { pesoRestanteGramos: increment(-99999) }, { merge: true }),
    );
  });

  it('un decremento válido (sin underflow) sigue pasando', async () => {
    const vend = db(VENDEDOR);
    await assertSucceeds(
      setDoc(doc(vend, 'piezas', 'pz-frac'), { pesoRestanteGramos: increment(-100) }, { merge: true }),
    );
  });
});

describe('registrarVenta con cliente actualiza stats en el mismo batch (vendedor)', () => {
  function ventaGranelConCliente(esPrimeraCompra: boolean): EntradaVenta {
    return {
      ...ventaGranel(),
      cliente: { id: 'cli-1', nombre: 'Marta', esPrimeraCompra },
    };
  }

  it('el vendedor asocia el cliente y suma stats (increment) en un solo batch', async () => {
    await assertSucceeds(registrarVenta(db(VENDEDOR), ventaGranelConCliente(true)));

    const cli = await getDoc(doc(db(ADMIN), 'clientes', 'cli-1'));
    expect(cli.data()?.stats.cantidadVentas).toBe(1);
    expect(cli.data()?.stats.totalHistoricoCents).toBe(4500);
    expect(cli.data()?.stats.primeraCompra).toBeDefined();
    expect(cli.data()?.stats.ultimaCompra).toBeDefined();
  });

  it('la anulación (admin) revierte los contadores del cliente en un solo batch', async () => {
    const { ventaId } = await registrarVenta(db(VENDEDOR), ventaGranelConCliente(false));
    // Tras la venta: cantidadVentas 1, total 4500.
    const trasVenta = await getDoc(doc(db(ADMIN), 'clientes', 'cli-1'));
    expect(trasVenta.data()?.stats.cantidadVentas).toBe(1);

    const ventaSnap = await getDoc(doc(db(ADMIN), 'ventas', ventaId).withConverter(ventaConverter));
    const venta = ventaSnap.data();
    if (venta === undefined) throw new Error('la venta recién registrada no se encontró');
    await assertSucceeds(anularVenta(db(ADMIN), venta, ADMIN));

    const trasAnular = await getDoc(doc(db(ADMIN), 'clientes', 'cli-1'));
    expect(trasAnular.data()?.stats.cantidadVentas).toBe(0);
    expect(trasAnular.data()?.stats.totalHistoricoCents).toBe(0);
  });
});

describe('anularVenta', () => {
  async function registrarGranel(): Promise<Venta> {
    const { ventaId } = await registrarVenta(db(VENDEDOR), ventaGranel());
    const snap = await getDoc(doc(db(ADMIN), 'ventas', ventaId).withConverter(ventaConverter));
    const venta = snap.data();
    if (venta === undefined) throw new Error('la venta recién registrada no se encontró');
    return venta;
  }

  it('el vendedor NO puede anular (rechazado por reglas)', async () => {
    const venta = await registrarGranel();
    await assertFails(anularVenta(db(VENDEDOR), venta, VENDEDOR));
  });

  it('el admin anula y restaura el stock', async () => {
    const venta = await registrarGranel();
    // Tras la venta el stock quedó en 9900.
    const antes = await getDoc(doc(db(ADMIN), 'productos', 'prod-granel'));
    expect(antes.data()?.stockGranelGramos).toBe(9900);

    await assertSucceeds(anularVenta(db(ADMIN), venta, ADMIN));

    const despues = await getDoc(doc(db(ADMIN), 'productos', 'prod-granel'));
    expect(despues.data()?.stockGranelGramos).toBe(10000);
    const ventaAnulada = await getDoc(doc(db(ADMIN), 'ventas', venta.id));
    expect(ventaAnulada.data()?.estado).toBe('anulada');
  });
});
