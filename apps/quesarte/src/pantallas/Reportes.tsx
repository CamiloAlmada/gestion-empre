import { Proximamente } from '../componentes/Proximamente';
import { IconoReportes } from '../componentes/iconos';

/** Placeholder: solo admin llega acá (ver RutaSoloAdmin). Los reportes reales
 * los construye otra tarea. */
export function Reportes() {
  return <Proximamente titulo="Reportes" icono={<IconoReportes className="h-12 w-12" />} />;
}
