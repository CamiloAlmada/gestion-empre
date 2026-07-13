import { describe, expect, it } from 'vitest';
import { money, type Cliente } from '@gestion/core';
import { filtrarClientes } from './filtro';

function cliente(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

const AHORA = new Date('2026-07-13T12:00:00');
const HACE_MUCHO = new Date('2026-04-01T12:00:00'); // ~103 días: supera el umbral global (30) y cualquier ritmo propio razonable.
const RECIENTE = new Date('2026-07-10T12:00:00'); // hace 3 días.

// La normalización acento/mayúscula-insensible (`normalizarBusqueda`,
// `@gestion/ui`) tiene sus propios tests unitarios; acá solo se verifica que
// `filtrarClientes` la usa correctamente (caso "filtra por nombre ignorando
// acentos", abajo).
describe('filtrarClientes - terna Todos/Activos/Inactivos (WA-G, docs/06 §3)', () => {
  const activoAlDia = cliente({
    id: 'c1',
    nombre: 'Ana Pérez',
    alias: 'Anita',
    telefono: '099111222',
    stats: { cantidadVentas: 1, totalHistoricoCents: money(1000), ultimaCompra: RECIENTE },
  });
  const dadoDeBaja = cliente({
    id: 'c2',
    nombre: 'Marta López',
    telefono: '098333444',
    activo: false,
    stats: { cantidadVentas: 1, totalHistoricoCents: money(1000), ultimaCompra: RECIENTE },
  });
  const activoInactivoComercial = cliente({
    id: 'c3',
    nombre: 'Carlos Núñez',
    // <3 compras: cae al umbral global (30 días) — hace ~103 días, inactivo.
    stats: { cantidadVentas: 1, totalHistoricoCents: money(5000), ultimaCompra: HACE_MUCHO },
  });
  const clientes: Cliente[] = [activoAlDia, dadoDeBaja, activoInactivoComercial];

  it('"todos": incluye vigentes Y dados de baja (badge de ListaClientes se encarga de atenuarlos)', () => {
    const resultado = filtrarClientes(clientes, '', 'todos', AHORA);
    expect(resultado.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('"activos": excluye tanto a los dados de baja como a los vigentes inactivos por ritmo comercial', () => {
    const resultado = filtrarClientes(clientes, '', 'activos', AHORA);
    expect(resultado.map((c) => c.id)).toEqual(['c1']);
  });

  it('"inactivos": solo vigentes inactivos por ritmo comercial (nunca dados de baja)', () => {
    const resultado = filtrarClientes(clientes, '', 'inactivos', AHORA);
    expect(resultado.map((c) => c.id)).toEqual(['c3']);
  });

  it('filtra por nombre ignorando acentos, sobre el subconjunto de "todos"', () => {
    const resultado = filtrarClientes(clientes, 'nunez', 'todos', AHORA);
    expect(resultado.map((c) => c.id)).toEqual(['c3']);
  });

  it('filtra por alias', () => {
    const resultado = filtrarClientes(clientes, 'anita', 'todos', AHORA);
    expect(resultado.map((c) => c.id)).toEqual(['c1']);
  });

  it('filtra por teléfono: un dado de baja se encuentra bajo "todos"', () => {
    const resultado = filtrarClientes(clientes, '098333444', 'todos', AHORA);
    expect(resultado.map((c) => c.id)).toEqual(['c2']);
  });

  it('un dado de baja NO aparece por teléfono bajo "activos" (la búsqueda opera sobre el subconjunto ya filtrado)', () => {
    const resultado = filtrarClientes(clientes, '098333444', 'activos', AHORA);
    expect(resultado).toEqual([]);
  });

  it('sin resultados: devuelve un array vacío', () => {
    expect(filtrarClientes(clientes, 'inexistente', 'todos', AHORA)).toEqual([]);
  });
});
