import type { ReactNode } from 'react';

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variante?: 'primaria' | 'secundaria' | 'peligro';
  disabled?: boolean;
  className?: string;
}

const clasesPorVariante: Record<NonNullable<ButtonProps['variante']>, string> = {
  primaria: 'bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-300',
  secundaria:
    'bg-superficie text-texto border border-borde hover:bg-fondo disabled:text-texto-secundario',
  // dark:text-fondo: en dark "peligro" se aclara para poder leerse; el
  // texto vuelve a ser oscuro (fondo dark = casi negro) en vez de blanco.
  // Ver docs/06-ui-ux.md §7 (pares peligro/superficie y fondo/peligro).
  peligro: 'bg-peligro text-white dark:text-fondo hover:opacity-90 disabled:opacity-40',
};

export function Button({
  children,
  onClick,
  variante = 'primaria',
  disabled = false,
  className = '',
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie ${clasesPorVariante[variante]} ${className}`}
    >
      {children}
    </button>
  );
}
