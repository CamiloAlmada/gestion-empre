import { describe, expect, it } from 'vitest';
import {
  DIAS_AVISO_VENCIMIENTO_DEFAULT,
  agruparPiezasPorProducto,
  evaluarAlertas,
  money,
  peso,
  type Alertas,
  type ContextoAlertas,
  type Pieza,
  type Producto,
} from '@gestion/core';
import { conteoDeAlertas, idsEnAlerta } from './alertas';

// La decisión de QUÉ está en alerta se testea en `packages/core`
// (`alertas.test.ts`). Acá se testea solo la proyección a lo que consume la
// franja de chips y —lo importante— que esa proyección salga del MISMO
// resultado que consume Reportes: por eso los casos parten de `evaluarAlertas`
// real y no de un `Alertas` armado a mano.

function producto(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock'>): Producto {
  return {
    nombre: `Producto ${over.id}`,
    categoria: 'cat',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date(2026, 0, 1),
    ...over,
  };
}

function pieza(over: Partial<Pieza> & Pick<Pieza, 'id' | 'productoId'>): Pieza {
  return {
    pesoInicialGramos: peso(5000),
    pesoRestanteGramos: peso(4000),
    costoKgCents: money(30000),
    fechaIngreso: new Date(2026, 0, 1),
    estado: 'disponible',
    ...over,
  };
}

/** Instante UTC del mediodía uruguayo del día dado. */
function dia(anio: number, mes: number, d: number): Date {
  return new Date(Date.UTC(anio, mes - 1, d, 15, 0, 0));
}

const CTX: ContextoAlertas = {
  ahora: dia(2026, 7, 8),
  offsetMinutos: -180,
  diasAviso: DIAS_AVISO_VENCIMIENTO_DEFAULT,
};

const SIN_ALERTAS: Alertas = { porVencer: [], bajoUmbral: [] };

describe('conteoDeAlertas', () => {
  it('sin alertas: los dos conteos en cero', () => {
    expect(conteoDeAlertas(SIN_ALERTAS)).toEqual({ porVencer: 0, stockBajo: 0 });
  });

  it('cuenta PRODUCTOS, no piezas: dos piezas del mismo producto suman una sola alerta', () => {
    const p = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const piezas = agruparPiezasPorProducto([
      pieza({ id: 'a', productoId: 'p1', fechaVencimiento: dia(2026, 7, 9) }),
      pieza({ id: 'b', productoId: 'p1', fechaVencimiento: dia(2026, 7, 10) }),
    ]);

    expect(conteoDeAlertas(evaluarAlertas([p], piezas, CTX))).toEqual({ porVencer: 1, stockBajo: 0 });
  });

  it('agrupa vencidas y por vencer en un mismo conteo', () => {
    const productos = [
      producto({ id: 'venc', modoStock: 'pieza_entera' }),
      producto({ id: 'pronto', modoStock: 'pieza_entera' }),
    ];
    const piezas = agruparPiezasPorProducto([
      pieza({ id: 'a', productoId: 'venc', fechaVencimiento: dia(2026, 7, 1) }),
      pieza({ id: 'b', productoId: 'pronto', fechaVencimiento: dia(2026, 7, 10) }),
    ]);

    expect(conteoDeAlertas(evaluarAlertas(productos, piezas, CTX)).porVencer).toBe(2);
  });

  it('cuenta stock bajo por separado, y un producto puede estar en los dos', () => {
    const p = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza', umbralAlertaStock: 10_000 });
    const piezas = agruparPiezasPorProducto([
      pieza({ id: 'a', productoId: 'p1', pesoRestanteGramos: peso(900), fechaVencimiento: dia(2026, 7, 9) }),
    ]);

    expect(conteoDeAlertas(evaluarAlertas([p], piezas, CTX))).toEqual({ porVencer: 1, stockBajo: 1 });
  });

  it('la ventana configurada cambia el conteo', () => {
    const p = producto({ id: 'p1', modoStock: 'pieza_entera' });
    const piezas = agruparPiezasPorProducto([
      pieza({ id: 'a', productoId: 'p1', fechaVencimiento: dia(2026, 7, 20) }),
    ]);

    expect(conteoDeAlertas(evaluarAlertas([p], piezas, { ...CTX, diasAviso: 7 })).porVencer).toBe(0);
    expect(conteoDeAlertas(evaluarAlertas([p], piezas, { ...CTX, diasAviso: 14 })).porVencer).toBe(1);
  });
});

describe('idsEnAlerta', () => {
  const productos = [
    producto({ id: 'vence', modoStock: 'pieza_entera' }),
    producto({ id: 'bajo', modoStock: 'granel', stockGranelGramos: peso(100), umbralAlertaStock: 500 }),
  ];
  const piezas = agruparPiezasPorProducto([
    pieza({ id: 'a', productoId: 'vence', fechaVencimiento: dia(2026, 7, 9) }),
  ]);
  const alertas = evaluarAlertas(productos, piezas, CTX);

  it('sin alerta activa devuelve null (la señal de "sin filtro")', () => {
    expect(idsEnAlerta(alertas, null)).toBeNull();
  });

  it('por_vencer devuelve solo los productos por vencer', () => {
    expect(idsEnAlerta(alertas, 'por_vencer')).toEqual(new Set(['vence']));
  });

  it('stock_bajo devuelve solo los productos bajo el mínimo', () => {
    expect(idsEnAlerta(alertas, 'stock_bajo')).toEqual(new Set(['bajo']));
  });

  it('sin alertas de ese tipo devuelve un set vacío, no null', () => {
    expect(idsEnAlerta(SIN_ALERTAS, 'por_vencer')).toEqual(new Set());
  });
});
