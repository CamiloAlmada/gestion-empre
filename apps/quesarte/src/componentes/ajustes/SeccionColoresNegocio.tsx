import { useEffect, useState } from 'react';
import {
  generarPaleta,
  normalizarTema,
  PRESETS_TEMA,
  type TemaPersonalizado,
  type TinteFondo,
} from '@gestion/core';
import { borrarTemaNegocio, ConfiguracionInvalidaError, guardarTemaNegocio, useOnlineStatus } from '@gestion/firebase-kit';
import {
  Button,
  GaleriaPresetsTema,
  ReporteContrasteAa,
  SelectorTinte,
  SliderMatiz,
  useTema,
  useTemaNegocio,
  useToasts,
} from '@gestion/ui';
import { db } from '../../firebase';
import { resolverModoEfectivo } from '../MetaThemeColor';
import { ModalConfirmarRestablecerTemaNegocio } from './ModalConfirmarRestablecerTemaNegocio';

/** Base cuando el negocio todavía no personalizó nada (ni persistido ni
 * draft en curso): el preset "Miel" reproduce el carácter Minimalista
 * actual, así que arrancar el editor ahí es el punto menos sorpresivo. */
const TEMA_BASE = PRESETS_TEMA[0]!.tema;

function mismoTema(a: TemaPersonalizado | null, b: TemaPersonalizado | null): boolean {
  if (a === null || b === null) return a === b;
  return a.matiz === b.matiz && a.tinte === b.tinte;
}

/**
 * Sección "Colores del negocio" de Ajustes → Apariencia (solo admin, docs
 * 06-ui-ux.md §4, tanda TM). Editor con PREVIEW EN VIVO sobre toda la app:
 * elegir un preset o mover el slider/selector actualiza un `draft` local que
 * se manda a `previsualizar` (packages/ui/src/ProveedorTemaNegocio.tsx) —
 * ProveedorTemaNegocio pinta ese preview en el `<style id="tema-negocio">`
 * de inmediato, en TODA la app, no solo acá. Nada se persiste hasta
 * "Guardar"; "Descartar", navegar afuera o desmontar la sección SIEMPRE
 * vuelven a lo persistido (el cleanup del efecto de preview llama a
 * `restaurar()`).
 *
 * FUENTE DEL PERSISTIDO: `useTemaNegocio().tokens?.tema` son los tokens
 * EFECTIVOS (draft-aware, ver ese archivo) — mientras ESTA sección tiene un
 * draft activo, `tokens` refleja NUESTRO PROPIO preview, no lo guardado de
 * verdad. Por eso `persistido` se congela en estado local y solo se
 * resincroniza con `tokens` cuando `draft === null` (sin edición en curso):
 * cubre el mount inicial y un cambio remoto real (otro admin guardando
 * mientras esta pantalla está abierta pero sin editar), sin que el propio
 * preview se pise a sí mismo.
 */
export function SeccionColoresNegocio() {
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();
  const { tema } = useTema();
  const { tokens, previsualizar, restaurar } = useTemaNegocio();

  const [draft, setDraft] = useState<TemaPersonalizado | null>(null);
  const [persistido, setPersistido] = useState<TemaPersonalizado | null>(() => tokens?.tema ?? null);
  const [guardando, setGuardando] = useState(false);
  const [modalRestablecerAbierto, setModalRestablecerAbierto] = useState(false);
  const [restableciendo, setRestableciendo] = useState(false);

  useEffect(() => {
    if (draft === null) {
      setPersistido(tokens?.tema ?? null);
    }
  }, [draft, tokens]);

  // Preview en vivo: mientras haya un draft, se lo manda a ProveedorTemaNegocio.
  // El cleanup cubre los 3 casos de "SIEMPRE vuelve al persistido" (docs §4):
  // descartar (setDraft(null) más abajo), navegar afuera (desmonta la
  // sección) y desmontar directamente.
  useEffect(() => {
    if (draft === null) return undefined;
    previsualizar(generarPaleta(normalizarTema(draft)));
    return () => restaurar();
  }, [draft, previsualizar, restaurar]);

  const [prefiereOscuro, setPrefiereOscuro] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function escuchar() {
      setPrefiereOscuro(media.matches);
    }
    media.addEventListener('change', escuchar);
    return () => media.removeEventListener('change', escuchar);
  }, []);
  const modoEfectivo = resolverModoEfectivo(tema, prefiereOscuro);

  const base = draft ?? persistido ?? TEMA_BASE;
  const hayCambios = draft !== null && !mismoTema(draft, persistido);
  const reporte = tokens?.reporte ?? null;

  function elegirPreset(nuevoTema: TemaPersonalizado) {
    setDraft(nuevoTema);
  }

  function cambiarMatiz(matiz: number) {
    setDraft({ version: 1, matiz, tinte: base.tinte });
  }

  function cambiarTinte(tinte: TinteFondo) {
    setDraft({ version: 1, matiz: base.matiz, tinte });
  }

  function descartar() {
    setDraft(null);
  }

  async function guardar() {
    if (draft === null) return;
    const datos = { matiz: draft.matiz, tinte: draft.tinte };
    const escritura = guardarTemaNegocio(db, datos);

    if (!enLinea) {
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar los colores del negocio.', 'error');
      });
      setDraft(null);
      return;
    }

    setGuardando(true);
    try {
      await escritura;
      mostrarToast('Colores del negocio guardados.', 'exito');
      setDraft(null);
    } catch (err) {
      if (err instanceof ConfiguracionInvalidaError) {
        mostrarToast(err.message, 'error');
      } else {
        mostrarToast('No se pudo guardar. Intentá de nuevo.', 'error');
      }
    } finally {
      setGuardando(false);
    }
  }

  function abrirModalRestablecer() {
    setModalRestablecerAbierto(true);
  }

  function cerrarModalRestablecer() {
    setModalRestablecerAbierto(false);
  }

  async function restablecer() {
    const escritura = borrarTemaNegocio(db);

    if (!enLinea) {
      mostrarToast('Restablecido sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar el restablecimiento.', 'error');
      });
      cerrarModalRestablecer();
      return;
    }

    setRestableciendo(true);
    try {
      await escritura;
      mostrarToast('Colores del negocio restablecidos.', 'exito');
      cerrarModalRestablecer();
    } catch {
      mostrarToast('No se pudo restablecer. Intentá de nuevo.', 'error');
    } finally {
      setRestableciendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-secundario">
        Elegí los colores de la marca. Los van a ver todos los usuarios del negocio, en todos sus
        dispositivos.
      </p>

      <GaleriaPresetsTema temaActivo={base} modo={modoEfectivo} onElegir={elegirPreset} />

      <SliderMatiz valor={base.matiz} onChange={cambiarMatiz} />
      <SelectorTinte valor={base.tinte} onChange={cambiarTinte} />

      {reporte !== null && <ReporteContrasteAa reporte={reporte} />}

      {hayCambios && (
        <div className="flex flex-col gap-2 rounded-elemento border border-borde bg-fondo p-3">
          <p className="text-sm text-texto-secundario">
            Estás viendo una vista previa. Guardá para aplicarla a todo el equipo.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => void guardar()} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button variante="secundaria" onClick={descartar} disabled={guardando}>
              Descartar
            </Button>
          </div>
        </div>
      )}

      {persistido !== null && (
        <button
          type="button"
          onClick={abrirModalRestablecer}
          className="self-start text-sm text-texto-secundario underline hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
        >
          Volver a los colores originales
        </button>
      )}

      <ModalConfirmarRestablecerTemaNegocio
        abierto={modalRestablecerAbierto}
        restableciendo={restableciendo}
        onConfirmar={() => void restablecer()}
        onCerrar={cerrarModalRestablecer}
      />
    </div>
  );
}
