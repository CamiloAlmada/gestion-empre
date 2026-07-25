/**
 * Registro de reportes (Fase 3, tanda B1, docs/PLAN-ACTIVO.md): la home de
 * Reportes (`pantallas/Reportes.tsx`) se arma iterando ESTE array, nunca
 * hardcodeando JSX por reporte. Afinar el catálogo después de la sesión de
 * elicitación con Adrián (doc 10) es editar esta lista, no rediseñar la
 * pantalla.
 *
 * Los drill-downs (rentabilidad por producto/categoría → B2, alertas →
 * B3, rendimiento de compra/viaje → B4) son tareas de `docs/PLAN-ACTIVO.md`,
 * tanda B. Este archivo define el contrato para que esas tareas agreguen su
 * entrada sin tocar el layout de la home — la sección "Para mirar" solo se
 * renderiza si el registro trae algo (ver `Reportes.tsx`).
 *
 * **Nota del contrato (tarea B2, primera entrada real):** `ruta` es un
 * string ESTÁTICO, sin contexto de sesión (ej. el período elegido en la
 * home). Eso alcanza para el caso general (linkear a un drill-down), pero
 * NO alcanza por sí solo cuando el drill-down necesita heredar un estado
 * elegido en la home (ver "el período viaja" en el JSDoc de `Reportes.tsx`)
 * — ese caso lo resuelve la home reenviando su propio `search` de URL al
 * navegar, sin que este archivo ni `ItemRanking`/`DefinicionReporte` sepan
 * nada de "período". El contrato de ESTE archivo (agregar una entrada acá
 * sin tocar el layout) sí se sostuvo.
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

export const REGISTRO_REPORTES: readonly DefinicionReporte[] = [
  {
    id: 'alertas',
    titulo: 'Vencimientos y stock bajo',
    descripcion: 'Qué rematar antes de perderlo y qué reponer.',
    ruta: '/reportes/alertas',
  },
  {
    id: 'rentabilidad',
    titulo: 'Rentabilidad por producto y categoría',
    descripcion: 'Qué deja plata de verdad, no solo qué se vende más.',
    ruta: '/reportes/rentabilidad',
  },
  {
    id: 'rendimiento-compras',
    titulo: 'Rendimiento de compra/viaje',
    descripcion: 'Si el último viaje a comprar mercadería se pagó solo.',
    ruta: '/reportes/compras',
  },
];
