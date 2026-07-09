import { useEffect, useRef, type CSSProperties } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { BarraPestanas, useToasts, type ItemBarraPestanas } from '@gestion/ui';
import { useAuth, useOnlineStatus } from '@gestion/firebase-kit';
import {
  IconoAjustes,
  IconoHistorial,
  IconoReportes,
  IconoStock,
  IconoVenta,
} from './componentes/iconos';
import { ProveedorHeader, useHeaderActual } from './componentes/header/ContextoHeader';

const TITULOS_POR_TAB: Record<string, string> = {
  venta: 'Venta',
  stock: 'Stock',
  historial: 'Historial',
  reportes: 'Reportes',
  ajustes: 'Ajustes',
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

// Altura real del header (fila única + padding, sin contar el safe-area del
// notch) expuesta como variable CSS en el contenedor raíz: cualquier
// contenido ruteado que necesite un offset sticky "bajo el header" (p.ej.
// los encabezados de categoría de `ListaProductosAgrupada`) la consume con
// `var(--altura-header)` en vez de repetir el número mágico (docs/04, deuda
// cerrada por SH-1). Single source of truth: si el header cambia de altura,
// se ajusta acá una sola vez.
//
// 4.25rem = pt-[...+0.75rem] + fila de acciones min-h-[44px] (2.75rem) +
// pb-3 (0.75rem), los tres tomados de `CLASES_HEADER` y de `CLASE_VOLVER`
// más abajo. Si cambia cualquiera de esos tres valores (paddings del header o
// min-height de las acciones), este número hay que recalcularlo a mano.
const ESTILO_RAIZ = { '--altura-header': 'calc(env(safe-area-inset-top) + 4.25rem)' } as CSSProperties;

const CLASE_VOLVER =
  'flex min-h-[44px] shrink-0 items-center gap-1 rounded px-1 text-sm font-medium text-texto-secundario ' +
  'hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

/** Primer segmento de la ruta actual, o 'venta' (home de la app) si no
 * matchea ninguna sección conocida. */
function obtenerTabActiva(pathname: string): string {
  const segmento = pathname.split('/')[1] ?? '';
  return segmento in TITULOS_POR_TAB ? segmento : 'venta';
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
 */
export function Shell() {
  return (
    <ProveedorHeader>
      <ShellInterior />
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
    { id: 'historial', etiqueta: 'Historial', icono: <IconoHistorial /> },
    { id: 'venta', etiqueta: 'Venta', icono: <IconoVenta />, central: true },
    ...(esAdmin ? [{ id: 'reportes', etiqueta: 'Reportes', icono: <IconoReportes /> }] : []),
    { id: 'ajustes', etiqueta: 'Ajustes', icono: <IconoAjustes /> },
  ];

  return (
    <div className="min-h-screen bg-fondo" style={ESTILO_RAIZ}>
      <header className={CLASES_HEADER}>
        {/* Una sola fila: volver + título truncan/comparten espacio a la
            izquierda, chip de conexión y acciones (hasta 2) a la derecha. */}
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
          {config?.acciones !== undefined && (
            <div className="flex shrink-0 items-center gap-2">{config.acciones}</div>
          )}
        </div>
      </header>
      {/* pb-24: deja espacio para no quedar tapado por la tab bar fija
          (~64px + safe-area-inset-bottom). */}
      <main className="mx-auto max-w-5xl p-4 pb-24">
        <Outlet />
      </main>
      <BarraPestanas items={items} activa={tabActiva} onSeleccionar={(id) => navigate(`/${id}`)} />
    </div>
  );
}
