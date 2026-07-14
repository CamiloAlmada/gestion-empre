import { useMemo, useState } from 'react';
import { doc, type Firestore } from 'firebase/firestore';
import {
  construirLinkWhatsApp,
  normalizarTelefono,
  resolverPlantilla,
  PLANTILLAS_SEED,
  type ContextoPlantilla,
  type PlantillaWhatsApp,
} from '@gestion/core';
import { configuracionConverter, plantillasWhatsAppConverter, useDoc } from '@gestion/firebase-kit';
import { IconoWhatsApp, Modal } from '@gestion/ui';

export interface BotonWhatsAppProps {
  /** Teléfono tal como lo tipeó el usuario (display), si lo hay. */
  telefono?: string;
  /**
   * Teléfono ya normalizado a E.164 (`Cliente.telefonoE164`), si el caller lo
   * tiene a mano. Tiene PRIORIDAD sobre `telefono`: evita renormalizar en
   * cada render y es la fuente de verdad cuando existe. `telefono` queda como
   * FALLBACK (WA-C2, doc 08 "Los clientes de Fase 1.5 no lo tienen") para
   * clientes creados antes de WA-B, que no tienen `telefonoE164` derivado
   * todavía: se normaliza acá mismo con el `codigoPaisDefault` vigente.
   */
  telefonoE164?: string;
  /** Contexto de plantilla a ofrecer (dónde vive el botón, doc 08). */
  contexto: ContextoPlantilla;
  /**
   * Valores YA FORMATEADOS de los placeholders que el caller conoce
   * (`{cliente}`, `{total}`, `{items}`, `{diasSinVenir}` según el contexto).
   * `{negocio}` NO se pasa acá a propósito: este componente ya lee
   * `configuracion/general` para el código de país, así que de paso resuelve
   * `{negocio}` centralizadamente con `nombreNegocio` — evita que los 3
   * puntos de contacto (venta, ficha, inactivos) dupliquen el mismo `useDoc`.
   * Si el negocio no tiene `nombreNegocio` configurado, `{negocio}` queda
   * literal en el mensaje (no se inventa un valor): mismo criterio de
   * `resolverPlantilla` ("placeholder sin valor, visible a propósito").
   */
  valores: Record<string, string>;
  db: Firestore;
  /** Clase extra opcional, para que el caller ajuste el layout (gap, orden). */
  className?: string;
}

// Identidad visual de marca (tarea WA-I, docs/06-ui-ux.md §7 "Marca
// WhatsApp"): fondo `bg-whatsapp` (#25D366) con label en NEGRO fijo
// (`text-black`, no un token semántico — igual criterio que `text-white` en
// `Button` primaria: un literal de Tailwind, no un hex hardcodeado). Es el
// ÚNICO par verificado que pasa AA (≥4.5:1 texto) en las 4 combinaciones
// tema×estilo, porque ambos lados son colores FIJOS: ni el texto adaptativo
// (`texto`, que en dark casi blanco) ni blanco sobre el verde (~2:1, el caso
// que motivó esta tarea) cumplen. `hover:bg-whatsapp-oscuro` (#128C7E)
// también pasa con el mismo negro (5.08:1) — ver ratios en docs/06 §7. El
// GLIFO va aparte en blanco (exento como logotipo, ver el JSX de abajo).
const CLASE_BOTON =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control bg-whatsapp px-4 font-medium text-black hover:bg-whatsapp-oscuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie';

const CLASE_ITEM_SELECTOR =
  'flex min-h-[44px] w-full items-center rounded-control border border-borde bg-superficie px-4 text-left font-medium text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

/**
 * Botón "WhatsApp" compartido por los 3 puntos de contacto del doc 08 (venta,
 * ficha de cliente, lista de inactivos). Encapsula TODO el flujo: resuelve el
 * teléfono (con fallback de normalización), trae las plantillas del contexto
 * (con fallback a `PLANTILLAS_SEED`), resuelve los placeholders y abre
 * `wa.me`. Vive en la app —no en `packages/ui`, regla de oro 2— porque usa
 * `useDoc`/Firestore para configuración y plantillas.
 *
 * Restricción de diseño (doc 08, "la app nunca envía mensajes, los
 * prepara"): `abrirWhatsApp` corre EXCLUSIVAMENTE dentro de un `onClick` del
 * botón o de un ítem del selector — un gesto del usuario sobre UN cliente a
 * la vez. Nada de loops sobre clientes, nada de "enviar a todos", ningún
 * efecto (`useEffect`) abre `wa.me` por su cuenta.
 *
 * Si el teléfono no es normalizable, o no hay ninguna plantilla para
 * `contexto` (ni siquiera en el seed), el componente NO RENDERIZA NADA
 * (criterio de aceptación del doc 08: "el botón no aparece").
 */
export function BotonWhatsApp({
  telefono,
  telefonoE164,
  contexto,
  valores,
  db,
  className = '',
}: BotonWhatsAppProps) {
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  const configuracionRef = useMemo(
    () => doc(db, 'configuracion', 'general').withConverter(configuracionConverter),
    [db],
  );
  const configuracion = useDoc(configuracionRef);

  const plantillasRef = useMemo(
    () => doc(db, 'configuracion', 'plantillasWhatsApp').withConverter(plantillasWhatsAppConverter),
    [db],
  );
  const plantillasDoc = useDoc(plantillasRef);

  // Fallback de normalización (WA-C2, doc 08): `telefonoE164` ya derivado
  // tiene prioridad; si no existe (cliente pre-WA-B) se normaliza `telefono`
  // acá mismo con el código de país del negocio (o el default `'598'` de
  // `normalizarTelefono` mientras `configuracion/general` carga o no trae
  // `codigoPaisDefault`).
  const telefonoResuelto =
    telefonoE164 ??
    (telefono !== undefined ? normalizarTelefono(telefono, configuracion.datos?.codigoPaisDefault) : null);

  // Plantillas efectivas: las de Firestore si el doc trae AL MENOS una; si
  // está vacío o ausente, se cae al seed (doc 08 — "la demo no puede
  // depender de que Ajustes haya sembrado").
  const todasLasPlantillas: readonly PlantillaWhatsApp[] =
    plantillasDoc.datos !== null && plantillasDoc.datos.length > 0 ? plantillasDoc.datos : PLANTILLAS_SEED;
  const plantillasContexto = todasLasPlantillas.filter((p) => p.contexto === contexto);

  if (telefonoResuelto === null || telefonoResuelto === undefined || plantillasContexto.length === 0) {
    return null;
  }

  // Reasignado a una `const` de tipo `string` (no unión con `null`): así la
  // narrowing de arriba sobrevive dentro de los closures de más abajo.
  const telefonoFinal: string = telefonoResuelto;

  const valoresCompletos: Record<string, string> =
    configuracion.datos?.nombreNegocio !== undefined
      ? { ...valores, negocio: configuracion.datos.nombreNegocio }
      : valores;

  function abrirWhatsApp(plantilla: PlantillaWhatsApp) {
    const mensaje = resolverPlantilla(plantilla.texto, valoresCompletos);
    const url = construirLinkWhatsApp(telefonoFinal, mensaje);
    // `window.open` (no un `<a href>` estático): el link se arma recién acá,
    // con los datos VIGENTES al momento del toque — un `href` fijo calculado
    // en el render podría quedar viejo si el componente no vuelve a
    // renderizar entre el montaje y el toque. `noopener,noreferrer` evita
    // que la pestaña nueva toque `window.opener` (mismo criterio que
    // cualquier link externo del proyecto). En PWA instalada (Android/iOS,
    // standalone) `wa.me` igual resuelve al intent/deep-link que abre la app
    // de WhatsApp — no depende de que el navegador tenga una barra de
    // pestañas visible. Es además el único mecanismo espiable con
    // `vi.spyOn(window, 'open')` en los tests.
    window.open(url, '_blank', 'noopener,noreferrer');
    setSelectorAbierto(false);
  }

  function manejarClick() {
    if (plantillasContexto.length === 1) {
      abrirWhatsApp(plantillasContexto[0]!);
      return;
    }
    setSelectorAbierto(true);
  }

  // Aria-label con el nombre del cliente cuando el caller lo pasa (todos los
  // puntos de contacto del doc 08 pasan `{cliente}`): el texto visible del
  // botón ("WhatsApp") es idéntico en cada fila de una lista (p. ej.
  // inactivos), así que sin esto un lector de pantalla anuncia "WhatsApp,
  // WhatsApp, WhatsApp…" sin forma de distinguirlas.
  const etiquetaCliente = valores.cliente;
  const ariaLabel = etiquetaCliente !== undefined ? `Enviar WhatsApp a ${etiquetaCliente}` : 'Enviar WhatsApp';

  return (
    <>
      <button
        type="button"
        onClick={manejarClick}
        aria-label={ariaLabel}
        className={`${CLASE_BOTON} ${className}`}
      >
        {/* Glifo BLANCO (decisión del dueño 2026-07-14, look clásico de la
            marca): logotipo exento de AA (docs/06 §7, "usos decorativos") —
            el contraste exigible lo lleva el label, que sigue en el par
            negro/verde aprobado (`text-black` de CLASE_BOTON). */}
        <IconoWhatsApp className="h-5 w-5 text-white" />
        WhatsApp
      </button>

      {plantillasContexto.length > 1 && (
        <Modal
          abierto={selectorAbierto}
          onCerrar={() => setSelectorAbierto(false)}
          titulo="Elegir mensaje"
        >
          <ul className="flex flex-col gap-2">
            {plantillasContexto.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => abrirWhatsApp(p)} className={CLASE_ITEM_SELECTOR}>
                  {p.nombre}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
