import { describe, expect, it } from 'vitest';
import { normalizarBusqueda } from './normalizarBusqueda';

describe('normalizarBusqueda', () => {
  it('pasa a minúsculas', () => {
    expect(normalizarBusqueda('MARTA')).toBe('marta');
  });

  it('quita acentos/diacríticos', () => {
    expect(normalizarBusqueda('Árbol')).toBe('arbol');
    expect(normalizarBusqueda('jamón')).toBe('jamon');
  });

  it('combina mayúsculas y acentos: "Márta" y "marta" normalizan igual', () => {
    expect(normalizarBusqueda('Márta')).toBe(normalizarBusqueda('marta'));
  });

  it('deja intacto un texto ya normalizado', () => {
    expect(normalizarBusqueda('queso')).toBe('queso');
  });

  it('no rompe con string vacío', () => {
    expect(normalizarBusqueda('')).toBe('');
  });

  // Casos reales de los sitios unificados (SelectorCliente, filtro de
  // clientes, GrillaProductos, Productos, Proveedores).
  it('caso SelectorCliente: "Márta" matchea consulta "marta"', () => {
    expect(normalizarBusqueda('Márta').includes(normalizarBusqueda('marta'))).toBe(true);
  });

  it('caso Productos/GrillaProductos: "Jamón Crudo" matchea "jamon"', () => {
    expect(normalizarBusqueda('Jamón Crudo').includes(normalizarBusqueda('jamon'))).toBe(true);
  });

  it('caso Proveedores/Clientes: "Almacén López" matchea "almacen lopez"', () => {
    expect(normalizarBusqueda('Almacén López')).toBe('almacen lopez');
  });
});
