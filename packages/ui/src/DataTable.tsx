import type { ReactNode } from 'react';

export interface ColumnaDataTable<T> {
  clave: string;
  titulo: string;
  render: (fila: T) => ReactNode;
  alinear?: 'izquierda' | 'derecha';
}

export interface DataTableProps<T> {
  columnas: ColumnaDataTable<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  /** Estado vacío. Default: mensaje genérico en español. */
  vacio?: ReactNode;
  /** Nombre accesible de la tabla (`aria-label`). Default genérico en español. */
  etiqueta?: string;
  /**
   * Render de fila compacta para pantallas angostas (`< md`). Cuando se
   * pasa, en mobile se renderiza una lista apilada (`<ul role="list">`) en
   * vez de la tabla con scroll horizontal — docs/06-ui-ux.md §3 ("Tablas en
   * mobile: sin scroll horizontal"). La `<table>` se sigue renderizando
   * siempre (oculta con clases responsive, no con JS: SSR-safe y sin
   * flash); a partir de `md:` es la que se ve. Cuando NO se pasa, el
   * comportamiento es el de siempre: solo tabla, en todos los tamaños.
   */
  filaCompacta?: (fila: T) => ReactNode;
}

/**
 * Tabla genérica con `<table>` semántica real (thead/th con `scope="col"`),
 * scroll horizontal propio en pantallas chicas, números alineados a la
 * derecha con `tabular-nums`, y estado vacío siempre presente.
 *
 * Con `filaCompacta`, agrega un modo lista apilada para `< md` (ver JSDoc de
 * la prop). Ambos renders (lista y tabla) viven en el DOM al mismo tiempo;
 * la visibilidad la decide CSS puro (`hidden md:block` / `md:hidden`).
 */
export function DataTable<T>({
  columnas,
  filas,
  claveFila,
  vacio,
  etiqueta = 'Tabla de datos',
  filaCompacta,
}: DataTableProps<T>) {
  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border border-borde bg-superficie p-8 text-center text-texto-secundario">
        {vacio ?? 'No hay datos para mostrar.'}
      </div>
    );
  }

  const tabla = (
    <div
      className={`overflow-x-auto rounded-2xl border border-borde ${filaCompacta !== undefined ? 'hidden md:block' : ''}`}
    >
      <table aria-label={etiqueta} className="w-full min-w-max border-collapse bg-superficie text-texto">
        <thead>
          <tr className="border-b border-borde">
            {columnas.map((columna) => (
              <th
                key={columna.clave}
                scope="col"
                className={`px-4 py-3 text-sm font-medium text-texto-secundario ${
                  columna.alinear === 'derecha' ? 'text-right' : 'text-left'
                }`}
              >
                {columna.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={claveFila(fila)} className="border-b border-borde last:border-b-0">
              {columnas.map((columna) => (
                <td
                  key={columna.clave}
                  className={`px-4 py-4 tabular-nums ${
                    columna.alinear === 'derecha' ? 'text-right' : 'text-left'
                  }`}
                >
                  {columna.render(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (filaCompacta === undefined) {
    return tabla;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul
        role="list"
        aria-label={etiqueta}
        className="flex flex-col divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie md:hidden"
      >
        {filas.map((fila) => (
          <li key={claveFila(fila)}>{filaCompacta(fila)}</li>
        ))}
      </ul>
      {tabla}
    </div>
  );
}
