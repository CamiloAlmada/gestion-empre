import { useEffect, useId, useState } from 'react';
import { Button, Input, Modal } from '@gestion/ui';
import { PLANTILLAS_SEED, type ContextoPlantilla, type PlantillaWhatsApp } from '@gestion/core';

export interface DatosEdicionPlantilla {
  nombre: string;
  texto: string;
}

export interface ModalPlantillaWhatsAppProps {
  abierto: boolean;
  /** `null` mientras se cierra (mismo criterio que `ModalCliente`: instancia
   * estable, formulario se resetea vía efecto cuando `abierto` pasa a `true`). */
  plantilla: PlantillaWhatsApp | null;
  guardando: boolean;
  onGuardar: (datos: DatosEdicionPlantilla) => void;
  onCerrar: () => void;
}

const ETIQUETA_CONTEXTO: Record<ContextoPlantilla, string> = {
  venta: 'Venta',
  cliente: 'Cliente',
  inactivo: 'Cliente inactivo',
};

/** Placeholders resueltos por `resolverPlantilla` (`@gestion/core`), doc 08. */
const PLACEHOLDERS: { clave: string; descripcion: string }[] = [
  { clave: '{cliente}', descripcion: 'nombre o alias del cliente' },
  { clave: '{total}', descripcion: 'total de la venta formateado ($ x.xxx)' },
  { clave: '{items}', descripcion: 'resumen de ítems de la venta' },
  { clave: '{diasSinVenir}', descripcion: 'días desde la última compra' },
  { clave: '{negocio}', descripcion: 'nombre del negocio (sección "Negocio" de Ajustes)' },
];

const MAX_TEXTO = 1000;

/**
 * Edición de UNA plantilla de WhatsApp (nombre + texto). `contexto` e `id`
 * NO se editan acá (alcance cerrado de la tarea WA-C1: no se agregan ni
 * borran plantillas, solo se editan/restauran las 3 del seed) — se muestran
 * de solo lectura como contexto para el admin.
 *
 * "Restaurar texto original" reemplaza nombre/texto en el BORRADOR del
 * formulario con los valores de `PLANTILLAS_SEED` (mismo `id`): no persiste
 * nada por sí solo, el admin sigue teniendo que tocar "Guardar" — esa
 * confirmación explícita es a propósito el mismo mecanismo de "volver atrás
 * si rompe una plantilla" que pide la tarea, sin necesitar un diálogo de
 * confirmación aparte.
 */
export function ModalPlantillaWhatsApp({
  abierto,
  plantilla,
  guardando,
  onGuardar,
  onCerrar,
}: ModalPlantillaWhatsAppProps) {
  const [nombre, setNombre] = useState('');
  const [texto, setTexto] = useState('');
  const [errorNombre, setErrorNombre] = useState<string | undefined>();
  const [errorTexto, setErrorTexto] = useState<string | undefined>();
  const idTexto = useId();
  const idErrorTexto = `${idTexto}-error`;

  useEffect(() => {
    if (!abierto) return;
    setNombre(plantilla?.nombre ?? '');
    setTexto(plantilla?.texto ?? '');
    setErrorNombre(undefined);
    setErrorTexto(undefined);
  }, [abierto, plantilla]);

  const seed = plantilla !== null ? PLANTILLAS_SEED.find((p) => p.id === plantilla.id) : undefined;

  function restaurar() {
    if (seed === undefined) return;
    setNombre(seed.nombre);
    setTexto(seed.texto);
  }

  function handleGuardarClick() {
    const nombreLimpio = nombre.trim();
    const textoLimpio = texto.trim();
    const nuevoErrorNombre = nombreLimpio === '' ? 'Ingresá el nombre de la plantilla.' : undefined;
    const nuevoErrorTexto = textoLimpio === '' ? 'Ingresá el texto de la plantilla.' : undefined;
    setErrorNombre(nuevoErrorNombre);
    setErrorTexto(nuevoErrorTexto);
    if (nuevoErrorNombre !== undefined || nuevoErrorTexto !== undefined) return;

    onGuardar({ nombre: nombreLimpio, texto });
  }

  if (plantilla === null) return null;

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Editar plantilla"
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
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-texto-secundario">Contexto</span>
          <span className="inline-flex w-fit items-center rounded-full border border-borde bg-fondo px-2 py-0.5 text-xs font-medium text-texto-secundario">
            {ETIQUETA_CONTEXTO[plantilla.contexto]}
          </span>
        </div>

        <Input label="Nombre" value={nombre} onChange={setNombre} error={errorNombre} disabled={guardando} />

        <div className="flex flex-col gap-1">
          <label htmlFor={idTexto} className="text-sm font-medium text-texto">
            Texto
          </label>
          <textarea
            id={idTexto}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={guardando}
            rows={4}
            maxLength={MAX_TEXTO}
            aria-invalid={errorTexto !== undefined ? true : undefined}
            aria-describedby={errorTexto !== undefined ? idErrorTexto : undefined}
            className={`rounded-control border bg-superficie px-3 py-2 text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:bg-fondo disabled:text-texto-secundario ${
              errorTexto !== undefined ? 'border-peligro' : 'border-borde'
            }`}
          />
          <div className="flex items-center justify-between">
            {errorTexto !== undefined ? (
              <p id={idErrorTexto} className="text-sm text-peligro">
                {errorTexto}
              </p>
            ) : (
              <span />
            )}
            <span className="text-right text-xs text-texto-secundario">
              {texto.length}/{MAX_TEXTO}
            </span>
          </div>
        </div>

        {seed !== undefined && (
          <Button variante="secundaria" onClick={restaurar} disabled={guardando} className="self-start">
            Restaurar texto original
          </Button>
        )}

        <div className="flex flex-col gap-1 rounded-elemento border border-borde bg-fondo p-3 text-xs text-texto-secundario">
          <span className="font-medium text-texto">Placeholders disponibles</span>
          <ul className="flex flex-col gap-0.5">
            {PLACEHOLDERS.map(({ clave, descripcion }) => (
              <li key={clave}>
                <code className="text-texto">{clave}</code> — {descripcion}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
