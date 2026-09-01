import { useId } from 'react';

/** Opción de un `Select`: valor de dominio (string) + etiqueta visible. */
export interface OpcionSelect {
  valor: string;
  etiqueta: string;
}

export interface SelectProps {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  opciones: OpcionSelect[];
  disabled?: boolean;
  error?: string;
}

/**
 * `<select>` nativo mínimo, mismos tokens/estructura que `Input.tsx`
 * (label + `useId` + mensaje de error accesible). Deliberadamente NO es
 * `SearchSelect` (combobox bufferizado, pensado para listas largas con
 * búsqueda): acá la lista es corta y fija, y el `<select>` nativo da mejor UX
 * en mobile (picker nativo del sistema) sin el costo de manejar `key` para
 * resetear buffer dentro de un `Modal`.
 */
export function Select({ label, value, onChange, opciones, disabled = false, error }: SelectProps) {
  const id = useId();
  const idError = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={error !== undefined ? idError : undefined}
        className={`rounded-control border bg-superficie px-3 py-2 text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:bg-fondo disabled:text-texto-secundario ${
          error ? 'border-peligro' : 'border-borde'
        }`}
      >
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
      </select>
      {error !== undefined && <p id={idError} className="text-sm text-peligro">{error}</p>}
    </div>
  );
}
