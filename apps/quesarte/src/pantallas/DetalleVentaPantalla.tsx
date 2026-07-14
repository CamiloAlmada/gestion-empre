import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { doc } from 'firebase/firestore';
import type { Venta } from '@gestion/core';
import { useAuth, useDoc, useOnlineStatus, ventaConverter } from '@gestion/firebase-kit';
import { Button } from '@gestion/ui';
import { db } from '../firebase';
import { DetalleVenta } from '../componentes/historial/DetalleVenta';
import { ModalConfirmarAnulacion } from '../componentes/historial/ModalConfirmarAnulacion';
import { useHeader } from '../componentes/header/ContextoHeader';

/**
 * Detalle de UNA venta, en su propia ruta (`/historial/venta/:id`, ver
 * App.tsx) — tanda NAV-2a, docs/06-ui-ux.md §2, 2026-07-14. Antes vivía como
 * estado interno de `Historial.tsx` (`ventaSeleccionadaId`), herencia
 * pre-SH-1 que violaba la regla de subvistas con contenido propio en rutas
 * reales (mismo motivo que movió el detalle de producto en SH-1,
 * `DetalleProductoPantalla.tsx` es el modelo seguido acá).
 *
 * Decisión de query (reportada al tech lead): a diferencia de
 * `DetalleProductoPantalla` (que reusa la única query de lista de
 * `Productos.tsx`, sin paginar), la de `Historial.tsx` SÍ está acotada
 * (`limit(limiteVentas)`, "Cargar más" la agranda) — una venta vieja
 * linkeada desde la ficha de un cliente (NAV-2b, cuya query trae TODO el
 * historial del cliente sin límite) podría no estar dentro de esa ventana.
 * Por eso esta pantalla NO busca la venta client-side sobre la lista de
 * Historial: se suscribe al documento puntual con `useDoc` (mismo patrón que
 * `DetalleClientePantalla`, que tampoco tiene una lista ya cargada en
 * memoria que reusar).
 *
 * El título del header es "Venta #N" y el volver cae a `/historial`
 * (fallback: con NAV-2c el `‹` real intenta `navigate(-1)` primero — si se
 * llegó desde la ficha de un cliente, vuelve ahí; el fallback a `/historial`
 * solo aplica a entrada directa por URL/deep link). El tab activo queda en
 * Venta sin cambios en `Shell.tsx`: `obtenerTabActiva` lee el PRIMER
 * segmento de la ruta (`historial`), que ya mapea a `venta` en
 * `TAB_POR_SEGMENTO` — esta ruta anida bajo `/historial/...` a propósito
 * para heredar ese mapeo sin tocarlo.
 *
 * El modal de confirmación de anulación (antes orquestado por `Historial.tsx`
 * junto al detalle embebido) se muda acá con la misma mecánica: se abre desde
 * `DetalleVenta` (`onAnular`) y esta pantalla lo monta — cero cambios en la
 * lógica de anulación (`anularVenta` sigue viviendo en `@gestion/firebase-kit`).
 */
export function DetalleVentaPantalla() {
  const { id } = useParams<{ id: string }>();
  const { perfil } = useAuth();
  const esAdmin = perfil?.rol === 'admin';
  const enLinea = useOnlineStatus();
  const navigate = useNavigate();

  const [intento, setIntento] = useState(0);
  const [modalAnularAbierto, setModalAnularAbierto] = useState(false);

  const ventaRef = useMemo(
    () => (id !== undefined ? doc(db, 'ventas', id).withConverter(ventaConverter) : null),
    [id, intento],
  );
  const venta = useDoc<Venta>(ventaRef);

  const cargando = venta.cargando;
  const noEncontrada = !cargando && venta.error === null && venta.datos === null;

  const tituloHeader = cargando
    ? 'Venta'
    : venta.datos !== null
      ? `Venta #${venta.datos.numero}`
      : 'Venta no encontrada';

  useHeader({
    titulo: tituloHeader,
    volverA: { etiqueta: 'Historial', a: '/historial' },
  });

  function reintentar() {
    setIntento((n) => n + 1);
  }

  if (cargando) {
    return <p className="py-8 text-center text-texto-secundario">Cargando venta…</p>;
  }

  if (venta.error !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar la venta. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  }

  if (noEncontrada || venta.datos === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No encontramos esa venta.
        </p>
        <Link
          to="/historial"
          className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
        >
          Volver a Historial
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DetalleVenta
        venta={venta.datos}
        esAdmin={esAdmin}
        db={db}
        onVolver={() => navigate('/historial')}
        onAnular={() => setModalAnularAbierto(true)}
      />

      {esAdmin && perfil !== null && (
        <ModalConfirmarAnulacion
          abierto={modalAnularAbierto}
          onCerrar={() => setModalAnularAbierto(false)}
          db={db}
          venta={venta.datos}
          usuarioId={perfil.uid}
          enLinea={enLinea}
        />
      )}
    </div>
  );
}
