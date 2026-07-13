export type VarianteBadgeStock = 'advertencia' | 'peligro' | 'neutral';

export interface BadgeStockProps {
  variante: VarianteBadgeStock;
  children: string;
}

// Pares de contraste aprobados (docs/06-ui-ux.md §7): `advertencia`/superficie
// y `peligro`/superficie, ambos verificados como color de TEXTO. El badge es
// un contorno (borde + texto en el color de estado sobre `superficie`), nunca
// un relleno — no hay un par de fondo sólido aprobado para `advertencia`.
// `neutral` (UI-5, fusión Stock+Catálogo): estado informativo ("Inactivo"),
// no una alerta — mismo par `borde`/`texto-secundario` que ya usaba el badge
// suelto de "Inactivo" en `ListaClientes` (espejo explícito del criterio de
// dados de baja en Clientes, docs/06-ui-ux.md §2).
const CLASES_POR_VARIANTE: Record<VarianteBadgeStock, string> = {
  advertencia: 'border-advertencia text-advertencia',
  peligro: 'border-peligro text-peligro',
  neutral: 'border-borde text-texto-secundario',
};

/**
 * Alerta visual de stock (vencimiento próximo/vencido, stock bajo) o estado
 * informativo (`neutral`, p. ej. "Inactivo"). El texto SIEMPRE acompaña al
 * color (docs/06-ui-ux.md §5: "nada comunicado solo por color"); el glifo
 * decorativo ⚠ (`aria-hidden`) refuerza las variantes de ALERTA (`advertencia`/
 * `peligro`) pero se omite en `neutral` — mostrarlo ahí comunicaría una
 * urgencia que un estado meramente informativo no tiene.
 */
export function BadgeStock({ variante, children }: BadgeStockProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-superficie px-2 py-0.5 text-xs font-medium ${CLASES_POR_VARIANTE[variante]}`}
    >
      {variante !== 'neutral' && <span aria-hidden="true">⚠</span>}
      {children}
    </span>
  );
}
