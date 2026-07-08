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
}

/**
 * Tabla genérica con `<table>` semántica real (thead/th con `scope="col"`),
 * scroll horizontal propio en pantallas chicas, números alineados a la
 * derecha con `tabular-nums`, y estado vacío siempre presente.
 */
export function DataTable<T>({ columnas, filas, claveFila, vacio }: DataTableProps<T>) {
  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border border-borde bg-superficie p-8 text-center text-texto-secundario">
        {vacio ?? 'No hay datos para mostrar.'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-borde">
      <table className="w-full min-w-max border-collapse bg-superficie text-texto">
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
}
