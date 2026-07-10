const DIACRITICOS = /[̀-ͯ]/g;

/**
 * Normaliza texto para comparaciones de búsqueda insensibles a mayúsculas y
 * acentos (p. ej. "arbol" matchea "Árbol"). Descompone en NFD (separa cada
 * letra de su diacrítico), quita los diacríticos y pasa a minúsculas.
 *
 * Helper compartido (tarea UI-3b, docs/06-ui-ux.md §3 "Búsqueda unificada"):
 * antes de esta tarea la misma lógica vivía duplicada, con dos variantes de
 * regex equivalentes, en `SelectorCliente.tsx`, `componentes/clientes/
 * filtro.ts`, `GrillaProductos.tsx`, `Productos.tsx` y `Proveedores.tsx` de
 * `apps/quesarte`, además de una copia privada dentro de `SearchSelect` acá
 * mismo en `@gestion/ui`. Vive en `@gestion/ui` (no en `@gestion/core`)
 * porque es un helper de presentación de búsqueda de listados — no expresa
 * una regla de negocio del dominio quesería/cerrajería, es infraestructura
 * de UI reutilizable entre apps.
 */
export function normalizarBusqueda(texto: string): string {
  return texto.normalize('NFD').replace(DIACRITICOS, '').toLowerCase();
}
