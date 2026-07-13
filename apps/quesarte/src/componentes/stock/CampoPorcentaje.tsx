import { useId } from 'react';

/**
 * Interpreta un porcentaje tipeado a mano (coma o punto decimal, hasta 2
 * decimales) a **bps enteros** (doc 03: `40` → `4000`, `33,33` → `3333`).
 * `null` si el texto no matchea el formato — mismo criterio de "marcar
 * error, no bloquear el tipeo" que `MoneyInput` (ver su JSDoc), pero sin la
 * tolerancia de separador de miles: un porcentaje de negocio no llega a esa
 * magnitud.
 */
export function normalizarPorcentaje(textoCrudo: string): number | null {
  const texto = textoCrudo.trim();
  if (texto === '') return null;
  const comas = (texto.match(/,/g) ?? []).length;
  if (comas > 1) return null;
  const normalizado = comas === 1 ? texto.replace(',', '.') : texto;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  return Math.round(parseFloat(normalizado) * 100);
}

/** bps → texto de porcentaje con 2 decimales fijos (`4000` → `"40,00"`),
 * simétrico de `normalizarPorcentaje` para el round-trip al reabrir un modal. */
export function textoPorcentajeDesdeBps(bps: number): string {
  return (bps / 100).toFixed(2).replace('.', ',');
}

/** bps → `"40,00 %"` para mostrar valores calculados (margen actual, markup,
 * margen efectivo). Conversión de display, a propósito fuera de `core` (doc
 * 03: "conversión SOLO en el borde de UI"; core solo expone bps enteros). */
export function formatearBps(bps: number): string {
  const signo = bps < 0 ? '-' : '';
  const abs = Math.abs(bps);
  return `${signo}${textoPorcentajeDesdeBps(abs)} %`;
}

export interface CampoPorcentajeProps {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Campo de porcentaje: mismo layout que `Input`/`MoneyInput` de `@gestion/ui`
 * (label + sufijo fijo + mensaje de error), pero para bps — no existe un
 * componente de `@gestion/ui` para esto (candidato a `PorcentajeInput`
 * anotado en docs/04-plan-fases.md, notas de Fase 2) y esta tarea tiene
 * alcance estricto (no tocar `packages/`), así que vive local a la app.
 * Compartido entre `ModalPrecio` (edición individual) y `ModalMargenMasivo`
 * (WA-H) para no triplicar el formateo de porcentaje/bps entre pantallas.
 */
export function CampoPorcentaje({ label, value, onChange, error, disabled, placeholder }: CampoPorcentajeProps) {
  const id = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {label}
      </label>
      <div
        className={`flex items-center gap-1 rounded-control border px-3 py-2 focus-within:ring-2 focus-within:ring-primary-600 ${
          error !== undefined ? 'border-peligro' : 'border-borde'
        } ${disabled === true ? 'bg-fondo' : 'bg-superficie'}`}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error !== undefined ? true : undefined}
          aria-describedby={error !== undefined ? errorId : undefined}
          className="w-full flex-1 bg-transparent text-texto tabular-nums outline-none disabled:text-texto-secundario"
        />
        <span className="select-none text-texto-secundario" aria-hidden="true">
          %
        </span>
      </div>
      {error !== undefined && (
        <p id={errorId} className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}
