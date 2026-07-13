import { clasificarInactividad, type Cliente } from '@gestion/core';
import { normalizarBusqueda } from '@gestion/ui';

/**
 * Terna de filtro del listado de Clientes (WA-G, docs/06-ui-ux.md §3):
 * - `todos`: clientes vigentes + dados de baja (`activo: false`, atenuados
 *   con badge en `ListaClientes`).
 * - `activos`: solo vigentes que NO están inactivos por ritmo comercial.
 * - `inactivos`: solo vigentes inactivos por ritmo comercial (doc 08). El
 *   caller enriquece y ordena esta selección con `calcularClientesInactivos`
 *   (ver `Clientes.tsx`) — acá solo se decide QUIÉN entra.
 */
export type FiltroClientes = 'todos' | 'activos' | 'inactivos';

/**
 * Defaults de clasificación de inactividad — MISMOS que
 * `componentes/clientes/inactividad.ts` (`CONFIG_INACTIVIDAD_DEFAULT`):
 * duplicado a propósito para no crear una dependencia circular entre los dos
 * módulos de filtro/clasificación; ambos son triviales y están cubiertos por
 * tests. La pantalla de configuración de estos valores es de Fase 3.
 */
const CONFIG_INACTIVIDAD_DEFAULT = { factorInactividad: 2, umbralGlobalDias: 30 };

/** `true` si `cliente` está vigente pero con ritmo de compra caído (doc 08 —
 * inactividad COMERCIAL, no confundir con `activo: false` = dado de baja). */
function esInactivoComercial(cliente: Cliente, ahora: Date): boolean {
  return clasificarInactividad(cliente.stats, ahora, CONFIG_INACTIVIDAD_DEFAULT).inactivo;
}

/**
 * Filtro client-side del listado de Clientes: la colección es chica (doc 07,
 * "los proveedores son pocos" aplica el mismo criterio a clientes de un
 * mostrador), así que no hace falta una query por prefijo — se trae toda la
 * colección UNA vez (`useCollection`, ordenada por nombre) y se filtra acá.
 *
 * `busqueda` matchea nombre, alias o teléfono (ignorando acentos/mayúsculas),
 * SIEMPRE sobre el subconjunto que ya recortó `filtro`. `ahora` entra como
 * parámetro (mismo criterio que `clasificarInactividad`: nada de
 * `Date.now()` adentro) para que el resultado sea determinista y testeable —
 * solo se usa cuando `filtro` distingue por ritmo comercial (`activos`/
 * `inactivos`); en `todos` es irrelevante.
 *
 * No reordena: `clientes` debe venir ya alfabético por el `orderBy('nombre')`
 * de la query (mismo contrato que `agruparPorCategoria` en Stock). El caller
 * reordena por valor histórico el resultado de `inactivos` (ver
 * `calcularClientesInactivos`, que además enriquece cada fila).
 */
export function filtrarClientes(
  clientes: Cliente[],
  busqueda: string,
  filtro: FiltroClientes,
  ahora: Date,
): Cliente[] {
  const consulta = normalizarBusqueda(busqueda.trim());

  return clientes.filter((cliente) => {
    if (filtro === 'activos' && (!cliente.activo || esInactivoComercial(cliente, ahora))) return false;
    if (filtro === 'inactivos' && (!cliente.activo || !esInactivoComercial(cliente, ahora))) return false;
    if (consulta === '') return true;

    return (
      normalizarBusqueda(cliente.nombre).includes(consulta) ||
      (cliente.alias !== undefined && normalizarBusqueda(cliente.alias).includes(consulta)) ||
      (cliente.telefono !== undefined && normalizarBusqueda(cliente.telefono).includes(consulta))
    );
  });
}
