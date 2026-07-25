import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { collection, orderBy, query, where } from 'firebase/firestore';
import { formatearMoney, type Compra } from '@gestion/core';
import { compraConverter, useCollection, useOnlineStatus } from '@gestion/firebase-kit';
import { Button } from '@gestion/ui';
import { db } from '../firebase';
import { useHeader } from '../componentes/header/ContextoHeader';
import { formatearFecha } from '../componentes/stock/resumen';

interface FilaCompraProps {
  compra: Compra;
  onSeleccionar: () => void;
}

/** Una fila-botón táctil por compra confirmada (mismo patrón que `FilaCompra`
 * de `Compras.tsx`: sin `DataTable` porque la fila entera navega al tocarla y
 * porque las compras son pocas — no hay columnas que ganarse el lugar de una
 * tabla real, docs/06-ui-ux.md §1). */
function FilaCompraRendimiento({ compra, onSeleccionar }: FilaCompraProps) {
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
        <span className="text-sm text-texto-secundario">{formatearFecha(compra.fecha)}</span>
      </button>
    </li>
  );
}

/**
 * Listado de compras CONFIRMADAS para entrar al rendimiento de cada viaje
 * (Fase 3, tanda B4, docs/PLAN-ACTIVO.md — criterio 2 del dueño, doc
 * 04:479: "puede ver si el último viaje a Colonia fue rentable"). Entrada
 * real desde la home de Reportes (`registro.ts`); el rendimiento de UNA
 * compra puntual también se puede abrir desde su detalle
 * (`CompraPantalla.tsx`, cuando está confirmada) — esta lista es el punto de
 * entrada genérico cuando Adrián no viene de una compra concreta.
 *
 * **Query**: `where('estado','==','confirmada').orderBy('fecha','desc')`
 * consume el índice `compras (estado, fecha desc)` que ya estaba declarado
 * en `firestore.indexes.json` desde F2-F1 pero sin consumidor (`Compras.tsx`
 * lista TODAS las compras sin filtrar estado, ver su JSDoc) — no hace falta
 * agregar un índice nuevo para esta tarea.
 *
 * El rendimiento en sí (ganancia generada, % vendido, etc.) NO se calcula
 * acá por fila: exigiría traer las ventas de cada compra individualmente
 * (N consultas). Esta lista solo repite los datos que la compra YA trae
 * (proveedor, fecha, costo total); el detalle (`RendimientoCompraPantalla`)
 * hace el cálculo real al abrir una compra puntual.
 */
export function RendimientoCompras() {
  const navigate = useNavigate();
  const enLinea = useOnlineStatus();

  useHeader({ titulo: 'Rendimiento de compras', volverA: { etiqueta: 'Reportes', a: '/reportes' } });

  const [intento, setIntento] = useState(0);

  const comprasQuery = useMemo(
    () =>
      query(
        collection(db, 'compras').withConverter(compraConverter),
        where('estado', '==', 'confirmada'),
        orderBy('fecha', 'desc'),
      ),
    [intento],
  );
  const { datos: compras, cargando, error } = useCollection(comprasQuery);

  function reintentar() {
    setIntento((n) => n + 1);
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
        <p className="text-texto-secundario">Todavía no hay compras confirmadas.</p>
      </div>
    );
  } else {
    contenido = (
      <ul role="list" className="flex flex-col gap-2">
        {compras.map((compra) => (
          <FilaCompraRendimiento
            key={compra.id}
            compra={compra}
            onSeleccionar={() => navigate(`/reportes/compras/${compra.id}`)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!enLinea && (
        <p
          role="status"
          className="rounded-elemento border border-borde bg-superficie p-3 text-sm text-advertencia"
        >
          <span aria-hidden="true">⚠</span> Sin conexión: se muestra lo guardado en este dispositivo.
          Puede faltar alguna compra confirmada desde otro dispositivo hasta reconectar.
        </p>
      )}
      {contenido}
    </div>
  );
}
