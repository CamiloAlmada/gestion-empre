import { Button, Layout } from '@gestion/ui';
import { useAuth, useOnlineStatus } from '@gestion/firebase-kit';
import { auth } from '../firebase';

export function Home() {
  const { usuario, salir } = useAuth(auth);
  const enLinea = useOnlineStatus();

  return (
    <Layout
      titulo="Quesarte"
      headerDerecha={
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${enLinea ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            {enLinea ? 'En línea' : 'Sin conexión'}
          </span>
          <Button variante="secundaria" onClick={() => void salir()}>
            Salir
          </Button>
        </div>
      }
    >
      <p className="text-gray-700">Bienvenido{usuario?.email ? `, ${usuario.email}` : ''}.</p>
    </Layout>
  );
}
