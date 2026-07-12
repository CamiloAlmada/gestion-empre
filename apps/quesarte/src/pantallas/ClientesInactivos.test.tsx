import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, type Cliente } from '@gestion/core';
import { ClientesInactivos } from './ClientesInactivos';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({ useCollection: vi.fn(), useDoc: vi.fn() }));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return { ...actual, useCollection: mocks.useCollection, useDoc: mocks.useDoc };
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
    </div>
  );
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/clientes/inactivos']}>
      <ProveedorHeader>
        <VisorHeader />
        <ClientesInactivos />
      </ProveedorHeader>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });
});

describe('ClientesInactivos - header', () => {
  it('título "Inactivos", vuelve a Clientes (subvista, docs/06-ui-ux.md §2)', () => {
    configurarClientes(estadoOk([]));
    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Inactivos');
    expect(screen.getByTestId('volver-header').textContent).toBe('Clientes:/clientes');
  });
});

describe('ClientesInactivos - estados', () => {
  it('cargando', () => {
    configurarClientes({ datos: [], cargando: true, error: null });
    renderizar();

    expect(screen.getByText('Cargando clientes…')).toBeTruthy();
  });

  it('error: mensaje y botón Reintentar', () => {
    configurarClientes({ datos: [], cargando: false, error: { code: 'unavailable' } as FirestoreError });
    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar los clientes.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('sin clientes inactivos: mensaje de vacío sobrio', () => {
    configurarClientes(estadoOk([cliente({ id: 'c1', nombre: 'Cliente al día', stats: { cantidadVentas: 1, totalHistoricoCents: money(1000), ultimaCompra: new Date() } })]));
    renderizar();

    expect(screen.getByText('Ningún cliente inactivo por ahora.')).toBeTruthy();
  });
});

describe('ClientesInactivos - listado', () => {
  it('solo lista los clientes que clasifican inactivos, ordenados por total histórico descendente', () => {
    const haceMucho = new Date();
    haceMucho.setDate(haceMucho.getDate() - 90);
    const reciente = new Date();

    configurarClientes(
      estadoOk([
        cliente({
          id: 'c-al-dia',
          nombre: 'Al día',
          stats: { cantidadVentas: 1, totalHistoricoCents: money(900000), ultimaCompra: reciente },
        }),
        cliente({
          id: 'c-bajo',
          nombre: 'Inactivo bajo',
          stats: { cantidadVentas: 1, totalHistoricoCents: money(10000), ultimaCompra: haceMucho },
        }),
        cliente({
          id: 'c-alto',
          nombre: 'Inactivo alto',
          stats: { cantidadVentas: 1, totalHistoricoCents: money(500000), ultimaCompra: haceMucho },
        }),
      ]),
    );

    renderizar();

    expect(screen.queryByText('Al día')).toBeNull();
    const nombres = screen.getAllByText(/^Inactivo (alto|bajo)$/).map((el) => el.textContent);
    expect(nombres).toEqual(['Inactivo alto', 'Inactivo bajo']);
  });

  it('cliente inactivo desactivado (activo: false): no aparece', () => {
    const haceMucho = new Date();
    haceMucho.setDate(haceMucho.getDate() - 90);

    configurarClientes(
      estadoOk([
        cliente({
          id: 'c1',
          nombre: 'Desactivado',
          activo: false,
          stats: { cantidadVentas: 1, totalHistoricoCents: money(500000), ultimaCompra: haceMucho },
        }),
      ]),
    );

    renderizar();

    expect(screen.getByText('Ningún cliente inactivo por ahora.')).toBeTruthy();
  });

  it('fila con teléfono normalizable: incluye el botón de WhatsApp', () => {
    mocks.useDoc.mockImplementation((ref: RefFalsa | null) => {
      if (ref?.__path === 'configuracion/plantillasWhatsApp') {
        return {
          datos: [{ id: 'p1', nombre: 'Te extrañamos', contexto: 'inactivo', texto: 'Hola {cliente}' }],
          cargando: false,
          error: null,
        };
      }
      return { datos: null, cargando: false, error: null };
    });
    const haceMucho = new Date();
    haceMucho.setDate(haceMucho.getDate() - 90);

    configurarClientes(
      estadoOk([
        cliente({
          id: 'c1',
          nombre: 'Marta',
          telefonoE164: '59899123456',
          stats: { cantidadVentas: 1, totalHistoricoCents: money(500000), ultimaCompra: haceMucho },
        }),
      ]),
    );

    renderizar();

    expect(screen.getByRole('button', { name: 'Enviar WhatsApp a Marta' })).toBeTruthy();
  });
});

describe('ClientesInactivos - reintentar', () => {
  it('el botón Reintentar vuelve a suscribir la query', () => {
    configurarClientes({ datos: [], cargando: false, error: { code: 'unavailable' } as FirestoreError });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(mocks.useCollection).toHaveBeenCalled();
  });
});
