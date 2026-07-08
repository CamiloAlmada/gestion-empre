import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DataTable, type ColumnaDataTable } from './DataTable';

afterEach(() => {
  cleanup();
});

interface FilaTest {
  id: string;
  nombre: string;
  cantidad: number;
}

const columnas: ColumnaDataTable<FilaTest>[] = [
  { clave: 'nombre', titulo: 'Nombre', render: (f) => f.nombre },
  {
    clave: 'cantidad',
    titulo: 'Cantidad',
    render: (f) => String(f.cantidad),
    alinear: 'derecha',
  },
];

const filas: FilaTest[] = [
  { id: 'a', nombre: 'Queso Colonia', cantidad: 3 },
  { id: 'b', nombre: 'Dulce de leche', cantidad: 1 },
];

describe('DataTable', () => {
  it('renderiza columnas y filas', () => {
    render(<DataTable columnas={columnas} filas={filas} claveFila={(f) => f.id} />);

    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cantidad' })).toBeInTheDocument();
    expect(screen.getByText('Queso Colonia')).toBeInTheDocument();
    expect(screen.getByText('Dulce de leche')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 filas
  });

  it('usa claveFila como key de cada fila (sin duplicar filas con la misma clave)', () => {
    render(<DataTable columnas={columnas} filas={filas} claveFila={(f) => f.id} />);
    const filasDom = screen.getAllByRole('row').slice(1); // sin el header
    expect(filasDom).toHaveLength(2);
  });

  it('estado vacío por default cuando no hay filas', () => {
    render(<DataTable columnas={columnas} filas={[]} claveFila={(f) => f.id} />);
    expect(screen.getByText('No hay datos para mostrar.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('estado vacío personalizado vía prop `vacio`', () => {
    render(
      <DataTable
        columnas={columnas}
        filas={[]}
        claveFila={(f) => f.id}
        vacio="Todavía no hay ventas."
      />,
    );
    expect(screen.getByText('Todavía no hay ventas.')).toBeInTheDocument();
  });
});
