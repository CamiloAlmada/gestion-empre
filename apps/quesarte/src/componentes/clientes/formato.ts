/** Texto de "cantidad de ventas" con plural correcto (mismo criterio que
 * `textoCantidadItems` de `componentes/historial/formato.ts`). */
export function textoCantidadVentas(cantidad: number): string {
  return cantidad === 1 ? '1 venta' : `${cantidad} ventas`;
}
