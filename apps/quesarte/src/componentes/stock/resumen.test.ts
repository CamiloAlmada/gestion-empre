import { describe, expect, it } from 'vitest';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import {
  agruparPiezasPorProducto,
  calcularResumen,
  estadoVencimiento,
  formatearFecha,
  peorEstadoVencimiento,
  stockBajo,
  textoResumen,
} from './resumen';

function producto(over: Partial<Producto> & Pick<Producto, 'modoStock'>): Producto {
  return {
    id: 'prod1',
    nombre: 'Producto',
    categoria: 'cat',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
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
    fechaIngreso: new Date('2026-01-01'),
    estado: 'disponible',
    ...over,
  };
}

describe('agruparPiezasPorProducto', () => {
  it('agrupa piezas de varios productos', () => {
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
  it('fraccionado_por_pieza: suma pesoRestanteGramos con sumarPeso y toma el vencimiento más próximo', () => {
    const prod = producto({ modoStock: 'fraccionado_por_pieza' });
    const piezas = [
      pieza({ id: 'a', pesoRestanteGramos: peso(1000), fechaVencimiento: new Date('2026-08-01') }),
      pieza({ id: 'b', pesoRestanteGramos: peso(2500), fechaVencimiento: new Date('2026-07-15') }),
      pieza({ id: 'c', pesoRestanteGramos: peso(500) }), // sin vencimiento
    ];

    const resumen = calcularResumen(prod, piezas);

    expect(resumen).toEqual({
      tipo: 'piezas',
      cantidadPiezas: 3,
      pesoTotalGramos: peso(4000),
      vencimientoProximo: new Date('2026-07-15'),
    });
  });

  it('pieza_entera: mismo cálculo que fraccionado_por_pieza', () => {
    const prod = producto({ modoStock: 'pieza_entera' });
    const piezas = [pieza({ pesoRestanteGramos: peso(3000) })];

    const resumen = calcularResumen(prod, piezas);

    expect(resumen.tipo).toBe('piezas');
    expect(resumen).toMatchObject({ cantidadPiezas: 1, pesoTotalGramos: 3000 });
  });

  it('sin piezas: cantidadPiezas 0, peso 0, sin vencimiento', () => {
    const prod = producto({ modoStock: 'fraccionado_por_pieza' });

    const resumen = calcularResumen(prod, []);

    expect(resumen).toEqual({
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

// Fechas de calendario construidas con componentes locales (año, mes 0-index,
// día) a propósito: un ISO "solo fecha" (`new Date('2026-07-16')`) se parsea
// como medianoche UTC, que en UY (UTC-3) cae en el día anterior — el mismo
// desfase que hay que evitar al parsear el `<input type="date">` en los
// modales de la pantalla real.
function diaLocal(anio: number, mes: number, dia: number): Date {
  return new Date(anio, mes - 1, dia);
}

describe('estadoVencimiento', () => {
  const hoy = diaLocal(2026, 7, 8);

  it('sin fecha: null', () => {
    expect(estadoVencimiento(undefined, hoy)).toBeNull();
  });

  it('vence en 3 días: vence_pronto', () => {
    expect(estadoVencimiento(diaLocal(2026, 7, 11), hoy)).toBe('vence_pronto');
  });

  it('vence justo en el límite de 7 días: vence_pronto', () => {
    expect(estadoVencimiento(diaLocal(2026, 7, 15), hoy)).toBe('vence_pronto');
  });

  it('vence en 8 días: sin alerta', () => {
    expect(estadoVencimiento(diaLocal(2026, 7, 16), hoy)).toBeNull();
  });

  it('venció ayer: vencida', () => {
    expect(estadoVencimiento(diaLocal(2026, 7, 7), hoy)).toBe('vencida');
  });

  it('vence hoy: vence_pronto (no vencida)', () => {
    expect(estadoVencimiento(diaLocal(2026, 7, 8), hoy)).toBe('vence_pronto');
  });
});

describe('peorEstadoVencimiento', () => {
  const hoy = diaLocal(2026, 7, 8);

  it('una vencida entre varias: gana vencida', () => {
    const fechas = [diaLocal(2026, 7, 20), diaLocal(2026, 7, 1), undefined];
    expect(peorEstadoVencimiento(fechas, hoy)).toBe('vencida');
  });

  it('sin vencidas pero alguna vence pronto: vence_pronto', () => {
    const fechas = [diaLocal(2026, 7, 20), diaLocal(2026, 7, 10)];
    expect(peorEstadoVencimiento(fechas, hoy)).toBe('vence_pronto');
  });

  it('ninguna en alerta: null', () => {
    expect(peorEstadoVencimiento([diaLocal(2026, 9, 1)], hoy)).toBeNull();
  });
});

describe('stockBajo', () => {
  it('sin umbralAlertaStock: nunca es stock bajo', () => {
    const prod = producto({ modoStock: 'granel', stockGranelGramos: peso(0) });
    expect(stockBajo(prod, { tipo: 'granel', pesoTotalGramos: peso(0) })).toBe(false);
  });

  it('piezas por debajo del umbral: true', () => {
    const prod = producto({ modoStock: 'fraccionado_por_pieza', umbralAlertaStock: 1000 });
    const resumen = calcularResumen(prod, [pieza({ pesoRestanteGramos: peso(500) })]);
    expect(stockBajo(prod, resumen)).toBe(true);
  });

  it('piezas por encima del umbral: false', () => {
    const prod = producto({ modoStock: 'fraccionado_por_pieza', umbralAlertaStock: 1000 });
    const resumen = calcularResumen(prod, [pieza({ pesoRestanteGramos: peso(1500) })]);
    expect(stockBajo(prod, resumen)).toBe(false);
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

describe('formatearFecha', () => {
  it('formatea dd/mm/aaaa con ceros a la izquierda', () => {
    expect(formatearFecha(new Date('2026-01-05T12:00:00'))).toBe('05/01/2026');
  });
});

describe('textoResumen', () => {
  it('piezas: singular', () => {
    expect(textoResumen({ tipo: 'piezas', cantidadPiezas: 1, pesoTotalGramos: peso(500), vencimientoProximo: null })).toBe(
      '1 pieza · 500 g',
    );
  });

  it('piezas: plural y kg', () => {
    expect(
      textoResumen({ tipo: 'piezas', cantidadPiezas: 3, pesoTotalGramos: peso(4000), vencimientoProximo: null }),
    ).toBe('3 piezas · 4 kg');
  });

  it('granel', () => {
    expect(textoResumen({ tipo: 'granel', pesoTotalGramos: peso(1250) })).toBe('1,25 kg');
  });

  it('unidad: singular', () => {
    expect(textoResumen({ tipo: 'unidad', unidades: 1 })).toBe('1 unidad');
  });

  it('unidad: plural', () => {
    expect(textoResumen({ tipo: 'unidad', unidades: 4 })).toBe('4 unidades');
  });
});
