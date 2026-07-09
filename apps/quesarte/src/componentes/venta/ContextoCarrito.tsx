import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ItemCarrito } from './itemsCarrito';

interface EstadoCarritoContexto {
  items: ItemCarrito[];
  agregar: (item: ItemCarrito) => void;
  quitar: (clave: string) => void;
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
   * `quitar` (que filtra por clave). */
  proximaClave: () => string;
}

const ContextoCarrito = createContext<EstadoCarritoContexto | null>(null);

export interface ProveedorCarritoProps {
  children: ReactNode;
}

/**
 * Custodia el estado de la venta en curso — el carrito — para que sobreviva a
 * la navegación entre pestañas (docs/06-ui-ux.md §6, 2026-07-09): antes vivía
 * en `useState` local de `pantallas/Venta.tsx`, así que un toque accidental
 * en la tab bar desmontaba la pantalla y perdía todo lo cargado. Ahora vive
 * en este contexto, montado en `Shell.tsx` POR ENCIMA del `Outlet` (mismo
 * criterio que `ProveedorHeader`) — dentro de la sesión (se pierde al
 * desloguear, correcto) pero fuera del ciclo de vida de cualquier pantalla
 * ruteada.
 *
 * Solo custodia estado y delega en las funciones puras de `itemsCarrito.ts`
 * (`crearItem*`, `totalCarrito`, etc., llamadas por quien consume este
 * contexto) para construir y calcular ítems: cero lógica de dominio acá,
 * como exige `CLAUDE.md`.
 *
 * Deliberadamente NO persiste en `localStorage`/`sessionStorage` (decisión
 * del tech lead, docs/06 §6): el caso real a cubrir es el toque accidental de
 * tab en plena venta, no sobrevivir a un refresh de página — entre recargas
 * las piezas elegidas por FIFO podrían haber cambiado de estado (vendidas,
 * de baja) en Firestore, y reofrecer un carrito viejo con datos vencidos es
 * más peligroso que perderlo. El estado en memoria alcanza para el caso que
 * importa.
 */
export function ProveedorCarrito({ children }: ProveedorCarritoProps) {
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const proximaClaveRef = useRef(0);

  const agregar = useCallback((item: ItemCarrito) => {
    setItems((actual) => [...actual, item]);
  }, []);

  const quitar = useCallback((clave: string) => {
    setItems((actual) => actual.filter((item) => item.clave !== clave));
  }, []);

  const vaciar = useCallback(() => {
    setItems([]);
  }, []);

  const actualizar = useCallback((actualizador: (items: ItemCarrito[]) => ItemCarrito[]) => {
    setItems(actualizador);
  }, []);

  const proximaClave = useCallback(() => {
    const clave = `item-${proximaClaveRef.current}`;
    proximaClaveRef.current += 1;
    return clave;
  }, []);

  const valor = useMemo<EstadoCarritoContexto>(
    () => ({ items, agregar, quitar, vaciar, actualizar, proximaClave }),
    [items, agregar, quitar, vaciar, actualizar, proximaClave],
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
