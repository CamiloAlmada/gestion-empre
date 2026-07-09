import { useMemo, useState } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import type { Venta } from '@gestion/core';
import { useAuth, useCollection, useOnlineStatus, ventaConverter } from '@gestion/firebase-kit';
import { Button } from '@gestion/ui';
import { db } from '../firebase';
import { DetalleVenta } from '../componentes/historial/DetalleVenta';
import { ListaVentas } from '../componentes/historial/ListaVentas';
import { ModalConfirmarAnulacion } from '../componentes/historial/ModalConfirmarAnulacion';
import {
  INCREMENTO_LIMITE_VENTAS,
  LIMITE_INICIAL_VENTAS,
} from '../componentes/historial/constantes';
import { useHeader } from '../componentes/header/ContextoHeader';

/**
 * Pantalla Historial: listado de ventas (más recientes primero) con
 * drill-down a detalle en la misma pantalla (sin ruta nueva), mismo patrón
 * que `Stock.tsx`. Trae ventas con UNA sola `useCollection` memoizada
 * (`orderBy('fecha', 'desc')` + `limit`); "Cargar más" agranda el límite en
 * vez de paginar por cursor (ver `constantes.ts`, suficiente para Fase 1).
 * La anulación (solo admin) se dispara desde el detalle pero el modal de
 * confirmación se orquesta acá, igual que los modales de escritura de Stock.
 */
export function Historial() {
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();
  const esAdmin = perfil?.rol === 'admin';

  useHeader({ titulo: 'Historial' });

  const [intento, setIntento] = useState(0);
  const [limiteVentas, setLimiteVentas] = useState(LIMITE_INICIAL_VENTAS);
  const [ventaSeleccionadaId, setVentaSeleccionadaId] = useState<string | null>(null);
  const [modalAnularAbierto, setModalAnularAbierto] = useState(false);

  // `db` es el import estable de '../firebase'; las dependencias reales son
  // `limiteVentas` (Cargar más) e `intento` (Reintentar fuerza resubscribe,
  // ver el mismo patrón en Stock.tsx).
  const ventasQuery = useMemo(
    () =>
      query(
        collection(db, 'ventas').withConverter(ventaConverter),
        orderBy('fecha', 'desc'),
        limit(limiteVentas),
      ),
    [limiteVentas, intento],
  );
  const ventas = useCollection<Venta>(ventasQuery);

  const ventaSeleccionada = ventas.datos.find((v) => v.id === ventaSeleccionadaId) ?? null;

  function reintentar() {
    setIntento((n) => n + 1);
  }

  function cargarMas() {
    setLimiteVentas((l) => l + INCREMENTO_LIMITE_VENTAS);
  }

  function volverAlListado() {
    setVentaSeleccionadaId(null);
  }

  let contenido;
  if (ventas.cargando) {
    contenido = <p className="py-8 text-center text-texto-secundario">Cargando ventas…</p>;
  } else if (ventas.error !== null) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar el historial. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  } else if (ventaSeleccionada !== null) {
    contenido = (
      <DetalleVenta
        venta={ventaSeleccionada}
        esAdmin={esAdmin}
        db={db}
        onVolver={volverAlListado}
        onAnular={() => setModalAnularAbierto(true)}
      />
    );
  } else if (ventas.datos.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">Todavía no hay ventas.</p>
      </div>
    );
  } else {
    contenido = (
      <>
        <ListaVentas
          ventas={ventas.datos}
          onSeleccionar={(venta) => setVentaSeleccionadaId(venta.id)}
        />
        {ventas.datos.length >= limiteVentas && (
          <div className="flex justify-center pt-2">
            <Button variante="secundaria" onClick={cargarMas}>
              Cargar más
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {contenido}

      {esAdmin && perfil !== null && ventaSeleccionada !== null && (
        <ModalConfirmarAnulacion
          abierto={modalAnularAbierto}
          onCerrar={() => setModalAnularAbierto(false)}
          db={db}
          venta={ventaSeleccionada}
          usuarioId={perfil.uid}
          enLinea={enLinea}
        />
      )}
    </div>
  );
}
