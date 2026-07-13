import type { ModoPrecio, ModoStock } from '@gestion/core';

/**
 * Etiquetas en español de `modoPrecio`/`modoStock` (docs/02-dominio-quesarte.md).
 * Vive en `componentes/` (no en `pantallas/ModalProducto.tsx`, donde vivían
 * antes de UI-5b) porque hay DOS consumidores a partir de esta tarea: el
 * modal de alta/edición (`pantallas/ModalProducto.tsx`) y la ficha de
 * configuración del detalle (`componentes/stock/DetalleProducto.tsx`) — con
 * las etiquetas viviendo en `pantallas/`, el segundo tendría que importar
 * "hacia arriba" desde `componentes/` (capas invertidas: en este repo las
 * pantallas importan componentes, nunca al revés). Acá ambos importan desde
 * el mismo lugar, sin duplicar el texto.
 */
export const ETIQUETAS_MODO_PRECIO: Record<ModoPrecio, string> = {
  por_kg: 'Por kg',
  por_unidad: 'Por unidad',
};

export const ETIQUETAS_MODO_STOCK: Record<ModoStock, string> = {
  fraccionado_por_pieza: 'Fraccionado por pieza',
  pieza_entera: 'Pieza entera',
  granel: 'Granel',
  unidad_simple: 'Unidad simple',
};
