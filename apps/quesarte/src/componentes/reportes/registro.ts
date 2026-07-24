/**
 * Registro de reportes (Fase 3, tanda B1, docs/PLAN-ACTIVO.md): la home de
 * Reportes (`pantallas/Reportes.tsx`) se arma iterando ESTE array, nunca
 * hardcodeando JSX por reporte. Afinar el catálogo después de la sesión de
 * elicitación con Adrián (doc 10) es editar esta lista, no rediseñar la
 * pantalla.
 *
 * Los drill-downs (rentabilidad por producto/categoría → B2, alertas →
 * B3, rendimiento de compra/viaje → B4) NO están construidos todavía —
 * `docs/PLAN-ACTIVO.md`, tanda B. Este archivo define el contrato para que
 * esas tareas agreguen su entrada sin tocar el layout de la home. Hoy el
 * catálogo está VACÍO a propósito: no hay ningún drill-down real para
 * linkear, y la home no inventa una ruta que todavía no existe (la sección
 * "Para mirar" simplemente no se renderiza mientras esté vacío, ver
 * `Reportes.tsx`).
 */
export interface DefinicionReporte {
  /** Identificador estable, para `key` de lista y para no duplicar entradas. */
  readonly id: string;
  /** Título de la entrada en el listado de la home. */
  readonly titulo: string;
  /**
   * Una línea que explica qué decisión responde (criterio del brief: "un
   * reporte que no cambia ninguna decisión no se construye").
   */
  readonly descripcion: string;
  /**
   * Ruta real del drill-down (docs/06-ui-ux.md §2: los drill-downs viven en
   * rutas reales para que el botón "atrás" del teléfono funcione siempre).
   */
  readonly ruta: string;
}

/** Vacío hasta que B2/B3/B4 agreguen su entrada. Ver el JSDoc de arriba. */
export const REGISTRO_REPORTES: readonly DefinicionReporte[] = [];
