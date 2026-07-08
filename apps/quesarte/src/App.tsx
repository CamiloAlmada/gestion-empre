import { Route, Routes } from 'react-router';
import { Login } from './pantallas/Login';
import { Home } from './pantallas/Home';
import { RutaProtegida } from './rutas/RutaProtegida';
import { AvisoPwa } from './componentes/AvisoPwa';

export function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RutaProtegida>
              <Home />
            </RutaProtegida>
          }
        />
      </Routes>
      <AvisoPwa />
    </>
  );
}
