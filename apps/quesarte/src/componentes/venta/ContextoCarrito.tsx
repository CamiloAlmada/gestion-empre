import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ClienteVenta } from '@gestion/firebase-kit';
import {
  esCarritoPersistidoValido,
  serializarCarrito,
  type CarritoPersistido,
} from './carritoPersistido';
import type { ItemCarrito } from './itemsCarrito';

/** Estado con el que `hidratar` reemplaza el carrito tras reconciliar el
 * payload persistido contra las colecciones vivas (ver `rehidratarCarrito`). */
export interface CarritoHidratado {
  items: ItemCarrito[];
  cliente: ClienteVenta | null;
  proximaClave: number;
}

interface EstadoCarritoContexto {
  items: ItemCarrito[];
  agregar: (item: ItemCarrito) => void;
  quitar: (clave: string) => void;
  /** Vacía los ítems Y el cliente asociado (docs/07 §POS: el cliente se limpia
   * junto con el carrito, tanto al cobrar con éxito como al vaciar a mano). */
  vaciar: () => void;
  /**
   * Reemplaza la lista completa de ítems (docs/06-ui-ux.md §6, "el carrito es
   * editable en el lugar"). A propósito NO sabe nada de cambiar unidades ni
   * de reemplazar un ítem puntual — quien llama ya trae la función pura de
   * `itemsCarrito.ts` (`cambiarUnidades`, `reemplazarItem`) aplicada con
   * *currying* sobre sus argumentos (clave, delta/ítem nuevo); el contexto
   * solo la ejecuta contra el `items` VIGENTE. Recibe un actualizador
   * funcional — igual que `agregar`/`quitar`, que hacen
   * `setItems((actual) => …)` en vez de capturar `items` del render — y no
   * una lista ya calculada: capturar `items` en el render y calcular la
   * lista nueva ANTES de llamar a `actualizar` dejaría una lost-update
   * latente si dos actualizaciones llegan a batchearse (p. ej. dos toques
   * rápidos del stepper), porque la segunda pisaría a la primera con una
   * lista calculada sobre el mismo `items` viejo. Mantenerlo así de tonto
   * (solo ejecuta, no decide QUÉ cambiar) evita que la lógica de edición se
   * filtre acá.
   */
  actualizar: (actualizador: (items: ItemCarrito[]) => ItemCarrito[]) => void;
  /** Próxima clave estable de lista (React) para un ítem nuevo. Vive acá y no
   * en `Venta.tsx` por la misma razón que el resto del estado: si el
   * contador reviviera en cada montaje de `Venta`, un ítem agregado antes de
   * navegar y uno agregado después de volver podrían terminar con la MISMA
   * clave (`item-0`), rompiendo tanto la identidad de lista de React como
   * `quitar` (que filtra por clave). Por eso también se persiste y se
   * restaura: si el contador arrancara de cero tras una recarga, las claves
   * nuevas chocarían con las de los ítems rehidratados. */
  proximaClave: () => string;
  /** Cliente asociado a la venta en curso (docs/07-clientes-proveedores.md
   * §POS). `null` = venta anónima, el caso por defecto. Vive acá por la MISMA
   * razón que `items`: sobrevive a la navegación entre pestañas. */
  cliente: ClienteVenta | null;
  /** Asocia (o reemplaza) el cliente de la venta en curso. La UI ya resolvió
   * `esPrimeraCompra` contra el `Cliente` que tiene en pantalla (existente
   * elegido o recién dado de alta): este contexto no lee Firestore, solo
   * custodia lo que le pasan. */
  seleccionarCliente: (cliente: ClienteVenta) => void;
  /** Quita el cliente asociado (acción reversible, sin confirmación —
   * docs/06-ui-ux.md §6). La venta vuelve a ser anónima. */
  quitarCliente: () => void;
  /**
   * Carrito leído de `localStorage` al montar y TODAVÍA NO reconciliado, o
   * `null` si no había nada guardado (o ya se reconcilió). Es el disparador
   * de la rehidratación: mientras sea distinto de `null` este proveedor NO
   * escribe nada (ver `ProveedorCarrito`), y quien lo consuma —hoy solo
   * `Venta.tsx`, la única pantalla con las colecciones vivas a mano— debe
   * pasarlo por `rehidratarCarrito` y devolver el resultado con `hidratar`.
   */
  pendiente: CarritoPersistido | null;
  /** Instala el carrito ya reconciliado y libera la escritura (limpia
   * `pendiente`). Idempotente desde el punto de vista del storage: quien
   * llama garantiza hacerlo una sola vez por payload. `proximaClave` se
   * aplica como MÁXIMO contra el contador vigente, nunca en crudo: el
   * contador no puede retroceder (ver la implementación). */
  hidratar: (hidratado: CarritoHidratado) => void;
}

const ContextoCarrito = createContext<EstadoCarritoContexto | null>(null);

export interface ProveedorCarritoProps {
  children: ReactNode;
  /**
   * Uid del vendedor logueado (`perfil.uid`, ver `Shell.tsx`). Aísla el
   * carrito por usuario: dos personas que comparten el dispositivo no se
   * pisan la venta. String vacío ⇒ no se persiste nada (defensivo: `Shell`
   * vive dentro de `RutaProtegida`, que garantiza perfil activo, así que en
   * la app real nunca llega vacío).
   */
  usuarioId: string;
}

function claveStorage(usuarioId: string): string {
  return `carrito:${usuarioId}`;
}

/**
 * Lee y valida el carrito guardado. Devuelve `null` ante cualquier dato
 * ausente, JSON roto, versión desconocida o shape inválido — nunca lanza,
 * nunca adivina (mismo criterio que `leerCacheTemaNegocio` en
 * `packages/ui/src/temaNegocio.ts`).
 */
function leerCarritoPersistido(usuarioId: string): CarritoPersistido | null {
  if (usuarioId === '') return null;
  try {
    const crudo = window.localStorage.getItem(claveStorage(usuarioId));
    if (crudo === null) return null;
    const datos: unknown = JSON.parse(crudo);
    return esCarritoPersistidoValido(datos) ? datos : null;
  } catch {
    return null;
  }
}

/** Escribe el carrito. `localStorage` que lanza (modo privado, cuota llena)
 * NO puede romper una venta: se traga el error y el carrito sigue vivo en
 * memoria, que es como funcionaba antes de esta tanda. */
function escribirCarritoPersistido(usuarioId: string, payload: CarritoPersistido): void {
  if (usuarioId === '') return;
  try {
    window.localStorage.setItem(claveStorage(usuarioId), JSON.stringify(payload));
  } catch {
    // Sin persistencia, el carrito solo pierde la protección contra recargas.
  }
}

/**
 * Custodia el estado de la venta en curso — el carrito — para que sobreviva a
 * la navegación entre pestañas (docs/06-ui-ux.md §6, 2026-07-09) y, desde el
 * 2026-09-01, TAMBIÉN a las recargas de página y al cierre de la app.
 *
 * Vive montado en `Shell.tsx` POR ENCIMA del `Outlet` (mismo criterio que
 * `ProveedorHeader`), fuera del ciclo de vida de cualquier pantalla ruteada.
 * Solo custodia estado y delega en las funciones puras de `itemsCarrito.ts` y
 * `carritoPersistido.ts`: cero lógica de dominio acá, como exige `CLAUDE.md`.
 *
 * ## Persistencia (2026-09-01, pedido del dueño)
 *
 * Hasta esta fecha el carrito a propósito NO se persistía: entre recargas las
 * piezas elegidas por FIFO podían haber cambiado de estado, y reofrecer un
 * carrito viejo con datos vencidos se consideró más peligroso que perderlo.
 * Un tester externo perdió su pedido varias veces por un pull-to-refresh
 * accidental y el dueño pidió lo contrario.
 *
 * La protección de fondo se conserva, movida de lugar: se persisten **ids y
 * magnitudes, nunca snapshots** de `Producto`/`Pieza`/`Cliente` (ver
 * `carritoPersistido.ts`), y al volver se RECONSTRUYE contra las colecciones
 * vivas. Lo que ya no existe o no alcanza se descarta y se avisa; el precio,
 * el costo y el peso de una pieza entera salen siempre del dato de hoy. Un
 * carrito viejo nunca vuelve tal cual: vuelve reconciliado o no vuelve.
 *
 * Detalles que importan:
 * - **Clave por usuario** (`carrito:{uid}`). NO se limpia al desloguear
 *   (pedido literal del dueño): otro vendedor en el mismo dispositivo abre su
 *   propio carrito, y el primero recupera el suyo al volver.
 * - **Solo se escribe DESPUÉS de hidratar** (o si no había nada guardado). El
 *   estado arranca vacío, así que escribir antes de reconciliar pisaría el
 *   carrito guardado con `[]` — justo el bug que esta tanda evita. Mientras
 *   `pendiente !== null` este proveedor es de solo lectura.
 * - **Write-through en cada cambio, sin debounce.** Los cambios van a ritmo
 *   humano (un toque = un ítem); un debounce solo abriría la ventana de
 *   pérdida que venimos a cerrar.
 * - **Sin TTL** (decisión del dueño): el carrito dura hasta que se cobre o se
 *   vacíe a mano.
 * - **Limitación conocida — dos pestañas.** Dos pestañas del POS del mismo
 *   usuario escriben la misma clave y gana la última (last-write-wins), sin
 *   `storage` listener que las sincronice. Aceptable: el mostrador es uno y
 *   trabaja con una sola pestaña; no vale la pena el mecanismo de
 *   coordinación para un caso que en el uso real no ocurre.
 */
export function ProveedorCarrito({ children, usuarioId }: ProveedorCarritoProps) {
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [cliente, setCliente] = useState<ClienteVenta | null>(null);
  const proximaClaveRef = useRef(0);
  // Lectura ÚNICA al montar (initializer perezoso: no se repite en cada
  // render). `usuarioId` es estable mientras el proveedor vive — `Shell` está
  // dentro de `RutaProtegida`, que desmonta todo el árbol cuando cambia la
  // sesión — así que no hace falta reaccionar a que cambie.
  const [pendiente, setPendiente] = useState<CarritoPersistido | null>(() =>
    leerCarritoPersistido(usuarioId),
  );

  const agregar = useCallback((item: ItemCarrito) => {
    setItems((actual) => [...actual, item]);
  }, []);

  const quitar = useCallback((clave: string) => {
    setItems((actual) => actual.filter((item) => item.clave !== clave));
  }, []);

  const vaciar = useCallback(() => {
    setItems([]);
    setCliente(null);
  }, []);

  const actualizar = useCallback((actualizador: (items: ItemCarrito[]) => ItemCarrito[]) => {
    setItems(actualizador);
  }, []);

  const proximaClave = useCallback(() => {
    const clave = `item-${proximaClaveRef.current}`;
    proximaClaveRef.current += 1;
    return clave;
  }, []);

  const seleccionarCliente = useCallback((clienteNuevo: ClienteVenta) => {
    setCliente(clienteNuevo);
  }, []);

  const quitarCliente = useCallback(() => {
    setCliente(null);
  }, []);

  const hidratar = useCallback((hidratado: CarritoHidratado) => {
    // El contador NUNCA retrocede: se toma el máximo entre el del payload y el
    // que ya avanzó en memoria. Sin ese clamp, hidratar después de que el
    // vendedor agregó ítems (caso "en memoria gana", ver `Venta.tsx`) haría
    // que la próxima clave repita una en uso, rompiendo la identidad de lista
    // de React y `quitar`, que filtra por clave. Vive acá y no en quien llama
    // para que el invariante no dependa de que cada caller se acuerde.
    proximaClaveRef.current = Math.max(hidratado.proximaClave, proximaClaveRef.current);
    setItems(hidratado.items);
    setCliente(hidratado.cliente);
    setPendiente(null);
  }, []);

  // Write-through. `pendiente === null` es la compuerta: o no había nada
  // guardado (se puede escribir desde el vamos) o ya se reconcilió. El
  // contador de claves se lee del ref y no de un estado porque siempre
  // avanza JUNTO con un `agregar`, que sí dispara este efecto.
  const listoParaEscribir = pendiente === null;
  useEffect(() => {
    if (!listoParaEscribir) return;
    escribirCarritoPersistido(usuarioId, serializarCarrito(items, cliente, proximaClaveRef.current));
  }, [listoParaEscribir, items, cliente, usuarioId]);

  const valor = useMemo<EstadoCarritoContexto>(
    () => ({
      items,
      agregar,
      quitar,
      vaciar,
      actualizar,
      proximaClave,
      cliente,
      seleccionarCliente,
      quitarCliente,
      pendiente,
      hidratar,
    }),
    [
      items,
      agregar,
      quitar,
      vaciar,
      actualizar,
      proximaClave,
      cliente,
      seleccionarCliente,
      quitarCliente,
      pendiente,
      hidratar,
    ],
  );

  return <ContextoCarrito.Provider value={valor}>{children}</ContextoCarrito.Provider>;
}

/** Acceso al carrito de la venta en curso. Debe usarse dentro de un
 * `<ProveedorCarrito>` (montado en `Shell.tsx`); hoy solo lo consume
 * `pantallas/Venta.tsx`. */
export function useCarrito(): EstadoCarritoContexto {
  const contexto = useContext(ContextoCarrito);
  if (contexto === null) {
    throw new Error('useCarrito debe usarse dentro de un <ProveedorCarrito> (ver Shell.tsx).');
  }
  return contexto;
}
