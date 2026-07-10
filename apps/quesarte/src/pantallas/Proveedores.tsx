import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { collection, orderBy, query } from 'firebase/firestore';
import type { Proveedor } from '@gestion/core';
import {
  crearProveedor,
  proveedorConverter,
  useCollection,
  useOnlineStatus,
  type DatosProveedor,
} from '@gestion/firebase-kit';
import { Button, CampoBusqueda, normalizarBusqueda, useToasts } from '@gestion/ui';
import { db } from '../firebase';
import { ModalProveedor } from './ModalProveedor';
import { useHeader } from '../componentes/header/ContextoHeader';

// Mismas clases que la acción "Agregar" de `Clientes.tsx`/`Productos.tsx`
// (docs/06-ui-ux.md §2, 2026-07-10: la acción de AGREGAR es SIEMPRE un "+"
// cuadrado, solo ícono en mobile, nunca un botón con texto largo como
// "Agregar proveedor" en el cluster — ese texto vive en el `aria-label` y en
// el botón del estado vacío, más abajo).
const CLASE_ACCION_PRIMARIA =
  'inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-control bg-primary-600 px-3 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie';

/** Segunda línea de la fila: contacto y/o teléfono, unidos si hay ambos. */
function textoContacto(proveedor: Proveedor): string {
  return [proveedor.contactoNombre, proveedor.telefono].filter((v): v is string => !!v).join(' · ');
}

interface FilaProveedorProps {
  proveedor: Proveedor;
  onSeleccionar: () => void;
}

/** Un proveedor desactivado (`activo: false`, visible solo con el toggle
 * "Mostrar inactivos") lleva un badge "Inactivo" — mismo criterio visual que
 * `ListaClientes` (docs/06-ui-ux.md §5: nunca se comunica solo con color). */
function FilaProveedor({ proveedor, onSeleccionar }: FilaProveedorProps) {
  const contacto = textoContacto(proveedor);
  return (
    <li>
      <button
        type="button"
        onClick={onSeleccionar}
        className="flex min-h-[56px] w-full items-center gap-2 rounded-elemento border border-borde bg-superficie p-4 text-left transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-texto">{proveedor.nombre}</span>
            {!proveedor.activo && (
              <span className="rounded-full border border-borde px-2 py-0.5 text-xs text-texto-secundario">
                Inactivo
              </span>
            )}
          </div>
          {contacto !== '' && <span className="text-sm text-texto-secundario">{contacto}</span>}
        </div>
        <span aria-hidden="true" className="text-texto-secundario">
          ›
        </span>
      </button>
    </li>
  );
}

/**
 * Listado de proveedores (sección interna del tab Stock, solo admin — la
 * ruta ya está protegida por `RutaSoloAdmin` en App.tsx, mismo patrón que
 * `Usuarios.tsx`: no hace falta re-chequear el rol acá adentro). Orden
 * alfabético. Los proveedores son pocos: una lista simple con búsqueda por
 * nombre, sin la maquinaria de `DataTable` (no hay columnas que ganarse el
 * lugar, solo nombre + contacto — docs/06-ui-ux.md §1 "ante la duda, menos").
 *
 * Toggle "Mostrar inactivos" (unificado al patrón de `Clientes.tsx`, tarea
 * RE-1): la query trae TODA la colección ordenada por nombre — sin
 * `where('activo','==',true)` — y el filtro por `activo` es client-side, para
 * que un proveedor desactivado se pueda encontrar y reactivar desde acá (antes
 * quedaba invisible sin recurso). El índice compuesto `proveedores (activo,
 * nombre)` de `firestore.indexes.json` queda sin consumidor tras este cambio
 * (reportado al tech lead, no se borra desde esta tarea).
 *
 * Tocar una fila navega a su ficha (`/stock/proveedor/:id`, ruta real). El
 * alta se hace acá (acción de header, como Productos); edición, desactivación
 * y reactivación viven en la ficha (`DetalleProveedorPantalla`).
 */
export function Proveedores() {
  const navigate = useNavigate();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [modalAltaAbierto, setModalAltaAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Fuerza resuscripción al "Reintentar" (misma técnica que Stock/Productos:
  // useCollection resuscribe por identidad de query, no por contenido).
  const [intentoId, setIntentoId] = useState(0);

  useHeader({
    titulo: 'Proveedores',
    volverA: { etiqueta: 'Stock', a: '/stock' },
    acciones: (
      <button
        type="button"
        onClick={() => setModalAltaAbierto(true)}
        aria-label="Agregar proveedor"
        className={CLASE_ACCION_PRIMARIA}
      >
        <span aria-hidden="true">＋</span>
        <span className="hidden md:inline">Agregar</span>
      </button>
    ),
  });

  const consultaProveedores = useMemo(
    () => query(collection(db, 'proveedores').withConverter(proveedorConverter), orderBy('nombre')),
    [intentoId],
  );
  const { datos: proveedores, cargando, error } = useCollection(consultaProveedores);

  const proveedoresFiltrados = useMemo(() => {
    const consulta = normalizarBusqueda(busqueda.trim());
    return proveedores.filter((p) => {
      if (!mostrarInactivos && !p.activo) return false;
      if (consulta === '') return true;
      return normalizarBusqueda(p.nombre).includes(consulta);
    });
  }, [proveedores, busqueda, mostrarInactivos]);

  function reintentar() {
    setIntentoId((n) => n + 1);
  }

  /**
   * Alta de proveedor: mismo patrón híbrido de escrituras offline del
   * proyecto (docs/06-ui-ux.md §8) que `Productos.tsx` — acá delegado a
   * `crearProveedor` (packages/firebase-kit), que ya arma el documento y
   * valida el nombre.
   */
  async function handleCrear(datos: DatosProveedor) {
    const escritura = crearProveedor(db, datos);

    if (!enLinea) {
      setModalAltaAbierto(false);
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar el proveedor creado.', 'error');
      });
      return;
    }

    setGuardando(true);
    try {
      await escritura;
      mostrarToast('Proveedor creado.', 'exito');
      setModalAltaAbierto(false);
    } catch {
      mostrarToast('No se pudo crear el proveedor. Intentá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  let contenido;
  if (cargando) {
    contenido = <p className="py-8 text-center text-texto-secundario">Cargando proveedores…</p>;
  } else if (error !== null) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudieron cargar los proveedores. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  } else if (proveedores.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">No hay proveedores todavía.</p>
        <Button onClick={() => setModalAltaAbierto(true)}>Agregar proveedor</Button>
      </div>
    );
  } else if (proveedoresFiltrados.length === 0) {
    contenido = (
      <p className="py-8 text-center text-texto-secundario">
        No se encontraron proveedores para "{busqueda.trim()}".
      </p>
    );
  } else {
    contenido = (
      <ul role="list" className="flex flex-col gap-2">
        {proveedoresFiltrados.map((proveedor) => (
          <FilaProveedor
            key={proveedor.id}
            proveedor={proveedor}
            onSeleccionar={() => navigate(`/stock/proveedor/${proveedor.id}`)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!enLinea && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-elemento border border-borde bg-superficie px-4 py-3 text-sm text-advertencia"
        >
          <span aria-hidden="true">⚠</span>
          <span>Sin conexión: los cambios se sincronizarán al reconectar.</span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <CampoBusqueda valor={busqueda} onChange={setBusqueda} ariaLabel="Buscar proveedor" placeholder="Nombre" />
        </div>
        <button
          type="button"
          aria-pressed={mostrarInactivos}
          onClick={() => setMostrarInactivos((v) => !v)}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1 focus-visible:ring-offset-superficie ${
            mostrarInactivos
              ? 'border-2 border-primary-600 text-primary-700 dark:text-primary-300'
              : 'border-borde text-texto-secundario'
          }`}
        >
          {mostrarInactivos && <span aria-hidden="true">✓</span>}
          Mostrar inactivos
        </button>
      </div>

      {contenido}

      <ModalProveedor
        abierto={modalAltaAbierto}
        proveedor={null}
        guardando={guardando}
        onGuardar={(datos) => void handleCrear(datos)}
        onCerrar={() => setModalAltaAbierto(false)}
      />
    </div>
  );
}
