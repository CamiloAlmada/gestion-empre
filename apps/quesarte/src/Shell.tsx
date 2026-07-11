import { Suspense, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { BarraPestanas, useToasts, type ItemBarraPestanas } from '@gestion/ui';
import { useAuth, useOnlineStatus } from '@gestion/firebase-kit';
import {
  IconoAjustes,
  IconoClientes,
  IconoReportes,
  IconoStock,
  IconoVenta,
} from './componentes/iconos';
import { ErrorBoundaryRuta } from './componentes/ErrorBoundaryRuta';
import { FallbackPantalla } from './componentes/FallbackPantalla';
import { ProveedorHeader, useHeaderActual } from './componentes/header/ContextoHeader';
import { ProveedorCarrito } from './componentes/venta/ContextoCarrito';

const TITULOS_POR_TAB: Record<string, string> = {
  venta: 'Venta',
  stock: 'Stock',
  clientes: 'Clientes',
  reportes: 'Reportes',
  ajustes: 'Ajustes',
};

// Primer segmento de ruta -> tab que debe iluminarse en la barra. Coincide
// 1:1 con `TITULOS_POR_TAB` salvo `historial`: el Historial general (de
// VENTAS) cuelga del tab Venta en la jerarquía (docs/06-ui-ux.md §2,
// 2026-07-10, ajustado tras uso real del dueño) aunque su URL siga siendo
// `/historial` (no se movió: hay PWAs instaladas con ese deep link — ver
// App.tsx).
const TAB_POR_SEGMENTO: Record<string, string> = {
  venta: 'venta',
  stock: 'stock',
  clientes: 'clientes',
  historial: 'venta',
  reportes: 'reportes',
  ajustes: 'ajustes',
};

// Header FUNDIDO con el fondo (docs/06-ui-ux.md §2-3, rediseño 2026-07-10,
// tanda UI-3): mismo color que `fondo`, sin borde inferior ni translucidez —
// la translucidez queda reservada a `BarraPestanas` (única zona translúcida
// de la app). Opaco de por sí, así que no necesita los fallbacks de
// `@supports`/`prefers-reduced-transparency` que sí requiere la tab bar.
const CLASES_HEADER =
  'sticky top-0 z-30 bg-fondo px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]';

// `--altura-header` (usada por `ListaProductosAgrupada` para su offset
// sticky) ya no se define acá: vive en `@gestion/config/tailwind.css`, junto
// a `--altura-zona-inferior`, con la aritmética documentada ahí (responsiva a
// `md:`, ver docs/06-ui-ux.md §2).

// Cluster flotante de acciones contextuales en mobile (ergonomía de pulgar,
// docs/06-ui-ux.md §2, decidido 2026-07-09): mismos nodos que declara la
// pantalla vía `useHeader({ acciones })`, en un segundo render — la
// visibilidad la decide CSS puro (`hidden md:flex` en el header / `md:hidden`
// acá), igual patrón que el modo compacto de `DataTable`. Se posiciona sobre
// la tab bar con `--altura-zona-inferior` + un margen fijo. `[&>*]:shadow-flotante`
// da elevación a cada acción directa (ya tienen fondo propio — `Button` o los
// links `bg-superficie border`/`bg-primary-600` de cada pantalla — así que
// alcanza con la sombra, sin envolver los hijos en un contenedor opaco
// adicional que no podríamos estilar desde acá al ser un `ReactNode` opaco).
const CLASES_CLUSTER_ACCIONES = 'fixed right-4 z-30 flex gap-2 md:hidden [&>*]:shadow-flotante';

// Flecha de volver SOLA (docs/06-ui-ux.md §2, rediseño 2026-07-10): sin el
// nombre del padre al lado — ese texto ahora vive únicamente en el
// `aria-label` ("Volver a {Padre}"). Target 44×44px (h-11/w-11 = 2.75rem).
const CLASE_VOLVER =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-texto-secundario ' +
  'hover:bg-superficie hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

/** Tab que debe quedar activo para la ruta actual (ver `TAB_POR_SEGMENTO`),
 * o 'venta' (home de la app) si el primer segmento no matchea ninguna
 * sección conocida. */
function obtenerTabActiva(pathname: string): string {
  const segmento = pathname.split('/')[1] ?? '';
  return TAB_POR_SEGMENTO[segmento] ?? 'venta';
}

/** Chip "Sin conexión" (docs/06-ui-ux.md §2): con conexión el header no
 * muestra nada — un indicador permanente del estado normal es ruido. El par
 * advertencia/superficie ya está aprobado (docs/06 §7); el ícono es
 * decorativo, el texto lleva la información. */
function ChipSinConexion() {
  return (
    <span
      role="status"
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-borde bg-superficie px-2.5 py-1 text-xs font-medium text-advertencia"
    >
      <span aria-hidden="true">⚠</span>
      Sin conexión
    </span>
  );
}

/**
 * Shell de la app: header contextual (título de la vista + volver + acciones
 * + chip de conexión) + contenido ruteado (`Outlet`) + `BarraPestanas` fija
 * abajo, cableada al router. Vive DENTRO de `RutaProtegida` (perfil ya
 * garantizado no nulo y activo) y provee `ProveedorHeader` a sus rutas hijas
 * (las pantallas setean el header con `useHeader()`, ver
 * componentes/header/ContextoHeader.tsx). Ver docs/06-ui-ux.md §2.
 *
 * También provee `ProveedorCarrito` (docs/06-ui-ux.md §6, 2026-07-09): mismo
 * criterio que `ProveedorHeader` — por encima del `Outlet` para que navegar
 * entre tabs no desmonte la venta en curso, pero dentro de la sesión (se
 * pierde al desloguear, correcto). Hoy solo lo consume `pantallas/Venta.tsx`.
 */
export function Shell() {
  return (
    <ProveedorHeader>
      <ProveedorCarrito>
        <ShellInterior />
      </ProveedorCarrito>
    </ProveedorHeader>
  );
}

function ShellInterior() {
  const location = useLocation();
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();
  const config = useHeaderActual();

  const tabActiva = obtenerTabActiva(location.pathname);
  const tituloFallback = TITULOS_POR_TAB[tabActiva] ?? 'Quesarte';
  const titulo = config?.titulo ?? tituloFallback;
  const esAdmin = perfil?.rol === 'admin';

  // Toast "Conexión restablecida" SOLO en la transición false→true, nunca en
  // el primer render (arrancar online no es "reconectar"). `primeraVezRef`
  // hace que el efecto de montaje no cuente como transición; a partir de ahí
  // se compara contra el valor anterior guardado en `enLineaPrevRef`.
  const primeraVezRef = useRef(true);
  const enLineaPrevRef = useRef(enLinea);
  useEffect(() => {
    if (primeraVezRef.current) {
      primeraVezRef.current = false;
    } else if (!enLineaPrevRef.current && enLinea) {
      mostrarToast('Conexión restablecida', 'info');
    }
    enLineaPrevRef.current = enLinea;
  }, [enLinea, mostrarToast]);

  const items: ItemBarraPestanas[] = [
    { id: 'stock', etiqueta: 'Stock', icono: <IconoStock /> },
    { id: 'clientes', etiqueta: 'Clientes', icono: <IconoClientes /> },
    { id: 'venta', etiqueta: 'Venta', icono: <IconoVenta />, central: true },
    ...(esAdmin ? [{ id: 'reportes', etiqueta: 'Reportes', icono: <IconoReportes /> }] : []),
    { id: 'ajustes', etiqueta: 'Ajustes', icono: <IconoAjustes /> },
  ];

  const hayAcciones = config?.acciones !== undefined;
  const hayAccionHeader = config?.accionHeader !== undefined;

  return (
    <div className="min-h-screen bg-fondo">
      <header className={CLASES_HEADER}>
        {/* Grilla de 3 columnas con laterales SIMÉTRICOS (`minmax(0,1fr)` a
            ambos lados de una columna central `auto`): el título queda
            óptico-centrado en el ancho total del header, sin importar si un
            lado está vacío o el otro carga chip+acción — ambos laterales
            reciben siempre la misma fracción del espacio sobrante, así que
            el centro no se corre (docs/06-ui-ux.md §2, rediseño 2026-07-10). */}
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="flex min-w-0 items-center justify-start">
            {config?.volverA !== undefined && (
              <Link
                to={config.volverA.a}
                aria-label={`Volver a ${config.volverA.etiqueta}`}
                className={CLASE_VOLVER}
              >
                <span aria-hidden="true">‹</span>
              </Link>
            )}
          </div>
          <h1 className="truncate text-center text-lg font-semibold text-texto">{titulo}</h1>
          <div className="flex min-w-0 items-center justify-end gap-2">
            {!enLinea && <ChipSinConexion />}
            {hayAcciones && (
              <div className="hidden shrink-0 items-center gap-2 md:flex">{config?.acciones}</div>
            )}
            {/* Acción de header-siempre (docs/06-ui-ux.md §2, 2026-07-10): a
                diferencia de `acciones`, esta NO tiene contraparte en el
                cluster flotante — se renderiza acá en TODAS las anchuras (hoy
                solo la usa Venta, para el atajo a Historial). */}
            {hayAccionHeader && (
              <div className="flex shrink-0 items-center">{config?.accionHeader}</div>
            )}
          </div>
        </div>
      </header>
      {/* Padding inferior base (`--altura-zona-inferior` + 2rem = 6rem de
          siempre) para no quedar tapado por la tab bar fija; con acciones
          contextuales, en mobile suma el alto del cluster flotante (~3.5rem)
          para que el final del contenido no quede tapado por él — a partir
          de `md:` las acciones ya viven en el header, así que el padding
          extra no aplica. */}
      <main
        className={`mx-auto max-w-5xl p-4 ${
          hayAcciones
            ? 'pb-[calc(var(--altura-zona-inferior)+2rem+3.5rem)] md:pb-[calc(var(--altura-zona-inferior)+2rem)]'
            : 'pb-[calc(var(--altura-zona-inferior)+2rem)]'
        }`}
      >
        {/* Suspense de las pantallas lazy (F2-D0, docs/04): acá y no en
            App.tsx a propósito — header y `BarraPestanas` de este Shell
            quedan montados durante la carga, solo este `<main>` muestra el
            fallback (docs/06-ui-ux.md §1.3).
            `ErrorBoundaryRuta` AFUERA del `Suspense` (contiene también un
            fallo al cargar el chunk, no solo errores de render de la
            pantalla ya cargada) — hallazgo B1 del review de Fase 2: sin
            esto, un error de render en cualquier pantalla desmontaba TODA la
            app (pantalla blanca), no solo el contenido ruteado. El recovery
            ("Volver a Venta" sin recargar) lo da ahora `rutaActual`: el
            boundary se auto-resetea al cambiar la ruta SOLO si tiene un error
            (UI-4e, ver su JSDoc). Antes era `key={location.pathname}`, que
            remontaba el boundary y TODO su subtree en cada navegación —incluido
            el `StockLayout` persistente de Stock (docs/06-ui-ux.md §2), que no
            debe remontarse al navegar entre secciones hermanas.
            Este `Suspense` sigue cubriendo TODAS las rutas (Venta, Clientes,
            Reportes, Ajustes, fichas de detalle) como red de fallback
            general. Las secciones raíz de Stock (UI-4d, docs/06-ui-ux.md §2)
            tienen ADEMÁS su propio `Suspense` interno en `StockLayout.tsx`,
            envolviendo solo su `Outlet`: sin ese, este de acá (por ENCIMA de
            todo `StockLayout`) mostraba su fallback ante un chunk frío,
            reemplazando también el `SelectorSeccion` — perdía su scroll
            horizontal en cada carga fría. El de `StockLayout` intercepta la
            suspensión primero (React resuelve el `Suspense` ANCESTRO más
            cercano), así que este de acá ya no lo ve para esas rutas; sigue
            siendo el único para el resto. */}
        <ErrorBoundaryRuta rutaActual={location.pathname}>
          <Suspense fallback={<FallbackPantalla />}>
            <Outlet />
          </Suspense>
        </ErrorBoundaryRuta>
      </main>
      {/* Cluster flotante de acciones (mobile, ver CLASES_CLUSTER_ACCIONES):
          DESPUÉS del `<main>` en el DOM a propósito — los lectores de
          pantalla llegan al contenido principal antes que a estas acciones
          (docs/06-ui-ux.md §2). */}
      {hayAcciones && (
        <div
          data-testid="cluster-acciones"
          className={CLASES_CLUSTER_ACCIONES}
          style={{ bottom: 'calc(var(--altura-zona-inferior) + 0.75rem)' }}
        >
          {config?.acciones}
        </div>
      )}
      <BarraPestanas items={items} activa={tabActiva} onSeleccionar={(id) => navigate(`/${id}`)} />
    </div>
  );
}
