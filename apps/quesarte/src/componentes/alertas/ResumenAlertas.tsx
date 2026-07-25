import { Link } from 'react-router';
import type { Alertas } from '@gestion/core';
import { Button } from '@gestion/ui';
import { loMasUrgente, titularAlertas } from './textosAlertas';

export interface ResumenAlertasProps {
  alertas: Alertas;
  cargando: boolean;
  /** `true` si falló alguna de las lecturas que alimentan las alertas. */
  hayError: boolean;
  onReintentar: () => void;
  /** Ventana de aviso vigente, para nombrarla en el estado "todo en orden". */
  diasAviso: number;
}

const CLASE_TARJETA =
  'flex items-center gap-3 rounded-card border border-borde bg-superficie p-4 text-left';

/**
 * Bloque de alertas de la home de Reportes (tarea B3, `docs/PLAN-ACTIVO.md`;
 * criterio 3 del dueño, `docs/04-plan-fases.md:480`).
 *
 * **Se ve sin navegar.** Es lo primero del contenido de Reportes: al abrir la
 * pantalla, si hay piezas por vencer o productos bajo el mínimo, el número
 * está ahí. Tocarlo lleva al detalle completo (`/reportes/alertas`, ruta real
 * — docs/06-ui-ux.md §2).
 *
 * **"No hay nada para avisar" es una BUENA NOTICIA, no una sección vacía.** Sin
 * alertas, esto no desaparece ni muestra un "—": afirma que está todo en orden
 * y dice contra qué ventana lo afirma ("nada vence en los próximos N días").
 * Un espacio vacío deja la duda de si el reporte se calculó; una afirmación
 * explícita la cierra. En ese estado la tarjeta NO es un link: no hay ningún
 * detalle que valga el viaje.
 *
 * Nada se comunica solo por color (docs/06-ui-ux.md §5): el ícono va con
 * `aria-hidden` y el estado siempre está escrito en el texto. Los pares de
 * color usados (`advertencia`/superficie y `exito`/superficie) son los ya
 * aprobados en §7; no se inventa ninguno.
 */
export function ResumenAlertas({
  alertas,
  cargando,
  hayError,
  onReintentar,
  diasAviso,
}: ResumenAlertasProps) {
  if (cargando) {
    return <p className="py-4 text-center text-texto-secundario">Revisando vencimientos y stock…</p>;
  }

  if (hayError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-4 text-center">
        <p role="alert" className="text-peligro">
          No se pudieron revisar los vencimientos ni el stock. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button variante="secundaria" onClick={onReintentar}>
          Reintentar
        </Button>
      </div>
    );
  }

  const titular = titularAlertas(alertas);

  if (titular === null) {
    return (
      <div className={CLASE_TARJETA}>
        <span aria-hidden="true" className="text-xl text-exito">
          ✓
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-exito">Todo en orden</span>
          <span className="text-sm text-texto-secundario">
            Nada vence en los próximos {diasAviso} días y ningún producto está bajo su mínimo.
          </span>
        </div>
      </div>
    );
  }

  const urgente = loMasUrgente(alertas);

  return (
    <Link
      to="/reportes/alertas"
      className={`${CLASE_TARJETA} transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600`}
    >
      <span aria-hidden="true" className="text-xl text-advertencia">
        ⚠
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-advertencia">{titular}</span>
        {urgente !== null && <span className="text-sm text-texto-secundario">{urgente}</span>}
      </div>
      <span aria-hidden="true" className="text-texto-secundario">
        ›
      </span>
    </Link>
  );
}
