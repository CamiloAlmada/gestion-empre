import { Button, Layout } from '@gestion/ui';
import { useAuth, useOnlineStatus } from '@gestion/firebase-kit';

export function Home() {
  const { perfil, salir } = useAuth();
  const enLinea = useOnlineStatus();

  return (
    <Layout
      titulo="Quesarte"
      headerDerecha={
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-sm text-texto-secundario">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${enLinea ? 'bg-exito' : 'bg-texto-secundario'}`}
            />
            {enLinea ? 'En línea' : 'Sin conexión'}
          </span>
          <Button variante="secundaria" onClick={() => void salir()}>
            Salir
          </Button>
        </div>
      }
    >
      <p className="text-texto">Bienvenido{perfil?.nombre ? `, ${perfil.nombre}` : ''}.</p>
    </Layout>
  );
}
