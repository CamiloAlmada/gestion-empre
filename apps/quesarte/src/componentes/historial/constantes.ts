/**
 * Paginación simple por límite (docs 06 no exige cursor real para Fase 1): la
 * query trae las últimas `LIMITE_INICIAL_VENTAS` ventas por fecha desc, y
 * "Cargar más" agranda el límite de a `INCREMENTO_LIMITE_VENTAS`. Es una
 * resubscripción completa (no un cursor `startAfter`), pero alcanza mientras
 * el volumen de ventas sea manejable — la evolución natural si el historial
 * crece mucho sería migrar a paginación por cursor.
 */
export const LIMITE_INICIAL_VENTAS = 50;
export const INCREMENTO_LIMITE_VENTAS = 50;
