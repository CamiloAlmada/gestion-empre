import { Proximamente } from '../componentes/Proximamente';
import { IconoStock } from '../componentes/iconos';

/** Placeholder: stock, piezas y productos los construye otra tarea. */
export function Stock() {
  return <Proximamente titulo="Stock" icono={<IconoStock className="h-12 w-12" />} />;
}
