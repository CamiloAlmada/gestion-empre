import {
  peso,
  pesoNoNegativo,
  restarPeso,
  sumarPeso,
  type Cliente,
  type Peso,
  type Pieza,
  type Producto,
} from '@gestion/core';
import type { ClienteVenta } from '@gestion/firebase-kit';
import {
  crearItemFraccionado,
  crearItemGranel,
  crearItemPiezaEntera,
  crearItemUnidad,
  type ItemCarrito,
} from './itemsCarrito';

/**
 * Serialización y REHIDRATACIÓN RECONCILIADA del carrito del POS
 * (docs/06-ui-ux.md §6, 2026-09-01). Sin React, sin Firebase, sin
 * `localStorage`: funciones puras, mismo criterio que `itemsCarrito.ts`.
 *
 * El invariante de esta tanda: **se persisten ids y magnitudes, NUNCA
 * snapshots de entidades**. Un `ItemCarrito` lleva embebidos el `Producto` y
 * la `Pieza` completos, y esos objetos deciden precio, costo congelado y
 * validación de stock en `registrarVenta` — guardarlos y devolverlos tal cual
 * después de una recarga sería exactamente el peligro que la decisión
 * anterior (no persistir nada) buscaba evitar. Acá se guarda lo mínimo para
 * volver a PEDIR el ítem, y `rehidratarCarrito` lo reconstruye contra las
 * colecciones VIVAS: lo que ya no existe o no alcanza se descarta, y quien
 * llama avisa.
 *
 * Regla de calibración de los descartes: **rehidratar no es más estricto que
 * agregar**. Cada modo se valida con el MISMO criterio que usa la pantalla al
 * agregar el ítem (ver `piezasAjustadasPorCarrito` y `puedeSumarUnidad` en
 * `itemsCarrito.ts`), ni más ni menos. Si fuera más estricto, un carrito que
 * nadie tocó y contra un mundo que no cambió perdería ítems al recargar: una
 * falsa alarma. Todo lo que esta función descarta es un cambio REAL del
 * mundo entre que se guardó y que se volvió.
 */

/**
 * Un ítem del carrito reducido a lo que sobrevive a una recarga: referencias
 * (`productoId`, `piezaId`), magnitudes pedidas (`gramos`/`unidades`) y el
 * precio VIGENTE AL AGREGARLO — este último no se usa para reconstruir nada
 * (el precio sale siempre del producto vivo), solo para detectar que cambió y
 * avisarlo.
 */
export interface ItemPersistido {
  /** Clave de lista de React del ítem original: se conserva para que las
   * claves no se repitan al seguir agregando (ver `proximaClave`). */
  clave: string;
  productoId: string;
  /** Solo en los modos por pieza (`fraccionado_por_pieza`, `pieza_entera`). */
  piezaId?: string;
  /** Gramos pedidos (entero > 0). Solo en los modos al peso. */
  gramos?: number;
  /** Unidades pedidas (entero > 0). Solo en `unidad_simple`. */
  unidades?: number;
  /** Precio unitario vigente cuando se agregó (para detectar cambios). */
  precioUnitCents: number;
}

/** Payload completo de `localStorage['carrito:{uid}']`. `v` habilita
 * migraciones: un `v` desconocido se ignora entero (no se adivina). */
export interface CarritoPersistido {
  v: 1;
  items: ItemPersistido[];
  cliente: ClienteVenta | null;
  /** Contador de claves de lista, para que al rehidratar los ítems nuevos no
   * colisionen con las claves restauradas. */
  proximaClave: number;
}

/** Resultado de reconciliar un payload contra las colecciones vivas. */
export interface ResultadoRehidratacion {
  items: ItemCarrito[];
  cliente: ClienteVenta | null;
  /** Nombres VIVOS (deduplicados, en orden) de los productos cuyos ítems se
   * descartaron por stock insuficiente o por datos incompatibles con el
   * `modoStock` actual. */
  descartados: string[];
  /**
   * Cuántos ítems se descartaron SIN poder nombrarlos: su producto ya no está
   * en el catálogo activo, y como a propósito no se persiste el nombre (sería
   * un snapshot), no hay de dónde sacarlo. Se cuenta aparte de `descartados`
   * porque además el motivo es otro — "el producto ya no está" no es "falta
   * stock", y prometerle al vendedor lo segundo sería mentirle.
   */
  descartadosSinNombre: number;
  /** Nombres de los productos cuyo precio cambió desde que se agregaron. El
   * ítem NO se descarta: se reconstruye con el precio vivo. */
  preciosCambiados: string[];
  /** El cliente asociado ya no está entre los clientes activos: la venta
   * vuelve a ser anónima. */
  clienteDescartado: boolean;
}

// ── Type guard ──────────────────────────────────────────────────────────────

const CLAVES_CARRITO: readonly string[] = ['v', 'items', 'cliente', 'proximaClave'];
const CLAVES_ITEM_REQUERIDAS: readonly string[] = ['clave', 'productoId', 'precioUnitCents'];
const CLAVES_ITEM: readonly string[] = [...CLAVES_ITEM_REQUERIDAS, 'piezaId', 'gramos', 'unidades'];
const CLAVES_CLIENTE: readonly string[] = ['id', 'nombre', 'esPrimeraCompra'];

function esObjetoPlano(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function tieneExactamente(o: Record<string, unknown>, claves: readonly string[]): boolean {
  const propias = Object.keys(o);
  return propias.length === claves.length && propias.every((k) => claves.includes(k));
}

function esEnteroNoNegativo(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0;
}

/**
 * Magnitudes PEDIDAS (`gramos`, `unidades`): estrictamente positivas. Un cero
 * no es un ítem, es un ítem roto — y sale caro: `registrarVenta` lo rechaza
 * con `ItemInvalidoError`, que hace fallar la venta ENTERA, no solo esa
 * línea. Los modales del POS ya exigen `> 0` (`ModalAgregarGranel.tsx`,
 * `ModalAgregarFraccionado.tsx`), así que un cero solo puede llegar de un
 * `localStorage` editado a mano; descartar ese payload cuesta un carrito y
 * evita un cobro que no puede prosperar.
 *
 * No aplica a `precioUnitCents` (un precio 0 es un dato legítimo del catálogo)
 * ni a `proximaClave` (arranca en 0).
 */
function esEnteroPositivo(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x > 0;
}

function esTextoNoVacio(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function esClienteVentaValido(x: unknown): x is ClienteVenta {
  if (!esObjetoPlano(x)) return false;
  if (!tieneExactamente(x, CLAVES_CLIENTE)) return false;
  return (
    esTextoNoVacio(x['id']) &&
    typeof x['nombre'] === 'string' &&
    typeof x['esPrimeraCompra'] === 'boolean'
  );
}

function esItemPersistidoValido(x: unknown): x is ItemPersistido {
  if (!esObjetoPlano(x)) return false;
  const claves = Object.keys(x);
  // Claves opcionales: se admite cualquier subconjunto de `CLAVES_ITEM`
  // mientras estén todas las requeridas y ninguna ajena.
  if (!claves.every((k) => CLAVES_ITEM.includes(k))) return false;
  if (!CLAVES_ITEM_REQUERIDAS.every((k) => claves.includes(k))) return false;
  if (!esTextoNoVacio(x['clave'])) return false;
  if (!esTextoNoVacio(x['productoId'])) return false;
  if (!esEnteroNoNegativo(x['precioUnitCents'])) return false;
  if ('piezaId' in x && !esTextoNoVacio(x['piezaId'])) return false;
  if ('gramos' in x && !esEnteroPositivo(x['gramos'])) return false;
  if ('unidades' in x && !esEnteroPositivo(x['unidades'])) return false;
  return true;
}

/**
 * Type guard para el dato crudo de `localStorage` (mismo criterio de shape
 * ESTRICTO que `esTemaValido` en `packages/core/src/tema.ts`): `JSON.parse`
 * sobre un string arbitrario no garantiza ningún tipo, y de acá salen los
 * gramos y las unidades que después terminan en una venta.
 *
 * Es todo-o-nada a propósito: JSON roto, `v` desconocido, claves de más o de
 * menos, tipos equivocados o claves de lista repetidas (romperían la
 * identidad de lista de React y `quitar`, que filtra por clave) hacen que el
 * payload ENTERO se ignore, como si no hubiera carrito guardado. El descarte
 * ítem por ítem es otra cosa y ocurre después, en `rehidratarCarrito`: ahí el
 * dato es válido pero el mundo cambió.
 */
export function esCarritoPersistidoValido(x: unknown): x is CarritoPersistido {
  if (!esObjetoPlano(x)) return false;
  if (!tieneExactamente(x, CLAVES_CARRITO)) return false;
  if (x['v'] !== 1) return false;
  if (!esEnteroNoNegativo(x['proximaClave'])) return false;
  if (x['cliente'] !== null && !esClienteVentaValido(x['cliente'])) return false;

  const items = x['items'];
  if (!Array.isArray(items)) return false;
  if (!items.every((item) => esItemPersistidoValido(item))) return false;

  const claves = new Set((items as ItemPersistido[]).map((item) => item.clave));
  return claves.size === items.length;
}

// ── Serialización ───────────────────────────────────────────────────────────

/**
 * Reduce el carrito en memoria a su forma persistible. Las claves opcionales
 * se OMITEN cuando no aplican (spread condicional, no `undefined` explícito):
 * el shape que vuelve tiene que pasar `esCarritoPersistidoValido`, que
 * rechaza claves ajenas.
 */
export function serializarCarrito(
  items: ItemCarrito[],
  cliente: ClienteVenta | null,
  proximaClave: number,
): CarritoPersistido {
  return {
    v: 1,
    items: items.map((item) => ({
      clave: item.clave,
      productoId: item.producto.id,
      ...(item.pieza !== undefined ? { piezaId: item.pieza.id } : {}),
      ...(item.gramos !== undefined ? { gramos: item.gramos } : {}),
      ...(item.unidades !== undefined ? { unidades: item.unidades } : {}),
      precioUnitCents: item.precioUnitCents,
    })),
    cliente,
    proximaClave,
  };
}

// ── Rehidratación ───────────────────────────────────────────────────────────

function agregarUnico(lista: string[], nombre: string): void {
  if (!lista.includes(nombre)) lista.push(nombre);
}

/**
 * Reconstruye el carrito contra las colecciones VIVAS de la pantalla Venta:
 * `productos` (activos), `piezas` (estado `disponible`) y `clientes`
 * (activos) — las mismas tres queries que ya alimentan el POS, sin lecturas
 * extra.
 *
 * Cada ítem se reconstruye con los constructores de `itemsCarrito.ts`, así
 * que el precio, el costo y (en `pieza_entera`) el peso vendido salen SIEMPRE
 * del dato vivo, nunca del payload. El payload solo dice "el vendedor quería
 * tantos gramos de tal pieza".
 *
 * Se recorre en orden y se acumula lo ya aceptado, porque el disponible de un
 * ítem depende de los anteriores: dos cortes de la MISMA pieza se validan
 * contra el peso restante menos lo que ya reservó el corte previo (idéntico a
 * `piezasAjustadasPorCarrito`), y varias líneas de un mismo `unidad_simple`
 * contra el stock total (idéntico a `puedeSumarUnidad`). `granel` NO acumula,
 * también por paridad: `ModalAgregarGranel` valida cada ítem contra el stock
 * de catálogo sin restar los otros ítems del carrito (ver la nota de
 * `stockGranelParaEditar`), y ser más estricto acá descartaría ítems que la
 * pantalla acababa de aceptar.
 */
export function rehidratarCarrito(
  persistido: CarritoPersistido,
  productos: Producto[],
  piezas: Pieza[],
  clientes: Cliente[],
): ResultadoRehidratacion {
  const porProducto = new Map(productos.map((producto) => [producto.id, producto]));
  const porPieza = new Map(piezas.map((pieza) => [pieza.id, pieza]));

  const items: ItemCarrito[] = [];
  const descartados: string[] = [];
  const preciosCambiados: string[] = [];
  let descartadosSinNombre = 0;

  /** Gramos ya comprometidos por ítems ACEPTADOS, por pieza. */
  const reservadoPorPieza = new Map<string, Peso>();
  /** Piezas que ya se lleva entera un ítem aceptado: no se pueden vender dos veces. */
  const piezasTomadas = new Set<string>();
  /** Unidades ya comprometidas por ítems aceptados, por producto. */
  const unidadesReservadas = new Map<string, number>();

  for (const persistidoItem of persistido.items) {
    const producto = porProducto.get(persistidoItem.productoId);
    if (producto === undefined) {
      descartadosSinNombre += 1;
      continue;
    }

    const reconstruido = reconstruirItem(persistidoItem, producto, {
      porPieza,
      reservadoPorPieza,
      piezasTomadas,
      unidadesReservadas,
    });

    if (reconstruido === null) {
      agregarUnico(descartados, producto.nombre);
      continue;
    }

    if (persistidoItem.precioUnitCents !== producto.precioVentaCents) {
      agregarUnico(preciosCambiados, producto.nombre);
    }
    items.push(reconstruido);
  }

  const { cliente, clienteDescartado } = reconciliarCliente(persistido.cliente, clientes);

  return { items, cliente, descartados, descartadosSinNombre, preciosCambiados, clienteDescartado };
}

interface AcumuladoresRehidratacion {
  porPieza: Map<string, Pieza>;
  reservadoPorPieza: Map<string, Peso>;
  piezasTomadas: Set<string>;
  unidadesReservadas: Map<string, number>;
}

/**
 * Reconstruye UN ítem, o `null` si hay que descartarlo. El `modoStock` del
 * producto VIVO manda: si el payload no trae los campos que ese modo exige
 * (p. ej. un ítem sin `piezaId` para un producto que hoy es
 * `fraccionado_por_pieza` porque le cambiaron el modo), se descarta en vez de
 * inventar. Muta los acumuladores solo cuando el ítem se acepta.
 */
function reconstruirItem(
  persistido: ItemPersistido,
  producto: Producto,
  acc: AcumuladoresRehidratacion,
): ItemCarrito | null {
  switch (producto.modoStock) {
    case 'fraccionado_por_pieza': {
      if (persistido.piezaId === undefined || persistido.gramos === undefined) return null;
      const pieza = acc.porPieza.get(persistido.piezaId);
      if (pieza === undefined || pieza.productoId !== producto.id) return null;

      const gramos = peso(persistido.gramos);
      const reservado = acc.reservadoPorPieza.get(pieza.id) ?? peso(0);
      const disponible = pesoNoNegativo(restarPeso(pieza.pesoRestanteGramos, reservado));
      if (disponible < gramos) return null;

      acc.reservadoPorPieza.set(pieza.id, sumarPeso(reservado, gramos));
      // Se embebe la pieza AJUSTADA por lo que ya reservaron los ítems
      // anteriores, exactamente como hace la pantalla al agregar un segundo
      // corte (`piezasAjustadasPorCarrito` → `ModalAgregarFraccionado` →
      // `crearItemFraccionado`). Importa porque `registrarVenta` valida cada
      // ítem contra el `pesoRestanteGramos` EMBEBIDO, no contra una lectura
      // viva: dejarle el peso completo a los dos cortes relajaría esa
      // validación respecto de lo que produce el flujo normal.
      const piezaAjustada: Pieza = { ...pieza, pesoRestanteGramos: disponible };
      return crearItemFraccionado(producto, piezaAjustada, gramos, persistido.clave);
    }

    case 'pieza_entera': {
      if (persistido.piezaId === undefined) return null;
      const pieza = acc.porPieza.get(persistido.piezaId);
      if (pieza === undefined || pieza.productoId !== producto.id) return null;
      if (acc.piezasTomadas.has(pieza.id)) return null;
      // `registrarVenta` rechaza una pieza sin peso restante; descartarla acá
      // evita resucitar un ítem que solo puede fallar al cobrar.
      if (pieza.pesoRestanteGramos <= 0) return null;

      acc.piezasTomadas.add(pieza.id);
      // El peso vendido es el `pesoRestanteGramos` VIVO, no el que se pidió
      // al agregar: la pieza pudo haber mermado mientras tanto.
      return crearItemPiezaEntera(producto, pieza, persistido.clave);
    }

    case 'granel': {
      if (persistido.gramos === undefined) return null;
      const stock = producto.stockGranelGramos;
      if (stock === undefined) return null;

      const gramos = peso(persistido.gramos);
      if (stock < gramos) return null;

      return crearItemGranel(producto, gramos, persistido.clave);
    }

    case 'unidad_simple': {
      if (persistido.unidades === undefined) return null;
      const stock = producto.stockUnidades;
      if (stock === undefined) return null;

      const reservadas = acc.unidadesReservadas.get(producto.id) ?? 0;
      if (reservadas + persistido.unidades > stock) return null;

      acc.unidadesReservadas.set(producto.id, reservadas + persistido.unidades);
      return crearItemUnidad(producto, persistido.unidades, persistido.clave);
    }
  }
}

/**
 * Revalida el cliente asociado contra los clientes ACTIVOS. Si sigue activo,
 * se REFRESCA su nombre y se recalcula `esPrimeraCompra` con el mismo
 * criterio que `seleccionarClienteExistente` en `Venta.tsx`
 * (`stats.cantidadVentas === 0`): entre la recarga y ahora pudo haberle
 * entrado una venta, y prometerle a `registrarVenta` una primera compra que
 * ya no lo es reinicializaría `stats.primeraCompra`.
 */
function reconciliarCliente(
  persistido: ClienteVenta | null,
  clientes: Cliente[],
): { cliente: ClienteVenta | null; clienteDescartado: boolean } {
  if (persistido === null) return { cliente: null, clienteDescartado: false };

  const vivo = clientes.find((cliente) => cliente.id === persistido.id);
  if (vivo === undefined) return { cliente: null, clienteDescartado: true };

  return {
    cliente: {
      id: vivo.id,
      nombre: vivo.nombre,
      esPrimeraCompra: vivo.stats.cantidadVentas === 0,
    },
    clienteDescartado: false,
  };
}
