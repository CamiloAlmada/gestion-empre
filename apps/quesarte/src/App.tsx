import { Navigate, Route, Routes, useParams } from 'react-router';
import { Login } from './pantallas/Login';
import { Venta } from './pantallas/Venta';
import { Stock } from './pantallas/Stock';
import { Productos } from './pantallas/Productos';
import { DetalleProductoPantalla } from './pantallas/DetalleProductoPantalla';
import { Proveedores } from './pantallas/Proveedores';
import { DetalleProveedorPantalla } from './pantallas/DetalleProveedorPantalla';
import { Historial } from './pantallas/Historial';
import { Clientes } from './pantallas/Clientes';
import { DetalleClientePantalla } from './pantallas/DetalleClientePantalla';
import { Reportes } from './pantallas/Reportes';
import { Ajustes } from './pantallas/Ajustes';
import { Usuarios } from './pantallas/Usuarios';
import { RutaProtegida } from './rutas/RutaProtegida';
import { RutaSoloAdmin } from './rutas/RutaSoloAdmin';
import { Shell } from './Shell';
import { AvisoPwa } from './componentes/AvisoPwa';
import { MetaThemeColor } from './componentes/MetaThemeColor';

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
