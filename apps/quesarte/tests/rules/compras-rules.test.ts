import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { money, peso, type Compra } from '@gestion/core';
import {
  confirmarCompra,
  guardarBorradorCompra,
  type DatosBorradorCompra,
  type EntradaConfirmarCompra,
} from '@gestion/firebase-kit';

// Integración de las escrituras de compras (F2-E) contra el emulador CON LAS
// REGLAS REALES: `guardarBorradorCompra` y la confirmación atómica
// (`confirmarCompra`) deben PASAR las reglas como admin y quedar BLOQUEADAS para
// el vendedor, y los efectos (piezas, stock, movimientos, costo promedio) deben
// materializarse en Firestore. Es la evidencia de "bloqueado por reglas, no solo UI".

const PROJECT_ID = 'demo-quesarte';
const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(HERE, '../../firestore.rules');

const ADMIN = 'admin-uid';
const VENDEDOR = 'vend-uid';

let testEnv: RulesTestEnvironment;

function db(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore();
}

// Borrador con un ítem por pieza (queso) y uno granel (nuez).
function datosBorrador(): DatosBorradorCompra {
  return {
    usuarioId: ADMIN,
    proveedorId: 'prov-1',
    proveedorNombre: 'Lácteos Colonia',
    items: [
      {
        productoId: 'prod-queso',
        nombreProducto: 'Queso Colonia',
        gramos: peso(8000),
        piezas: [{ pesoGramos: peso(5000) }, { pesoGramos: peso(3000) }],
        costoFacturaCents: money(240000),
      },
      {
        productoId: 'prod-nuez',
        nombreProducto: 'Nuez',
        gramos: peso(2000),
        costoFacturaCents: money(60000),
      },
    ],
    gastos: [
      { concepto: 'combustible', montoCents: money(15000) },
      { concepto: 'peaje', montoCents: money(5000) },
    ],
    fecha: new Date('2026-03-10T10:00:00.000Z'),
  };
}

// La misma compra ya prorrateada (lo que el caller arma con core), lista para confirmar.
function compraConfirmable(id: string): Compra {
  return {
    id,
    fecha: new Date('2026-03-10T10:00:00.000Z'),
    usuarioId: ADMIN,
    estado: 'borrador',
    proveedorId: 'prov-1',
    proveedorNombre: 'Lácteos Colonia',
    items: [
      {
        productoId: 'prod-queso',
        nombreProducto: 'Queso Colonia',
        gramos: peso(8000),
        piezas: [{ pesoGramos: peso(5000) }, { pesoGramos: peso(3000) }],
        costoFacturaCents: money(240000),
        gastoProrrateadoCents: money(15000),
        costoRealCents: money(255000),
        costoRealKgCents: money(31875),
      },
      {
        productoId: 'prod-nuez',
        nombreProducto: 'Nuez',
        gramos: peso(2000),
        costoFacturaCents: money(60000),
        gastoProrrateadoCents: money(5000),
        costoRealCents: money(65000),
        costoRealKgCents: money(32500),
      },
    ],
    gastos: [
      { concepto: 'combustible', montoCents: money(15000) },
      { concepto: 'peaje', montoCents: money(5000) },
    ],
    totalFacturaCents: money(300000),
    totalGastosCents: money(20000),
    totalRealCents: money(320000),
  };
}

function entradaConfirmar(id: string): EntradaConfirmarCompra {
  return {
    compra: compraConfirmable(id),
    usuarioId: ADMIN,
    efectosProducto: [
      { productoId: 'prod-queso', nuevoCostoPromedioCents: money(31875) },
      { productoId: 'prod-nuez', nuevoCostoPromedioCents: money(32500) },
    ],
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
    await setDoc(doc(seed, 'productos', 'prod-queso'), {
      nombre: 'Queso Colonia',
      categoria: 'quesos',
      modoPrecio: 'por_kg',
      modoStock: 'fraccionado_por_pieza',
      precioVentaCents: 45000,
      costoPromedioCents: 0,
      activo: true,
      actualizadoEn: Date.now(),
    });
    await setDoc(doc(seed, 'productos', 'prod-nuez'), {
      nombre: 'Nuez',
      categoria: 'frutos_secos',
      modoPrecio: 'por_kg',
      modoStock: 'granel',
      precioVentaCents: 45000,
      costoPromedioCents: 0,
      stockGranelGramos: 10000,
      activo: true,
      actualizadoEn: Date.now(),
    });
    await setDoc(doc(seed, 'proveedores', 'prov-1'), {
      nombre: 'Lácteos Colonia',
      fechaAlta: Date.now(),
      activo: true,
    });
  });
});

describe('guardarBorradorCompra pasa las reglas', () => {
  it('el admin guarda un borrador', async () => {
    await assertSucceeds(guardarBorradorCompra(db(ADMIN), datosBorrador()));
  });

  it('el vendedor NO guarda compras (rechazado por reglas)', async () => {
    await assertFails(guardarBorradorCompra(db(VENDEDOR), datosBorrador()));
  });
});

describe('confirmarCompra aplica los efectos atómicos como admin', () => {
  async function crearBorrador(): Promise<string> {
    const { compraId } = await guardarBorradorCompra(db(ADMIN), datosBorrador());
    return compraId;
  }

  it('deja la compra confirmada, crea piezas, sube el granel y registra movimientos', async () => {
    const compraId = await crearBorrador();
    await assertSucceeds(confirmarCompra(db(ADMIN), entradaConfirmar(compraId)));

    const admin = db(ADMIN);

    // La compra quedó confirmada.
    const compraSnap = await getDoc(doc(admin, 'compras', compraId));
    expect(compraSnap.data()?.estado).toBe('confirmada');

    // El granel subió 10000 → 12000; el costo promedio se recalculó.
    const nuez = await getDoc(doc(admin, 'productos', 'prod-nuez'));
    expect(nuez.data()?.stockGranelGramos).toBe(12000);
    expect(nuez.data()?.costoPromedioCents).toBe(32500);
    const queso = await getDoc(doc(admin, 'productos', 'prod-queso'));
    expect(queso.data()?.costoPromedioCents).toBe(31875);

    // Se crearon 2 piezas ligadas a la compra, heredando el costo real por kg.
    const piezas = (await getDocs(collection(admin, 'piezas'))).docs
      .map((d) => d.data())
      .filter((p) => p.compraId === compraId);
    expect(piezas).toHaveLength(2);
    for (const p of piezas) {
      expect(p.costoKgCents).toBe(31875);
      expect(p.productoId).toBe('prod-queso');
      expect(p.estado).toBe('disponible');
      expect(p.pesoInicialGramos).toBe(p.pesoRestanteGramos);
    }

    // 3 movimientos ingreso_compra (2 piezas + 1 granel) con origen la compra.
    const movs = (await getDocs(collection(admin, 'movimientos'))).docs
      .map((d) => d.data())
      .filter((m) => m.origenId === compraId);
    expect(movs).toHaveLength(3);
    for (const m of movs) {
      expect(m.tipo).toBe('ingreso_compra');
      expect(m.origenTipo).toBe('compra');
    }
  });

  it('el vendedor NO puede confirmar (rechazado por reglas)', async () => {
    const compraId = await crearBorrador();
    await assertFails(confirmarCompra(db(VENDEDOR), entradaConfirmar(compraId)));
  });
});
