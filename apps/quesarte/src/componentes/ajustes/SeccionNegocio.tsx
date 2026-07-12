import { useEffect, useMemo, useState } from 'react';
import {
  doc,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
} from 'firebase/firestore';
import { Button, Input, useToasts } from '@gestion/ui';
import {
  ConfiguracionInvalidaError,
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

/**
 * Subconjunto de `configuracion/general` que esta sección necesita leer.
 *
 * Deliberadamente NO usa `configuracionConverter` (el converter del kit para
 * este mismo doc): ese converter reconstruye `umbralPiezaAgotadaGramos` con
 * `peso()`, que **explota** (`RangeError`) si el campo no es un entero — y
 * hoy nada en el código escribe todavía `umbralPiezaAgotadaGramos`/
 * `metodoProrrateo` (Fase 2 / compras sigue en curso). `firestore.rules`
 * declara las 4 claves de `configuracion/general` como opcionales a
 * propósito (merge parcial), así que un negocio que recién usa ESTA sección
 * para fijar `nombreNegocio`/`codigoPaisDefault` deja el doc SIN esos dos
 * campos de Fase 2 — el escenario exacto que `configuracionConverter`
 * rompe. Se reporta al tech lead (ver informe de la tarea); mientras tanto,
 * esta sección lee con un converter local, tolerante, que no toca `peso()`.
 */
interface ConfiguracionGeneralParcial {
  nombreNegocio?: string;
  codigoPaisDefault?: string;
}

const configuracionGeneralParcialConverter: FirestoreDataConverter<ConfiguracionGeneralParcial> = {
  toFirestore(datos): DocumentData {
    return datos as DocumentData;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): ConfiguracionGeneralParcial {
    const datos = snapshot.data(options) as Record<string, unknown>;
    return {
      nombreNegocio: typeof datos.nombreNegocio === 'string' ? datos.nombreNegocio : undefined,
      codigoPaisDefault: typeof datos.codigoPaisDefault === 'string' ? datos.codigoPaisDefault : undefined,
    };
  },
};

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
 */
export function SeccionNegocio() {
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const configuracionRef = useMemo(
    () => doc(db, 'configuracion', 'general').withConverter(configuracionGeneralParcialConverter),
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
