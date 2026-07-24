import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { collection, orderBy, query, where } from 'firebase/firestore';
import {
  dentroDePeriodo,
  formatearMoney,
  periodoAnterior,
  periodoAnteriorComparable,
  periodoDe,
  periodoEnCurso,
  resumenPeriodo,
  variacionPorcentual,
  type Granularidad,
  type Venta,
} from '@gestion/core';
import { useCollection, useOnlineStatus, ventaConverter } from '@gestion/firebase-kit';
import {
  Button,
  GrupoSegmentado,
  StatCard,
  TarjetaDelta,
  type OpcionGrupoSegmentado,
} from '@gestion/ui';
import { db } from '../firebase';
import { useHeader } from '../componentes/header/ContextoHeader';
import { REGISTRO_REPORTES } from '../componentes/reportes/registro';
import {
  comparacionGanancia,
  etiquetaComparacion,
  etiquetasPeriodo,
  notaCobertura,
  offsetMinutosLocal,
  tituloGanancia,
} from '../componentes/reportes/calculoReportes';

const OPCIONES_PERIODO: readonly OpcionGrupoSegmentado<Granularidad>[] = [
  { valor: 'dia', etiqueta: 'Día' },
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'mes', etiqueta: 'Mes' },
];

/**
 * Home de Reportes (Fase 3, tanda B1, docs/PLAN-ACTIVO.md). Solo admin llega
 * acá (ver `RutaSoloAdmin` en `App.tsx`).
 *
 * El criterio del dueño (doc 04:478) es simple: "cuánto ganó (no solo cuánto
 * vendió)", legible en cinco segundos parado en la feria. Por eso la
 * **ganancia** es el hero (`TarjetaDelta`, comparada contra el período
 * anterior) y lo vendido (facturación) es dato secundario (`StatCard`). La
 * cobertura de costo se aclara junto al número cuando es menor a 100 %: un
 * número de ganancia sin esa aclaración es un número que miente (ver
 * `reporteVentas.ts`).
 *
 * **Consulta de datos** (mismo patrón que `Historial.tsx`: una sola
 * `useCollection` memoizada + estados de carga/error/vacío): en vez de dos
 * queries (período actual y anterior), UNA sola trae el rango
 * `[inicio del período ANTERIOR, fin del período actual)` — evita pagar dos
 * listeners para poder comparar. Es un filtro de rango en un único campo
 * (`fecha`) con `orderBy` en ese mismo campo: Firestore no necesita un
 * índice compuesto para esto (a diferencia de un filtro + `orderBy` en
 * campos distintos), así que no hay nada que agregar a
 * `firestore.indexes.json`. Las ventas ANULADAS se traen igual (el filtro
 * vive en `packages/core`, un único punto — `ventasVigentes`, ver
 * `reporteVentas.ts`).
 *
 * **Período en curso vs. período cerrado (corrección post-review):** el
 * `período actual` casi siempre está EN CURSO (`periodoActual.hasta` es una
 * fecha futura salvo en el instante exacto en que cierra) — el día 3 de un
 * mes, `resumenActual` son 2 días y medio de ventas. Compararlo contra el
 * mes anterior COMPLETO (30 días) da SIEMPRE una caída falsa, sin importar
 * cuántas ventas haya: el problema no es el tamaño de la muestra (el umbral
 * de "pocos datos" no lo detecta), es que los dos períodos no son
 * comparables entre sí. La corrección (`periodoAnteriorComparable`, nueva en
 * `packages/core/src/periodo.ts`): si el período actual está en curso, el
 * período anterior se filtra a la MISMA porción transcurrida ("los primeros
 * 3 días de este mes" contra "los primeros 3 días del mes anterior"), en vez
 * de a su totalidad. Con el período ya cerrado, el filtro devuelve el
 * período anterior completo sin tocar: cerrado contra cerrado ya era válido.
 * Ni la agregación (`resumenPeriodo`) ni la variación (`variacionPorcentual`)
 * cambiaron: lo único distinto es QUÉ ventas entran en `resumenPrevio`.
 *
 * Además, el título del hero cambia según el estado ("Ganancia de **lo que
 * va del mes**" vs. "Ganancia de **este mes**", ídem la base de comparación:
 * "vs. **el mismo tramo** del mes anterior" vs. "vs. **el mes anterior**") —
 * así Adrián puede responder "¿esto es el mes entero o lo que va del mes?"
 * leyendo el propio texto, sin un badge aparte (`calculoReportes.ts`:
 * `tituloGanancia` / `etiquetaComparacion`).
 *
 * Ya no se usa `agruparPorPeriodo` para esto: como el período anterior
 * puede quedar TRUNCADO (no es un bucket de calendario completo),
 * `dentroDePeriodo` (core) filtra directamente los items en memoria contra
 * el `Periodo` que corresponda en cada caso.
 *
 * **Registro de reportes** (§1 del brief): `REGISTRO_REPORTES` está vacío
 * hoy porque los drill-downs (rentabilidad por producto/categoría, alertas,
 * rendimiento de compra) son tareas futuras (B2/B3/B4, ver
 * `docs/PLAN-ACTIVO.md`) — la sección "Para mirar" solo se renderiza si el
 * registro trae algo, así que agregar una entrada ahí no requiere tocar
 * esta pantalla.
 *
 * **Offline** (docs/06-ui-ux.md §2, excepción de banner local): con
 * persistencia offline habilitada, `useCollection` sigue resolviendo de
 * caché sin conexión — la pantalla NO se bloquea. El banner de acá es
 * ESPECÍFICO de Reportes (no repite el chip genérico "Sin conexión" del
 * header): explica que puede faltar lo vendido desde otros dispositivos
 * hasta reconectar, la limitación concreta de un reporte agregado.
 */
export function Reportes() {
  useHeader({ titulo: 'Reportes' });
  const enLinea = useOnlineStatus();

  // Default 'mes' (antes 'dia'): es la granularidad que nombra el criterio
  // del dueño (doc 04:478, "cuánto ganó el mes pasado") y el cierre natural
  // de un comercio chico — un día suelto rara vez tiene datos suficientes
  // para no caer en 'pocos-datos' (`variacionPorcentual`), y una sola venta
  // grande lo mueve todo. Con la corrección de período en curso (ver JSDoc
  // de arriba) el default ya no importa para la HONESTIDAD del número (las
  // 3 granularidades quedan correctas), pero sí para qué tan accionable es
  // el primer vistazo.
  const [granularidad, setGranularidad] = useState<Granularidad>('mes');
  const [intento, setIntento] = useState(0);
  // `ahora` fijo al montar: un reintento (o cualquier re-render) no debe
  // correr el "hoy" de referencia a mitad de sesión — misma foto fija que
  // `estadoVencimiento` (`componentes/stock/resumen.ts`).
  const [ahora] = useState(() => new Date());

  const offsetMinutos = offsetMinutosLocal(ahora);
  const periodoActual = useMemo(
    () => periodoDe(ahora, granularidad, offsetMinutos),
    [ahora, granularidad, offsetMinutos],
  );
  const periodoPrevio = useMemo(
    () => periodoAnterior(periodoActual, granularidad, offsetMinutos),
    [periodoActual, granularidad, offsetMinutos],
  );
  // `true` casi siempre (`periodoActual.hasta` es futuro salvo en el
  // instante exacto en que cierra): el período mostrado tiene datos
  // PARCIALES, no el total del calendario. Gobierna tanto la corrección de
  // la comparación (abajo) como el texto del título (ver JSDoc de arriba).
  const enCurso = useMemo(() => periodoEnCurso(periodoActual, ahora), [periodoActual, ahora]);
  // Ventana del período anterior REALMENTE comparable: si `periodoActual`
  // sigue en curso, se trunca a la misma porción transcurrida — nunca el
  // período anterior completo (esa era la comparación deshonesta, ver JSDoc
  // de arriba). Cerrado, es el período anterior completo sin cambios.
  const periodoPrevioComparable = useMemo(
    () => periodoAnteriorComparable(periodoActual, periodoPrevio, ahora),
    [periodoActual, periodoPrevio, ahora],
  );

  const ventasQuery = useMemo(
    () =>
      query(
        collection(db, 'ventas').withConverter(ventaConverter),
        where('fecha', '>=', periodoPrevio.desde),
        where('fecha', '<', periodoActual.hasta),
        orderBy('fecha'),
      ),
    [periodoPrevio, periodoActual, intento],
  );
  const ventas = useCollection<Venta>(ventasQuery);

  const resumenActual = useMemo(
    () => resumenPeriodo(ventas.datos.filter((v) => dentroDePeriodo(v.fecha, periodoActual))),
    [ventas.datos, periodoActual],
  );

  const resumenPrevio = useMemo(
    () =>
      resumenPeriodo(ventas.datos.filter((v) => dentroDePeriodo(v.fecha, periodoPrevioComparable))),
    [ventas.datos, periodoPrevioComparable],
  );

  const variacionGanancia = useMemo(
    () =>
      variacionPorcentual(
        { valor: resumenActual.gananciaBrutaCents, cantidadDatos: resumenActual.cantidadVentas },
        { valor: resumenPrevio.gananciaBrutaCents, cantidadDatos: resumenPrevio.cantidadVentas },
      ),
    [resumenActual, resumenPrevio],
  );

  const etiquetas = etiquetasPeriodo(granularidad);

  function reintentar() {
    setIntento((n) => n + 1);
  }

  let contenido;
  if (ventas.cargando) {
    contenido = <p className="py-8 text-center text-texto-secundario">Cargando reportes…</p>;
  } else if (ventas.error !== null) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudieron cargar los reportes. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  } else if (resumenActual.cantidadVentas === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">Todavía no hay ventas en este período.</p>
      </div>
    );
  } else {
    const nota = notaCobertura(resumenActual.cobertura);
    contenido = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <TarjetaDelta
            titulo={tituloGanancia(etiquetas, enCurso)}
            valor={formatearMoney(resumenActual.gananciaBrutaCents)}
            comparacion={comparacionGanancia(variacionGanancia, etiquetaComparacion(etiquetas, enCurso))}
          />
          {nota !== null && <p className="px-1 text-sm text-texto-secundario">{nota}</p>}
        </div>
        <StatCard
          titulo="Vendido"
          valor={formatearMoney(resumenActual.totalVendidoCents)}
          detalle={resumenActual.cantidadVentas === 1 ? '1 venta' : `${resumenActual.cantidadVentas} ventas`}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GrupoSegmentado
        opciones={OPCIONES_PERIODO}
        valor={granularidad}
        onCambiar={setGranularidad}
        ariaLabel="Período del reporte"
      />
      {!enLinea && (
        <p
          role="status"
          className="rounded-elemento border border-borde bg-superficie p-3 text-sm text-advertencia"
        >
          <span aria-hidden="true">⚠</span> Sin conexión: se calcula con lo guardado en este
          dispositivo. Puede faltar lo vendido desde otros dispositivos hasta reconectar.
        </p>
      )}
      {contenido}
      {REGISTRO_REPORTES.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-texto-secundario">Para mirar</h2>
          <ul className="flex flex-col gap-2">
            {REGISTRO_REPORTES.map((reporte) => (
              <li key={reporte.id}>
                <Link
                  to={reporte.ruta}
                  className="flex flex-col gap-0.5 rounded-card border border-borde bg-superficie p-4 transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                >
                  <span className="font-medium text-texto">{reporte.titulo}</span>
                  <span className="text-sm text-texto-secundario">{reporte.descripcion}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
