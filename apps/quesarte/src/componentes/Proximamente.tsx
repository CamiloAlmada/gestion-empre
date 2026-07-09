import type { ReactNode } from 'react';

export interface ProximamenteProps {
  titulo: string;
  icono: ReactNode;
}

/**
 * Contenido de una sección todavía no construida (Venta, Stock, Historial y
 * Reportes arrancan así). Cada tarea que implemente la sección real reemplaza
 * el cuerpo de la pantalla correspondiente por su UI definitiva; el shell y
 * la navegación no cambian. Estados de loading/error/offline no aplican acá:
 * no hay datos que cargar todavía.
 */
export function Proximamente({ titulo, icono }: ProximamenteProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-card border border-borde p-8 text-center">
      <span className="text-texto-secundario">{icono}</span>
      <h2 className="text-xl font-semibold text-texto">{titulo}</h2>
      <p className="text-texto-secundario">Disponible próximamente.</p>
    </div>
  );
}
