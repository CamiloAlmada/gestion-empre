import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, type OpcionSelect } from '@gestion/ui';
import { CODIGOS_PAIS, componerTelefono, separarCodigoPais, type Cliente } from '@gestion/core';
import type { DatosCliente } from '@gestion/firebase-kit';

export interface ModalClienteProps {
  abierto: boolean;
  /** `null` = alta. Con cliente, se precargan sus datos de contacto. */
  cliente: Cliente | null;
  /** `true` mientras `onGuardar` está resolviendo (deshabilita los botones). */
  guardando: boolean;
  onGuardar: (datos: DatosCliente) => void;
  onCerrar: () => void;
  /**
   * Código de país default del negocio (`configuracion/general.codigoPaisDefault`,
   * sin `+`). Mismo default `'598'` (Uruguay) que ya usan `crearCliente`/
   * `actualizarCliente` cuando la configuración todavía no cargó — decide qué
   * país precarga el selector en el alta y cuándo el teléfono se guarda SIN
   * prefijo `+cc` (ver `componerTelefono`).
   */
  codigoPaisDefault?: string;
}

/**
 * Opciones del selector de país: `CODIGOS_PAIS` (core) + un fallback si el
 * `codigoPaisDefault` del negocio no está en esa lista fija (p. ej. un admin
 * cargó un código no contemplado en Ajustes) — sin esto, el `Select` quedaría
 * con un `value` sin `<option>` que lo respalde.
 */
function construirOpcionesPais(codigoPaisDefault: string): OpcionSelect[] {
  const opciones = CODIGOS_PAIS.map((c) => ({ valor: c.codigo, etiqueta: `${c.nombre} (+${c.codigo})` }));
  if (CODIGOS_PAIS.some((c) => c.codigo === codigoPaisDefault)) return opciones;
  return [...opciones, { valor: codigoPaisDefault, etiqueta: `Código +${codigoPaisDefault}` }];
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
export function ModalCliente({
  abierto,
  cliente,
  guardando,
  onGuardar,
  onCerrar,
  codigoPaisDefault = '598',
}: ModalClienteProps) {
  const esAlta = cliente === null;

  const [nombre, setNombre] = useState('');
  const [alias, setAlias] = useState('');
  const [codigoPais, setCodigoPais] = useState(codigoPaisDefault);
  const [telefonoNacional, setTelefonoNacional] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [notas, setNotas] = useState('');
  const [errores, setErrores] = useState<Errores>({});

  // Resetea el formulario cada vez que el modal se abre (alta nueva o
  // edición de un cliente puntual) — mismo criterio que `ModalProducto`.
  // `separarCodigoPais('', codigoPaisDefault)` (alta, sin cliente) devuelve
  // `{ codigo: codigoPaisDefault, nacional: '' }`, así que no hace falta un
  // caso separado para alta vs. edición: la misma llamada precarga ambos
  // casos correctamente.
  useEffect(() => {
    if (!abierto) return;
    setNombre(cliente?.nombre ?? '');
    setAlias(cliente?.alias ?? '');
    const { codigo, nacional } = separarCodigoPais(cliente?.telefono ?? '', codigoPaisDefault);
    setCodigoPais(codigo);
    setTelefonoNacional(nacional);
    setEmail(cliente?.email ?? '');
    setDireccion(cliente?.direccion ?? '');
    setNotas(cliente?.notas ?? '');
    setErrores({});
  }, [abierto, cliente, codigoPaisDefault]);

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
      telefono: componerTelefono(codigoPais, telefonoNacional, codigoPaisDefault) || undefined,
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
        {/* País + Teléfono en una fila: el selector angosto a la izquierda
            (ancho fijo, alcanza para "+cc" y nombres cortos) y el input de la
            parte nacional ocupa el resto — es lo que escribe el usuario, así
            que se lleva el ancho disponible. Motivado por un tester en España
            cuyo teléfono la app tomó como uruguayo (+598) al no haber forma
            de elegir el país. */}
        <div className="flex gap-2">
          <div className="w-36 shrink-0">
            <Select
              label="País"
              value={codigoPais}
              onChange={setCodigoPais}
              opciones={construirOpcionesPais(codigoPaisDefault)}
            />
          </div>
          <div className="flex-1">
            <Input label="Teléfono (opcional)" value={telefonoNacional} onChange={setTelefonoNacional} />
          </div>
        </div>
        <Input label="Email (opcional)" type="email" value={email} onChange={setEmail} />
        <Input label="Dirección (opcional)" value={direccion} onChange={setDireccion} />
        <Input label="Notas (opcional)" value={notas} onChange={setNotas} />
      </div>
    </Modal>
  );
}
