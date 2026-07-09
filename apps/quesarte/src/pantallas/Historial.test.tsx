import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FirestoreError } from 'firebase/firestore';
import { money, type Venta } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { ProveedorHeader } from '../componentes/header/ContextoHeader';
import {
  LIMITE_INICIAL_VENTAS,
  INCREMENTO_LIMITE_VENTAS,
} from '../componentes/historial/constantes';
import { Historial } from './Historial';

const mocks = vi.hoisted(() => {
  class AnulacionInvalidaError extends Error {}
  return {
    useAuth: vi.fn(),
    useOnlineStatus: vi.fn(() => true),
    useCollection: vi.fn(),
    useDoc: vi.fn(),
    anularVenta: vi.fn(),
    AnulacionInvalidaError,
  };
});

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  useOnlineStatus: mocks.useOnlineStatus,
  useCollection: mocks.useCollection,
  useDoc: mocks.useDoc,
  ventaConverter: {},
  usuarioConverter: {},
  anularVenta: mocks.anularVenta,
  AnulacionInvalidaError: mocks.AnulacionInvalidaError,
}));

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
  limit: (n: number) => ({ __tipo: 'limit', n }),
}));

interface EstadoFalso<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
}

function estadoOk<T>(datos: T[]): EstadoFalso<T> {
  return { datos, cargando: false, error: null };
}

function venta(over: Partial<Venta> = {}): Venta {
  return {
    id: 'v1',
    numero: 1001,
    fecha: new Date(2026, 0, 5, 14, 30),
    usuarioId: 'u1',
    items: [
      {
        productoId: 'p1',
        nombreProducto: 'Queso Colonia',
        precioUnitCents: money(100000),
        subtotalCents: money(50000),
      },
    ],
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

function configurarVentas(estado: EstadoFalso<Venta>) {
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'ventas') return estado;
    return { datos: [], cargando: false, error: null };
  });
}

function renderizar() {
  return render(
    <ProveedorToasts>
      <ProveedorHeader>
        <Historial />
      </ProveedorHeader>
    </ProveedorToasts>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.useOnlineStatus.mockReturnValue(true);
  mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });
});

describe('Historial - estados', () => {
  it('cargando: muestra el mensaje de carga', () => {
    configurarAuth('admin');
    configurarVentas({ datos: [], cargando: true, error: null });

    renderizar();

    expect(screen.getByText('Cargando ventas…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón Reintentar', () => {
    configurarAuth('admin');
    const error = { code: 'unavailable' } as FirestoreError;
    configurarVentas({ datos: [], cargando: false, error });

    renderizar();

    expect(
      screen.getByText('No se pudo cargar el historial. Revisá tu conexión e intentá de nuevo.'),
    ).toBeTruthy();
    const boton = screen.getByRole('button', { name: 'Reintentar' });
    expect(() => fireEvent.click(boton)).not.toThrow();
  });

  it('vacío: mensaje "Todavía no hay ventas"', () => {
    configurarAuth('admin');
    configurarVentas(estadoOk([]));

    renderizar();

    expect(screen.getByText('Todavía no hay ventas.')).toBeTruthy();
  });

});

describe('Historial - listado', () => {
  it('renderiza las ventas del mock: número, total formateado y badge de anulada', () => {
    configurarAuth('admin');
    configurarVentas(
      estadoOk([
        venta({ id: 'v1', numero: 1001 }),
        venta({ id: 'v2', numero: 1002, estado: 'anulada' }),
      ]),
    );

    renderizar();

    expect(screen.getByText('Venta #1001')).toBeTruthy();
    expect(screen.getByText('Venta #1002')).toBeTruthy();
    expect(screen.getAllByText('$ 500,00').length).toBeGreaterThan(0);
    expect(screen.getByText('Anulada')).toBeTruthy();
  });

  it('"Cargar más" expande el límite de la query en INCREMENTO_LIMITE_VENTAS', () => {
    configurarAuth('admin');
    const muchasVentas = Array.from({ length: LIMITE_INICIAL_VENTAS }, (_, i) =>
      venta({ id: `v${i}`, numero: 1000 + i }),
    );
    configurarVentas(estadoOk(muchasVentas));

    renderizar();

    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    const ultimaLlamada = mocks.useCollection.mock.calls.at(-1)?.[0] as RefFalsa & {
      __clausulas: { __tipo: string; n?: number }[];
    };
    const clausulaLimit = ultimaLlamada.__clausulas.find((c) => c.__tipo === 'limit');
    expect(clausulaLimit?.n).toBe(LIMITE_INICIAL_VENTAS + INCREMENTO_LIMITE_VENTAS);
  });

  it('menos ventas que el límite: no muestra "Cargar más"', () => {
    configurarAuth('admin');
    configurarVentas(estadoOk([venta()]));

    renderizar();

    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });
});

describe('Historial - detalle y permisos de anulación', () => {
  it('tocar una venta muestra el detalle con sus ítems', () => {
    configurarAuth('admin');
    configurarVentas(estadoOk([venta()]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Venta #1001/ }));

    expect(screen.getByRole('heading', { name: 'Venta #1001' })).toBeTruthy();
    // `DetalleVenta` ahora tiene tabla Y lista compacta a la vez (modo
    // compacto de `DataTable`, docs/06-ui-ux.md §3): se scopea a la tabla
    // para no ambigüar con la lista.
    expect(within(screen.getByRole('table')).getByText('Queso Colonia')).toBeTruthy();
  });

  it('vendedor: en el detalle no ve el botón Anular venta', () => {
    configurarAuth('vendedor');
    configurarVentas(estadoOk([venta()]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Venta #1001/ }));

    expect(screen.queryByRole('button', { name: 'Anular venta' })).toBeNull();
  });

  it('admin: ve el botón Anular venta y abre el modal de confirmación', () => {
    configurarAuth('admin');
    configurarVentas(estadoOk([venta()]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Venta #1001/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Anular venta' }));

    expect(screen.getByText('Anular venta #1001')).toBeTruthy();
  });

  it('admin: confirmar la anulación llama a anularVenta con la venta y el uid del admin', async () => {
    configurarAuth('admin');
    mocks.anularVenta.mockResolvedValue(undefined);
    configurarVentas(estadoOk([venta()]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Venta #1001/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Anular venta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    await waitFor(() => expect(mocks.anularVenta).toHaveBeenCalledWith({}, venta(), 'u-actor'));
    await waitFor(() =>
      expect(screen.getByText('Venta anulada. Se restauró el stock.')).toBeTruthy(),
    );
  });
});
