import { describe, expect, it } from 'vitest';
import {
  CLAVE_TIPO,
  COLECCIONES_A_BORRAR,
  COLECCIONES_A_CONSERVAR,
  COLECCIONES_A_RESETEAR,
  COLECCIONES_A_RESPALDAR,
  COLECCIONES_CONOCIDAS,
  deserializarValor,
  lineasResumen,
  nombreArchivoBackup,
  nombreArchivoLog,
  parcheCliente,
  parcheProducto,
  parchePara,
  parsearArgs,
  serializarValor,
  verificarBackup,
} from './resetPlan.mjs';

// `resetPlan.mjs` es la parte del reseteo que NO se puede probar contra Firestore
// (borrar prod es irreversible): el criterio de qué se borra, qué se conserva y qué
// contador se pone en cero. Estos tests SON la verificación de esa decisión.

// ── Catálogo ───────────────────────────────────────────────────────────────

describe('catálogo de colecciones', () => {
  // Las 10 colecciones del modelo (docs/02 "Colecciones Firestore" + docs/07
  // "Colecciones"), verificadas contra el código con un grep de `collection(db,…)`
  // y `doc(db,…)` en `apps/quesarte/src` y `packages/firebase-kit/src`.
  const ESPERADAS = [
    'categorias',
    'clientes',
    'compras',
    'configuracion',
    'movimientos',
    'piezas',
    'productos',
    'proveedores',
    'usuarios',
    'ventas',
  ];

  it('cubre exactamente las 10 colecciones del modelo, sin solapamiento', () => {
    expect([...COLECCIONES_CONOCIDAS].sort()).toEqual(ESPERADAS);
    expect(new Set(COLECCIONES_CONOCIDAS).size).toBe(COLECCIONES_CONOCIDAS.length);
  });

  it('borra solo datos operativos', () => {
    expect(COLECCIONES_A_BORRAR.map((c) => c.nombre)).toEqual([
      'ventas',
      'movimientos',
      'piezas',
      'compras',
    ]);
  });

  it('NO borra configuración ni catálogo (usuarios, categorías, proveedores, config)', () => {
    const conservadas = COLECCIONES_A_CONSERVAR.map((c) => c.nombre);
    expect(conservadas).toEqual(['usuarios', 'categorias', 'proveedores', 'configuracion']);
    for (const nombre of conservadas) {
      expect(COLECCIONES_A_BORRAR.map((c) => c.nombre)).not.toContain(nombre);
      expect(COLECCIONES_A_RESETEAR.map((c) => c.nombre)).not.toContain(nombre);
    }
  });

  it('conserva productos y clientes, pero les resetea los contadores derivados', () => {
    expect(COLECCIONES_A_RESETEAR.map((c) => c.nombre)).toEqual(['clientes', 'productos']);
  });

  it('respalda TODAS las colecciones, también las que no toca', () => {
    expect([...COLECCIONES_A_RESPALDAR].sort()).toEqual(ESPERADAS);
  });

  it('cada colección declara su motivo (queda auditado en el propio script)', () => {
    for (const c of [
      ...COLECCIONES_A_BORRAR,
      ...COLECCIONES_A_RESETEAR,
      ...COLECCIONES_A_CONSERVAR,
    ]) {
      expect(c.motivo.length).toBeGreaterThan(20);
    }
  });
});

// ── CLI ────────────────────────────────────────────────────────────────────

describe('parsearArgs', () => {
  it('es DRY-RUN por defecto', () => {
    const args = parsearArgs(['--project', 'quesarte-uy']);
    expect(args.ejecutar).toBe(false);
    expect(args.errores).toEqual([]);
    expect(args.project).toBe('quesarte-uy');
    expect(args.backupDir).toBe('./backups');
  });

  it('exige --project: sin él, error (nunca un default a producción)', () => {
    expect(parsearArgs([]).errores).toHaveLength(1);
    expect(parsearArgs([]).errores[0]).toMatch(/--project/);
    expect(parsearArgs(['--ejecutar']).errores[0]).toMatch(/--project/);
  });

  it('no acepta --project sin valor ni pegado a otro flag', () => {
    expect(parsearArgs(['--project']).errores[0]).toMatch(/necesita un valor/);
    expect(parsearArgs(['--project', '--ejecutar']).errores[0]).toMatch(/necesita un valor/);
  });

  it('reconoce --ejecutar, --backup-dir, --restaurar y --permitir-desconocidas', () => {
    const args = parsearArgs([
      '--project',
      'quesarte-uy-dev',
      '--ejecutar',
      '--backup-dir',
      '/tmp/bk',
      '--permitir-desconocidas',
    ]);
    expect(args).toMatchObject({
      project: 'quesarte-uy-dev',
      ejecutar: true,
      backupDir: '/tmp/bk',
      permitirDesconocidas: true,
      errores: [],
    });
    expect(parsearArgs(['--project', 'p', '--restaurar', 'b.json']).restaurar).toBe('b.json');
  });

  it('ignora el separador `--` que pnpm reenvía al script', () => {
    expect(parsearArgs(['--', '--project', 'quesarte-uy'])).toMatchObject({
      project: 'quesarte-uy',
      errores: [],
    });
  });

  it('rechaza argumentos desconocidos (un typo no puede pasar por bueno)', () => {
    const args = parsearArgs(['--project', 'p', '--ejecutar-ya']);
    expect(args.errores[0]).toMatch(/--ejecutar-ya/);
  });

  it('--ayuda no exige --project', () => {
    expect(parsearArgs(['--ayuda'])).toMatchObject({ ayuda: true, errores: [] });
  });
});

// ── Parches de contadores derivados ────────────────────────────────────────

const AHORA = new Date('2026-07-24T18:00:00.000Z');

describe('parcheProducto', () => {
  it('pone en cero el costo promedio (cache de las compras borradas)', () => {
    expect(parcheProducto({ costoPromedioCents: 45000, modoStock: 'granel' }, AHORA)).toEqual({
      costoPromedioCents: 0,
      actualizadoEn: AHORA,
    });
  });

  it('pone en cero el stock granel y el de unidades cuando están presentes', () => {
    expect(parcheProducto({ costoPromedioCents: 0, stockGranelGramos: 3200 }, AHORA)).toEqual({
      stockGranelGramos: 0,
      actualizadoEn: AHORA,
    });
    expect(parcheProducto({ costoPromedioCents: 0, stockUnidades: 7 }, AHORA)).toEqual({
      stockUnidades: 0,
      actualizadoEn: AHORA,
    });
  });

  it('NO crea campos de stock ausentes (un campo que no existe no recuerda nada)', () => {
    const parche = parcheProducto({ costoPromedioCents: 100 }, AHORA);
    expect(parche).toEqual({ costoPromedioCents: 0, actualizadoEn: AHORA });
    expect(parche).not.toHaveProperty('stockGranelGramos');
    expect(parche).not.toHaveProperty('stockUnidades');
  });

  it('NO toca precio, categoría, umbral, margen ni proveedor principal', () => {
    const parche = parcheProducto(
      {
        nombre: 'Queso Colonia',
        categoria: 'Quesos',
        precioVentaCents: 49000,
        costoPromedioCents: 31000,
        umbralAlertaStock: 500,
        margenObjetivoBps: 4000,
        proveedorPrincipalId: 'prov-1',
        activo: true,
      },
      AHORA,
    );
    expect(Object.keys(parche).sort()).toEqual(['actualizadoEn', 'costoPromedioCents']);
  });

  it('IDEMPOTENCIA: un producto ya en cero no genera escritura', () => {
    expect(
      parcheProducto({ costoPromedioCents: 0, stockGranelGramos: 0, stockUnidades: 0 }, AHORA),
    ).toBeNull();
    expect(parcheProducto({ costoPromedioCents: 0 }, AHORA)).toBeNull();
  });

  it('un doc corrupto sin costoPromedioCents queda saneado en cero', () => {
    expect(parcheProducto({ nombre: 'x' }, AHORA)).toEqual({
      costoPromedioCents: 0,
      actualizadoEn: AHORA,
    });
  });
});

describe('parcheCliente', () => {
  it('reescribe stats en cero y SIN fechas (mismo shape que el alta)', () => {
    expect(
      parcheCliente({
        nombre: 'Marta',
        stats: {
          cantidadVentas: 12,
          totalHistoricoCents: 345000,
          primeraCompra: new Date(),
          ultimaCompra: new Date(),
        },
      }),
    ).toEqual({ stats: { cantidadVentas: 0, totalHistoricoCents: 0 } });
  });

  it('NO toca datos personales ni fechaAlta', () => {
    const parche = parcheCliente({
      nombre: 'Marta',
      telefono: '099 123 456',
      telefonoE164: '59899123456',
      notas: 'le gusta el colonia',
      fechaAlta: new Date(),
      activo: true,
      stats: { cantidadVentas: 1, totalHistoricoCents: 100 },
    });
    expect(Object.keys(parche)).toEqual(['stats']);
  });

  it('resetea aunque los contadores estén en cero pero queden fechas colgadas', () => {
    expect(
      parcheCliente({
        stats: { cantidadVentas: 0, totalHistoricoCents: 0, ultimaCompra: new Date() },
      }),
    ).toEqual({ stats: { cantidadVentas: 0, totalHistoricoCents: 0 } });
  });

  it('IDEMPOTENCIA: un cliente ya en cero y sin fechas no genera escritura', () => {
    expect(parcheCliente({ stats: { cantidadVentas: 0, totalHistoricoCents: 0 } })).toBeNull();
  });
});

describe('parchePara', () => {
  it('rutea por colección', () => {
    expect(parchePara('productos', { costoPromedioCents: 1 }, AHORA)).not.toBeNull();
    expect(
      parchePara('clientes', { stats: { cantidadVentas: 1, totalHistoricoCents: 1 } }, AHORA),
    ).not.toBeNull();
  });

  it('explota ante una colección sin parche definido (nunca inventa uno)', () => {
    expect(() => parchePara('ventas', {}, AHORA)).toThrow(/ventas/);
  });
});

// ── (De)serialización del backup ───────────────────────────────────────────

/** Doble de `Timestamp` de `firebase-admin` (misma superficie que usa el script). */
class TimestampFalso {
  constructor(seconds, nanoseconds) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  toDate() {
    return new Date(this.seconds * 1000 + Math.round(this.nanoseconds / 1e6));
  }
}

const fabricas = {
  timestamp: (nodo) =>
    typeof nodo.segundos === 'number'
      ? new TimestampFalso(nodo.segundos, nodo.nanosegundos ?? 0)
      : new TimestampFalso(Math.floor(Date.parse(nodo.iso) / 1000), 0),
  geopoint: (nodo) => ({ latitude: nodo.latitud, longitude: nodo.longitud }),
  referencia: (nodo) => ({ path: nodo.path, id: 'x', collection: () => {} }),
};

describe('serializarValor', () => {
  it('deja pasar primitivos, arrays y mapas anidados', () => {
    const venta = {
      numero: 1024,
      totalCents: 49000,
      estado: 'completada',
      anulada: false,
      items: [{ productoId: 'p1', gramos: 250, costeo: { v: 1, fuente: 'pieza' } }],
    };
    expect(serializarValor(venta)).toEqual(venta);
  });

  it('marca los Timestamp de Firestore para que se puedan reconstruir', () => {
    const ts = new TimestampFalso(1_784_000_000, 123_000_000);
    const salida = serializarValor({ fecha: ts });
    expect(salida.fecha[CLAVE_TIPO]).toBe('timestamp');
    expect(salida.fecha.segundos).toBe(1_784_000_000);
    expect(salida.fecha.nanosegundos).toBe(123_000_000);
  });

  it('sobrevive el round-trip por JSON sin perder el tipo ni el instante', () => {
    const original = {
      fecha: new TimestampFalso(1_784_000_000, 123_000_000),
      stats: { ultimaCompra: new TimestampFalso(1_783_000_000, 0) },
      items: [{ vence: new TimestampFalso(1_785_000_000, 0) }],
    };
    const roundTrip = deserializarValor(
      JSON.parse(JSON.stringify(serializarValor(original))),
      fabricas,
    );
    expect(roundTrip.fecha.seconds).toBe(1_784_000_000);
    expect(roundTrip.fecha.nanoseconds).toBe(123_000_000);
    expect(roundTrip.stats.ultimaCompra.seconds).toBe(1_783_000_000);
    expect(roundTrip.items[0].vence.seconds).toBe(1_785_000_000);
  });

  it('omite undefined y conserva null', () => {
    expect(serializarValor({ a: undefined, b: null })).toEqual({ b: null });
  });

  it('EXPLOTA ante un tipo que no sabría restaurar (mejor abortar que perder datos)', () => {
    expect(() => serializarValor({ raro: new Map() }, 'ventas/v1')).toThrow(/desconocido/);
    expect(() => serializarValor({ n: Number.NaN })).toThrow(/no finito/);
  });

  it('EXPLOTA si un documento trae un campo literal que colisiona con el marcador', () => {
    expect(() => serializarValor({ [CLAVE_TIPO]: 'timestamp' })).toThrow(/colisiona/);
  });
});

describe('deserializarValor', () => {
  it('EXPLOTA ante un marcador desconocido (backup de otra versión)', () => {
    expect(() => deserializarValor({ x: { [CLAVE_TIPO]: 'blob' } }, fabricas)).toThrow(/blob/);
  });
});

// ── Verificación del backup ────────────────────────────────────────────────

describe('verificarBackup', () => {
  const backupOk = {
    meta: { projectId: 'quesarte-uy' },
    colecciones: {
      ventas: [
        { id: 'v1', datos: {} },
        { id: 'v2', datos: {} },
      ],
      piezas: [],
    },
  };

  it('no reporta errores cuando los conteos cuadran', () => {
    expect(verificarBackup(backupOk, { ventas: 2, piezas: 0 })).toEqual([]);
  });

  it('detecta una colección faltante', () => {
    expect(verificarBackup(backupOk, { ventas: 2, movimientos: 3 })[0]).toMatch(/movimientos/);
  });

  it('detecta un conteo que no cuadra (backup truncado)', () => {
    expect(verificarBackup(backupOk, { ventas: 3 })[0]).toMatch(/2 documentos/);
  });

  it('detecta un archivo corrupto o sin meta', () => {
    expect(verificarBackup(null, {})).toHaveLength(1);
    expect(verificarBackup({ colecciones: {} }, {})[0]).toMatch(/meta/);
  });

  it('detecta documentos sin id (irrestaurables)', () => {
    const roto = { meta: { projectId: 'p' }, colecciones: { ventas: [{ datos: {} }] } };
    expect(verificarBackup(roto, { ventas: 1 })[0]).toMatch(/sin `id`/);
  });
});

// ── Nombres de archivo y resumen ───────────────────────────────────────────

describe('nombres de archivo', () => {
  it('son aptos para el sistema de archivos y trazan proyecto + instante', () => {
    const fecha = new Date('2026-07-24T18:05:31.042Z');
    expect(nombreArchivoBackup('quesarte-uy', fecha)).toBe(
      'reset-quesarte-uy-2026-07-24T18-05-31-042Z.json',
    );
    expect(nombreArchivoLog('quesarte-uy', fecha)).toBe(
      'reset-quesarte-uy-2026-07-24T18-05-31-042Z.log.txt',
    );
  });
});

describe('lineasResumen', () => {
  const resumen = lineasResumen({
    projectId: 'quesarte-uy',
    modo: 'DRY-RUN (no escribe nada)',
    conteos: { ventas: 42, movimientos: 130, piezas: 9, compras: 3, clientes: 6, productos: 20 },
    aResetear: { clientes: 6, productos: 18 },
    rutaBackup: '/tmp/backups/reset.json',
    desconocidas: ['telemetria'],
  });
  const texto = resumen.join('\n');

  it('dice proyecto, modo, colecciones, conteos y dónde va el backup', () => {
    expect(texto).toContain('quesarte-uy');
    expect(texto).toContain('DRY-RUN');
    expect(texto).toContain('42 documentos');
    expect(texto).toContain('184 documentos a borrar');
    expect(texto).toContain('18 de 20 documentos a modificar');
    expect(texto).toContain('/tmp/backups/reset.json');
  });

  it('grita las colecciones desconocidas', () => {
    expect(texto).toContain('DESCONOCIDAS');
    expect(texto).toContain('telemetria');
  });
});
