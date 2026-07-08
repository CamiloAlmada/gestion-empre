/**
 * Errores de dominio de las escrituras del POS (`ventas.ts`, `stock.ts`).
 *
 * Son la primera capa de la validación en dos niveles (ver docs de esas
 * funciones): fallan rápido, en el cliente, con un mensaje claro en español y
 * ANTES de armar cualquier batch. La segunda capa son las reglas de Firestore
 * como backstop en el servidor.
 *
 * Todos extienden `ErrorEscrituraPOS` para permitir un `catch` genérico en la UI
 * ("algo del POS falló por una regla de negocio") y a la vez discriminar por
 * clase concreta cuando hace falta (`instanceof StockInsuficienteError`).
 */

/** Raíz de la jerarquía: permite capturar cualquier error de negocio del POS. */
export abstract class ErrorEscrituraPOS extends Error {}

/**
 * El stock (peso de una pieza, granel o unidades) no alcanza para el efecto
 * pedido, o quedaría negativo. La validación local puede estar desactualizada
 * offline; el diseño con `increment()` + reglas con piso cero lo tolera, pero
 * igual fallamos rápido contra el estado que conoce el cliente.
 */
export class StockInsuficienteError extends ErrorEscrituraPOS {
  constructor(message: string) {
    super(message);
    this.name = 'StockInsuficienteError';
  }
}

/** Se intentó registrar una venta sin ítems. */
export class VentaVaciaError extends ErrorEscrituraPOS {
  constructor(message: string) {
    super(message);
    this.name = 'VentaVaciaError';
  }
}

/** El `totalCents` de la venta no coincide con la suma exacta de subtotales. */
export class TotalIncoherenteError extends ErrorEscrituraPOS {
  constructor(message: string) {
    super(message);
    this.name = 'TotalIncoherenteError';
  }
}

/**
 * Un ítem de venta es incoherente con el `modoStock` de su producto: faltan los
 * datos que ese modo exige (pieza, gramos o unidades) o son inválidos
 * (no positivos, no enteros).
 */
export class ItemInvalidoError extends ErrorEscrituraPOS {
  constructor(message: string) {
    super(message);
    this.name = 'ItemInvalidoError';
  }
}

/** Se intentó anular una venta que no está `completada`. */
export class AnulacionInvalidaError extends ErrorEscrituraPOS {
  constructor(message: string) {
    super(message);
    this.name = 'AnulacionInvalidaError';
  }
}

/**
 * Un ajuste de stock es incoherente: el signo del delta no corresponde al tipo
 * (`ajuste_positivo` con delta ≤ 0, etc.), falta el delta correcto para el
 * `modoStock` del producto, o falta la pieza cuando el producto va por piezas.
 */
export class AjusteInvalidoError extends ErrorEscrituraPOS {
  constructor(message: string) {
    super(message);
    this.name = 'AjusteInvalidoError';
  }
}
