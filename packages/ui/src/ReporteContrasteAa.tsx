import type { Modo, ReporteContraste, ResultadoPar } from '@gestion/core';
import { DataTable, type ColumnaDataTable } from './DataTable';

export interface ReporteContrasteAaProps {
  reporte: ReporteContraste;
}

const NOMBRE_MODO: Record<Modo, string> = { light: 'Claro', dark: 'Oscuro' };

const COLUMNAS: ColumnaDataTable<ResultadoPar>[] = [
  { clave: 'uso', titulo: 'Uso', render: (r) => r.uso },
  { clave: 'modo', titulo: 'Modo', render: (r) => NOMBRE_MODO[r.modo] },
  { clave: 'ratio', titulo: 'Ratio', render: (r) => `${r.ratio.toFixed(2)}:1`, alinear: 'derecha' },
  { clave: 'umbral', titulo: 'Umbral', render: (r) => `${r.umbral}:1`, alinear: 'derecha' },
];

function filaCompacta(r: ResultadoPar) {
  return (
    <div className="flex flex-col gap-1 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-texto">{r.uso}</span>
        <span className="tabular-nums text-sm text-texto">{r.ratio.toFixed(2)}:1</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-texto-secundario">
        <span>{NOMBRE_MODO[r.modo]}</span>
        <span>umbral {r.umbral}:1</span>
      </div>
    </div>
  );
}

/**
 * Panel de transparencia "Contraste verificado (AA)" (docs/06-ui-ux.md §4):
 * el motor `generarPaleta` GARANTIZA AA por construcción (ver
 * `packages/core/src/paleta.ts`) — por eso esta línea es siempre de éxito,
 * nunca hay un estado de fallo que mostrar acá. No es un gate ("¿pasa o no
 * pasa?"), es transparencia ("mirá los números"): el detalle vive plegado
 * en un `<details>` para no ensuciar la pantalla por default.
 *
 * El detalle usa `DataTable` con `filaCompacta` (mismo componente y patrón
 * que el resto de la app, docs §3 "Tablas en mobile: sin scroll
 * horizontal") en vez de una tabla ad-hoc.
 */
export function ReporteContrasteAa({ reporte }: ReporteContrasteAaProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm font-medium text-exito">
        <span aria-hidden="true">✓</span>
        Contraste verificado: todos los pares cumplen AA
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-texto-secundario">Ver detalle</summary>
        <div className="mt-3">
          <DataTable
            columnas={COLUMNAS}
            filas={[...reporte.resultados]}
            claveFila={(r) => r.id}
            etiqueta="Detalle de contraste AA"
            filaCompacta={filaCompacta}
          />
        </div>
      </details>
    </div>
  );
}
