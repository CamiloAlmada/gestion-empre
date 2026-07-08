import { describe, expect, it } from 'vitest';
import { peso } from '@gestion/core';
import { bufferDesdeValor, parsearBufferPeso, siguienteBufferPeso } from './bufferPeso';

describe('siguienteBufferPeso', () => {
  it('arma el string dígito por dígito', () => {
    let buffer = '';
    buffer = siguienteBufferPeso(buffer, '1', 'kg');
    buffer = siguienteBufferPeso(buffer, '2', 'kg');
    buffer = siguienteBufferPeso(buffer, '5', 'kg');
    expect(buffer).toBe('125');
  });

  it('agrega la coma en kg', () => {
    let buffer = siguienteBufferPeso('1', ',', 'kg');
    buffer = siguienteBufferPeso(buffer, '2', 'kg');
    buffer = siguienteBufferPeso(buffer, '5', 'kg');
    expect(buffer).toBe('1,25');
  });

  it('coma con buffer vacío arranca en "0,"', () => {
    expect(siguienteBufferPeso('', ',', 'kg')).toBe('0,');
  });

  it('ignora una segunda coma', () => {
    expect(siguienteBufferPeso('1,25', ',', 'kg')).toBe('1,25');
  });

  it('ignora la coma en modo g (gramos son enteros)', () => {
    expect(siguienteBufferPeso('500', ',', 'g')).toBe('500');
  });

  it('no deja pasar más de 3 decimales en kg', () => {
    expect(siguienteBufferPeso('1,234', '5', 'kg')).toBe('1,234');
  });

  it('borrar quita el último carácter (incluida la coma)', () => {
    expect(siguienteBufferPeso('1,2', 'borrar', 'kg')).toBe('1,');
    expect(siguienteBufferPeso('1,', 'borrar', 'kg')).toBe('1');
    expect(siguienteBufferPeso('', 'borrar', 'kg')).toBe('');
  });
});

describe('parsearBufferPeso', () => {
  it('vacío o solo coma es null', () => {
    expect(parsearBufferPeso('', 'kg')).toBeNull();
    expect(parsearBufferPeso(',', 'kg')).toBeNull();
  });

  it('gramos: entero directo', () => {
    expect(parsearBufferPeso('500', 'g')).toBe(peso(500));
  });

  it('kg: convierte con pesoDesdeKg (half-up)', () => {
    expect(parsearBufferPeso('1,25', 'kg')).toBe(peso(1250));
    expect(parsearBufferPeso('0,5', 'kg')).toBe(peso(500));
  });

  it('kg: buffer terminado en coma se interpreta como el entero tipeado', () => {
    expect(parsearBufferPeso('1,', 'kg')).toBe(peso(1000));
  });
});

describe('bufferDesdeValor', () => {
  it('null da buffer vacío', () => {
    expect(bufferDesdeValor(null, 'kg')).toBe('');
  });

  it('re-popula preservando el valor de dominio al cambiar de unidad', () => {
    expect(bufferDesdeValor(peso(1250), 'kg')).toBe('1,25');
    expect(bufferDesdeValor(peso(1250), 'g')).toBe('1250');
  });
});
