import { useMemo, useState } from 'react';
import { collection, doc } from 'firebase/firestore';
import { Button, useToasts } from '@gestion/ui';
import {
  guardarPlantillasWhatsApp,
  plantillasWhatsAppConverter,
  useDoc,
  useOnlineStatus,
} from '@gestion/firebase-kit';
import {
  PLANTILLAS_SEED,
  completarConSeed,
  esPlantillaDeFabrica,
  restaurarPlantillasDeFabrica,
  type PlantillaWhatsApp,
} from '@gestion/core';
import { db } from '../../firebase';
import { ModalConfirmarRestaurarPlantillas } from './ModalConfirmarRestaurarPlantillas';
import { ModalConfirmarDesactivarPlantilla } from './ModalConfirmarDesactivarPlantilla';
import {
  ETIQUETA_CONTEXTO,
  ModalPlantillaWhatsApp,
  type DatosEdicionPlantilla,
} from './ModalPlantillaWhatsApp';

/** Tope de plantillas del documento (mismo valor que valida `guardarPlantillasWhatsApp`). */
const MAX_PLANTILLAS = 20;

/** La misma plantilla sin la clave `activa` (activa = ausente, nunca `activa: true`). */
function sinActiva(p: PlantillaWhatsApp): PlantillaWhatsApp {
  return { id: p.id, nombre: p.nombre, contexto: p.contexto, texto: p.texto };
}

interface OpcionesPersistencia {
  exito: string;
  error: string;
  errorSync: string;
  /** Marca/desmarca el estado "ocupado" de la acción (solo con conexión). */
  setOcupado?: (ocupado: boolean) => void;
  /** Se llama al terminar (tras el ack con conexión; al toque sin conexión). */
  alTerminar?: () => void;
}

/**
 * Sección "Plantillas de WhatsApp" de Ajustes (solo admin, doc 08).
 *
 * El admin puede crear plantillas propias (hasta 20 en total), editar cualquiera y
 * desactivar / reactivar solo las propias. Las de fábrica (`PLANTILLAS_SEED`) se
 * editan (nombre y texto) pero no se desactivan ni cambian de contexto.
 * "Restaurar iniciales" repone únicamente las de fábrica (`restaurarPlantillasDeFabrica`).
 *
 * La lista mostrada es SIEMPRE `completarConSeed(guardadas, PLANTILLAS_SEED)`:
 * si el doc guardado es anterior a una plantilla nueva del seed, la faltante
 * aparece igual y la primera escritura persiste todas, sin migrar datos ni pisar lo
 * que el dueño editó. Con el doc ausente o vacío se mantiene el estado vacío
 * ("Cargar plantillas iniciales").
 *
 * Documento único (edición atómica, ver `guardarPlantillasWhatsApp`): toda acción
 * reescribe la LISTA COMPLETA.
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
  const [creando, setCreando] = useState(false);
  const [plantillaDesactivando, setPlantillaDesactivando] = useState<PlantillaWhatsApp | null>(null);
  const [desactivando, setDesactivando] = useState(false);
  const [reactivando, setReactivando] = useState(false);

  // `useDoc` no expone "reintentar": fuerza una resuscripción cambiando la
  // IDENTIDAD del ref (nuevo `doc()` en cada intento), mismo truco que
  // `Categorias.tsx`/`Usuarios.tsx` con sus queries.
  const configuracionPlantillasRef = useMemo(
    () => doc(db, 'configuracion', 'plantillasWhatsApp').withConverter(plantillasWhatsAppConverter),
    [intentoId],
  );
  const { datos: plantillas, cargando, error } = useDoc(configuracionPlantillasRef);
  const guardadas = plantillas ?? [];
  const lista = guardadas.length === 0 ? [] : completarConSeed(guardadas, PLANTILLAS_SEED);

  function reintentar() {
    setIntentoId((n) => n + 1);
  }

  function escribir(lista: readonly PlantillaWhatsApp[]) {
    return guardarPlantillasWhatsApp(db, lista);
  }

  /**
   * Patrón híbrido de escrituras offline (docs/06-ui-ux.md §8): con conexión espera
   * el ack y avisa; sin conexión dispara la escritura sin esperar, avisa con un toast
   * informativo y deja que un error posterior se reporte aparte.
   */
  async function persistir(lista: readonly PlantillaWhatsApp[], opciones: OpcionesPersistencia) {
    const escritura = escribir(lista);

    if (!enLinea) {
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => mostrarToast(opciones.errorSync, 'error'));
      opciones.alTerminar?.();
      return;
    }

    opciones.setOcupado?.(true);
    try {
      await escritura;
      mostrarToast(opciones.exito, 'exito');
      opciones.alTerminar?.();
    } catch {
      mostrarToast(opciones.error, 'error');
    } finally {
      opciones.setOcupado?.(false);
    }
  }

  function sembrar() {
    return persistir(PLANTILLAS_SEED, {
      exito: 'Plantillas iniciales cargadas.',
      error: 'No se pudieron cargar las plantillas. Intentá de nuevo.',
      errorSync: 'No se pudo sincronizar las plantillas.',
      setOcupado: setSembrando,
    });
  }

  function abrirCreacion() {
    setCreando(true);
  }

  function abrirEdicion(plantilla: PlantillaWhatsApp) {
    setPlantillaEditando(plantilla);
  }

  function cerrarModalPlantilla() {
    setPlantillaEditando(null);
    setCreando(false);
  }

  function guardarModalPlantilla(datos: DatosEdicionPlantilla) {
    if (plantillaEditando === null) {
      if (lista.length >= MAX_PLANTILLAS) return;
      // Id local del SDK (sin red): solo lo genera, no escribe ningún documento.
      const nueva: PlantillaWhatsApp = {
        id: doc(collection(db, 'configuracion')).id,
        nombre: datos.nombre,
        contexto: datos.contexto,
        texto: datos.texto,
      };
      return persistir([...lista, nueva], {
        exito: 'Plantilla creada.',
        error: 'No se pudo crear la plantilla. Intentá de nuevo.',
        errorSync: 'No se pudo sincronizar la plantilla.',
        setOcupado: setGuardandoEdicion,
        alTerminar: cerrarModalPlantilla,
      });
    }

    const editando = plantillaEditando;
    const propia = !esPlantillaDeFabrica(editando.id);
    const listaActualizada = lista.map((p) =>
      p.id === editando.id
        ? { ...p, nombre: datos.nombre, texto: datos.texto, ...(propia ? { contexto: datos.contexto } : {}) }
        : p,
    );
    return persistir(listaActualizada, {
      exito: 'Plantilla guardada.',
      error: 'No se pudo guardar la plantilla. Intentá de nuevo.',
      errorSync: 'No se pudo sincronizar la plantilla.',
      setOcupado: setGuardandoEdicion,
      alTerminar: cerrarModalPlantilla,
    });
  }

  function cerrarModalDesactivar() {
    setPlantillaDesactivando(null);
  }

  function desactivarPlantilla() {
    if (plantillaDesactivando === null) return;
    const id = plantillaDesactivando.id;
    return persistir(
      lista.map((p) => (p.id === id ? { ...p, activa: false } : p)),
      {
        exito: 'Plantilla desactivada.',
        error: 'No se pudo desactivar la plantilla. Intentá de nuevo.',
        errorSync: 'No se pudo sincronizar la desactivación.',
        setOcupado: setDesactivando,
        alTerminar: cerrarModalDesactivar,
      },
    );
  }

  function reactivarPlantilla(plantilla: PlantillaWhatsApp) {
    return persistir(
      lista.map((p) => (p.id === plantilla.id ? sinActiva(p) : p)),
      {
        exito: 'Plantilla reactivada.',
        error: 'No se pudo reactivar la plantilla. Intentá de nuevo.',
        errorSync: 'No se pudo sincronizar la reactivación.',
        setOcupado: setReactivando,
      },
    );
  }

  function abrirModalRestaurar() {
    setModalRestaurarAbierto(true);
  }

  function cerrarModalRestaurar() {
    setModalRestaurarAbierto(false);
  }

  function restaurarTodas() {
    return persistir(restaurarPlantillasDeFabrica(lista), {
      exito: 'Plantillas restauradas.',
      error: 'No se pudieron restaurar las plantillas. Intentá de nuevo.',
      errorSync: 'No se pudo sincronizar la restauración.',
      setOcupado: setRestaurando,
      alTerminar: cerrarModalRestaurar,
    });
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

  const llegoAlMaximo = lista.length >= MAX_PLANTILLAS;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {lista.map((plantilla) => {
          const inactiva = plantilla.activa === false;
          const propia = !esPlantillaDeFabrica(plantilla.id);
          return (
            <li
              key={plantilla.id}
              className="flex items-center justify-between gap-3 rounded-elemento border border-borde bg-superficie p-3"
            >
              <div className={`flex min-w-0 flex-col gap-0.5 ${inactiva ? 'opacity-70' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-texto">{plantilla.nombre}</span>
                  <span className="inline-flex items-center rounded-full border border-borde bg-fondo px-2 py-0.5 text-xs font-medium text-texto-secundario">
                    {ETIQUETA_CONTEXTO[plantilla.contexto]}
                  </span>
                  {inactiva && (
                    <span className="inline-flex items-center rounded-full border border-borde bg-fondo px-2 py-0.5 text-xs font-medium text-texto-secundario">
                      Inactiva
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-texto-secundario">{plantilla.texto}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Button variante="secundaria" onClick={() => abrirEdicion(plantilla)}>
                  Editar
                </Button>
                {propia &&
                  (inactiva ? (
                    <Button
                      variante="secundaria"
                      onClick={() => void reactivarPlantilla(plantilla)}
                      disabled={reactivando}
                    >
                      Reactivar
                    </Button>
                  ) : (
                    <Button variante="secundaria" onClick={() => setPlantillaDesactivando(plantilla)}>
                      Desactivar
                    </Button>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={abrirCreacion} disabled={llegoAlMaximo}>
          Nueva plantilla
        </Button>
        <Button variante="secundaria" onClick={abrirModalRestaurar}>
          Restaurar iniciales
        </Button>
      </div>
      {llegoAlMaximo && (
        <p className="text-sm text-texto-secundario">Llegaste al máximo de {MAX_PLANTILLAS} plantillas</p>
      )}

      <ModalPlantillaWhatsApp
        abierto={creando || plantillaEditando !== null}
        plantilla={plantillaEditando}
        guardando={guardandoEdicion}
        onGuardar={(datos) => void guardarModalPlantilla(datos)}
        onCerrar={cerrarModalPlantilla}
      />

      <ModalConfirmarDesactivarPlantilla
        abierto={plantillaDesactivando !== null}
        nombre={plantillaDesactivando?.nombre ?? null}
        desactivando={desactivando}
        onConfirmar={() => void desactivarPlantilla()}
        onCerrar={cerrarModalDesactivar}
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
