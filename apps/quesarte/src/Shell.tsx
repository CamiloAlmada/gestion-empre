import { Outlet, useLocation, useNavigate } from 'react-router';
import { BarraPestanas, type ItemBarraPestanas } from '@gestion/ui';
import { useAuth, useOnlineStatus } from '@gestion/firebase-kit';
import {
  IconoAjustes,
  IconoHistorial,
  IconoReportes,
  IconoStock,
  IconoVenta,
} from './componentes/iconos';

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

/** Primer segmento de la ruta actual, o 'venta' (home de la app) si no
 * matchea ninguna sección conocida. */
function obtenerTabActiva(pathname: string): string {
  const segmento = pathname.split('/')[1] ?? '';
  return segmento in TITULOS_POR_TAB ? segmento : 'venta';
}

/**
 * Shell de la app: header (título de la sección + indicador de conexión) +
 * contenido ruteado (`Outlet`) + `BarraPestanas` fija abajo, cableada al
 * router. Vive DENTRO de `RutaProtegida` (perfil ya garantizado no nulo y
 * activo). Ver docs/06-ui-ux.md §2.
 */
export function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();

  const tabActiva = obtenerTabActiva(location.pathname);
  const titulo = TITULOS_POR_TAB[tabActiva] ?? 'Quesarte';
  const esAdmin = perfil?.rol === 'admin';

  const items: ItemBarraPestanas[] = [
    { id: 'stock', etiqueta: 'Stock', icono: <IconoStock /> },
    { id: 'historial', etiqueta: 'Historial', icono: <IconoHistorial /> },
    { id: 'venta', etiqueta: 'Venta', icono: <IconoVenta />, central: true },
    ...(esAdmin ? [{ id: 'reportes', etiqueta: 'Reportes', icono: <IconoReportes /> }] : []),
    { id: 'ajustes', etiqueta: 'Ajustes', icono: <IconoAjustes /> },
  ];

  return (
    <div className="min-h-screen bg-fondo">
      <header className={CLASES_HEADER}>
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-lg font-semibold text-texto">{titulo}</h1>
          <span className="flex items-center gap-2 text-sm text-texto-secundario">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${enLinea ? 'bg-exito' : 'bg-texto-secundario'}`}
            />
            {enLinea ? 'En línea' : 'Sin conexión'}
          </span>
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
