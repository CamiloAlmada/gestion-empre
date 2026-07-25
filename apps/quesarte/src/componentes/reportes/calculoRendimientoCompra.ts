import type { RendimientoCompra } from '@gestion/core';

/**
 * Presentación pura (sin React, sin Firebase) del rendimiento de compra/viaje
 * (Fase 3, tanda B4, docs/PLAN-ACTIVO.md): traduce el `RendimientoCompra` que
 * ya calculó `packages/core` a texto en español. Nada acá hace aritmética de
 * plata ni de peso — solo arma strings a partir de los campos ya calculados.
 *
 * Mismo criterio que `calculoReportes.ts` (B1): la traducción a texto vive
 * separada del componente para poder testearla sin montar React ni mockear
 * Firestore.
 */

/**
 * Mensaje principal según `RendimientoCompra.estado` — el criterio no
 * negociable del brief: una compra recién confirmada, sin ventas todavía,
 * tiene que leerse como "es pronto para juzgar", nunca como "el viaje no
 * rindió". Cada mensaje es honesto sobre lo que el número SÍ puede afirmar.
 */
export function mensajeEstadoRendimiento(estado: RendimientoCompra['estado']): string {
  switch (estado) {
    case 'sin_atribucion':
      return 'Esta compra es enteramente a granel o por unidad: no hay lote que diga cuánto de esa mercadería ya se vendió.';
    case 'sin_ventas':
      return 'Todavía no se vendió nada de esta compra. Es pronto para juzgar si el viaje rindió.';
    case 'en_curso':
      return 'Falta vender parte de la mercadería de esta compra: la ganancia todavía puede subir.';
    case 'agotada':
      return 'Ya se vendió toda la mercadería con atribución exacta de esta compra.';
  }
}

/**
 * Nota sobre la porción NO atribuible (granel/unidad), solo cuando existe
 * (`costoNoAtribuibleCents > 0`): explícita sobre por qué se excluye, nunca
 * la mezcla en silencio con la porción exacta (criterio central del brief).
 * `null` cuando la compra fue 100% por pieza (no hay nada que aclarar).
 */
export function notaCostoNoAtribuible(rendimiento: Pick<RendimientoCompra, 'costoNoAtribuibleCents'>): string | null {
  if (rendimiento.costoNoAtribuibleCents <= 0) return null;
  return 'No incluye la mercadería a granel o por unidad de esta compra: no tienen lote, así que no se puede saber cuánto de esa parte ya se vendió (se mezcla con el stock de otras compras del mismo producto).';
}
