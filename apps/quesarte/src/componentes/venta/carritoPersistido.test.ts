import { describe, expect, it } from 'vitest';
import { money, peso, type Cliente, type Pieza, type Producto } from '@gestion/core';
import type { ClienteVenta } from '@gestion/firebase-kit';
import {
  esCarritoPersistidoValido,
  rehidratarCarrito,
  serializarCarrito,
  type CarritoPersistido,
  type ItemPersistido,
} from './carritoPersistido';
import {
  crearItemFraccionado,
  crearItemGranel,
  crearItemPiezaEntera,
  crearItemUnidad,
} from './itemsCarrito';

// ── Fixtures ────────────────────────────────────────────────────────────────

function productoDe(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock' | 'modoPrecio'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'cat',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function piezaDe(over: Partial<Pieza> & Pick<Pieza, 'id' | 'productoId'>): Pieza {
  return {
    pesoInicialGramos: peso(1000),
    pesoRestanteGramos: peso(1000),
    costoKgCents: money(500),
    fechaIngreso: new Date('2026-01-01T10:00:00'),
    estado: 'disponible',
    ...over,
  };
}

function clienteDe(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

const quesoColonia = productoDe({
  id: 'p1',
  nombre: 'Queso Colonia',
  modoStock: 'fraccionado_por_pieza',
  modoPrecio: 'por_kg',
  precioVentaCents: money(89900),
});

const salame = productoDe({
  id: 'p2',
  nombre: 'Salame tandilero',
  modoStock: 'pieza_entera',
  modoPrecio: 'por_kg',
  precioVentaCents: money(120000),
});

const nuezMariposa = productoDe({
  id: 'p3',
  nombre: 'Nuez mariposa',
  modoStock: 'granel',
  modoPrecio: 'por_kg',
  precioVentaCents: money(45000),
  stockGranelGramos: peso(500),
});

const mielFrasco = productoDe({
  id: 'p4',
  nombre: 'Miel 500g',
  modoStock: 'unidad_simple',
  modoPrecio: 'por_unidad',
  precioVentaCents: money(45000),
  stockUnidades: 5,
});

const piezaQueso = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(1000) });
const piezaSalame = piezaDe({ id: 'pz2', productoId: 'p2', pesoRestanteGramos: peso(850) });

function itemPersistido(over: Partial<ItemPersistido> & Pick<ItemPersistido, 'clave' | 'productoId'>): ItemPersistido {
  return { precioUnitCents: 1000, ...over };
}

function payload(over: Partial<CarritoPersistido> = {}): CarritoPersistido {
  return { v: 1, items: [], cliente: null, proximaClave: 0, ...over };
}

/** Simula el viaje real por `localStorage`: lo que vuelve de `JSON.parse` es
 * `unknown`, nunca el objeto tipado que se escribió. */
function idaYVuelta(x: unknown): unknown {
  return JSON.parse(JSON.stringify(x));
}

// ── Type guard ──────────────────────────────────────────────────────────────

describe('esCarritoPersistidoValido', () => {
  it('acepta un payload mínimo bien formado', () => {
    expect(esCarritoPersistidoValido(payload())).toBe(true);
  });

  it('acepta un payload con ítems de los cuatro modos y cliente', () => {
    const completo = payload({
      items: [
        itemPersistido({ clave: 'item-0', productoId: 'p1', piezaId: 'pz1', gramos: 500 }),
        itemPersistido({ clave: 'item-1', productoId: 'p2', piezaId: 'pz2', gramos: 850 }),
        itemPersistido({ clave: 'item-2', productoId: 'p3', gramos: 200 }),
        itemPersistido({ clave: 'item-3', productoId: 'p4', unidades: 2 }),
      ],
      cliente: { id: 'c1', nombre: 'Marta', esPrimeraCompra: false },
      proximaClave: 4,
    });
    expect(esCarritoPersistidoValido(completo)).toBe(true);
  });

  it.each([
    ['null', null],
    ['un string', '{"v":1}'],
    ['un número', 7],
    ['un array', []],
  ])('rechaza %s', (_nombre, valor) => {
    expect(esCarritoPersistidoValido(valor)).toBe(false);
  });

  it('rechaza una versión desconocida (no adivina migraciones)', () => {
    expect(esCarritoPersistidoValido({ ...payload(), v: 2 })).toBe(false);
    expect(esCarritoPersistidoValido({ ...payload(), v: '1' })).toBe(false);
  });

  it('rechaza claves faltantes y claves de más (shape estricto)', () => {
    const sinProximaClave: Record<string, unknown> = { ...payload() };
    delete sinProximaClave['proximaClave'];
    expect(esCarritoPersistidoValido(sinProximaClave)).toBe(false);
    expect(esCarritoPersistidoValido({ ...payload(), extra: 1 })).toBe(false);
  });

  it('rechaza items que no son un array', () => {
    expect(esCarritoPersistidoValido({ ...payload(), items: {} })).toBe(false);
  });

  it('rechaza proximaClave no entera o negativa', () => {
    expect(esCarritoPersistidoValido({ ...payload(), proximaClave: 1.5 })).toBe(false);
    expect(esCarritoPersistidoValido({ ...payload(), proximaClave: -1 })).toBe(false);
  });

  it('rechaza un ítem sin las claves requeridas', () => {
    expect(esCarritoPersistidoValido(payload({ items: [{ clave: 'item-0' }] as never }))).toBe(false);
    expect(
      esCarritoPersistidoValido(payload({ items: [{ productoId: 'p1', precioUnitCents: 10 }] as never })),
    ).toBe(false);
  });

  it('rechaza un ítem con una clave ajena', () => {
    const conBasura = { ...itemPersistido({ clave: 'item-0', productoId: 'p1' }), nombre: 'Queso' };
    expect(esCarritoPersistidoValido(payload({ items: [conBasura] as never }))).toBe(false);
  });

  it('rechaza magnitudes no enteras, negativas o de otro tipo', () => {
    const base = { clave: 'item-0', productoId: 'p1' };
    expect(
      esCarritoPersistidoValido(payload({ items: [{ ...base, precioUnitCents: 10, gramos: 500.5 }] as never })),
    ).toBe(false);
    expect(
      esCarritoPersistidoValido(payload({ items: [{ ...base, precioUnitCents: 10, gramos: -500 }] as never })),
    ).toBe(false);
    expect(
      esCarritoPersistidoValido(payload({ items: [{ ...base, precioUnitCents: 10, unidades: '2' }] as never })),
    ).toBe(false);
    expect(
      esCarritoPersistidoValido(payload({ items: [{ ...base, precioUnitCents: -10 }] as never })),
    ).toBe(false);
  });

  it('rechaza gramos en 0: no es un ítem, y `registrarVenta` haría fallar la venta ENTERA', () => {
    const base = { clave: 'item-0', productoId: 'p3', precioUnitCents: 45000 };
    expect(esCarritoPersistidoValido(payload({ items: [{ ...base, gramos: 0 }] as never }))).toBe(false);
    // Control: con 1 g el mismo payload es válido.
    expect(esCarritoPersistidoValido(payload({ items: [{ ...base, gramos: 1 }] as never }))).toBe(true);
  });

  it('rechaza unidades en 0 (mismo motivo)', () => {
    const base = { clave: 'item-0', productoId: 'p4', precioUnitCents: 45000 };
    expect(esCarritoPersistidoValido(payload({ items: [{ ...base, unidades: 0 }] as never }))).toBe(false);
    expect(esCarritoPersistidoValido(payload({ items: [{ ...base, unidades: 1 }] as never }))).toBe(true);
  });

  it('sigue aceptando precioUnitCents en 0 (un precio 0 es dato legítimo) y proximaClave en 0', () => {
    const item = { clave: 'item-0', productoId: 'p3', gramos: 200, precioUnitCents: 0 };
    expect(esCarritoPersistidoValido(payload({ items: [item] as never, proximaClave: 0 }))).toBe(true);
  });

  it('rechaza piezaId nulo o vacío (un `null` de JSON no es "ausente")', () => {
    const base = { clave: 'item-0', productoId: 'p1', precioUnitCents: 10 };
    expect(esCarritoPersistidoValido(payload({ items: [{ ...base, piezaId: null }] as never }))).toBe(false);
    expect(esCarritoPersistidoValido(payload({ items: [{ ...base, piezaId: '' }] as never }))).toBe(false);
  });

  it('rechaza claves de lista repetidas (romperían quitar/editar por clave)', () => {
    const repetidas = payload({
      items: [
        itemPersistido({ clave: 'item-0', productoId: 'p3', gramos: 100 }),
        itemPersistido({ clave: 'item-0', productoId: 'p3', gramos: 200 }),
      ],
    });
    expect(esCarritoPersistidoValido(repetidas)).toBe(false);
  });

  it('rechaza un cliente con shape inválido, pero acepta null', () => {
    expect(esCarritoPersistidoValido(payload({ cliente: null }))).toBe(true);
    expect(esCarritoPersistidoValido({ ...payload(), cliente: { id: 'c1', nombre: 'Marta' } })).toBe(false);
    expect(
      esCarritoPersistidoValido({ ...payload(), cliente: { id: 'c1', nombre: 'Marta', esPrimeraCompra: 'no' } }),
    ).toBe(false);
    expect(
      esCarritoPersistidoValido({
        ...payload(),
        cliente: { id: 'c1', nombre: 'Marta', esPrimeraCompra: false, extra: 1 },
      }),
    ).toBe(false);
  });

  it('rechaza lo que sale de un JSON roto (el caller cae al catch de JSON.parse)', () => {
    expect(() => JSON.parse('{no soy json')).toThrow();
  });
});

// ── Serialización ───────────────────────────────────────────────────────────

describe('serializarCarrito', () => {
  it('reduce cada ítem a ids y magnitudes, sin snapshots de entidades', () => {
    const items = [
      crearItemFraccionado(quesoColonia, piezaQueso, peso(500), 'item-0'),
      crearItemUnidad(mielFrasco, 2, 'item-1'),
    ];

    const resultado = serializarCarrito(items, null, 2);

    expect(resultado).toEqual({
      v: 1,
      items: [
        { clave: 'item-0', productoId: 'p1', piezaId: 'pz1', gramos: 500, precioUnitCents: 89900 },
        { clave: 'item-1', productoId: 'p4', unidades: 2, precioUnitCents: 45000 },
      ],
      cliente: null,
      proximaClave: 2,
    });
    // Ni `producto` ni `pieza` viajan: es el invariante de la tanda.
    expect(JSON.stringify(resultado)).not.toContain('Queso Colonia');
  });

  it('omite las claves opcionales que no aplican (no las escribe como undefined)', () => {
    const resultado = serializarCarrito([crearItemGranel(nuezMariposa, peso(200), 'item-0')], null, 1);
    expect(Object.keys(resultado.items[0]!).sort()).toEqual([
      'clave',
      'gramos',
      'precioUnitCents',
      'productoId',
    ]);
  });

  it('lo que serializa pasa su propio type guard después de ir y volver por JSON', () => {
    const cliente: ClienteVenta = { id: 'c1', nombre: 'Marta', esPrimeraCompra: true };
    const items = [
      crearItemFraccionado(quesoColonia, piezaQueso, peso(500), 'item-0'),
      crearItemPiezaEntera(salame, piezaSalame, 'item-1'),
      crearItemGranel(nuezMariposa, peso(200), 'item-2'),
      crearItemUnidad(mielFrasco, 2, 'item-3'),
    ];

    const crudo = idaYVuelta(serializarCarrito(items, cliente, 4));

    expect(esCarritoPersistidoValido(crudo)).toBe(true);
  });
});

// ── Rehidratación ───────────────────────────────────────────────────────────

describe('rehidratarCarrito - descartes por producto', () => {
  it('descarta (sin poder nombrarlo) el ítem cuyo producto ya no está en el catálogo activo', () => {
    const resultado = rehidratarCarrito(
      payload({ items: [itemPersistido({ clave: 'item-0', productoId: 'fantasma', gramos: 200 })] }),
      [nuezMariposa],
      [],
      [],
    );

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartadosSinNombre).toBe(1);
    expect(resultado.descartados).toEqual([]);
  });

  it('el modoStock del producto VIVO manda: sin los campos que ese modo exige, descarta', () => {
    // El ítem se guardó como granel; hoy el producto es fraccionado por pieza
    // y el payload no trae `piezaId`.
    const ahoraFraccionado = productoDe({
      id: 'p3',
      nombre: 'Nuez mariposa',
      modoStock: 'fraccionado_por_pieza',
      modoPrecio: 'por_kg',
    });

    const resultado = rehidratarCarrito(
      payload({ items: [itemPersistido({ clave: 'item-0', productoId: 'p3', gramos: 200 })] }),
      [ahoraFraccionado],
      [],
      [],
    );

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Nuez mariposa']);
    expect(resultado.descartadosSinNombre).toBe(0);
  });

  it('deduplica los nombres descartados', () => {
    const resultado = rehidratarCarrito(
      payload({
        items: [
          itemPersistido({ clave: 'item-0', productoId: 'p3', gramos: 900 }),
          itemPersistido({ clave: 'item-1', productoId: 'p3', gramos: 800 }),
        ],
      }),
      [nuezMariposa], // stock 500 g: los dos exceden
      [],
      [],
    );

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Nuez mariposa']);
  });
});

describe('rehidratarCarrito - fraccionado_por_pieza', () => {
  const item = itemPersistido({
    clave: 'item-0',
    productoId: 'p1',
    piezaId: 'pz1',
    gramos: 500,
    precioUnitCents: 89900,
  });

  it('reconstruye contra la pieza viva', () => {
    const resultado = rehidratarCarrito(payload({ items: [item] }), [quesoColonia], [piezaQueso], []);

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]).toMatchObject({
      clave: 'item-0',
      gramos: 500,
      precioUnitCents: 89900,
      subtotalCents: 44950, // 89900 * 500/1000
    });
    expect(resultado.items[0]!.pieza?.id).toBe('pz1');
    expect(resultado.descartados).toEqual([]);
  });

  it('descarta si la pieza ya no está disponible (no vino en la query)', () => {
    const resultado = rehidratarCarrito(payload({ items: [item] }), [quesoColonia], [], []);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Queso Colonia']);
  });

  it('descarta si la pieza ya no tiene peso suficiente', () => {
    const mermada = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(400) });
    const resultado = rehidratarCarrito(payload({ items: [item] }), [quesoColonia], [mermada], []);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Queso Colonia']);
  });

  it('descarta si la pieza pertenece a otro producto', () => {
    const ajena = piezaDe({ id: 'pz1', productoId: 'otro', pesoRestanteGramos: peso(1000) });
    const resultado = rehidratarCarrito(payload({ items: [item] }), [quesoColonia], [ajena], []);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Queso Colonia']);
  });

  it('descarta si falta el piezaId', () => {
    const sinPieza = itemPersistido({ clave: 'item-0', productoId: 'p1', gramos: 500 });
    const resultado = rehidratarCarrito(payload({ items: [sinPieza] }), [quesoColonia], [piezaQueso], []);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Queso Colonia']);
  });

  it('dos cortes de la MISMA pieza se validan contra el peso ACUMULADO, no contra el completo', () => {
    // 600 + 300 = 900 ≤ 1000: los dos entran.
    const resultado = rehidratarCarrito(
      payload({
        items: [
          itemPersistido({ clave: 'item-0', productoId: 'p1', piezaId: 'pz1', gramos: 600, precioUnitCents: 89900 }),
          itemPersistido({ clave: 'item-1', productoId: 'p1', piezaId: 'pz1', gramos: 300, precioUnitCents: 89900 }),
        ],
      }),
      [quesoColonia],
      [piezaQueso],
      [],
    );

    expect(resultado.items).toHaveLength(2);
    expect(resultado.descartados).toEqual([]);
    // La pieza embebida en cada ítem viene ajustada por lo que reservaron los
    // anteriores — igual que la que produce `piezasAjustadasPorCarrito` en la
    // pantalla, y de la que depende la validación de `registrarVenta`.
    expect(resultado.items[0]!.pieza?.pesoRestanteGramos).toBe(1000);
    expect(resultado.items[1]!.pieza?.pesoRestanteGramos).toBe(400);
  });

  it('dos cortes de la misma pieza que NO entran: el segundo se descarta y el primero sobrevive', () => {
    // 600 + 500 = 1100 > 1000.
    const resultado = rehidratarCarrito(
      payload({
        items: [
          itemPersistido({ clave: 'item-0', productoId: 'p1', piezaId: 'pz1', gramos: 600, precioUnitCents: 89900 }),
          itemPersistido({ clave: 'item-1', productoId: 'p1', piezaId: 'pz1', gramos: 500, precioUnitCents: 89900 }),
        ],
      }),
      [quesoColonia],
      [piezaQueso],
      [],
    );

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]!.clave).toBe('item-0');
    expect(resultado.descartados).toEqual(['Queso Colonia']);
  });
});

describe('rehidratarCarrito - pieza_entera', () => {
  const item = itemPersistido({
    clave: 'item-0',
    productoId: 'p2',
    piezaId: 'pz2',
    gramos: 850,
    precioUnitCents: 120000,
  });

  it('el peso vendido sale del pesoRestanteGramos VIVO, no del persistido', () => {
    const mermada = piezaDe({ id: 'pz2', productoId: 'p2', pesoRestanteGramos: peso(800) });
    const resultado = rehidratarCarrito(payload({ items: [item] }), [salame], [mermada], []);

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]!.gramos).toBe(800);
    expect(resultado.items[0]!.subtotalCents).toBe(96000); // 120000 * 800/1000
    expect(resultado.descartados).toEqual([]);
  });

  it('descarta si la pieza ya no está', () => {
    const resultado = rehidratarCarrito(payload({ items: [item] }), [salame], [], []);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Salame tandilero']);
  });

  it('descarta si la pieza quedó sin peso restante (solo podría fallar al cobrar)', () => {
    const vacia = piezaDe({ id: 'pz2', productoId: 'p2', pesoRestanteGramos: peso(0) });
    const resultado = rehidratarCarrito(payload({ items: [item] }), [salame], [vacia], []);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Salame tandilero']);
  });

  it('no deja vender dos veces la misma pieza entera', () => {
    const resultado = rehidratarCarrito(
      payload({
        items: [item, itemPersistido({ clave: 'item-1', productoId: 'p2', piezaId: 'pz2', gramos: 850 })],
      }),
      [salame],
      [piezaSalame],
      [],
    );

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]!.clave).toBe('item-0');
    expect(resultado.descartados).toEqual(['Salame tandilero']);
  });
});

describe('rehidratarCarrito - granel', () => {
  const item = itemPersistido({ clave: 'item-0', productoId: 'p3', gramos: 200, precioUnitCents: 45000 });

  it('reconstruye si el stock alcanza', () => {
    const resultado = rehidratarCarrito(payload({ items: [item] }), [nuezMariposa], [], []);

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]!.gramos).toBe(200);
    expect(resultado.items[0]!.subtotalCents).toBe(9000); // 45000 * 200/1000
  });

  it('descarta si el stock granel bajó por debajo de lo pedido', () => {
    const conPoco = productoDe({ ...nuezMariposa, stockGranelGramos: peso(150) });
    const resultado = rehidratarCarrito(payload({ items: [item] }), [conPoco], [], []);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Nuez mariposa']);
  });

  it('descarta si el producto ya no tiene stockGranelGramos', () => {
    const sinStock = productoDe({
      id: 'p3',
      nombre: 'Nuez mariposa',
      modoStock: 'granel',
      modoPrecio: 'por_kg',
    });
    const resultado = rehidratarCarrito(payload({ items: [item] }), [sinStock], [], []);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Nuez mariposa']);
  });
});

describe('rehidratarCarrito - unidad_simple', () => {
  const item = itemPersistido({ clave: 'item-0', productoId: 'p4', unidades: 2, precioUnitCents: 45000 });

  it('reconstruye si el stock alcanza', () => {
    const resultado = rehidratarCarrito(payload({ items: [item] }), [mielFrasco], [], []);

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]!.unidades).toBe(2);
    expect(resultado.items[0]!.subtotalCents).toBe(90000);
  });

  it('descarta si el stock en unidades bajó por debajo de lo pedido', () => {
    const conPoco = productoDe({ ...mielFrasco, stockUnidades: 1 });
    const resultado = rehidratarCarrito(payload({ items: [item] }), [conPoco], [], []);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Miel 500g']);
  });

  it('descarta si el producto ya no tiene stockUnidades', () => {
    const sinStock = productoDe({
      id: 'p4',
      nombre: 'Miel 500g',
      modoStock: 'unidad_simple',
      modoPrecio: 'por_unidad',
    });
    const resultado = rehidratarCarrito(payload({ items: [item] }), [sinStock], [], []);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.descartados).toEqual(['Miel 500g']);
  });

  it('varias líneas del mismo producto se validan contra el stock TOTAL (como puedeSumarUnidad)', () => {
    // stockUnidades: 5. 3 + 2 entra; el tercero de 1 ya no.
    const resultado = rehidratarCarrito(
      payload({
        items: [
          itemPersistido({ clave: 'item-0', productoId: 'p4', unidades: 3, precioUnitCents: 45000 }),
          itemPersistido({ clave: 'item-1', productoId: 'p4', unidades: 2, precioUnitCents: 45000 }),
          itemPersistido({ clave: 'item-2', productoId: 'p4', unidades: 1, precioUnitCents: 45000 }),
        ],
      }),
      [mielFrasco],
      [],
      [],
    );

    expect(resultado.items.map((i) => i.clave)).toEqual(['item-0', 'item-1']);
    expect(resultado.descartados).toEqual(['Miel 500g']);
  });
});

describe('rehidratarCarrito - precio', () => {
  it('reconstruye con el precio VIVO y reporta el cambio', () => {
    const masCaro = productoDe({ ...nuezMariposa, precioVentaCents: money(52000) });
    const resultado = rehidratarCarrito(
      payload({
        items: [itemPersistido({ clave: 'item-0', productoId: 'p3', gramos: 200, precioUnitCents: 45000 })],
      }),
      [masCaro],
      [],
      [],
    );

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]!.precioUnitCents).toBe(52000);
    expect(resultado.items[0]!.subtotalCents).toBe(10400); // 52000 * 200/1000
    expect(resultado.preciosCambiados).toEqual(['Nuez mariposa']);
  });

  it('no reporta nada si el precio no cambió', () => {
    const resultado = rehidratarCarrito(
      payload({
        items: [itemPersistido({ clave: 'item-0', productoId: 'p3', gramos: 200, precioUnitCents: 45000 })],
      }),
      [nuezMariposa],
      [],
      [],
    );

    expect(resultado.preciosCambiados).toEqual([]);
  });

  it('un ítem descartado no aparece además en preciosCambiados', () => {
    const masCaroYSinStock = productoDe({
      ...nuezMariposa,
      precioVentaCents: money(52000),
      stockGranelGramos: peso(10),
    });
    const resultado = rehidratarCarrito(
      payload({
        items: [itemPersistido({ clave: 'item-0', productoId: 'p3', gramos: 200, precioUnitCents: 45000 })],
      }),
      [masCaroYSinStock],
      [],
      [],
    );

    expect(resultado.descartados).toEqual(['Nuez mariposa']);
    expect(resultado.preciosCambiados).toEqual([]);
  });
});

describe('rehidratarCarrito - cliente', () => {
  const conCliente = payload({ cliente: { id: 'c1', nombre: 'Marta viejo', esPrimeraCompra: true } });

  it('refresca el nombre y recalcula esPrimeraCompra contra el cliente vivo', () => {
    const marta = clienteDe({
      id: 'c1',
      nombre: 'Marta Pérez',
      stats: { cantidadVentas: 3, totalHistoricoCents: money(1000) },
    });

    const resultado = rehidratarCarrito(conCliente, [], [], [marta]);

    expect(resultado.cliente).toEqual({ id: 'c1', nombre: 'Marta Pérez', esPrimeraCompra: false });
    expect(resultado.clienteDescartado).toBe(false);
  });

  it('mantiene esPrimeraCompra si el cliente sigue sin ventas', () => {
    const resultado = rehidratarCarrito(conCliente, [], [], [clienteDe({ id: 'c1', nombre: 'Marta' })]);

    expect(resultado.cliente).toEqual({ id: 'c1', nombre: 'Marta', esPrimeraCompra: true });
  });

  it('descarta el cliente si ya no está entre los activos', () => {
    const resultado = rehidratarCarrito(conCliente, [], [], [clienteDe({ id: 'otro', nombre: 'Otro' })]);

    expect(resultado.cliente).toBeNull();
    expect(resultado.clienteDescartado).toBe(true);
  });

  it('sin cliente guardado no hay nada que descartar', () => {
    const resultado = rehidratarCarrito(payload(), [], [], []);

    expect(resultado.cliente).toBeNull();
    expect(resultado.clienteDescartado).toBe(false);
  });
});

describe('rehidratarCarrito - ida y vuelta completa', () => {
  it('un carrito intacto contra un mundo intacto vuelve completo (sin falsas alarmas)', () => {
    const items = [
      crearItemFraccionado(quesoColonia, piezaQueso, peso(500), 'item-0'),
      crearItemPiezaEntera(salame, piezaSalame, 'item-1'),
      crearItemGranel(nuezMariposa, peso(200), 'item-2'),
      crearItemUnidad(mielFrasco, 2, 'item-3'),
    ];
    const cliente: ClienteVenta = { id: 'c1', nombre: 'Marta', esPrimeraCompra: true };

    const crudo = idaYVuelta(serializarCarrito(items, cliente, 4));
    expect(esCarritoPersistidoValido(crudo)).toBe(true);
    if (!esCarritoPersistidoValido(crudo)) return;

    const resultado = rehidratarCarrito(
      crudo,
      [quesoColonia, salame, nuezMariposa, mielFrasco],
      [piezaQueso, piezaSalame],
      [clienteDe({ id: 'c1', nombre: 'Marta' })],
    );

    expect(resultado.items.map((i) => i.clave)).toEqual(['item-0', 'item-1', 'item-2', 'item-3']);
    expect(resultado.descartados).toEqual([]);
    expect(resultado.descartadosSinNombre).toBe(0);
    expect(resultado.preciosCambiados).toEqual([]);
    expect(resultado.clienteDescartado).toBe(false);
    expect(resultado.items.map((i) => i.subtotalCents)).toEqual(
      items.map((i) => i.subtotalCents),
    );
  });
});
