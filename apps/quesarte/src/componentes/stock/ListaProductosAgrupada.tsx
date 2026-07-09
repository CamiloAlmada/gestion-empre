import type { Pieza, Producto } from '@gestion/core';
import type { GrupoProductos } from './agrupacion';
import { ListaProductos } from './ListaProductos';

export interface ListaProductosAgrupadaProps {
  /** Ya calculados por `agruparPorCategoria` — ver `Stock.tsx`. */
  grupos: GrupoProductos[];
  piezasAgrupadas: Map<string, Pieza[]>;
  onSeleccionar: (producto: Producto) => void;
}

/**
 * Lista maestra de Stock agrupada por categoría. Cuando no hay categorías
 * definidas, `agruparPorCategoria` devuelve un único grupo `{ nombre: null }`:
 * en ese caso se renderiza como lista plana (sin encabezados de sección),
 * igual que antes de existir el vocabulario de categorías.
 *
 * Los encabezados de sección son texto real (`<h2>`, sutil: `text-sm` +
 * `text-texto-secundario`) sticky bajo el header de la pantalla, para
 * ubicarse durante el scroll sin competir visualmente con las filas.
 */
export function ListaProductosAgrupada({ grupos, piezasAgrupadas, onSeleccionar }: ListaProductosAgrupadaProps) {
  const [unico] = grupos;

  if (grupos.length === 1 && unico !== undefined && unico.nombre === null) {
    return (
      <ListaProductos productos={unico.productos} piezasAgrupadas={piezasAgrupadas} onSeleccionar={onSeleccionar} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {grupos.map((grupo, indice) => {
        // `nombre` solo es `null` en el grupo único "plana" (ya manejado
        // arriba); acá siempre es un string, pero se narrowea explícito para
        // no perder el tipado.
        const nombre = grupo.nombre;
        if (nombre === null) return null;

        // El `id` se arma con el índice (no con `nombre`): un nombre de
        // categoría puede tener espacios ("Frutos secos"), inválidos en un
        // atributo `id` HTML.
        const idEncabezado = `categoria-${indice}`;

        return (
          <section key={nombre} aria-labelledby={idEncabezado}>
            <h2
              id={idEncabezado}
              className="sticky top-[var(--altura-header)] z-10 bg-fondo py-2 text-sm font-medium text-texto-secundario"
            >
              {nombre}
            </h2>
            <ListaProductos
              productos={grupo.productos}
              piezasAgrupadas={piezasAgrupadas}
              onSeleccionar={onSeleccionar}
              ocultarCategoria
            />
          </section>
        );
      })}
    </div>
  );
}
