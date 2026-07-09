import type { Categoria, Producto } from '@gestion/core';

/**
 * Agrupación de productos por categoría para la lista maestra de Stock (ver
 * docs/02-dominio-quesarte.md §Categoría). Sin React, sin Firebase: solo
 * transforma los datos que ya trajeron las `useCollection` de `productos` y
 * `categorias`.
 */

/** Encabezado usado para productos cuya `categoria` no matchea ninguna definida. */
export const SIN_CATEGORIA = 'Sin categoría';

/**
 * Un grupo de la lista de Stock. `nombre === null` es la señal de "sin
 * agrupar": pasa exactamente eso cuando no hay categorías definidas, y en ese
 * caso `agruparPorCategoria` devuelve un único grupo con TODOS los productos
 * (la pantalla debe renderizarlo como lista plana, sin encabezados).
 */
export interface GrupoProductos {
  nombre: string | null;
  productos: Producto[];
}

/**
 * Agrupa `productos` según `categorias` (match exacto de `producto.categoria`
 * contra `categoria.nombre`), respetando el orden de `categorias` recibido.
 * Los productos cuya categoría no matchea ninguna definida van al final bajo
 * `SIN_CATEGORIA`. Categorías sin productos se omiten del resultado.
 *
 * **Precondición**: ambos arrays deben venir ya ordenados por el llamador
 * (`productos` por `nombre`, `categorias` por `orden`) — igual que
 * `agruparPiezasPorProducto`, esta función no reordena, solo agrupa
 * preservando el orden de entrada. En la pantalla real ambos vienen de
 * queries de Firestore con el `orderBy` correspondiente.
 *
 * Si `categorias` está vacío, no hay vocabulario definido: se devuelve un
 * único grupo `{ nombre: null, productos }` con todos los productos tal cual
 * llegaron, para que la pantalla lo renderice como lista plana (sin
 * encabezados) en vez de meter todo bajo "Sin categoría".
 */
export function agruparPorCategoria(productos: Producto[], categorias: Categoria[]): GrupoProductos[] {
  if (categorias.length === 0) {
    return [{ nombre: null, productos }];
  }

  const grupos: GrupoProductos[] = [];

  for (const categoria of categorias) {
    const productosDeCategoria = productos.filter((p) => p.categoria === categoria.nombre);
    if (productosDeCategoria.length > 0) {
      grupos.push({ nombre: categoria.nombre, productos: productosDeCategoria });
    }
  }

  const nombresDefinidos = new Set(categorias.map((c) => c.nombre));
  const huerfanos = productos.filter((p) => !nombresDefinidos.has(p.categoria));
  if (huerfanos.length > 0) {
    grupos.push({ nombre: SIN_CATEGORIA, productos: huerfanos });
  }

  return grupos;
}
