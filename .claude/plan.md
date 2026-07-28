# Plan activo

Estado de trabajo en curso. Lo mantiene el **orquestador** (sesión principal de
Claude Code): se actualiza después de cada tanda de delegación, no al final.

Este archivo es la memoria del plan. Si no está acá, no existe.

El historial de consultas al `advisor` va en `.claude/advisor-log.md`.
La Fase 3, ya cerrada y mergeada, quedó archivada en `docs/PLAN-ACTIVO.md`.

Convenciones:
- Cada tarea lleva agente asignado (`advisor` / `senior` / `semisenior` / `trainee`).
- Los criterios de aceptación son verificables (comando o comprobación concreta).
- Las decisiones de arquitectura se anotan con fecha y motivo; no se
  re-discuten sin evidencia nueva.

---

## Estado

Fases 0, 1, 1.5, 2 y 3 cerradas. Fase 3 (Reportes) mergeada en `main` como
`eaaf263` el 2026-07-27, desplegada y verificada en https://quesarte-uy.web.app.
La migración de canonicalización de categorías corrió en dev y en prod, y es
idempotente (0 operaciones al reejecutar).

## Abierto

| # | Tarea | Agente | Estado | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| R1 | **Reseteo operativo de producción** | persona, no agente | ⏸️ **a pedido** | Borra `ventas`, `movimientos`, `piezas`, `compras` y resetea contadores derivados. Las 5 decisiones del dueño están confirmadas (conservar clientes/usuarios/config, borrar compras en borrador, backups fuera del repo). Es el **último paso antes de entregarle el sistema a Adrián**: se corre cuando se entrega, no mientras se sigue probando. Con dry-run, backup y confirmación tipeada. |
| R2 | Revisión visual de Reportes en el celular | — | pendiente del dueño | Confirmar cómo se leen en la práctica la nota de cobertura, el cuadrante del ranking y el texto "Ganancia de lo que va del mes" |
| R3 | `crearProveedor` no valida duplicados | `semisenior` | pendiente | `packages/firebase-kit/src/proveedores.ts:69` no chequea nada. Decidir si aplica el mismo patrón de id canónico que se usó en categorías (tanda C) o alcanza con una validación más simple — **consultar `advisor` primero**, porque la unicidad entre documentos fue justo el punto difícil de esa tanda |

## En espera de la elicitación con Adrián (doc 10)

No se implementan antes de esa sesión; el objetivo de la sesión es
repriorizarlos (docs/10b): pantalla de reporte de merma, proyección del mes,
próximo viaje / cobertura, preferencias de cliente.
