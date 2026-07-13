import { clasificarInactividad, type Cliente } from '@gestion/core';

/** Un cliente activo clasificado como inactivo, con el dato ya calculado que
 * la fila necesita mostrar (doc 08, "Fidelización"). */
export interface ClienteInactivo {
  cliente: Cliente;
  diasSinVenir: number;
}

/**
 * Defaults de clasificación de inactividad, HARDCODED acá a propósito (WA-C2,
 * doc 08): la pantalla de configuración de `factorInactividad`/
 * `umbralGlobalDias` (editable por el admin) es de Fase 3 — hasta entonces se
 * usan explícitamente los mismos defaults que ya trae `clasificarInactividad`
 * en core (factor 2, umbral global 30 días), documentados acá en vez de
 * quedar implícitos en la firma de la función.
 */
const CONFIG_INACTIVIDAD_DEFAULT = { factorInactividad: 2, umbralGlobalDias: 30 };

/**
 * Clientes ACTIVOS (doc 07: `activo`, no desactivados — no tiene sentido
 * reconquistar por WhatsApp a alguien que el negocio ya dio de baja) cuyo
 * ritmo de compra los marca inactivos (`clasificarInactividad`, core),
 * ordenados por valor histórico descendente (doc 08: "primero los mejores
 * clientes que se están perdiendo").
 *
 * Pura salvo por `ahora`, que entra como parámetro (mismo criterio que
 * `clasificarInactividad`: nada de `Date.now()` adentro) para que la
 * clasificación sea determinista y testeable. No habla con Firestore: el
 * caller (`Clientes.tsx`, chip "Inactivos" de la terna de filtro, WA-G) le
 * pasa el subconjunto que ya recortó `filtrarClientes` (búsqueda + ritmo
 * comercial) sobre la MISMA `useCollection` del listado — no hay query
 * compuesta nueva (política del proyecto, doc 04). Antes (WA-C2) vivía en la
 * pantalla dedicada `/clientes/inactivos`, eliminada en WA-G: la terna de
 * chips la reemplaza.
 */
export function calcularClientesInactivos(clientes: Cliente[], ahora: Date): ClienteInactivo[] {
  return clientes
    .filter((c) => c.activo)
    .map((c) => ({ cliente: c, resultado: clasificarInactividad(c.stats, ahora, CONFIG_INACTIVIDAD_DEFAULT) }))
    .filter((x) => x.resultado.inactivo)
    .map((x) => ({ cliente: x.cliente, diasSinVenir: x.resultado.diasSinVenir }))
    .sort((a, b) => b.cliente.stats.totalHistoricoCents - a.cliente.stats.totalHistoricoCents);
}
