import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { collection, orderBy, query, where } from 'firebase/firestore';
import {
  formatearMoney,
  margenDeRanking,
  money,
  periodoDe,
  periodoEnCurso,
  proporcionGanancia,
  rankingPorCategoria,
  rankingPorProducto,
  resumenPeriodo,
  type Granularidad,
  type ItemRanking,
  type Producto,
  type Venta,
} from '@gestion/core';
import { productoConverter, useCollection, useOnlineStatus, ventaConverter } from '@gestion/firebase-kit';
import { Button, FilaRanking, GrupoSegmentado, type OpcionGrupoSegmentado } from '@gestion/ui';
import { db } from '../firebase';
import { useHeader } from '../componentes/header/ContextoHeader';
import {
  etiquetasPeriodo,
  formatearPorcentajeEntero,
  granularidadDesdeParam,
  notaCobertura,
  offsetMinutosLocal,
  tituloGanancia,
} from '../componentes/reportes/calculoReportes';

const coleccionProductos = collection(db, 'productos').withConverter(productoConverter);

type Vista = 'producto' | 'categoria';

const OPCIONES_VISTA: readonly OpcionGrupoSegmentado<Vista>[] = [
  { valor: 'producto', etiqueta: 'Producto' },
  { valor: 'categoria', etiqueta: 'Categoría' },
];

function vistaDesdeParam(valor: string | null): Vista {
  return valor === 'categoria' ? 'categoria' : 'producto';
}

/**
 * Drill-down de rentabilidad por producto y por categoría (Fase 3, tanda
 * B2, docs/PLAN-ACTIVO.md), colgando de la home de Reportes. Solo admin
 * llega acá (`RutaSoloAdmin` en `App.tsx`), ruta real `/reportes/rentabilidad`
 * (docs/06-ui-ux.md §2: los drill-downs viven en rutas reales para que el
 * botón "atrás" del teléfono funcione siempre).
 *
 * **La pregunta que responde** (brief de la tarea): Adrián sabe qué vende
 * mucho; el ranking existe para mostrarle qué le deja plata, que no es lo
 * mismo. Por eso el orden y la barra de cada fila son por **ganancia
 * aportada** (`ItemRanking.gananciaCents`, ya calculado por
 * `rankingPorProducto`/`rankingPorCategoria` en `packages/core`) — nunca por
 * facturación.
 *
 * **Qué hace evidente "vende mucho, deja poco" de un vistazo** (requisito de
 * diseño central del brief): el `valorSecundario` de cada `FilaRanking` es el
 * **margen sobre facturación** (`margenDeRanking`, bps → `"X% margen"`), no
 * la facturación en dinero. Un producto de alta facturación y bajo margen
 * muestra un número de margen chico (o negativo) EN LA MISMA fila donde su
 * ganancia ya lo dejó abajo de la tabla — la fila se explica sola, sin
 * comparar dos listas mentalmente ni acordarse cuánto facturó cada uno.
 * (Nota de "Qué asumí": el propio JSDoc de `FilaRanking.valorSecundario` ya
 * traía el ejemplo `"32% margen"`, escrito por la tarea B5 anticipando este
 * uso — se sigue esa pista en vez de mostrar la facturación en plata, que
 * exigiría leer dos números y restarlos mentalmente.)
 *
 * **Cobertura de costo, igual de honesta que la home** (criterio no
 * negociable del brief): dos mecanismos, no uno solo — (1) una nota general
 * (`notaCobertura`, mismo helper y mismo texto que `Reportes.tsx`) cuando la
 * cobertura del período es menor a 100 %; (2) las claves cuyas líneas NO
 * tuvieron NINGÚN costo conocido (`ItemRanking.lineasConCosto === 0`) se
 * separan en un grupo rotulado aparte ("Sin costo conocido") en vez de
 * aparecer mezcladas en el ranking principal con `gananciaCents = 0` — eso
 * diría "no dejaron plata" cuando la verdad es "no sabemos cuánta plata
 * dejaron". Las claves con cobertura PARCIAL (algunas líneas sí, otras no)
 * quedan en el ranking principal con una nota por fila ("N línea(s) sin
 * costo conocido"): su ganancia es un piso real, no una invención, así que
 * no hace falta sacarlas de la comparación — solo aclarar que puede ser
 * más alta de lo mostrado.
 *
 * **El período viaja desde la home, nunca se resetea solo** (criterio del
 * brief): se lee del query param `?periodo=` con `granularidadDesdeParam`
 * (mismo helper que usa `Reportes.tsx`, para no divergir el criterio de
 * parseo) — sobrevive a un refresh (vive en la URL, no en estado de React) y
 * al botón atrás (cada entrada a esta pantalla trae su propia URL). Con el
 * param ausente o inválido (entrada directa, deep link viejo) el default es
 * `'mes'`, igual que la home. Esta pantalla NO ofrece su propio selector de
 * período (fuera de alcance del brief): mostrarlo sería reintroducir la
 * posibilidad de "resetearse por su cuenta" que el criterio prohíbe: alcanza
 * con dejar en claro, en el propio texto, qué período se está mirando.
 *
 * **Vista producto/categoría** en su PROPIO query param (`?vista=`, default
 * `'producto'`): no viaja desde la home (no hay tal elección ahí), pero
 * tenerla en la URL le da el mismo beneficio de refresh/atrás sin costo
 * extra, con el mismo mecanismo ya necesario para el período.
 *
 * **Resolución de categoría** (`rankingPorCategoria` la recibe como
 * parámetro, doc de la tarea): `Producto.categoria` ya es el NOMBRE
 * denormalizado (`tipos.ts`), no un id a otra colección — así que alcanza
 * con una `useCollection` de `productos` (sin filtrar por `activo`: un
 * producto dado de baja igual tiene que resolver la categoría de sus ventas
 * pasadas) para construir el mapa `productoId → categoría`. Un producto
 * borrado (no en el mapa) cae en el bucket `'Sin categoría'` que ya arma
 * `rankingPorCategoria`.
 */
export function RankingRentabilidad() {
  useHeader({ titulo: 'Rentabilidad', volverA: { etiqueta: 'Reportes', a: '/reportes' } });
  const enLinea = useOnlineStatus();

  const [searchParams, setSearchParams] = useSearchParams();
  const granularidad: Granularidad = granularidadDesdeParam(searchParams.get('periodo')) ?? 'mes';
  const vista = vistaDesdeParam(searchParams.get('vista'));

  const [intento, setIntento] = useState(0);
  // Foto fija al montar, mismo criterio que `Reportes.tsx`: un reintento no
  // debe correr el "hoy" de referencia a mitad de sesión.
  const [ahora] = useState(() => new Date());

  const offsetMinutos = offsetMinutosLocal(ahora);
  const periodoActual = useMemo(
    () => periodoDe(ahora, granularidad, offsetMinutos),
    [ahora, granularidad, offsetMinutos],
  );
  // Mismo criterio de honestidad que `Reportes.tsx` (evitar repetir el sesgo
  // que corrigió su review): el período por defecto es 'mes' y casi siempre
  // está EN CURSO, así que el texto dice "lo que va del mes", no "este mes".
  const enCurso = useMemo(() => periodoEnCurso(periodoActual, ahora), [periodoActual, ahora]);

  const ventasQuery = useMemo(
    () =>
      query(
        collection(db, 'ventas').withConverter(ventaConverter),
        where('fecha', '>=', periodoActual.desde),
        where('fecha', '<', periodoActual.hasta),
        orderBy('fecha'),
      ),
    [periodoActual, intento],
  );
  const ventas = useCollection<Venta>(ventasQuery);
  const productos = useCollection<Producto>(coleccionProductos);

  const categoriaPorProductoId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const producto of productos.datos) mapa.set(producto.id, producto.categoria);
    return mapa;
  }, [productos.datos]);

  const ranking = useMemo(() => {
    if (vista === 'categoria') {
      return rankingPorCategoria(ventas.datos, (productoId) => categoriaPorProductoId.get(productoId));
    }
    return rankingPorProducto(ventas.datos);
  }, [vista, ventas.datos, categoriaPorProductoId]);

  // `rankingPor` (core) ya devuelve el array ordenado desc. por ganancia:
  // filtrar preserva ese orden, así que `principal[0]` sigue siendo el máximo
  // dentro del grupo con costo conocido — sin volver a ordenar acá.
  const principal = useMemo(() => ranking.filter((item) => item.lineasConCosto > 0), [ranking]);
  const sinCostoConocido = useMemo(() => ranking.filter((item) => item.lineasConCosto === 0), [ranking]);
  const maxGananciaCents = principal.length > 0 ? principal[0]!.gananciaCents : money(0);

  const cobertura = useMemo(() => resumenPeriodo(ventas.datos).cobertura, [ventas.datos]);
  const nota = notaCobertura(cobertura);

  const cargando = ventas.cargando || productos.cargando;
  const error = ventas.error ?? productos.error;

  function reintentar() {
    setIntento((n) => n + 1);
  }

  function cambiarVista(valor: Vista) {
    setSearchParams(
      (previo) => {
        const siguiente = new URLSearchParams(previo);
        siguiente.set('vista', valor);
        return siguiente;
      },
      { replace: true },
    );
  }

  function notaSinCosto(item: ItemRanking): string | null {
    if (item.lineasSinCosto === 0) return null;
    return item.lineasSinCosto === 1
      ? '1 línea sin costo conocido'
      : `${item.lineasSinCosto} líneas sin costo conocido`;
  }

  function filaDe(item: ItemRanking) {
    const margenBps = margenDeRanking(item);
    return (
      <li key={item.clave} className="flex flex-col">
        <FilaRanking
          etiqueta={item.etiqueta}
          valor={formatearMoney(item.gananciaCents)}
          proporcion={proporcionGanancia(item.gananciaCents, maxGananciaCents)}
          valorSecundario={margenBps !== null ? `${formatearPorcentajeEntero(margenBps)} margen` : undefined}
        />
        {notaSinCosto(item) !== null && (
          <p className="px-4 pb-1 text-xs text-texto-secundario">{notaSinCosto(item)}</p>
        )}
      </li>
    );
  }

  let contenido;
  if (cargando) {
    contenido = <p className="py-8 text-center text-texto-secundario">Cargando rentabilidad…</p>;
  } else if (error !== null) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar la rentabilidad. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  } else if (ranking.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">Todavía no hay ventas en este período.</p>
      </div>
    );
  } else {
    contenido = (
      <div className="flex flex-col gap-4">
        {nota !== null && <p className="px-1 text-sm text-texto-secundario">{nota}</p>}
        {principal.length > 0 && (
          <ul className="flex flex-col divide-y divide-borde rounded-card border border-borde bg-superficie">
            {principal.map((item) => filaDe(item))}
          </ul>
        )}
        {sinCostoConocido.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-semibold text-texto-secundario">Sin costo conocido</h2>
            <p className="px-1 text-xs text-texto-secundario">
              Vendieron en este período pero no tenemos su costo: no sabemos si dejaron ganancia.
            </p>
            <ul className="flex flex-col divide-y divide-borde rounded-card border border-borde bg-superficie">
              {sinCostoConocido.map((item) => (
                <li key={item.clave}>
                  <FilaRanking
                    etiqueta={item.etiqueta}
                    valor={formatearMoney(item.facturacionCents)}
                    proporcion={0}
                    valorSecundario="facturado"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-sm text-texto-secundario">
        {tituloGanancia(etiquetasPeriodo(granularidad), enCurso)} — ordenado por lo que deja, no por lo que
        factura.
      </p>
      <GrupoSegmentado opciones={OPCIONES_VISTA} valor={vista} onCambiar={cambiarVista} ariaLabel="Ver por" />
      {!enLinea && (
        <p
          role="status"
          className="rounded-elemento border border-borde bg-superficie p-3 text-sm text-advertencia"
        >
          <span aria-hidden="true">⚠</span> Sin conexión: se calcula con lo guardado en este dispositivo.
          Puede faltar lo vendido desde otros dispositivos hasta reconectar.
        </p>
      )}
      {contenido}
    </div>
  );
}
