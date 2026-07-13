import { useEffect, useState } from 'react';
import { Button, Modal } from '@gestion/ui';
import { BPS_TOTAL } from '@gestion/core';
import { CampoPorcentaje, normalizarPorcentaje } from '../componentes/stock/CampoPorcentaje';

export interface ModalMargenMasivoProps {
  abierto: boolean;
  /** Cantidad de productos filtrados (búsqueda + categoría + "solo bajo
   * objetivo") que van a recibir el margen — ya excluye sin costo y margen
   * no comparable (`elegibleParaMargenMasivo`, ver `Precios.tsx`). */
  cantidadElegibles: number;
  /** Desglose de exclusiones sobre el TOTAL de filtrados, para que el dueño
   * entienda por qué N no coincide con lo que ve en la tabla. */
  cantidadSinCosto: number;
  cantidadNoComparable: number;
  /** `true` mientras "Fijar objetivo" está resolviendo (deshabilita botones e
   * input). "Fijar y aplicar precios" no usa este flag: abre la confirmación
   * de `Precios.tsx`, que tiene su propio estado de guardado. */
  guardando: boolean;
  onCerrar: () => void;
  onFijarObjetivo: (margenBps: number) => void;
  onFijarYAplicar: (margenBps: number) => void;
}

/**
 * Modal de "Margen para los filtrados" (WA-H, doc 03) — margen objetivo
 * masivo sobre los productos actualmente filtrados en `Precios.tsx`. Reusa
 * `CampoPorcentaje`/`normalizarPorcentaje` de `../componentes/stock/CampoPorcentaje`
 * (mismo formato bps que el editor individual de `ModalPrecio`, extraído a
 * un módulo compartido para no triplicarlo — nota de docs/04-plan-fases.md).
 *
 * No sigue el patrón "instancia estable con último valor mostrado" de
 * `ModalPrecio`: acá no hay un producto concreto que preservar, solo
 * contadores derivados de la pantalla — siempre disponibles vía props,
 * incluso mientras el modal termina de cerrarse.
 *
 * "Fijar objetivo" solo escribe `margenObjetivoBps` (mismo riesgo que
 * editarlo a mano en `ModalPrecio`, sin confirmación extra) y se ejecuta al
 * toque. "Fijar y aplicar precios" además cambia `precioVentaCents` en masa
 * — como `Precios.tsx` ya exige una confirmación explícita para "Aplicar
 * sugeridos", este botón NO escribe nada acá: valida el porcentaje, cierra
 * este modal y le pasa el bps al padre, que abre esa misma confirmación con
 * el detalle actual → sugerido antes de tocar un precio.
 */
export function ModalMargenMasivo({
  abierto,
  cantidadElegibles,
  cantidadSinCosto,
  cantidadNoComparable,
  guardando,
  onCerrar,
  onFijarObjetivo,
  onFijarYAplicar,
}: ModalMargenMasivoProps) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!abierto) return;
    setTexto('');
    setError(undefined);
  }, [abierto]);

  function parsear(): number | null {
    const bps = normalizarPorcentaje(texto);
    if (bps === null) {
      setError('Ingresá un porcentaje válido, ej: 40 o 33,33.');
      return null;
    }
    if (bps >= BPS_TOTAL) {
      setError('El margen objetivo debe ser menor a 100 %.');
      return null;
    }
    setError(undefined);
    return bps;
  }

  function handleFijarObjetivo() {
    const bps = parsear();
    if (bps !== null) onFijarObjetivo(bps);
  }

  function handleFijarYAplicar() {
    const bps = parsear();
    if (bps !== null) onFijarYAplicar(bps);
  }

  // Un solo nodo de texto (en vez de armarlo con JSX intercalado) para que
  // el mensaje sea un párrafo legible de una — y fácil de matchear en tests
  // con `getByText`, que trabaja sobre el `textContent` completo del
  // elemento, no sobre nodos de texto sueltos.
  const textoExclusiones = (() => {
    if (cantidadSinCosto === 0 && cantidadNoComparable === 0) return null;
    const partes: string[] = [];
    if (cantidadSinCosto > 0) partes.push(`${cantidadSinCosto} sin costo cargado`);
    if (cantidadNoComparable > 0) {
      partes.push(`${cantidadNoComparable} con costo y precio en unidades no comparables (pieza vendida por unidad)`);
    }
    return `Quedan afuera ${partes.join(' y ')}.`;
  })();

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Margen para los filtrados"
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            variante="secundaria"
            onClick={handleFijarObjetivo}
            disabled={guardando || cantidadElegibles === 0}
          >
            {guardando ? 'Fijando…' : 'Fijar objetivo'}
          </Button>
          <Button onClick={handleFijarYAplicar} disabled={guardando || cantidadElegibles === 0}>
            Fijar y aplicar precios
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-texto-secundario">
          Se va a fijar el mismo margen objetivo en los {cantidadElegibles} producto(s) actualmente filtrados que
          tienen costo y margen calculable. "Fijar y aplicar precios" además actualiza el precio de venta de esos
          productos al precio sugerido, con el redondeo comercial de siempre.
        </p>

        <CampoPorcentaje
          label="Nuevo margen objetivo (%)"
          value={texto}
          onChange={setTexto}
          error={error}
          placeholder="Ej: 40"
        />

        {textoExclusiones !== null && <p className="text-sm text-texto-secundario">{textoExclusiones}</p>}

        {cantidadElegibles === 0 && (
          <p className="text-sm text-texto-secundario">
            Ningún producto filtrado es elegible para el margen masivo.
          </p>
        )}
      </div>
    </Modal>
  );
}
