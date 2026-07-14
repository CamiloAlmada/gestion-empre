import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, type Venta } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { DetalleVentaPantalla } from './DetalleVentaPantalla';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => {
  class AnulacionInvalidaError extends Error {}
  return {
    useAuth: vi.fn(),
    useOnlineStatus: vi.fn(() => true),
    useDoc: vi.fn(),
    anularVenta: vi.fn(),
    AnulacionInvalidaError,
  };
});

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  useOnlineStatus: mocks.useOnlineStatus,
  useDoc: mocks.useDoc,
  ventaConverter: {},
  usuarioConverter: {},
  clienteConverter: {},
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
  doc: (_db: unknown, coleccion: string, id: string) => crearRef(`${coleccion}/${id}`),
}));

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

/** `useDoc` se llama tanto para la venta (`ventas/{id}`) como, dentro de
 * `DetalleVenta`, para el vendedor (`usuarios/{uid}`, solo si `esAdmin`) y el
 * cliente asociado (`clientes/{id}`, solo si `venta.clienteId`) — se
 * discrimina por el `__path` de la ref falsa, mismo patrón que
 * `DetalleProductoPantalla.test.tsx` con `useCollection`. */
function configurarUseDoc(estados: {
  venta?: { datos: Venta | null; cargando: boolean; error: FirestoreError | null };
}) {
  mocks.useDoc.mockImplementation((ref: RefFalsa | null) => {
    if (ref === null) return { datos: null, cargando: false, error: null };
    if (ref.__path.startsWith('ventas/')) {
      return estados.venta ?? { datos: null, cargando: false, error: null };
    }
    return { datos: null, cargando: false, error: null };
  });
}

function VisorHeader() {
  const config = useHeaderActual();
  return (
    <div>
      <p data-testid="titulo-header">{config?.titulo}</p>
      <p data-testid="volver-header">
        {config?.volverA ? `${config.volverA.etiqueta}:${config.volverA.a}` : ''}
      </p>
    </div>
  );
}

function renderizar(id = 'v1') {
  return render(
    <MemoryRouter initialEntries={[`/historial/venta/${id}`]}>
      <ProveedorToasts>
        <ProveedorHeader>
          <VisorHeader />
          <Routes>
            <Route path="/historial/venta/:id" element={<DetalleVentaPantalla />} />
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

describe('DetalleVentaPantalla - estados', () => {
  it('cargando: muestra el mensaje de carga', () => {
    configurarAuth('admin');
    configurarUseDoc({ venta: { datos: null, cargando: true, error: null } });

    renderizar();

    expect(screen.getByText('Cargando venta…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón Reintentar', () => {
    configurarAuth('admin');
    const error = { code: 'unavailable' } as FirestoreError;
    configurarUseDoc({ venta: { datos: null, cargando: false, error } });

    renderizar();

    expect(
      screen.getByText('No se pudo cargar la venta. Revisá tu conexión e intentá de nuevo.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('venta inexistente: mensaje de error con link a Historial', () => {
    configurarAuth('admin');
    configurarUseDoc({ venta: { datos: null, cargando: false, error: null } });

    renderizar('v-inexistente');

    expect(screen.getByText('No encontramos esa venta.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Volver a Historial' });
    expect(link.getAttribute('href')).toBe('/historial');
  });
});

describe('DetalleVentaPantalla - header contextual', () => {
  it('el título del header es "Venta #N" y el volver cae a Historial (fallback)', () => {
    configurarAuth('admin');
    configurarUseDoc({ venta: { datos: venta({ numero: 1001 }), cargando: false, error: null } });

    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Venta #1001');
    expect(screen.getByTestId('volver-header').textContent).toBe('Historial:/historial');
  });
});

describe('DetalleVentaPantalla - detalle y permisos de anulación', () => {
  it('muestra el detalle con sus ítems', () => {
    configurarAuth('admin');
    configurarUseDoc({ venta: { datos: venta(), cargando: false, error: null } });

    renderizar();

    expect(screen.getByRole('heading', { name: 'Venta #1001' })).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('Queso Colonia')).toBeTruthy();
  });

  it('vendedor: no ve el botón Anular venta', () => {
    configurarAuth('vendedor');
    configurarUseDoc({ venta: { datos: venta(), cargando: false, error: null } });

    renderizar();

    expect(screen.queryByRole('button', { name: 'Anular venta' })).toBeNull();
  });

  it('admin: ve el botón Anular venta y abre el modal de confirmación', () => {
    configurarAuth('admin');
    configurarUseDoc({ venta: { datos: venta(), cargando: false, error: null } });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Anular venta' }));

    expect(screen.getByText('Anular venta #1001')).toBeTruthy();
  });

  it('admin: confirmar la anulación llama a anularVenta con la venta y el uid del admin', async () => {
    configurarAuth('admin');
    mocks.anularVenta.mockResolvedValue(undefined);
    configurarUseDoc({ venta: { datos: venta(), cargando: false, error: null } });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Anular venta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));

    await waitFor(() => expect(mocks.anularVenta).toHaveBeenCalledWith({}, venta(), 'u-actor'));
    await waitFor(() =>
      expect(screen.getByText('Venta anulada. Se restauró el stock.')).toBeTruthy(),
    );
  });
});
