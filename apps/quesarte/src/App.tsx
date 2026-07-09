import { Navigate, Route, Routes } from 'react-router';
import { Login } from './pantallas/Login';
import { Venta } from './pantallas/Venta';
import { Stock } from './pantallas/Stock';
import { Productos } from './pantallas/Productos';
import { DetalleProductoPantalla } from './pantallas/DetalleProductoPantalla';
import { Proveedores } from './pantallas/Proveedores';
import { DetalleProveedorPantalla } from './pantallas/DetalleProveedorPantalla';
import { Historial } from './pantallas/Historial';
import { Reportes } from './pantallas/Reportes';
import { Ajustes } from './pantallas/Ajustes';
import { Usuarios } from './pantallas/Usuarios';
import { RutaProtegida } from './rutas/RutaProtegida';
import { RutaSoloAdmin } from './rutas/RutaSoloAdmin';
import { Shell } from './Shell';
import { AvisoPwa } from './componentes/AvisoPwa';
import { MetaThemeColor } from './componentes/MetaThemeColor';

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
          <Route path="historial" element={<Historial />} />
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
