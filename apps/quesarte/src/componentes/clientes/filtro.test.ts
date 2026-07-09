import { describe, expect, it } from 'vitest';
import { money, type Cliente } from '@gestion/core';
import { filtrarClientes, normalizarTexto } from './filtro';

function cliente(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

describe('normalizarTexto', () => {
  it('ignora acentos y mayúsculas', () => {
    expect(normalizarTexto('María Núñez')).toBe('maria nunez');
  });
});

describe('filtrarClientes', () => {
  const clientes: Cliente[] = [
    cliente({ id: 'c1', nombre: 'Ana Pérez', alias: 'Anita', telefono: '099111222' }),
    cliente({ id: 'c2', nombre: 'Marta López', telefono: '098333444', activo: false }),
    cliente({ id: 'c3', nombre: 'Carlos Núñez' }),
  ];

  it('sin búsqueda y sin mostrar inactivos: excluye los desactivados', () => {
    const resultado = filtrarClientes(clientes, '', false);
    expect(resultado.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('mostrarInactivos en true: incluye los desactivados', () => {
    const resultado = filtrarClientes(clientes, '', true);
    expect(resultado.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('filtra por nombre ignorando acentos', () => {
    const resultado = filtrarClientes(clientes, 'nunez', false);
    expect(resultado.map((c) => c.id)).toEqual(['c3']);
  });

  it('filtra por alias', () => {
    const resultado = filtrarClientes(clientes, 'anita', false);
    expect(resultado.map((c) => c.id)).toEqual(['c1']);
  });

  it('filtra por teléfono', () => {
    // Marta está inactiva: con mostrarInactivos en true, la búsqueda por
    // teléfono también debe encontrarla.
    const resultado = filtrarClientes(clientes, '098333444', true);
    expect(resultado.map((c) => c.id)).toEqual(['c2']);
  });

  it('un cliente inactivo no aparece por teléfono si mostrarInactivos está en false', () => {
    const resultado = filtrarClientes(clientes, '098333444', false);
    expect(resultado).toEqual([]);
  });

  it('sin resultados: devuelve un array vacío', () => {
    expect(filtrarClientes(clientes, 'inexistente', true)).toEqual([]);
  });
});
