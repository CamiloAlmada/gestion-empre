import { useEffect, useState } from 'react';
import { Button, Input, Modal } from '@gestion/ui';
import type { Cliente } from '@gestion/core';
import type { DatosCliente } from '@gestion/firebase-kit';

export interface ModalClienteProps {
  abierto: boolean;
  /** `null` = alta. Con cliente, se precargan sus datos de contacto. */
  cliente: Cliente | null;
  /** `true` mientras `onGuardar` está resolviendo (deshabilita los botones). */
  guardando: boolean;
  onGuardar: (datos: DatosCliente) => void;
  onCerrar: () => void;
}

interface Errores {
  nombre?: string;
}

/**
 * Modal de alta/edición de cliente (nombre obligatorio, el resto opcional —
 * doc 07, "datos mínimos"). Es UNA sola instancia estable (patrón de
 * `ModalProducto`): no se desmonta al cerrar, el formulario se resetea vía
 * efecto cuando `abierto` pasa a `true`.
 *
 * Solo edita datos de contacto: `activo` se maneja con una acción separada
 * ("Desactivar cliente" en la ficha, ver `ModalDesactivarCliente`) porque
 * `actualizarCliente` no toca ese campo (doc 07 — `stats.ts`, `clientes.ts`).
 * El alta la puede disparar tanto `vendedor` como `admin` (alta rápida de
 * mostrador); la edición solo la ofrece la ficha a un admin.
 */
export function ModalCliente({ abierto, cliente, guardando, onGuardar, onCerrar }: ModalClienteProps) {
  const esAlta = cliente === null;

  const [nombre, setNombre] = useState('');
  const [alias, setAlias] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [notas, setNotas] = useState('');
  const [errores, setErrores] = useState<Errores>({});

  // Resetea el formulario cada vez que el modal se abre (alta nueva o
  // edición de un cliente puntual) — mismo criterio que `ModalProducto`.
  useEffect(() => {
    if (!abierto) return;
    setNombre(cliente?.nombre ?? '');
    setAlias(cliente?.alias ?? '');
    setTelefono(cliente?.telefono ?? '');
    setEmail(cliente?.email ?? '');
    setDireccion(cliente?.direccion ?? '');
    setNotas(cliente?.notas ?? '');
    setErrores({});
  }, [abierto, cliente]);

  function construirPayload(): DatosCliente | null {
    const nombreLimpio = nombre.trim();
    if (nombreLimpio === '') {
      setErrores({ nombre: 'Ingresá el nombre del cliente.' });
      return null;
    }
    setErrores({});

    return {
      nombre: nombreLimpio,
      alias: alias.trim() || undefined,
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
      direccion: direccion.trim() || undefined,
      notas: notas.trim() || undefined,
    };
  }

  function handleGuardarClick() {
    const payload = construirPayload();
    if (payload !== null) onGuardar(payload);
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={esAlta ? 'Nuevo cliente' : 'Editar cliente'}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardarClick} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nombre" value={nombre} onChange={setNombre} error={errores.nombre} />
        <Input label="Alias (opcional)" value={alias} onChange={setAlias} placeholder='Ej: "Marta la de enfrente"' />
        <Input label="Teléfono (opcional)" value={telefono} onChange={setTelefono} />
        <Input label="Email (opcional)" type="email" value={email} onChange={setEmail} />
        <Input label="Dirección (opcional)" value={direccion} onChange={setDireccion} />
        <Input label="Notas (opcional)" value={notas} onChange={setNotas} />
      </div>
    </Modal>
  );
}
