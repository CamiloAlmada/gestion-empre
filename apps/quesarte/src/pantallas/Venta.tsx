import { Proximamente } from '../componentes/Proximamente';
import { IconoVenta } from '../componentes/iconos';

/** Placeholder: la pantalla real de venta (POS) la construye otra tarea. */
export function Venta() {
  return <Proximamente titulo="Venta" icono={<IconoVenta className="h-12 w-12" />} />;
}
