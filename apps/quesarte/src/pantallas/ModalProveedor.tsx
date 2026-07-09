import { useEffect, useState } from 'react';
import { Button, Input, Modal } from '@gestion/ui';
import type { DatosPago, Proveedor } from '@gestion/core';
import { type DatosProveedor } from '@gestion/firebase-kit';

export interface ModalProveedorProps {
  abierto: boolean;
  /** `null` = alta. */
  proveedor: Proveedor | null;
  /** `true` mientras `onGuardar` está resolviendo (deshabilita los botones). */
  guardando: boolean;
  onGuardar: (datos: DatosProveedor) => void;
  onCerrar: () => void;
}

/** Fila del borrador de `pagos[]`: todo texto (aunque `banco`/`cuenta` sean
 * obligatorios al guardar) para no pelear con el usuario mientras tipea. */
interface PagoBorrador {
  banco: string;
  cuenta: string;
  titular: string;
  moneda: string;
}

interface Errores {
  nombre?: string;
  /** Un solo mensaje general para toda la sección de pagos (docs/06-ui-ux.md
   * §5: errores de formulario asociados y accionables) — cada cuenta
   * incompleta se marca individualmente en su propio input. */
  pagos?: string;
}

function pagoVacio(): PagoBorrador {
  return { banco: '', cuenta: '', titular: '', moneda: '' };
}

function pagoADraft(pago: DatosPago): PagoBorrador {
  return {
    banco: pago.banco,
    cuenta: pago.cuenta,
    titular: pago.titular ?? '',
    moneda: pago.moneda ?? '',
  };
}

/**
 * Modal de alta/edición de proveedor (solo admin, ver `Proveedores.tsx` /
 * `DetalleProveedorPantalla.tsx`). Sigue el mismo patrón que `ModalProducto`:
 * instancia estable que nunca se desmonta, el formulario se resetea vía
 * efecto cuando `abierto` pasa a `true`.
 *
 * `pagos[]` se edita como lista de filas (agregar/quitar cuenta): cada fila
 * exige `banco` y `cuenta` no vacíos si existe (docs/07, `DatosPago`); los
 * demás campos del proveedor son opcionales salvo `nombre`.
 */
export function ModalProveedor({ abierto, proveedor, guardando, onGuardar, onCerrar }: ModalProveedorProps) {
  const esAlta = proveedor === null;

  const [nombre, setNombre] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [rut, setRut] = useState('');
  const [notas, setNotas] = useState('');
  const [pagos, setPagos] = useState<PagoBorrador[]>([]);
  const [errores, setErrores] = useState<Errores>({});
  const [filasPagoInvalidas, setFilasPagoInvalidas] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!abierto) return;
    setNombre(proveedor?.nombre ?? '');
    setContactoNombre(proveedor?.contactoNombre ?? '');
    setTelefono(proveedor?.telefono ?? '');
    setEmail(proveedor?.email ?? '');
    setDireccion(proveedor?.direccion ?? '');
    setRut(proveedor?.rut ?? '');
    setNotas(proveedor?.notas ?? '');
    setPagos(proveedor?.pagos?.map(pagoADraft) ?? []);
    setErrores({});
    setFilasPagoInvalidas(new Set());
  }, [abierto, proveedor]);

  function agregarPago() {
    setPagos((actual) => [...actual, pagoVacio()]);
  }

  function quitarPago(indice: number) {
    setPagos((actual) => actual.filter((_, i) => i !== indice));
    setFilasPagoInvalidas((actual) => {
      const siguiente = new Set<number>();
      for (const i of actual) {
        if (i < indice) siguiente.add(i);
        else if (i > indice) siguiente.add(i - 1);
      }
      return siguiente;
    });
  }

  function actualizarPago(indice: number, campo: keyof PagoBorrador, valor: string) {
    setPagos((actual) => actual.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p)));
  }

  function construirPayload(): DatosProveedor | null {
    const nuevosErrores: Errores = {};
    const nombreLimpio = nombre.trim();
    if (nombreLimpio === '') nuevosErrores.nombre = 'Ingresá el nombre del proveedor.';

    const invalidas = new Set<number>();
    const pagosValidados: DatosPago[] = [];
    pagos.forEach((p, indice) => {
      const banco = p.banco.trim();
      const cuenta = p.cuenta.trim();
      if (banco === '' || cuenta === '') {
        invalidas.add(indice);
        return;
      }
      pagosValidados.push({
        banco,
        cuenta,
        titular: p.titular.trim() || undefined,
        moneda: p.moneda.trim() || undefined,
      });
    });
    if (invalidas.size > 0) {
      nuevosErrores.pagos = 'Cada cuenta necesita banco y número de cuenta.';
    }
    setFilasPagoInvalidas(invalidas);

    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return null;

    return {
      nombre: nombreLimpio,
      contactoNombre: contactoNombre.trim() || undefined,
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
      direccion: direccion.trim() || undefined,
      rut: rut.trim() || undefined,
      notas: notas.trim() || undefined,
      pagos: pagosValidados.length > 0 ? pagosValidados : undefined,
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
      titulo={esAlta ? 'Nuevo proveedor' : 'Editar proveedor'}
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
        <Input label="Contacto (opcional)" value={contactoNombre} onChange={setContactoNombre} />
        <Input label="Teléfono (opcional)" value={telefono} onChange={setTelefono} />
        <Input label="Correo (opcional)" type="email" value={email} onChange={setEmail} />
        <Input
          label="Dirección (opcional)"
          value={direccion}
          onChange={setDireccion}
          placeholder="A dónde hay que viajar a comprar"
        />
        <Input label="RUT (opcional)" value={rut} onChange={setRut} />

        <div className="flex flex-col gap-1">
          <label htmlFor="notas-proveedor" className="text-sm font-medium text-texto">
            Notas (opcional)
          </label>
          <textarea
            id="notas-proveedor"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="resize-none rounded-control border border-borde bg-superficie px-3 py-2 text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-texto">Cuentas para transferencias (opcional)</span>
            <Button variante="secundaria" onClick={agregarPago}>
              + Agregar cuenta
            </Button>
          </div>

          {errores.pagos !== undefined && (
            <p role="alert" className="text-sm text-peligro">
              {errores.pagos}
            </p>
          )}

          {pagos.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sin cuentas cargadas todavía.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {pagos.map((pago, indice) => {
                const invalida = filasPagoInvalidas.has(indice);
                return (
                  <li
                    key={indice}
                    className="flex flex-col gap-2 rounded-elemento border border-borde p-3"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input
                        label="Banco"
                        value={pago.banco}
                        onChange={(v) => actualizarPago(indice, 'banco', v)}
                        error={invalida && pago.banco.trim() === '' ? 'Requerido' : undefined}
                      />
                      <Input
                        label="Número de cuenta"
                        value={pago.cuenta}
                        onChange={(v) => actualizarPago(indice, 'cuenta', v)}
                        error={invalida && pago.cuenta.trim() === '' ? 'Requerido' : undefined}
                      />
                      <Input
                        label="Titular (opcional)"
                        value={pago.titular}
                        onChange={(v) => actualizarPago(indice, 'titular', v)}
                      />
                      <Input
                        label="Moneda (opcional)"
                        value={pago.moneda}
                        onChange={(v) => actualizarPago(indice, 'moneda', v)}
                        placeholder="Ej: UYU, USD"
                      />
                    </div>
                    <Button variante="secundaria" onClick={() => quitarPago(indice)} className="self-end">
                      Quitar cuenta {indice + 1}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
