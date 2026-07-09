import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { collection, orderBy, query, where } from 'firebase/firestore';
import type { DatosPago } from '@gestion/core';
import {
  actualizarProveedor,
  proveedorConverter,
  useCollection,
  useOnlineStatus,
  type DatosProveedor,
} from '@gestion/firebase-kit';
import { Button, useToasts } from '@gestion/ui';
import { db } from '../firebase';
import { ModalProveedor } from './ModalProveedor';
import { ModalConfirmarDesactivarProveedor } from './ModalConfirmarDesactivarProveedor';
import { useHeader } from '../componentes/header/ContextoHeader';

type Modal = 'editar' | 'desactivar' | null;

/** Fila etiqueta/valor, solo si el valor está presente (campos opcionales del
 * proveedor: docs/07-clientes-proveedores.md). */
function CampoOpcional({ etiqueta, valor }: { etiqueta: string; valor?: string }) {
  if (valor === undefined || valor === '') return null;
  return (
    <p className="text-texto">
      <span className="font-medium">{etiqueta}:</span> {valor}
    </p>
  );
}

/** Una cuenta de `pagos[]`, en formato pensado para copiar al hacer una
 * transferencia: banco como encabezado, número de cuenta grande y en fuente
 * monoespaciada (se lee/copia mejor un número largo), titular/moneda debajo. */
function TarjetaPago({ pago }: { pago: DatosPago }) {
  return (
    <li className="flex flex-col gap-1 rounded-elemento border border-borde bg-superficie p-3">
      <span className="text-sm font-medium text-texto-secundario">{pago.banco}</span>
      <span className="select-all font-mono text-lg text-texto">{pago.cuenta}</span>
      {pago.titular !== undefined && <span className="text-sm text-texto">Titular: {pago.titular}</span>}
      {pago.moneda !== undefined && <span className="text-sm text-texto-secundario">{pago.moneda}</span>}
    </li>
  );
}

/**
 * Ficha de UN proveedor, en su propia ruta (`/stock/proveedor/:id`, ver
 * App.tsx — protegida por `RutaSoloAdmin`, docs/07-clientes-proveedores.md:
 * "el vendedor no ve datos bancarios ni costos de proveedor"). Mismo patrón
 * que `DetalleProductoPantalla`: query memoizada de proveedores activos,
 * búsqueda client-side por `id` de la URL.
 *
 * Trae datos completos + cuentas de pago (para copiar fácil al transferir) y
 * un placeholder de historial de compras (Fase 2, no implementado acá). Las
 * acciones de escritura (editar / desactivar) viven en el header, como
 * `DetalleProductoPantalla`.
 */
export function DetalleProveedorPantalla() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const [intento, setIntento] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [guardando, setGuardando] = useState(false);

  const proveedoresQuery = useMemo(
    () =>
      query(
        collection(db, 'proveedores').withConverter(proveedorConverter),
        where('activo', '==', true),
        orderBy('nombre'),
      ),
    [intento],
  );
  const { datos: proveedores, cargando, error } = useCollection(proveedoresQuery);

  const proveedor = proveedores.find((p) => p.id === id) ?? null;
  const noEncontrado = !cargando && error === null && proveedor === null;
  const tituloHeader = cargando ? 'Proveedor' : (proveedor?.nombre ?? 'Proveedor no encontrado');

  useHeader({
    titulo: tituloHeader,
    volverA: { etiqueta: 'Proveedores', a: '/stock/proveedores' },
    acciones:
      proveedor !== null ? (
        <>
          <Button onClick={() => setModal('editar')} className="min-h-[48px]">
            Editar
          </Button>
          <Button variante="secundaria" onClick={() => setModal('desactivar')} className="min-h-[48px]">
            Desactivar
          </Button>
        </>
      ) : undefined,
  });

  function reintentar() {
    setIntento((n) => n + 1);
  }

  function cerrarModal() {
    setModal(null);
  }

  function volverAlListado() {
    setModal(null);
    navigate('/stock/proveedores');
  }

  /** Mismo patrón híbrido de escrituras offline del proyecto (docs/06-ui-ux.md
   * §8), delegado a `actualizarProveedor` (packages/firebase-kit). */
  async function handleGuardar(datos: DatosProveedor) {
    if (proveedor === null) return;
    const escritura = actualizarProveedor(db, proveedor.id, datos);

    if (!enLinea) {
      cerrarModal();
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar la edición del proveedor.', 'error');
      });
      return;
    }

    setGuardando(true);
    try {
      await escritura;
      mostrarToast('Proveedor actualizado.', 'exito');
      cerrarModal();
    } catch {
      mostrarToast('No se pudo actualizar el proveedor. Intentá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <p className="py-8 text-center text-texto-secundario">Cargando proveedor…</p>;
  }

  if (error !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudo cargar el proveedor. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  }

  if (noEncontrado || proveedor === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No encontramos ese proveedor. Puede haberse desactivado.
        </p>
        <Link
          to="/stock/proveedores"
          className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
        >
          Volver a Proveedores
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-card border border-borde bg-superficie p-4">
        <h2 className="text-lg font-semibold text-texto">Contacto</h2>
        <CampoOpcional etiqueta="Contacto" valor={proveedor.contactoNombre} />
        <CampoOpcional etiqueta="Teléfono" valor={proveedor.telefono} />
        <CampoOpcional etiqueta="Correo" valor={proveedor.email} />
        <CampoOpcional etiqueta="Dirección" valor={proveedor.direccion} />
        <CampoOpcional etiqueta="RUT" valor={proveedor.rut} />
        {proveedor.contactoNombre === undefined &&
          proveedor.telefono === undefined &&
          proveedor.email === undefined &&
          proveedor.direccion === undefined &&
          proveedor.rut === undefined && (
            <p className="text-texto-secundario">Sin datos de contacto cargados.</p>
          )}
      </section>

      <section className="flex flex-col gap-2 rounded-card border border-borde bg-superficie p-4">
        <h2 className="text-lg font-semibold text-texto">Datos de pago</h2>
        {proveedor.pagos === undefined || proveedor.pagos.length === 0 ? (
          <p className="text-texto-secundario">Sin cuentas cargadas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {proveedor.pagos.map((pago, indice) => (
              <TarjetaPago key={indice} pago={pago} />
            ))}
          </ul>
        )}
      </section>

      {proveedor.notas !== undefined && proveedor.notas !== '' && (
        <section className="flex flex-col gap-2 rounded-card border border-borde bg-superficie p-4">
          <h2 className="text-lg font-semibold text-texto">Notas</h2>
          <p className="whitespace-pre-wrap text-texto">{proveedor.notas}</p>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-card border border-borde bg-superficie p-4">
        <h2 className="text-lg font-semibold text-texto">Historial de compras</h2>
        <p className="text-texto-secundario">Disponible con el módulo de compras (Fase 2).</p>
      </section>

      <ModalProveedor
        abierto={modal === 'editar'}
        proveedor={proveedor}
        guardando={guardando}
        onGuardar={(datos) => void handleGuardar(datos)}
        onCerrar={cerrarModal}
      />
      <ModalConfirmarDesactivarProveedor
        abierto={modal === 'desactivar'}
        onCerrar={cerrarModal}
        db={db}
        proveedor={proveedor}
        enLinea={enLinea}
        onDesactivado={volverAlListado}
      />
    </div>
  );
}
