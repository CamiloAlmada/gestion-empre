import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, useTema, type Estilo, type Tema } from '@gestion/ui';
import { useAuth } from '@gestion/firebase-kit';
import { useHeader } from '../componentes/header/ContextoHeader';

const OPCIONES_TEMA: { valor: Tema; etiqueta: string }[] = [
  { valor: 'light', etiqueta: 'Claro' },
  { valor: 'dark', etiqueta: 'Oscuro' },
  { valor: 'system', etiqueta: 'Sistema' },
];

const OPCIONES_ESTILO: { valor: Estilo; etiqueta: string }[] = [
  { valor: 'minimalista', etiqueta: 'Minimalista' },
  { valor: 'calido', etiqueta: 'Cálido' },
];

// Claves tipadas por `perfil.rol` (de @gestion/core vía @gestion/firebase-kit)
// sin importar el tipo directamente: no hace falta acá, aunque desde la
// pantalla de Productos @gestion/core sí se usa en runtime (money/peso) y por
// eso es dependency real del package (no solo devDependency).
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
    <section className="flex flex-col gap-3 rounded-card border border-borde p-4">
      <h2 className="text-base font-semibold text-texto">{titulo}</h2>
      {children}
    </section>
  );
}

/** Grupo segmentado (docs/06-ui-ux.md §5): botones con `aria-pressed`, opción
 * activa marcada visualmente además de por el estado ARIA. Con dos grupos
 * seguidos dentro de la misma sección ("Apariencia"), cada uno lleva una
 * etiqueta visible propia ("Modo" / "Estilo") además del `aria-label` — sin
 * eso, dos grupos sin texto visible que los distinga son ambiguos para un
 * usuario vidente (el lector de pantalla sí los distingue por `aria-label`,
 * pero no alcanza). */
function SelectorTema() {
  const { tema, setTema } = useTema();

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-texto-secundario">Modo</span>
      <div
        role="group"
        aria-label="Modo"
        className="flex gap-1 rounded-elemento border border-borde p-1"
      >
        {OPCIONES_TEMA.map((opcion) => {
          const activo = tema === opcion.valor;
          return (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={activo}
              onClick={() => setTema(opcion.valor)}
              className={`min-h-[44px] flex-1 rounded-control px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
                activo ? 'bg-primary-600 text-white' : 'text-texto-secundario hover:text-texto'
              }`}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Mismo patrón que `SelectorTema`, para el eje `estilo` (Minimalista /
 * Cálido, docs/06-ui-ux.md §4). */
function SelectorEstilo() {
  const { estilo, setEstilo } = useTema();

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-texto-secundario">Estilo</span>
      <div
        role="group"
        aria-label="Estilo"
        className="flex gap-1 rounded-elemento border border-borde p-1"
      >
        {OPCIONES_ESTILO.map((opcion) => {
          const activo = estilo === opcion.valor;
          return (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={activo}
              onClick={() => setEstilo(opcion.valor)}
              className={`min-h-[44px] flex-1 rounded-control px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
                activo ? 'bg-primary-600 text-white' : 'text-texto-secundario hover:text-texto'
              }`}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pantalla de Ajustes: Apariencia (tema), Cuenta (datos del perfil + Salir,
 * mudado acá desde el header) y, solo para admin, el acceso a la gestión de
 * Usuarios (`/ajustes/usuarios`, ver Usuarios.tsx).
 */
export function Ajustes() {
  const { perfil, salir } = useAuth();
  useHeader({ titulo: 'Ajustes' });

  const nombreRol = perfil !== null ? NOMBRE_ROL[perfil.rol] : '—';

  return (
    <div className="flex flex-col gap-4">
      <Seccion titulo="Apariencia">
        <SelectorTema />
        <SelectorEstilo />
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
          <Link
            to="/ajustes/usuarios"
            className="flex min-h-[44px] w-full items-center justify-between rounded-control border border-borde px-4 py-3 text-left text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            <span>Gestión de usuarios</span>
            <span aria-hidden="true" className="text-texto-secundario">
              ›
            </span>
          </Link>
        </Seccion>
      )}
    </div>
  );
}
