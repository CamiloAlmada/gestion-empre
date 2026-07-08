import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { peso, pesoDesdeKg, type Peso } from '@gestion/core';

export type UnidadPeso = 'g' | 'kg';

export interface PesoInputProps {
  label: string;
  value: Peso | null;
  onChange: (valor: Peso | null) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Unidad con la que arranca el toggle. Default: `'kg'`. */
  unidadInicial?: UnidadPeso;
}

/** En gramos solo se aceptan enteros (sin decimales). */
const PATRON_GRAMOS = /^-?\d+$/;
/** En kg se aceptan hasta 3 decimales (gramo exacto). */
const PATRON_KG = /^-?\d+([.,]\d{1,3})?$/;

const MENSAJE_INVALIDO_G = 'Peso inválido. Escribí un número entero de gramos, ej: 500.';
const MENSAJE_INVALIDO_KG = 'Peso inválido. Escribí un número con hasta 3 decimales, ej: 1,25.';

/**
 * Formatea un `Peso` (gramos) como texto forzado en la unidad pedida, para
 * repoblar el input al tipear o al cambiar de unidad. SOLO arma el string
 * mostrado — nunca reconstruye un `Peso`: eso siempre pasa por `peso()` /
 * `pesoDesdeKg()` en el parseo. `formatearPeso()` de core no sirve acá
 * porque elige la unidad automáticamente según la magnitud (g si <1000,
 * kg si no); este input necesita forzar la unidad activa del toggle. Nota
 * para el tech lead: si aparecen más casos así, valdría sumar un
 * `formatearPesoForzado(p, unidad)` a `packages/core`.
 */
function textoEnUnidad(p: Peso, unidad: UnidadPeso): string {
  if (unidad === 'g') return String(p);
  const signo = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  const kgEntero = Math.trunc(abs / 1000);
  const resto = abs % 1000;
  const decimales = resto.toString().padStart(3, '0').replace(/0+$/, '');
  return decimales.length > 0 ? `${signo}${kgEntero},${decimales}` : `${signo}${kgEntero}`;
}

/**
 * Input de peso con toggle explícito de unidad g|kg. Siempre emite `Peso` en
 * gramos por `onChange`, sin importar en qué unidad está tipeando el
 * usuario. Cambiar de unidad re-presenta el mismo valor (no lo pierde ni lo
 * dispara de nuevo por `onChange`, porque el valor subyacente no cambió).
 *
 * Mismo criterio de parseo que `MoneyInput`: formato inválido para la
 * unidad activa (decimales en gramos, más de 3 decimales en kg, texto no
 * numérico) se marca como error en vez de bloquear el tipeo.
 */
export function PesoInput({
  label,
  value,
  onChange,
  error,
  disabled = false,
  placeholder,
  unidadInicial = 'kg',
}: PesoInputProps) {
  const id = useId();
  const errorId = useId();
  const enfocadoRef = useRef(false);

  const [unidad, setUnidad] = useState<UnidadPeso>(unidadInicial);
  const [texto, setTexto] = useState<string>(() => (value === null ? '' : textoEnUnidad(value, unidad)));
  const [invalido, setInvalido] = useState(false);

  useEffect(() => {
    if (enfocadoRef.current) return;
    setTexto(value === null ? '' : textoEnUnidad(value, unidad));
    setInvalido(false);
    // Solo re-sincroniza por cambios externos de `value`; el toggle de
    // unidad se maneja aparte en cambiarUnidad() para no disparar dos veces.
  }, [value]);

  const patron = unidad === 'g' ? PATRON_GRAMOS : PATRON_KG;
  const mensajeInvalido = unidad === 'g' ? MENSAJE_INVALIDO_G : MENSAJE_INVALIDO_KG;

  function parsear(valorTexto: string): Peso {
    const normalizado = valorTexto.replace(',', '.');
    return unidad === 'g' ? peso(parseInt(normalizado, 10)) : pesoDesdeKg(parseFloat(normalizado));
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const nuevo = e.target.value;
    setTexto(nuevo);

    if (nuevo.trim() === '') {
      setInvalido(false);
      onChange(null);
      return;
    }

    if (patron.test(nuevo)) {
      setInvalido(false);
      onChange(parsear(nuevo));
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
    if (patron.test(texto)) {
      const valor = parsear(texto);
      setTexto(textoEnUnidad(valor, unidad));
      setInvalido(false);
    } else {
      setInvalido(true);
    }
  }

  function cambiarUnidad(nueva: UnidadPeso) {
    if (disabled || nueva === unidad) return;
    setUnidad(nueva);
    setInvalido(false);
    setTexto(value === null ? '' : textoEnUnidad(value, nueva));
  }

  const mensajeError = error ?? (invalido ? mensajeInvalido : undefined);

  const claseBoton = (activo: boolean) =>
    `min-h-[44px] min-w-[44px] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-50 ${
      activo ? 'bg-primary-600 text-white' : 'bg-superficie text-texto hover:bg-fondo'
    }`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-texto">
          {label}
        </label>
        <div
          role="group"
          aria-label={`Unidad de ${label}`}
          className="inline-flex overflow-hidden rounded-lg border border-borde"
        >
          <button
            type="button"
            aria-pressed={unidad === 'g'}
            disabled={disabled}
            onClick={() => cambiarUnidad('g')}
            className={claseBoton(unidad === 'g')}
          >
            g
          </button>
          <button
            type="button"
            aria-pressed={unidad === 'kg'}
            disabled={disabled}
            onClick={() => cambiarUnidad('kg')}
            className={`${claseBoton(unidad === 'kg')} border-l border-borde`}
          >
            kg
          </button>
        </div>
      </div>
      <div
        className={`flex items-center gap-1 rounded-lg border px-3 py-2 focus-within:ring-2 focus-within:ring-primary-600 ${
          mensajeError ? 'border-peligro' : 'border-borde'
        } ${disabled ? 'bg-fondo' : 'bg-superficie'}`}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder ?? (unidad === 'g' ? '0' : '0,000')}
          disabled={disabled}
          aria-invalid={mensajeError !== undefined ? true : undefined}
          aria-describedby={mensajeError !== undefined ? errorId : undefined}
          className="w-full flex-1 bg-transparent text-texto tabular-nums outline-none disabled:text-texto-secundario"
        />
        <span className="select-none text-texto-secundario" aria-hidden="true">
          {unidad}
        </span>
      </div>
      {mensajeError !== undefined && (
        <p id={errorId} className="text-sm text-peligro">
          {mensajeError}
        </p>
      )}
    </div>
  );
}
