import { useId } from 'react';

export interface InputProps {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  type?: 'text' | 'email' | 'password' | 'number';
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  disabled = false,
}: InputProps) {
  const id = useId();
  const idError = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={error !== undefined ? idError : undefined}
        className={`rounded-lg border bg-superficie px-3 py-2 text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:bg-fondo disabled:text-texto-secundario ${
          error ? 'border-peligro' : 'border-borde'
        }`}
      />
      {error !== undefined && <p id={idError} className="text-sm text-peligro">{error}</p>}
    </div>
  );
}
