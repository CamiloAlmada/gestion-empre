import { useEffect, useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import {
  DIAS_AVISO_VENCIMIENTO_DEFAULT,
  DIAS_AVISO_VENCIMIENTO_MAX,
  DIAS_AVISO_VENCIMIENTO_MIN,
  diasAvisoValido,
  type Configuracion,
} from '@gestion/core';
import { Button, Input, useToasts } from '@gestion/ui';
import {
  ConfiguracionInvalidaError,
  configuracionConverter,
  guardarDiasAvisoVencimiento,
  useDoc,
  useOnlineStatus,
} from '@gestion/firebase-kit';
import { db } from '../../firebase';

const MENSAJE_RANGO = `Ingresá un número entero entre ${DIAS_AVISO_VENCIMIENTO_MIN} y ${DIAS_AVISO_VENCIMIENTO_MAX}.`;

/**
 * Sección "Alertas de stock" de Ajustes (solo admin, tarea B3 de
 * `docs/PLAN-ACTIVO.md`): con cuántos días de anticipación avisa la app que una
 * pieza está por vencer.
 *
 * Es la ÚNICA ventana de aviso del sistema: la franja de Productos, el badge de
 * cada pieza y el reporte de vencimientos leen todos este mismo valor (ver
 * `useContextoAlertas`). Por eso el texto de ayuda dice dónde impacta — un
 * ajuste que cambia tres pantallas no puede parecer local.
 *
 * Guardado con el patrón offline híbrido estándar del proyecto (igual que
 * `SeccionNegocio`): en línea espera el ack antes de avisar; sin conexión
 * dispara la escritura sin esperar y avisa que falta sincronizar. La escritura
 * es un merge de UNA clave: no puede pisar el resto de `configuracion/general`.
 */
export function SeccionAlertas() {
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const configuracionRef = useMemo(
    () => doc(db, 'configuracion', 'general').withConverter(configuracionConverter),
    [],
  );
  const { datos: configuracion, cargando } = useDoc<Configuracion>(configuracionRef);

  const [dias, setDias] = useState(String(DIAS_AVISO_VENCIMIENTO_DEFAULT));
  const [error, setError] = useState<string | undefined>();
  const [guardando, setGuardando] = useState(false);
  // Precarga UNA sola vez, al llegar el primer dato: el snapshot en vivo no
  // debe pisar lo que el admin está tipeando (mismo criterio que `SeccionNegocio`).
  const [precargado, setPrecargado] = useState(false);

  useEffect(() => {
    if (precargado || cargando) return;
    const guardado = configuracion?.diasAvisoVencimiento;
    setDias(String(guardado ?? DIAS_AVISO_VENCIMIENTO_DEFAULT));
    setPrecargado(true);
  }, [precargado, cargando, configuracion]);

  async function guardar() {
    const limpio = dias.trim();
    // `Number(limpio)` sobre '' da 0 y sobre 'abc' da NaN: los dos caen fuera
    // del rango, así que `diasAvisoValido` cubre los tres casos con un chequeo.
    const valor = Number(limpio);
    if (limpio === '' || !diasAvisoValido(valor)) {
      setError(MENSAJE_RANGO);
      return;
    }
    setError(undefined);

    const escritura = guardarDiasAvisoVencimiento(db, valor);

    if (!enLinea) {
      mostrarToast('Guardado sin conexión. Se sincronizará al reconectar.', 'info');
      escritura.catch(() => {
        mostrarToast('No se pudo sincronizar el aviso de vencimientos.', 'error');
      });
      return;
    }

    setGuardando(true);
    try {
      await escritura;
      mostrarToast('Aviso de vencimientos guardado.', 'exito');
    } catch (err) {
      if (err instanceof ConfiguracionInvalidaError) {
        setError(err.message);
      } else {
        mostrarToast('No se pudo guardar el aviso de vencimientos. Intentá de nuevo.', 'error');
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Input
          label="Avisar vencimientos con"
          value={dias}
          onChange={setDias}
          type="number"
          error={error}
          disabled={guardando}
          placeholder={String(DIAS_AVISO_VENCIMIENTO_DEFAULT)}
        />
        <p className="text-xs text-texto-secundario">
          Días de anticipación. Una pieza que vence dentro de ese plazo aparece en Reportes y en la
          franja de alertas de Productos, a tiempo para rematarla o promocionarla.
        </p>
      </div>

      <Button onClick={() => void guardar()} disabled={guardando} className="self-start">
        {guardando ? 'Guardando…' : 'Guardar'}
      </Button>
    </div>
  );
}
