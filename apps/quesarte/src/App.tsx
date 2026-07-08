import { Navigate, Route, Routes } from 'react-router';
import { Login } from './pantallas/Login';
import { Venta } from './pantallas/Venta';
import { Stock } from './pantallas/Stock';
import { Historial } from './pantallas/Historial';
import { Reportes } from './pantallas/Reportes';
import { Ajustes } from './pantallas/Ajustes';
import { RutaProtegida } from './rutas/RutaProtegida';
import { RutaSoloAdmin } from './rutas/RutaSoloAdmin';
import { Shell } from './Shell';
import { AvisoPwa } from './componentes/AvisoPwa';

export function App() {
  return (
    <>
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
        </Route>
      </Routes>
      <AvisoPwa />
    </>
  );
}
