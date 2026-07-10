import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ProveedorTema, ProveedorToasts } from '@gestion/ui';
import { App } from './App';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(() => ({ datos: [], cargando: false, error: null })),
}));

// Venta (ruteada en "/", home de la app) trae productos/piezas con
// useCollection: se mockea vacío (sin cargando/error) para no depender de un
// `db` real. Este suite solo prueba ruteo (no el contenido de Venta, que
// tiene su propio Venta.test.tsx), mismo criterio que Productos/AvisoPwa
// abajo.
vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  useOnlineStatus: mocks.useOnlineStatus,
  useCollection: mocks.useCollection,
  productoConverter: {},
  piezaConverter: {},
  clienteConverter: {},
}));

// Mismo motivo que el mock de '@gestion/firebase-kit' de arriba: Venta arma
// sus queries con `collection`/`query`/`where` reales de 'firebase/firestore'
// sobre un `db` falso ({}); sin este mock, `collection({}, ...)` explota
// porque no es una instancia real de Firestore (mismo patrón que
// Stock.test.tsx).
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
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
}));

// AvisoPwa (montado siempre por App) importa el módulo virtual que expone
// vite-plugin-pwa en runtime real; no lo resuelve el vitest.config.ts de la
// app (no carga ese plugin). Se mockea el componente entero para no cargar
// ese import transitivo — no se toca AvisoPwa.tsx.
vi.mock('./componentes/AvisoPwa', () => ({
  AvisoPwa: () => null,
}));

// Productos (pantalla de /stock/productos) arma su query de Firestore al
// importarse (`collection(db, 'productos')`, ver Productos.tsx), lo que
// exige un `db` real: el mock de @gestion/firebase-kit de este archivo no
// implementa `initFirebase`. Este suite solo prueba ruteo (no el contenido
// de Productos, que tiene su propio Productos.test.tsx), así que se mockea
// el componente entero — mismo criterio que AvisoPwa arriba.
vi.mock('./pantallas/Productos', () => ({
  Productos: () => null,
}));

// La pantalla Stock (ruteada acá) importa `db` de './firebase', que a su vez
// llama a `initFirebase` de Firebase real al cargar el módulo. Se mockea para
// no inicializar Firebase de verdad en este test de rutas — el valor no
// importa porque Stock.test.tsx mockea todas las escrituras/lecturas.
vi.mock('./firebase', () => ({ auth: {}, db: {} }));

// Usuarios (pantalla de /ajustes/usuarios) arma su query de Firestore al
// importarse (`collection(db, 'usuarios')`, ver Usuarios.tsx), igual que
// Productos arriba: se mockea el componente entero, este suite solo prueba
// ruteo (Usuarios.test.tsx cubre su contenido).
vi.mock('./pantallas/Usuarios', () => ({
  Usuarios: () => <div>Contenido de Usuarios</div>,
}));

// DetalleProductoPantalla (pantalla de /stock/producto/:id) también arma su
// query de Firestore al importarse, mismo motivo que Productos/Usuarios
// arriba: se mockea entero (DetalleProductoPantalla.test.tsx cubre su
// contenido), este suite solo prueba que la ruta existe y llega ahí.
vi.mock('./pantallas/DetalleProductoPantalla', () => ({
  DetalleProductoPantalla: () => <div>Contenido de DetalleProductoPantalla</div>,
}));

// Proveedores/DetalleProveedorPantalla (rutas de /stock/proveedores, solo
// admin) también arman su query de Firestore al importarse, mismo motivo que
// Productos/Usuarios arriba: se mockean enteras (tienen sus propios test
// files), este suite solo prueba que las rutas existen y el gate de
// `RutaSoloAdmin` funciona para ellas.
vi.mock('./pantallas/Proveedores', () => ({
  Proveedores: () => <div>Contenido de Proveedores</div>,
}));

vi.mock('./pantallas/DetalleProveedorPantalla', () => ({
  DetalleProveedorPantalla: () => <div>Contenido de DetalleProveedorPantalla</div>,
}));

// Clientes (pantalla de /historial/clientes) también arma su query de
// Firestore al importarse (`collection(db, 'clientes')`, ver Clientes.tsx),
// mismo motivo que Productos/Usuarios arriba: se mockea entera
// (Clientes.test.tsx cubre su contenido), este suite solo prueba que la ruta
// existe y llega ahí.
vi.mock('./pantallas/Clientes', () => ({
  Clientes: () => <div>Contenido de Clientes</div>,
}));

// DetalleClientePantalla (pantalla de /historial/cliente/:id): mismo motivo
// que DetalleProductoPantalla arriba (DetalleClientePantalla.test.tsx cubre
// su contenido).
vi.mock('./pantallas/DetalleClientePantalla', () => ({
  DetalleClientePantalla: () => <div>Contenido de DetalleClientePantalla</div>,
}));

function configurarAuth(rol: 'admin' | 'vendedor') {
  mocks.useAuth.mockReturnValue({
    usuario: { uid: 'u1' },
    perfil: { uid: 'u1', nombre: 'Ana', email: 'ana@a.com', rol, activo: true },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn().mockResolvedValue(undefined),
  });
}

// Venta (ruteada en "/") usa useToasts(): se envuelve con ProveedorToasts
// igual que la composición real de main.tsx (fuera de <App>). ProveedorTema
// también se agrega acá (TH-D): App ahora monta <MetaThemeColor /> siempre
// (fuera de las rutas, ver App.tsx), que llama a useTema() y por lo tanto
// necesita el provider — mismo orden que main.tsx.
function renderizarEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorTema>
        <ProveedorToasts>
          <App />
        </ProveedorToasts>
      </ProveedorTema>
    </MemoryRouter>,
  );
}

describe('App - rutas', () => {
  beforeEach(() => {
    // App monta <MetaThemeColor /> siempre (TH-D), que llama a
    // `window.matchMedia` — ausente en jsdom (ni siquiera existe la
    // propiedad, así que hace falta `vi.stubGlobal`, no alcanza con
    // `vi.spyOn`). Este suite no ejercita el detalle de MetaThemeColor (ver
    // su propio test), así que un doble mínimo que no rompa el montaje
    // alcanza.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('"/" redirige a la pantalla de Venta', () => {
    configurarAuth('vendedor');

    renderizarEn('/');

    // El header de Shell (h1) confirma la ruta activa. Venta (pantalla real,
    // ver Venta.test.tsx) no repite el título como h2 — a diferencia del
    // placeholder que reemplazó, ya lo muestra el header. Con productos
    // vacíos (useCollection mockeado arriba), Venta cae en su estado vacío.
    expect(screen.getByRole('heading', { name: 'Venta', level: 1 })).toBeTruthy();
    expect(screen.getByText('Sin productos — creá el catálogo primero.')).toBeTruthy();
  });

  it('vendedor que navega a /reportes es redirigido a Venta', () => {
    configurarAuth('vendedor');

    renderizarEn('/reportes');

    expect(screen.getByRole('heading', { name: 'Venta', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Reportes' })).toBeNull();
  });

  it('admin que navega a /reportes ve la pantalla de Reportes', () => {
    configurarAuth('admin');

    renderizarEn('/reportes');

    expect(screen.getByRole('heading', { name: 'Reportes', level: 1 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reportes', level: 2 })).toBeTruthy();
  });

  it('vendedor que navega a /ajustes/usuarios es redirigido a Venta', () => {
    configurarAuth('vendedor');

    renderizarEn('/ajustes/usuarios');

    expect(screen.getByRole('heading', { name: 'Venta', level: 1 })).toBeTruthy();
    expect(screen.queryByText('Contenido de Usuarios')).toBeNull();
  });

  it('admin que navega a /ajustes/usuarios ve la pantalla de Usuarios', () => {
    configurarAuth('admin');

    renderizarEn('/ajustes/usuarios');

    expect(screen.getByText('Contenido de Usuarios')).toBeTruthy();
  });

  it('navega a /stock/producto/:id (ruta real de detalle, no estado interno)', () => {
    configurarAuth('admin');

    renderizarEn('/stock/producto/abc123');

    expect(screen.getByText('Contenido de DetalleProductoPantalla')).toBeTruthy();
  });

  it('vendedor también puede navegar a /stock/producto/:id (no es solo-admin)', () => {
    configurarAuth('vendedor');

    renderizarEn('/stock/producto/abc123');

    expect(screen.getByText('Contenido de DetalleProductoPantalla')).toBeTruthy();
  });

  it('vendedor que navega a /stock/proveedores es redirigido a Venta (docs/07: solo admin)', () => {
    configurarAuth('vendedor');

    renderizarEn('/stock/proveedores');

    expect(screen.getByRole('heading', { name: 'Venta', level: 1 })).toBeTruthy();
    expect(screen.queryByText('Contenido de Proveedores')).toBeNull();
  });

  it('admin que navega a /stock/proveedores ve la pantalla de Proveedores', () => {
    configurarAuth('admin');

    renderizarEn('/stock/proveedores');

    expect(screen.getByText('Contenido de Proveedores')).toBeTruthy();
  });

  it('vendedor que navega a /stock/proveedor/:id es redirigido a Venta (docs/07: solo admin)', () => {
    configurarAuth('vendedor');

    renderizarEn('/stock/proveedor/abc123');

    expect(screen.getByRole('heading', { name: 'Venta', level: 1 })).toBeTruthy();
    expect(screen.queryByText('Contenido de DetalleProveedorPantalla')).toBeNull();
  });

  it('admin que navega a /stock/proveedor/:id ve la ficha del proveedor', () => {
    configurarAuth('admin');

    renderizarEn('/stock/proveedor/abc123');

    expect(screen.getByText('Contenido de DetalleProveedorPantalla')).toBeTruthy();
  });

  it('navega a /historial/clientes (sección Clientes, ruta real)', () => {
    configurarAuth('admin');

    renderizarEn('/historial/clientes');

    expect(screen.getByText('Contenido de Clientes')).toBeTruthy();
  });

  it('vendedor también puede navegar a /historial/clientes (no es solo-admin, doc 07)', () => {
    configurarAuth('vendedor');

    renderizarEn('/historial/clientes');

    expect(screen.getByText('Contenido de Clientes')).toBeTruthy();
  });

  it('navega a /historial/cliente/:id (ficha de cliente, ruta real)', () => {
    configurarAuth('admin');

    renderizarEn('/historial/cliente/abc123');

    expect(screen.getByText('Contenido de DetalleClientePantalla')).toBeTruthy();
  });
});
