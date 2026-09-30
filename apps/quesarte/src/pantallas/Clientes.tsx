import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { collection, doc, orderBy, query, where } from 'firebase/firestore';
import { agruparDeudaPorCliente } from '@gestion/core';
import { Button, CampoBusqueda, ChipsFiltro, useToasts } from '@gestion/ui';
import {
  clienteConverter,
  configuracionConverter,
  crearCliente,
  useAuth,
  useCollection,
  useDoc,
  useOnlineStatus,
  ventaConverter,
} from '@gestion/firebase-kit';
import type { DatosCliente } from '@gestion/firebase-kit';
import { db } from '../firebase';
import { useHeader } from '../componentes/header/ContextoHeader';
import { IconoHistorial } from '../componentes/iconos';
import { ListaClientes } from '../componentes/clientes/ListaClientes';
import { ListaClientesConDeuda, type FilaDeuda } from '../componentes/clientes/ListaClientesConDeuda';
import { ListaClientesInactivos } from '../componentes/clientes/ListaClientesInactivos';
import { calcularClientesInactivos } from '../componentes/clientes/inactividad';
import { filtrarClientes, type FiltroClientes } from '../componentes/clientes/filtro';
import { ModalCliente } from './ModalCliente';

const coleccionClientes = collection(db, 'clientes').withConverter(clienteConverter);
const coleccionVentas = collection(db, 'ventas').withConverter(ventaConverter);

// Mismas clases que la acción "Agregar producto" de `Productos.tsx`: ícono
// solo en mobile (flota sobre la tab bar, ≥48px) con label visible desde `md:`.
const CLASE_ACCION_PRIMARIA =
  'inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-control bg-primary-600 px-3 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie';

/** Etiquetas de los chips (`ChipsFiltro` de `@gestion/ui`, que ya antepone
 * "Todas"/`null` sola): acá se pisa a "Todos" con `etiquetaTodas`. La terna
 * `Todos | Activos | Inactivos` es para todos los roles; "Deben" (doc 11,
 * cobros diferidos) es un 4.º chip SOLO para admin. */
const OPCIONES_TERNA = ['Activos', 'Inactivos'] as const;
const OPCION_DEBEN = 'Deben';
type OpcionChip = (typeof OPCIONES_TERNA)[number] | typeof OPCION_DEBEN;

/** Adapta el valor de `ChipsFiltro` (`OpcionChip | null`) al tipo de dominio
 * `FiltroClientes` que consume `filtrarClientes`/`calcularClientesInactivos`.
 * "Deben" no es un filtro de clientes (su lista sale de las ventas a cobrar):
 * para `filtrarClientes` equivale a `todos`, y la búsqueda se aplica igual. */
function filtroDesdeChip(valor: string | null): FiltroClientes {
  if (valor === 'Activos') return 'activos';
  if (valor === 'Inactivos') return 'inactivos';
  return 'todos';
}

/** Mensaje de estado vacío cuando el filtro elegido no tiene resultados y NO
 * hay búsqueda activa (con búsqueda, siempre se usa el mensaje genérico "No
 * se encontraron clientes para…", ver `contenido` más abajo). */
function mensajeVacioSinBusqueda(filtro: FiltroClientes): string {
  if (filtro === 'inactivos') return 'Ningún cliente inactivo por ahora.';
  if (filtro === 'activos') return 'No hay clientes activos por ahora.';
  return 'No hay clientes para mostrar.';
}

/**
 * Listado de Clientes: RAÍZ del tab (docs/06-ui-ux.md §2, 2026-07-10 —
 * decisión del dueño: con el módulo de clientes recién lanzado, es la
 * entrada de uso diario). Sin `volverA`: es tab raíz, igual que
 * `Stock.tsx`/`Venta.tsx`. Trae TODA la colección `clientes` con UNA
 * `useCollection` memoizada (ordenada por nombre; colección chica, sin
 * queries por prefijo) y filtra client-side por búsqueda y por la terna de
 * chips `Todos | Activos | Inactivos` (WA-G, docs/06-ui-ux.md §3) — ningún
 * cambio de filtro toca la query, solo `filtrarClientes`/
 * `calcularClientesInactivos`.
 *
 * La terna reemplaza al toggle "Mostrar inactivos" (dados de baja) Y a la ex
 * pantalla dedicada `/clientes/inactivos` (inactividad COMERCIAL, doc 08):
 * - **Todos**: vigentes + dados de baja (`activo: false`, atenuados con
 *   badge en `ListaClientes` — mismo tratamiento que ya existía).
 * - **Activos**: solo vigentes que NO están inactivos por ritmo comercial.
 * - **Inactivos**: solo vigentes inactivos por ritmo comercial, con fila
 *   enriquecida (`ListaClientesInactivos`: días sin venir, total histórico,
 *   botón WhatsApp "Te extrañamos"), ordenados por valor histórico
 *   descendente (`calcularClientesInactivos`, ya no vive en una pantalla
 *   propia). Visible para cualquier rol: lo que era admin-only era la
 *   PANTALLA dedicada (privacidad de navegar a datos de fidelización); como
 *   chip del listado común que ya ve todo el mundo, deja de restringirse
 *   (docs/06-ui-ux.md §3 no lo pide, y el botón de WhatsApp ya es visible
 *   para `vendedor` en el resto de la app sin exponer el número).
 *
 * **Deben** (4.º chip, SOLO admin, doc 11): clientes con ventas a cobrar,
 * los que deben hace más tiempo primero (`agruparDeudaPorCliente` de core),
 * con `ListaClientesConDeuda` (fila → ficha, botón WhatsApp de cobro). Es el
 * único chip con su propia query (`ventas` a cobrar), suscripta recién al
 * elegirlo.
 *
 * El alta la puede disparar tanto `vendedor` como `admin` (doc 07: alta
 * rápida de mostrador con las reglas ya lo permiten); la edición y la
 * desactivación son exclusivas del admin y viven en la ficha
 * (`DetalleClientePantalla`), no acá.
 */
export function Clientes() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const esAdmin = perfil?.rol === 'admin';
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const [busqueda, setBusqueda] = useState('');
  const [chip, setChip] = useState<OpcionChip | null>(null);
  const filtro = filtroDesdeChip(chip);
  // "Deben" solo existe para admin: aunque `chip` quedara en 'Deben' (cambio
  // de perfil en caliente), un no-admin nunca suscribe la query de ventas.
  const mostrandoDeben = esAdmin && chip === OPCION_DEBEN;
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Se incrementa en "Reintentar": cambia la identidad de la query y fuerza a
  // `useCollection` a resuscribirse (mismo patrón que Stock.tsx/Productos.tsx).
  const [intentoId, setIntentoId] = useState(0);

  // `ahora` fijo por el ciclo de vida del componente (no `Date.now()` en cada
  // render, mismo criterio que la ex `ClientesInactivos.tsx`): la
  // clasificación de inactividad comercial es por días.
  const [ahora] = useState(() => new Date());

  // `configuracion/general` (WA-F1, hallazgo de integración de la tanda WA):
  // `crearCliente` deriva `telefonoE164` con el `codigoPais` que se le pase
  // (default '598' si no se pasa nada) — sin esto, un negocio con
  // `codigoPaisDefault` distinto (p. ej. Argentina '54') persistía el
  // teléfono con el prefijo uruguayo. `useDoc` es cache-first (persistencia
  // offline ya habilitada, ver docs/06-ui-ux.md §8): no agrega una espera al
  // alta, solo lee lo que ya esté en caché (o `undefined` mientras no hay
  // nada, y el kit aplica su default).
  const configuracionRef = useMemo(
    () => doc(db, 'configuracion', 'general').withConverter(configuracionConverter),
    [],
  );
  const configuracion = useDoc(configuracionRef);

  useHeader({
    titulo: 'Clientes',
    // Historial (consulta cruzada, WA-G 2026-07-13, decidido por el dueño
    // tras ensayar la demo: reemplaza a la píldora flotante "Historial", que
    // saturaba el cluster). Regla general de docs/06-ui-ux.md §2 (generaliza
    // la excepción que antes era solo de Venta): las acciones-ÍCONO de
    // consulta ocasional van al header SIEMPRE (`accionHeader`, sin dual-
    // render), no compiten con la zona del pulgar porque no son operaciones.
    // Mismo ícono/patrón que `Venta.tsx`.
    accionHeader: (
      <Link
        to="/historial"
        aria-label="Ver historial de ventas"
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-texto-secundario hover:bg-fondo hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        <IconoHistorial className="h-6 w-6" />
      </Link>
    ),
    acciones: (
      <button
        type="button"
        onClick={() => setAltaAbierta(true)}
        aria-label="Agregar cliente"
        className={CLASE_ACCION_PRIMARIA}
      >
        <span aria-hidden="true">＋</span>
        <span className="hidden md:inline">Agregar</span>
      </button>
    ),
  });

  const consultaClientes = useMemo(() => query(coleccionClientes, orderBy('nombre')), [intentoId]);
  const { datos: clientes, cargando, error } = useCollection(consultaClientes);

  // Ventas a cobrar (doc 11): SOLO se suscribe al elegir el chip "Deben" (antes
  // la query es `null` y `useCollection` no abre listener). Índice compuesto
  // `ventas (estado, cobro.estado, fecha DESC)` en `firestore.indexes.json`.
  const consultaDeudas = useMemo(
    () =>
      mostrandoDeben
        ? query(
            coleccionVentas,
            where('estado', '==', 'completada'),
            where('cobro.estado', '==', 'pendiente'),
            orderBy('fecha', 'desc'),
          )
        : null,
    [mostrandoDeben, intentoId],
  );
  const deudas = useCollection(consultaDeudas, { seguirFrescura: true });

  const clientesFiltrados = useMemo(
    () => filtrarClientes(clientes, busqueda, filtro, ahora),
    [clientes, busqueda, filtro, ahora],
  );
  // Solo se calcula (y solo se usa) bajo el chip "Inactivos": enriquece el
  // subconjunto que `filtrarClientes` ya recortó (búsqueda + ritmo
  // comercial) con días sin venir y lo reordena por valor histórico desc.
  const inactivosEnriquecidos = useMemo(
    () => (filtro === 'inactivos' ? calcularClientesInactivos(clientesFiltrados, ahora) : []),
    [filtro, clientesFiltrados, ahora],
  );

  // Lista "Deben": core agrupa y ordena (deuda más vieja primero); acá solo se
  // cruza con los clientes cargados (teléfono) y se aplica la búsqueda. Sin
  // búsqueda entran todas las deudas, aunque el cliente no esté en la lista
  // cargada (el botón de WhatsApp simplemente no aparece sin teléfono).
  const filasDeuda = useMemo<FilaDeuda[]>(() => {
    if (!mostrandoDeben) return [];
    const porId = new Map(clientes.map((c) => [c.id, c]));
    const idsVisibles =
      busqueda.trim() === '' ? null : new Set(clientesFiltrados.map((c) => c.id));
    return agruparDeudaPorCliente(deudas.datos, new Date())
      .filter((d) => idsVisibles === null || idsVisibles.has(d.clienteId))
      .map((deuda) => ({ deuda, cliente: porId.get(deuda.clienteId) }));
  }, [mostrandoDeben, deudas.datos, clientes, clientesFiltrados, busqueda]);

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
    const { confirmacion } = crearCliente(db, datos, configuracion.datos?.codigoPaisDefault);

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

  const vacio = filtro === 'inactivos' ? inactivosEnriquecidos.length === 0 : clientesFiltrados.length === 0;

  /** Contenido del chip "Deben": cargando / error / vacío / lista, más la nota
   * de datos posiblemente incompletos si el snapshot viene de la caché. */
  function renderDeben() {
    if (deudas.cargando) {
      return <p className="py-8 text-center text-texto-secundario">Cargando deudas…</p>;
    }
    if (deudas.error !== null) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
          <p role="alert" className="text-peligro">
            No se pudieron cargar las deudas. Revisá tu conexión e intentá de nuevo.
          </p>
          <Button onClick={reintentar}>Reintentar</Button>
        </div>
      );
    }
    return (
      <>
        {deudas.desdeCache && (
          <p role="status" className="text-sm text-texto-secundario">
            Sin conexión: puede faltar información
          </p>
        )}
        {filasDeuda.length === 0 ? (
          <div className="rounded-card border border-borde bg-superficie p-8 text-center text-texto-secundario">
            {busqueda.trim() === ''
              ? 'Nadie debe por ahora.'
              : `No se encontraron clientes para "${busqueda.trim()}".`}
          </div>
        ) : (
          <ListaClientesConDeuda
            filas={filasDeuda}
            db={db}
            onSeleccionar={(clienteId) => navigate(`/clientes/cliente/${clienteId}`)}
          />
        )}
      </>
    );
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
  } else if (mostrandoDeben) {
    contenido = renderDeben();
  } else if (clientes.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center">
        <p className="text-texto-secundario">Todavía no hay clientes.</p>
        <Button onClick={() => setAltaAbierta(true)}>Agregar cliente</Button>
      </div>
    );
  } else if (vacio) {
    contenido = (
      <div className="rounded-card border border-borde bg-superficie p-8 text-center text-texto-secundario">
        {busqueda.trim() === ''
          ? mensajeVacioSinBusqueda(filtro)
          : `No se encontraron clientes para "${busqueda.trim()}".`}
      </div>
    );
  } else if (filtro === 'inactivos') {
    contenido = <ListaClientesInactivos clientes={inactivosEnriquecidos} db={db} />;
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
      <ChipsFiltro
        opciones={esAdmin ? [...OPCIONES_TERNA, OPCION_DEBEN] : [...OPCIONES_TERNA]}
        valor={chip}
        onCambiar={(valor) => setChip(valor as OpcionChip | null)}
        ariaLabel="Filtrar clientes"
        etiquetaTodas="Todos"
      />

      {contenido}

      <ModalCliente
        abierto={altaAbierta}
        cliente={null}
        guardando={guardando}
        onGuardar={handleGuardar}
        onCerrar={() => setAltaAbierta(false)}
        codigoPaisDefault={configuracion.datos?.codigoPaisDefault}
      />
    </div>
  );
}
