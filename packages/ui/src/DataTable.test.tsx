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

  it('tiene un nombre accesible por default en español (aria-label)', () => {
    render(<DataTable columnas={columnas} filas={filas} claveFila={(f) => f.id} />);
    expect(screen.getByRole('table', { name: 'Tabla de datos' })).toBeInTheDocument();
  });

  it('la prop `etiqueta` reemplaza el aria-label por default', () => {
    render(
      <DataTable
        columnas={columnas}
        filas={filas}
        claveFila={(f) => f.id}
        etiqueta="Stock de quesos"
      />,
    );
    expect(screen.getByRole('table', { name: 'Stock de quesos' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Tabla de datos' })).not.toBeInTheDocument();
  });

  describe('modo compacto (`filaCompacta`)', () => {
    it('sin `filaCompacta` no se renderiza ninguna lista (comportamiento actual intacto)', () => {
      render(<DataTable columnas={columnas} filas={filas} claveFila={(f) => f.id} />);
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('con `filaCompacta` existen ambos renders: la tabla completa y la lista apilada', () => {
      render(
        <DataTable
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.id}
          filaCompacta={(f) => <span>Compacta: {f.nombre}</span>}
        />,
      );

      // La tabla sigue ahí (con sus columnas y filas de siempre) — la CSS
      // que la oculta en mobile no se evalúa en jsdom, ver docs/06 §3.
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeInTheDocument();

      // La lista compacta también, con un <li> por fila y el contenido de
      // `filaCompacta`.
      const lista = screen.getByRole('list');
      expect(lista.querySelectorAll('li')).toHaveLength(2);
      expect(screen.getByText('Compacta: Queso Colonia')).toBeInTheDocument();
      expect(screen.getByText('Compacta: Dulce de leche')).toBeInTheDocument();
    });

    it('estado vacío es igual con o sin `filaCompacta` (no hay lista ni tabla)', () => {
      render(
        <DataTable
          columnas={columnas}
          filas={[]}
          claveFila={(f) => f.id}
          filaCompacta={(f) => f.nombre}
          vacio="Nada por acá."
        />,
      );
      expect(screen.getByText('Nada por acá.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });
  });
});
