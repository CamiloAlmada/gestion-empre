export type VarianteBadgeStock = 'advertencia' | 'peligro';

export interface BadgeStockProps {
  variante: VarianteBadgeStock;
  children: string;
}

// Pares de contraste aprobados (docs/06-ui-ux.md §7): `advertencia`/superficie
// y `peligro`/superficie, ambos verificados como color de TEXTO. El badge es
// un contorno (borde + texto en el color de estado sobre `superficie`), nunca
// un relleno — no hay un par de fondo sólido aprobado para `advertencia`.
const CLASES_POR_VARIANTE: Record<VarianteBadgeStock, string> = {
  advertencia: 'border-advertencia text-advertencia',
  peligro: 'border-peligro text-peligro',
};

/**
 * Alerta visual de stock (vencimiento próximo/vencido, stock bajo). El texto
 * SIEMPRE acompaña al color (docs/06-ui-ux.md §5: "nada comunicado solo por
 * color"), y el glifo decorativo (`aria-hidden`) es un refuerzo, no la única
 * señal.
 */
export function BadgeStock({ variante, children }: BadgeStockProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-superficie px-2 py-0.5 text-xs font-medium ${CLASES_POR_VARIANTE[variante]}`}
    >
      <span aria-hidden="true">⚠</span>
      {children}
    </span>
  );
}
