import { formatearPesoForzado, peso, pesoDesdeKg, type Peso } from '@gestion/core';

/**
 * Lógica pura del teclado numérico propio de peso (`TecladoPeso.tsx`, docs
 * 06-ui-ux.md §6: "ingresar peso en teclado numérico propio"). El componente
 * React solo pinta botones y delega la transición del buffer y el parseo acá;
 * la conversión final a `Peso` pasa SIEMPRE por `pesoDesdeKg`/`peso` de
 * `@gestion/core` (regla dura: cero aritmética de peso fuera de core).
 */

export type UnidadPeso = 'g' | 'kg';

/** Tecla del teclado: un dígito, la coma decimal, o borrar el último carácter. */
export type TeclaPeso = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | 'borrar';

const MAX_DECIMALES_KG = 3;

/**
 * Siguiente estado del buffer de texto tras tocar `tecla`. Nunca produce un
 * string inválido para `parsearBufferPeso`: en `g` ignora la coma (el
 * componente además deshabilita ese botón); en `kg` ignora dígitos que
 * excedan los 3 decimales y comas repetidas.
 */
export function siguienteBufferPeso(buffer: string, tecla: TeclaPeso, unidad: UnidadPeso): string {
  if (tecla === 'borrar') {
    return buffer.slice(0, -1);
  }

  if (tecla === ',') {
    if (unidad === 'g' || buffer.includes(',')) return buffer;
    return buffer === '' ? '0,' : `${buffer},`;
  }

  // Dígito.
  if (unidad === 'kg') {
    const decimales = buffer.split(',')[1];
    if (decimales !== undefined && decimales.length >= MAX_DECIMALES_KG) return buffer;
  }
  return `${buffer}${tecla}`;
}

/**
 * Parsea el buffer a `Peso` (gramos), o `null` si todavía no representa un
 * número (vacío, o solo `','` recién tocada). Frontera UI → dominio: la
 * conversión de kg a gramos pasa por `pesoDesdeKg` (redondeo half-up).
 */
export function parsearBufferPeso(buffer: string, unidad: UnidadPeso): Peso | null {
  if (buffer === '' || buffer === ',') return null;
  const normalizado = buffer.replace(',', '.');
  return unidad === 'g' ? peso(parseInt(normalizado, 10)) : pesoDesdeKg(parseFloat(normalizado));
}

/** Buffer inicial que representa `valor` en `unidad` (para re-poblar al cambiar de unidad). */
export function bufferDesdeValor(valor: Peso | null, unidad: UnidadPeso): string {
  return valor === null ? '' : formatearPesoForzado(valor, unidad);
}
