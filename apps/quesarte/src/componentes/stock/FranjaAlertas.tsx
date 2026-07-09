import type { ConteoAlertas, TipoAlerta } from './alertas';

export interface FranjaAlertasProps {
  conteo: ConteoAlertas;
  /** `null` = sin filtro activo (ningún chip presionado). */
  alertaActiva: TipoAlerta | null;
  onAlternar: (alerta: TipoAlerta) => void;
}

interface ChipDef {
  alerta: TipoAlerta;
  cantidad: number;
  etiqueta: string;
}

/**
 * Franja de chips-filtro sobre la lista maestra de Stock: uno por cada tipo
 * de alerta que tenga al menos un producto ("N por vencer", "N stock bajo").
 * Sin alertas, la franja no se renderiza (nada que comunicar).
 *
 * Tocar un chip filtra la lista a esa alerta (toggle on/off, ver
 * `alertas.ts`). El chip activo se distingue con ícono ✓ + borde más grueso
 * — nunca solo por color (docs/06-ui-ux.md §5) — y reutiliza el único par de
 * contraste aprobado para este uso, `advertencia`/superficie
 * (docs/06-ui-ux.md §7): no se inventa un par nuevo para el estado activo.
 */
export function FranjaAlertas({ conteo, alertaActiva, onAlternar }: FranjaAlertasProps) {
  const todasLasAlertas: ChipDef[] = [
    { alerta: 'por_vencer', cantidad: conteo.porVencer, etiqueta: 'por vencer' },
    { alerta: 'stock_bajo', cantidad: conteo.stockBajo, etiqueta: 'stock bajo' },
  ];
  const chips = todasLasAlertas.filter((chip) => chip.cantidad > 0);

  if (chips.length === 0) return null;

  return (
    <div role="group" aria-label="Alertas de stock" className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const activo = alertaActiva === chip.alerta;
        return (
          <button
            key={chip.alerta}
            type="button"
            aria-pressed={activo}
            onClick={() => onAlternar(chip.alerta)}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-advertencia bg-superficie px-3 text-sm text-advertencia transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1 focus-visible:ring-offset-superficie ${
              activo ? 'border-2 font-semibold' : 'border font-medium'
            }`}
          >
            {activo && <span aria-hidden="true">✓</span>}
            {chip.cantidad} {chip.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
