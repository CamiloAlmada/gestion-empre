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

// Misma translucidez que BarraPestanas (docs/06-ui-ux.md §3): tab bar y
// header son las únicas zonas translúcidas de la app, con el mismo fallback
// a superficie sólida cuando el navegador no soporta backdrop-filter o el
// usuario pidió menos transparencia.
const CLASES_HEADER =
  'sticky top-0 z-30 border-b border-borde px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] ' +
  'bg-superficie-translucida backdrop-blur-lg backdrop-saturate-[1.4] ' +
  '[@supports_not_(backdrop-filter:_blur(1px))]:bg-superficie ' +
  '[@media(prefers-reduced-transparency:reduce)]:bg-superficie';

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

const CLASE_VOLVER =
  'flex min-h-[44px] shrink-0 items-center gap-1 rounded px-1 text-sm font-medium text-texto-secundario ' +
  'hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

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
        {/* Una sola fila: volver + título truncan/comparten espacio a la
            izquierda, chip de conexión y acciones (hasta 2, solo `md:`+: en
            mobile flotan sobre la tab bar, ver cluster más abajo) a la
            derecha. */}
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {config?.volverA !== undefined && (
              <Link to={config.volverA.a} className={CLASE_VOLVER}>
                <span aria-hidden="true">‹</span> {config.volverA.etiqueta}
              </Link>
            )}
            <h1 className="truncate text-lg font-semibold text-texto">{titulo}</h1>
          </div>
          {!enLinea && <ChipSinConexion />}
          {hayAcciones && (
            <div className="hidden shrink-0 items-center gap-2 md:flex">{config?.acciones}</div>
          )}
          {/* Acción de header-siempre (docs/06-ui-ux.md §2, 2026-07-10): a
              diferencia de `acciones`, esta NO tiene contraparte en el
              cluster flotante — se renderiza acá en TODAS las anchuras (hoy
              solo la usa Venta, para el atajo a Historial). */}
          {hayAccionHeader && <div className="flex shrink-0 items-center">{config?.accionHeader}</div>}
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
            fallback (docs/06-ui-ux.md §1.3). */}
        <Suspense fallback={<FallbackPantalla />}>
          <Outlet />
        </Suspense>
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
