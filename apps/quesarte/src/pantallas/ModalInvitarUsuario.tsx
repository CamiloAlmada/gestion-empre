import { useEffect, useState } from 'react';
import { Button, Input, Modal } from '@gestion/ui';
import type { Rol } from '@gestion/core';
import type { EntradaInvitacion } from '@gestion/firebase-kit';

/** Errores de campo mostrados en el formulario: locales (requeridos vacíos) o
 * mapeados por `Usuarios.tsx` desde los errores tipados de `invitarUsuario`. */
export interface ErroresInvitacion {
  email?: string;
  nombre?: string;
}

export interface ModalInvitarUsuarioProps {
  abierto: boolean;
  /** `true` mientras `onInvitar` está resolviendo (deshabilita el formulario). */
  invitando: boolean;
  /** La invitación necesita red (crea una cuenta de Auth): sin conexión, el
   * botón de invitar se deshabilita y se explica por qué (no se ofrece un
   * flujo "sin conexión" para esta escritura, a diferencia del resto de la
   * app — ver docs/04-plan-fases.md, nota "Auth y alta de usuarios"). */
  enLinea: boolean;
  /** Errores de campo que vienen del último intento fallido contra
   * `invitarUsuario` (mapeados por el padre desde sus errores tipados). */
  erroresServidor: ErroresInvitacion;
  onInvitar: (entrada: EntradaInvitacion) => void;
  onCerrar: () => void;
}

const OPCIONES_ROL: { valor: Rol; etiqueta: string }[] = [
  { valor: 'vendedor', etiqueta: 'Vendedor' },
  { valor: 'admin', etiqueta: 'Administrador' },
];

/**
 * Modal de invitación (alta) de usuario. Instancia estable (mismo patrón que
 * `ModalProducto`): no se desmonta al cerrar, el formulario se resetea vía
 * efecto cuando `abierto` pasa a `true`.
 *
 * Es "tonto" en el mismo sentido que `ModalProducto`: no toca Firestore/Auth
 * directamente. Valida localmente los requeridos (fail fast) y delega el
 * alta real a `onInvitar`; el padre (`Usuarios.tsx`) es quien llama a
 * `invitarUsuario` y traduce sus errores tipados a `erroresServidor`.
 */
export function ModalInvitarUsuario({
  abierto,
  invitando,
  enLinea,
  erroresServidor,
  onInvitar,
  onCerrar,
}: ModalInvitarUsuarioProps) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('vendedor');
  const [erroresLocales, setErroresLocales] = useState<ErroresInvitacion>({});

  useEffect(() => {
    if (!abierto) return;
    setEmail('');
    setNombre('');
    setRol('vendedor');
    setErroresLocales({});
  }, [abierto]);

  function handleInvitarClick() {
    const emailLimpio = email.trim();
    const nombreLimpio = nombre.trim();
    const nuevosErrores: ErroresInvitacion = {};
    if (emailLimpio === '') nuevosErrores.email = 'Ingresá el correo.';
    if (nombreLimpio === '') nuevosErrores.nombre = 'Ingresá el nombre.';

    setErroresLocales(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    onInvitar({ email: emailLimpio, nombre: nombreLimpio, rol });
  }

  // Los errores locales (requeridos vacíos) tapan a los del servidor: si el
  // usuario borró el campo después de un intento fallido, el mensaje más
  // relevante es "hace falta este dato", no el error del intento anterior.
  const errorEmail = erroresLocales.email ?? erroresServidor.email;
  const errorNombre = erroresLocales.nombre ?? erroresServidor.nombre;

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Invitar usuario"
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={invitando}>
            Cancelar
          </Button>
          <Button onClick={handleInvitarClick} disabled={invitando || !enLinea}>
            {invitando ? 'Invitando…' : 'Invitar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!enLinea && (
          <p
            role="status"
            className="rounded-xl border border-borde bg-superficie p-3 text-sm text-advertencia"
          >
            <span aria-hidden="true">⚠</span> Necesitás conexión para invitar usuarios.
          </p>
        )}

        <Input
          label="Correo"
          type="email"
          value={email}
          onChange={setEmail}
          error={errorEmail}
          disabled={invitando}
          placeholder="persona@ejemplo.com"
        />
        <Input
          label="Nombre"
          value={nombre}
          onChange={setNombre}
          error={errorNombre}
          disabled={invitando}
        />

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-texto">Rol</span>
          <div
            role="group"
            aria-label="Rol"
            className="flex gap-1 rounded-xl border border-borde p-1"
          >
            {OPCIONES_ROL.map((opcion) => {
              const activa = opcion.valor === rol;
              return (
                <button
                  key={opcion.valor}
                  type="button"
                  aria-pressed={activa}
                  disabled={invitando}
                  onClick={() => setRol(opcion.valor)}
                  className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
                    activa ? 'bg-primary-600 text-white' : 'text-texto-secundario hover:text-texto'
                  }`}
                >
                  {opcion.etiqueta}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
