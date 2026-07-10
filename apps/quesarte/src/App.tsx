import { lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';
import { Login } from './pantallas/Login';
import { Venta } from './pantallas/Venta';
import { RutaProtegida } from './rutas/RutaProtegida';
import { RutaSoloAdmin } from './rutas/RutaSoloAdmin';
import { Shell } from './Shell';
import { AvisoPwa } from './componentes/AvisoPwa';
import { MetaThemeColor } from './componentes/MetaThemeColor';

/**
 * Code-splitting por ruta (F2-D0, docs/04): cada pantalla ruteada pasa a su
 * propio chunk, cargado on-demand con `React.lazy`. El fallback de
 * `<Suspense>` vive en `Shell.tsx` (envuelve el `<Outlet />`, no las rutas
 * acá) para que header y tab bar queden montados durante la carga.
 *
 * `Venta` (home del POS, mostrador) y `Login` (entrada previa al shell)
 * quedan FUERA de este split a propósito: son las pantallas críticas del
 * primer render, no pueden pagar un roundtrip de red extra.
 *
 * Convención elegida para resolver el `lazy()`: las pantallas usan named
 * exports (consistente con el resto del repo, docs/01) — en vez de agregar
 * default exports solo para esto, cada import se adapta con
 * `.then((m) => ({ default: m.X }))`.
 */
const Stock = lazy(() => import('./pantallas/Stock').then((m) => ({ default: m.Stock })));
const Productos = lazy(() =>
  import('./pantallas/Productos').then((m) => ({ default: m.Productos })),
);
const DetalleProductoPantalla = lazy(() =>
  import('./pantallas/DetalleProductoPantalla').then((m) => ({
    default: m.DetalleProductoPantalla,
  })),
);
const Proveedores = lazy(() =>
  import('./pantallas/Proveedores').then((m) => ({ default: m.Proveedores })),
);
const Precios = lazy(() => import('./pantallas/Precios').then((m) => ({ default: m.Precios })));
const DetalleProveedorPantalla = lazy(() =>
  import('./pantallas/DetalleProveedorPantalla').then((m) => ({
    default: m.DetalleProveedorPantalla,
  })),
);
const Historial = lazy(() =>
  import('./pantallas/Historial').then((m) => ({ default: m.Historial })),
);
const Clientes = lazy(() =>
  import('./pantallas/Clientes').then((m) => ({ default: m.Clientes })),
);
const DetalleClientePantalla = lazy(() =>
  import('./pantallas/DetalleClientePantalla').then((m) => ({
    default: m.DetalleClientePantalla,
  })),
);
const Reportes = lazy(() =>
  import('./pantallas/Reportes').then((m) => ({ default: m.Reportes })),
);
const Ajustes = lazy(() => import('./pantallas/Ajustes').then((m) => ({ default: m.Ajustes })));
const Usuarios = lazy(() =>
  import('./pantallas/Usuarios').then((m) => ({ default: m.Usuarios })),
);

/** Redirect de la ficha de cliente vieja (`/historial/cliente/:id`, PWAs con
 * ese deep link instalado) a su nueva ruta (`/clientes/cliente/:id`),
 * preservando el `:id` — `<Navigate>` no interpola params por sí solo. */
function RedirigirFichaClienteVieja() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/clientes/cliente/${id}`} replace />;
}

export function App() {
  return (
    <>
      <MetaThemeColor />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RutaProtegida>
              <Shell />
            </RutaProtegida>
          }
        >
          <Route index element={<Navigate to="/venta" replace />} />
          <Route path="venta" element={<Venta />} />
          <Route path="stock" element={<Stock />} />
          <Route path="stock/productos" element={<Productos />} />
          <Route path="stock/producto/:id" element={<DetalleProductoPantalla />} />
          <Route
            path="stock/proveedores"
            element={
              <RutaSoloAdmin>
                <Proveedores />
              </RutaSoloAdmin>
            }
          />
          <Route
            path="stock/proveedor/:id"
            element={
              <RutaSoloAdmin>
                <DetalleProveedorPantalla />
              </RutaSoloAdmin>
            }
          />
          {/* Precios y márgenes (F2-F2, docs/03-compras-costos-precios.md):
              solo admin, mismo criterio que Proveedores. */}
          <Route
            path="stock/precios"
            element={
              <RutaSoloAdmin>
                <Precios />
              </RutaSoloAdmin>
            }
          />
          {/* Clientes es la raíz del tab (docs/06-ui-ux.md §2, 2026-07-10). */}
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/cliente/:id" element={<DetalleClientePantalla />} />
          {/* Historial general (DE VENTAS) cuelga del tab Venta en la
              jerarquía (volverA + tab activo, ver Shell.tsx, docs/06-ui-ux.md
              §2, 2026-07-10) pero su URL no cambió: hay PWAs instaladas con
              ese deep link ("ver/anular la última venta"). */}
          <Route path="historial" element={<Historial />} />
          {/* Redirects de las rutas viejas de Clientes (vivían bajo
              /historial antes de que el tab se invirtiera) — mismo motivo,
              deep links viejos en PWAs instaladas. */}
          <Route path="historial/clientes" element={<Navigate to="/clientes" replace />} />
          <Route path="historial/cliente/:id" element={<RedirigirFichaClienteVieja />} />
          <Route
            path="reportes"
            element={
              <RutaSoloAdmin>
                <Reportes />
              </RutaSoloAdmin>
            }
          />
          <Route path="ajustes" element={<Ajustes />} />
          <Route
            path="ajustes/usuarios"
            element={
              <RutaSoloAdmin>
                <Usuarios />
              </RutaSoloAdmin>
            }
          />
        </Route>
      </Routes>
      <AvisoPwa />
    </>
  );
}
