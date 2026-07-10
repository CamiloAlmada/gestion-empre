import { useEffect, useMemo, useState } from 'react';
import type { Cliente } from '@gestion/core';
import { Button, Input, Modal } from '@gestion/ui';

/** Minúsculas y sin diacríticos, para comparar "marta" contra "Márta" (mismo
 * criterio que `SearchSelect` de `@gestion/ui`, duplicado acá porque no hay un
 * helper de texto compartido y este filtro es puramente de presentación). */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function coincide(cliente: Cliente, consulta: string): boolean {
  const objetivo = normalizar(consulta);
  if (objetivo === '') return true;
  if (normalizar(cliente.nombre).includes(objetivo)) return true;
  if (cliente.alias !== undefined && normalizar(cliente.alias).includes(objetivo)) return true;
  if (cliente.telefono !== undefined && cliente.telefono.includes(consulta.trim())) return true;
  return false;
}

export interface SelectorClienteProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Clientes activos (`clientes` con `activo === true`), ya resueltos por
   * `useCollection` en `Venta.tsx` — este modal no habla con Firestore, solo
   * filtra client-side (colección chica, doc 07 decisión 1). */
  clientes: Cliente[];
  cargando: boolean;
  error: boolean;
  onSeleccionar: (cliente: Cliente) => void;
  /** Alta rápida: crea un cliente con SOLO el nombre tipeado y lo asocia.
   * `Venta.tsx` resuelve todo sincrónicamente (el id es client-side) y cierra
   * este modal al instante, así que NO hace falta un estado "creando": el modal
   * se desmonta antes de que un segundo toque pueda repetir el alta. */
  onCrear: (nombre: string) => void;
}

/**
 * Selector de cliente del POS (docs/07-clientes-proveedores.md §POS): buscar
 * por nombre/alias/teléfono entre los clientes activos, o dar de alta uno
 * nuevo con solo el nombre. Vive dentro del carrito — la venta anónima (sin
 * abrir este modal) no cambia en nada.
 *
 * No confundir con `pantallas/ModalCliente.tsx` (CP-B): ese es el formulario
 * ABM de alta/edición completa de la ficha de cliente (Clientes/
 * DetalleClientePantalla), responsabilidad distinta a este selector del POS.
 */
export function SelectorCliente({
  abierto,
  onCerrar,
  clientes,
  cargando,
  error,
  onSeleccionar,
  onCrear,
}: SelectorClienteProps) {
  const [texto, setTexto] = useState('');

  // Arranca en blanco cada vez que se abre: no arrastrar la búsqueda de la
  // vez anterior (mismo criterio que los modales de "agregar" del carrito).
  useEffect(() => {
    if (abierto) setTexto('');
  }, [abierto]);

  const resultados = useMemo(() => clientes.filter((cliente) => coincide(cliente, texto)), [clientes, texto]);
  const textoLimpio = texto.trim();

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Cliente">
      <div className="flex flex-col gap-3">
        <Input
          label="Buscar por nombre, alias o teléfono"
          value={texto}
          onChange={setTexto}
          placeholder="Ej: Marta"
        />

        {cargando ? (
          <p className="text-sm text-texto-secundario">Cargando clientes…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-peligro">
            No se pudo cargar la lista de clientes. Podés crear uno nuevo igual.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {resultados.length === 0 ? (
              <li className="px-1 py-2 text-sm text-texto-secundario">Sin resultados.</li>
            ) : (
              resultados.map((cliente) => (
                <li key={cliente.id}>
                  <button
                    type="button"
                    onClick={() => onSeleccionar(cliente)}
                    className="flex min-h-11 w-full flex-col items-start rounded-control px-3 py-2 text-left text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                  >
                    <span className="font-medium">{cliente.nombre}</span>
                    {cliente.alias !== undefined && (
                      <span className="text-sm text-texto-secundario">{cliente.alias}</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {textoLimpio !== '' && (
          <Button
            variante="secundaria"
            onClick={() => onCrear(textoLimpio)}
            className="min-h-11 w-full"
          >
            {`Crear «${textoLimpio}»`}
          </Button>
        )}
      </div>
    </Modal>
  );
}
