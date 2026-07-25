import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { collection, doc, orderBy, query, where } from 'firebase/firestore';
import { calcularRendimientoCompra, formatearMoney, formatearPeso, type Venta } from '@gestion/core';
import { compraConverter, useCollection, useDoc, useOnlineStatus, ventaConverter } from '@gestion/firebase-kit';
import { Button, StatCard } from '@gestion/ui';
import { db } from '../firebase';
import { useHeader } from '../componentes/header/ContextoHeader';
import { formatearFecha } from '../componentes/stock/resumen';
import { formatearPorcentajeEntero } from '../componentes/reportes/calculoReportes';
import { mensajeEstadoRendimiento, notaCostoNoAtribuible } from '../componentes/reportes/calculoRendimientoCompra';

/**
 * Rendimiento de UNA compra/viaje confirmada (Fase 3, tanda B4,
 * docs/PLAN-ACTIVO.md): responde el criterio 2 del dueño (doc 04:479,
 * "puede ver si el último viaje a Colonia fue rentable"), la pregunta de
 * negocio más importante del módulo (doc 03-compras-costos-precios.md:148-150).
 * Ruta real `/reportes/compras/:id` (docs/06-ui-ux.md §2: drill-down en ruta
 * real para que el botón "atrás" del teléfono funcione siempre); llegan acá
 * tanto el listado (`RendimientoCompras.tsx`) como el link "Ver rendimiento
 * del viaje →" del detalle de la propia compra (`CompraPantalla.tsx`, solo
 * visible cuando está confirmada).
 *
 * **Todo el cálculo vive en `packages/core`** (`calcularRendimientoCompra`,
 * `rendimientoCompra.ts`): esta pantalla solo trae `Compra` + `Venta[]` y
 * formatea. Cero aritmética de plata o de peso acá (regla de oro 1).
 *
 * **Consulta de ventas**: como no se puede filtrar Firestore por un campo
 * anidado dentro de un array (`items[].costeo.compraId`), no hay query que
 * traiga "solo las ventas de esta compra" — hace falta traer un rango amplio
 * y filtrar en memoria (mismo criterio arquitectónico que el resto de
 * Reportes: "agregación en el cliente sobre ventas crudas", decisión del
 * `advisor` en el plan activo). La cota elegida es `fecha >= compra.fecha`
 * (no se puede vender antes de comprar) SIN cota superior: un filtro de
 * rango en un único campo con `orderBy` en ese mismo campo no necesita
 * índice compuesto nuevo (igual que `Reportes.tsx`). Sujeto al mismo
 * tripwire del plan activo (~3s o ~5k documentos): si algún día pesa,
 * ahí se evalúan cierres mensuales — no antes.
 *
 * **Límite de atribución, comunicado en la pantalla** (criterio central del
 * brief, ver el JSDoc de `RendimientoCompra` en core): la ganancia y el %
 * vendido cubren SOLO la porción de la compra controlada por pieza. Si la
 * compra tuvo ítems a granel o por unidad, `notaCostoNoAtribuible` aparece
 * como una nota aparte, nunca mezclada con los números exactos.
 *
 * **Compra recién confirmada, sin ventas** (criterio del brief: no debe
 * leerse como un viaje que fracasó): `mensajeEstadoRendimiento` traduce
 * `RendimientoCompra.estado` a un texto que distingue "todavía no se vendió
 * nada, es pronto para juzgar" de "no rindió" — nunca el mismo texto para
 * los dos casos.
 */
export function RendimientoCompraPantalla() {
  const { id } = useParams<{ id: string }>();
  const enLinea = useOnlineStatus();
  const [intento, setIntento] = useState(0);

  const compraRef = useMemo(
    () => (id !== undefined ? doc(db, 'compras', id).withConverter(compraConverter) : null),
    [id, intento],
  );
  const compra = useDoc(compraRef);

  const esConfirmada = compra.datos?.estado === 'confirmada';
  // Deps por VALOR (no por identidad del objeto `compra.datos`, que cambia en
  // cada snapshot): evita reabrir la suscripción de ventas cuando el doc de
  // la compra llega de nuevo con el mismo contenido.
  const fechaCompraMs = compra.datos?.fecha.getTime();

  const ventasQuery = useMemo(
    () =>
      esConfirmada && fechaCompraMs !== undefined
        ? query(
            collection(db, 'ventas').withConverter(ventaConverter),
            where('fecha', '>=', new Date(fechaCompraMs)),
            orderBy('fecha'),
          )
        : null,
    [esConfirmada, fechaCompraMs, intento],
  );
  const ventas = useCollection<Venta>(ventasQuery);

  const rendimiento = useMemo(() => {
    if (compra.datos === null || !esConfirmada) return null;
    return calcularRendimientoCompra(compra.datos, ventas.datos);
  }, [compra.datos, esConfirmada, ventas.datos]);

  useHeader({
    titulo: compra.datos?.proveedorNombre ?? 'Rendimiento de compra',
    volverA: { etiqueta: 'Rendimiento de compras', a: '/reportes/compras' },
  });

  function reintentar() {
    setIntento((n) => n + 1);
  }

  let contenido;
  if (compra.cargando || (esConfirmada && ventas.cargando)) {
    contenido = <p className="py-8 text-center text-texto-secundario">Cargando rendimiento…</p>;
  } else if (compra.error !== null || ventas.error !== null) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar el rendimiento. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  } else if (compra.datos === null) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">No encontramos esa compra.</p>
        <Link
          to="/reportes/compras"
          className="font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
        >
          Volver al listado
        </Link>
      </div>
    );
  } else if (!esConfirmada) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">
          Esta compra todavía es un borrador: el rendimiento solo existe para compras confirmadas.
        </p>
        <Link
          to={`/stock/compra/${compra.datos.id}`}
          className="font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
        >
          Ir a la compra →
        </Link>
      </div>
    );
  } else if (rendimiento !== null) {
    const notaGranel = notaCostoNoAtribuible(rendimiento);
    contenido = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-texto-secundario">{formatearFecha(compra.datos.fecha)}</span>
        </div>

        <StatCard
          titulo="Costo del viaje"
          valor={formatearMoney(rendimiento.costoTotalCents)}
          detalle="Mercadería + gastos (flete, combustible, peajes)"
        />

        <StatCard
          titulo="Ganancia generada"
          valor={formatearMoney(rendimiento.gananciaGeneradaCents)}
          detalle={mensajeEstadoRendimiento(rendimiento.estado)}
        />

        {rendimiento.porcentajeVendidoBps !== null && (
          <StatCard
            titulo="Vendido de esta compra"
            valor={formatearPorcentajeEntero(rendimiento.porcentajeVendidoBps)}
            detalle={`${formatearPeso(rendimiento.gramosAtribuiblesVendidos)} de ${formatearPeso(
              rendimiento.gramosAtribuiblesComprados,
            )} vendidos (con atribución exacta)`}
          />
        )}

        {notaGranel !== null && (
          <p className="rounded-elemento border border-borde bg-superficie p-3 text-sm text-texto-secundario">
            {notaGranel} Costo de esa parte: {formatearMoney(rendimiento.costoNoAtribuibleCents)}.
          </p>
        )}
      </div>
    );
  } else {
    contenido = null;
  }

  return (
    <div className="flex flex-col gap-4">
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
