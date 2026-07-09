import type { Cliente } from '@gestion/core';

const DIACRITICOS = /[̀-ͯ]/g;

/** Minúsculas y sin diacríticos, para que la búsqueda ignore acentos (mismo
 * criterio que `normalizarTexto` de `Productos.tsx`). */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(DIACRITICOS, '').toLowerCase();
}

/**
 * Filtro client-side del listado de Clientes: la colección es chica (doc 07,
 * "los proveedores son pocos" aplica el mismo criterio a clientes de un
 * mostrador), así que no hace falta una query por prefijo — se trae toda la
 * colección UNA vez (`useCollection`, ordenada por nombre) y se filtra acá.
 *
 * - `busqueda` matchea nombre, alias o teléfono (ignorando acentos/mayúsculas).
 * - `mostrarInactivos` en `false` (default de la pantalla) oculta los clientes
 *   desactivados; en `true` los incluye.
 *
 * No reordena: `clientes` debe venir ya alfabético por el `orderBy('nombre')`
 * de la query (mismo contrato que `agruparPorCategoria` en Stock).
 */
export function filtrarClientes(
  clientes: Cliente[],
  busqueda: string,
  mostrarInactivos: boolean,
): Cliente[] {
  const consulta = normalizarTexto(busqueda.trim());

  return clientes.filter((cliente) => {
    if (!mostrarInactivos && !cliente.activo) return false;
    if (consulta === '') return true;

    return (
      normalizarTexto(cliente.nombre).includes(consulta) ||
      (cliente.alias !== undefined && normalizarTexto(cliente.alias).includes(consulta)) ||
      (cliente.telefono !== undefined && normalizarTexto(cliente.telefono).includes(consulta))
    );
  });
}
