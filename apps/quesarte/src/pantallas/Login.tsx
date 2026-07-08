import { useState, type KeyboardEvent } from 'react';
import { Navigate } from 'react-router';
import { Button, Input } from '@gestion/ui';
import { useAuth } from '@gestion/firebase-kit';

const MENSAJES_ERROR_AUTH: Record<string, string> = {
  'auth/invalid-credential': 'El correo o la contraseña son incorrectos.',
  'auth/invalid-email': 'El correo ingresado no es válido.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/wrong-password': 'El correo o la contraseña son incorrectos.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada. Contactá al administrador.',
  'auth/too-many-requests': 'Demasiados intentos. Probá de nuevo en unos minutos.',
  'auth/network-request-failed': 'Sin conexión a internet. Revisá tu conexión e intentá de nuevo.',
};

const MENSAJE_ERROR_GENERICO = 'No se pudo iniciar sesión. Intentá de nuevo.';
const MENSAJE_ERROR_VALIDACION = 'Completá el correo y la contraseña.';
const MENSAJE_RESET_FALTA_EMAIL = 'Ingresá tu correo para restablecer la contraseña.';
// Mensaje neutro: no revela si existe (o no) una cuenta con ese correo.
const MENSAJE_RESET_NEUTRO =
  'Si existe una cuenta con ese correo, te enviamos un email para restablecer la contraseña.';

function tieneCodigo(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function obtenerMensajeError(error: unknown): string {
  if (tieneCodigo(error) && error.code in MENSAJES_ERROR_AUTH) {
    return MENSAJES_ERROR_AUTH[error.code] as string;
  }
  return MENSAJE_ERROR_GENERICO;
}

export function Login() {
  const { usuario, ingresarConEmail, restablecerPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [aviso, setAviso] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  if (usuario !== null) {
    return <Navigate to="/" replace />;
  }

  async function manejarIngresoConEmail() {
    if (enviando) return;

    if (email.trim() === '' || password === '') {
      setAviso(undefined);
      setError(MENSAJE_ERROR_VALIDACION);
      return;
    }

    setError(undefined);
    setAviso(undefined);
    setEnviando(true);
    try {
      await ingresarConEmail(email.trim(), password);
    } catch (err) {
      setError(obtenerMensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function manejarResetPassword() {
    if (enviando) return;

    if (email.trim() === '') {
      setAviso(undefined);
      setError(MENSAJE_RESET_FALTA_EMAIL);
      return;
    }

    setError(undefined);
    setAviso(undefined);
    setEnviando(true);
    try {
      await restablecerPassword(email.trim());
    } catch {
      // No revelamos si la cuenta existe: mismo mensaje neutro pase lo que pase.
    } finally {
      setEnviando(false);
      setAviso(MENSAJE_RESET_NEUTRO);
    }
  }

  function manejarTeclaEnCredenciales(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Enter') {
      void manejarIngresoConEmail();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-fondo p-4">
      <div className="w-full max-w-sm rounded-xl bg-superficie p-6 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-texto">Quesarte</h1>
        <div className="flex flex-col gap-4" onKeyDown={manejarTeclaEnCredenciales}>
          <Input
            label="Correo"
            type="email"
            value={email}
            onChange={setEmail}
            disabled={enviando}
            placeholder="tu@correo.com"
          />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={setPassword}
            disabled={enviando}
          />

          {error !== undefined && (
            <p role="alert" className="text-sm text-peligro">
              {error}
            </p>
          )}

          {aviso !== undefined && (
            <p role="status" className="text-sm text-texto-secundario">
              {aviso}
            </p>
          )}

          <Button onClick={() => void manejarIngresoConEmail()} disabled={enviando}>
            Ingresar
          </Button>

          <button
            type="button"
            onClick={() => void manejarResetPassword()}
            disabled={enviando}
            className="self-center text-sm text-texto-secundario underline underline-offset-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:text-texto-secundario focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>
    </div>
  );
}
