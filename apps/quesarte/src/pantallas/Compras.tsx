import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { collection, orderBy, query } from 'firebase/firestore';
import { formatearMoney, type Compra } from '@gestion/core';
import { compraConverter, useCollection } from '@gestion/firebase-kit';
import { Button, Chip } from '@gestion/ui';
import { db } from '../firebase';
import { formatearFecha } from '../componentes/stock/resumen';
import { BadgeEstadoCompra } from '../componentes/compras/BadgeEstadoCompra';
import { useHeader } from '../componentes/header/ContextoHeader';

const CLASE_ACCION_PRIMARIA =
  'inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-control bg-primary-600 px-3 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie';

interface FilaCompraProps {
  compra: Compra;
  onSeleccionar: () => void;
}

/** Una fila-botón táctil por compra (mismo patrón que `ListaVentas`/
 * `Proveedores.tsx`): sin la maquinaria de `DataTable` porque sus filas
 * navegan al tocarlas (el modo tabla de `DataTable` no es clickable) y
 * porque las compras, como los proveedores, son pocas — no hay columnas que
 * ganarse el lugar de una tabla real (docs/06-ui-ux.md §1). */
function FilaCompra({ compra, onSeleccionar }: FilaCompraProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onSeleccionar}
        className="flex min-h-[56px] w-full flex-col gap-1 rounded-elemento border border-borde bg-superficie p-4 text-left transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-texto">{compra.proveedorNombre}</span>
          <span className="tabular-nums font-semibold text-texto">{formatearMoney(compra.totalRealCents)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm text-texto-secundario">
          <span>{formatearFecha(compra.fecha)}</span>
          <BadgeEstadoCompra estado={compra.estado} />
        </div>
      </button>
    </li>
  );
}

/**
 * Listado de compras (F2-F1, doc 03): sección interna de Stock, solo admin.
 *
 * Decisión de query (reportada al tech lead): `orderBy('fecha', 'desc')`
 * simple, SIN filtrar por `estado` — el listado muestra borradores y
 * confirmadas juntos (con badge), porque "retomar un borrador" y "revisar el
 * historial" son el mismo lugar. El chip "Solo borradores" filtra
 * client-side (mismo patrón que "Mostrar inactivos" de Proveedores/Clientes).
 * Un `orderBy` de un solo campo no necesita índice compuesto, así que esta
 * pantalla NO consume el índice `compras (estado, fecha desc)` ya declarado
 * en `firestore.indexes.json` — queda sin consumidor por ahora, mismo caso
 * documentado que `proveedores (activo, nombre)` tras la tarea RE-1 (deuda
 * aceptada, no se borra desde acá). Si el volumen de compras creciera mucho
 * y la lista sin filtrar se volviera pesada, ese índice ya está listo para
 * una query `where('estado','==','borrador').orderBy('fecha','desc')`.
 */
export function Compras() {
  const navigate = useNavigate();

  const [soloBorradores, setSoloBorradores] = useState(false);
  const [intentoId, setIntentoId] = useState(0);

  useHeader({
    titulo: 'Compras',
    acciones: (
      <button
        type="button"
        onClick={() => navigate('/stock/compra/nueva')}
        aria-label="Nueva compra"
        className={CLASE_ACCION_PRIMARIA}
      >
        <span aria-hidden="true">＋</span>
        <span className="hidden md:inline">Nueva</span>
      </button>
    ),
  });

  const consultaCompras = useMemo(
    () => query(collection(db, 'compras').withConverter(compraConverter), orderBy('fecha', 'desc')),
    [intentoId],
  );
  const { datos: compras, cargando, error } = useCollection(consultaCompras);

  const comprasFiltradas = useMemo(
    () => (soloBorradores ? compras.filter((c) => c.estado === 'borrador') : compras),
    [compras, soloBorradores],
  );

  function reintentar() {
    setIntentoId((n) => n + 1);
  }

  let contenido;
  if (cargando) {
    contenido = <p className="py-8 text-center text-texto-secundario">Cargando compras…</p>;
  } else if (error !== null) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudieron cargar las compras. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  } else if (compras.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">No hay compras todavía.</p>
        <Button onClick={() => navigate('/stock/compra/nueva')}>Nueva compra</Button>
      </div>
    );
  } else if (comprasFiltradas.length === 0) {
    contenido = <p className="py-8 text-center text-texto-secundario">No hay borradores pendientes.</p>;
  } else {
    contenido = (
      <ul role="list" className="flex flex-col gap-2">
        {comprasFiltradas.map((compra) => (
          <FilaCompra key={compra.id} compra={compra} onSeleccionar={() => navigate(`/stock/compra/${compra.id}`)} />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Chip activo={soloBorradores} onClick={() => setSoloBorradores((v) => !v)}>
          Solo borradores
        </Chip>
      </div>

      {contenido}
    </div>
  );
}
