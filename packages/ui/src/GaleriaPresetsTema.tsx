import { useMemo } from 'react';
import { generarPaleta, PRESETS_TEMA, type PresetTema, type TemaPersonalizado, type TokensGenerados } from '@gestion/core';

export interface GaleriaPresetsTemaProps {
  temaActivo: TemaPersonalizado | null;
  modo: 'light' | 'dark';
  onElegir: (tema: TemaPersonalizado) => void;
}

/** `generarPaleta` es pura y determinista (docs/06-ui-ux.md §4): los 6
 * presets de `PRESETS_TEMA` NUNCA cambian en runtime, así que sus paletas se
 * calculan UNA sola vez a nivel de módulo — la memoización más fuerte
 * posible ("memoizá por preset", spec de la tarea), sin depender de props ni
 * de renders de ningún componente. */
const PALETAS_PRESETS: readonly { readonly preset: PresetTema; readonly tokens: TokensGenerados }[] =
  PRESETS_TEMA.map((preset) => ({ preset, tokens: generarPaleta(preset.tema) }));

/** ¿Es exactamente el mismo par (matiz, tinte)? El contrato de la galería
 * (docs §4) es que un preset ES ese par — no se compara `version` (siempre
 * 1 hoy) ni identidad de objeto. */
function coincideConPreset(temaActivo: TemaPersonalizado, preset: PresetTema): boolean {
  return temaActivo.matiz === preset.tema.matiz && temaActivo.tinte === preset.tema.tinte;
}

interface SwatchProps {
  color: string;
}

function Swatch({ color }: SwatchProps) {
  return (
    <span
      aria-hidden="true"
      className="h-6 w-6 shrink-0 rounded-full border border-white/60 shadow-sm"
      style={{ backgroundColor: color }}
    />
  );
}

interface CardPresetProps {
  preset: PresetTema;
  tokens: TokensGenerados;
  modo: 'light' | 'dark';
  activo: boolean;
  onElegir: (tema: TemaPersonalizado) => void;
}

function CardPreset({ preset, tokens, modo, activo, onElegir }: CardPresetProps) {
  const v = tokens.variables;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      onClick={() => onElegir(preset.tema)}
      className={`flex min-h-[44px] flex-col items-center gap-3 rounded-card border p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1 focus-visible:ring-offset-fondo ${
        activo ? 'border-primary-600 bg-superficie ring-2 ring-primary-600' : 'border-borde bg-superficie'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-texto">{preset.nombre}</span>
        {activo && (
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-4 w-4 shrink-0 fill-primary-600"
          >
            <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.6 3.6 6.7-6.7a1 1 0 0 1 1.4 0Z" />
          </svg>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Swatch color={v[`--fondo-${modo}`]} />
        <Swatch color={v[`--superficie-${modo}`]} />
        <Swatch color={v['--color-primary-600']} />
        <Swatch color={v['--color-primary-300']} />
      </div>
    </button>
  );
}

/**
 * Galería de presets de "Colores del negocio" (docs/06-ui-ux.md §4): grid de
 * cards, cada una con nombre + 4 swatches reales (fondo, superficie,
 * primary-600, primary-300) del preset renderizados según `modo` — la
 * garantía de AA del motor hace que estos colores sean seguros para
 * cualquier combinación, así que se muestran tal cual salen de
 * `generarPaleta`, sin ajuste visual adicional.
 *
 * Semántica `role="radiogroup"`/`role="radio"`: es una selección única de
 * "cuál preset está elegido", no una lista de botones independientes. La
 * card activa es la que coincide EXACTAMENTE en (matiz, tinte) con
 * `temaActivo`; si el usuario ajustó el slider/selector a mano y el tema
 * resultante no coincide con ningún preset, ninguna card queda marcada y se
 * muestra el chip "Personalizado" — un estado informativo, no una opción
 * más del grupo (por eso vive FUERA del `radiogroup`).
 */
export function GaleriaPresetsTema({ temaActivo, modo, onElegir }: GaleriaPresetsTemaProps) {
  const esPersonalizado = useMemo(
    () => temaActivo !== null && !PALETAS_PRESETS.some(({ preset }) => coincideConPreset(temaActivo, preset)),
    [temaActivo],
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="Preset de colores"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      >
        {PALETAS_PRESETS.map(({ preset, tokens }) => (
          <CardPreset
            key={preset.id}
            preset={preset}
            tokens={tokens}
            modo={modo}
            activo={temaActivo !== null && coincideConPreset(temaActivo, preset)}
            onElegir={onElegir}
          />
        ))}
      </div>
      {esPersonalizado && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-borde bg-superficie px-3 py-1 text-sm font-medium text-texto-secundario">
          Personalizado
        </span>
      )}
    </div>
  );
}
