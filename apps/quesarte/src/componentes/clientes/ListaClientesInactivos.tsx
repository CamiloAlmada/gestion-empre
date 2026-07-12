import type { Firestore } from 'firebase/firestore';
import { formatearMoney } from '@gestion/core';
import { BotonWhatsApp } from '../whatsapp/BotonWhatsApp';
import type { ClienteInactivo } from './inactividad';

export interface ListaClientesInactivosProps {
  clientes: ClienteInactivo[];
  db: Firestore;
}

/** "Hace N días" con singular correcto (mismo criterio que
 * `textoCantidadVentas`/`textoCantidadItems` del proyecto). */
function textoDiasSinVenir(dias: number): string {
  if (dias === 0) return 'Hoy'; // defensivo: en la práctica `calcularClientesInactivos` no produce 0 con los umbrales default.
  return dias === 1 ? 'Hace 1 día' : `Hace ${dias} días`;
}

/**
 * Fila por cliente inactivo (doc 08, "Fidelización"): nombre, días sin venir,
 * total histórico y el botón de WhatsApp con "Te extrañamos" precargada
 * (contexto `inactivo`). Mismo patrón visual de fila-tarjeta que
 * `ListaClientes`, pero sin `onClick` de fila entera — acá la única acción es
 * el botón de WhatsApp, no hay drill-down a la ficha desde esta lista.
 */
export function ListaClientesInactivos({ clientes, db }: ListaClientesInactivosProps) {
  return (
    <ul className="flex flex-col gap-2">
      {clientes.map(({ cliente, diasSinVenir }) => (
        <li
          key={cliente.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-borde bg-superficie p-4"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold text-texto">{cliente.nombre}</span>
            <span className="text-sm text-texto-secundario">{textoDiasSinVenir(diasSinVenir)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="tabular-nums font-semibold text-texto">
              {formatearMoney(cliente.stats.totalHistoricoCents)}
            </span>
            <BotonWhatsApp
              telefono={cliente.telefono}
              telefonoE164={cliente.telefonoE164}
              contexto="inactivo"
              valores={{ cliente: cliente.nombre, diasSinVenir: String(diasSinVenir) }}
              db={db}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
