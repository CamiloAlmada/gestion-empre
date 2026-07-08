import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ProveedorAuth } from '@gestion/firebase-kit';
import { ProveedorTema, ProveedorToasts } from '@gestion/ui';
import { App } from './App';
import { auth, db } from './firebase';
import './index.css';

const contenedor = document.getElementById('root');
if (contenedor === null) {
  throw new Error('No se encontró el elemento #root en index.html.');
}

createRoot(contenedor).render(
  <StrictMode>
    <ProveedorTema>
      <BrowserRouter>
        <ProveedorAuth auth={auth} db={db}>
          <ProveedorToasts>
            <App />
          </ProveedorToasts>
        </ProveedorAuth>
      </BrowserRouter>
    </ProveedorTema>
  </StrictMode>,
);
