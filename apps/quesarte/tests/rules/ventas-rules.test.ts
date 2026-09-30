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
  doc,
  getDoc,
  increment,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { money, peso, type Pieza, type Producto, type Venta } from '@gestion/core';
import {
  anularVenta,
  deshacerUltimoPago,
  registrarPago,
  registrarPagos,
  registrarVenta,
  ventaConverter,
  type DatosRegistroPago,
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
// `compraId` presente: es el caso real (las piezas nacen de una compra) y es lo
// que el costeo congelado copia al ítem de venta.
const PZ_FRAC = pieza({
  id: 'pz-frac',
  productoId: 'prod-frac',
  pesoRestanteGramos: peso(4000),
  compraId: 'compra-7',
});
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
      compraId: 'compra-7',
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

describe('el costo congelado pasa las reglas y queda persistido en la venta', () => {
  // El create de `ventas` valida `items is list` y nada del shape interno, así que
  // el mapa `costeo` NO exigió tocar `firestore.rules`. Estos tests son la
  // evidencia: el vendedor escribe el mapa y el doc queda con el costo adentro.
  async function itemsPersistidos(ventaId: string): Promise<Record<string, unknown>[]> {
    const snap = await getDoc(doc(db(ADMIN), 'ventas', ventaId));
    return snap.data()?.items as Record<string, unknown>[];
  }

  it('por pieza: el vendedor persiste costo real, unitario y compra de origen', async () => {
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
    const { ventaId } = await assertSucceeds(registrarVenta(db(VENDEDOR), entrada));

    const items = await itemsPersistidos(ventaId);
    expect(items[0]?.costeo).toEqual({
      v: 1,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: 30000,
      costoItemCents: 10500,
      compraId: 'compra-7',
    });
  });

  it('producto sin base de costo: persiste sin_costo, sin montos', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'productos', 'prod-sin-costo'), {
        nombre: 'Regalo',
        categoria: 'frutos_secos',
        modoPrecio: 'por_kg',
        modoStock: 'granel',
        precioVentaCents: 45000,
        costoPromedioCents: 0,
        stockGranelGramos: 10000,
        activo: true,
        actualizadoEn: Date.now(),
      });
    });
    const entrada: EntradaVenta = {
      usuarioId: VENDEDOR,
      medioPago: 'efectivo',
      items: [
        {
          producto: producto({
            id: 'prod-sin-costo',
            modoStock: 'granel',
            costoPromedioCents: money(0),
            stockGranelGramos: peso(10000),
          }),
          gramos: peso(100),
          precioUnitCents: money(45000),
          subtotalCents: money(4500),
        },
      ],
      totalCents: money(4500),
    };
    const { ventaId } = await assertSucceeds(registrarVenta(db(VENDEDOR), entrada));

    const items = await itemsPersistidos(ventaId);
    expect(items[0]?.costeo).toEqual({ v: 1, fuente: 'sin_costo', origen: 'venta' });
  });

  it('la anulación de una venta con costeo sigue pasando (solo cambia estado)', async () => {
    const { ventaId } = await registrarVenta(db(VENDEDOR), ventaGranel());
    const snap = await getDoc(doc(db(ADMIN), 'ventas', ventaId).withConverter(ventaConverter));
    const venta = snap.data();
    if (venta === undefined) throw new Error('la venta recién registrada no se encontró');
    expect(venta.items[0]?.costeo?.fuente).toBe('promedio');

    await assertSucceeds(anularVenta(db(ADMIN), venta, ADMIN));

    const anulada = await getDoc(doc(db(ADMIN), 'ventas', ventaId));
    expect(anulada.data()?.estado).toBe('anulada');
    // El costo congelado sobrevive intacto a la anulación.
    const items = await itemsPersistidos(ventaId);
    expect(items[0]?.costeo).toMatchObject({ fuente: 'promedio', costoItemCents: 3000 });
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

// ── Cobros diferidos (docs/11-cobros-diferidos.md, tareas A2 + A3) ──────────
//
// Dos tipos de caso: los ✓ pasan por las funciones REALES del kit
// (`registrarVenta`, `registrarPago`, `registrarPagos`, `deshacerUltimoPago`),
// que es lo que la app manda; los ✗ son writes crudos que el kit nunca armaría,
// para probar que la regla los frena por sí sola.

const TOTAL_AC = 10000;

interface PagoCrudo {
  id: string;
  fecha: Date | string;
  registradoEn: Date;
  montoCents: number;
  medioPago: string;
  usuarioId: string;
  referencia?: string;
}

function pagoCrudo(id: string, montoCents: number, minuto: number, usuarioId = ADMIN): PagoCrudo {
  return {
    id,
    fecha: new Date(Date.UTC(2026, 8, 30, 12, minuto)),
    registradoEn: new Date(Date.UTC(2026, 8, 30, 12, minuto, 30)),
    montoCents,
    medioPago: 'transferencia',
    usuarioId,
  };
}

function cobroCrudo(pagos: PagoCrudo[], cobradoCents: number, estado?: string) {
  return {
    v: 1,
    estado: estado ?? (cobradoCents === TOTAL_AC ? 'cobrada' : 'pendiente'),
    cobradoCents,
    pagos,
  };
}

// Pagos previos sembrados. `B` y `C` tienen el mismo monto a propósito: así
// "deshacer el del medio" deja la aritmética válida y SOLO el espejo lo frena.
const PA = pagoCrudo('p-a', 2000, 1);
const PB = pagoCrudo('p-b', 2500, 2);
const PC = pagoCrudo('p-c', 2500, 3);
const PNUEVO = pagoCrudo('p-nuevo', 1000, 10);

function ventaACobrarCruda(usuarioId: string, cobro: unknown = cobroCrudo([], 0)) {
  return {
    numero: Date.now(),
    fecha: new Date(),
    usuarioId,
    items: [{ productoId: 'prod-granel', gramos: 100, precioUnitCents: 45000, subtotalCents: TOTAL_AC }],
    totalCents: TOTAL_AC,
    medioPago: 'a_cobrar',
    estado: 'completada',
    clienteId: 'cli-1',
    clienteNombre: 'Marta',
    cobro,
  };
}

/** Copia de `obj` sin las claves indicadas (para armar payloads a los que les falta algo). */
function sin(obj: Record<string, unknown>, ...claves: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !claves.includes(k)));
}

async function leerVenta(ventaId: string): Promise<Venta> {
  const snap = await getDoc(doc(db(ADMIN), 'ventas', ventaId).withConverter(ventaConverter));
  const venta = snap.data();
  if (venta === undefined) throw new Error(`venta ${ventaId} no encontrada`);
  return venta;
}

async function leerCobroCrudo(ventaId: string): Promise<Record<string, unknown>> {
  const snap = await getDoc(doc(db(ADMIN), 'ventas', ventaId));
  return snap.data()?.cobro as Record<string, unknown>;
}

function actualizarCobro(uid: string, ventaId: string, cobro: unknown): Promise<void> {
  return updateDoc(doc(db(uid), 'ventas', ventaId), { cobro });
}

function datosPago(over: Partial<DatosRegistroPago> = {}): DatosRegistroPago {
  return {
    montoCents: money(TOTAL_AC),
    medioPago: 'transferencia',
    fecha: new Date(Date.UTC(2026, 8, 30, 15)),
    referencia: 'OP-123',
    usuarioId: ADMIN,
    ...over,
  };
}

describe('cobros diferidos — create de la venta', () => {
  function ventaACobrarKit(): EntradaVenta {
    return {
      ...ventaGranel(),
      medioPago: 'a_cobrar',
      cliente: { id: 'cli-1', nombre: 'Marta', esPrimeraCompra: true },
    };
  }

  it('✓ el vendedor registra una venta a_cobrar con cliente (registrarVenta) y nace con cobroInicial', async () => {
    const { ventaId } = await assertSucceeds(registrarVenta(db(VENDEDOR), ventaACobrarKit()));
    expect(await leerCobroCrudo(ventaId)).toEqual({ v: 1, estado: 'pendiente', cobradoCents: 0, pagos: [] });
  });

  it('✓ una venta con medio real se persiste SIN cobro', async () => {
    const { ventaId } = await assertSucceeds(registrarVenta(db(VENDEDOR), ventaGranel()));
    const snap = await getDoc(doc(db(ADMIN), 'ventas', ventaId));
    expect(snap.data()).not.toHaveProperty('cobro');
  });

  it('✓ (control) el payload crudo a_cobrar completo pasa: los ✗ de abajo fallan por lo que les falta', async () => {
    await assertSucceeds(setDoc(doc(db(VENDEDOR), 'ventas', 'v-control'), ventaACobrarCruda(VENDEDOR)));
  });

  it('✗ a_cobrar sin cliente', async () => {
    const sinCliente = sin(ventaACobrarCruda(VENDEDOR), 'clienteId', 'clienteNombre');
    await assertFails(setDoc(doc(db(VENDEDOR), 'ventas', 'v-sin-cli'), sinCliente));
  });

  it('✗ create con cobro y medio real', async () => {
    await assertFails(
      setDoc(doc(db(VENDEDOR), 'ventas', 'v-real-cobro'), {
        ...ventaACobrarCruda(VENDEDOR),
        medioPago: 'efectivo',
      }),
    );
  });

  it('✗ a_cobrar sin cobro', async () => {
    const sinCobro = sin(ventaACobrarCruda(VENDEDOR), 'cobro');
    await assertFails(setDoc(doc(db(VENDEDOR), 'ventas', 'v-sin-cobro'), sinCobro));
  });

  it('✗ a_cobrar con un cobro distinto del valor inicial (nace con algo cobrado)', async () => {
    const venta = ventaACobrarCruda(VENDEDOR, cobroCrudo([pagoCrudo('p', 1000, 1, VENDEDOR)], 1000));
    await assertFails(setDoc(doc(db(VENDEDOR), 'ventas', 'v-cobro-no-inicial'), venta));
  });

  it('✗ medioPago fuera de la unión', async () => {
    const base = sin(ventaACobrarCruda(VENDEDOR), 'cobro');
    await assertFails(setDoc(doc(db(VENDEDOR), 'ventas', 'v-cheque'), { ...base, medioPago: 'cheque' }));
  });
});

describe('cobros diferidos — registrar pago y deshacer', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const seed = ctx.firestore();
      await setDoc(doc(seed, 'ventas', 'ac-vacia'), ventaACobrarCruda(VENDEDOR));
      await setDoc(doc(seed, 'ventas', 'ac-uno'), ventaACobrarCruda(VENDEDOR, cobroCrudo([PA], 2000)));
      await setDoc(doc(seed, 'ventas', 'ac-dos'), ventaACobrarCruda(VENDEDOR, cobroCrudo([PA, PB], 4500)));
      await setDoc(
        doc(seed, 'ventas', 'ac-tres'),
        ventaACobrarCruda(VENDEDOR, cobroCrudo([PA, PB, PC], 7000)),
      );
      await setDoc(doc(seed, 'ventas', 'ac-anulada'), {
        ...ventaACobrarCruda(VENDEDOR),
        estado: 'anulada',
      });
    });
  });

  // ── ✓ por el kit ──
  it('✓ admin registra el PRIMER pago sobre la lista vacía (registrarPago) y queda cobrada', async () => {
    await assertSucceeds(registrarPago(db(ADMIN), await leerVenta('ac-vacia'), datosPago()));
    const venta = await leerVenta('ac-vacia');
    expect(venta.cobro?.estado).toBe('cobrada');
    expect(venta.cobro?.pagos).toHaveLength(1);
  });

  it('✓ admin registra un pago con pagos previos (prefijo n >= 1, fechas ida y vuelta por Date)', async () => {
    await assertSucceeds(
      registrarPago(db(ADMIN), await leerVenta('ac-dos'), datosPago({ montoCents: money(1000) })),
    );
    // Y otro más encima del que acaba de escribir el kit.
    await assertSucceeds(
      registrarPago(db(ADMIN), await leerVenta('ac-dos'), datosPago({ montoCents: money(4500) })),
    );
    const venta = await leerVenta('ac-dos');
    expect(venta.cobro?.cobradoCents).toBe(TOTAL_AC);
    expect(venta.cobro?.estado).toBe('cobrada');
    expect(venta.cobro?.pagos).toHaveLength(4);
  });

  it('✓ registrarPagos: un batch que salda dos ventas, cada una por su saldo', async () => {
    const ventas = [await leerVenta('ac-vacia'), await leerVenta('ac-dos')];
    const { medioPago, fecha, referencia, usuarioId } = datosPago();
    await assertSucceeds(registrarPagos(db(ADMIN), ventas, { medioPago, fecha, referencia, usuarioId }));
    expect((await leerVenta('ac-vacia')).cobro?.estado).toBe('cobrada');
    expect((await leerVenta('ac-dos')).cobro?.estado).toBe('cobrada');
  });

  it('✓ admin deshace el último pago (deshacerUltimoPago)', async () => {
    await assertSucceeds(deshacerUltimoPago(db(ADMIN), await leerVenta('ac-tres')));
    const venta = await leerVenta('ac-tres');
    expect(venta.cobro?.pagos.map((p) => p.id)).toEqual(['p-a', 'p-b']);
    expect(venta.cobro?.cobradoCents).toBe(4500);
  });

  it('✓ admin deshace el ÚNICO pago (espejo con n == 0, guarda de [0:0])', async () => {
    await assertSucceeds(deshacerUltimoPago(db(ADMIN), await leerVenta('ac-uno')));
    expect(await leerCobroCrudo('ac-uno')).toEqual({ v: 1, estado: 'pendiente', cobradoCents: 0, pagos: [] });
  });

  it('✓ una venta a cobrar con pagos se sigue anulando (solo cambia estado)', async () => {
    await assertSucceeds(anularVenta(db(ADMIN), await leerVenta('ac-dos'), ADMIN));
  });

  // ── Controles: los writes crudos válidos pasan, así que cada ✗ de abajo falla
  // por lo único que cambia respecto de su control. ──
  it('✓ (control) append crudo válido sobre una lista de 2', async () => {
    await assertSucceeds(actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([PA, PB, PNUEVO], 5500)));
  });

  it('✓ (control) deshacer crudo válido (3 → 2)', async () => {
    await assertSucceeds(actualizarCobro(ADMIN, 'ac-tres', cobroCrudo([PA, PB], 4500)));
  });

  it('✓ (control) primer pago crudo sobre la venta sembrada vacía', async () => {
    await assertSucceeds(actualizarCobro(ADMIN, 'ac-vacia', cobroCrudo([pagoCrudo('p', 1000, 10)], 1000)));
  });

  // ── ✗ crudos ──
  it('✗ el vendedor registra un pago (por el kit, con su propio uid)', async () => {
    await assertFails(
      registrarPago(db(VENDEDOR), await leerVenta('ac-vacia'), datosPago({ usuarioId: VENDEDOR })),
    );
  });

  it('✗ usuarioId ajeno en el pago nuevo', async () => {
    const ajeno = pagoCrudo('p-ajeno', 1000, 10, VENDEDOR);
    await assertFails(actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([PA, PB, ajeno], 5500)));
  });

  it('✗ sobrepago (lo cobrado supera el total)', async () => {
    const grande = pagoCrudo('p-grande', 6000, 10);
    await assertFails(actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([PA, PB, grande], 10500, 'pendiente')));
  });

  it('✗ suma mal', async () => {
    await assertFails(actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([PA, PB, PNUEVO], 5501)));
  });

  it('✗ estado incoherente (cobrada sin llegar al total)', async () => {
    await assertFails(actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([PA, PB, PNUEVO], 5500, 'cobrada')));
  });

  it('✗ estado incoherente (pendiente habiendo llegado al total)', async () => {
    const saldo = pagoCrudo('p-saldo', 5500, 10);
    await assertFails(actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([PA, PB, saldo], TOTAL_AC, 'pendiente')));
  });

  it('✗ pagos anteriores alterados (monto de pagos[0]; la suma sobre el nuevo es correcta)', async () => {
    await assertFails(
      actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([{ ...PA, montoCents: 1 }, PB, PNUEVO], 5500)),
    );
  });

  it('✗ pagos anteriores reordenados', async () => {
    await assertFails(actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([PB, PA, PNUEVO], 5500)));
  });

  it('✗ dos pagos a la vez', async () => {
    const otro = pagoCrudo('p-otro', 500, 11);
    await assertFails(actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([PA, PB, PNUEVO, otro], 6000)));
  });

  it('✗ pago nuevo con shape inválido (fecha string)', async () => {
    const malo = { ...PNUEVO, fecha: '2026-09-30' };
    await assertFails(actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([PA, PB, malo], 5500)));
  });

  it('✗ pago nuevo con clave desconocida', async () => {
    const malo = { ...PNUEVO, extra: true };
    await assertFails(actualizarCobro(ADMIN, 'ac-dos', cobroCrudo([PA, PB, malo as PagoCrudo], 5500)));
  });

  it('✗ registrar pago tocando además otro campo de la venta', async () => {
    await assertFails(
      updateDoc(doc(db(ADMIN), 'ventas', 'ac-vacia'), {
        cobro: cobroCrudo([pagoCrudo('p', TOTAL_AC, 10)], TOTAL_AC),
        medioPago: 'efectivo',
      }),
    );
  });

  it('✗ registrar pago sobre una venta anulada', async () => {
    await assertFails(actualizarCobro(ADMIN, 'ac-anulada', cobroCrudo([pagoCrudo('p', 1000, 10)], 1000)));
  });

  it('✗ deshacer el pago del medio (aritmética válida: solo el espejo lo frena)', async () => {
    await assertFails(actualizarCobro(ADMIN, 'ac-tres', cobroCrudo([PA, PC], 4500)));
  });

  it('✗ deshacer restando mal', async () => {
    await assertFails(actualizarCobro(ADMIN, 'ac-tres', cobroCrudo([PA, PB], 4000)));
  });

  it('✗ el vendedor deshace un pago', async () => {
    await assertFails(actualizarCobro(VENDEDOR, 'ac-tres', cobroCrudo([PA, PB], 4500)));
  });
});
