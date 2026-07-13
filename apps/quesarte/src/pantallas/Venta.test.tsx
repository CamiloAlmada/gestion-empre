import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import {
  money,
  peso,
  type Categoria,
  type Cliente,
  type Configuracion,
  type Pieza,
  type Producto,
} from '@gestion/core';
import { StockInsuficienteError, type EntradaVenta } from '@gestion/firebase-kit';
import { ProveedorToasts } from '@gestion/ui';
import { Venta } from './Venta';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';
import { ProveedorCarrito } from '../componentes/venta/ContextoCarrito';

/** `accionHeader` (docs/06-ui-ux.md §2, 2026-07-10) solo lo renderiza `Shell`
 * (fuera del árbol de este test file, ver Shell.test.tsx para su mecánica de
 * dual-visibilidad); acá alcanza con exponerlo para asertar que Venta lo
 * declara con el contenido esperado, mismo patrón que `VisorHeader` en
 * Historial.test.tsx/Clientes.test.tsx. */
function VisorAccionHeader() {
  const config = useHeaderActual();
  return <div>{config?.accionHeader}</div>;
}

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
  useDoc: vi.fn(),
  registrarVenta: vi.fn(),
  crearCliente: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useAuth: mocks.useAuth,
    useOnlineStatus: mocks.useOnlineStatus,
    useCollection: mocks.useCollection,
    useDoc: mocks.useDoc,
    registrarVenta: mocks.registrarVenta,
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
  doc: (_db: unknown, coleccion: string, id: string) => crearRef(`${coleccion}/${id}`),
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
}));

/** `useDoc` de `configuracion/general` (WA-F1): default sin datos (el kit
 * aplica su propio default `'598'`). Re-establecido en cada `beforeEach`
 * (`vi.clearAllMocks()` limpia calls/results, no la implementación fijada
 * con `mockReturnValue`). */
function configurarConfiguracion(datos: Configuracion | null) {
  mocks.useDoc.mockReturnValue({ datos, cargando: false, error: null });
}

interface EstadoFalso<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
}

function estadoOk<T>(datos: T[]): EstadoFalso<T> {
  return { datos, cargando: false, error: null };
}

function configurarAuth() {
  mocks.useAuth.mockReturnValue({
    usuario: { uid: 'u1' },
    perfil: { uid: 'u1', nombre: 'Ana', email: 'ana@quesarte.com', rol: 'vendedor', activo: true },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn(),
  });
}

function configurarCollections(estados: {
  productos?: EstadoFalso<Producto>;
  piezas?: EstadoFalso<Pieza>;
  clientes?: EstadoFalso<Cliente>;
  categorias?: EstadoFalso<Categoria>;
}) {
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'productos') return estados.productos ?? estadoOk([]);
    if (q.__path === 'piezas') return estados.piezas ?? estadoOk([]);
    if (q.__path === 'clientes') return estados.clientes ?? estadoOk([]);
    if (q.__path === 'categorias') return estados.categorias ?? estadoOk([]);
    return { datos: [], cargando: false, error: null };
  });
}

function clienteDe(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 0, totalHistoricoCents: money(0) },
    ...over,
  };
}

function productoDe(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock' | 'modoPrecio'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'cat',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function piezaDe(over: Partial<Pieza> & Pick<Pieza, 'id' | 'productoId'>): Pieza {
  return {
    pesoInicialGramos: peso(1000),
    pesoRestanteGramos: peso(1000),
    costoKgCents: money(500),
    fechaIngreso: new Date('2026-01-01T10:00:00'),
    estado: 'disponible',
    ...over,
  };
}

function categoriaDe(over: Partial<Categoria> & Pick<Categoria, 'nombre' | 'orden'>): Categoria {
  return { id: over.nombre, ...over };
}

const quesoColonia = productoDe({
  id: 'p1',
  nombre: 'Queso Colonia',
  categoria: 'Quesos',
  modoStock: 'fraccionado_por_pieza',
  modoPrecio: 'por_kg',
  precioVentaCents: money(89900),
});

const salame = productoDe({
  id: 'p2',
  nombre: 'Salame tandilero',
  categoria: 'Embutidos',
  modoStock: 'pieza_entera',
  modoPrecio: 'por_kg',
  precioVentaCents: money(120000),
});

const nuezMariposa = productoDe({
  id: 'p3',
  nombre: 'Nuez mariposa',
  categoria: 'Frutos secos',
  modoStock: 'granel',
  modoPrecio: 'por_kg',
  precioVentaCents: money(45000),
  stockGranelGramos: peso(500),
});

const mielFrasco = productoDe({
  id: 'p4',
  nombre: 'Miel 500g',
  categoria: 'Miel',
  modoStock: 'unidad_simple',
  modoPrecio: 'por_unidad',
  precioVentaCents: money(45000),
  stockUnidades: 5,
});

function renderizar() {
  return render(
    <MemoryRouter>
      <ProveedorToasts>
        <ProveedorHeader>
          <VisorAccionHeader />
          <ProveedorCarrito>
            <Venta />
          </ProveedorCarrito>
        </ProveedorHeader>
      </ProveedorToasts>
    </MemoryRouter>,
  );
}

/** Botones mínimos para navegar entre "/venta" y "/stock" en las pruebas de
 * persistencia de abajo (ver `describe('Venta - persistencia entre
 * navegación')`): el carrito vive en `ProveedorCarrito`, montado por encima
 * de las rutas, así que navegar desmonta/remonta `Venta` sin tocarlo. */
function BotonesDeNavegacion() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" onClick={() => navigate('/venta')}>
        Ir a Venta
      </button>
      <button type="button" onClick={() => navigate('/stock')}>
        Ir a Stock
      </button>
    </div>
  );
}

/** Igual composición que `Shell.tsx` (`ProveedorCarrito` por encima del
 * `Outlet`/rutas), pero sin montar `Shell` entero: alcanza con un `Routes`
 * mínimo entre "/venta" y una pantalla cualquiera de otro tab. */
function renderizarConNavegacion(rutaInicial: string) {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <ProveedorToasts>
        <ProveedorHeader>
          <ProveedorCarrito>
            <BotonesDeNavegacion />
            <Routes>
              <Route path="/venta" element={<Venta />} />
              <Route path="/stock" element={<div>Contenido de Stock</div>} />
            </Routes>
          </ProveedorCarrito>
        </ProveedorHeader>
      </ProveedorToasts>
    </MemoryRouter>,
  );
}

function tipearPeso(texto: string) {
  for (const char of texto) {
    if (char === ',') {
      fireEvent.click(screen.getByRole('button', { name: 'Coma decimal' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: char }));
    }
  }
}

/**
 * El readout de `TecladoPeso` (`role="textbox"`) no es el único textbox en
 * pantalla: el buscador de `GrillaProductos` (`<input type="text">`) también
 * lo es. Se distingue por `aria-live="polite"` (el buscador no lo tiene).
 */
function lecturaPeso(): string | null {
  return screen.getAllByRole('textbox').find((el) => el.getAttribute('aria-live') === 'polite')?.textContent ?? null;
}

beforeEach(() => {
  configurarConfiguracion(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.useOnlineStatus.mockReturnValue(true);
});

describe('Venta - estados', () => {
  it('cargando', () => {
    configurarAuth();
    configurarCollections({ productos: { datos: [], cargando: true, error: null } });
    renderizar();
    expect(screen.getByText('Cargando productos…')).toBeTruthy();
  });

  it('error con reintento', () => {
    configurarAuth();
    configurarCollections({ productos: { datos: [], cargando: false, error: { code: 'unavailable' } as FirestoreError } });
    renderizar();
    expect(screen.getByText('No se pudo cargar el catálogo. Revisá tu conexión e intentá de nuevo.')).toBeTruthy();
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))).not.toThrow();
  });

  it('vacío con link al catálogo', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([]), piezas: estadoOk([]) });
    renderizar();
    expect(screen.getByText('Sin productos — creá el catálogo primero.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Productos' }).getAttribute('href')).toBe('/stock');
  });

});

describe('Venta - chips de filtro por categoría (docs/06-ui-ux.md §3, tarea UI-3d)', () => {
  it('con vocabulario de categorías, filtra la grilla al elegir una', () => {
    configurarAuth();
    configurarCollections({
      productos: estadoOk([quesoColonia, salame]),
      piezas: estadoOk([]),
      categorias: estadoOk([categoriaDe({ nombre: 'Quesos', orden: 0 }), categoriaDe({ nombre: 'Embutidos', orden: 1 })]),
    });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByText('Salame tandilero')).toBeNull();
  });

  it('sin categorías (colección vacía), no muestra chips y no bloquea la grilla', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([quesoColonia, salame]), piezas: estadoOk([]), categorias: estadoOk([]) });
    renderizar();

    expect(screen.queryByRole('group', { name: 'Filtrar por categoría' })).toBeNull();
    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('Salame tandilero')).toBeTruthy();
  });
});

describe('Venta - atajo a Historial (docs/06-ui-ux.md §2, 2026-07-10)', () => {
  it('declara accionHeader: ícono con aria-label "Historial" que enlaza a /historial', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([]), piezas: estadoOk([]) });
    renderizar();

    const enlace = screen.getByRole('link', { name: 'Historial' });
    expect(enlace.getAttribute('href')).toBe('/historial');
  });
});

describe('Venta - agregar al carrito por modo', () => {
  it('fraccionado_por_pieza: FIFO automático agrega el ítem con la pieza y el peso correctos', () => {
    configurarAuth();
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1' });
    configurarCollections({ productos: estadoOk([quesoColonia]), piezas: estadoOk([pieza]) });
    renderizar();

    fireEvent.click(screen.getByText('Queso Colonia'));
    tipearPeso('0,3');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    // 89900 * 300 / 1000 = 26970 -> $ 269,70
    expect(screen.getAllByText('$ 269,70').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/300 g · pieza del/).length).toBeGreaterThan(0);
  });

  it('fraccionado_por_pieza: un segundo corte de la MISMA pieza ve el restante ya descontado por el carrito', () => {
    configurarAuth();
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(1000) });
    configurarCollections({ productos: estadoOk([quesoColonia]), piezas: estadoOk([pieza]) });
    renderizar();

    // Primer corte: 700 g de una pieza de 1000 g.
    fireEvent.click(screen.getAllByText('Queso Colonia')[0]!);
    tipearPeso('0,7');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    // Reabrir para un segundo corte del mismo producto: la pieza FIFO
    // ofrecida ahora es la MISMA, pero con el restante ajustado (300 g, no
    // 1000 g) por lo que el carrito ya reservó (piezasAjustadasPorCarrito).
    fireEvent.click(screen.getAllByText('Queso Colonia')[0]!);
    tipearPeso('0,3');

    expect(screen.getByText(/300 g restante/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    // Pedir más de lo que en verdad queda (300 g) SÍ dispara el aviso.
    fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));
    tipearPeso('0,4');
    expect(screen.getByRole('alert').textContent).toContain('menos de lo pedido');
  });

  it('pieza_entera: agregar consume la pieza y no vuelve a ofrecerla', () => {
    configurarAuth();
    const pieza = piezaDe({ id: 'pz2', productoId: 'p2', pesoRestanteGramos: peso(850) });
    configurarCollections({ productos: estadoOk([salame]), piezas: estadoOk([pieza]) });
    renderizar();

    fireEvent.click(screen.getByText('Salame tandilero'));
    fireEvent.click(screen.getByText('850 g'));

    expect(screen.getAllByText('Pieza entera · 850 g').length).toBeGreaterThan(0);

    // Reabrir el selector para el mismo producto (la card de la grilla, no
    // la fila que ya quedó en el carrito): la pieza ya usada no aparece.
    fireEvent.click(screen.getAllByText('Salame tandilero')[0]!);
    expect(screen.getByRole('alert').textContent).toContain('No hay piezas disponibles');
  });

  it('granel: agrega el peso validado contra stockGranelGramos', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([nuezMariposa]), piezas: estadoOk([]) });
    renderizar();

    fireEvent.click(screen.getByText('Nuez mariposa'));
    tipearPeso('0,2');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    // 45000 * 200 / 1000 = 9000 -> $ 90,00
    expect(screen.getAllByText('$ 90,00').length).toBeGreaterThan(0);
  });

  it('unidad_simple: el stepper agrega la cantidad elegida', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]) });
    renderizar();

    fireEvent.click(screen.getByText('Miel 500g'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una unidad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(screen.getAllByText('2 unidades').length).toBeGreaterThan(0);
    // 45000 * 2 = 90000 -> $ 900,00
    expect(screen.getAllByText('$ 900,00').length).toBeGreaterThan(0);
  });
});

describe('Venta - editar carrito en el lugar (docs/06-ui-ux.md §6, POS-3)', () => {
  it('unidad_simple: el stepper del carrito suma, resta, y quitar la última unidad elimina el ítem', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]) });
    renderizar();

    fireEvent.click(screen.getByText('Miel 500g'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getAllByText('1 unidad').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar una unidad de Miel 500g' })[0]!);
    expect(screen.getAllByText('2 unidades').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar una unidad de Miel 500g' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar una unidad de Miel 500g' })[0]!);

    expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0);
  });

  it('fraccionado_por_pieza: tocar el ítem reabre el modal precargado; "Guardar" reemplaza el ítem (caso clave: pieza justa)', () => {
    configurarAuth();
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(900) });
    configurarCollections({ productos: estadoOk([quesoColonia]), piezas: estadoOk([pieza]) });
    renderizar();

    fireEvent.click(screen.getByText('Queso Colonia'));
    tipearPeso('0,3');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getAllByText(/300 g · pieza del/).length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar Queso Colonia, 300 g · pieza del 01/01/2026' })[0]!,
    );

    expect(screen.getByText('Editar · Queso Colonia')).toBeTruthy();
    // Precarga el peso actual del ítem.
    expect(lecturaPeso()).toBe('0,3kg');

    // Sube a 900 g: la pieza tiene 900 g restantes de catálogo y este ítem
    // ya tenía 300 g reservados de ella — `piezasParaEditar` los devuelve,
    // así que pedir el total de la pieza al editar es válido.
    fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));
    tipearPeso('0,9');
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    // REEMPLAZO, no agregado: un solo ítem en el carrito, con el peso nuevo.
    expect(screen.getAllByText(/900 g · pieza del/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/300 g · pieza del/)).toBeNull();
  });

  it('granel: tocar el ítem reabre el modal precargado; "Guardar" reemplaza el ítem', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([nuezMariposa]), piezas: estadoOk([]) });
    renderizar();

    fireEvent.click(screen.getByText('Nuez mariposa'));
    tipearPeso('0,2');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar Nuez mariposa, 200 g' })[0]!);

    expect(screen.getByText('Editar · Nuez mariposa')).toBeTruthy();
    expect(lecturaPeso()).toBe('0,2kg');

    fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));
    tipearPeso('0,5'); // stockGranelGramos de nuezMariposa: 500 g.
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    // 45000 * 500 / 1000 = 22500 -> $ 225,00 (reemplazo: un solo ítem).
    expect(screen.getAllByText('$ 225,00').length).toBeGreaterThan(0);
  });

  it('granel: si el stock cambió en vivo (onSnapshot) mientras el ítem está en el carrito, editar usa el valor ACTUAL, no el capturado al agregar', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([nuezMariposa]), piezas: estadoOk([]) });
    const arbol = (
      <MemoryRouter>
        <ProveedorToasts>
          <ProveedorHeader>
            <ProveedorCarrito>
              <Venta />
            </ProveedorCarrito>
          </ProveedorHeader>
        </ProveedorToasts>
      </MemoryRouter>
    );
    const { rerender } = render(arbol);

    // Se agrega con el stock original (500 g).
    fireEvent.click(screen.getByText('Nuez mariposa'));
    tipearPeso('0,2');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    // El stock baja a 150 g "en vivo" (el listener de Firestore trajo un
    // update): la copia que el ítem del carrito lleva (`stockGranelGramos:
    // 500`) queda vieja.
    configurarCollections({
      productos: estadoOk([{ ...nuezMariposa, stockGranelGramos: peso(150) }]),
      piezas: estadoOk([]),
    });
    rerender(arbol);

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar Nuez mariposa, 200 g' })[0]!);

    // El modal de edición muestra el stock ACTUAL (150 g), no el de cuando
    // se agregó el ítem (500 g).
    expect(screen.getByText('Disponible: 150 g')).toBeTruthy();

    // Pedir el peso que ya tenía (200 g) ahora excede el stock actual (150 g).
    expect(screen.getByRole('alert').textContent).toContain('Superás el stock disponible');
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('pieza_entera: "+" del carrito abre el selector excluyendo la pieza ya carriteada', () => {
    configurarAuth();
    const pieza1 = piezaDe({ id: 'pz1', productoId: 'p2', pesoRestanteGramos: peso(850) });
    const pieza2 = piezaDe({ id: 'pz2', productoId: 'p2', pesoRestanteGramos: peso(700) });
    configurarCollections({ productos: estadoOk([salame]), piezas: estadoOk([pieza1, pieza2]) });
    renderizar();

    fireEvent.click(screen.getByText('Salame tandilero'));
    fireEvent.click(screen.getByText('850 g'));
    expect(screen.getAllByText('Pieza entera · 850 g').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar otra pieza de Salame tandilero' })[0]!);

    // La pieza ya carriteada no vuelve a ofrecerse; solo queda la otra.
    expect(screen.queryByText('850 g')).toBeNull();
    fireEvent.click(screen.getByText('700 g'));

    expect(screen.getAllByText('Pieza entera · 850 g').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pieza entera · 700 g').length).toBeGreaterThan(0);
  });
});

describe('Venta - cobro', () => {
  function agregarUnidadAlCarrito() {
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]) });
    renderizar();
    fireEvent.click(screen.getByText('Miel 500g'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  }

  it('cobro online: llama a registrarVenta con la EntradaVenta exacta y vacía el carrito al confirmar', async () => {
    configurarAuth();
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    agregarUnidadAlCarrito();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.registrarVenta).toHaveBeenCalledTimes(1));
    const [, entrada] = mocks.registrarVenta.mock.calls[0] as [unknown, EntradaVenta];
    expect(entrada.usuarioId).toBe('u1');
    expect(entrada.medioPago).toBe('efectivo');
    expect(entrada.totalCents).toBe(money(45000));
    expect(entrada.items).toHaveLength(1);
    expect(entrada.items[0]).toMatchObject({
      producto: mielFrasco,
      unidades: 1,
      precioUnitCents: money(45000),
      subtotalCents: money(45000),
    });
    // Regresión clave (docs/07-clientes-proveedores.md §POS): la venta
    // anónima NO lleva el campo `cliente` — ni siquiera como `undefined`.
    expect(entrada).not.toHaveProperty('cliente');

    expect(await screen.findByText('Venta registrada.')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0));
  });

  it('cobro offline: no espera el ack, vacía el carrito y avisa con un toast info', async () => {
    configurarAuth();
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    agregarUnidadAlCarrito();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    // Sincrónico: el carrito ya está vacío en el mismo tick, sin esperar el ack.
    expect(mocks.registrarVenta).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0);
    expect(await screen.findByText('Venta guardada sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
  });

  it('cobro offline: si la sincronización tardía falla, el toast es honesto (la venta no quedó guardada, no "Revisala en Historial")', async () => {
    configurarAuth();
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.registrarVenta.mockRejectedValue(new StockInsuficienteError('sin stock'));
    agregarUnidadAlCarrito();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(
      await screen.findByText('No se pudo registrar la venta: no hay stock suficiente. La venta no quedó guardada.'),
    ).toBeTruthy();
  });

  it('StockInsuficienteError: mensaje específico y el carrito queda intacto', async () => {
    configurarAuth();
    mocks.registrarVenta.mockRejectedValue(new StockInsuficienteError('sin stock'));
    agregarUnidadAlCarrito();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(
      await screen.findByText('No hay stock suficiente para completar la venta. Revisá los ítems del carrito.'),
    ).toBeTruthy();
    // El carrito sigue teniendo el ítem: no se vació.
    expect(screen.getAllByText('Miel 500g').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Todavía no agregaste productos.').length).toBe(0);
  });
});

describe('Venta - cliente (docs/07-clientes-proveedores.md §POS)', () => {
  function agregarUnidadAlCarrito(clientes: Cliente[] = []) {
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]), clientes: estadoOk(clientes) });
    renderizar();
    fireEvent.click(screen.getByText('Miel 500g'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  }

  function abrirSelectorCliente() {
    fireEvent.click(screen.getAllByText('+ Cliente')[0]!);
  }

  it('elegir un cliente existente sin compras previas: cobra con esPrimeraCompra true', async () => {
    configurarAuth();
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    const marta = clienteDe({ id: 'c1', nombre: 'Marta' }); // stats.cantidadVentas: 0 por defecto
    agregarUnidadAlCarrito([marta]);

    abrirSelectorCliente();
    fireEvent.click(screen.getByText('Marta'));

    expect(screen.getAllByText('Cliente: Marta').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.registrarVenta).toHaveBeenCalledTimes(1));
    const [, entrada] = mocks.registrarVenta.mock.calls[0] as [unknown, EntradaVenta];
    expect(entrada.cliente).toEqual({ id: 'c1', nombre: 'Marta', esPrimeraCompra: true });
  });

  it('elegir un cliente existente CON compras previas: cobra con esPrimeraCompra false', async () => {
    configurarAuth();
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    const juan = clienteDe({
      id: 'c2',
      nombre: 'Juan',
      stats: { cantidadVentas: 3, totalHistoricoCents: money(150000) },
    });
    agregarUnidadAlCarrito([juan]);

    abrirSelectorCliente();
    fireEvent.click(screen.getByText('Juan'));

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.registrarVenta).toHaveBeenCalledTimes(1));
    const [, entrada] = mocks.registrarVenta.mock.calls[0] as [unknown, EntradaVenta];
    expect(entrada.cliente).toEqual({ id: 'c2', nombre: 'Juan', esPrimeraCompra: false });
  });

  it('quitar el cliente asociado vuelve la venta a anónima (sin campo cliente al cobrar)', async () => {
    configurarAuth();
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    const marta = clienteDe({ id: 'c1', nombre: 'Marta' });
    agregarUnidadAlCarrito([marta]);

    abrirSelectorCliente();
    fireEvent.click(screen.getByText('Marta'));
    expect(screen.getAllByText('Cliente: Marta').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar cliente Marta' })[0]!);
    expect(screen.getAllByText('+ Cliente').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.registrarVenta).toHaveBeenCalledTimes(1));
    const [, entrada] = mocks.registrarVenta.mock.calls[0] as [unknown, EntradaVenta];
    expect(entrada).not.toHaveProperty('cliente');
  });

  it('alta rápida: crea el cliente con solo el nombre y lo asocia a la venta', async () => {
    configurarAuth();
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    mocks.crearCliente.mockReturnValue({ clienteId: 'nuevo-1', confirmacion: Promise.resolve() });
    agregarUnidadAlCarrito([]);

    abrirSelectorCliente();
    fireEvent.change(screen.getByLabelText('Buscar por nombre, alias o teléfono'), {
      target: { value: 'Cliente Nuevo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear «Cliente Nuevo»' }));

    // Sin `configuracion/general` en este test (default del `beforeEach`):
    // 3er argumento `undefined`, el kit aplica su propio default `'598'`.
    expect(mocks.crearCliente).toHaveBeenCalledWith({}, { nombre: 'Cliente Nuevo' }, undefined);
    await screen.findByText('Cliente creado.');
    expect(screen.getAllByText('Cliente: Cliente Nuevo').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.registrarVenta).toHaveBeenCalledTimes(1));
    const [, entrada] = mocks.registrarVenta.mock.calls[0] as [unknown, EntradaVenta];
    expect(entrada.cliente).toEqual({ id: 'nuevo-1', nombre: 'Cliente Nuevo', esPrimeraCompra: true });
  });

  it('alta rápida: pasa el codigoPaisDefault de configuracion/general a crearCliente (WA-F1, hallazgo de integración de la tanda WA)', () => {
    configurarAuth();
    configurarConfiguracion({
      nombreNegocio: 'Quesarte',
      umbralPiezaAgotadaGramos: 0 as never,
      metodoProrrateo: 'por_peso',
      codigoPaisDefault: '54',
    });
    mocks.crearCliente.mockReturnValue({ clienteId: 'nuevo-1', confirmacion: Promise.resolve() });
    agregarUnidadAlCarrito([]);

    abrirSelectorCliente();
    fireEvent.change(screen.getByLabelText('Buscar por nombre, alias o teléfono'), {
      target: { value: 'Cliente Nuevo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear «Cliente Nuevo»' }));

    expect(mocks.crearCliente).toHaveBeenCalledWith({}, { nombre: 'Cliente Nuevo' }, '54');
  });

  it('alta rápida offline: asocia el cliente a la venta en curso YA (id síncrono), sin esperar el ack', async () => {
    configurarAuth();
    mocks.useOnlineStatus.mockReturnValue(false);
    // `crearCliente` devuelve el id de forma SÍNCRONA; `confirmacion` (el ack)
    // queda pendiente para siempre en este test, y aun así el cliente debe
    // quedar asociado a la venta al instante (criterio doc 07: alta offline).
    mocks.crearCliente.mockReturnValue({
      clienteId: 'offline-1',
      confirmacion: new Promise<void>(() => {}),
    });
    agregarUnidadAlCarrito([]);

    abrirSelectorCliente();
    fireEvent.change(screen.getByLabelText('Buscar por nombre, alias o teléfono'), {
      target: { value: 'Offline Cliente' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear «Offline Cliente»' }));

    // Sin conexión y sin resolver el ack: el modal cierra YA y el cliente ya
    // está asociado a la venta en curso (docs/06-ui-ux.md §8, doc 07).
    expect(await screen.findByText('Cliente guardado sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByText('Cliente: Offline Cliente').length).toBeGreaterThan(0);

    // Y la venta se cobra asociada a ese cliente, sin haber esperado nunca el ack.
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.registrarVenta).toHaveBeenCalledTimes(1));
    const [, entrada] = mocks.registrarVenta.mock.calls[0] as [unknown, EntradaVenta];
    expect(entrada.cliente).toEqual({ id: 'offline-1', nombre: 'Offline Cliente', esPrimeraCompra: true });
  });

  it('cobrar limpia el cliente asociado: la venta siguiente vuelve a ser anónima', async () => {
    configurarAuth();
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    const marta = clienteDe({ id: 'c1', nombre: 'Marta' });
    agregarUnidadAlCarrito([marta]);

    abrirSelectorCliente();
    fireEvent.click(screen.getByText('Marta'));
    expect(screen.getAllByText('Cliente: Marta').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0));
    expect(screen.getAllByText('+ Cliente').length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Cliente: Marta/).length).toBe(0);
  });
});

describe('Venta - persistencia entre navegación (docs/06-ui-ux.md §6)', () => {
  it('agregar un ítem, navegar a otro tab (Venta se desmonta) y volver: el carrito sigue', async () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]) });
    renderizarConNavegacion('/venta');

    fireEvent.click(screen.getByText('Miel 500g'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getAllByText('Miel 500g').length).toBeGreaterThan(0);

    // Navegar a otro tab desmonta por completo la pantalla Venta.
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Stock' }));
    expect(screen.getByText('Contenido de Stock')).toBeTruthy();
    expect(screen.queryByText('Todavía no agregaste productos.')).toBeNull();

    // Volver a Venta: el ítem sigue en el carrito, no hubo que rehacerlo.
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Venta' }));
    expect(screen.getAllByText('Miel 500g').length).toBeGreaterThan(0);
    // 1 unidad de Miel 500g a $ 450,00.
    expect(screen.getAllByText('$ 450,00').length).toBeGreaterThan(0);
  });

  it('elegir un cliente, navegar a otro tab (Venta se desmonta) y volver: el cliente sigue asociado', async () => {
    configurarAuth();
    const marta = clienteDe({ id: 'c1', nombre: 'Marta' });
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]), clientes: estadoOk([marta]) });
    renderizarConNavegacion('/venta');

    fireEvent.click(screen.getAllByText('+ Cliente')[0]!);
    fireEvent.click(screen.getByText('Marta'));
    expect(screen.getAllByText('Cliente: Marta').length).toBeGreaterThan(0);

    // Navegar a otro tab desmonta por completo la pantalla Venta.
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Stock' }));
    expect(screen.getByText('Contenido de Stock')).toBeTruthy();

    // Volver a Venta: el cliente sigue asociado, no hubo que re-elegirlo.
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Venta' }));
    expect(screen.getAllByText('Cliente: Marta').length).toBeGreaterThan(0);
  });

  it('agregar ítems antes y después de navegar no colisiona claves de lista (quitar solo afecta al ítem tocado)', async () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]) });
    renderizarConNavegacion('/venta');

    // Un ítem antes de navegar.
    fireEvent.click(screen.getByText('Miel 500g'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Ir a Stock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Venta' }));

    // Un segundo ítem después de volver a montar Venta (proximaClave, que
    // vive en el contexto, no puede reiniciar en 'item-0' y pisar la clave
    // del primero). El ítem ya en el carrito hace que 'Miel 500g' matchee
    // más de un nodo (grilla + fila del carrito); se toca la card de la
    // grilla, que es siempre el primer match (mismo patrón que el resto de
    // este archivo, p.ej. la prueba de `pieza_entera` arriba).
    fireEvent.click(screen.getAllByText('Miel 500g')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    const filasCarrito = screen.getAllByLabelText('Quitar Miel 500g del carrito');
    expect(filasCarrito).toHaveLength(2);

    fireEvent.click(filasCarrito[0]!);
    // Solo se quitó uno: queda un único botón "Quitar", no cero ni ambos.
    expect(screen.getAllByLabelText('Quitar Miel 500g del carrito')).toHaveLength(1);
  });

  it('cobrar vacía el carrito también cuando se consume vía contexto', async () => {
    configurarAuth();
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]) });
    renderizarConNavegacion('/venta');

    fireEvent.click(screen.getByText('Miel 500g'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.registrarVenta).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0));
  });

  it('desmontar el proveedor (equivalente a desloguear) descarta el carrito', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]) });

    function Envoltorio({ sesionActiva }: { sesionActiva: boolean }) {
      return (
        <MemoryRouter>
          <ProveedorToasts>
            <ProveedorHeader>
              {sesionActiva ? (
                <ProveedorCarrito>
                  <Venta />
                </ProveedorCarrito>
              ) : (
                <p>Sesión cerrada</p>
              )}
            </ProveedorHeader>
          </ProveedorToasts>
        </MemoryRouter>
      );
    }

    const { rerender } = render(<Envoltorio sesionActiva={true} />);
    fireEvent.click(screen.getByText('Miel 500g'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getAllByText('Miel 500g').length).toBeGreaterThan(0);

    // "Desloguear": se desmonta ProveedorCarrito.
    rerender(<Envoltorio sesionActiva={false} />);
    expect(screen.getByText('Sesión cerrada')).toBeTruthy();

    // "Volver a loguearse": nuevo ProveedorCarrito, arranca vacío.
    rerender(<Envoltorio sesionActiva={true} />);
    expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0);
  });
});
