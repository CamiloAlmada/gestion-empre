import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, type Cliente } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { Clientes } from './Clientes';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
  crearCliente: vi.fn(),
}));

// Mismo criterio que `Productos.test.tsx`: `clienteConverter` se deja pasar
// tal cual (no se ejercita, `withConverter` es identidad); `crearCliente` es
// la única operación con I/O real y se mockea entera.
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    useCollection: mocks.useCollection,
    crearCliente: mocks.crearCliente,
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
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
}));

interface EstadoFalso<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
}

function estadoOk<T>(datos: T[]): EstadoFalso<T> {
  return { datos, cargando: false, error: null };
}

function cliente(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

function configurarClientes(estado: EstadoFalso<Cliente>) {
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'clientes') return estado;
    return { datos: [], cargando: false, error: null };
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

/** Placeholder de la ruta de ficha: solo confirma a qué `id` navegó. */
function PlaceholderFicha() {
  const { id } = useParams<{ id: string }>();
  return <div>Ficha de {id}</div>;
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/clientes']}>
      <ProveedorToasts>
        <ProveedorHeader>
          <VisorHeader />
          <Routes>
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/cliente/:id" element={<PlaceholderFicha />} />
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

describe('Clientes - header', () => {
  it('título "Clientes", sin volver (raíz del tab, docs/06-ui-ux.md §2, 2026-07-10)', () => {
    configurarClientes(estadoOk([]));
    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Clientes');
    expect(screen.getByTestId('volver-header').textContent).toBe('');
  });

  it('expone la acción "Agregar cliente" (accesible tanto a vendedor como a admin)', () => {
    // Lista NO vacía: con la lista vacía, el estado "Todavía no hay
    // clientes." agrega un segundo botón "Agregar cliente" propio (ver
    // `Clientes.tsx`) que ambigüaría este `getByRole` — mismo caso que
    // `Productos.test.tsx` con "Agregar producto".
    configurarClientes(estadoOk([cliente({ id: 'c1', nombre: 'Ana Pérez' })]));
    renderizar();

    expect(screen.getByRole('button', { name: 'Agregar cliente' })).toBeTruthy();
  });

  it('expone la acción "Historial", que enlaza al Historial general (invierte la acción que antes declaraba Historial)', () => {
    configurarClientes(estadoOk([cliente({ id: 'c1', nombre: 'Ana Pérez' })]));
    renderizar();

    const enlace = screen.getByRole('link', { name: 'Historial' });
    expect(enlace.getAttribute('href')).toBe('/historial');
  });
});

describe('Clientes - estados', () => {
  it('cargando', () => {
    configurarClientes({ datos: [], cargando: true, error: null });
    renderizar();

    expect(screen.getByText('Cargando clientes…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón Reintentar', () => {
    configurarClientes({ datos: [], cargando: false, error: { code: 'unavailable' } as FirestoreError });
    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar los clientes.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('vacío (sin clientes en absoluto): ofrece agregar', () => {
    configurarClientes(estadoOk([]));
    renderizar();

    expect(screen.getByText('Todavía no hay clientes.')).toBeTruthy();
  });

  it('búsqueda sin resultados: mensaje específico con el término buscado', () => {
    configurarClientes(estadoOk([cliente({ id: 'c1', nombre: 'Ana Pérez' })]));
    renderizar();

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'zzz' } });

    expect(screen.getByText('No se encontraron clientes para "zzz".')).toBeTruthy();
  });
});

describe('Clientes - listado y búsqueda', () => {
  const clientesFalsos: Cliente[] = [
    cliente({ id: 'c1', nombre: 'Ana Pérez', alias: 'Anita', telefono: '099111222' }),
    cliente({ id: 'c2', nombre: 'Marta López', telefono: '098333444', activo: false }),
    cliente({ id: 'c3', nombre: 'Carlos Núñez' }),
  ];

  it('lista los clientes activos, ordenados como llega la query (excluye inactivos por defecto)', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByText('Carlos Núñez')).toBeTruthy();
    expect(screen.queryByText('Marta López')).toBeNull();
  });

  it('"Mostrar inactivos" revela los clientes desactivados', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar inactivos' }));

    expect(screen.getByText('Marta López')).toBeTruthy();
  });

  it('la búsqueda filtra por nombre ignorando acentos', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'nunez' } });

    expect(screen.getByText('Carlos Núñez')).toBeTruthy();
    expect(screen.queryByText('Ana Pérez')).toBeNull();
  });

  it('la búsqueda filtra por alias', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'anita' } });

    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.queryByText('Carlos Núñez')).toBeNull();
  });

  it('la búsqueda filtra por teléfono', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar inactivos' }));
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: '098333444' } });

    expect(screen.getByText('Marta López')).toBeTruthy();
    expect(screen.queryByText('Ana Pérez')).toBeNull();
  });

  it('tocar un cliente navega a su ficha', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: /Ana Pérez/ }));

    expect(screen.getByText('Ficha de c1')).toBeTruthy();
  });
});

describe('Clientes - alta', () => {
  it('valida el nombre requerido y no llama a crearCliente', () => {
    configurarClientes(estadoOk([]));
    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar cliente' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('Ingresá el nombre del cliente.')).toBeTruthy();
    expect(mocks.crearCliente).not.toHaveBeenCalled();
  });

  it('con conexión: crea el cliente, muestra el toast de éxito y cierra el modal', async () => {
    configurarClientes(estadoOk([]));
    mocks.crearCliente.mockReturnValue({ clienteId: 'nuevo', confirmacion: Promise.resolve() });
    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar cliente' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva Clienta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.crearCliente).toHaveBeenCalledTimes(1));
    const [, datos] = mocks.crearCliente.mock.calls[0] as [unknown, { nombre: string }];
    expect(datos.nombre).toBe('Nueva Clienta');
    expect(await screen.findByText('Cliente creado.')).toBeTruthy();
  });

  it('sin conexión: guarda sin esperar el ack, cierra el modal al instante y avisa que falta sincronizar', async () => {
    configurarClientes(estadoOk([]));
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.crearCliente.mockReturnValue({ clienteId: 'nuevo', confirmacion: Promise.resolve() });
    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar cliente' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva Clienta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    expect(mocks.crearCliente).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.'),
    ).toBeTruthy();
  });

  it('si la escritura falla (online), muestra un toast de error', async () => {
    configurarClientes(estadoOk([]));
    mocks.crearCliente.mockReturnValue({
      clienteId: 'nuevo',
      confirmacion: Promise.reject(new Error('boom')),
    });
    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar cliente' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva Clienta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('No se pudo crear el cliente. Intentá de nuevo.')).toBeTruthy();
  });
});
