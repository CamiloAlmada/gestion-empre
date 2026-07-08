import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';

export interface CantidadInputProps {
  label: string;
  value: number | null;
  onChange: (valor: number | null) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

const PATRON_ENTERO_POSITIVO = /^\d+$/;
const MENSAJE_INVALIDO = 'Cantidad inválida. Escribí un número entero mayor a cero, ej: 3.';

/**
 * Input de cantidad entera positiva (unidades: frascos, paquetes), con el
 * mismo criterio de parseo/error que `MoneyInput`/`PesoInput` de
 * `@gestion/ui`: formato inválido se marca como error en vez de bloquear el
 * tipeo. No vive en `packages/ui` porque no hay otro consumidor todavía
 * (unidades enteras, sin magnitud de dominio propia como `Money`/`Peso`); si
 * otra pantalla lo necesita, se promueve.
 */
export function CantidadInput({
  label,
  value,
  onChange,
  error,
  disabled = false,
  placeholder,
}: CantidadInputProps) {
  const id = useId();
  const errorId = useId();
  const enfocadoRef = useRef(false);

  const [texto, setTexto] = useState<string>(() => (value === null ? '' : String(value)));
  const [invalido, setInvalido] = useState(false);

  useEffect(() => {
    if (enfocadoRef.current) return;
    setTexto(value === null ? '' : String(value));
    setInvalido(false);
  }, [value]);

  function esValido(candidato: string): boolean {
    return PATRON_ENTERO_POSITIVO.test(candidato) && Number(candidato) > 0;
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const nuevo = e.target.value;
    setTexto(nuevo);

    if (nuevo.trim() === '') {
      setInvalido(false);
      onChange(null);
      return;
    }

    if (esValido(nuevo)) {
      setInvalido(false);
      onChange(Number(nuevo));
    } else {
      setInvalido(true);
      onChange(null);
    }
  }

  function handleFocus() {
    enfocadoRef.current = true;
  }

  function handleBlur() {
    enfocadoRef.current = false;
    if (texto.trim() === '') {
      setInvalido(false);
      return;
    }
    setInvalido(!esValido(texto));
  }

  const mensajeError = error ?? (invalido ? MENSAJE_INVALIDO : undefined);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={texto}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder ?? '0'}
        disabled={disabled}
        aria-invalid={mensajeError !== undefined ? true : undefined}
        aria-describedby={mensajeError !== undefined ? errorId : undefined}
        className={`rounded-lg border bg-superficie px-3 py-2 text-texto tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:bg-fondo disabled:text-texto-secundario ${
          mensajeError ? 'border-peligro' : 'border-borde'
        }`}
      />
      {mensajeError !== undefined && (
        <p id={errorId} className="text-sm text-peligro">
          {mensajeError}
        </p>
      )}
    </div>
  );
}
