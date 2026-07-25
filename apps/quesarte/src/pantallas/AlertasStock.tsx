import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { AlertaVencimiento } from '@gestion/core';
import { useOnlineStatus } from '@gestion/firebase-kit';
import { Button } from '@gestion/ui';
import { BadgeStock } from '../componentes/stock/BadgeStock';
import { formatearFecha } from '../componentes/stock/resumen';
import {
  detalleStockBajo,
  detalleVencimiento,
  textoCantidadProductos,
  textoPlazo,
} from '../componentes/alertas/textosAlertas';
import { useAlertasStock } from '../componentes/alertas/useAlertasStock';
import { useHeader } from '../componentes/header/ContextoHeader';

const CLASE_FILA =
  'flex min-h-[56px] w-full flex-col gap-1 p-4 text-left transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

/**
 * Fila de un producto en alerta. Es un `Link` al detalle del producto
 * (`/stock/producto/:id`) porque ahí está TODO lo que se puede hacer con el
 * aviso: ver las piezas una por una, ajustar, dar de baja, mirar el historial.
 * Un reporte que no lleva a la acción es una lista de reproches.
 */
function FilaAlerta({
  productoId,
  nombre,
  detalle,
  badge,
}: {
  productoId: string;
  nombre: string;
  detalle: string;
  badge?: ReactNode;
}) {
  return (
    <li>
      <Link to={`/stock/producto/${productoId}`} className={CLASE_FILA}>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 font-medium text-texto">{nombre}</span>
          {badge}
        </div>
        <span className="text-sm text-texto-secundario">{detalle}</span>
      </Link>
    </li>
  );
}

/** Badge del vencimiento más urgente del producto: rojo si ya venció, ámbar si no. */
function BadgeVencimiento({ alerta }: { alerta: AlertaVencimiento }) {
  const texto = textoPlazo(alerta.diasRestantesMin);
  return alerta.peorEstado === 'vencida' ? (
    <BadgeStock variante="peligro">{texto}</BadgeStock>
  ) : (
    <BadgeStock variante="advertencia">{texto}</BadgeStock>
  );
}

/**
 * Detalle de UNA alerta de vencimiento: el producto, el plazo de la pieza más
 * urgente y —desplegado— la fecha y el peso de cada pieza en alerta. El peso
 * por pieza es lo que convierte el aviso en una decisión: "media horma de 2 kg
 * vence el viernes" se remata; "vencen 80 g" se tira sin pensarlo.
 */
function BloqueVencimiento({ alerta }: { alerta: AlertaVencimiento }) {
  return (
    <li className="flex flex-col">
      <Link to={`/stock/producto/${alerta.productoId}`} className={CLASE_FILA}>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 font-medium text-texto">{alerta.nombreProducto}</span>
          <BadgeVencimiento alerta={alerta} />
        </div>
        <span className="text-sm text-texto-secundario">{detalleVencimiento(alerta)}</span>
        <ul className="flex flex-col gap-0.5 pt-1">
          {alerta.piezas.map((p) => (
            <li key={p.pieza.id} className="text-xs text-texto-secundario">
              {p.pieza.fechaVencimiento !== undefined && formatearFecha(p.pieza.fechaVencimiento)} ·{' '}
              {textoPlazo(p.diasRestantes).toLowerCase()}
            </li>
          ))}
        </ul>
      </Link>
    </li>
  );
}

/**
 * Reporte de vencimientos y stock bajo (Fase 3, tarea B3,
 * `docs/PLAN-ACTIVO.md`), colgando de la home de Reportes en su ruta real
 * `/reportes/alertas` (docs/06-ui-ux.md §2: los drill-downs viven en rutas
 * reales para que el botón "atrás" del teléfono funcione siempre). Solo admin
 * llega acá (`RutaSoloAdmin` en `App.tsx`), igual que el resto de Reportes.
 *
 * **La decisión que habilita** (criterio 3 del dueño, `docs/04-plan-fases.md:480`):
 * una horma que está por vencer se remata o se promociona ANTES de perderla, y
 * un producto bajo el mínimo se anota para la próxima compra. Por eso cada fila
 * navega al detalle del producto —donde están las acciones— y por eso el
 * vencimiento muestra el peso: es lo que decide si vale la pena rematarlo.
 *
 * **Un solo cálculo, el mismo que Productos**: `useAlertasStock` →
 * `evaluarAlertas` (`packages/core`), con la ventana de días que el admin
 * configura en Ajustes. Esta pantalla no vuelve a decidir nada; solo ordena la
 * presentación y agrega el desglose por pieza que la franja de Productos no
 * tiene espacio para mostrar.
 *
 * **Sin nada que avisar es una buena noticia** (§1, "todo estado existe"): el
 * vacío afirma que está todo en orden y nombra la ventana con la que lo
 * afirma, en vez de dejar una pantalla muda que no distingue "no hay alertas"
 * de "no se calculó".
 *
 * Sin scroll horizontal en el teléfono (§3): son listas apiladas, no tablas —
 * cada fila es nombre + badge arriba y el detalle debajo.
 */
export function AlertasStock() {
  useHeader({ titulo: 'Alertas', volverA: { etiqueta: 'Reportes', a: '/reportes' } });
  const enLinea = useOnlineStatus();
  const { alertas, cargando, hayError, diasAviso, reintentar } = useAlertasStock();

  let contenido;
  if (cargando) {
    contenido = <p className="py-8 text-center text-texto-secundario">Revisando vencimientos y stock…</p>;
  } else if (hayError) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudieron cargar las alertas. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  } else if (alertas.porVencer.length === 0 && alertas.bajoUmbral.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-2 rounded-card border border-borde bg-superficie p-8 text-center">
        <span aria-hidden="true" className="text-2xl text-exito">
          ✓
        </span>
        <p className="font-medium text-exito">Todo en orden</p>
        <p className="text-sm text-texto-secundario">
          Nada vence en los próximos {diasAviso} días y ningún producto está bajo su mínimo.
        </p>
      </div>
    );
  } else {
    contenido = (
      <div className="flex flex-col gap-6">
        {alertas.porVencer.length > 0 && (
          <section aria-labelledby="titulo-por-vencer" className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5 px-1">
              <h2 id="titulo-por-vencer" className="text-base font-semibold text-texto">
                Por vencer
              </h2>
              <p className="text-sm text-texto-secundario">
                {textoCantidadProductos(alertas.porVencer.length)} con piezas vencidas o que vencen dentro
                de {diasAviso} días. Rematar o promocionar antes de perderlas.
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-borde rounded-card border border-borde bg-superficie">
              {alertas.porVencer.map((alerta) => (
                <BloqueVencimiento key={alerta.productoId} alerta={alerta} />
              ))}
            </ul>
          </section>
        )}

        {alertas.bajoUmbral.length > 0 && (
          <section aria-labelledby="titulo-bajo-minimo" className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5 px-1">
              <h2 id="titulo-bajo-minimo" className="text-base font-semibold text-texto">
                Bajo el mínimo
              </h2>
              <p className="text-sm text-texto-secundario">
                {textoCantidadProductos(alertas.bajoUmbral.length)} por debajo del umbral configurado en su
                ficha. Anotar para la próxima compra.
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-borde rounded-card border border-borde bg-superficie">
              {alertas.bajoUmbral.map((alerta) => (
                <FilaAlerta
                  key={alerta.productoId}
                  productoId={alerta.productoId}
                  nombre={alerta.nombreProducto}
                  detalle={detalleStockBajo(alerta)}
                  badge={<BadgeStock variante="advertencia">Stock bajo</BadgeStock>}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!enLinea && (
        <p
          role="status"
          className="rounded-elemento border border-borde bg-superficie p-3 text-sm text-advertencia"
        >
          <span aria-hidden="true">⚠</span> Sin conexión: se calcula con lo guardado en este dispositivo.
          Puede faltar lo que se movió desde otros dispositivos hasta reconectar.
        </p>
      )}
      {contenido}
    </div>
  );
}
