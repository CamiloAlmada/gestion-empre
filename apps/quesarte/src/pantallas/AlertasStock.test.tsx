import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, peso, type Configuracion, type Pieza, type Producto } from '@gestion/core';
import { ProveedorHeader } from '../componentes/header/ContextoHeader';
import { AlertasStock } from './AlertasStock';

const mocks = vi.hoisted(() => ({
  useCollection: vi.fn(),
  useDoc: vi.fn(),
  useOnlineStatus: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useCollection: mocks.useCollection,
  useDoc: mocks.useDoc,
  useOnlineStatus: mocks.useOnlineStatus,
  piezaConverter: {},
  productoConverter: {},
  configuracionConverter: {},
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
  doc: (_db: unknown, path: string, id: string) => crearRef(`${path}/${id}`),
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
}));

interface EstadoFalso<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
}

function estadoOk<T>(datos: T[]): EstadoFalso<T> {
  return { datos, cargando: false, error: null };
}

function configurar(opciones: {
  productos?: EstadoFalso<Producto>;
  piezas?: EstadoFalso<Pieza>;
  configuracion?: Configuracion | null;
}) {
  const productos = opciones.productos ?? estadoOk<Producto>([]);
  const piezas = opciones.piezas ?? estadoOk<Pieza>([]);
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'productos') return productos;
    if (q.__path === 'piezas') return piezas;
    return { datos: [], cargando: false, error: null };
  });
  mocks.useDoc.mockReturnValue({
    datos: opciones.configuracion ?? null,
    cargando: false,
    error: null,
  });
}

function producto(over: Partial<Producto> & Pick<Producto, 'id'>): Producto {
  return {
    nombre: `Producto ${over.id}`,
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    modoStock: 'fraccionado_por_pieza',
    precioVentaCents: money(10_000),
    costoPromedioCents: money(6_000),
    activo: true,
    actualizadoEn: new Date(),
    ...over,
  };
}

function pieza(over: Partial<Pieza> & Pick<Pieza, 'id' | 'productoId'>): Pieza {
  return {
    pesoInicialGramos: peso(5000),
    pesoRestanteGramos: peso(4000),
    costoKgCents: money(30_000),
    fechaIngreso: new Date(),
    estado: 'disponible',
    ...over,
  };
}

/** Fecha a `dias` de hoy, a mediodía local (evita bordes de medianoche). */
function enDias(dias: number): Date {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias, 12, 0, 0);
}

function montar() {
  return render(
    <MemoryRouter>
      <ProveedorHeader>
        <AlertasStock />
      </ProveedorHeader>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.useOnlineStatus.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AlertasStock — estados', () => {
  it('cargando', () => {
    configurar({ productos: { datos: [], cargando: true, error: null } });
    montar();

    expect(screen.getByText(/Revisando vencimientos y stock/)).toBeTruthy();
  });

  it('error: mensaje accionable con role="alert" y reintento', () => {
    configurar({
      piezas: { datos: [], cargando: false, error: { code: 'unavailable' } as FirestoreError },
    });
    montar();

    expect(screen.getByRole('alert').textContent).toMatch(/Revisá tu conexión/);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  // Criterio del brief: "No hay nada para avisar" se diseña como buena
  // noticia, no como una sección vacía y triste.
  it('sin alertas: afirma que está todo en orden y nombra la ventana', () => {
    configurar({ productos: estadoOk([producto({ id: 'p1', modoStock: 'granel' })]) });
    montar();

    expect(screen.getByText('Todo en orden')).toBeTruthy();
    expect(screen.getByText(/próximos 7 días/)).toBeTruthy();
  });

  it('offline: avisa la limitación sin bloquear el contenido', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    configurar({});
    montar();

    expect(screen.getByRole('status').textContent).toMatch(/Sin conexión/);
    expect(screen.getByText('Todo en orden')).toBeTruthy();
  });
});

describe('AlertasStock — vencimientos', () => {
  it('lista los productos con piezas por vencer, con plazo y peso', () => {
    configurar({
      productos: estadoOk([producto({ id: 'p1', nombre: 'Colonia' })]),
      piezas: estadoOk([
        pieza({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(2500), fechaVencimiento: enDias(3) }),
      ]),
    });
    montar();

    const seccion = screen.getByRole('region', { name: 'Por vencer' });
    expect(within(seccion).getByText('Colonia')).toBeTruthy();
    expect(within(seccion).getByText('Vence en 3 días')).toBeTruthy();
    expect(within(seccion).getByText('1 pieza · 2,5 kg')).toBeTruthy();
  });

  it('cada fila navega al detalle del producto (el aviso lleva a la acción)', () => {
    configurar({
      productos: estadoOk([producto({ id: 'p1', nombre: 'Colonia' })]),
      piezas: estadoOk([pieza({ id: 'pz1', productoId: 'p1', fechaVencimiento: enDias(1) })]),
    });
    montar();

    expect(screen.getByRole('link', { name: /Colonia/ }).getAttribute('href')).toBe(
      '/stock/producto/p1',
    );
  });

  it('una pieza ya vencida se distingue por TEXTO, no solo por color', () => {
    configurar({
      productos: estadoOk([producto({ id: 'p1', nombre: 'Colonia' })]),
      piezas: estadoOk([pieza({ id: 'pz1', productoId: 'p1', fechaVencimiento: enDias(-2) })]),
    });
    montar();

    expect(screen.getByText('Venció hace 2 días')).toBeTruthy();
  });

  it('un producto inactivo no alerta aunque tenga piezas por vencer', () => {
    configurar({
      productos: estadoOk([producto({ id: 'p1', nombre: 'Colonia', activo: false })]),
      piezas: estadoOk([pieza({ id: 'pz1', productoId: 'p1', fechaVencimiento: enDias(1) })]),
    });
    montar();

    expect(screen.getByText('Todo en orden')).toBeTruthy();
  });

  it('la ventana configurada por el negocio manda sobre el default', () => {
    const configuracion: Configuracion = { diasAvisoVencimiento: 20 };
    configurar({
      productos: estadoOk([producto({ id: 'p1', nombre: 'Colonia' })]),
      piezas: estadoOk([pieza({ id: 'pz1', productoId: 'p1', fechaVencimiento: enDias(15) })]),
      configuracion,
    });
    montar();

    // Con el default (7) esto no alertaría: la config es la que decide.
    expect(screen.getByText('Vence en 15 días')).toBeTruthy();
    expect(screen.getByText(/dentro de 20 días/)).toBeTruthy();
  });
});

describe('AlertasStock — stock bajo', () => {
  it('lista los productos bajo el mínimo con existencia y umbral', () => {
    configurar({
      productos: estadoOk([
        producto({
          id: 'p2',
          nombre: 'Ricota',
          modoStock: 'granel',
          stockGranelGramos: peso(400),
          umbralAlertaStock: 1000,
        }),
      ]),
    });
    montar();

    const seccion = screen.getByRole('region', { name: 'Bajo el mínimo' });
    expect(within(seccion).getByText('Ricota')).toBeTruthy();
    expect(within(seccion).getByText('Quedan 400 g · mínimo 1 kg')).toBeTruthy();
    expect(within(seccion).getByText('Stock bajo')).toBeTruthy();
  });

  it('un producto puede aparecer en las dos secciones a la vez', () => {
    configurar({
      productos: estadoOk([producto({ id: 'p1', nombre: 'Colonia', umbralAlertaStock: 10_000 })]),
      piezas: estadoOk([
        pieza({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(900), fechaVencimiento: enDias(2) }),
      ]),
    });
    montar();

    expect(within(screen.getByRole('region', { name: 'Por vencer' })).getByText('Colonia')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Bajo el mínimo' })).getByText('Colonia'),
    ).toBeTruthy();
  });
});
