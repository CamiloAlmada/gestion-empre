import { useMemo, useState } from 'react';
import { collection, orderBy, query } from 'firebase/firestore';
import { clienteConverter, useCollection } from '@gestion/firebase-kit';
import { Button } from '@gestion/ui';
import { db } from '../firebase';
import { useHeader } from '../componentes/header/ContextoHeader';
import { calcularClientesInactivos } from '../componentes/clientes/inactividad';
import { ListaClientesInactivos } from '../componentes/clientes/ListaClientesInactivos';

const coleccionClientes = collection(db, 'clientes').withConverter(clienteConverter);

/**
 * Lista de clientes inactivos (doc 08, "Fidelización"): herramienta de
 * reconquista del dueño, solo `admin` (ver `RutaSoloAdmin` en App.tsx —
 * mismo criterio de privacidad que Proveedores/Precios). Subvista de
 * Clientes: `‹ volver` lleva a `/clientes` (docs/06-ui-ux.md §2), se accede
 * desde la acción "Inactivos" del header de `Clientes.tsx`.
 *
 * Reusa la MISMA query de clientes activos que `Clientes.tsx` (`orderBy
 * 'nombre'`, índice ya existente): la clasificación de inactividad es 100%
 * client-side (`calcularClientesInactivos`, que envuelve
 * `clasificarInactividad` de core) — no hay ninguna query compuesta nueva
 * (política del proyecto, doc 04). La colección es chica (doc 07), así que
 * traerla entera y filtrar en memoria es aceptable, mismo criterio que
 * `Clientes.tsx`.
 */
export function ClientesInactivos() {
  useHeader({ titulo: 'Inactivos', volverA: { etiqueta: 'Clientes', a: '/clientes' } });

  // Se incrementa en "Reintentar": fuerza a `useCollection` a resuscribirse
  // (mismo patrón que Clientes.tsx/Stock.tsx).
  const [intentoId, setIntentoId] = useState(0);
  const consultaClientes = useMemo(() => query(coleccionClientes, orderBy('nombre')), [intentoId]);
  const { datos: clientes, cargando, error } = useCollection(consultaClientes);

  // `ahora` fijo por el ciclo de vida del componente (no `Date.now()` en cada
  // render): la clasificación es por días, no hace falta más precisión, y
  // así `calcularClientesInactivos` no recalcula en cada render sin motivo.
  const [ahora] = useState(() => new Date());
  const inactivos = useMemo(() => calcularClientesInactivos(clientes, ahora), [clientes, ahora]);

  function reintentar() {
    setIntentoId((n) => n + 1);
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
  } else if (inactivos.length === 0) {
    contenido = (
      <div className="rounded-card border border-borde bg-superficie p-8 text-center text-texto-secundario">
        Ningún cliente inactivo por ahora.
      </div>
    );
  } else {
    contenido = <ListaClientesInactivos clientes={inactivos} db={db} />;
  }

  return <div className="flex flex-col gap-4">{contenido}</div>;
}
