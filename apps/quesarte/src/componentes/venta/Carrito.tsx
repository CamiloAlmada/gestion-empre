import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from 'react';
import { formatearMoney } from '@gestion/core';
import { Button } from '@gestion/ui';
import { detalleItem, puedeSumarUnidad, totalCarrito, type ItemCarrito } from './itemsCarrito';

/** Botón "− / +" del stepper y del "+" de `pieza_entera`: mismo target táctil
 * (44px, docs/06-ui-ux.md §5) y mismo estilo circular en toda la fila. */
const CLASE_BOTON_REDONDO =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-borde text-lg font-semibold text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-40';

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
 * Fase del arrastre que colapsa el BLOQUE completo entre el agarre y el
 * resumen (docs/06-ui-ux.md §6, "el arrastre colapsa la lista, no mueve la
 * hoja" — actualizado: el bloque colapsable incluye HOY la fila Cliente y
 * el listado de ítems, y cualquier contenido que se agregue ahí a futuro
 * entra al mismo bloque, sin topes intermedios): `siguiendo` = el dedo está
 * abajo y la altura del bloque lo sigue sin transición; `volviendo` = se
 * soltó bajo el umbral y la altura anima de vuelta a su valor original;
 * `ninguna` = reposo (el bloque no fija altura/overflow propios — se
 * dimensiona por su contenido; el `<ul>` interno conserva su
 * `max-h-[40vh]`/`overflow-y-auto` de siempre para el scroll de la lista).
 * El resumen (contador, total, Cobrar) vive DEBAJO del bloque en el DOM y
 * nunca se toca: al achicarse el bloque, el borde superior de la hoja baja
 * hacia el resumen solo, sin desplazarlo.
 */
type FaseArrastreBloque = 'ninguna' | 'siguiendo' | 'volviendo';

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
  /** Stepper `unidad_simple`: cambia en `delta` (+1/-1) las unidades del ítem `clave` (docs/06-ui-ux.md §6). */
  onCambiarUnidades: (clave: string, delta: number) => void;
  /** Tocar un ítem `fraccionado_por_pieza`/`granel` reabre su modal precargado, en modo edición. */
  onEditarAlPeso: (item: ItemCarrito) => void;
  /** "+" de un ítem `pieza_entera`: abre el selector para sumar OTRA pieza del mismo producto. */
  onAgregarOtraPieza: (item: ItemCarrito) => void;
  /** Cliente asociado a la venta en curso (docs/07-clientes-proveedores.md
   * §POS). `null` = venta anónima — el control "Cliente" muestra "+ Cliente"
   * en vez del nombre. Solo se usa `nombre`: el resto de `ClienteVenta` no le
   * importa a este componente de presentación. */
  cliente: { nombre: string } | null;
  /** Abre el selector de cliente (búsqueda + alta rápida). */
  onAbrirCliente: () => void;
  /** Quita el cliente asociado. Reversible, sin confirmación (docs/06-ui-ux.md §6). */
  onQuitarCliente: () => void;
}

/**
 * Fila "Cliente" del carrito (docs/07-clientes-proveedores.md §POS): control
 * discreto, deliberadamente AFUERA de la fila de resumen colapsada (contador,
 * total, Cobrar) — esa zona es sagrada (docs/06-ui-ux.md §6). Se repite en el
 * panel desktop (siempre visible) y en la hoja mobile expandida.
 */
function FilaCliente({
  cliente,
  onAbrirCliente,
  onQuitarCliente,
}: Pick<CarritoProps, 'cliente' | 'onAbrirCliente' | 'onQuitarCliente'>) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-elemento border border-borde bg-fondo px-3 py-1">
      {cliente === null ? (
        <button
          type="button"
          onClick={onAbrirCliente}
          className="flex min-h-11 flex-1 items-center rounded-control text-sm font-medium text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:text-primary-300"
        >
          + Cliente
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onAbrirCliente}
            className="flex min-h-11 flex-1 items-center truncate rounded-control text-left text-sm font-medium text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            Cliente: {cliente.nombre}
          </button>
          {/* Quitar cliente es reversible: nunca pide confirmación (docs/06-ui-ux.md §6). */}
          <button
            type="button"
            onClick={onQuitarCliente}
            aria-label={`Quitar cliente ${cliente.nombre}`}
            className="min-h-11 shrink-0 text-sm text-peligro underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            Quitar
          </button>
        </>
      )}
    </div>
  );
}

interface FilaItemProps {
  item: ItemCarrito;
  onQuitar: (clave: string) => void;
  onCambiarUnidades: (clave: string, delta: number) => void;
  onEditarAlPeso: (item: ItemCarrito) => void;
  onAgregarOtraPieza: (item: ItemCarrito) => void;
  /** Precalculado por `Carrito` con `puedeSumarUnidad` (necesita ver TODOS los ítems, no solo este). */
  puedeSumar: boolean;
}

function FilaItem({ item, onQuitar, onCambiarUnidades, onEditarAlPeso, onAgregarOtraPieza, puedeSumar }: FilaItemProps) {
  const nombre = item.producto.nombre;
  const modo = item.producto.modoStock;
  const editableAlPeso = modo === 'fraccionado_por_pieza' || modo === 'granel';

  return (
    <li className="flex items-start justify-between gap-2 rounded-elemento border border-borde bg-superficie p-3">
      {editableAlPeso ? (
        // Ítems al peso: tocar la fila reabre su modal precargado, en modo
        // edición (docs/06-ui-ux.md §6). "Quitar" queda AFUERA de este botón
        // (no puede haber un <button> interactivo anidado dentro de otro).
        <button
          type="button"
          onClick={() => onEditarAlPeso(item)}
          aria-label={`Editar ${nombre}, ${detalleItem(item)}`}
          className="flex flex-1 flex-col items-start rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
        >
          <span className="font-medium text-texto">{nombre}</span>
          <span className="text-sm text-texto-secundario">{detalleItem(item)}</span>
        </button>
      ) : (
        <div className="flex flex-col">
          <span className="font-medium text-texto">{nombre}</span>
          <span className="text-sm text-texto-secundario">{detalleItem(item)}</span>
        </div>
      )}

      <div className="flex flex-col items-end gap-1">
        <span className="tabular-nums font-semibold text-texto">{formatearMoney(item.subtotalCents)}</span>

        {modo === 'unidad_simple' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCambiarUnidades(item.clave, -1)}
              aria-label={`Quitar una unidad de ${nombre}`}
              className={CLASE_BOTON_REDONDO}
            >
              −
            </button>
            <span aria-live="polite" className="min-w-[2ch] text-center tabular-nums font-medium text-texto">
              {item.unidades ?? 0}
            </span>
            <button
              type="button"
              onClick={() => onCambiarUnidades(item.clave, 1)}
              disabled={!puedeSumar}
              aria-label={`Agregar una unidad de ${nombre}`}
              className={CLASE_BOTON_REDONDO}
            >
              +
            </button>
          </div>
        )}

        {modo === 'pieza_entera' && (
          <button
            type="button"
            onClick={() => onAgregarOtraPieza(item)}
            aria-label={`Agregar otra pieza de ${nombre}`}
            className={CLASE_BOTON_REDONDO}
          >
            +
          </button>
        )}

        {/* Quitar del carrito es reversible: nunca pide confirmación (docs/06-ui-ux.md §6). */}
        <button
          type="button"
          onClick={() => onQuitar(item.clave)}
          aria-label={`Quitar ${nombre} del carrito`}
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
export function Carrito({
  items,
  onQuitar,
  onCobrar,
  procesando,
  onCambiarUnidades,
  onEditarAlPeso,
  onAgregarOtraPieza,
  cliente,
  onAbrirCliente,
  onQuitarCliente,
}: CarritoProps) {
  const [expandidoMobile, setExpandidoMobile] = useState(false);
  // Desplazamiento vertical (px, siempre ≥0) que sigue al dedo mientras se
  // arrastra el agarre hacia abajo; se traduce en cuánto se achica la altura
  // del BLOQUE colapsable (fila Cliente + listado, ver
  // `estiloBloqueColapsable`), no en un `transform` de la hoja.
  const [arrastreY, setArrastreY] = useState(0);
  const [faseArrastreBloque, setFaseArrastreBloque] = useState<FaseArrastreBloque>('ninguna');
  const inicioArrastreRef = useRef<number | null>(null);
  // Altura real del bloque colapsable (fila Cliente + `<ul>` de ítems) al
  // iniciar el arrastre (medida con `getBoundingClientRect`, no un valor
  // fijo): el contenido varía con la cantidad de ítems y con si hay cliente
  // asociado o no. En jsdom (tests) el layout no existe y
  // `getBoundingClientRect().height` da 0 — no rompe nada, la lógica de
  // umbral/cierre no depende de esta medida (usa `evento.clientY` directo).
  const bloqueColapsableRef = useRef<HTMLDivElement | null>(null);
  const alturaBloqueInicialRef = useRef(0);
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
  // expandida (docs/06-ui-ux.md §6): colapsa la altura del BLOQUE completo
  // (fila Cliente + listado de ítems), no mueve la hoja. Pointer Events
  // cubre touch y mouse con una sola API; `setPointerCapture` asegura que
  // move/up sigan llegando acá aunque el dedo salga de la franja. jsdom
  // (tests) no implementa `setPointerCapture`, de ahí el chequeo de tipo
  // antes de llamarlo.
  function alBajarPuntero(evento: ReactPointerEvent<HTMLDivElement>) {
    inicioArrastreRef.current = evento.clientY;
    alturaBloqueInicialRef.current = bloqueColapsableRef.current?.getBoundingClientRect().height ?? 0;
    setFaseArrastreBloque('siguiendo');
    if (typeof evento.currentTarget.setPointerCapture === 'function') {
      evento.currentTarget.setPointerCapture(evento.pointerId);
    }
  }

  function alMoverPuntero(evento: ReactPointerEvent<HTMLDivElement>) {
    if (inicioArrastreRef.current === null) return;
    // Arrastres hacia arriba se ignoran (clamp a 0): el bloque no se
    // "estira" más allá de su altura de reposo.
    const delta = Math.max(0, evento.clientY - inicioArrastreRef.current);
    // prefers-reduced-motion: nunca se actualiza `arrastreY`, así que el
    // bloque no sigue visualmente al dedo (sin animación de seguimiento). El
    // cierre por umbral igual funciona porque `soltarArrastre` recalcula el
    // delta directo del evento, no de este estado.
    if (!prefiereMovimientoReducido()) {
      setArrastreY(delta);
    }
  }

  function soltarArrastre(evento: ReactPointerEvent<HTMLDivElement>) {
    if (inicioArrastreRef.current === null) return;
    const delta = Math.max(0, evento.clientY - inicioArrastreRef.current);
    inicioArrastreRef.current = null;
    // Capturado ANTES de resetear `arrastreY`: dice si hubo encogimiento
    // visual real que revertir (ver el `else` de abajo).
    const huboEncogimientoVisual = arrastreY > 0;
    setArrastreY(0);
    if (delta > UMBRAL_CIERRE_ARRASTRE_PX) {
      // Se cierra la hoja entera: el bloque se desmonta con ella, no hace
      // falta animarlo de vuelta.
      setExpandidoMobile(false);
      setFaseArrastreBloque('ninguna');
    } else if (huboEncogimientoVisual) {
      // Bajo el umbral, con encogimiento visual real que revertir: el
      // bloque vuelve a su altura con transición corta (docs/06-ui-ux.md
      // §6). El estilo inline recién se limpia cuando esa transición
      // termina, ver `alTerminarTransicionBloque`.
      setFaseArrastreBloque('volviendo');
    } else {
      // `arrastreY === 0` sin haber cerrado: no hay nada que animar de
      // vuelta, así que se salta directo a `ninguna` en vez de `volviendo`.
      // Esto NO es un caso degenerado: lo produce (a) un tap seco en el
      // agarre — pointerdown+pointerup sin mover el dedo, gesto normal de
      // quien espera que la barrita solo haga toggle — y (b) un arrastre
      // hacia ARRIBA, que `alMoverPuntero` clampea a 0. En ambos casos
      // `height` no cambia de valor, por lo que el navegador NUNCA dispara
      // `transitionend` sobre ese estilo — si entrara a `volviendo` acá, el
      // estilo inline (con `overflow: hidden`) quedaría pegado para
      // siempre: el bloque perdería el scroll de su `<ul>` interno y
      // quedaría clavado en la altura medida al iniciar el arrastre ante
      // futuros cambios de contenido, hasta el próximo drag real. En
      // reduced-motion también cae siempre acá (`arrastreY` nunca se
      // actualiza), consistente con "sin estilo inline en el bloque".
      setFaseArrastreBloque('ninguna');
    }
  }

  function cancelarArrastre() {
    inicioArrastreRef.current = null;
    // Mismo criterio que en `soltarArrastre`: sin encogimiento visual real
    // que revertir, no hay nada que animar de vuelta.
    const huboEncogimientoVisual = arrastreY > 0;
    setArrastreY(0);
    setFaseArrastreBloque(huboEncogimientoVisual ? 'volviendo' : 'ninguna');
  }

  // Limpia el estilo inline de altura al terminar la transición de "vuelta"
  // para que el bloque vuelva a dimensionarse por su contenido (rige de
  // nuevo el `max-h-[40vh]` + `overflow-y-auto` del `<ul>` interno para su
  // propio scroll, docs/06-ui-ux.md §6) — así responde a cambios
  // posteriores de contenido (agregar/quitar ítems, asociar/quitar cliente)
  // en vez de quedar clavado en la altura medida al iniciar el arrastre.
  // Doble filtro porque `onTransitionEnd` burbujea: `propertyName` (solo
  // nos importa la transición de `height`) y `target === currentTarget`
  // (que la transición sea del propio bloque, no de un descendiente — hoy
  // no hay ninguno con transición, pero evita que el día de mañana uno
  // limpie la fase a mitad de gesto).
  function alTerminarTransicionBloque(evento: ReactTransitionEvent<HTMLDivElement>) {
    if (evento.target !== evento.currentTarget) return;
    if (evento.propertyName !== 'height') return;
    setFaseArrastreBloque('ninguna');
  }

  // Misma `FilaItem` para el panel desktop y la hoja mobile (docs/06-ui-ux.md
  // §6): se arma una vez para no repetir el cálculo de `puedeSumar` en los
  // dos `.map`. `puedeSumarUnidad` necesita ver TODOS los ítems (puede haber
  // más de un ítem del mismo producto `unidad_simple`), por eso vive acá y no
  // dentro de `FilaItem`.
  function renderFila(item: ItemCarrito) {
    return (
      <FilaItem
        key={item.clave}
        item={item}
        onQuitar={onQuitar}
        onCambiarUnidades={onCambiarUnidades}
        onEditarAlPeso={onEditarAlPeso}
        onAgregarOtraPieza={onAgregarOtraPieza}
        puedeSumar={item.producto.modoStock === 'unidad_simple' && puedeSumarUnidad(items, item.clave)}
      />
    );
  }

  // Estilo inline del BLOQUE colapsable de la hoja mobile (fila Cliente +
  // `<ul>` de ítems, docs/06-ui-ux.md §6, "el arrastre colapsa la lista, no
  // mueve la hoja" — actualizado: todo lo que va entre el agarre y el
  // resumen entra al mismo bloque, sin topes intermedios). La hoja en sí
  // NUNCA recibe transform: el resumen (contador, total, Cobrar) queda
  // quieto porque solo se achica la altura del bloque que tiene arriba, no
  // porque se lo fije con ningún estilo propio.
  // - `siguiendo`: sigue al dedo 1:1, sin transición, recortando con
  //   `overflow: hidden` para que no aparezca scrollbar durante el gesto.
  // - `volviendo`: soltado bajo el umbral, anima de vuelta a la altura
  //   medida al empezar, con transición corta. `overflow: hidden` se
  //   mantiene también acá (no solo "mientras se arrastra") para que el
  //   contenido no muestre un scrollbar fantasma mientras la altura todavía
  //   está animando de vuelta — no está en la letra de la spec pero se
  //   desprende de su intención ("recortarse limpio").
  // - `ninguna`: sin estilo inline — el bloque se dimensiona por su
  //   contenido (fila Cliente + `<ul>`); el `<ul>` interno conserva su
  //   propio `max-h-[40vh]`/`overflow-y-auto` de reposo para su scroll.
  // Gate por `prefiereMovimientoReducido()`: bajo esa preferencia no hay
  // NINGÚN estilo inline (ni durante el arrastre ni al volver) — el cierre
  // por umbral sigue funcionando porque no depende de este estilo.
  const estiloBloqueColapsable: CSSProperties | undefined = prefiereMovimientoReducido()
    ? undefined
    : faseArrastreBloque === 'siguiendo'
      ? { height: `${Math.max(0, alturaBloqueInicialRef.current - arrastreY)}px`, overflow: 'hidden', transition: 'none' }
      : faseArrastreBloque === 'volviendo'
        ? { height: `${alturaBloqueInicialRef.current}px`, overflow: 'hidden', transition: 'height 180ms ease-out' }
        : undefined;

  return (
    <>
      {/* Ancho: panel lateral siempre visible. */}
      <aside className="hidden lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-6rem)] lg:flex-col lg:gap-3 lg:rounded-card lg:border lg:border-borde lg:bg-superficie lg:p-4">
        <h2 className="text-base font-semibold text-texto">Carrito</h2>
        <FilaCliente cliente={cliente} onAbrirCliente={onAbrirCliente} onQuitarCliente={onQuitarCliente} />
        {carritoVacio ? (
          <p className="text-sm text-texto-secundario">Todavía no agregaste productos.</p>
        ) : (
          <ul className="flex flex-col gap-2 overflow-y-auto">{items.map(renderFila)}</ul>
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
      >
        {expandidoMobile && (
          <>
            {/* Franja de arrastre: agarre visual + padding generoso, target
                táctil ≥44px de alto (docs/06-ui-ux.md §5 y §6). Solo esta
                franja escucha pointer events. El arrastre NO mueve esta
                hoja ni ningún contenedor propio: achica la altura del
                BLOQUE de abajo (`estiloBloqueColapsable`, fila Cliente +
                lista de ítems juntas, sin tope intermedio), así el resumen
                (contador, total, Cobrar) queda quieto sin necesidad de
                fijarlo aparte. El agarre es puramente decorativo
                (`aria-hidden`): el cierre accesible ya existe vía el botón
                de abajo y Escape. */}
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
            {/* Bloque colapsable único (docs/06-ui-ux.md §6): agrupa TODO lo
                que va entre el agarre y el resumen (hoy fila Cliente +
                listado; lo que se agregue a futuro entra acá) para que el
                arrastre lo achique de punta a punta, sin quedar "topado"
                por contenido que quedó afuera. En reposo no tiene
                altura/overflow propios (se dimensiona por su contenido); el
                `<ul>` interno conserva su `max-h-[40vh]`/`overflow-y-auto`
                para el scroll de la lista. */}
            <div
              ref={bloqueColapsableRef}
              data-testid="bloque-colapsable-carrito"
              onTransitionEnd={alTerminarTransicionBloque}
              style={estiloBloqueColapsable}
            >
              <div className="px-3 pb-2">
                <FilaCliente cliente={cliente} onAbrirCliente={onAbrirCliente} onQuitarCliente={onQuitarCliente} />
              </div>
              <ul className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto p-3">
                {carritoVacio ? (
                  <p className="text-sm text-texto-secundario">Todavía no agregaste productos.</p>
                ) : (
                  items.map(renderFila)
                )}
              </ul>
            </div>
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
