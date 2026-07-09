import { describe, expect, it } from 'vitest';
import { money, peso, type Producto } from '@gestion/core';
import { contarAlertas, filtrarPorAlerta } from './alertas';
import { calcularResumen, type ResumenStock } from './resumen';

function producto(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock'>): Producto {
  return {
    nombre: `Producto ${over.id}`,
    categoria: 'cat',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

/** Resumen 'piezas' con un único vencimiento (o sin vencimiento). */
function resumenPiezas(vencimientoProximo: Date | null): ResumenStock {
  return { tipo: 'piezas', cantidadPiezas: 1, pesoTotalGramos: peso(1000), vencimientoProximo };
}

function resumenGranel(pesoTotalGramos: number): ResumenStock {
  return { tipo: 'granel', pesoTotalGramos: peso(pesoTotalGramos) };
}

// Relativas a "hoy" (momento de ejecución del test), igual que
// `ListaProductos.test.tsx`: `estadoVencimiento` compara contra `new Date()`
// por defecto, así que una fecha fija hardcodeada quedaría desactualizada.
const HOY = new Date();
const AYER = new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() - 1);
const EN_3_DIAS = new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + 3);
const EN_30_DIAS = new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + 30);

describe('contarAlertas', () => {
  it('sin productos: conteo en cero', () => {
    expect(contarAlertas([], new Map())).toEqual({ porVencer: 0, stockBajo: 0 });
  });

  it('sin ninguna alerta disparada: conteo en cero', () => {
    const p1 = producto({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(5000) });
    const resumenes = new Map([['p1', resumenGranel(5000)]]);

    expect(contarAlertas([p1], resumenes)).toEqual({ porVencer: 0, stockBajo: 0 });
  });

  it('solo vencidas: cuentan como "por vencer"', () => {
    const p1 = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const p2 = producto({ id: 'p2', modoStock: 'fraccionado_por_pieza' });
    const resumenes = new Map([
      ['p1', resumenPiezas(AYER)],
      ['p2', resumenPiezas(EN_30_DIAS)],
    ]);

    expect(contarAlertas([p1, p2], resumenes)).toEqual({ porVencer: 1, stockBajo: 0 });
  });

  it('vencidas y vence-pronto se suman juntas bajo "por vencer"', () => {
    const p1 = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const p2 = producto({ id: 'p2', modoStock: 'fraccionado_por_pieza' });
    const resumenes = new Map([
      ['p1', resumenPiezas(AYER)],
      ['p2', resumenPiezas(EN_3_DIAS)],
    ]);

    expect(contarAlertas([p1, p2], resumenes)).toEqual({ porVencer: 2, stockBajo: 0 });
  });

  it('mezcla: vencimiento y stock bajo se cuentan independientemente (un producto puede disparar ambas)', () => {
    const p1 = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza', umbralAlertaStock: 2000 });
    const p2 = producto({ id: 'p2', modoStock: 'granel', stockGranelGramos: peso(100), umbralAlertaStock: 500 });
    const resumenP1: ResumenStock = {
      tipo: 'piezas',
      cantidadPiezas: 1,
      pesoTotalGramos: peso(1000),
      vencimientoProximo: AYER,
    }; // vence Y bajo (umbral 2000)
    const resumenes = new Map<string, ResumenStock>([
      ['p1', resumenP1],
      ['p2', resumenGranel(100)], // solo bajo
    ]);

    expect(contarAlertas([p1, p2], resumenes)).toEqual({ porVencer: 1, stockBajo: 2 });
  });

  it('granel/unidad nunca disparan "por vencer" aunque tengan resumen', () => {
    const p1 = producto({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(5000) });
    const resumenes = new Map([['p1', resumenGranel(5000)]]);

    expect(contarAlertas([p1], resumenes).porVencer).toBe(0);
  });

  it('producto sin resumen en el mapa: se ignora (no rompe)', () => {
    const p1 = producto({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(5000) });

    expect(contarAlertas([p1], new Map())).toEqual({ porVencer: 0, stockBajo: 0 });
  });
});

describe('filtrarPorAlerta', () => {
  it('alerta === null: devuelve todos los productos sin filtrar', () => {
    const p1 = producto({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(5000) });
    const p2 = producto({ id: 'p2', modoStock: 'granel', stockGranelGramos: peso(100), umbralAlertaStock: 500 });
    const resumenes = new Map([
      ['p1', resumenGranel(5000)],
      ['p2', resumenGranel(100)],
    ]);

    expect(filtrarPorAlerta([p1, p2], resumenes, null)).toEqual([p1, p2]);
  });

  it('"por_vencer": solo deja productos vencidos o por vencer', () => {
    const p1 = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const p2 = producto({ id: 'p2', modoStock: 'fraccionado_por_pieza' });
    const resumenes = new Map([
      ['p1', resumenPiezas(AYER)],
      ['p2', resumenPiezas(EN_30_DIAS)],
    ]);

    expect(filtrarPorAlerta([p1, p2], resumenes, 'por_vencer')).toEqual([p1]);
  });

  it('"stock_bajo": solo deja productos por debajo del umbral', () => {
    const p1 = producto({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(100), umbralAlertaStock: 500 });
    const p2 = producto({ id: 'p2', modoStock: 'granel', stockGranelGramos: peso(5000) });
    const resumenes = new Map([
      ['p1', resumenGranel(100)],
      ['p2', resumenGranel(5000)],
    ]);

    expect(filtrarPorAlerta([p1, p2], resumenes, 'stock_bajo')).toEqual([p1]);
  });

  it('sin coincidencias: devuelve lista vacía', () => {
    const p1 = producto({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(5000) });
    const resumenes = new Map([['p1', resumenGranel(5000)]]);

    expect(filtrarPorAlerta([p1], resumenes, 'stock_bajo')).toEqual([]);
  });

  it('toggle-equivalencia: filtrar y luego "quitar" el filtro (alerta null) devuelve la lista original completa', () => {
    const p1 = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const p2 = producto({ id: 'p2', modoStock: 'granel', stockGranelGramos: peso(100), umbralAlertaStock: 500 });
    const original = [p1, p2];
    const resumenes = new Map([
      ['p1', resumenPiezas(AYER)],
      ['p2', resumenGranel(100)],
    ]);

    const filtrado = filtrarPorAlerta(original, resumenes, 'por_vencer');
    expect(filtrado).toEqual([p1]);

    const sinFiltro = filtrarPorAlerta(original, resumenes, null);
    expect(sinFiltro).toEqual(original);
  });

  it('producto sin resumen en el mapa: se excluye de cualquier filtro por alerta', () => {
    const p1 = producto({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(100) });

    expect(filtrarPorAlerta([p1], new Map(), 'stock_bajo')).toEqual([]);
    expect(filtrarPorAlerta([p1], new Map(), 'por_vencer')).toEqual([]);
  });
});

describe('contarAlertas + filtrarPorAlerta integrados con calcularResumen real', () => {
  it('usa el mismo resumen que calcularResumen produce para un producto por pieza vencido', () => {
    const p1 = producto({ id: 'p1', modoStock: 'fraccionado_por_pieza' });
    const resumen = calcularResumen(p1, [
      {
        id: 'pz1',
        productoId: 'p1',
        pesoInicialGramos: peso(1000),
        pesoRestanteGramos: peso(1000),
        costoKgCents: money(1000),
        fechaIngreso: new Date('2026-01-01'),
        fechaVencimiento: AYER,
        estado: 'disponible',
      },
    ]);
    const resumenes = new Map([['p1', resumen]]);

    expect(contarAlertas([p1], resumenes)).toEqual({ porVencer: 1, stockBajo: 0 });
    expect(filtrarPorAlerta([p1], resumenes, 'por_vencer')).toEqual([p1]);
  });
});
