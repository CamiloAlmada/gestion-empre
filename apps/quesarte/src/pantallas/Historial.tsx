import { Proximamente } from '../componentes/Proximamente';
import { IconoHistorial } from '../componentes/iconos';

/** Placeholder: el historial de ventas/movimientos lo construye otra tarea. */
export function Historial() {
  return <Proximamente titulo="Historial" icono={<IconoHistorial className="h-12 w-12" />} />;
}
