import type { TinteFondo } from '@gestion/core';
import { GrupoSegmentado, type OpcionGrupoSegmentado } from './GrupoSegmentado';

export interface SelectorTinteProps {
  valor: TinteFondo;
  onChange: (valor: TinteFondo) => void;
}

const OPCIONES_TINTE: readonly OpcionGrupoSegmentado<TinteFondo>[] = [
  { valor: 'neutro', etiqueta: 'Neutro' },
  { valor: 'calido', etiqueta: 'Cálido' },
  { valor: 'frio', etiqueta: 'Frío' },
];

const ETIQUETA = 'Tinte de fondo';

/**
 * Terna Neutro/Cálido/Frío del eje `tinte` de "Colores del negocio" (docs
 * /06-ui-ux.md §4). `GrupoSegmentado` con las 3 opciones fijas — mismo
 * patrón visual que `SelectorTema`/`SelectorEstilo` de Ajustes (label
 * visible + grupo), acá hardcodeado porque el vocabulario (Neutro/Cálido/
 * Frío) es fijo del dominio, no algo que el llamador deba parametrizar.
 */
export function SelectorTinte({ valor, onChange }: SelectorTinteProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-texto-secundario">{ETIQUETA}</span>
      <GrupoSegmentado opciones={OPCIONES_TINTE} valor={valor} onCambiar={onChange} ariaLabel={ETIQUETA} />
    </div>
  );
}
