/**
 * STUBS TEMPORALES — tanda TM, TM-6.
 *
 * `GaleriaPresetsTema`, `SliderMatiz`, `SelectorTinte` y `ReporteContrasteAa`
 * los está construyendo la tarea PARALELA TM-5 en `packages/ui`, con el
 * contrato de props CONGELADO que replican los stubs de acá. No llegaron a
 * este worktree (worktrees aislados por tarea), así que `SeccionColoresNegocio`
 * los importa de ESTE archivo en vez de `@gestion/ui` para poder compilar y
 * correr su suite completa.
 *
 * TODO(merge TM-5): cuando se mergee la tanda TM y `@gestion/ui` exporte los
 * componentes reales con este mismo contrato, el tech lead:
 *   1. borra este archivo,
 *   2. en `SeccionColoresNegocio.tsx`, cambia el import de
 *      `'./stubsEditorTema'` a `'@gestion/ui'`,
 *   3. re-corre `pnpm turbo lint test build --filter=quesarte`.
 *
 * Implementación mínima pero funcional (no placeholders mudos): usan
 * `PRESETS_TEMA` real de `@gestion/core` y roles/ARIA consistentes con el
 * resto de la UI (mismo patrón `role="group"` + `aria-pressed` que
 * `SelectorTema`/`SelectorEstilo` en `Ajustes.tsx`), para que
 * `SeccionColoresNegocio.test.tsx` ejercite un flujo real y no un doble
 * vacío — y para que, si sobrevive algo de esta forma tras el merge, no sea
 * disparatado.
 */
import { PRESETS_TEMA, type ReporteContraste, type TemaPersonalizado, type TinteFondo } from '@gestion/core';

export interface GaleriaPresetsTemaProps {
  temaActivo: TemaPersonalizado | null;
  modo: 'light' | 'dark';
  onElegir: (tema: TemaPersonalizado) => void;
}

function mismoTema(a: TemaPersonalizado, b: TemaPersonalizado): boolean {
  return a.matiz === b.matiz && a.tinte === b.tinte;
}

export function GaleriaPresetsTema({ temaActivo, onElegir }: GaleriaPresetsTemaProps) {
  return (
    <div role="group" aria-label="Galería de presets" className="flex flex-wrap gap-2">
      {PRESETS_TEMA.map((preset) => {
        const activo = temaActivo !== null && mismoTema(temaActivo, preset.tema);
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={activo}
            onClick={() => onElegir(preset.tema)}
            className={`min-h-[44px] rounded-control border border-borde px-3 py-2 text-sm font-medium ${
              activo ? 'bg-primary-600 text-white' : 'text-texto-secundario hover:text-texto'
            }`}
          >
            {preset.nombre}
          </button>
        );
      })}
    </div>
  );
}

export interface SliderMatizProps {
  valor: number;
  onChange: (valor: number) => void;
}

export function SliderMatiz({ valor, onChange }: SliderMatizProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-texto-secundario">
      Matiz
      <input
        type="range"
        min={0}
        max={359}
        step={1}
        value={valor}
        onChange={(evento) => onChange(Number(evento.target.value))}
      />
    </label>
  );
}

const OPCIONES_TINTE: { valor: TinteFondo; etiqueta: string }[] = [
  { valor: 'neutro', etiqueta: 'Neutro' },
  { valor: 'calido', etiqueta: 'Cálido' },
  { valor: 'frio', etiqueta: 'Frío' },
];

export interface SelectorTinteProps {
  valor: TinteFondo;
  onChange: (valor: TinteFondo) => void;
}

export function SelectorTinte({ valor, onChange }: SelectorTinteProps) {
  return (
    <div
      role="group"
      aria-label="Tinte de fondo"
      className="flex gap-1 rounded-elemento border border-borde p-1"
    >
      {OPCIONES_TINTE.map((opcion) => {
        const activo = valor === opcion.valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activo}
            onClick={() => onChange(opcion.valor)}
            className={`min-h-[44px] flex-1 rounded-control px-3 py-2 text-sm font-medium ${
              activo ? 'bg-primary-600 text-white' : 'text-texto-secundario hover:text-texto'
            }`}
          >
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

export interface ReporteContrasteAaProps {
  reporte: ReporteContraste;
}

export function ReporteContrasteAa({ reporte }: ReporteContrasteAaProps) {
  return (
    <div className="text-sm text-texto-secundario">
      <p>
        Contraste verificado (AA):{' '}
        {reporte.todosPasan
          ? 'todos los pares cumplen.'
          : `${reporte.resultados.filter((r) => !r.pasa).length} par(es) no cumplen.`}
      </p>
    </div>
  );
}
