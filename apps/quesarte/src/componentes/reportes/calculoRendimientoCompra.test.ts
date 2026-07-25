import { describe, expect, it } from 'vitest';
import { money } from '@gestion/core';
import { mensajeEstadoRendimiento, notaCostoNoAtribuible } from './calculoRendimientoCompra';

describe('mensajeEstadoRendimiento', () => {
  it('sin_ventas: "es pronto para juzgar", nunca "no rindió"', () => {
    expect(mensajeEstadoRendimiento('sin_ventas')).toBe(
      'Todavía no se vendió nada de esta compra. Es pronto para juzgar si el viaje rindió.',
    );
  });

  it('sin_atribucion: explica la ausencia de lote, sin implicar fracaso', () => {
    expect(mensajeEstadoRendimiento('sin_atribucion')).toMatch(/no hay lote/);
  });

  it('en_curso: deja claro que la ganancia puede seguir subiendo', () => {
    expect(mensajeEstadoRendimiento('en_curso')).toMatch(/todavía puede subir/);
  });

  it('agotada: afirma la venta completa de la porción atribuible', () => {
    expect(mensajeEstadoRendimiento('agotada')).toMatch(/toda la mercadería/);
  });
});

describe('notaCostoNoAtribuible', () => {
  it('null cuando no hay costo no atribuible (compra 100% por pieza)', () => {
    expect(notaCostoNoAtribuible({ costoNoAtribuibleCents: money(0) })).toBeNull();
  });

  it('con costo no atribuible > 0: nota explícita, nunca silenciosa', () => {
    const nota = notaCostoNoAtribuible({ costoNoAtribuibleCents: money(22_000) });
    expect(nota).not.toBeNull();
    expect(nota).toMatch(/granel o por unidad/);
  });
});
