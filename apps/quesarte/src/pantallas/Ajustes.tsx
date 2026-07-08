import type { ReactNode } from 'react';
import { Button, useTema, type Tema } from '@gestion/ui';
import { useAuth } from '@gestion/firebase-kit';

const OPCIONES_TEMA: { valor: Tema; etiqueta: string }[] = [
  { valor: 'light', etiqueta: 'Claro' },
  { valor: 'dark', etiqueta: 'Oscuro' },
  { valor: 'system', etiqueta: 'Sistema' },
];

// Claves tipadas por `perfil.rol` (de @gestion/core vía @gestion/firebase-kit)
// sin importar el tipo directamente: evita depender de @gestion/core desde
// código de producción (acá solo está como devDependency, para tests).
const NOMBRE_ROL = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
} as const;

interface SeccionProps {
  titulo: string;
  children: ReactNode;
}

function Seccion({ titulo, children }: SeccionProps) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde p-4">
      <h2 className="text-base font-semibold text-texto">{titulo}</h2>
      {children}
    </section>
  );
}

/** Grupo segmentado (docs/06-ui-ux.md §5): botones con `aria-pressed`, opción
 * activa marcada visualmente además de por el estado ARIA. */
function SelectorTema() {
  const { tema, setTema } = useTema();

  return (
    <div
      role="group"
      aria-label="Apariencia"
      className="flex gap-1 rounded-xl border border-borde p-1"
    >
      {OPCIONES_TEMA.map((opcion) => {
        const activo = tema === opcion.valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activo}
            onClick={() => setTema(opcion.valor)}
            className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
              activo ? 'bg-primary-600 text-white' : 'text-texto-secundario hover:text-texto'
            }`}
          >
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pantalla de Ajustes: Apariencia (tema), Cuenta (datos del perfil + Salir,
 * mudado acá desde el header) y, solo para admin, el placeholder de gestión
 * de Usuarios que construye otra tarea.
 */
export function Ajustes() {
  const { perfil, salir } = useAuth();

  const nombreRol = perfil !== null ? NOMBRE_ROL[perfil.rol] : '—';

  return (
    <div className="flex flex-col gap-4">
      <Seccion titulo="Apariencia">
        <SelectorTema />
      </Seccion>

      <Seccion titulo="Cuenta">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-texto-secundario">Nombre</dt>
          <dd className="text-texto">{perfil?.nombre ?? '—'}</dd>
          <dt className="text-texto-secundario">Correo</dt>
          <dd className="text-texto">{perfil?.email ?? '—'}</dd>
          <dt className="text-texto-secundario">Rol</dt>
          <dd className="text-texto">{nombreRol}</dd>
        </dl>
        <Button variante="secundaria" onClick={() => void salir()} className="self-start">
          Salir
        </Button>
      </Seccion>

      {perfil?.rol === 'admin' && (
        <Seccion titulo="Usuarios">
          <button
            type="button"
            disabled
            className="flex min-h-[44px] w-full items-center justify-between rounded-lg border border-borde px-4 py-3 text-left text-texto-secundario disabled:cursor-not-allowed"
          >
            <span>Gestión de usuarios</span>
            <span className="text-xs">Próximamente</span>
          </button>
        </Seccion>
      )}
    </div>
  );
}
