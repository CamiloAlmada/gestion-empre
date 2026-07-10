import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, type Cliente, type Venta } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { DetalleClientePantalla } from './DetalleClientePantalla';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useDoc: vi.fn(),
  useCollection: vi.fn(),
  actualizarCliente: vi.fn(),
  desactivarCliente: vi.fn(),
  reactivarCliente: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useAuth: mocks.useAuth,
    useOnlineStatus: mocks.useOnlineStatus,
    useDoc: mocks.useDoc,
    useCollection: mocks.useCollection,
    actualizarCliente: mocks.actualizarCliente,
    desactivarCliente: mocks.desactivarCliente,
    reactivarCliente: mocks.reactivarCliente,
  };
});

vi.mock('../firebase', () => ({ db: {} }));

interface RefFalsa {
  __path: string;
  withConverter: () => RefFalsa;
}

function crearRef(path: string): RefFalsa {
  const ref: RefFalsa = { __path: path, withConverter: () => ref };
  return ref;
}

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => crearRef(path),
  doc: (_db: unknown, coleccion: string, id: string) => crearRef(`${coleccion}/${id}`),
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
}));

interface EstadoDocFalso<T> {
  datos: T | null;
  cargando: boolean;
  error: FirestoreError | null;
}
interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
}

function clienteDe(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

function ventaDe(over: Partial<Venta> & Pick<Venta, 'id' | 'numero'>): Venta {
  return {
    fecha: new Date(2026, 0, 5, 14, 30),
    usuarioId: 'u1',
    items: [],
    totalCents: money(50000),
    medioPago: 'efectivo',
    estado: 'completada',
    ...over,
  };
}

function configurarAuth(rol: 'admin' | 'vendedor') {
  mocks.useAuth.mockReturnValue({
    usuario: { uid: 'u-actor' },
    perfil: { uid: 'u-actor', nombre: 'Actor', email: 'actor@a.com', rol, activo: true },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn(),
  });
}

function configurarCliente(estado: EstadoDocFalso<Cliente>) {
  mocks.useDoc.mockImplementation((ref: RefFalsa | null) => {
    if (ref === null) return { datos: null, cargando: false, error: null };
    return estado;
  });
}

function configurarVentas(estado: EstadoColeccionFalso<Venta>) {
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    return estado;
  });
}

function VisorHeader() {
  const config = useHeaderActual();
  return (
    <div>
      <p data-testid="titulo-header">{config?.titulo}</p>
      <p data-testid="volver-header">{config?.volverA ? `${config.volverA.etiqueta}:${config.volverA.a}` : ''}</p>
      <div data-testid="acciones-header">{config?.acciones}</div>
    </div>
  );
}

function renderizar(id = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/clientes/cliente/${id}`]}>
      <ProveedorToasts>
        <ProveedorHeader>
          <VisorHeader />
          <Routes>
            <Route path="/clientes/cliente/:id" element={<DetalleClientePantalla />} />
          </Routes>
        </ProveedorHeader>
      </ProveedorToasts>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.useOnlineStatus.mockReturnValue(true);
});

describe('DetalleClientePantalla - estados', () => {
  it('cargando', () => {
    configurarAuth('admin');
    configurarCliente({ datos: null, cargando: true, error: null });
    configurarVentas({ datos: [], cargando: true, error: null });

    renderizar();

    expect(screen.getByText('Cargando cliente…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón Reintentar', () => {
    configurarAuth('admin');
    configurarCliente({ datos: null, cargando: false, error: { code: 'unavailable' } as FirestoreError });
    configurarVentas({ datos: [], cargando: false, error: null });

    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar el cliente.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('cliente inexistente: mensaje de no encontrado con link para volver', () => {
    configurarAuth('admin');
    configurarCliente({ datos: null, cargando: false, error: null });
    configurarVentas({ datos: [], cargando: false, error: null });

    renderizar();

    expect(screen.getByText('No encontramos ese cliente. Puede haberse desactivado.')).toBeTruthy();
    const enlace = screen.getByRole('link', { name: 'Volver a Clientes' });
    expect(enlace.getAttribute('href')).toBe('/clientes');
  });
});

describe('DetalleClientePantalla - header', () => {
  it('título = nombre del cliente, volver a Clientes', () => {
    configurarAuth('admin');
    configurarCliente(
      estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez' })),
    );
    configurarVentas({ datos: [], cargando: false, error: null });

    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Ana Pérez');
    expect(screen.getByTestId('volver-header').textContent).toBe('Clientes:/clientes');
  });
});

function estadoOkDoc<T>(datos: T): EstadoDocFalso<T> {
  return { datos, cargando: false, error: null };
}

describe('DetalleClientePantalla - estadísticas', () => {
  it('con ventas: muestra total histórico, cantidad de ventas y ticket promedio calculado', () => {
    configurarAuth('admin');
    configurarCliente(
      estadoOkDoc(
        clienteDe({
          id: 'c1',
          nombre: 'Ana Pérez',
          stats: {
            cantidadVentas: 4,
            totalHistoricoCents: money(200000),
            ultimaCompra: new Date('2026-07-01'),
          },
        }),
      ),
    );
    configurarVentas({ datos: [], cargando: false, error: null });

    renderizar();

    expect(screen.getByText('$ 2.000,00')).toBeTruthy(); // total histórico
    expect(screen.getByText('4')).toBeTruthy(); // cantidad de ventas
    expect(screen.getByText('$ 500,00')).toBeTruthy(); // ticket promedio (200000/4)
  });

  it('sin ventas (cantidadVentas=0): el ticket promedio y la última compra muestran "—", sin dividir por cero', () => {
    configurarAuth('admin');
    configurarCliente(
      estadoOkDoc(
        clienteDe({
          id: 'c1',
          nombre: 'Ana Pérez',
          stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
        }),
      ),
    );
    configurarVentas({ datos: [], cargando: false, error: null });

    renderizar();

    // Dos "—": ticket promedio y última compra.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('tras anular la única venta (cantidadVentas vuelve a 0 pero ultimaCompra queda con la fecha vieja): "Última compra" muestra "—", no "Hace N días"', () => {
    configurarAuth('admin');
    configurarCliente(
      estadoOkDoc(
        clienteDe({
          id: 'c1',
          nombre: 'Ana Pérez',
          stats: {
            cantidadVentas: 0,
            totalHistoricoCents: money(0),
            ultimaCompra: new Date('2026-01-01'),
          },
        }),
      ),
    );
    configurarVentas({ datos: [], cargando: false, error: null });

    renderizar();

    expect(screen.queryByText(/Hace \d+ día/)).toBeNull();
    expect(screen.queryByText('Hoy')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});

describe('DetalleClientePantalla - historial de ventas', () => {
  it('lista las ventas del cliente', () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez' })));
    configurarVentas(
      estadoOkColeccion([ventaDe({ id: 'v1', numero: 1001 }), ventaDe({ id: 'v2', numero: 1002 })]),
    );

    renderizar();

    expect(within(screen.getByRole('table')).getByText('#1001')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('#1002')).toBeTruthy();
  });

  it('sin ventas: mensaje de vacío', () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez' })));
    configurarVentas(estadoOkColeccion([]));

    renderizar();

    expect(screen.getByText('Este cliente todavía no tiene ventas registradas.')).toBeTruthy();
  });

  it('NO filtra las ventas anuladas de la lista: aparecen con el badge "Anulada" (reconcilia con stats ya revertidas)', () => {
    configurarAuth('admin');
    // Stats coherentes con UNA venta anulada de las 3 que trae el historial:
    // "2 ventas" en las stats, pero la tabla muestra las 3 (con la anulada
    // distinguible por su badge) — nunca 3 filas indistinguibles.
    configurarCliente(
      estadoOkDoc(
        clienteDe({
          id: 'c1',
          nombre: 'Ana Pérez',
          stats: { cantidadVentas: 2, totalHistoricoCents: money(100000) },
        }),
      ),
    );
    configurarVentas(
      estadoOkColeccion([
        ventaDe({ id: 'v1', numero: 1001, estado: 'completada' }),
        ventaDe({ id: 'v2', numero: 1002, estado: 'anulada' }),
        ventaDe({ id: 'v3', numero: 1003, estado: 'completada' }),
      ]),
    );

    renderizar();

    const tabla = within(screen.getByRole('table'));
    expect(tabla.getByText('#1001')).toBeTruthy();
    expect(tabla.getByText('#1002')).toBeTruthy();
    expect(tabla.getByText('#1003')).toBeTruthy();
    expect(tabla.getByText('Anulada')).toBeTruthy();
    // Solo una fila anulada: el badge no aparece más de una vez.
    expect(tabla.getAllByText('Anulada').length).toBe(1);
  });

  it('una venta completada no muestra el badge "Anulada"', () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez' })));
    configurarVentas(estadoOkColeccion([ventaDe({ id: 'v1', numero: 1001, estado: 'completada' })]));

    renderizar();

    expect(within(screen.getByRole('table')).queryByText('Anulada')).toBeNull();
  });
});

function estadoOkColeccion<T>(datos: T[]): EstadoColeccionFalso<T> {
  return { datos, cargando: false, error: null };
}

describe('DetalleClientePantalla - gates de rol', () => {
  it('vendedor: no ve "Editar" ni "Desactivar cliente"', () => {
    configurarAuth('vendedor');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez' })));
    configurarVentas(estadoOkColeccion([]));

    renderizar();

    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Desactivar cliente' })).toBeNull();
  });

  it('admin: ve "Editar" y "Desactivar cliente"', () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez' })));
    configurarVentas(estadoOkColeccion([]));

    renderizar();

    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Desactivar cliente' })).toBeTruthy();
  });

  it('admin, cliente ya inactivo: no ofrece "Desactivar cliente" de nuevo, sino "Reactivar cliente" (tarea RE-1)', () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez', activo: false })));
    configurarVentas(estadoOkColeccion([]));

    renderizar();

    expect(screen.queryByRole('button', { name: 'Desactivar cliente' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reactivar cliente' })).toBeTruthy();
  });

  it('vendedor, cliente inactivo: no ve "Reactivar cliente"', () => {
    configurarAuth('vendedor');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez', activo: false })));
    configurarVentas(estadoOkColeccion([]));

    renderizar();

    expect(screen.queryByRole('button', { name: 'Reactivar cliente' })).toBeNull();
  });

  it('admin, cliente activo: no ofrece "Reactivar cliente"', () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez' })));
    configurarVentas(estadoOkColeccion([]));

    renderizar();

    expect(screen.queryByRole('button', { name: 'Reactivar cliente' })).toBeNull();
  });
});

describe('DetalleClientePantalla - edición', () => {
  it('admin: edita datos de contacto y llama a actualizarCliente', async () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez' })));
    configurarVentas(estadoOkColeccion([]));
    mocks.actualizarCliente.mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Teléfono (opcional)'), { target: { value: '099000111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.actualizarCliente).toHaveBeenCalledTimes(1));
    const [, id, datos] = mocks.actualizarCliente.mock.calls[0] as [unknown, string, { telefono?: string }];
    expect(id).toBe('c1');
    expect(datos.telefono).toBe('099000111');
    expect(await screen.findByText('Cliente actualizado.')).toBeTruthy();
  });
});

describe('DetalleClientePantalla - desactivación', () => {
  it('admin: confirma la desactivación y llama a desactivarCliente', async () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez' })));
    configurarVentas(estadoOkColeccion([]));
    mocks.desactivarCliente.mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar cliente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));

    await waitFor(() => expect(mocks.desactivarCliente).toHaveBeenCalledWith({}, 'c1'));
    expect(await screen.findByText('Cliente desactivado.')).toBeTruthy();
  });
});

describe('DetalleClientePantalla - reactivación (tarea RE-1)', () => {
  it('cliente inactivo: muestra el badge "Inactivo"', () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez', activo: false })));
    configurarVentas(estadoOkColeccion([]));

    renderizar();

    expect(screen.getByText('Inactivo')).toBeTruthy();
  });

  it('admin: reactivar (sin modal de confirmación, doc 06 §6) llama a reactivarCliente y avisa con éxito', async () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez', activo: false })));
    configurarVentas(estadoOkColeccion([]));
    mocks.reactivarCliente.mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar cliente' }));

    await waitFor(() => expect(mocks.reactivarCliente).toHaveBeenCalledWith({}, 'c1'));
    expect(await screen.findByText('Cliente reactivado.')).toBeTruthy();
  });

  it('sin conexión: reactiva sin esperar el ack y avisa que falta sincronizar', async () => {
    configurarAuth('admin');
    configurarCliente(estadoOkDoc(clienteDe({ id: 'c1', nombre: 'Ana Pérez', activo: false })));
    configurarVentas(estadoOkColeccion([]));
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.reactivarCliente.mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar cliente' }));

    expect(mocks.reactivarCliente).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.'),
    ).toBeTruthy();
  });
});
