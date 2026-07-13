import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { useAuth } from '@gestion/firebase-kit';
import { FallbackPantalla } from '../FallbackPantalla';
import { itemsSelectorStock, SelectorSeccion } from './SelectorSeccion';
import { useSwipeSeccion } from './useSwipeSeccion';

/**
 * Altura mínima del contenedor del layout (UI-4d, docs/06-ui-ux.md §2,
 * Problema 2 — validación del dueño en campo): el área del swipe debe cubrir
 * TODO el alto visible de la sección, incluido el espacio vacío bajo
 * contenido corto (p. ej. Proveedores sin datos) — antes de este fix, los
 * toques ahí caían en el `<main>` del Shell, fuera de los handlers de
 * `useSwipeSeccion`.
 *
 * `100dvh` (no `100vh`, único uso en el repo: justificado porque esta es la
 * única superficie pensada para gesto táctil de mostrador, donde el chrome
 * del navegador mobile aparece/desaparece) menos `--altura-header` y
 * `--altura-zona-inferior` (mismas variables que ya usa `Shell.tsx` para su
 * padding, `@gestion/config/tailwind.css`) da el alto visible ENTRE el
 * header y la tab bar. A eso se le resta el propio "chrome" de `<main>` en
 * Shell.tsx que NO expone ninguna variable (para no tocarlo, fuera de
 * alcance de esta tarea): su padding superior fijo (`p-4` = 1rem) más el
 * colchón inferior (+2rem, siempre) y, en mobile CON acciones de header
 * (Productos/Compras/Proveedores tienen "+"), el cluster flotante (+3.5rem
 * extra, `pb-[...+2rem+3.5rem]` en Shell.tsx). Esta pantalla NO sabe si la
 * sección activa declaró acciones (esa lógica vive en el `Shell`, no llega
 * hasta acá) — se resta SIEMPRE el peor caso (con cluster) para no pasarse
 * nunca por arriba del alto real disponible: pasarse introduciría scroll
 * vertical nuevo en pantallas donde el contenido ya llena la pantalla,
 * exactamente lo que este fix no debe hacer. El costo es quedar corto por
 * 3.5rem en las secciones SIN acciones (Precios; Categorías, mientras siga
 * colgando de acá) en mobile — mejor un margen residual chico que un scroll
 * espurio.
 * En `md:` el cluster flotante no existe (las acciones viven en el header),
 * así que ahí el resto siempre es exacto (+1rem +2rem = 3rem).
 */
const CLASE_ALTURA_MINIMA =
  'min-h-[calc(100dvh-var(--altura-header)-var(--altura-zona-inferior)-6.5rem)] ' +
  'md:min-h-[calc(100dvh-var(--altura-header)-var(--altura-zona-inferior)-3rem)]';

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
 * esta tarea): las pantallas admin-only (Compras/Proveedores/Precios) igual
 * quedan protegidas server-side por `RutaSoloAdmin` en App.tsx — acá solo se
 * decide qué ítems mostrar en el selector.
 *
 * **Una sola sección visible (UI-5, fusión Stock+Catálogo, docs/06-ui-ux.md
 * §2): con `items.length < 2` (el caso del `vendedor`, que solo tiene
 * "Productos") NO hay vecinas — el `SelectorSeccion` no se renderiza y los
 * handlers de swipe no se attachean al contenedor (no tiene sentido
 * escuchar un gesto que nunca puede tener destino). `useSwipeSeccion` sigue
 * llamándose siempre (reglas de hooks: no puede ser condicional), solo se
 * decide si sus manejadores se conectan al DOM.**
 *
 * El swipe (UI-4c, docs/06-ui-ux.md §2) escucha sobre ESTE contenedor (no el
 * selector ni el `Outlet`): `useSwipeSeccion` recibe el mismo array `items`
 * ya filtrado por rol, así que navega respetando el rol sin recalcularlo. El
 * contenedor se estira con `CLASE_ALTURA_MINIMA` (UI-4d, Problema 2) para que
 * el gesto responda también en el espacio vacío bajo contenido corto.
 *
 * `Suspense` PROPIO alrededor del `Outlet` (UI-4d, Problema 1 — restricción
 * no evidente): antes vivía SOLO en `Shell.tsx`, por ENCIMA de este layout
 * entero. Un chunk lazy frío (`React.lazy`, F2-D0) de cualquier sección de
 * Stock hacía que ESE `Suspense` de `Shell` mostrara su fallback en lugar de
 * TODO su `children` — incluido este `StockLayout`, `SelectorSeccion` y su
 * scroll horizontal. Con el `Suspense` acá adentro (envolviendo solo el
 * `Outlet`, no el selector), el fallback de una carga fría reemplaza
 * únicamente el contenido de la sección: el selector nunca se desmonta ni
 * pierde su scroll/estado. Mismo `fallback` (`FallbackPantalla`) que usa
 * `Shell.tsx`, reutilizado tal cual — no hay dos versiones del spinner de
 * carga. El `Suspense` de `Shell.tsx` sigue ahí para el resto de las rutas
 * (Venta, Clientes, Reportes, Ajustes, fichas de detalle) y como red de
 * fallback general.
 */
export function StockLayout() {
  const { perfil } = useAuth();
  const esAdmin = perfil?.rol === 'admin';
  const items = itemsSelectorStock(esAdmin);
  // Sin vecinas (vendedor: solo "Productos"), no hay selector que mostrar ni
  // swipe que tenga destino posible (UI-5, docs/06-ui-ux.md §2).
  const hayVecinas = items.length >= 2;
  const { ref, onTouchStart, onTouchEnd, onTouchCancel } = useSwipeSeccion(items);

  return (
    <div
      data-testid="layout-stock"
      ref={hayVecinas ? ref : undefined}
      onTouchStart={hayVecinas ? onTouchStart : undefined}
      onTouchEnd={hayVecinas ? onTouchEnd : undefined}
      onTouchCancel={hayVecinas ? onTouchCancel : undefined}
      className={`flex flex-col gap-4 ${CLASE_ALTURA_MINIMA}`}
    >
      {hayVecinas && <SelectorSeccion items={items} />}
      <Suspense fallback={<FallbackPantalla />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
