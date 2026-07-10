import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { collection, doc, orderBy, query, where } from 'firebase/firestore';
import { formatearMoney, type Venta } from '@gestion/core';
import {
  actualizarCliente,
  clienteConverter,
  reactivarCliente,
  useAuth,
  useCollection,
  useDoc,
  useOnlineStatus,
  ventaConverter,
  type DatosCliente,
} from '@gestion/firebase-kit';
import { Button, DataTable, StatCard, useToasts, type ColumnaDataTable } from '@gestion/ui';
import { db } from '../firebase';
import { useHeader } from '../componentes/header/ContextoHeader';
import { formatearFecha } from '../componentes/stock/resumen';
import { BadgeEstadoVenta } from '../componentes/historial/BadgeEstadoVenta';
import { ETIQUETAS_MEDIO_PAGO, formatearFechaHora } from '../componentes/historial/formato';
import {
  calcularDiasDesdeUltimaCompra,
  calcularTicketPromedio,
} from '../componentes/clientes/estadisticas';
import { ModalDesactivarCliente } from '../componentes/clientes/ModalDesactivarCliente';
import { ModalCliente } from './ModalCliente';

type Modal = 'edicion' | 'desactivar' | null;

/** Texto de "días desde la última compra": `null` (sin ventas todavía) → "—". */
function textoDiasDesdeUltimaCompra(dias: number | null): string {
  if (dias === null) return '—';
  return dias === 0 ? 'Hoy' : dias === 1 ? 'Hace 1 día' : `Hace ${dias} días`;
}

/**
 * Ficha de UN cliente, en su propia ruta (`/clientes/cliente/:id`, ver
 * App.tsx) — mismo patrón que `DetalleProductoPantalla` en Stock: subvista
 * con contenido propio en ruta real (docs/06-ui-ux.md §2), no estado interno,
 * para que el back del sistema funcione siempre.
 *
 * Trae el cliente con `useDoc` (documento puntual, a diferencia de
 * `DetalleProductoPantalla` que reusa la query de lista de Stock: acá no hay
 * un listado ya cargado en memoria que reusar) y su historial de ventas con
 * `useCollection` (`ventas` filtradas por `clienteId`, orden `fecha desc` —
 * el índice ya existe, doc 07).
 *
 * Ticket promedio y días desde la última compra se calculan al mostrar
 * (`calcularTicketPromedio`/`calcularDiasDesdeUltimaCompra`, doc 07 decisión
 * 5): nunca se persisten.
 */
export function DetalleClientePantalla() {
  const { id } = useParams<{ id: string }>();
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();
  const esAdmin = perfil?.rol === 'admin';

  const [intento, setIntento] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [guardando, setGuardando] = useState(false);
  const [reactivando, setReactivando] = useState(false);

  const clienteRef = useMemo(
    () => (id !== undefined ? doc(db, 'clientes', id).withConverter(clienteConverter) : null),
    [id, intento],
  );
  const cliente = useDoc(clienteRef);

  const ventasQuery = useMemo(
    () =>
      id !== undefined
        ? query(
            collection(db, 'ventas').withConverter(ventaConverter),
            where('clienteId', '==', id),
            orderBy('fecha', 'desc'),
          )
        : null,
    [id, intento],
  );
  const ventas = useCollection<Venta>(ventasQuery);

  const cargando = cliente.cargando || ventas.cargando;
  const noEncontrado = !cargando && cliente.error === null && cliente.datos === null;

  const tituloHeader = cargando ? 'Cliente' : (cliente.datos?.nombre ?? 'Cliente no encontrado');

  useHeader({
    titulo: tituloHeader,
    volverA: { etiqueta: 'Clientes', a: '/clientes' },
    acciones:
      esAdmin && cliente.datos !== null ? (
        <Button onClick={() => setModal('edicion')} className="min-h-[48px]">
          Editar
        </Button>
      ) : undefined,
  });

  function reintentar() {
    setIntento((n) => n + 1);
  }

  function cerrarModal() {
    setModal(null);
  }

  /** Mismo patrón híbrido de escrituras offline del proyecto (docs/06-ui-ux.md
   * §8, ver `Productos.tsx`). Solo edición acá: el alta vive en `Clientes.tsx`. */
  async function handleGuardar(datos: DatosCliente) {
    if (cliente.datos === null) return;
    const escritura = actualizarCliente(db, cliente.datos.id, datos);

    if (!enLinea) {
      cerrarModal();
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar la edición del cliente.', 'error');
      });
      return;
    }

    setGuardando(true);
    try {
      await escritura;
      mostrarToast('Cliente actualizado.', 'exito');
      cerrarModal();
    } catch {
      mostrarToast('No se pudo actualizar el cliente. Intentá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Reactivación: acción reversible, sin modal de confirmación (docs/06-ui-ux.md
   * §6). Mismo patrón híbrido de escrituras offline del proyecto (§8) que el
   * resto de la ficha.
   */
  async function handleReactivar() {
    if (cliente.datos === null || reactivando) return;
    const escritura = reactivarCliente(db, cliente.datos.id);

    if (!enLinea) {
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar la reactivación del cliente.', 'error');
      });
      return;
    }

    setReactivando(true);
    try {
      await escritura;
      mostrarToast('Cliente reactivado.', 'exito');
    } catch {
      mostrarToast('No se pudo reactivar el cliente. Intentá de nuevo.', 'error');
    } finally {
      setReactivando(false);
    }
  }

  if (cargando) {
    return <p className="py-8 text-center text-texto-secundario">Cargando cliente…</p>;
  }

  if (cliente.error !== null || ventas.error !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar el cliente. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  }

  if (noEncontrado || cliente.datos === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No encontramos ese cliente. Puede haberse desactivado.
        </p>
        <Link
          to="/clientes"
          className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
        >
          Volver a Clientes
        </Link>
      </div>
    );
  }

  const datosCliente = cliente.datos;
  const ticketPromedio = calcularTicketPromedio(datosCliente.stats);
  const diasDesdeUltimaCompra = calcularDiasDesdeUltimaCompra(datosCliente.stats);

  // La query trae TODAS las ventas del cliente (también las anuladas: no se
  // filtran — mostrar el badge es más honesto que ocultarlas, ver
  // `BadgeEstadoVenta`). Sin esto, las stats ya revertidas ("2 ventas") no
  // reconciliarían con filas indistinguibles en la tabla. Cada celda de una
  // fila anulada se de-enfatiza (`opacity-60`, `DataTable` no expone
  // className por fila) — mismo criterio visual que el badge: el color no es
  // la única señal, el texto "Anulada" lo es.
  function celda(contenido: ReactNode, anulada: boolean) {
    return anulada ? <span className="opacity-60">{contenido}</span> : contenido;
  }

  const columnasVentas: ColumnaDataTable<Venta>[] = [
    {
      clave: 'numero',
      titulo: 'N°',
      render: (v) => celda(`#${v.numero}`, v.estado === 'anulada'),
    },
    {
      clave: 'fecha',
      titulo: 'Fecha',
      render: (v) => celda(formatearFechaHora(v.fecha), v.estado === 'anulada'),
    },
    {
      clave: 'medioPago',
      titulo: 'Medio de pago',
      render: (v) => celda(ETIQUETAS_MEDIO_PAGO[v.medioPago], v.estado === 'anulada'),
    },
    {
      clave: 'total',
      titulo: 'Total',
      alinear: 'derecha',
      render: (v) => celda(formatearMoney(v.totalCents), v.estado === 'anulada'),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      render: (v) => <BadgeEstadoVenta estado={v.estado} />,
    },
  ];

  function filaCompactaVenta(v: Venta) {
    const anulada = v.estado === 'anulada';
    return (
      <div className={`flex min-h-[56px] flex-col gap-1 p-4 ${anulada ? 'opacity-60' : ''}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-texto">Venta #{v.numero}</span>
          <span className="tabular-nums font-semibold text-texto">{formatearMoney(v.totalCents)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm text-texto-secundario">
          <span>{formatearFechaHora(v.fecha)}</span>
          <span>{ETIQUETAS_MEDIO_PAGO[v.medioPago]}</span>
        </div>
        <BadgeEstadoVenta estado={v.estado} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-card border border-borde bg-superficie p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-texto">{datosCliente.nombre}</h2>
          {datosCliente.alias !== undefined && (
            <span className="text-texto-secundario">({datosCliente.alias})</span>
          )}
          {!datosCliente.activo && (
            <span className="rounded-full border border-borde px-2 py-0.5 text-xs text-texto-secundario">
              Inactivo
            </span>
          )}
        </div>
        {datosCliente.telefono !== undefined && (
          <p className="text-sm text-texto-secundario">Teléfono: {datosCliente.telefono}</p>
        )}
        {datosCliente.email !== undefined && (
          <p className="text-sm text-texto-secundario">Email: {datosCliente.email}</p>
        )}
        {datosCliente.direccion !== undefined && (
          <p className="text-sm text-texto-secundario">Dirección: {datosCliente.direccion}</p>
        )}
        {datosCliente.notas !== undefined && (
          <p className="text-sm text-texto-secundario">Notas: {datosCliente.notas}</p>
        )}
        <p className="text-sm text-texto-secundario">Cliente desde {formatearFecha(datosCliente.fechaAlta)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard titulo="Total histórico" valor={formatearMoney(datosCliente.stats.totalHistoricoCents)} />
        <StatCard titulo="Cantidad de ventas" valor={String(datosCliente.stats.cantidadVentas)} />
        <StatCard
          titulo="Ticket promedio"
          valor={ticketPromedio !== null ? formatearMoney(ticketPromedio) : '—'}
        />
        <StatCard titulo="Última compra" valor={textoDiasDesdeUltimaCompra(diasDesdeUltimaCompra)} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-texto">Historial de ventas</h3>
        <DataTable
          columnas={columnasVentas}
          filas={ventas.datos}
          claveFila={(v) => v.id}
          etiqueta={`Ventas de ${datosCliente.nombre}`}
          filaCompacta={filaCompactaVenta}
          vacio="Este cliente todavía no tiene ventas registradas."
        />
      </div>

      {esAdmin && datosCliente.activo && (
        <div className="flex justify-end">
          <Button variante="peligro" onClick={() => setModal('desactivar')}>
            Desactivar cliente
          </Button>
        </div>
      )}

      {esAdmin && !datosCliente.activo && (
        <div className="flex justify-end">
          <Button onClick={() => void handleReactivar()} disabled={reactivando}>
            {reactivando ? 'Reactivando…' : 'Reactivar cliente'}
          </Button>
        </div>
      )}

      {esAdmin && (
        <>
          <ModalCliente
            abierto={modal === 'edicion'}
            cliente={datosCliente}
            guardando={guardando}
            onGuardar={(datos) => void handleGuardar(datos)}
            onCerrar={cerrarModal}
          />
          <ModalDesactivarCliente
            abierto={modal === 'desactivar'}
            onCerrar={cerrarModal}
            db={db}
            cliente={datosCliente}
            enLinea={enLinea}
          />
        </>
      )}
    </div>
  );
}
