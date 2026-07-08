import { describe, expect, it } from 'vitest';
import { money, peso, type ItemVenta } from '@gestion/core';
import {
  ETIQUETAS_MEDIO_PAGO,
  formatearFechaHora,
  textoCantidadItem,
  textoCantidadItems,
  textoPrecioUnitario,
} from './formato';

function item(over: Partial<ItemVenta>): ItemVenta {
  return {
    productoId: 'p1',
    nombreProducto: 'Queso Colonia',
    precioUnitCents: money(100000),
    subtotalCents: money(50000),
    ...over,
  };
}

describe('formatearFechaHora', () => {
  it('formatea dd/mm/aaaa HH:mm con ceros a la izquierda', () => {
    expect(formatearFechaHora(new Date(2026, 0, 5, 9, 3))).toBe('05/01/2026 09:03');
  });

  it('formatea horas de dos dígitos sin recortar', () => {
    expect(formatearFechaHora(new Date(2026, 11, 25, 23, 59))).toBe('25/12/2026 23:59');
  });
});

describe('ETIQUETAS_MEDIO_PAGO', () => {
  it('tiene las 4 etiquetas en español', () => {
    expect(ETIQUETAS_MEDIO_PAGO.efectivo).toBe('Efectivo');
    expect(ETIQUETAS_MEDIO_PAGO.debito).toBe('Débito');
    expect(ETIQUETAS_MEDIO_PAGO.credito).toBe('Crédito');
    expect(ETIQUETAS_MEDIO_PAGO.transferencia).toBe('Transferencia');
  });
});

describe('textoCantidadItems', () => {
  it('singular con 1', () => {
    expect(textoCantidadItems(1)).toBe('1 ítem');
  });
  it('plural con 0 o más de 1', () => {
    expect(textoCantidadItems(0)).toBe('0 ítems');
    expect(textoCantidadItems(3)).toBe('3 ítems');
  });
});

describe('textoCantidadItem', () => {
  it('con gramos: usa formatearPeso', () => {
    expect(textoCantidadItem(item({ gramos: peso(500) }))).toBe('500 g');
    expect(textoCantidadItem(item({ gramos: peso(1500) }))).toBe('1,5 kg');
  });

  it('con unidades: pluraliza', () => {
    expect(textoCantidadItem(item({ unidades: 1 }))).toBe('1 unidad');
    expect(textoCantidadItem(item({ unidades: 3 }))).toBe('3 unidades');
  });

  it('sin gramos ni unidades: guion (defensivo)', () => {
    expect(textoCantidadItem(item({}))).toBe('—');
  });
});

describe('textoPrecioUnitario', () => {
  it('con gramos: sufijo /kg', () => {
    expect(textoPrecioUnitario(item({ gramos: peso(500), precioUnitCents: money(100000) }))).toBe(
      '$ 1.000,00 /kg',
    );
  });

  it('con unidades: sufijo /u', () => {
    expect(textoPrecioUnitario(item({ unidades: 2, precioUnitCents: money(15000) }))).toBe(
      '$ 150,00 /u',
    );
  });
});
