import { Outlet } from 'react-router';
import { useAuth } from '@gestion/firebase-kit';
import { itemsSelectorStock, SelectorSeccion } from './SelectorSeccion';

/**
 * Layout route pathless de las secciones RAÍZ del tab Stock (docs/06-ui-ux.md
 * §2, UI-4): renderiza el `SelectorSeccion` UNA sola vez sobre un `<Outlet />`
 * — a diferencia del esquema anterior (cada pantalla lo repetía en su propio
 * cuerpo), acá el selector no se remonta al navegar entre secciones hermanas
 * (conserva su scroll horizontal). Las fichas de detalle (producto, compra,
 * proveedor) quedan FUERA de este layout en App.tsx: sin selector, mismo
 * criterio que ya tenían.
 *
 * `esAdmin` sale de `useAuth` (mismo criterio que tenía `Stock.tsx` antes de
 * esta tarea): las pantallas admin-only (Compras/Proveedores/Precios/
 * Categorías) igual quedan protegidas server-side por `RutaSoloAdmin` en
 * App.tsx — acá solo se decide qué ítems mostrar en el selector.
 */
export function StockLayout() {
  const { perfil } = useAuth();
  const esAdmin = perfil?.rol === 'admin';

  return (
    <div className="flex flex-col gap-4">
      <SelectorSeccion items={itemsSelectorStock(esAdmin)} />
      <Outlet />
    </div>
  );
}
