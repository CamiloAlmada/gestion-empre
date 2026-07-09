import { Proximamente } from '../componentes/Proximamente';
import { IconoReportes } from '../componentes/iconos';
import { useHeader } from '../componentes/header/ContextoHeader';

/** Placeholder: solo admin llega acá (ver RutaSoloAdmin). Los reportes reales
 * los construye otra tarea. */
export function Reportes() {
  useHeader({ titulo: 'Reportes' });
  return <Proximamente titulo="Reportes" icono={<IconoReportes className="h-12 w-12" />} />;
}
