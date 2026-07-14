import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import type { Venta } from '@gestion/core';
import { useCollection, ventaConverter } from '@gestion/firebase-kit';
import { Button } from '@gestion/ui';
import { db } from '../firebase';
import { ListaVentas } from '../componentes/historial/ListaVentas';
import {
  INCREMENTO_LIMITE_VENTAS,
  LIMITE_INICIAL_VENTAS,
} from '../componentes/historial/constantes';
import { useHeader } from '../componentes/header/ContextoHeader';

/**
 * Pantalla Historial: listado de ventas (más recientes primero). Trae
 * ventas con UNA sola `useCollection` memoizada (`orderBy('fecha', 'desc')`
 * + `limit`); "Cargar más" agranda el límite en vez de paginar por cursor
 * (ver `constantes.ts`, suficiente para Fase 1).
 *
 * El detalle de una venta vive en su propia ruta
 * (`/historial/venta/:id`, `DetalleVentaPantalla.tsx` — tanda NAV-2a,
 * docs/06-ui-ux.md §2, 2026-07-14): tocar una fila navega ahí en vez de
 * setear estado interno (herencia pre-SH-1 que esta tanda corrigió, mismo
 * motivo que movió el detalle de producto a ruta real). La anulación
 * (modal incluido) se mudó con el detalle a esa pantalla nueva — esta
 * pantalla ya no la orquesta.
 *
 * Historial DE VENTAS (docs/06-ui-ux.md §2, 2026-07-10, ajustado tras uso
 * real del dueño): cuelga del tab **Venta** — su `‹ volver` lleva a Venta y
 * el tab Venta queda activo mientras se está acá o en el detalle de una
 * venta (ver `TAB_POR_SEGMENTO` en Shell.tsx). Dos entradas: el icono de
 * historial del header de Venta (`accionHeader`, ver `pantallas/Venta.tsx`)
 * y la acción "Historial" del listado de Clientes (consulta cruzada
 * frecuente, ver `pantallas/Clientes.tsx`) — esta pantalla no declara
 * ninguna acción propia de vuelta hacia esas pantallas.
 */
export function Historial() {
  const navigate = useNavigate();

  useHeader({
    titulo: 'Historial',
    volverA: { etiqueta: 'Venta', a: '/venta' },
  });

  const [intento, setIntento] = useState(0);
  const [limiteVentas, setLimiteVentas] = useState(LIMITE_INICIAL_VENTAS);

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

  function reintentar() {
    setIntento((n) => n + 1);
  }

  function cargarMas() {
    setLimiteVentas((l) => l + INCREMENTO_LIMITE_VENTAS);
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
          onSeleccionar={(venta) => navigate(`/historial/venta/${venta.id}`)}
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

  return <div className="flex flex-col gap-4">{contenido}</div>;
}
