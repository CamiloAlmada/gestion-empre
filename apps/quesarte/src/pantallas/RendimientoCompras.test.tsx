import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { money, type Compra } from '@gestion/core';
import { RendimientoCompras } from './RendimientoCompras';
import { ProveedorHeader } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({ useCollection: vi.fn(), useOnlineStatus: vi.fn(() => true) }));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return { ...actual, useCollection: mocks.useCollection, useOnlineStatus: mocks.useOnlineStatus };
});

vi.mock('../firebase', () => ({ db: {} }));

interface RefFalsa {
  __path: string;
  withConverter: () => RefFalsa;
}

function crearRefFalsa(path: string): RefFalsa {
  const ref: RefFalsa = { __path: path, withConverter: () => ref };
  return ref;
}

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => crearRefFalsa(path),
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
}));

interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: unknown;
}

let estadoCompras: EstadoColeccionFalso<Compra> = { datos: [], cargando: false, error: null };
mocks.useCollection.mockImplementation(() => estadoCompras);

function configurar(overrides: { datos?: Compra[]; cargando?: boolean; error?: unknown }) {
  estadoCompras = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

function compraDe(over: Partial<Compra> & Pick<Compra, 'id'>): Compra {
  return {
    fecha: new Date('2026-07-01'),
    usuarioId: 'admin-1',
    estado: 'confirmada',
    proveedorNombre: 'Proveedor',
    items: [],
    gastos: [],
    totalFacturaCents: money(0),
    totalGastosCents: money(0),
    totalRealCents: money(0),
    ...over,
  };
}

function PlaceholderDetalle() {
  const { id } = useParams<{ id: string }>();
  return <div>Rendimiento de {id}</div>;
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/reportes/compras']}>
      <ProveedorHeader>
        <Routes>
          <Route path="/reportes/compras" element={<RendimientoCompras />} />
          <Route path="/reportes/compras/:id" element={<PlaceholderDetalle />} />
        </Routes>
      </ProveedorHeader>
    </MemoryRouter>,
  );
}

describe('RendimientoCompras', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    estadoCompras = { datos: [], cargando: false, error: null };
  });

  it('la query filtra por estado confirmada y ordena por fecha desc (reusa el índice ya declarado)', () => {
    configurar({ datos: [] });
    renderizar();

    const llamada = mocks.useCollection.mock.calls[0]![0] as {
      __clausulas: { __tipo: string; args: unknown[] }[];
    };
    expect(llamada.__clausulas).toEqual([
      { __tipo: 'where', args: ['estado', '==', 'confirmada'] },
      { __tipo: 'orderBy', args: ['fecha', 'desc'] },
    ]);
  });

  it('estado cargando', () => {
    configurar({ cargando: true });
    renderizar();
    expect(screen.getByText('Cargando compras…')).toBeTruthy();
  });

  it('estado error con reintento', () => {
    configurar({ error: new Error('boom') });
    renderizar();
    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las compras.');
  });

  it('estado vacío: "Todavía no hay compras confirmadas."', () => {
    configurar({ datos: [] });
    renderizar();
    expect(screen.getByText('Todavía no hay compras confirmadas.')).toBeTruthy();
  });

  it('lista compras confirmadas con proveedor, fecha y costo total, y navega al tocarlas', () => {
    configurar({
      datos: [compraDe({ id: 'c1', proveedorNombre: 'Quesos del Norte', totalRealCents: money(150_000) })],
    });
    renderizar();

    expect(screen.getByText('Quesos del Norte')).toBeTruthy();
    expect(screen.getByText('$ 1.500,00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Quesos del Norte/ }));
    expect(screen.getByText('Rendimiento de c1')).toBeTruthy();
  });

  it('offline: banner específico', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    configurar({ datos: [] });
    renderizar();
    expect(screen.getByRole('status').textContent).toContain('Sin conexión');
  });
});
