import { useId, useMemo, type ChangeEvent } from 'react';
import { generarPaleta, serializarOklch } from '@gestion/core';

export interface SliderMatizProps {
  valor: number;
  onChange: (valor: number) => void;
}

/**
 * Partición del círculo de matices (0-359°) en 8 nombres de color legibles,
 * para `aria-valuetext`. Los límites NO son un estándar de colorimetría —
 * son una repartición razonable de 360° elegida a propósito para que los
 * presets de la propia app (`PRESETS_TEMA`, `@gestion/core`) caigan en el
 * bucket esperado, como sanity check: Crema (52) → Naranja, Miel (78) →
 * Ámbar, Oliva (130) → Verde, Pizarra (215) y Mar (245) → Azul, Lavanda
 * (300) → Violeta. Es texto informativo para lectores de pantalla, no un
 * cálculo perceptual exacto.
 */
const NOMBRES_MATIZ: readonly { readonly hasta: number; readonly nombre: string }[] = [
  { hasta: 20, nombre: 'Rojo' },
  { hasta: 60, nombre: 'Naranja' },
  { hasta: 90, nombre: 'Ámbar' },
  { hasta: 165, nombre: 'Verde' },
  { hasta: 195, nombre: 'Cian' },
  { hasta: 255, nombre: 'Azul' },
  { hasta: 320, nombre: 'Violeta' },
  { hasta: 345, nombre: 'Rosa' },
  { hasta: 360, nombre: 'Rojo' }, // cierra el círculo: 345-359 vuelve a Rojo.
];

/** Nombre legible del matiz (para `aria-valuetext`), ver `NOMBRES_MATIZ`. */
function nombreDeMatiz(matiz: number): string {
  const bucket = NOMBRES_MATIZ.find((b) => matiz < b.hasta);
  return bucket?.nombre ?? 'Rojo';
}

/** 13 stops (0°, 30°, ..., 360°) en `oklch(0.6 0.15 h)` — colores de marca
 * realistas (misma L/C que usa el ojo para "un color de marca saturado
 * medio"), NO un arcoíris HSL a full saturación. Constante: no depende de
 * `valor`, se computa una sola vez a nivel de módulo. El stop en 360°
 * repite el de 0° (mismo matiz) para que el degradé cierre sin costura al
 * recorrer el círculo completo. */
const GRADIENTE_MATIZ = (() => {
  const stops: string[] = [];
  for (let h = 0; h <= 360; h += 30) {
    const porcentaje = (h / 360) * 100;
    stops.push(`${serializarOklch(0.6, 0.15, h)} ${porcentaje}%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
})();

/**
 * Slider de matiz de marca (0-359°, grados enteros) del eje "Colores del
 * negocio" (docs/06-ui-ux.md §4). El track muestra el degradé completo de
 * matices posibles (`GRADIENTE_MATIZ`, constante) y, aparte, un swatch fijo
 * a la derecha con el color de marca RESULTANTE del `valor` actual.
 *
 * El swatch se calcula ACÁ (no se recibe por prop): representa
 * `primary-600` de `generarPaleta({ matiz: valor, tinte: 'neutro' })`. El
 * `tinte` elegido es indiferente para este cálculo — la escala `primary`
 * del motor depende SOLO del matiz (ver `RECETAS`/`Y_ANCLA_PRIMARY` en
 * `packages/core/src/paleta.ts`, que no leen `tema.tinte` para esa escala),
 * así que fijar `'neutro'` es una elección arbitraria sin efecto en el
 * resultado — y mantiene a este componente autocontenido, sin depender de
 * qué tinte esté eligiendo el usuario en paralelo en `SelectorTinte`.
 *
 * El `step={1}` del `<input type="range">` ya garantiza que `onChange`
 * reciba siempre un entero; no hace falta pasar por `normalizarTema` acá
 * (el consumidor normaliza al persistir).
 */
export function SliderMatiz({ valor, onChange }: SliderMatizProps) {
  const id = useId();

  const colorMarca = useMemo(
    () => generarPaleta({ version: 1, matiz: valor, tinte: 'neutro' }).variables['--color-primary-600'],
    [valor],
  );

  const nombre = nombreDeMatiz(valor);
  const valueText = `${nombre}, ${valor}°`;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(Number(e.target.value));
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-texto-secundario">
        Matiz de marca
      </label>
      <div className="flex items-center gap-3">
        <div className="relative flex h-11 flex-1 items-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full"
            style={{ background: GRADIENTE_MATIZ }}
          />
          <input
            id={id}
            type="range"
            min={0}
            max={359}
            step={1}
            value={valor}
            onChange={handleChange}
            aria-valuetext={valueText}
            className="relative z-10 h-11 w-full cursor-pointer appearance-none bg-transparent
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1 focus-visible:ring-offset-superficie
              [&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent
              [&::-moz-range-track]:h-11 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent
              [&::-webkit-slider-thumb]:h-11 [&::-webkit-slider-thumb]:w-11 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:[box-shadow:inset_0_0_0_11px_var(--color-primary-600),0_1px_3px_rgba(0,0,0,0.35)]
              [&::-moz-range-thumb]:h-11 [&::-moz-range-thumb]:w-11 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:[box-shadow:inset_0_0_0_11px_var(--color-primary-600),0_1px_3px_rgba(0,0,0,0.35)]"
          />
        </div>
        <div
          aria-hidden="true"
          className="h-11 w-11 shrink-0 rounded-full border border-borde"
          style={{ backgroundColor: colorMarca }}
        />
      </div>
    </div>
  );
}
