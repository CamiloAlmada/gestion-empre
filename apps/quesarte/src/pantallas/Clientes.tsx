import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { collection, orderBy, query } from 'firebase/firestore';
import { Button, CampoBusqueda, Chip, useToasts } from '@gestion/ui';
import { clienteConverter, crearCliente, useCollection, useOnlineStatus } from '@gestion/firebase-kit';
import type { DatosCliente } from '@gestion/firebase-kit';
import { db } from '../firebase';
import { useHeader } from '../componentes/header/ContextoHeader';
import { ListaClientes } from '../componentes/clientes/ListaClientes';
import { filtrarClientes } from '../componentes/clientes/filtro';
import { ModalCliente } from './ModalCliente';

const coleccionClientes = collection(db, 'clientes').withConverter(clienteConverter);

// Mismas clases que la acción "Agregar producto" de `Productos.tsx`: ícono
// solo en mobile (flota sobre la tab bar, ≥48px) con label visible desde `md:`.
const CLASE_ACCION_PRIMARIA =
  'inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-control bg-primary-600 px-3 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie';

/**
 * Listado de Clientes: RAÍZ del tab (docs/06-ui-ux.md §2, 2026-07-10 —
 * decisión del dueño: con el módulo de clientes recién lanzado, es la
 * entrada de uso diario). Sin `volverA`: es tab raíz, igual que
 * `Stock.tsx`/`Venta.tsx`. Trae TODA la colección `clientes` con UNA
 * `useCollection` memoizada (ordenada por nombre; colección chica, sin
 * queries por prefijo) y filtra client-side por búsqueda (nombre/alias/
 * teléfono) y por `activo` — el toggle "Mostrar inactivos" no cambia la
 * query, solo el filtro (ver `filtrarClientes`).
 *
 * El alta la puede disparar tanto `vendedor` como `admin` (doc 07: alta
 * rápida de mostrador con las reglas ya lo permiten); la edición y la
 * desactivación son exclusivas del admin y viven en la ficha
 * (`DetalleClientePantalla`), no acá.
 */
export function Clientes() {
  const navigate = useNavigate();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Se incrementa en "Reintentar": cambia la identidad de la query y fuerza a
  // `useCollection` a resuscribirse (mismo patrón que Stock.tsx/Productos.tsx).
  const [intentoId, setIntentoId] = useState(0);

  useHeader({
    titulo: 'Clientes',
    acciones: (
      <>
        {/* Historial general (consulta cruzada, docs/06-ui-ux.md §2): acción
            de navegación interna, con etiqueta de texto, a la izquierda del
            "+" (2026-07-10: el orden y la forma de las acciones son un
            contrato — el AGREGAR va SIEMPRE al extremo derecho). */}
        <Link
          to="/historial"
          className="inline-flex min-h-[48px] items-center justify-center rounded-control border border-borde bg-superficie px-3 text-sm font-medium text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
        >
          Historial
        </Link>
        <button
          type="button"
          onClick={() => setAltaAbierta(true)}
          aria-label="Agregar cliente"
          className={CLASE_ACCION_PRIMARIA}
        >
          <span aria-hidden="true">＋</span>
          <span className="hidden md:inline">Agregar</span>
        </button>
      </>
    ),
  });

  const consultaClientes = useMemo(() => query(coleccionClientes, orderBy('nombre')), [intentoId]);
  const { datos: clientes, cargando, error } = useCollection(consultaClientes);

  const clientesFiltrados = useMemo(
    () => filtrarClientes(clientes, busqueda, mostrarInactivos),
    [clientes, busqueda, mostrarInactivos],
  );

  function reintentar() {
    setIntentoId((n) => n + 1);
  }

  /**
   * Mismo patrón híbrido de escrituras offline del proyecto (docs/06-ui-ux.md
   * §8, ver `Productos.tsx`): en línea espera el ack antes de avisar; sin
   * conexión dispara sin esperar (la caché local ya la aplicó), cierra el
   * modal al toque y avisa que falta sincronizar.
   */
  function handleGuardar(datos: DatosCliente) {
    // `crearCliente` genera el id client-side y devuelve `confirmacion` (el ack
    // del setDoc). Esta pantalla no necesita el id (navega al listado), solo
    // observa `confirmacion` para el aviso online/offline.
    const { confirmacion } = crearCliente(db, datos);

    if (!enLinea) {
      setAltaAbierta(false);
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      confirmacion.catch(() => {
        mostrarToast('No se pudo sincronizar el cliente creado.', 'error');
      });
      return;
    }

    setGuardando(true);
    confirmacion
      .then(() => {
        mostrarToast('Cliente creado.', 'exito');
        setAltaAbierta(false);
      })
      .catch(() => {
        mostrarToast('No se pudo crear el cliente. Intentá de nuevo.', 'error');
      })
      .finally(() => {
        setGuardando(false);
      });
  }

  let contenido;
  if (cargando) {
    contenido = <p className="py-8 text-center text-texto-secundario">Cargando clientes…</p>;
  } else if (error !== null) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p role="alert" className="text-peligro">
          No se pudieron cargar los clientes. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button onClick={reintentar}>Reintentar</Button>
      </div>
    );
  } else if (clientes.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">Todavía no hay clientes.</p>
        <Button onClick={() => setAltaAbierta(true)}>Agregar cliente</Button>
      </div>
    );
  } else if (clientesFiltrados.length === 0) {
    contenido = (
      <div className="rounded-card border border-borde bg-superficie p-8 text-center text-texto-secundario">
        No se encontraron clientes para &quot;{busqueda.trim()}&quot;.
      </div>
    );
  } else {
    contenido = (
      <ListaClientes
        clientes={clientesFiltrados}
        onSeleccionar={(cliente) => navigate(`/clientes/cliente/${cliente.id}`)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CampoBusqueda
        valor={busqueda}
        onChange={setBusqueda}
        ariaLabel="Buscar cliente"
        placeholder="Nombre, alias o teléfono"
      />
      <div className="flex flex-wrap gap-3">
        <Chip activo={mostrarInactivos} onClick={() => setMostrarInactivos((v) => !v)}>
          Mostrar inactivos
        </Chip>
      </div>

      {contenido}

      <ModalCliente
        abierto={altaAbierta}
        cliente={null}
        guardando={guardando}
        onGuardar={handleGuardar}
        onCerrar={() => setAltaAbierta(false)}
      />
    </div>
  );
}
