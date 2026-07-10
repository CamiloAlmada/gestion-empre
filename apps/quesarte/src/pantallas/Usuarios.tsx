import { useMemo, useState } from 'react';
import { collection, doc, orderBy, query, updateDoc } from 'firebase/firestore';
import { Button, CampoBusqueda, DataTable, useToasts, type ColumnaDataTable } from '@gestion/ui';
import {
  DatosInvitacionInvalidosError,
  EmailInvalidoError,
  EmailYaRegistradoError,
  PerfilNoCreadoError,
  invitarUsuario,
  usuarioConverter,
  useAuth,
  useCollection,
  useOnlineStatus,
  type EntradaInvitacion,
} from '@gestion/firebase-kit';
import type { Rol, Usuario } from '@gestion/core';
import { db, obtenerConfigFirebase } from '../firebase';
import { ModalInvitarUsuario, type ErroresInvitacion } from './ModalInvitarUsuario';
import { useHeader } from '../componentes/header/ContextoHeader';

const coleccionUsuarios = collection(db, 'usuarios').withConverter(usuarioConverter);

// Mismas clases que la acción "Agregar" de `Clientes.tsx`/`Productos.tsx`/
// `Proveedores.tsx` (docs/06-ui-ux.md §2, 2026-07-10: la acción de AGREGAR es
// SIEMPRE un "+" cuadrado, solo ícono en mobile — "Invitar usuario" es la
// misma clase de acción, alta de una entidad nueva, así que sigue la misma
// regla en vez de quedar como pill con texto largo).
const CLASE_ACCION_PRIMARIA =
  'inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-control bg-primary-600 px-3 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie';

// Mensaje fijo (no el `.message` del error, más técnico) para el fallo
// parcial crítico de la invitación: instruye al admin qué hacer, ver JSDoc de
// `PerfilNoCreadoError` en packages/firebase-kit/src/errores.ts.
const MENSAJE_PERFIL_NO_CREADO =
  'La cuenta se creó pero el perfil no. Contactá al desarrollador para completarla desde la ' +
  'consola — reintentar con el mismo email va a fallar.';

const OPCIONES_ROL_FILA: { valor: Rol; etiqueta: string }[] = [
  { valor: 'admin', etiqueta: 'Administrador' },
  { valor: 'vendedor', etiqueta: 'Vendedor' },
];

interface ControlFilaProps {
  usuario: Usuario;
  disabled: boolean;
  onCambiarRol: (rol: Rol) => void;
}

/** Selector de rol por fila: mismo patrón visual que los grupos segmentados
 * de Ajustes.tsx / ModalProducto.tsx (`role="group"` + `aria-pressed`). */
function SelectorRolFila({ usuario, disabled, onCambiarRol }: ControlFilaProps) {
  return (
    <div
      role="group"
      aria-label={`Rol de ${usuario.nombre}`}
      className="inline-flex gap-1 rounded-control border border-borde p-1"
    >
      {OPCIONES_ROL_FILA.map((opcion) => {
        const activa = opcion.valor === usuario.rol;
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activa}
            disabled={disabled}
            onClick={() => {
              if (!activa) onCambiarRol(opcion.valor);
            }}
            className={`min-h-[44px] rounded-control px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-50 ${
              activa ? 'bg-primary-600 text-white' : 'text-texto-secundario hover:text-texto'
            }`}
          >
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleActivoFilaProps {
  usuario: Usuario;
  disabled: boolean;
  onCambiar: (activo: boolean) => void;
}

/** Switch de "Activo" por fila. `role="switch"` + `aria-checked` (patrón
 * accesible estándar); el texto ("Activo"/"Inactivo") acompaña siempre al
 * color, nunca se comunica solo por color (checklist §5). */
function ToggleActivoFila({ usuario, disabled, onCambiar }: ToggleActivoFilaProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={usuario.activo}
      aria-label={`${usuario.activo ? 'Desactivar' : 'Activar'} a ${usuario.nombre}`}
      disabled={disabled}
      onClick={() => onCambiar(!usuario.activo)}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-control border border-borde px-3 py-2 text-sm font-medium text-texto transition-colors hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${usuario.activo ? 'bg-exito' : 'bg-texto-secundario'}`}
      />
      {usuario.activo ? 'Activo' : 'Inactivo'}
    </button>
  );
}

/**
 * Pantalla "Usuarios" (Ajustes → Usuarios, solo admin — protegida además por
 * `RutaSoloAdmin` en App.tsx). Listado en vivo de `usuarios/{uid}` con
 * cambio de rol/estado in situ (update parcial directo, sin converter: las
 * reglas de Firestore solo permiten tocar `activo`/`rol`/`nombre`) e
 * invitación de cuentas nuevas por email (`invitarUsuario`, ver
 * packages/firebase-kit/src/invitaciones.ts).
 *
 * Protección de UI contra auto-lockout: el propio admin no puede
 * desactivarse ni quitarse el rol admin desde acá (las reglas SÍ lo
 * permitirían — es un footgun, no un agujero de seguridad).
 */
export function Usuarios() {
  const { perfil } = useAuth();
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const [busqueda, setBusqueda] = useState('');
  const [intentoId, setIntentoId] = useState(0);
  const [actualizandoUid, setActualizandoUid] = useState<string | null>(null);

  const [modalInvitarAbierto, setModalInvitarAbierto] = useState(false);
  const [invitando, setInvitando] = useState(false);
  const [erroresInvitacion, setErroresInvitacion] = useState<ErroresInvitacion>({});

  useHeader({
    titulo: 'Usuarios',
    volverA: { etiqueta: 'Ajustes', a: '/ajustes' },
    // "+" cuadrado (docs/06-ui-ux.md §2, 2026-07-10): única acción de esta
    // pantalla, misma forma que "Agregar cliente"/"Agregar proveedor" — el
    // texto completo vive en el `aria-label`. A diferencia de esas dos
    // pantallas, el estado vacío de acá (ver `vacio` de la `DataTable`, más
    // abajo) NO repite un botón "Invitar usuario" en texto — se deja así
    // deliberadamente en esta tarea (NAV-2) para no introducir una segunda
    // acción con el mismo nombre accesible mientras la lista está vacía
    // (ambigüedad en los tests existentes que corren justo sobre ese estado);
    // reportado al tech lead como posible mejora de discoverability a futuro.
    acciones: (
      <button
        type="button"
        onClick={abrirModalInvitar}
        aria-label="Invitar usuario"
        className={CLASE_ACCION_PRIMARIA}
      >
        <span aria-hidden="true">＋</span>
        <span className="hidden md:inline">Invitar</span>
      </button>
    ),
  });

  const consultaUsuarios = useMemo(
    () => query(coleccionUsuarios, orderBy('nombre')),
    [intentoId],
  );
  const { datos: usuarios, cargando, error } = useCollection(consultaUsuarios);

  const usuariosFiltrados = useMemo(() => {
    const consulta = busqueda.trim().toLowerCase();
    if (consulta === '') return usuarios;
    return usuarios.filter(
      (u) => u.nombre.toLowerCase().includes(consulta) || u.email.toLowerCase().includes(consulta),
    );
  }, [usuarios, busqueda]);

  function reintentar() {
    setIntentoId((n) => n + 1);
  }

  function abrirModalInvitar() {
    setErroresInvitacion({});
    setModalInvitarAbierto(true);
  }

  function cerrarModalInvitar() {
    setModalInvitarAbierto(false);
  }

  /**
   * Update parcial directo (sin converter): las reglas de `usuarios/{uid}`
   * solo permiten tocar `activo`/`rol`/`nombre`, y acá solo escribimos UNO de
   * esos campos por vez (patrón offline §8, igual que el resto de la app).
   */
  async function actualizarCampo(usuario: Usuario, cambios: Partial<Pick<Usuario, 'rol' | 'activo'>>) {
    const ref = doc(db, 'usuarios', usuario.uid);
    const escritura = updateDoc(ref, cambios);
    setActualizandoUid(usuario.uid);

    if (!enLinea) {
      setActualizandoUid(null);
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar el cambio en el usuario.', 'error');
      });
      return;
    }

    try {
      await escritura;
      mostrarToast('Usuario actualizado.', 'exito');
    } catch {
      mostrarToast('No se pudo actualizar el usuario. Intentá de nuevo.', 'error');
    } finally {
      setActualizandoUid(null);
    }
  }

  function handleCambiarRol(usuario: Usuario, nuevoRol: Rol) {
    if (usuario.uid === perfil?.uid) return; // auto-lockout: ver ControlFilaProps.disabled
    void actualizarCampo(usuario, { rol: nuevoRol });
  }

  function handleCambiarActivo(usuario: Usuario, nuevoActivo: boolean) {
    if (usuario.uid === perfil?.uid) return;
    void actualizarCampo(usuario, { activo: nuevoActivo });
  }

  async function handleInvitar(entrada: EntradaInvitacion) {
    setErroresInvitacion({});
    setInvitando(true);
    try {
      await invitarUsuario(db, obtenerConfigFirebase(), entrada);
      mostrarToast(`Invitación enviada a ${entrada.email}`, 'exito');
      cerrarModalInvitar();
    } catch (err) {
      if (err instanceof EmailYaRegistradoError) {
        setErroresInvitacion({ email: 'Ya existe una cuenta con ese correo.' });
      } else if (err instanceof EmailInvalidoError) {
        setErroresInvitacion({ email: err.message });
      } else if (err instanceof DatosInvitacionInvalidosError) {
        setErroresInvitacion({ nombre: err.message });
      } else if (err instanceof PerfilNoCreadoError) {
        // Fallo parcial crítico: reintentar con el mismo email va a fallar
        // igual (la cuenta de Auth ya existe). No tiene sentido dejar el
        // modal abierto para un reintento condenado a fallar.
        mostrarToast(MENSAJE_PERFIL_NO_CREADO, 'error');
        cerrarModalInvitar();
      } else {
        mostrarToast('No se pudo enviar la invitación. Intentá de nuevo.', 'error');
      }
    } finally {
      setInvitando(false);
    }
  }

  function estaDeshabilitado(u: Usuario): boolean {
    return u.uid === perfil?.uid || actualizandoUid === u.uid;
  }

  const columnas: ColumnaDataTable<Usuario>[] = [
    {
      clave: 'nombre',
      titulo: 'Nombre',
      render: (u) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-texto">{u.nombre}</span>
          {u.uid === perfil?.uid && (
            <span className="text-xs text-texto-secundario">No podés modificar tu propia cuenta.</span>
          )}
        </div>
      ),
    },
    { clave: 'email', titulo: 'Correo', render: (u) => u.email },
    {
      clave: 'rol',
      titulo: 'Rol',
      render: (u) => (
        <SelectorRolFila usuario={u} disabled={estaDeshabilitado(u)} onCambiarRol={(rol) => handleCambiarRol(u, rol)} />
      ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      render: (u) => (
        <ToggleActivoFila
          usuario={u}
          disabled={estaDeshabilitado(u)}
          onCambiar={(activo) => handleCambiarActivo(u, activo)}
        />
      ),
    },
  ];

  /**
   * Fila compacta para mobile (`< md`, docs/06-ui-ux.md §3): nombre + correo
   * chico debajo, y los mismos controles de rol/estado que la tabla en
   * desktop (mismos componentes, mismos handlers) apilados abajo — a
   * diferencia de Productos, acá no hay una única "acción de fila" que
   * navegue a otro lado, son controles inline, así que no tiene sentido
   * envolver todo en un botón tappable.
   */
  function filaCompactaUsuario(u: Usuario) {
    return (
      <div className="flex min-h-[56px] flex-col gap-2 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-texto">{u.nombre}</span>
          <span className="text-sm text-texto-secundario">{u.email}</span>
          {u.uid === perfil?.uid && (
            <span className="text-xs text-texto-secundario">No podés modificar tu propia cuenta.</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectorRolFila usuario={u} disabled={estaDeshabilitado(u)} onCambiarRol={(rol) => handleCambiarRol(u, rol)} />
          <ToggleActivoFila
            usuario={u}
            disabled={estaDeshabilitado(u)}
            onCambiar={(activo) => handleCambiarActivo(u, activo)}
          />
        </div>
      </div>
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
          <span>Sin conexión: no se pueden invitar usuarios hasta reconectar.</span>
        </div>
      )}

      <CampoBusqueda valor={busqueda} onChange={setBusqueda} ariaLabel="Buscar usuario" placeholder="Nombre o correo" />

      {cargando ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-texto-secundario">Cargando usuarios…</p>
        </div>
      ) : error !== null ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie p-8 text-center"
        >
          <p className="text-peligro">No se pudieron cargar los usuarios.</p>
          <p className="text-sm text-texto-secundario">Revisá tu conexión e intentá de nuevo.</p>
          <Button variante="secundaria" onClick={reintentar}>
            Reintentar
          </Button>
        </div>
      ) : (
        <DataTable
          columnas={columnas}
          filas={usuariosFiltrados}
          claveFila={(u) => u.uid}
          etiqueta="Usuarios"
          filaCompacta={filaCompactaUsuario}
          vacio={
            usuarios.length === 0 ? (
              <p>No hay usuarios todavía.</p>
            ) : (
              `No se encontraron usuarios para "${busqueda.trim()}".`
            )
          }
        />
      )}

      <ModalInvitarUsuario
        abierto={modalInvitarAbierto}
        invitando={invitando}
        enLinea={enLinea}
        erroresServidor={erroresInvitacion}
        onInvitar={(entrada) => void handleInvitar(entrada)}
        onCerrar={cerrarModalInvitar}
      />
    </div>
  );
}
