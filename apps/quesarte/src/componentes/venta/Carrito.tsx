import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { formatearMoney } from '@gestion/core';
import { Button } from '@gestion/ui';
import { detalleItem, totalCarrito, type ItemCarrito } from './itemsCarrito';

/**
 * Umbral de arrastre para cerrar la hoja expandida arrastrando desde el
 * agarre (docs/06-ui-ux.md §6). Fijo en px (no % de la altura de la hoja):
 * la altura varía con la cantidad de ítems y en jsdom `getBoundingClientRect`
 * devuelve 0 (no hay layout real), así que un umbral relativo sería
 * indeterminista en tests y, para el usuario, un gesto de "tirar hacia
 * abajo" con el pulgar tiene un recorrido físico parecido sin importar
 * cuánto contenido tenga la lista. 90px es el punto medio del rango sugerido
 * (~80-100px).
 */
const UMBRAL_CIERRE_ARRASTRE_PX = 90;

/**
 * `matchMedia` no existe en jsdom (ni la propiedad está definida en
 * `window`, ver MetaThemeColor.test.tsx) — se guarda con un chequeo de tipo
 * en vez de `vi.spyOn`. Se consulta en el momento (sin state ni listener):
 * el arrastre es una interacción corta, no hace falta reaccionar a un
 * cambio de la preferencia del SO a mitad de gesto.
 */
function prefiereMovimientoReducido(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface CarritoProps {
  items: ItemCarrito[];
  onQuitar: (clave: string) => void;
  onCobrar: () => void;
  /** `true` mientras se procesa el cobro (deshabilita "Cobrar" para evitar doble envío). */
  procesando: boolean;
}

interface FilaItemProps {
  item: ItemCarrito;
  onQuitar: (clave: string) => void;
}

function FilaItem({ item, onQuitar }: FilaItemProps) {
  return (
    <li className="flex items-start justify-between gap-2 rounded-elemento border border-borde bg-superficie p-3">
      <div className="flex flex-col">
        <span className="font-medium text-texto">{item.producto.nombre}</span>
        <span className="text-sm text-texto-secundario">{detalleItem(item)}</span>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="tabular-nums font-semibold text-texto">{formatearMoney(item.subtotalCents)}</span>
        {/* Quitar del carrito es reversible: nunca pide confirmación (docs/06-ui-ux.md §6). */}
        <button
          type="button"
          onClick={() => onQuitar(item.clave)}
          aria-label={`Quitar ${item.producto.nombre} del carrito`}
          className="min-h-[44px] text-sm text-peligro underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
        >
          Quitar
        </button>
      </div>
    </li>
  );
}

/**
 * Carrito de venta: en pantallas anchas, panel lateral siempre visible; en
 * mostrador angosto, resumen inferior fijo (sobre la tab bar) con contador y
 * total, expandible para ver el detalle (docs/06-ui-ux.md §6). El botón
 * "Cobrar" está SIEMPRE visible en ambos layouts, con el total calculado por
 * `totalCarrito` (`sumarMoney` de core, cero aritmética propia acá).
 */
export function Carrito({ items, onQuitar, onCobrar, procesando }: CarritoProps) {
  const [expandidoMobile, setExpandidoMobile] = useState(false);
  // Desplazamiento vertical (px, siempre ≥0) que sigue al dedo mientras se
  // arrastra el agarre hacia abajo; `arrastrando` distingue "siguiendo el
  // dedo" (sin transición) de "volviendo a su lugar" (con transición).
  const [arrastreY, setArrastreY] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const inicioArrastreRef = useRef<number | null>(null);
  const total = totalCarrito(items);
  const cantidad = items.length;
  const carritoVacio = cantidad === 0;

  // Cerrar con Escape mientras la hoja mobile está expandida (docs/06-ui-ux.md §5).
  useEffect(() => {
    if (!expandidoMobile) return;
    function alPresionarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setExpandidoMobile(false);
    }
    document.addEventListener('keydown', alPresionarTecla);
    return () => document.removeEventListener('keydown', alPresionarTecla);
  }, [expandidoMobile]);

  // Arrastre para cerrar desde la franja superior (agarre) de la hoja
  // expandida (docs/06-ui-ux.md §6). Pointer Events cubre touch y mouse con
  // una sola API; `setPointerCapture` asegura que move/up sigan llegando acá
  // aunque el dedo salga de la franja. jsdom (tests) no implementa
  // `setPointerCapture`, de ahí el chequeo de tipo antes de llamarlo.
  function alBajarPuntero(evento: ReactPointerEvent<HTMLDivElement>) {
    inicioArrastreRef.current = evento.clientY;
    setArrastrando(true);
    if (typeof evento.currentTarget.setPointerCapture === 'function') {
      evento.currentTarget.setPointerCapture(evento.pointerId);
    }
  }

  function alMoverPuntero(evento: ReactPointerEvent<HTMLDivElement>) {
    if (inicioArrastreRef.current === null) return;
    // Arrastres hacia arriba se ignoran (clamp a 0): la hoja expandida no
    // se "estira" más allá de su posición de reposo.
    const delta = Math.max(0, evento.clientY - inicioArrastreRef.current);
    // prefers-reduced-motion: nunca se actualiza `arrastreY`, así que la
    // hoja no sigue visualmente al dedo (sin animación de seguimiento).
    if (!prefiereMovimientoReducido()) {
      setArrastreY(delta);
    }
  }

  function soltarArrastre(evento: ReactPointerEvent<HTMLDivElement>) {
    if (inicioArrastreRef.current === null) return;
    const delta = Math.max(0, evento.clientY - inicioArrastreRef.current);
    inicioArrastreRef.current = null;
    setArrastrando(false);
    setArrastreY(0);
    if (delta > UMBRAL_CIERRE_ARRASTRE_PX) setExpandidoMobile(false);
  }

  function cancelarArrastre() {
    inicioArrastreRef.current = null;
    setArrastrando(false);
    setArrastreY(0);
  }

  const estiloArrastre: CSSProperties | undefined =
    expandidoMobile && arrastreY > 0
      ? { transform: `translateY(${arrastreY}px)`, transition: arrastrando ? 'none' : 'transform 180ms ease-out' }
      : undefined;

  return (
    <>
      {/* Ancho: panel lateral siempre visible. */}
      <aside className="hidden lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-6rem)] lg:flex-col lg:gap-3 lg:rounded-card lg:border lg:border-borde lg:bg-superficie lg:p-4">
        <h2 className="text-base font-semibold text-texto">Carrito</h2>
        {carritoVacio ? (
          <p className="text-sm text-texto-secundario">Todavía no agregaste productos.</p>
        ) : (
          <ul className="flex flex-col gap-2 overflow-y-auto">
            {items.map((item) => (
              <FilaItem key={item.clave} item={item} onQuitar={onQuitar} />
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-col gap-2 border-t border-borde pt-3">
          <div className="flex items-center justify-between text-lg font-bold text-texto">
            <span>Total</span>
            <span className="tabular-nums">{formatearMoney(total)}</span>
          </div>
          <Button onClick={onCobrar} disabled={carritoVacio || procesando} className="min-h-[48px] w-full text-base">
            Cobrar
          </Button>
        </div>
      </aside>

      {/* Angosto (mostrador): resumen fijo sobre la tab bar, expandible. */}
      {expandidoMobile && (
        // Scrim decorativo (docs/06-ui-ux.md §7): separa la hoja expandida de la
        // grilla de productos, que comparte tono de superficie. El estado lo
        // comunica `aria-expanded` del botón, no este overlay.
        <div
          className="fixed inset-0 z-10 bg-primary-950/25 lg:hidden"
          aria-hidden="true"
          data-testid="scrim-carrito"
          onClick={() => setExpandidoMobile(false)}
        />
      )}
      {/* Estilo Cálido (docs/06-ui-ux.md §4, feedback del dueño en producción):
          la hoja pasó de "tapa apoyada sobre la píldora" (calido:rounded-t-card
          + border-b-0 + bottom-(--altura-zona-inferior) directo) a CARD
          FLOTANTE completamente despegada, como en
          docs/inspiraciones/inspiracion_1.webp: esquinas redondeadas en los 4
          lados, hueco visible antes de la píldora, sombra propia.
          - Posición: calido:bottom-[calc(var(--altura-zona-inferior)+0.75rem)]
            suma un hueco fijo de 0.75rem al offset base (que ya mide hasta el
            borde SUPERIOR de la píldora en cada estilo, ver --altura-zona-inferior
            en tailwind.css) — la hoja queda flotando arriba de la píldora, no
            apoyada en ella.
          - Forma: calido:rounded-card (4 esquinas, no solo las superiores) +
            calido:border calido:border-borde SIN calido:border-b-0 (perímetro
            completo: una card despegada no tiene "abajo" apoyado en nada) +
            calido:shadow-flotante (sombra propia de card, no la sombra "hoja"
            pensada para algo pegado al viewport).
          - calido:rounded-card se aplica SIEMPRE (colapsada y expandida): al
            ser un custom variant, sus reglas se emiten DESPUÉS que las
            utilidades sin variant en el CSS compilado (misma mecánica que
            `md:`, documentada en BarraPestanas.tsx) — le gana en cascada al
            `rounded-t-card` condicional de abajo (que además comparte el
            mismo token --radio-card, así que en Cálido ambas reglas ya
            coinciden en valor para las esquinas superiores; rounded-card
            redondea además las inferiores, que rounded-t-card ni toca). Mismo
            razonamiento para calido:shadow-flotante contra shadow-hoja /
            shadow-hoja-expandida: gana siempre en Cálido, así que la card
            mantiene su sombra propia colapsada y expandida.
          - calido:inset-x-3 (sin cambios) iguala el ancho de la píldora.
          Minimalista: cero cambios (bottom-(--altura-zona-inferior),
          rounded-t-card condicional, shadow-hoja/-expandida, border-t solo). */}
      <div
        data-testid="hoja-carrito-mobil"
        className={`fixed inset-x-0 bottom-(--altura-zona-inferior) z-20 border-t border-borde bg-superficie lg:hidden calido:inset-x-3 calido:bottom-[calc(var(--altura-zona-inferior)+0.75rem)] calido:rounded-card calido:border calido:border-borde calido:shadow-flotante ${
          expandidoMobile
            ? 'rounded-t-card shadow-hoja-expandida'
            : 'shadow-hoja'
        }`}
        style={estiloArrastre}
      >
        {expandidoMobile && (
          <>
            {/* Franja de arrastre: agarre visual + padding generoso, target
                táctil ≥44px de alto (docs/06-ui-ux.md §5 y §6). Solo esta
                franja escucha pointer events — la lista de abajo conserva su
                `overflow-y-auto` sin que el drag le robe el scroll. El
                agarre es puramente decorativo (`aria-hidden`): el cierre
                accesible ya existe vía el botón de abajo y Escape. */}
            <div
              data-testid="agarre-carrito"
              aria-hidden="true"
              className="flex min-h-[44px] touch-none items-center justify-center"
              onPointerDown={alBajarPuntero}
              onPointerMove={alMoverPuntero}
              onPointerUp={soltarArrastre}
              onPointerCancel={cancelarArrastre}
            >
              <span className="h-[5px] w-10 rounded-full bg-borde" />
            </div>
            <ul className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto p-3">
              {carritoVacio ? (
                <p className="text-sm text-texto-secundario">Todavía no agregaste productos.</p>
              ) : (
                items.map((item) => <FilaItem key={item.clave} item={item} onQuitar={onQuitar} />)
              )}
            </ul>
          </>
        )}
        <div className="flex items-center gap-3 p-3">
          <button
            type="button"
            onClick={() => setExpandidoMobile((v) => !v)}
            aria-expanded={expandidoMobile}
            disabled={carritoVacio}
            className="flex min-h-[48px] flex-1 items-center gap-2 rounded-control px-2 text-left text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:text-texto-secundario"
          >
            <span aria-hidden="true">{expandidoMobile ? '▾' : '▴'}</span>
            <span>{carritoVacio ? 'Carrito vacío' : cantidad === 1 ? '1 ítem' : `${cantidad} ítems`}</span>
          </button>
          <span className="tabular-nums text-lg font-bold text-texto">{formatearMoney(total)}</span>
          <Button onClick={onCobrar} disabled={carritoVacio || procesando} className="min-h-[48px]">
            Cobrar
          </Button>
        </div>
      </div>
    </>
  );
}
