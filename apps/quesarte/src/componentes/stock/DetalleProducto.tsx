import { formatearPeso, type MovimientoStock, type Pieza, type Producto } from '@gestion/core';
import type { EstadoCollection } from '@gestion/firebase-kit';
import { Button, DataTable, type ColumnaDataTable } from '@gestion/ui';
import { BadgeStock } from './BadgeStock';
import {
  estadoVencimiento,
  etiquetaTipoMovimiento,
  formatearDeltaMovimiento,
  formatearFecha,
  textoResumen,
  type ResumenStock,
} from './resumen';

export interface DetalleProductoProps {
  producto: Producto;
  /** Piezas disponibles de ESTE producto (ya filtradas por el llamador). */
  piezasDelProducto: Pieza[];
  resumen: ResumenStock;
  /** Últimos movimientos del producto. Solo se usa (y solo se pide arriba) para granel/unidad_simple. */
  estadoMovimientos: EstadoCollection<MovimientoStock>;
  esAdmin: boolean;
  onVolver: () => void;
  onIngresarPiezas: () => void;
  onSumarStock: () => void;
  onAjustarProducto: () => void;
  onAjustarPieza: (pieza: Pieza) => void;
}

// min-h-[44px]: target táctil mínimo (docs/06-ui-ux.md §5), aunque la celda
// de DataTable ya suma su propio padding alrededor.
const CLASE_BOTON_FILA =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-borde px-3 text-sm font-medium text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

/**
 * Detalle de stock de UN producto, mostrado en la misma pantalla (sin ruta
 * nueva) al tocar una fila de la lista maestra. Por pieza: tabla de piezas
 * con peso/ingreso/vencimiento. Granel/unidad: total + últimas existencias
 * (movimientos). Acciones de escritura solo para admin.
 */
export function DetalleProducto({
  producto,
  piezasDelProducto,
  resumen,
  estadoMovimientos,
  esAdmin,
  onVolver,
  onIngresarPiezas,
  onSumarStock,
  onAjustarProducto,
  onAjustarPieza,
}: DetalleProductoProps) {
  const esPorPieza = resumen.tipo === 'piezas';

  const columnasPiezas: ColumnaDataTable<Pieza>[] = [
    {
      clave: 'restante',
      titulo: 'Peso restante',
      render: (p) => formatearPeso(p.pesoRestanteGramos),
      alinear: 'derecha',
    },
    {
      clave: 'inicial',
      titulo: 'Peso inicial',
      render: (p) => formatearPeso(p.pesoInicialGramos),
      alinear: 'derecha',
    },
    { clave: 'ingreso', titulo: 'Ingreso', render: (p) => formatearFecha(p.fechaIngreso) },
    {
      clave: 'vencimiento',
      titulo: 'Vencimiento',
      render: (p) => {
        if (p.fechaVencimiento === undefined) return '—';
        const estado = estadoVencimiento(p.fechaVencimiento);
        return (
          <span className="flex flex-wrap items-center gap-2">
            {formatearFecha(p.fechaVencimiento)}
            {estado === 'vencida' && <BadgeStock variante="peligro">Vencida</BadgeStock>}
            {estado === 'vence_pronto' && <BadgeStock variante="advertencia">Vence pronto</BadgeStock>}
          </span>
        );
      },
    },
    ...(esAdmin
      ? [
          {
            clave: 'acciones',
            titulo: 'Acciones',
            render: (p: Pieza) => (
              <button
                type="button"
                onClick={() => onAjustarPieza(p)}
                aria-label={`Ajustar pieza de ${formatearPeso(p.pesoRestanteGramos)} restantes`}
                className={CLASE_BOTON_FILA}
              >
                Ajustar
              </button>
            ),
          } satisfies ColumnaDataTable<Pieza>,
        ]
      : []),
  ];

  const columnasMovimientos: ColumnaDataTable<MovimientoStock>[] = [
    { clave: 'fecha', titulo: 'Fecha', render: (m) => formatearFecha(m.fecha) },
    { clave: 'tipo', titulo: 'Tipo', render: (m) => etiquetaTipoMovimiento(m.tipo) },
    { clave: 'delta', titulo: 'Cantidad', render: (m) => formatearDeltaMovimiento(m), alinear: 'derecha' },
    { clave: 'nota', titulo: 'Motivo', render: (m) => m.nota ?? '—' },
  ];

  // Ambas tablas de acá tienen 4-5 columnas con contenido que no es corto
  // (nombres de fecha, motivos libres, badges de vencimiento) — desbordan en
  // 360px, modo compacto obligatorio (docs/06-ui-ux.md §3).

  /**
   * Fila compacta de una pieza: peso restante/inicial arriba, ingreso y
   * vencimiento (con badge si aplica) abajo. Para admin, toda la fila es
   * tappable y dispara el mismo handler que el botón "Ajustar" de la tabla
   * (`onAjustarPieza`), con el mismo `aria-label` descriptivo.
   */
  function filaCompactaPieza(p: Pieza) {
    const estado = estadoVencimiento(p.fechaVencimiento);
    const contenido = (
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="tabular-nums font-medium text-texto">
            {formatearPeso(p.pesoRestanteGramos)} restantes
          </span>
          <span className="tabular-nums text-sm text-texto-secundario">
            de {formatearPeso(p.pesoInicialGramos)}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-texto-secundario">
          <span>Ingreso: {formatearFecha(p.fechaIngreso)}</span>
          <span className="flex flex-wrap items-center gap-2">
            {p.fechaVencimiento === undefined ? '—' : formatearFecha(p.fechaVencimiento)}
            {estado === 'vencida' && <BadgeStock variante="peligro">Vencida</BadgeStock>}
            {estado === 'vence_pronto' && <BadgeStock variante="advertencia">Vence pronto</BadgeStock>}
          </span>
        </div>
      </div>
    );

    if (!esAdmin) {
      return <div className="flex min-h-[56px] flex-col justify-center gap-1 p-4">{contenido}</div>;
    }

    return (
      <button
        type="button"
        onClick={() => onAjustarPieza(p)}
        aria-label={`Ajustar pieza de ${formatearPeso(p.pesoRestanteGramos)} restantes`}
        className="flex min-h-[56px] w-full items-center gap-2 p-4 text-left transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        {contenido}
        <span aria-hidden="true" className="text-texto-secundario">
          ›
        </span>
      </button>
    );
  }

  /** Fila compacta de un movimiento: tipo + cantidad arriba, fecha y motivo
   * (si hay) abajo. Sin acción — el historial de existencias es solo lectura. */
  function filaCompactaMovimiento(m: MovimientoStock) {
    return (
      <div className="flex min-h-[56px] flex-col gap-1 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-texto">{etiquetaTipoMovimiento(m.tipo)}</span>
          <span className="tabular-nums font-semibold text-texto">{formatearDeltaMovimiento(m)}</span>
        </div>
        <p className="text-sm text-texto-secundario">{formatearFecha(m.fecha)}</p>
        {m.nota !== undefined && <p className="text-sm text-texto-secundario">{m.nota}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onVolver}
        className="flex min-h-[44px] w-fit items-center gap-1 rounded text-sm font-medium text-texto-secundario hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        <span aria-hidden="true">‹</span> Volver a Stock
      </button>

      <div>
        <h2 className="text-xl font-bold text-texto">{producto.nombre}</h2>
        <p className="text-texto-secundario">{textoResumen(resumen)}</p>
      </div>

      {esAdmin && (
        <div className="flex flex-wrap gap-2">
          {esPorPieza ? (
            <Button onClick={onIngresarPiezas}>Ingresar piezas</Button>
          ) : (
            <>
              <Button onClick={onSumarStock}>Sumar stock</Button>
              <Button variante="secundaria" onClick={onAjustarProducto}>
                Ajuste / merma
              </Button>
            </>
          )}
        </div>
      )}

      {esPorPieza ? (
        <DataTable
          columnas={columnasPiezas}
          filas={piezasDelProducto}
          claveFila={(p) => p.id}
          etiqueta={`Piezas de ${producto.nombre}`}
          filaCompacta={filaCompactaPieza}
          vacio="No hay piezas disponibles de este producto."
        />
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-texto">Últimas existencias</h3>
          {estadoMovimientos.cargando ? (
            <p className="text-texto-secundario">Cargando…</p>
          ) : estadoMovimientos.error !== null ? (
            <p role="alert" className="text-peligro">
              No se pudo cargar el historial de movimientos.
            </p>
          ) : (
            <DataTable
              columnas={columnasMovimientos}
              filas={estadoMovimientos.datos}
              claveFila={(m) => m.id}
              etiqueta={`Últimas existencias de ${producto.nombre}`}
              filaCompacta={filaCompactaMovimiento}
              vacio="Todavía no hay movimientos registrados."
            />
          )}
        </div>
      )}
    </div>
  );
}
