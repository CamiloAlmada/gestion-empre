import { useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import { normalizarDiasAviso, type Configuracion, type ContextoAlertas } from '@gestion/core';
import { configuracionConverter, useDoc } from '@gestion/firebase-kit';
import { db } from '../../firebase';
import { offsetMinutosLocal } from '../reportes/calculoReportes';

export interface EstadoContextoAlertas {
  /** Parámetros con los que evaluar las alertas (`evaluarAlertas`, core). */
  readonly contexto: ContextoAlertas;
  /** `true` mientras no se sabe si el negocio configuró su propia ventana. */
  readonly cargando: boolean;
}

/**
 * Arma el `ContextoAlertas` de una pantalla: el "hoy", el huso del dispositivo
 * y la ventana de aviso configurada por el negocio
 * (`configuracion/general.diasAvisoVencimiento`, editable en Ajustes → Alertas
 * de stock).
 *
 * **Por qué un hook y no una constante por pantalla:** la ventana de aviso es
 * UNA decisión del negocio. Si Productos leyera 7 días y Reportes 14, las dos
 * pantallas darían números distintos sobre la misma mercadería y ninguna sería
 * confiable. Todo lo que muestra alertas pasa por acá.
 *
 * `ahora` se fija al montar (`useState` con inicializador perezoso), mismo
 * criterio que `Reportes.tsx`: un re-render o un reintento no debe correr el
 * "hoy" de referencia a mitad de sesión, o una pieza podría cambiar de estado
 * sin que pase nada en pantalla.
 *
 * **Sin conexión no se bloquea** (regla de oro 6): mientras el documento de
 * configuración no llegue —y también si su lectura falla— el contexto usa el
 * default de core (`DIAS_AVISO_VENCIMIENTO_DEFAULT`). `cargando` existe para
 * que la pantalla pueda esperar el valor real antes de mostrar un conteo, no
 * para que se quede colgada: con persistencia offline `useDoc` resuelve desde
 * la caché, y ante un error resuelve igual (`cargando: false`) con el default.
 */
export function useContextoAlertas(): EstadoContextoAlertas {
  const [ahora] = useState(() => new Date());
  const referencia = useMemo(
    () => doc(db, 'configuracion', 'general').withConverter(configuracionConverter),
    [],
  );
  const { datos, cargando } = useDoc<Configuracion>(referencia);

  const contexto = useMemo<ContextoAlertas>(
    () => ({
      ahora,
      offsetMinutos: offsetMinutosLocal(ahora),
      diasAviso: normalizarDiasAviso(datos?.diasAvisoVencimiento),
    }),
    [ahora, datos],
  );

  return { contexto, cargando };
}
