import { useEffect, useId, useState } from 'react';
import type { Peso } from '@gestion/core';
import {
  bufferDesdeValor,
  parsearBufferPeso,
  siguienteBufferPeso,
  type TeclaPeso,
  type UnidadPeso,
} from './bufferPeso';

export interface TecladoPesoProps {
  label: string;
  /**
   * Igual que en los modales del proyecto (ver `ModalIngresarPiezas`,
   * `ModalSumarStock`): cuando pasa a `true` el buffer se reinicia. El
   * teclado no tiene "apertura" propia — este flag lo controla el modal que
   * lo envuelve (su misma prop `abierto`), para resetear el peso tipeado
   * cada vez que se abre un nuevo flujo de "agregar al carrito".
   */
  abierto: boolean;
  onChange: (valor: Peso | null) => void;
  unidadInicial?: UnidadPeso;
  disabled?: boolean;
}

const FILAS_DIGITOS: TeclaPeso[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

const CLASE_TECLA =
  'flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-borde bg-superficie text-xl font-medium text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Teclado numérico propio para ingresar peso (docs/06-ui-ux.md §6): dígitos
 * 0-9, coma decimal y borrar, con toggle g/kg. Nunca dispara el teclado nativo
 * del dispositivo — son botones grandes (≥48px) pensados para mostrador. El
 * string tipeado se convierte a `Peso` SOLO con `pesoDesdeKg`/`peso` de
 * `@gestion/core` (`tecladoPeso.ts`), nunca con aritmética propia acá.
 */
export function TecladoPeso({
  label,
  abierto,
  onChange,
  unidadInicial = 'kg',
  disabled = false,
}: TecladoPesoProps) {
  const id = useId();
  const [unidad, setUnidad] = useState<UnidadPeso>(unidadInicial);
  const [buffer, setBuffer] = useState('');

  // Reinicia el teclado cada vez que el modal contenedor se abre.
  useEffect(() => {
    if (!abierto) return;
    setUnidad(unidadInicial);
    setBuffer('');
    onChange(null);
    // Solo debe correr al transicionar `abierto` (mismo criterio que el
    // resto de los modales del proyecto, ver ModalIngresarPiezas): no
    // depende de `onChange`/`unidadInicial` a propósito, son props estables
    // en la práctica (handlers definidos una vez por el modal contenedor).
  }, [abierto]);

  function aplicar(tecla: TeclaPeso) {
    const nuevoBuffer = siguienteBufferPeso(buffer, tecla, unidad);
    setBuffer(nuevoBuffer);
    onChange(parsearBufferPeso(nuevoBuffer, unidad));
  }

  function cambiarUnidad(nueva: UnidadPeso) {
    if (disabled || nueva === unidad) return;
    const valorActual = parsearBufferPeso(buffer, unidad);
    setUnidad(nueva);
    setBuffer(bufferDesdeValor(valorActual, nueva));
    // El valor de dominio no cambia al cambiar de unidad: no hace falta
    // volver a llamar a onChange.
  }

  const textoMostrado = buffer === '' ? '0' : buffer;

  // Mismo patrón que el toggle g/kg de `PesoInput` (@gestion/ui): clase por
  // estado en vez de variantes `data-*` de Tailwind (sin precedente en el
  // repo).
  const claseUnidad = (activa: boolean) =>
    `min-h-[44px] min-w-[44px] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-50 ${
      activa ? 'bg-primary-600 text-white' : 'bg-superficie text-texto hover:bg-fondo'
    }`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span id={id} className="text-sm font-medium text-texto">
          {label}
        </span>
        <div
          role="group"
          aria-label={`Unidad de ${label}`}
          className="inline-flex overflow-hidden rounded-lg border border-borde"
        >
          <button
            type="button"
            aria-pressed={unidad === 'g'}
            disabled={disabled}
            onClick={() => cambiarUnidad('g')}
            className={claseUnidad(unidad === 'g')}
          >
            g
          </button>
          <button
            type="button"
            aria-pressed={unidad === 'kg'}
            disabled={disabled}
            onClick={() => cambiarUnidad('kg')}
            className={`${claseUnidad(unidad === 'kg')} border-l border-borde`}
          >
            kg
          </button>
        </div>
      </div>

      <div
        role="textbox"
        aria-readonly="true"
        aria-labelledby={id}
        aria-live="polite"
        className="rounded-xl border border-borde bg-superficie px-4 py-3 text-right text-3xl font-bold tabular-nums text-texto"
      >
        {textoMostrado}
        <span className="ml-1 text-base font-medium text-texto-secundario">{unidad}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {FILAS_DIGITOS.flat().map((tecla) => (
          <button
            key={tecla}
            type="button"
            disabled={disabled}
            onClick={() => aplicar(tecla)}
            className={CLASE_TECLA}
          >
            {tecla}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || unidad === 'g'}
          onClick={() => aplicar(',')}
          aria-label="Coma decimal"
          className={CLASE_TECLA}
        >
          ,
        </button>
        <button type="button" disabled={disabled} onClick={() => aplicar('0')} className={CLASE_TECLA}>
          0
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => aplicar('borrar')}
          aria-label="Borrar último dígito"
          className={CLASE_TECLA}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
