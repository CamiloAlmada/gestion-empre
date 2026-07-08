import { useState, type KeyboardEvent } from 'react';
import { Navigate } from 'react-router';
import { Button, Input } from '@gestion/ui';
import { useAuth } from '@gestion/firebase-kit';
import { auth } from '../firebase';

const MENSAJES_ERROR_AUTH: Record<string, string> = {
  'auth/invalid-credential': 'El correo o la contraseña son incorrectos.',
  'auth/invalid-email': 'El correo ingresado no es válido.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/wrong-password': 'El correo o la contraseña son incorrectos.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada. Contactá al administrador.',
  'auth/too-many-requests': 'Demasiados intentos. Probá de nuevo en unos minutos.',
  'auth/network-request-failed': 'Sin conexión a internet. Revisá tu conexión e intentá de nuevo.',
  'auth/popup-closed-by-user': 'Se cerró la ventana de Google antes de completar el ingreso.',
};

const MENSAJE_ERROR_GENERICO = 'No se pudo iniciar sesión. Intentá de nuevo.';
const MENSAJE_ERROR_VALIDACION = 'Completá el correo y la contraseña.';

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
  const { usuario, ingresarConEmail, ingresarConGoogle } = useAuth(auth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  if (usuario !== null) {
    return <Navigate to="/" replace />;
  }

  async function manejarIngresoConEmail() {
    if (enviando) return;

    if (email.trim() === '' || password === '') {
      setError(MENSAJE_ERROR_VALIDACION);
      return;
    }

    setError(undefined);
    setEnviando(true);
    try {
      await ingresarConEmail(email.trim(), password);
    } catch (err) {
      setError(obtenerMensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function manejarIngresoConGoogle() {
    if (enviando) return;

    setError(undefined);
    setEnviando(true);
    try {
      await ingresarConGoogle();
    } catch (err) {
      setError(obtenerMensajeError(err));
    } finally {
      setEnviando(false);
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

          <Button onClick={() => void manejarIngresoConEmail()} disabled={enviando}>
            Ingresar
          </Button>
          <Button variante="secundaria" onClick={() => void manejarIngresoConGoogle()} disabled={enviando}>
            Ingresar con Google
          </Button>
        </div>
      </div>
    </div>
  );
}
