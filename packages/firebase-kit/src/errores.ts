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
 * Errores de la gestión de clientes y proveedores (`clientes.ts`, `proveedores.ts`).
 *
 * Mismo patrón que las otras familias: una raíz abstracta por entidad para el
 * `catch` genérico en su pantalla, y una clase concreta de validación previa
 * (fail fast antes de tocar Firestore). No comparten jerarquía con el POS: son
 * ABM de fichas, no escrituras del mostrador (salvo el alta rápida de cliente,
 * que igual usa `crearCliente`).
 */
export abstract class ErrorCliente extends Error {}

/** El nombre del cliente es inválido: vacío tras `trim()`. */
export class ClienteInvalidoError extends ErrorCliente {
  constructor(message: string) {
    super(message);
    this.name = 'ClienteInvalidoError';
  }
}

export abstract class ErrorProveedor extends Error {}

/** El nombre del proveedor es inválido: vacío tras `trim()`. */
export class ProveedorInvalidoError extends ErrorProveedor {
  constructor(message: string) {
    super(message);
    this.name = 'ProveedorInvalidoError';
  }
}

/**
 * Errores de la configuración del negocio (`configuracion.ts`): edición de la
 * config general y de las plantillas de WhatsApp (doc 08), ambas solo-admin en
 * Ajustes. Validación previa local (fail fast en español antes de tocar Firestore)
 * como el resto de las familias; las reglas son el backstop en el servidor.
 */
export abstract class ErrorConfiguracion extends Error {}

/**
 * La configuración a guardar es inválida: código de país que no es 1-4 dígitos,
 * nombre de negocio vacío o demasiado largo, o una lista de plantillas de WhatsApp
 * mal formada (demasiadas, ids duplicados, contexto fuera de la unión, o campos
 * fuera de rango). El mensaje dice cuál.
 */
export class ConfiguracionInvalidaError extends ErrorConfiguracion {
  constructor(message: string) {
    super(message);
    this.name = 'ConfiguracionInvalidaError';
  }
}

/**
 * Errores del módulo de compras (`compras.ts`, doc 03).
 *
 * Mismo patrón que las otras familias: una raíz abstracta para el `catch` genérico
 * en la pantalla de compras y clases concretas para discriminar el mensaje. La
 * confirmación es una escritura atómica con efectos de stock: como en el POS, se
 * valida TODO (coherencia de totales, prorrateo y estado) ANTES de abrir el batch,
 * fail fast en español.
 */
export abstract class ErrorCompra extends Error {}

/** Se intentó confirmar una compra sin ítems. */
export class CompraVaciaError extends ErrorCompra {
  constructor(message: string) {
    super(message);
    this.name = 'CompraVaciaError';
  }
}

/**
 * Transición de estado inválida: confirmar una compra que no está en `borrador`
 * (una `confirmada` es inmutable, doc 03), o efectos por producto que no cubren
 * exactamente los ítems de la compra.
 */
export class EstadoCompraInvalidoError extends ErrorCompra {
  constructor(message: string) {
    super(message);
    this.name = 'EstadoCompraInvalidoError';
  }
}

/**
 * La compra es internamente incoherente: un total no cierra con la suma de sus
 * partes, un ítem no trae los datos que su tipo exige (gramos/unidades/piezas,
 * costo real por kg), o un costo derivado no coincide con lo que recalcula `core`.
 */
export class CompraIncoherenteError extends ErrorCompra {
  constructor(message: string) {
    super(message);
    this.name = 'CompraIncoherenteError';
  }
}

/**
 * Invariante del prorrateo roto: la suma de `gastoProrrateadoCents` de los ítems no
 * es exactamente `totalGastosCents` (doc 03). Se calcula con `prorratearGastos` de
 * `core`, que garantiza el cierre; este error protege contra un caller que arme la
 * compra a mano o con un total de gastos que no coincide con sus gastos.
 */
export class ProrateoIncoherenteError extends ErrorCompra {
  constructor(message: string) {
    super(message);
    this.name = 'ProrateoIncoherenteError';
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
