import { describe, expect, it } from 'vitest';
import { clasificarInactividad, normalizarTelefono, sumarMoney } from '@gestion/core';
import { construirDatosDemo, PREFIJO_DEMO, statsDesdeVentas } from './generador.mjs';

// `ahora` fijo: el generador es puro (recibe la fecha, nunca lee el reloj), así
// que estos tests son 100% deterministas sin importar cuándo corra la suite.
const AHORA = new Date('2026-07-12T15:00:00.000Z');

// Resultado esperado de `clasificarInactividad` para cada uno de los 6 clientes
// de demo (WA-D), en el mismo orden en que los arma `construirDatosDemo`. Ver
// el doc de la tarea: 1 activo, 2 inactivo por ritmo, 3 inactivo por umbral
// global, 4 activo (nuevo), 5 activo (sin teléfono), 6 activo (teléfono no
// normalizable).
const INACTIVO_ESPERADO = [false, true, true, false, false, false];

describe('construirDatosDemo', () => {
  const { clientes, ventas } = construirDatosDemo(AHORA);

  it('crea exactamente 6 clientes, todos con id prefijado demo-', () => {
    expect(clientes).toHaveLength(6);
    for (const cliente of clientes) {
      expect(cliente.id.startsWith(PREFIJO_DEMO)).toBe(true);
    }
  });

  it('todas las ventas están prefijadas demo- y asociadas a un cliente demo', () => {
    expect(ventas.length).toBeGreaterThan(0);
    const idsClientes = new Set(clientes.map((c) => c.id));
    for (const venta of ventas) {
      expect(venta.id.startsWith(PREFIJO_DEMO)).toBe(true);
      expect(venta.estado).toBe('completada');
      expect(idsClientes.has(venta.clienteId)).toBe(true);
    }
  });

  it('cada venta tiene totalCents igual a la suma de subtotales de sus ítems', () => {
    for (const venta of ventas) {
      const suma = sumarMoney(...venta.items.map((item) => item.subtotalCents));
      expect(venta.totalCents).toBe(suma);
    }
  });

  it('los ids de cliente e ids de venta son todos únicos', () => {
    expect(new Set(clientes.map((c) => c.id)).size).toBe(clientes.length);
    expect(new Set(ventas.map((v) => v.id)).size).toBe(ventas.length);
  });

  it.each(clientes.map((cliente, indice) => [indice, cliente]))(
    'cliente %i: stats coherentes con sus propias ventas (cantidad, total, primera/última compra)',
    (_indice, cliente) => {
      const propias = ventas.filter((v) => v.clienteId === cliente.id);
      const statsRecalculadas = statsDesdeVentas(propias);
      expect(cliente.stats).toEqual(statsRecalculadas);
      expect(cliente.stats.cantidadVentas).toBe(propias.length);
    },
  );

  it.each(clientes.map((cliente, indice) => [indice, cliente]))(
    'cliente %i: clasificarInactividad(defaults) da el resultado esperado por la spec de WA-D',
    (indice, cliente) => {
      const resultado = clasificarInactividad(cliente.stats, AHORA);
      expect(resultado.inactivo).toBe(INACTIVO_ESPERADO[indice]);
    },
  );

  it('cliente 2 (inactivo por ritmo propio) tiene más total histórico que el cliente 3 (inactivo por umbral): lidera la lista de inactivos', () => {
    const [, c2, c3] = clientes;
    expect(c2.stats.totalHistoricoCents).toBeGreaterThan(c3.stats.totalHistoricoCents);
  });

  it('cliente 1 (frecuente activo) tiene ritmo propio ~7 días y última compra reciente', () => {
    const [c1] = clientes;
    const resultado = clasificarInactividad(c1.stats, AHORA);
    expect(resultado.promedioDiasEntreCompras).toBeCloseTo(7, 1);
    expect(resultado.diasSinVenir).toBeLessThanOrEqual(5);
  });

  it('cliente 3 (ocasional) tiene menos de 3 compras: la clasificación usa el umbral global, no ritmo propio', () => {
    const [, , c3] = clientes;
    const resultado = clasificarInactividad(c3.stats, AHORA);
    expect(resultado.promedioDiasEntreCompras).toBeUndefined();
    expect(c3.stats.cantidadVentas).toBeLessThan(3);
  });

  it('cliente 5: sin campo telefono (no solo vacío) → sin telefonoE164', () => {
    const c5 = clientes[4];
    expect(Object.hasOwn(c5, 'telefono')).toBe(false);
    expect(Object.hasOwn(c5, 'telefonoE164')).toBe(false);
  });

  it('cliente 6: teléfono no normalizable → tiene telefono display pero no telefonoE164', () => {
    const c6 = clientes[5];
    expect(c6.telefono).toBe('consultar en mostrador');
    expect(Object.hasOwn(c6, 'telefonoE164')).toBe(false);
    expect(normalizarTelefono(c6.telefono)).toBeNull();
  });

  it.each(
    clientes
      .filter((c) => c.telefono !== undefined && c.id !== 'demo-cliente-06-telefono-no-normalizable')
      .map((c) => [c.id, c]),
  )('%s: telefonoE164 coincide con normalizarTelefono(telefono) de @gestion/core', (_id, cliente) => {
    expect(cliente.telefonoE164).toBe(normalizarTelefono(cliente.telefono));
  });

  it('es determinista: dos llamadas con el mismo `ahora` producen el mismo dataset', () => {
    const otra = construirDatosDemo(AHORA);
    expect(otra).toEqual({ clientes, ventas });
  });

  it('las fechas son relativas a `ahora`: correr con otro `ahora` desplaza las fechas pero conserva la clasificación', () => {
    const otroAhora = new Date(AHORA.getTime() + 10 * 86_400_000); // +10 días
    const otro = construirDatosDemo(otroAhora);
    for (const [indice, cliente] of otro.clientes.entries()) {
      const resultado = clasificarInactividad(cliente.stats, otroAhora);
      expect(resultado.inactivo).toBe(INACTIVO_ESPERADO[indice]);
    }
    // Las fechas absolutas sí cambiaron (no quedaron ancladas al primer `ahora`).
    expect(otro.clientes[0].stats.ultimaCompra).not.toEqual(clientes[0].stats.ultimaCompra);
  });
});
