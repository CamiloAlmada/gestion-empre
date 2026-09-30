import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import {
  money,
  type Cliente,
  type Configuracion,
  type PlantillaWhatsApp,
  type Venta,
} from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { Clientes } from './Clientes';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  botonWhatsApp: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
  useDoc: vi.fn(),
  crearCliente: vi.fn(),
}));

// Mismo criterio que `Productos.test.tsx`: `clienteConverter`/`configuracionConverter`/
// `plantillasWhatsAppConverter` se dejan pasar tal cual (no se ejercitan,
// `withConverter` es identidad); `crearCliente` es la única operación con
// I/O real y se mockea entera. `useAuth` decide SOLO el 4.º chip "Deben"
// (doc 11, solo admin): por defecto el usuario es vendedor, o sea la pantalla
// idéntica a la de antes de los cobros diferidos.
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useAuth: mocks.useAuth,
    useOnlineStatus: mocks.useOnlineStatus,
    useCollection: mocks.useCollection,
    useDoc: mocks.useDoc,
    crearCliente: mocks.crearCliente,
  };
});

vi.mock('../firebase', () => ({ db: {} }));

// Espía las props que recibe el botón de WhatsApp y delega en el real (los
// tests de "Inactivos" siguen buscando su botón por aria-label).
vi.mock('../componentes/whatsapp/BotonWhatsApp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../componentes/whatsapp/BotonWhatsApp')>();
  return {
    BotonWhatsApp: (props: Parameters<typeof actual.BotonWhatsApp>[0]) => {
      mocks.botonWhatsApp(props);
      return actual.BotonWhatsApp(props);
    },
  };
});

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

/** `useDoc`: `Clientes.tsx` suscribe `configuracion/general` (WA-F1,
 * `codigoPaisDefault`), y `ListaClientesInactivos`/`BotonWhatsApp` (dentro
 * del chip "Inactivos") suscriben ADEMÁS `configuracion/general` y
 * `configuracion/plantillasWhatsApp` por su cuenta — enruta por `__path`
 * (mismo criterio que `DetalleVenta.test.tsx`/`ClientesInactivos.test.tsx`
 * de tandas anteriores). Sin argumentos: todo `null` (defaults del kit y de
 * `BotonWhatsApp` — cae al seed de plantillas).
 */
function configurarUseDoc(
  opciones: {
    configuracionGeneral?: Configuracion | null;
    plantillas?: PlantillaWhatsApp[] | null;
  } = {},
) {
  mocks.useDoc.mockImplementation((ref: RefFalsa | null) => {
    if (ref === null) return { datos: null, cargando: false, error: null };
    if (ref.__path === 'configuracion/general') {
      return { datos: opciones.configuracionGeneral ?? null, cargando: false, error: null };
    }
    if (ref.__path === 'configuracion/plantillasWhatsApp') {
      return { datos: opciones.plantillas ?? null, cargando: false, error: null };
    }
    return { datos: null, cargando: false, error: null };
  });
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
      <div data-testid="accion-header">{config?.accionHeader}</div>
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

function configurarRol(rol: 'admin' | 'vendedor') {
  mocks.useAuth.mockReturnValue({
    usuario: { uid: 'u1' },
    perfil: { uid: 'u1', nombre: 'Ana', email: 'ana@quesarte.com', rol, activo: true },
    cargando: false,
  });
}

beforeEach(() => {
  configurarUseDoc();
  configurarRol('vendedor');
});

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

  it('el ícono de historial vive en el header SIEMPRE (accionHeader, WA-G), con aria-label "Ver historial de ventas" hacia /historial', () => {
    configurarClientes(estadoOk([cliente({ id: 'c1', nombre: 'Ana Pérez' })]));
    renderizar();

    const contenedor = within(screen.getByTestId('accion-header'));
    const enlace = contenedor.getByRole('link', { name: 'Ver historial de ventas' });
    expect(enlace.getAttribute('href')).toBe('/historial');
  });

  it('el cluster de acciones (píldoras flotantes) ya NO incluye "Historial" ni "Inactivos" (WA-G): solo el botón Agregar', () => {
    configurarClientes(estadoOk([cliente({ id: 'c1', nombre: 'Ana Pérez' })]));
    renderizar();

    const contenedor = screen.getByTestId('acciones-header');
    expect(within(contenedor).queryByText('Historial')).toBeNull();
    expect(within(contenedor).queryByText('Inactivos')).toBeNull();
    expect(Array.from(contenedor.children)).toHaveLength(1);
    expect(contenedor.children[0]!.getAttribute('aria-label')).toBe('Agregar cliente');
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

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'zzz' } });

    expect(screen.getByText('No se encontraron clientes para "zzz".')).toBeTruthy();
  });
});

describe('Clientes - terna Todos/Activos/Inactivos (WA-G, docs/06-ui-ux.md §3)', () => {
  // Relativas a HOY, no fijas (2026-09-01): con fechas absolutas el test se
  // vencía solo cuando "reciente" superaba el umbral de 30 días de inactividad.
  const DIA_MS = 24 * 60 * 60 * 1000;
  const HACE_MUCHO = new Date(Date.now() - 103 * DIA_MS); // inactivo comercial (umbral global 30).
  const RECIENTE = new Date(Date.now() - 3 * DIA_MS);

  const activoAlDia = cliente({
    id: 'c1',
    nombre: 'Al Día',
    stats: { cantidadVentas: 1, totalHistoricoCents: money(100000), ultimaCompra: RECIENTE },
  });
  const dadoDeBaja = cliente({
    id: 'c2',
    nombre: 'Dado De Baja',
    activo: false,
    stats: { cantidadVentas: 1, totalHistoricoCents: money(100000), ultimaCompra: RECIENTE },
  });
  const inactivoBajo = cliente({
    id: 'c3',
    nombre: 'Inactivo Bajo',
    telefonoE164: '59899000001',
    stats: { cantidadVentas: 1, totalHistoricoCents: money(10000), ultimaCompra: HACE_MUCHO },
  });
  const inactivoAlto = cliente({
    id: 'c4',
    nombre: 'Inactivo Alto',
    telefonoE164: '59899000002',
    stats: { cantidadVentas: 1, totalHistoricoCents: money(900000), ultimaCompra: HACE_MUCHO },
  });
  const clientesFalsos: Cliente[] = [activoAlDia, dadoDeBaja, inactivoBajo, inactivoAlto];

  it('default: el chip "Todos" está presionado al montar', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    expect(screen.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('"Todos": muestra vigentes Y dados de baja (con su badge "Inactivo" — mismo tratamiento de siempre)', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    expect(screen.getByText('Al Día')).toBeTruthy();
    expect(screen.getByText('Dado De Baja')).toBeTruthy();
    expect(screen.getByText('Inactivo Bajo')).toBeTruthy();
    expect(screen.getByText('Inactivo Alto')).toBeTruthy();
    // El badge de "dado de baja" (ListaClientes, sin cambios de WA-G).
    expect(screen.getByText('Inactivo')).toBeTruthy();
  });

  it('"Activos": excluye a los dados de baja Y a los vigentes inactivos por ritmo comercial', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Activos' }));

    expect(screen.getByText('Al Día')).toBeTruthy();
    expect(screen.queryByText('Dado De Baja')).toBeNull();
    expect(screen.queryByText('Inactivo Bajo')).toBeNull();
    expect(screen.queryByText('Inactivo Alto')).toBeNull();
  });

  it('"Inactivos": solo vigentes inactivos por ritmo comercial, NUNCA dados de baja', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));

    expect(screen.queryByText('Al Día')).toBeNull();
    expect(screen.queryByText('Dado De Baja')).toBeNull();
    expect(screen.getByText('Inactivo Bajo')).toBeTruthy();
    expect(screen.getByText('Inactivo Alto')).toBeTruthy();
  });

  it('"Inactivos": fila enriquecida (días sin venir + total histórico) ordenada por valor histórico descendente', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));

    const filas = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    const indiceAlto = filas.findIndex((t) => t.includes('Inactivo Alto'));
    const indiceBajo = filas.findIndex((t) => t.includes('Inactivo Bajo'));
    expect(indiceAlto).toBeGreaterThanOrEqual(0);
    expect(indiceBajo).toBeGreaterThan(indiceAlto);

    expect(screen.getByText('$ 9.000,00')).toBeTruthy(); // total de "Inactivo Alto"
    expect(screen.getByText('$ 100,00')).toBeTruthy(); // total de "Inactivo Bajo"
    // Ambos hace ~103 días: mismo redondeo de días para los dos, no se
    // pisan porque son textos distintos por fila — solo confirmamos que la
    // fila trae el dato (formato "Hace N días" cubierto en
    // `ListaClientesInactivos.test.tsx`).
    expect(screen.getAllByText(/^Hace \d+ días$/).length).toBe(2);
  });

  it('"Inactivos": la fila trae el botón de WhatsApp con "Te extrañamos" (contexto inactivo) — visible sin gate de rol (WA-G, ya no es admin-only)', () => {
    configurarUseDoc({
      plantillas: [{ id: 'p1', nombre: 'Te extrañamos', contexto: 'inactivo', texto: 'Hola {cliente}, {diasSinVenir} días' }],
    });
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));

    expect(screen.getByRole('button', { name: 'Enviar WhatsApp a Inactivo Alto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar WhatsApp a Inactivo Bajo' })).toBeTruthy();
  });

  it('"Activos" vacío (sin búsqueda): mensaje sobrio específico', () => {
    configurarClientes(estadoOk([dadoDeBaja, inactivoAlto]));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Activos' }));

    expect(screen.getByText('No hay clientes activos por ahora.')).toBeTruthy();
  });

  it('"Inactivos" vacío (sin búsqueda): mensaje sobrio específico', () => {
    configurarClientes(estadoOk([activoAlDia]));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));

    expect(screen.getByText('Ningún cliente inactivo por ahora.')).toBeTruthy();
  });

  it('la búsqueda sigue aplicando sobre el filtro elegido', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Alto' } });

    expect(screen.getByText('Inactivo Alto')).toBeTruthy();
    expect(screen.queryByText('Inactivo Bajo')).toBeNull();
  });

  it('cambiar de chip resetea la vista al conjunto del nuevo filtro (no arrastra la selección anterior)', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Activos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));

    expect(screen.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Dado De Baja')).toBeTruthy();
  });
});

describe('Clientes - chip "Deben" (doc 11, cobros diferidos, solo admin)', () => {
  const AHORA = new Date(2026, 8, 30, 15, 0, 0);

  function ventaACobrar(
    id: string,
    clienteId: string,
    clienteNombre: string,
    fecha: Date,
    totalCents: number,
  ): Venta {
    return {
      id,
      numero: 1,
      fecha,
      usuarioId: 'u1',
      items: [],
      totalCents: money(totalCents),
      medioPago: 'a_cobrar',
      estado: 'completada',
      clienteId,
      clienteNombre,
      cobro: { v: 1, estado: 'pendiente', cobradoCents: money(0), pagos: [] },
    };
  }

  const ana = cliente({ id: 'c1', nombre: 'Ana Pérez', telefonoE164: '59899000001' });
  const beto = cliente({ id: 'c2', nombre: 'Beto Gómez', telefonoE164: '59899000002' });
  const carla = cliente({ id: 'c3', nombre: 'Carla Sosa', telefonoE164: '59899000003' });
  const clientesBase = [ana, beto, carla];

  // Beto debe desde hace 12 días (2 ventas), Ana desde hoy (1 venta), Carla hace 1 día.
  const ventasBase: Venta[] = [
    ventaACobrar('v1', 'c1', 'Ana Pérez', new Date(2026, 8, 30, 9, 0, 0), 250000),
    ventaACobrar('v2', 'c2', 'Beto Gómez', new Date(2026, 8, 18, 10, 0, 0), 100000),
    ventaACobrar('v3', 'c2', 'Beto Gómez', new Date(2026, 8, 25, 10, 0, 0), 50000),
    ventaACobrar('v4', 'c3', 'Carla Sosa', new Date(2026, 8, 29, 10, 0, 0), 30000),
  ];

  function configurarConDeudas(opciones: {
    ventas?: EstadoFalso<Venta> & { desdeCache?: boolean };
    clientes?: Cliente[];
  } = {}) {
    const ventas = opciones.ventas ?? { ...estadoOk(ventasBase), desdeCache: false };
    mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
      if (q === null) return { datos: [], cargando: false, error: null, desdeCache: true };
      if (q.__path === 'clientes') return estadoOk(opciones.clientes ?? clientesBase);
      if (q.__path === 'ventas') return { desdeCache: false, ...ventas };
      return { datos: [], cargando: false, error: null };
    });
  }

  function consultasDeVentas() {
    return mocks.useCollection.mock.calls.filter(([q]) => q !== null && (q as RefFalsa).__path === 'ventas');
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    configurarRol('admin');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('vendedor: no ve el chip "Deben" y nunca se suscribe a las ventas', () => {
    configurarRol('vendedor');
    configurarConDeudas();
    renderizar();

    expect(screen.queryByRole('button', { name: 'Deben' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Inactivos' })).toBeTruthy();
    expect(consultasDeVentas()).toHaveLength(0);
  });

  it('admin: ve "Deben" como 4.º chip, tras Todos, Activos e Inactivos', () => {
    configurarConDeudas();
    renderizar();

    const nombres = within(screen.getByRole('group', { name: 'Filtrar clientes' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(nombres).toEqual(['Todos', 'Activos', 'Inactivos', 'Deben']);
  });

  it('admin: la query de ventas es null hasta elegir el chip; al elegirlo se suscribe (completada + cobro pendiente + fecha desc)', () => {
    configurarConDeudas();
    renderizar();

    expect(consultasDeVentas()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));

    const consultas = consultasDeVentas();
    expect(consultas.length).toBeGreaterThan(0);
    const [q, opciones] = consultas[0] as [RefFalsa & { __clausulas: { __tipo: string; args: unknown[] }[] }, unknown];
    expect(q.__clausulas.map((c) => [c.__tipo, ...c.args])).toEqual([
      ['where', 'estado', '==', 'completada'],
      ['where', 'cobro.estado', '==', 'pendiente'],
      ['orderBy', 'fecha', 'desc'],
    ]);
    expect(opciones).toEqual({ seguirFrescura: true });
  });

  it('volver a otro chip deja de suscribir (query null)', () => {
    configurarConDeudas();
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));
    mocks.useCollection.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));

    expect(consultasDeVentas()).toHaveLength(0);
  });

  it('la fila muestra deuda, cantidad de ventas y días, respetando el orden que entrega core (más viejo primero)', () => {
    configurarConDeudas();
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));

    const filas = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(filas).toHaveLength(3);
    expect(filas[0]).toContain('Beto Gómez');
    expect(filas[0]).toContain('Debe $ 1.500,00 · 2 ventas · hace 12 días');
    expect(filas[1]).toContain('Carla Sosa');
    expect(filas[1]).toContain('Debe $ 300,00 · 1 venta · hace 1 día');
    expect(filas[2]).toContain('Ana Pérez');
    expect(filas[2]).toContain('Debe $ 2.500,00 · 1 venta · desde hoy');
  });

  it('el botón de WhatsApp recibe contexto "cobro", la deuda formateada y los días', () => {
    configurarConDeudas();
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));

    const props = mocks.botonWhatsApp.mock.calls
      .map(([p]) => p as { contexto: string; telefonoE164?: string; valores: Record<string, string> })
      .filter((p) => p.contexto === 'cobro');
    const deBeto = props.find((p) => p.valores.cliente === 'Beto Gómez');
    expect(deBeto).toBeTruthy();
    expect(deBeto!.telefonoE164).toBe('59899000002');
    expect(deBeto!.valores).toEqual({ cliente: 'Beto Gómez', deuda: '$ 1.500,00', diasDeuda: '12' });
  });

  it('tocar la fila navega a la ficha del cliente', () => {
    configurarConDeudas();
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));
    fireEvent.click(screen.getByRole('button', { name: /Beto Gómez.*Debe/ }));

    expect(screen.getByText('Ficha de c2')).toBeTruthy();
  });

  it('la búsqueda también filtra la lista de deudores', () => {
    configurarConDeudas();
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'carla' } });

    expect(screen.getByText('Carla Sosa')).toBeTruthy();
    expect(screen.queryByText('Beto Gómez')).toBeNull();
    expect(screen.queryByText('Ana Pérez')).toBeNull();
  });

  it('búsqueda sin resultados: mensaje genérico con el término', () => {
    configurarConDeudas();
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'zzz' } });

    expect(screen.getByText('No se encontraron clientes para "zzz".')).toBeTruthy();
  });

  it('vacío: "Nadie debe por ahora."', () => {
    configurarConDeudas({ ventas: { ...estadoOk<Venta>([]), desdeCache: false } });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));

    expect(screen.getByText('Nadie debe por ahora.')).toBeTruthy();
  });

  it('cargando: mensaje propio de deudas', () => {
    configurarConDeudas({ ventas: { datos: [], cargando: true, error: null } });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));

    expect(screen.getByText('Cargando deudas…')).toBeTruthy();
  });

  it('error de conexión: mensaje genérico y botón Reintentar', () => {
    configurarConDeudas({
      ventas: { datos: [], cargando: false, error: { code: 'unavailable' } as FirestoreError },
    });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las deudas.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('índice en construcción (failed-precondition): mensaje propio y botón Reintentar', () => {
    configurarConDeudas({
      ventas: { datos: [], cargando: false, error: { code: 'failed-precondition' } as FirestoreError },
    });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));

    const alerta = screen.getByRole('alert').textContent ?? '';
    expect(alerta).toContain('Esta consulta todavía se está preparando. Probá en unos minutos.');
    expect(alerta).not.toContain('conexión');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('cliente dado de baja con deuda: la fila aparece con el nombre del cliente, el badge "Dado de baja" y WhatsApp', () => {
    const baja = cliente({ id: 'c9', nombre: 'Dora Vigente', activo: false, telefonoE164: '59899000009' });
    configurarConDeudas({
      clientes: [baja],
      ventas: {
        ...estadoOk([ventaACobrar('v9', 'c9', 'Dora (nombre viejo)', new Date(2026, 8, 28, 10, 0, 0), 70000)]),
        desdeCache: false,
      },
    });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));

    const filas = screen.getAllByRole('listitem');
    expect(filas).toHaveLength(1);
    expect(filas[0]?.textContent).toContain('Dora Vigente');
    expect(filas[0]?.textContent).not.toContain('nombre viejo');
    expect(filas[0]?.textContent).toContain('Dado de baja');
    expect(filas[0]?.textContent).toContain('Debe $ 700,00 · 1 venta · hace 2 días');
    expect(within(filas[0]!).getByRole('button', { name: 'Enviar WhatsApp a Dora Vigente' })).toBeTruthy();
  });

  it('datos de caché: avisa "Sin conexión: puede faltar información" y sigue mostrando la lista', () => {
    configurarConDeudas({ ventas: { ...estadoOk(ventasBase), desdeCache: true } });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));

    expect(screen.getByText('Sin conexión: puede faltar información')).toBeTruthy();
    expect(screen.getByText('Beto Gómez')).toBeTruthy();
  });

  it('datos confirmados por el servidor: sin nota de conexión', () => {
    configurarConDeudas();
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Deben' }));

    expect(screen.queryByText('Sin conexión: puede faltar información')).toBeNull();
  });
});

describe('Clientes - listado y búsqueda (chip "Todos", default)', () => {
  const clientesFalsos: Cliente[] = [
    cliente({ id: 'c1', nombre: 'Ana Pérez', alias: 'Anita', telefono: '099111222' }),
    cliente({ id: 'c2', nombre: 'Marta López', telefono: '098333444', activo: false }),
    cliente({ id: 'c3', nombre: 'Carlos Núñez' }),
  ];

  it('lista TODOS los clientes (vigentes y dados de baja), orden de la query (WA-G: "Todos" ya no oculta a los dados de baja)', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByText('Marta López')).toBeTruthy();
    expect(screen.getByText('Carlos Núñez')).toBeTruthy();
  });

  it('la búsqueda filtra por nombre ignorando acentos', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'nunez' } });

    expect(screen.getByText('Carlos Núñez')).toBeTruthy();
    expect(screen.queryByText('Ana Pérez')).toBeNull();
  });

  it('la búsqueda filtra por alias', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'anita' } });

    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.queryByText('Carlos Núñez')).toBeNull();
  });

  it('la búsqueda filtra por teléfono, incluso de un dado de baja (visible bajo "Todos")', () => {
    configurarClientes(estadoOk(clientesFalsos));
    renderizar();

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: '098333444' } });

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

describe('Clientes - alta con selector de país (tester en España tomado como uruguayo)', () => {
  it('elegir España (+34) en el modal de alta llama a crearCliente con telefono con el prefijo "+34"', async () => {
    configurarClientes(estadoOk([]));
    mocks.crearCliente.mockReturnValue({ clienteId: 'nuevo', confirmacion: Promise.resolve() });
    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar cliente' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Cliente España' } });
    fireEvent.change(screen.getByLabelText('País'), { target: { value: '34' } });
    fireEvent.change(screen.getByLabelText('Teléfono (opcional)'), { target: { value: '612 345 678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.crearCliente).toHaveBeenCalledTimes(1));
    const [, datos] = mocks.crearCliente.mock.calls[0] as [unknown, { telefono?: string }];
    expect(datos.telefono).toBe('+34 612 345 678');
  });
});

describe('Clientes - codigoPais al crear (WA-F1, hallazgo de integración de la tanda WA)', () => {
  it('con configuracion/general.codigoPaisDefault configurado, lo pasa como 3er argumento a crearCliente', async () => {
    configurarClientes(estadoOk([]));
    configurarUseDoc({
      configuracionGeneral: {
        nombreNegocio: 'Quesarte',
        umbralPiezaAgotadaGramos: 0 as never,
        metodoProrrateo: 'por_peso',
        codigoPaisDefault: '54',
      },
    });
    mocks.crearCliente.mockReturnValue({ clienteId: 'nuevo', confirmacion: Promise.resolve() });
    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar cliente' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva Clienta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.crearCliente).toHaveBeenCalledTimes(1));
    const [, , codigoPais] = mocks.crearCliente.mock.calls[0] as [unknown, unknown, string | undefined];
    expect(codigoPais).toBe('54');
  });

  it('sin configuracion/general (doc ausente o sin cargar): pasa undefined, el kit aplica su default', async () => {
    configurarClientes(estadoOk([]));
    configurarUseDoc();
    mocks.crearCliente.mockReturnValue({ clienteId: 'nuevo', confirmacion: Promise.resolve() });
    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar cliente' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva Clienta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.crearCliente).toHaveBeenCalledTimes(1));
    const [, , codigoPais] = mocks.crearCliente.mock.calls[0] as [unknown, unknown, string | undefined];
    expect(codigoPais).toBeUndefined();
  });
});
