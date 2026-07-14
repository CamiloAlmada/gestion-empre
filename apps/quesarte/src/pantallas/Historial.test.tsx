import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, type Venta } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';
import {
  LIMITE_INICIAL_VENTAS,
  INCREMENTO_LIMITE_VENTAS,
} from '../componentes/historial/constantes';
import { Historial } from './Historial';

const mocks = vi.hoisted(() => ({
  useCollection: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useCollection: mocks.useCollection,
  ventaConverter: {},
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
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
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

function configurarVentas(estado: EstadoFalso<Venta>) {
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'ventas') return estado;
    return { datos: [], cargando: false, error: null };
  });
}

function VisorHeader() {
  const config = useHeaderActual();
  return (
    <div>
      <p data-testid="volver-header">
        {config?.volverA ? `${config.volverA.etiqueta}:${config.volverA.a}` : ''}
      </p>
    </div>
  );
}

/** Pantalla de destino de prueba: expone el `:id` recibido, para verificar
 * que la navegación desde `ListaVentas` (NAV-2a, docs/06-ui-ux.md §2,
 * 2026-07-14) manda al `id` correcto de `/historial/venta/:id`. */
function DetalleVentaFalso() {
  const { id } = useParams<{ id: string }>();
  return <p>Detalle de venta {id}</p>;
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/historial']}>
      <ProveedorToasts>
        <ProveedorHeader>
          <VisorHeader />
          <Routes>
            <Route path="/historial" element={<Historial />} />
            <Route path="/historial/venta/:id" element={<DetalleVentaFalso />} />
          </Routes>
        </ProveedorHeader>
      </ProveedorToasts>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Historial - header', () => {
  it('vuelve a Venta (docs/06-ui-ux.md §2, 2026-07-10: Historial es historial DE VENTAS y cuelga de Venta)', () => {
    configurarVentas(estadoOk([]));

    renderizar();

    expect(screen.getByTestId('volver-header').textContent).toBe('Venta:/venta');
  });
});

describe('Historial - estados', () => {
  it('cargando: muestra el mensaje de carga', () => {
    configurarVentas({ datos: [], cargando: true, error: null });

    renderizar();

    expect(screen.getByText('Cargando ventas…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón Reintentar', () => {
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
    configurarVentas(estadoOk([]));

    renderizar();

    expect(screen.getByText('Todavía no hay ventas.')).toBeTruthy();
  });
});

describe('Historial - listado', () => {
  it('renderiza las ventas del mock: número, total formateado y badge de anulada', () => {
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
    configurarVentas(estadoOk([venta()]));

    renderizar();

    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });
});

describe('Historial - navegación al detalle (NAV-2a, docs/06-ui-ux.md §2, 2026-07-14)', () => {
  it('tocar una venta navega a /historial/venta/:id (ya no queda embebido en esta pantalla)', () => {
    configurarVentas(estadoOk([venta({ id: 'v1', numero: 1001 })]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Venta #1001/ }));

    expect(screen.getByText('Detalle de venta v1')).toBeTruthy();
    // El listado (y sus modales de anulación) ya no están montados: la
    // anulación se mudó con el detalle a `DetalleVentaPantalla`.
    expect(screen.queryByText('Venta #1001')).toBeNull();
  });
});
