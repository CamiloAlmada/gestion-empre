import { money, sumarMoney, type Money } from './money.js';
import type { Peso } from './peso.js';
import { redondearHalfUp } from './redondeo.js';

/**
 * Costo real de un ítem: lo que dice la factura más el gasto de viaje que le tocó
 * en el prorrateo. `costoRealCents = costoFacturaCents + gastoProrrateadoCents`.
 */
export function calcularCostoRealCents(
  costoFacturaCents: Money,
  gastoProrrateadoCents: Money,
): Money {
  return sumarMoney(costoFacturaCents, gastoProrrateadoCents);
}

/**
 * Costo real por kg de un ítem al peso: `costoRealCents · 1000 / gramos`,
 * redondeado half-up (una sola división, misma regla que el resto de core).
 *
 * `costoRealCents` es el costo total del ítem que cubre `gramos` gramos; dividir
 * por `gramos/1000` da el costo del kilo. Es el `costoKgCents` que heredan las
 * piezas creadas por la compra (doc 03).
 *
 * Devuelve `null` cuando `gramos <= 0`: sin peso no hay costo por kg que derivar
 * (mismo criterio anti división-por-cero que `calcularTicketPromedio`). Los ítems
 * por unidad (sin gramos) simplemente no tienen `costoRealKgCents`.
 */
export function calcularCostoRealKgCents(costoRealCents: Money, gramos: Peso): Money | null {
  if (gramos <= 0) return null;
  return money(redondearHalfUp((costoRealCents * 1000) / gramos));
}

/**
 * Costo real por unidad de un ítem por unidad (`unidad_simple`): `costoRealCents
 * / unidades`, redondeado half-up. Análogo a `calcularCostoRealKgCents` pero sin
 * el factor 1000 (las unidades ya son la magnitud entera, no hace falta
 * normalizar a un múltiplo como el kilo).
 *
 * Es el costo real de ESTA compra puntual (tarea A1b, congelado de movimientos):
 * a diferencia de `Producto.costoPromedioCents` (que mezcla el costo del stock
 * viejo con el que entra), esta es la base correcta para el movimiento
 * `ingreso_compra` — un hecho puntual que vale lo que costó esa mercadería, no
 * un promedio ponderado con lo que ya había.
 *
 * Devuelve `null` cuando `unidades <= 0` (mismo criterio anti división-por-cero
 * que `calcularCostoRealKgCents`).
 */
export function calcularCostoRealUnitCents(costoRealCents: Money, unidades: number): Money | null {
  if (unidades <= 0) return null;
  return money(redondearHalfUp(costoRealCents / unidades));
}

/**
 * Nuevo costo promedio ponderado tras ingresar mercadería por compra.
 *
 * Media ponderada del costo unitario entre el stock existente y lo que entra:
 *   nuevo = (cantAct·costoAct + cantIng·costoIng) / (cantAct + cantIng)
 *
 * `cantidad*` y `costo*` deben estar en la **misma unidad de medida** entre sí:
 * gramos + costo por kg para productos al peso, o unidades + costo por unidad para
 * `unidad_simple`. La unidad de la cantidad se cancela en la media ponderada, así
 * que esta función es agnóstica de la medida (el llamador elige gramos o unidades).
 *
 * Decisiones de borde (doc 03 pedía definirlas):
 * - **Sin stock previo** (`cantidadActual <= 0`) o **sin costo previo**
 *   (`costoPromedioActualCents <= 0`, sentinela de "todavía no hay base de costo",
 *   p. ej. stock que entró solo por ingreso manual): el nuevo promedio es el costo
 *   entrante. Así el ingreso manual —que por decisión del dueño NO afecta el costo
 *   promedio— no diluye el costo real de la primera compra que sí lo trae.
 * - **`cantidadIngresada <= 0`**: no entra nada, se devuelve el promedio actual
 *   sin tocar (el ingreso manual no pasa por acá; una compra siempre ingresa > 0).
 *
 * @throws {RangeError} si `cantidadActual` o `cantidadIngresada` no son enteros.
 */
export function nuevoCostoPromedio(
  cantidadActual: number,
  costoPromedioActualCents: Money,
  cantidadIngresada: number,
  costoUnitarioIngresadoCents: Money,
): Money {
  if (!Number.isInteger(cantidadActual) || !Number.isInteger(cantidadIngresada)) {
    throw new RangeError(
      `nuevoCostoPromedio requiere cantidades enteras, recibió: ${cantidadActual}, ${cantidadIngresada}`,
    );
  }
  if (cantidadIngresada <= 0) return costoPromedioActualCents;
  if (cantidadActual <= 0 || costoPromedioActualCents <= 0) return costoUnitarioIngresadoCents;

  const numerador =
    cantidadActual * costoPromedioActualCents + cantidadIngresada * costoUnitarioIngresadoCents;
  const denominador = cantidadActual + cantidadIngresada;
  return money(redondearHalfUp(numerador / denominador));
}
