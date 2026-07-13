import { useEffect, useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import { Button, Input, useToasts } from '@gestion/ui';
import {
  ConfiguracionInvalidaError,
  configuracionConverter,
  guardarConfiguracionGeneral,
  useDoc,
  useOnlineStatus,
} from '@gestion/firebase-kit';
import { db } from '../../firebase';

/** Código de país sugerido cuando el negocio todavía no configuró el suyo
 * (doc 08: "default `598`", Uruguay). Es puramente el valor con el que
 * arranca el campo — `guardarConfiguracionGeneral` no aplica ningún default
 * propio, así que si el admin lo deja así y guarda, este es el valor que se
 * persiste. */
const CODIGO_PAIS_SUGERIDO = '598';

interface Errores {
  nombreNegocio?: string;
  codigoPaisDefault?: string;
}

/**
 * Sección "Negocio" de Ajustes (solo admin, doc 08): `nombreNegocio`
 * (alimenta el placeholder `{negocio}` de las plantillas de WhatsApp) y
 * `codigoPaisDefault` (antepuesto a los teléfonos locales de clientes al
 * armar links `wa.me`). Un único formulario — `guardarConfiguracionGeneral`
 * exige ambos campos juntos, no admite guardar uno solo (ver su firma en
 * `packages/firebase-kit/src/configuracion.ts`).
 *
 * Guardado con el patrón offline híbrido estándar del proyecto (igual que
 * `Usuarios.tsx`/`ModalConfirmarDesactivarProveedor`): en línea espera el ack
 * antes de avisar; sin conexión dispara la escritura sin esperar, avisa con
 * un toast informativo y el error de sincronización (si lo hay) llega después
 * por su propio toast. No hay lectura previa que pueda pisarse (es un merge
 * de 2 claves conocidas), así que no hace falta bloquear la escritura offline
 * como si hace `Categorias.tsx`.
 *
 * Lee con `configuracionConverter` del kit (WA-F2: antes de WA-B2 esta
 * sección usaba un converter local porque ese converter explotaba si
 * `umbralPiezaAgotadaGramos`/`metodoProrrateo` estaban ausentes — el caso
 * exacto de guardar solo `nombreNegocio`/`codigoPaisDefault` antes de que
 * Fase 2/compras escriba esos otros dos campos. WA-B2 lo endureció para
 * tolerar cualquier subconjunto de `configuracion/general`, así que el
 * workaround local quedó redundante y se eliminó — una sola fuente de verdad
 * para el shape de este doc).
 */
export function SeccionNegocio() {
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const configuracionRef = useMemo(
    () => doc(db, 'configuracion', 'general').withConverter(configuracionConverter),
    [],
  );
  const { datos: configuracion, cargando } = useDoc(configuracionRef);

  const [nombreNegocio, setNombreNegocio] = useState('');
  const [codigoPaisDefault, setCodigoPaisDefault] = useState(CODIGO_PAIS_SUGERIDO);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | undefined>();
  const [guardando, setGuardando] = useState(false);
  // Evita que el snapshot en vivo pise lo que el admin está tipeando: solo
  // precarga el formulario UNA vez, al llegar el primer dato (mismo criterio
  // que `CompraPantalla.tsx` con el borrador en memoria).
  const [precargado, setPrecargado] = useState(false);

  useEffect(() => {
    if (precargado || cargando) return;
    setNombreNegocio(configuracion?.nombreNegocio ?? '');
    setCodigoPaisDefault(configuracion?.codigoPaisDefault ?? CODIGO_PAIS_SUGERIDO);
    setPrecargado(true);
  }, [precargado, cargando, configuracion]);

  function validarLocal(): Errores | null {
    const nuevosErrores: Errores = {};
    if (nombreNegocio.trim() === '') {
      nuevosErrores.nombreNegocio = 'Ingresá el nombre del negocio.';
    }
    if (!/^\d{1,4}$/.test(codigoPaisDefault.trim())) {
      nuevosErrores.codigoPaisDefault = 'El código de país debe ser de 1 a 4 dígitos (sin +).';
    }
    return Object.keys(nuevosErrores).length > 0 ? nuevosErrores : null;
  }

  async function guardar() {
    const nuevosErrores = validarLocal();
    if (nuevosErrores !== null) {
      setErrores(nuevosErrores);
      return;
    }
    setErrores({});
    setErrorGeneral(undefined);

    const datos = { nombreNegocio: nombreNegocio.trim(), codigoPaisDefault: codigoPaisDefault.trim() };
    const escritura = guardarConfiguracionGeneral(db, datos);

    if (!enLinea) {
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar la configuración del negocio.', 'error');
      });
      return;
    }

    setGuardando(true);
    try {
      await escritura;
      mostrarToast('Configuración del negocio guardada.', 'exito');
    } catch (err) {
      if (err instanceof ConfiguracionInvalidaError) {
        setErrorGeneral(err.message);
      } else {
        mostrarToast('No se pudo guardar la configuración. Intentá de nuevo.', 'error');
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Input
          label="Nombre del negocio"
          value={nombreNegocio}
          onChange={setNombreNegocio}
          error={errores.nombreNegocio}
          disabled={guardando}
          placeholder="Ej: Quesarte"
        />
        <p className="text-xs text-texto-secundario">
          Se usa para completar el placeholder <code>{'{negocio}'}</code> de los mensajes de WhatsApp.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Input
          label="Código de país"
          value={codigoPaisDefault}
          onChange={setCodigoPaisDefault}
          error={errores.codigoPaisDefault}
          disabled={guardando}
          placeholder={CODIGO_PAIS_SUGERIDO}
        />
        <p className="text-xs text-texto-secundario">Para normalizar teléfonos de clientes.</p>
      </div>

      {errorGeneral !== undefined && (
        <p role="alert" className="text-sm text-peligro">
          {errorGeneral}
        </p>
      )}

      <Button onClick={() => void guardar()} disabled={guardando} className="self-start">
        {guardando ? 'Guardando…' : 'Guardar'}
      </Button>
    </div>
  );
}
