import type { ReactNode } from 'react';

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variante?: 'primaria' | 'secundaria' | 'peligro';
  disabled?: boolean;
  className?: string;
}

const clasesPorVariante: Record<NonNullable<ButtonProps['variante']>, string> = {
  primaria: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  secundaria:
    'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400',
  peligro: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
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
      className={`rounded-lg px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed ${clasesPorVariante[variante]} ${className}`}
    >
      {children}
    </button>
  );
}
