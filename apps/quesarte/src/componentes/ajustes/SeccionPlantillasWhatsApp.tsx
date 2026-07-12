import { useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import { Button, useToasts } from '@gestion/ui';
import {
  guardarPlantillasWhatsApp,
  plantillasWhatsAppConverter,
  useDoc,
  useOnlineStatus,
} from '@gestion/firebase-kit';
import { PLANTILLAS_SEED, type ContextoPlantilla, type PlantillaWhatsApp } from '@gestion/core';
import { db } from '../../firebase';
import { ModalConfirmarRestaurarPlantillas } from './ModalConfirmarRestaurarPlantillas';
import { ModalPlantillaWhatsApp, type DatosEdicionPlantilla } from './ModalPlantillaWhatsApp';

const ETIQUETA_CONTEXTO: Record<ContextoPlantilla, string> = {
  venta: 'Venta',
  cliente: 'Cliente',
  inactivo: 'Cliente inactivo',
};

/**
 * Sección "Plantillas de WhatsApp" de Ajustes (solo admin, doc 08).
 *
 * ALCANCE CERRADO (WA-C1): solo se editan y restauran las plantillas del
 * seed (`PLANTILLAS_SEED`, 3 plantillas). Esta sección NO ofrece agregar ni
 * borrar plantillas — si `configuracion/plantillasWhatsApp` llegara a tener
 * una plantilla con un `id` fuera del seed (no hay forma de crear una desde
 * acá hoy), se lista igual pero sin botón "Restaurar texto original" (no hay
 * seed con qué compararla).
 *
 * Documento único (edición atómica, ver `guardarPlantillasWhatsApp`): tanto
 * sembrar desde vacío como editar una plantilla puntual como restaurar
 * reescriben la LISTA COMPLETA.
 */
export function SeccionPlantillasWhatsApp() {
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const [intentoId, setIntentoId] = useState(0);
  const [sembrando, setSembrando] = useState(false);
  const [plantillaEditando, setPlantillaEditando] = useState<PlantillaWhatsApp | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [modalRestaurarAbierto, setModalRestaurarAbierto] = useState(false);
  const [restaurando, setRestaurando] = useState(false);

  // `useDoc` no expone "reintentar": fuerza una resuscripción cambiando la
  // IDENTIDAD del ref (nuevo `doc()` en cada intento), mismo truco que
  // `Categorias.tsx`/`Usuarios.tsx` con sus queries.
  const configuracionPlantillasRef = useMemo(
    () => doc(db, 'configuracion', 'plantillasWhatsApp').withConverter(plantillasWhatsAppConverter),
    [intentoId],
  );
  const { datos: plantillas, cargando, error } = useDoc(configuracionPlantillasRef);
  const lista = plantillas ?? [];

  function reintentar() {
    setIntentoId((n) => n + 1);
  }

  function escribir(lista: readonly PlantillaWhatsApp[]) {
    return guardarPlantillasWhatsApp(db, lista);
  }

  async function sembrar() {
    setSembrando(true);
    const escritura = escribir(PLANTILLAS_SEED);

    if (!enLinea) {
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => mostrarToast('No se pudo sincronizar las plantillas.', 'error'));
      setSembrando(false);
      return;
    }

    try {
      await escritura;
      mostrarToast('Plantillas iniciales cargadas.', 'exito');
    } catch {
      mostrarToast('No se pudieron cargar las plantillas. Intentá de nuevo.', 'error');
    } finally {
      setSembrando(false);
    }
  }

  function abrirEdicion(plantilla: PlantillaWhatsApp) {
    setPlantillaEditando(plantilla);
  }

  function cerrarEdicion() {
    setPlantillaEditando(null);
  }

  async function guardarEdicion(datos: DatosEdicionPlantilla) {
    if (plantillaEditando === null) return;
    const listaActualizada = lista.map((p) =>
      p.id === plantillaEditando.id ? { ...p, nombre: datos.nombre, texto: datos.texto } : p,
    );
    const escritura = escribir(listaActualizada);

    if (!enLinea) {
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => mostrarToast('No se pudo sincronizar la plantilla.', 'error'));
      cerrarEdicion();
      return;
    }

    setGuardandoEdicion(true);
    try {
      await escritura;
      mostrarToast('Plantilla guardada.', 'exito');
      cerrarEdicion();
    } catch {
      mostrarToast('No se pudo guardar la plantilla. Intentá de nuevo.', 'error');
    } finally {
      setGuardandoEdicion(false);
    }
  }

  function abrirModalRestaurar() {
    setModalRestaurarAbierto(true);
  }

  function cerrarModalRestaurar() {
    setModalRestaurarAbierto(false);
  }

  async function restaurarTodas() {
    const escritura = escribir(PLANTILLAS_SEED);

    if (!enLinea) {
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => mostrarToast('No se pudo sincronizar la restauración.', 'error'));
      cerrarModalRestaurar();
      return;
    }

    setRestaurando(true);
    try {
      await escritura;
      mostrarToast('Plantillas restauradas.', 'exito');
      cerrarModalRestaurar();
    } catch {
      mostrarToast('No se pudieron restaurar las plantillas. Intentá de nuevo.', 'error');
    } finally {
      setRestaurando(false);
    }
  }

  if (cargando) {
    return <p className="py-6 text-center text-texto-secundario">Cargando plantillas…</p>;
  }

  if (error !== null) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-elemento border border-borde bg-superficie p-6 text-center"
      >
        <p className="text-peligro">No se pudieron cargar las plantillas.</p>
        <Button variante="secundaria" onClick={reintentar}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (lista.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-texto-secundario">Todavía no hay plantillas de WhatsApp configuradas.</p>
        <Button
          variante="secundaria"
          onClick={() => void sembrar()}
          disabled={sembrando}
          className="self-start"
        >
          {sembrando ? 'Cargando…' : 'Cargar plantillas iniciales'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {lista.map((plantilla) => (
          <li
            key={plantilla.id}
            className="flex items-center justify-between gap-3 rounded-elemento border border-borde bg-superficie p-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-texto">{plantilla.nombre}</span>
                <span className="inline-flex items-center rounded-full border border-borde bg-fondo px-2 py-0.5 text-xs font-medium text-texto-secundario">
                  {ETIQUETA_CONTEXTO[plantilla.contexto]}
                </span>
              </div>
              <p className="truncate text-sm text-texto-secundario">{plantilla.texto}</p>
            </div>
            <Button variante="secundaria" onClick={() => abrirEdicion(plantilla)} className="shrink-0">
              Editar
            </Button>
          </li>
        ))}
      </ul>

      <Button variante="secundaria" onClick={abrirModalRestaurar} className="self-start">
        Restaurar iniciales
      </Button>

      <ModalPlantillaWhatsApp
        abierto={plantillaEditando !== null}
        plantilla={plantillaEditando}
        guardando={guardandoEdicion}
        onGuardar={(datos) => void guardarEdicion(datos)}
        onCerrar={cerrarEdicion}
      />

      <ModalConfirmarRestaurarPlantillas
        abierto={modalRestaurarAbierto}
        restaurando={restaurando}
        onConfirmar={() => void restaurarTodas()}
        onCerrar={cerrarModalRestaurar}
      />
    </div>
  );
}
