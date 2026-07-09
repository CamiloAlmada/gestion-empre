import { useEffect, useState } from 'react';
import { formatearMoney } from '@gestion/core';
import { Button } from '@gestion/ui';
import { detalleItem, totalCarrito, type ItemCarrito } from './itemsCarrito';

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
      {/* Estilo Cálido (docs/06-ui-ux.md §4, tarea TH-F): la hoja se apoya
          justo encima de la tab bar-píldora (bottom-(--altura-zona-inferior)
          ya crece solo, ver tailwind.css). Sin retoque, una hoja a todo el
          ancho (inset-x-0) con esquina recta quedaría más ancha que la
          píldora de abajo (que tiene inset-x-3 + esquinas curvas de radio
          2rem en sus extremos) — se ve como una tapa recta "flotando" sobre
          un borde que se curva hacia adentro debajo de ella. Con
          calido:inset-x-3 la hoja iguala el ancho de la píldora (el
          desajuste de curvatura que queda en los 2 extremos, ~2rem, es el
          mismo que tiene cualquier tapa recta sobre un borde redondeado, y
          es sutil comparado con el desborde de 12px por lado sin el ajuste).
          calido:rounded-t-card + border perimetral sin el lado de abajo
          (calido:border-b-0) la hacen leer como card flotante propia en vez
          de una franja pegada al viewport, consistente con el resto de
          Cálido. Ver diagrama en el reporte de la tarea. */}
      <div
        data-testid="hoja-carrito-mobil"
        className={`fixed inset-x-0 bottom-(--altura-zona-inferior) z-20 border-t border-borde bg-superficie lg:hidden calido:inset-x-3 calido:rounded-t-card calido:border calido:border-b-0 ${
          expandidoMobile
            ? 'rounded-t-card shadow-hoja-expandida'
            : 'shadow-hoja'
        }`}
      >
        {expandidoMobile && (
          <ul className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto p-3">
            {carritoVacio ? (
              <p className="text-sm text-texto-secundario">Todavía no agregaste productos.</p>
            ) : (
              items.map((item) => <FilaItem key={item.clave} item={item} onQuitar={onQuitar} />)
            )}
          </ul>
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
