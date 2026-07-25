import { describe, expect, it } from 'vitest';
import { evaluarAlertas } from './alertas.js';
import { money } from './money.js';
import { peso } from './peso.js';
import { agruparPiezasPorProducto, type ContextoAlertas } from './stock.js';
import type { Pieza, Producto } from './tipos.js';

function producto(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock'>): Producto {
  return {
    nombre: `Producto ${over.id}`,
    categoria: 'cat',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

function pieza(over: Partial<Pieza> & Pick<Pieza, 'id' | 'productoId'>): Pieza {
  return {
    pesoInicialGramos: peso(5000),
    pesoRestanteGramos: peso(4000),
    costoKgCents: money(30000),
    fechaIngreso: new Date('2026-01-01T00:00:00Z'),
    estado: 'disponible',
    ...over,
  };
}

const OFFSET_UY = -180;

/** Instante UTC del mediodía uruguayo del día dado. */
function dia(anio: number, mes: number, d: number): Date {
  return new Date(Date.UTC(anio, mes - 1, d, 15, 0, 0));
}

function ctx(over: Partial<ContextoAlertas> = {}): ContextoAlertas {
  return { ahora: dia(2026, 7, 8), offsetMinutos: OFFSET_UY, diasAviso: 7, ...over };
}

describe('evaluarAlertas — vencimientos', () => {
  it('sin productos: las dos listas vacías', () => {
    expect(evaluarAlertas([], new Map(), ctx())).toEqual({ porVencer: [], bajoUmbral: [] });
  });

  it('una pieza que vence dentro de la ventana entra con su detalle', () => {
    const p = producto({ id: 'p1', nombre: 'Colonia', modoStock: 'fraccionado_por_pieza' });
    const piezas = [
      pieza({
        id: 'pz1',
        productoId: 'p1',
        pesoRestanteGramos: peso(2500),
        fechaVencimiento: dia(2026, 7, 11),
      }),
    ];

    const { porVencer } = evaluarAlertas([p], agruparPiezasPorProducto(piezas), ctx());

    expect(porVencer).toHaveLength(1);
    expect(porVencer[0]).toMatchObject({
      productoId: 'p1',
      nombreProducto: 'Colonia',
      peorEstado: 'vence_pronto',
      diasRestantesMin: 3,
      pesoEnAlertaGramos: 2500,
    });
    expect(porVencer[0]?.piezas.map((x) => x.pieza.id)).toEqual(['pz1']);
  });

  it('una pieza sin fechaVencimiento nunca alerta', () => {
    const p = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const piezas = [pieza({ id: 'pz1', productoId: 'p1' })];

    expect(evaluarAlertas([p], agruparPiezasPorProducto(piezas), ctx()).porVencer).toEqual([]);
  });

  it('el peso en alerta suma SOLO las piezas en alerta, no el stock entero', () => {
    const p = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const piezas = [
      pieza({
        id: 'urgente',
        productoId: 'p1',
        pesoRestanteGramos: peso(200),
        fechaVencimiento: dia(2026, 7, 10),
      }),
      pieza({
        id: 'lejana',
        productoId: 'p1',
        pesoRestanteGramos: peso(9000),
        fechaVencimiento: dia(2026, 11, 1),
      }),
      pieza({ id: 'sin-fecha', productoId: 'p1', pesoRestanteGramos: peso(3000) }),
    ];

    const { porVencer } = evaluarAlertas([p], agruparPiezasPorProducto(piezas), ctx());

    expect(porVencer[0]?.pesoEnAlertaGramos).toBe(200);
    expect(porVencer[0]?.piezas).toHaveLength(1);
  });

  it('con una pieza vencida entre varias, el peor estado es vencida y manda la más urgente', () => {
    const p = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const piezas = [
      pieza({ id: 'proxima', productoId: 'p1', fechaVencimiento: dia(2026, 7, 12) }),
      pieza({ id: 'vencida', productoId: 'p1', fechaVencimiento: dia(2026, 7, 5) }),
    ];

    const { porVencer } = evaluarAlertas([p], agruparPiezasPorProducto(piezas), ctx());

    expect(porVencer[0]?.peorEstado).toBe('vencida');
    expect(porVencer[0]?.diasRestantesMin).toBe(-3);
    expect(porVencer[0]?.piezas.map((x) => x.pieza.id)).toEqual(['vencida', 'proxima']);
    expect(porVencer[0]?.piezas.map((x) => x.estado)).toEqual(['vencida', 'vence_pronto']);
  });

  it('ordena los productos por urgencia y desempata por nombre', () => {
    const productos = [
      producto({ id: 'b', nombre: 'Bardo', modoStock: 'pieza_entera' }),
      producto({ id: 'a', nombre: 'Anillo', modoStock: 'pieza_entera' }),
      producto({ id: 'z', nombre: 'Zapallo', modoStock: 'pieza_entera' }),
    ];
    const piezas = [
      pieza({ id: 'pb', productoId: 'b', fechaVencimiento: dia(2026, 7, 10) }),
      pieza({ id: 'pa', productoId: 'a', fechaVencimiento: dia(2026, 7, 10) }),
      pieza({ id: 'pz', productoId: 'z', fechaVencimiento: dia(2026, 7, 6) }),
    ];

    const { porVencer } = evaluarAlertas(productos, agruparPiezasPorProducto(piezas), ctx());

    expect(porVencer.map((a) => a.nombreProducto)).toEqual(['Zapallo', 'Anillo', 'Bardo']);
  });

  it('la ventana configurada cambia el resultado y nada más', () => {
    const p = producto({ id: 'p1', modoStock: 'pieza_entera' });
    const piezas = agruparPiezasPorProducto([
      pieza({ id: 'pz1', productoId: 'p1', fechaVencimiento: dia(2026, 7, 20) }),
    ]);

    expect(evaluarAlertas([p], piezas, ctx({ diasAviso: 7 })).porVencer).toEqual([]);
    expect(evaluarAlertas([p], piezas, ctx({ diasAviso: 14 })).porVencer).toHaveLength(1);
  });

  it('granel y unidad_simple no tienen vencimiento aunque haya piezas colgadas', () => {
    const productos = [
      producto({ id: 'g', modoStock: 'granel', stockGranelGramos: peso(5000) }),
      producto({ id: 'u', modoPrecio: 'por_unidad', modoStock: 'unidad_simple', stockUnidades: 9 }),
    ];
    // Piezas huérfanas apuntando a productos que no son por pieza: el resumen
    // las ignora, y el vencimiento también tiene que ignorarlas.
    const piezas = agruparPiezasPorProducto([
      pieza({ id: 'pz1', productoId: 'g', fechaVencimiento: dia(2026, 7, 9) }),
      pieza({ id: 'pz2', productoId: 'u', fechaVencimiento: dia(2026, 7, 9) }),
    ]);

    expect(evaluarAlertas(productos, piezas, ctx()).porVencer).toEqual([]);
  });
});

describe('evaluarAlertas — stock bajo', () => {
  it('producto sin umbral configurado nunca entra', () => {
    const p = producto({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(0) });
    expect(evaluarAlertas([p], new Map(), ctx()).bajoUmbral).toEqual([]);
  });

  it('granel bajo el umbral: magnitud peso, existencia y umbral en gramos', () => {
    const p = producto({
      id: 'p1',
      nombre: 'Ricota',
      modoStock: 'granel',
      stockGranelGramos: peso(400),
      umbralAlertaStock: 1000,
    });

    expect(evaluarAlertas([p], new Map(), ctx()).bajoUmbral).toEqual([
      {
        productoId: 'p1',
        nombreProducto: 'Ricota',
        magnitud: 'peso',
        existencia: 400,
        umbral: 1000,
        proporcionDelUmbral: 0.4,
      },
    ]);
  });

  it('unidad_simple bajo el umbral: magnitud unidades', () => {
    const p = producto({
      id: 'p1',
      modoPrecio: 'por_unidad',
      modoStock: 'unidad_simple',
      stockUnidades: 2,
      umbralAlertaStock: 8,
    });

    expect(evaluarAlertas([p], new Map(), ctx()).bajoUmbral[0]).toMatchObject({
      magnitud: 'unidades',
      existencia: 2,
      umbral: 8,
      proporcionDelUmbral: 0.25,
    });
  });

  it('productos por pieza: la existencia es el peso restante sumado', () => {
    const p = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza', umbralAlertaStock: 3000 });
    const piezas = agruparPiezasPorProducto([
      pieza({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(800) }),
      pieza({ id: 'pz2', productoId: 'p1', pesoRestanteGramos: peso(1200) }),
    ]);

    expect(evaluarAlertas([p], piezas, ctx()).bajoUmbral[0]).toMatchObject({
      magnitud: 'peso',
      existencia: 2000,
      umbral: 3000,
    });
  });

  it('ordena por proporción del umbral: lo más desabastecido primero, aunque mezcle unidades', () => {
    const productos = [
      producto({
        id: 'medio',
        nombre: 'Medio',
        modoStock: 'granel',
        stockGranelGramos: peso(500),
        umbralAlertaStock: 1000,
      }),
      producto({
        id: 'critico',
        nombre: 'Crítico',
        modoPrecio: 'por_unidad',
        modoStock: 'unidad_simple',
        stockUnidades: 1,
        umbralAlertaStock: 20,
      }),
    ];

    const { bajoUmbral } = evaluarAlertas(productos, new Map(), ctx());

    expect(bajoUmbral.map((a) => a.nombreProducto)).toEqual(['Crítico', 'Medio']);
  });

  it('umbral 0 no produce alerta (no divide por cero ni inventa urgencia)', () => {
    const p = producto({
      id: 'p1',
      modoStock: 'granel',
      stockGranelGramos: peso(0),
      umbralAlertaStock: 0,
    });

    expect(evaluarAlertas([p], new Map(), ctx()).bajoUmbral).toEqual([]);
  });
});

describe('evaluarAlertas — las dos alertas juntas', () => {
  it('un mismo producto puede estar por vencer Y bajo el mínimo a la vez', () => {
    const p = producto({
      id: 'p1',
      nombre: 'Colonia',
      modoStock: 'fraccionado_por_pieza',
      umbralAlertaStock: 5000,
    });
    const piezas = agruparPiezasPorProducto([
      pieza({
        id: 'pz1',
        productoId: 'p1',
        pesoRestanteGramos: peso(900),
        fechaVencimiento: dia(2026, 7, 9),
      }),
    ]);

    const alertas = evaluarAlertas([p], piezas, ctx());

    expect(alertas.porVencer.map((a) => a.productoId)).toEqual(['p1']);
    expect(alertas.bajoUmbral.map((a) => a.productoId)).toEqual(['p1']);
  });

  it('el llamador decide el recorte: un producto que no se pasa, no alerta', () => {
    // Es como las pantallas excluyen a los inactivos (docs/06-ui-ux.md §2).
    const activo = producto({ id: 'a', nombre: 'Activo', modoStock: 'pieza_entera' });
    const inactivo = producto({ id: 'i', nombre: 'Inactivo', modoStock: 'pieza_entera', activo: false });
    const piezas = agruparPiezasPorProducto([
      pieza({ id: 'pa', productoId: 'a', fechaVencimiento: dia(2026, 7, 9) }),
      pieza({ id: 'pi', productoId: 'i', fechaVencimiento: dia(2026, 7, 9) }),
    ]);

    const soloActivos = evaluarAlertas([activo], piezas, ctx());

    expect(soloActivos.porVencer.map((a) => a.productoId)).toEqual(['a']);
    expect(evaluarAlertas([activo, inactivo], piezas, ctx()).porVencer).toHaveLength(2);
  });

  it('un producto sin entrada en el mapa de piezas se evalúa sin piezas, no explota', () => {
    const p = producto({ id: 'p1', modoStock: 'pieza_entera', umbralAlertaStock: 1000 });

    const alertas = evaluarAlertas([p], new Map(), ctx());

    expect(alertas.porVencer).toEqual([]);
    expect(alertas.bajoUmbral).toHaveLength(1);
  });
});
