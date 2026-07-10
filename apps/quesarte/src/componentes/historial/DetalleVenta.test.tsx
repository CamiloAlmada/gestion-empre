import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { money, peso, type Usuario, type Venta } from '@gestion/core';
import { DetalleVenta } from './DetalleVenta';

// `DataTable` con `filaCompacta` (docs/06-ui-ux.md §3) renderiza SIEMPRE la
// tabla completa Y la lista compacta a la vez (visibilidad por CSS, no
// evaluado en jsdom). Las aserciones de contenido se scopean a la tabla; la
// lista compacta se testea aparte, más abajo.
function tabla() {
  return within(screen.getByRole('table'));
}

const mocks = vi.hoisted(() => ({ useDoc: vi.fn() }));

vi.mock('@gestion/firebase-kit', () => ({
  useDoc: mocks.useDoc,
  usuarioConverter: {},
}));

interface RefFalsa {
  __path: string;
  withConverter: () => RefFalsa;
}

function crearRef(path: string): RefFalsa {
  const ref: RefFalsa = { __path: path, withConverter: () => ref };
  return ref;
}

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coleccion: string, id: string) => crearRef(`${coleccion}/${id}`),
}));

function venta(over: Partial<Venta> = {}): Venta {
  return {
    id: 'v1',
    numero: 1001,
    fecha: new Date(2026, 0, 5, 14, 30),
    usuarioId: 'uid-vendedor-largo',
    items: [
      {
        productoId: 'p1',
        nombreProducto: 'Queso Colonia',
        gramos: peso(500),
        precioUnitCents: money(100000),
        subtotalCents: money(50000),
      },
      {
        productoId: 'p2',
        nombreProducto: 'Miel 500g',
        unidades: 2,
        precioUnitCents: money(15000),
        subtotalCents: money(30000),
      },
    ],
    totalCents: money(80000),
    medioPago: 'debito',
    estado: 'completada',
    ...over,
  };
}

function usuario(over: Partial<Usuario> = {}): Usuario {
  return {
    uid: 'uid-vendedor-largo',
    nombre: 'Ana Vendedora',
    email: 'ana@a.com',
    rol: 'vendedor',
    activo: true,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DetalleVenta - cabecera e ítems', () => {
  it('muestra número, fecha/hora, medio de pago, ítems y total', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Venta #1001' })).toBeTruthy();
    expect(screen.getByText('05/01/2026 14:30')).toBeTruthy();
    expect(screen.getByText('Medio de pago: Débito')).toBeTruthy();
    expect(tabla().getByText('Queso Colonia')).toBeTruthy();
    expect(tabla().getByText('500 g')).toBeTruthy();
    expect(tabla().getByText('Miel 500g')).toBeTruthy();
    expect(tabla().getByText('2 unidades')).toBeTruthy();
    expect(screen.getByText('Total: $ 800,00')).toBeTruthy();
  });

  it('venta con cliente asociado: muestra "Cliente: {nombre}" (denormalizado, doc 07)', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta({ clienteId: 'c1', clienteNombre: 'Ana Pérez' })}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.getByText('Cliente: Ana Pérez')).toBeTruthy();
  });

  it('venta anónima (sin clienteNombre): no muestra la línea de cliente', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.queryByText(/^Cliente:/)).toBeNull();
  });

  it('"Volver a Historial" llama a onVolver', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });
    const onVolver = vi.fn();

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={onVolver}
        onAnular={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Volver a Historial/ }));

    expect(onVolver).toHaveBeenCalled();
  });
});

describe('DetalleVenta - nombre del vendedor', () => {
  it('vendedor: no hace lookup y muestra "—"', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(mocks.useDoc).toHaveBeenCalledWith(null);
    expect(screen.getByText('Vendedor: —')).toBeTruthy();
  });

  it('admin: resuelve el nombre vía lookup a usuarios', () => {
    mocks.useDoc.mockReturnValue({
      datos: usuario({ nombre: 'Ana Vendedora' }),
      cargando: false,
      error: null,
    });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={true}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(mocks.useDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: 'usuarios/uid-vendedor-largo' }),
    );
    expect(screen.getByText('Vendedor: Ana Vendedora')).toBeTruthy();
  });

  it('admin: sin doc resuelto (cargando o borrado), cae al uid acortado', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: true, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={true}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.getByText('Vendedor: uid-vend')).toBeTruthy();
  });
});

describe('DetalleVenta - botón Anular (permisos)', () => {
  it('vendedor: no ve el botón Anular venta', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Anular venta' })).toBeNull();
  });

  it('admin: ve el botón y lo dispara con onAnular', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });
    const onAnular = vi.fn();

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={true}
        db={{} as never}
        onVolver={() => {}}
        onAnular={onAnular}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Anular venta' }));

    expect(onAnular).toHaveBeenCalled();
  });

  it('admin: venta ya anulada no muestra el botón Anular', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta({ estado: 'anulada' })}
        esAdmin={true}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Anular venta' })).toBeNull();
    expect(screen.getByText('Anulada')).toBeTruthy();
  });
});

describe('DetalleVenta - fila compacta (mobile, docs/06-ui-ux.md §3)', () => {
  it('muestra nombre, cantidad, precio unitario y subtotal de cada ítem en la lista compacta', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    const lista = within(screen.getByRole('list'));
    expect(lista.getByText('Queso Colonia')).toBeTruthy();
    expect(lista.getByText('500 g')).toBeTruthy();
    expect(lista.getByText('$ 1.000,00 /kg')).toBeTruthy();
    expect(lista.getByText('$ 500,00')).toBeTruthy();
    expect(lista.getByText('Miel 500g')).toBeTruthy();
    expect(lista.getByText('2 unidades')).toBeTruthy();
  });
});
