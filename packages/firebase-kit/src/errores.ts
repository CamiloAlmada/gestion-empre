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

/**
 * El alta manual de piezas (`ingresarPiezas`) es incoherente: el producto no se
 * controla por piezas (`modoStock` distinto de `fraccionado_por_pieza` /
 * `pieza_entera`), la lista de piezas viene vacía, algún `pesoInicialGramos` no
 * es positivo, o una `fechaVencimiento` es anterior a hoy.
 */
export class IngresoInvalidoError extends ErrorEscrituraPOS {
  constructor(message: string) {
    super(message);
    this.name = 'IngresoInvalidoError';
  }
}

/**
 * Errores de la gestión del vocabulario de categorías (`categorias.ts`).
 *
 * Mismo patrón que las otras familias: una raíz abstracta para el `catch` genérico
 * en la pantalla que administra categorías y clases concretas para discriminar el
 * mensaje. No comparten jerarquía con los del POS ni con las invitaciones: son
 * operaciones de catálogo (solo admin), no escrituras del mostrador.
 */
export abstract class ErrorCategoria extends Error {}

/**
 * El nombre de la categoría es inválido por una razón que no es duplicación:
 * vacío tras `trim()`, o (en un renombre) la categoría a renombrar no existe.
 * Validación previa local, fail fast antes de tocar Firestore.
 */
export class CategoriaInvalidaError extends ErrorCategoria {
  constructor(message: string) {
    super(message);
    this.name = 'CategoriaInvalidaError';
  }
}

/**
 * Ya existe una categoría con ese nombre (comparación case-insensitive). El
 * vocabulario no admite duplicados: dos "Quesos" harían ambiguo el nombre
 * denormalizado que guardan los productos.
 */
export class CategoriaDuplicadaError extends ErrorCategoria {
  constructor(message: string) {
    super(message);
    this.name = 'CategoriaDuplicadaError';
  }
}

/**
 * Errores del alta de usuarios por invitación (`invitaciones.ts`).
 *
 * Mismo patrón que `ErrorEscrituraPOS`: una raíz abstracta para el `catch`
 * genérico en la pantalla "Usuarios" y clases concretas para discriminar el
 * mensaje. No comparten jerarquía con los del POS porque no son escrituras del
 * mostrador y la UI que los consume es otra.
 */
export abstract class ErrorInvitacion extends Error {}

/**
 * El email tiene una forma inválida. Se dispara en la validación previa local
 * (antes de tocar Firebase) o al mapear `auth/invalid-email` que devuelva Auth.
 */
export class EmailInvalidoError extends ErrorInvitacion {
  constructor(message: string) {
    super(message);
    this.name = 'EmailInvalidoError';
  }
}

/**
 * Los datos de la invitación son inválidos por una razón distinta al email:
 * nombre vacío o rol fuera de la unión `Rol`. Validación previa, fail fast.
 */
export class DatosInvitacionInvalidosError extends ErrorInvitacion {
  constructor(message: string) {
    super(message);
    this.name = 'DatosInvitacionInvalidosError';
  }
}

/**
 * Ya existe una cuenta de Auth con ese email (`auth/email-already-in-use`). El
 * usuario ya fue invitado (o se registró) antes.
 */
export class EmailYaRegistradoError extends ErrorInvitacion {
  constructor(message: string) {
    super(message);
    this.name = 'EmailYaRegistradoError';
  }
}

/**
 * Fallo parcial crítico de la invitación: la cuenta de Auth se creó pero el
 * `setDoc` de `usuarios/{uid}` falló. La cuenta queda HUÉRFANA (sin doc de
 * perfil). No es un agujero de seguridad —el guard post-login y las reglas
 * tratan a una cuenta sin doc como "no autorizada" y le niegan todo acceso—,
 * pero hay que comunicarlo: reintentar la invitación con el MISMO email va a
 * fallar con `EmailYaRegistradoError`, porque el cliente no puede borrar la
 * cuenta ajena que quedó creada. La cuenta huérfana se limpia a mano desde la
 * consola de Firebase Auth (o se le crea el doc de perfil directo en consola).
 */
export class PerfilNoCreadoError extends ErrorInvitacion {
  constructor(message: string) {
    super(message);
    this.name = 'PerfilNoCreadoError';
  }
}
