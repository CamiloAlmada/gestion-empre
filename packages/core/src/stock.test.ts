import { describe, expect, it } from 'vitest';
import { money } from './money.js';
import { peso } from './peso.js';
import {
  DIAS_AVISO_VENCIMIENTO_DEFAULT,
  DIAS_AVISO_VENCIMIENTO_MAX,
  DIAS_AVISO_VENCIMIENTO_MIN,
  agruparPiezasPorProducto,
  calcularResumen,
  diasAvisoValido,
  diasHastaVencimiento,
  estadoVencimiento,
  normalizarDiasAviso,
  peorEstadoVencimiento,
  stockBajo,
  type ContextoAlertas,
} from './stock.js';
import type { Pieza, Producto } from './tipos.js';

function producto(over: Partial<Producto> & Pick<Producto, 'modoStock'>): Producto {
  return {
    id: 'prod1',
    nombre: 'Producto',
    categoria: 'cat',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

function pieza(over: Partial<Pieza> = {}): Pieza {
  return {
    id: 'pz1',
    productoId: 'prod1',
    pesoInicialGramos: peso(5000),
    pesoRestanteGramos: peso(4000),
    costoKgCents: money(30000),
    fechaIngreso: new Date('2026-01-01T00:00:00Z'),
    estado: 'disponible',
    ...over,
  };
}

// Uruguay: UTC-3 fijo (sin horario de verano desde 2015). Las fechas se
// construyen en UTC y el offset se pasa explícito, así los tests no dependen
// de la zona horaria de la máquina que los corre.
const OFFSET_UY = -180;

/** Instante UTC de las 12:00 hora local uruguaya del día dado. */
function mediodiaUy(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, 15, 0, 0));
}

function ctx(over: Partial<ContextoAlertas> = {}): ContextoAlertas {
  return {
    ahora: mediodiaUy(2026, 7, 8),
    offsetMinutos: OFFSET_UY,
    diasAviso: DIAS_AVISO_VENCIMIENTO_DEFAULT,
    ...over,
  };
}

describe('constantes de días de aviso', () => {
  it('el default es 7 (una semana entera de venta) y está dentro del rango', () => {
    expect(DIAS_AVISO_VENCIMIENTO_DEFAULT).toBe(7);
    expect(DIAS_AVISO_VENCIMIENTO_DEFAULT).toBeGreaterThanOrEqual(DIAS_AVISO_VENCIMIENTO_MIN);
    expect(DIAS_AVISO_VENCIMIENTO_DEFAULT).toBeLessThanOrEqual(DIAS_AVISO_VENCIMIENTO_MAX);
  });
});

describe('diasAvisoValido', () => {
  it('acepta los extremos del rango', () => {
    expect(diasAvisoValido(DIAS_AVISO_VENCIMIENTO_MIN)).toBe(true);
    expect(diasAvisoValido(DIAS_AVISO_VENCIMIENTO_MAX)).toBe(true);
  });

  it('rechaza fuera de rango, no enteros y no números', () => {
    expect(diasAvisoValido(0)).toBe(false);
    expect(diasAvisoValido(DIAS_AVISO_VENCIMIENTO_MAX + 1)).toBe(false);
    expect(diasAvisoValido(7.5)).toBe(false);
    expect(diasAvisoValido(-1)).toBe(false);
    expect(diasAvisoValido(Number.NaN)).toBe(false);
    expect(diasAvisoValido('7')).toBe(false);
    expect(diasAvisoValido(undefined)).toBe(false);
  });
});

describe('normalizarDiasAviso', () => {
  it('respeta un valor válido', () => {
    expect(normalizarDiasAviso(14)).toBe(14);
  });

  it('cae al default con ausente, fuera de rango o corrupto', () => {
    expect(normalizarDiasAviso(undefined)).toBe(DIAS_AVISO_VENCIMIENTO_DEFAULT);
    expect(normalizarDiasAviso(0)).toBe(DIAS_AVISO_VENCIMIENTO_DEFAULT);
    expect(normalizarDiasAviso(1000)).toBe(DIAS_AVISO_VENCIMIENTO_DEFAULT);
    expect(normalizarDiasAviso(3.7)).toBe(DIAS_AVISO_VENCIMIENTO_DEFAULT);
  });
});

describe('agruparPiezasPorProducto', () => {
  it('agrupa piezas de varios productos preservando el orden de entrada', () => {
    const piezas = [
      pieza({ id: 'a', productoId: 'p1' }),
      pieza({ id: 'b', productoId: 'p2' }),
      pieza({ id: 'c', productoId: 'p1' }),
    ];

    const mapa = agruparPiezasPorProducto(piezas);

    expect(mapa.get('p1')?.map((p) => p.id)).toEqual(['a', 'c']);
    expect(mapa.get('p2')?.map((p) => p.id)).toEqual(['b']);
  });

  it('lista vacía: mapa vacío', () => {
    expect(agruparPiezasPorProducto([]).size).toBe(0);
  });
});

describe('calcularResumen', () => {
  it('fraccionado_por_pieza: suma pesoRestanteGramos y toma el vencimiento más próximo', () => {
    const prod = producto({ modoStock: 'fraccionado_por_pieza' });
    const piezas = [
      pieza({ id: 'a', pesoRestanteGramos: peso(1000), fechaVencimiento: mediodiaUy(2026, 8, 1) }),
      pieza({ id: 'b', pesoRestanteGramos: peso(2500), fechaVencimiento: mediodiaUy(2026, 7, 15) }),
      pieza({ id: 'c', pesoRestanteGramos: peso(500) }), // sin vencimiento
    ];

    expect(calcularResumen(prod, piezas)).toEqual({
      tipo: 'piezas',
      cantidadPiezas: 3,
      pesoTotalGramos: peso(4000),
      vencimientoProximo: mediodiaUy(2026, 7, 15),
    });
  });

  it('pieza_entera: mismo cálculo que fraccionado_por_pieza', () => {
    const prod = producto({ modoStock: 'pieza_entera' });
    const resumen = calcularResumen(prod, [pieza({ pesoRestanteGramos: peso(3000) })]);

    expect(resumen.tipo).toBe('piezas');
    expect(resumen).toMatchObject({ cantidadPiezas: 1, pesoTotalGramos: 3000 });
  });

  it('sin piezas: cantidadPiezas 0, peso 0, sin vencimiento', () => {
    const prod = producto({ modoStock: 'fraccionado_por_pieza' });

    expect(calcularResumen(prod, [])).toEqual({
      tipo: 'piezas',
      cantidadPiezas: 0,
      pesoTotalGramos: peso(0),
      vencimientoProximo: null,
    });
  });

  it('granel: usa stockGranelGramos del producto', () => {
    const prod = producto({ modoStock: 'granel', stockGranelGramos: peso(7500) });
    expect(calcularResumen(prod, [])).toEqual({ tipo: 'granel', pesoTotalGramos: peso(7500) });
  });

  it('granel sin stockGranelGramos: 0', () => {
    const prod = producto({ modoStock: 'granel' });
    expect(calcularResumen(prod, [])).toEqual({ tipo: 'granel', pesoTotalGramos: peso(0) });
  });

  it('unidad_simple: usa stockUnidades del producto', () => {
    const prod = producto({ modoPrecio: 'por_unidad', modoStock: 'unidad_simple', stockUnidades: 12 });
    expect(calcularResumen(prod, [])).toEqual({ tipo: 'unidad', unidades: 12 });
  });

  it('unidad_simple sin stockUnidades: 0', () => {
    const prod = producto({ modoPrecio: 'por_unidad', modoStock: 'unidad_simple' });
    expect(calcularResumen(prod, [])).toEqual({ tipo: 'unidad', unidades: 0 });
  });
});

describe('diasHastaVencimiento', () => {
  it('vence hoy: 0, sin importar la hora del día', () => {
    // 23:00 local del mismo día: sigue siendo "vence hoy".
    const casiMedianoche = new Date(Date.UTC(2026, 6, 9, 2, 0, 0));
    expect(diasHastaVencimiento(casiMedianoche, ctx())).toBe(0);
  });

  it('cuenta días de calendario hacia adelante', () => {
    expect(diasHastaVencimiento(mediodiaUy(2026, 7, 11), ctx())).toBe(3);
  });

  it('negativo para una fecha pasada', () => {
    expect(diasHastaVencimiento(mediodiaUy(2026, 7, 1), ctx())).toBe(-7);
  });

  it('cruza el cambio de mes sin errores de aritmética', () => {
    const enero31 = ctx({ ahora: mediodiaUy(2026, 1, 31) });
    expect(diasHastaVencimiento(mediodiaUy(2026, 2, 2), enero31)).toBe(2);
  });

  it('la medianoche local es el corte, no la UTC', () => {
    // 2026-07-09T01:00Z = 2026-07-08 22:00 en UY: todavía "hoy" en Uruguay,
    // aunque en UTC ya sea el día siguiente.
    const nocheUy = new Date(Date.UTC(2026, 6, 9, 1, 0, 0));
    expect(diasHastaVencimiento(nocheUy, ctx())).toBe(0);
  });
});

describe('estadoVencimiento', () => {
  it('sin fecha: null', () => {
    expect(estadoVencimiento(undefined, ctx())).toBeNull();
  });

  it('vence en 3 días con aviso de 7: vence_pronto', () => {
    expect(estadoVencimiento(mediodiaUy(2026, 7, 11), ctx())).toBe('vence_pronto');
  });

  it('vence justo en el límite del aviso: vence_pronto', () => {
    expect(estadoVencimiento(mediodiaUy(2026, 7, 15), ctx())).toBe('vence_pronto');
  });

  it('vence un día después del límite: sin alerta', () => {
    expect(estadoVencimiento(mediodiaUy(2026, 7, 16), ctx())).toBeNull();
  });

  it('venció ayer: vencida', () => {
    expect(estadoVencimiento(mediodiaUy(2026, 7, 7), ctx())).toBe('vencida');
  });

  it('vence hoy: vence_pronto (todavía se puede vender)', () => {
    expect(estadoVencimiento(mediodiaUy(2026, 7, 8), ctx())).toBe('vence_pronto');
  });

  it('el umbral configurado corre la ventana: con 14 días alerta lo que con 7 no', () => {
    const dentroDeDoceDias = mediodiaUy(2026, 7, 20);
    expect(estadoVencimiento(dentroDeDoceDias, ctx({ diasAviso: 7 }))).toBeNull();
    expect(estadoVencimiento(dentroDeDoceDias, ctx({ diasAviso: 14 }))).toBe('vence_pronto');
  });

  it('con aviso 0 solo alerta lo que vence hoy o ya venció', () => {
    expect(estadoVencimiento(mediodiaUy(2026, 7, 8), ctx({ diasAviso: 0 }))).toBe('vence_pronto');
    expect(estadoVencimiento(mediodiaUy(2026, 7, 9), ctx({ diasAviso: 0 }))).toBeNull();
    expect(estadoVencimiento(mediodiaUy(2026, 7, 7), ctx({ diasAviso: 0 }))).toBe('vencida');
  });

  it('una fecha vencida alerta aunque quede fuera de la ventana de aviso', () => {
    expect(estadoVencimiento(mediodiaUy(2025, 1, 1), ctx())).toBe('vencida');
  });

  it('diasAviso no entero o negativo: RangeError (error de programación)', () => {
    expect(() => estadoVencimiento(mediodiaUy(2026, 7, 9), ctx({ diasAviso: 2.5 }))).toThrow(RangeError);
    expect(() => estadoVencimiento(mediodiaUy(2026, 7, 9), ctx({ diasAviso: -1 }))).toThrow(RangeError);
  });

  it('offsetMinutos no finito: RangeError (lo valida periodoDe)', () => {
    expect(() =>
      estadoVencimiento(mediodiaUy(2026, 7, 9), ctx({ offsetMinutos: Number.NaN })),
    ).toThrow(RangeError);
  });
});

describe('peorEstadoVencimiento', () => {
  it('una vencida entre varias: gana vencida', () => {
    const fechas = [mediodiaUy(2026, 7, 20), mediodiaUy(2026, 7, 1), undefined];
    expect(peorEstadoVencimiento(fechas, ctx())).toBe('vencida');
  });

  it('sin vencidas pero alguna vence pronto: vence_pronto', () => {
    const fechas = [mediodiaUy(2026, 7, 20), mediodiaUy(2026, 7, 10)];
    expect(peorEstadoVencimiento(fechas, ctx())).toBe('vence_pronto');
  });

  it('ninguna en alerta: null', () => {
    expect(peorEstadoVencimiento([mediodiaUy(2026, 9, 1)], ctx())).toBeNull();
  });

  it('lista vacía: null', () => {
    expect(peorEstadoVencimiento([], ctx())).toBeNull();
  });
});

describe('stockBajo', () => {
  it('sin umbralAlertaStock: nunca es stock bajo', () => {
    const prod = producto({ modoStock: 'granel', stockGranelGramos: peso(0) });
    expect(stockBajo(prod, { tipo: 'granel', pesoTotalGramos: peso(0) })).toBe(false);
  });

  it('piezas por debajo del umbral: true', () => {
    const prod = producto({ modoStock: 'fraccionado_por_pieza', umbralAlertaStock: 1000 });
    expect(stockBajo(prod, calcularResumen(prod, [pieza({ pesoRestanteGramos: peso(500) })]))).toBe(true);
  });

  it('piezas por encima del umbral: false', () => {
    const prod = producto({ modoStock: 'fraccionado_por_pieza', umbralAlertaStock: 1000 });
    expect(stockBajo(prod, calcularResumen(prod, [pieza({ pesoRestanteGramos: peso(1500) })]))).toBe(false);
  });

  it('exactamente en el umbral: NO es stock bajo (el umbral es el mínimo aceptable)', () => {
    const prod = producto({ modoStock: 'fraccionado_por_pieza', umbralAlertaStock: 1000 });
    expect(stockBajo(prod, calcularResumen(prod, [pieza({ pesoRestanteGramos: peso(1000) })]))).toBe(false);
  });

  it('granel por debajo del umbral: true', () => {
    const prod = producto({ modoStock: 'granel', stockGranelGramos: peso(200), umbralAlertaStock: 500 });
    expect(stockBajo(prod, calcularResumen(prod, []))).toBe(true);
  });

  it('unidad_simple por debajo del umbral: true', () => {
    const prod = producto({
      modoPrecio: 'por_unidad',
      modoStock: 'unidad_simple',
      stockUnidades: 2,
      umbralAlertaStock: 5,
    });
    expect(stockBajo(prod, calcularResumen(prod, []))).toBe(true);
  });
});
