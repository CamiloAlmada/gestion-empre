import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { moneyDesdePesos, formatearMoney, type Money } from '@gestion/core';

export interface MoneyInputProps {
  label: string;
  value: Money | null;
  onChange: (valor: Money | null) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Acepta dígitos, un único separador decimal (`,` es-UY o `.` de teclado) y
 * hasta 2 decimales. Signo `-` opcional al frente (deltas/reversas).
 */
const PATRON_MONTO = /^-?\d+([.,]\d{1,2})?$/;

const MENSAJE_INVALIDO = 'Monto inválido. Escribí un número con hasta 2 decimales, ej: 1234,50.';

/** Quita el prefijo "$ " (y el "-$ " del caso negativo) de formatearMoney(). */
function textoSinPrefijo(m: Money): string {
  return formatearMoney(m).replace('$ ', '');
}

/**
 * Input de dinero. Muestra un prefijo `$` fijo y guarda internamente el texto
 * tal cual lo tipea el usuario (coma o punto decimal, tolerante).
 *
 * Decisión de parseo (documentada, ver docs de la tarea): un valor que no
 * matchea el formato (letras, más de 2 decimales, dos separadores, etc.) se
 * trata como error de validación — no se bloquea el tipeo caracter a
 * caracter. Se prefirió "marcar error" antes que "bloquear": es más
 * predecible (lo que el usuario ve es lo que tipeó), funciona igual con
 * pegado/IME, y evita sorpresas de inputs controlados que "no responden" al
 * tacleo en el mostrador.
 *
 * `onChange` se dispara en cada tipeo válido (parseo en vivo) y también al
 * vaciar el campo (`null`). El re-formateo con separador de miles y 2
 * decimales fijos ocurre recién en `blur`, para no interrumpir el tipeo.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  error,
  disabled = false,
  placeholder,
}: MoneyInputProps) {
  const id = useId();
  const errorId = useId();
  const enfocadoRef = useRef(false);

  const [texto, setTexto] = useState<string>(() => (value === null ? '' : textoSinPrefijo(value)));
  const [invalido, setInvalido] = useState(false);

  useEffect(() => {
    if (enfocadoRef.current) return;
    setTexto(value === null ? '' : textoSinPrefijo(value));
    setInvalido(false);
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const nuevo = e.target.value;
    setTexto(nuevo);

    if (nuevo.trim() === '') {
      setInvalido(false);
      onChange(null);
      return;
    }

    if (PATRON_MONTO.test(nuevo)) {
      setInvalido(false);
      onChange(moneyDesdePesos(parseFloat(nuevo.replace(',', '.'))));
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
    if (PATRON_MONTO.test(texto)) {
      const valor = moneyDesdePesos(parseFloat(texto.replace(',', '.')));
      setTexto(textoSinPrefijo(valor));
      setInvalido(false);
    } else {
      setInvalido(true);
    }
  }

  const mensajeError = error ?? (invalido ? MENSAJE_INVALIDO : undefined);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {label}
      </label>
      <div
        className={`flex items-center gap-1 rounded-lg border px-3 py-2 focus-within:ring-2 focus-within:ring-primary-600 ${
          mensajeError ? 'border-peligro' : 'border-borde'
        } ${disabled ? 'bg-fondo' : 'bg-superficie'}`}
      >
        <span className="select-none text-texto-secundario" aria-hidden="true">
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={mensajeError !== undefined ? true : undefined}
          aria-describedby={mensajeError !== undefined ? errorId : undefined}
          className="w-full flex-1 bg-transparent text-texto tabular-nums outline-none disabled:text-texto-secundario"
        />
      </div>
      {mensajeError !== undefined && (
        <p id={errorId} className="text-sm text-peligro">
          {mensajeError}
        </p>
      )}
    </div>
  );
}
