import { describe, expect, it } from 'vitest';
import { peso, type MovimientoStock } from '@gestion/core';
import {
  etiquetaTipoMovimiento,
  formatearDeltaMovimiento,
  formatearFecha,
  textoResumen,
} from './resumen';

// El CÁLCULO (agrupar piezas, resumir existencias, vencimiento, stock bajo) se
// mudó a `packages/core` en la tarea B3 y se testea ahí
// (`packages/core/src/stock.test.ts`): acá queda lo que sigue siendo de esta
// app, la presentación en español.

describe('formatearFecha', () => {
  it('formatea dd/mm/aaaa con ceros a la izquierda', () => {
    expect(formatearFecha(new Date(2026, 0, 5, 12, 0, 0))).toBe('05/01/2026');
  });
});

describe('textoResumen', () => {
  it('piezas: singular', () => {
    expect(
      textoResumen({ tipo: 'piezas', cantidadPiezas: 1, pesoTotalGramos: peso(500), vencimientoProximo: null }),
    ).toBe('1 pieza · 500 g');
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

describe('etiquetaTipoMovimiento', () => {
  it('traduce cada tipo a su etiqueta en español', () => {
    expect(etiquetaTipoMovimiento('ingreso_compra')).toBe('Ingreso por compra');
    expect(etiquetaTipoMovimiento('merma')).toBe('Merma');
    expect(etiquetaTipoMovimiento('ajuste_negativo')).toBe('Ajuste (-)');
  });
});

describe('formatearDeltaMovimiento', () => {
  const base: MovimientoStock = {
    id: 'mov1',
    productoId: 'p1',
    tipo: 'ajuste_positivo',
    origenTipo: 'ajuste',
    origenId: 'aj1',
    fecha: new Date(2026, 0, 1),
    usuarioId: 'u1',
  };

  it('gramos positivos llevan signo + explícito', () => {
    expect(formatearDeltaMovimiento({ ...base, deltaGramos: peso(1500) })).toBe('+1,5 kg');
  });

  it('gramos negativos ya traen su signo', () => {
    expect(formatearDeltaMovimiento({ ...base, deltaGramos: peso(-500) })).toBe('-500 g');
  });

  it('unidades positivas llevan signo + explícito', () => {
    expect(formatearDeltaMovimiento({ ...base, deltaUnidades: 3 })).toBe('+3 unidades');
  });

  it('sin delta: guion', () => {
    expect(formatearDeltaMovimiento(base)).toBe('—');
  });
});
