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

const MENSAJE_INVALIDO = 'Monto inválido. Escribí un número con hasta 2 decimales, ej: 1234,50.';

/** Quita el prefijo "$ " (y el "-$ " del caso negativo) de formatearMoney(). */
function textoSinPrefijo(m: Money): string {
  return formatearMoney(m).replace('$ ', '');
}

/**
 * Interpreta el texto tal como lo tipea o pega el usuario y lo normaliza a un
 * string parseable por `parseFloat` (punto decimal, sin separador de miles),
 * o `null` si el formato es ambiguo/inválido.
 *
 * El punto es ambiguo en es-UY (miles) vs. tolerancia de teclado (decimal),
 * así que se resuelve con esta precedencia — clave para el ROUND-TRIP: lo
 * que `formatearMoney` imprime en el `blur` (con miles, ej. `"1.234,50"`)
 * tiene que volver a entrar acá y seguir siendo válido:
 *
 *   1. Si hay una coma: TODOS los `.` son separador de miles (se descartan)
 *      y la coma es el decimal.
 *        "1.234,50"     -> "1234.50"   (formato de display, con miles)
 *        "1234,50"      -> "1234.50"   (sin miles tipeados, también vale)
 *        "1.234.567,89" -> "1234567.89"
 *      Más de una coma es inválido: "1,2,3" -> null.
 *   2. Si NO hay coma y hay EXACTAMENTE UN punto seguido de 1 o 2 dígitos:
 *      ese punto es decimal (tolerancia de teclado).
 *        "1234.5" -> "1234.5"
 *   3. Si NO hay coma y hay DOS O MÁS puntos: son todos de miles.
 *        "1.234.567" -> "1234567"
 *   4. Cualquier otro caso con punto (ni 2 ni 3: ej. un solo punto seguido
 *      de 0 o ≥3 dígitos, como "1.2345" o "1.") es ambiguo -> inválido.
 *   5. Sin coma ni punto, el texto ya es el número tal cual (con signo
 *      opcional): "1234" -> "1234".
 *
 * El resultado final siempre se valida contra entero o decimal de hasta 2
 * dígitos antes de aceptarse (esto es lo que sigue limitando a 2 decimales,
 * incluso con miles: "1.234,567" -> null).
 */
function normalizarMonto(textoCrudo: string): string | null {
  const texto = textoCrudo.trim();
  if (texto === '') return null;

  const comas = (texto.match(/,/g) ?? []).length;
  if (comas > 1) return null;

  let normalizado: string;
  if (comas === 1) {
    normalizado = texto.replace(/\./g, '').replace(',', '.');
  } else {
    const puntos = (texto.match(/\./g) ?? []).length;
    if (puntos === 0) {
      normalizado = texto;
    } else if (puntos === 1) {
      const decimalConPunto = /^(-?\d+)\.(\d{1,2})$/.exec(texto);
      if (!decimalConPunto) return null;
      normalizado = `${decimalConPunto[1]}.${decimalConPunto[2]}`;
    } else {
      normalizado = texto.replace(/\./g, '');
    }
  }

  return /^-?\d+(\.\d{1,2})?$/.test(normalizado) ? normalizado : null;
}

/** Parsea el texto tipeado a `Money`, o `null` si no es válido. */
function intentarParsear(textoCrudo: string): Money | null {
  const normalizado = normalizarMonto(textoCrudo);
  if (normalizado === null) return null;
  return moneyDesdePesos(parseFloat(normalizado));
}

/**
 * Input de dinero. Muestra un prefijo `$` fijo y guarda internamente el texto
 * tal cual lo tipea el usuario (coma o punto decimal, tolerante, con o sin
 * separador de miles — ver `normalizarMonto`).
 *
 * Decisión de parseo (documentada, ver docs de la tarea): un valor que no
 * matchea ningún formato reconocido (letras, más de 2 decimales, dos comas,
 * un punto ambiguo, etc.) se trata como error de validación — no se bloquea
 * el tipeo caracter a caracter. Se prefirió "marcar error" antes que
 * "bloquear": es más predecible (lo que el usuario ve es lo que tipeó),
 * funciona igual con pegado/IME, y evita sorpresas de inputs controlados que
 * "no responden" al tacleo en el mostrador.
 *
 * `onChange` se dispara en cada tipeo válido (parseo en vivo) y también al
 * vaciar el campo (`null`). El re-formateo con separador de miles y 2
 * decimales fijos ocurre recién en `blur`, para no interrumpir el tipeo —
 * y ese mismo texto reformateado (con miles) tiene que poder volver a
 * validarse sin perder el valor al reenfocar/editar (round-trip).
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

    const valor = intentarParsear(nuevo);
    if (valor !== null) {
      setInvalido(false);
      onChange(valor);
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
    const valor = intentarParsear(texto);
    if (valor !== null) {
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
