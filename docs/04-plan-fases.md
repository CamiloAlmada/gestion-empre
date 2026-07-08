# 04 — Plan de implementación por fases

Trabajar fase por fase y, dentro de cada fase, tarea por tarea. No arrancar una
fase sin cerrar los criterios de aceptación de la anterior. Ante ambigüedad de
negocio, preguntar antes de asumir.

## Fase 0 — Fundación del monorepo

Objetivo: pipeline completo funcionando con un "hola mundo" PWA en producción.

Tareas:
1. Inicializar monorepo: pnpm workspaces, Turborepo, `packages/config` con
   tsconfig/eslint/prettier/tailwind preset.
2. Crear `packages/core` con los tipos de valor `Money` y `Peso` + tests.
3. Crear `packages/firebase-kit` con init de app y `useAuth`.
4. Crear `packages/ui` con 2-3 componentes base (Button, Input, Layout).
5. Crear `apps/queseria`: Vite + React + TS + Tailwind + vite-plugin-pwa,
   login con Firebase Auth (email + Google), ruta protegida vacía.
6. `firestore.rules` con deny-all + acceso solo a usuarios activos.
7. GitHub Actions: lint + test + build + deploy a Hosting con path filters,
   preview channels en PRs.

Criterios de aceptación:
- [x] `pnpm turbo build --filter=queseria` funciona en limpio.
- [ ] La app deployada en Firebase Hosting es instalable como PWA. *(implementado;
      verificación pendiente del primer deploy — requiere secrets/vars en GitHub)*
- [ ] Login funciona; usuario no autenticado no ve nada. *(implementado y testeado
      unitariamente; verificación runtime pendiente de config Firebase real)*
- [ ] Un push que no toca la app no dispara su deploy. *(garantizado por path
      filters; verificación pendiente de los primeros pushes)*
- [x] Tests de `Money`/`Peso` en verde (creación, suma, formato, redondeos).

Estado (2026-07-08): las 7 tareas implementadas, revisadas e integradas en `main`
(sin push aún). Los 3 criterios abiertos dependen de pasos externos: cargar en
GitHub los 2 secrets de service account y las 12 repository variables
`VITE_FIREBASE_*` (checklist en `.github/SETUP-CI.md`), crear `.env.development`
/`.env.production` locales a partir de `.env.example`, y hacer el primer push.

## Fase 1 — MVP quesería (catálogo, stock, POS)

Objetivo: que el dueño pueda cargar productos, ingresar stock y vender en mostrador.

Notas arrastradas del cierre de Fase 0 (del code review):
- **AuthProvider único**: hoy cada pantalla llama `useAuth(auth)` (suscripción
  propia a `onAuthStateChanged`); con varias rutas protegidas cada navegación
  flashea "Cargando…". Primer ítem de Fase 1: contexto con UNA suscripción en
  `firebase-kit` y `useAuth()` sin parámetro.
- **Actualización del service worker**: `registerType: 'autoUpdate'` recarga sola
  al publicar versión nueva — inaceptable en medio de una venta en el POS.
  Pasar a prompt de actualización (o diferir la recarga con venta activa).
- **Alta de usuarios**: hoy manual desde consola Firebase y `usuarios/{uid}` sin
  `write` en reglas. Decidir con el dueño el flujo de alta antes de escribir las
  reglas por colección de Fase 1.
- Si algún día se mueve `authDomain` al dominio de Hosting: agregar
  `navigateFallbackDenylist: [/^\/__\/auth\//]` al `generateSW` o el SW rompe el
  popup de Google.

Tareas:
1. `core`: tipos `Producto`, `Pieza`, `Venta`, `MovimientoStock`; función
   `calcularSubtotal`, selector FIFO `elegirPieza(piezas, gramosSolicitados)`.
2. CRUD de productos con los 4 `modoStock` y 2 `modoPrecio` (ver doc 02).
3. Ingreso manual de stock: alta de piezas (peso, vencimiento), suma de granel
   y unidades. Genera movimientos `ajuste_positivo` / `ingreso_compra` manual.
4. Pantalla Stock: por producto, piezas con peso restante y vencimiento; totales.
5. POS de venta: búsqueda rápida, carrito, FIFO automático con override de pieza,
   flujo especial `pieza_entera` (elegir el salame concreto), cobro con medio de
   pago, escritura atómica (venta + descuento + movimientos).
6. Historial de ventas con detalle y anulación (solo admin, genera reversa).
7. Ajustes de stock y merma con motivo.
8. Offline: venta funciona sin conexión y sincroniza al reconectar; indicador
   de estado.

Criterios de aceptación:
- [ ] Vender 0,5 kg de un queso descuenta de la rueda más antigua y deja rastro
      en movimientos.
- [ ] Vender un salame consume la pieza exacta elegida y cobra por SU peso.
- [ ] Vender 100 g de nuez descuenta del granel sin piezas.
- [ ] Vender 2 frascos de miel descuenta unidades a precio fijo.
- [ ] Una venta anulada restaura stock vía movimientos inversos.
- [ ] Con el wifi apagado se puede completar una venta; al volver la conexión
      aparece en Firestore.
- [ ] Un `vendedor` no puede editar precios (bloqueado por reglas, no solo UI).

## Fase 2 — Compras, costeo y precios

Objetivo: costo real con gastos de viaje prorrateados y gestión de márgenes
(ver doc 03).

Tareas:
1. `core`: `prorratearGastos` (invariante de suma exacta), cálculo de costo real
   por kg, `precioDesdeMargen`, `margenDesdePrecio`, redondeo comercial.
2. Pantalla de compra: borrador → ítems (con detalle de piezas) → gastos del
   viaje → confirmación con efectos atómicos (piezas, stock, movimientos,
   costo promedio).
3. Pantalla Precios y márgenes: tabla, edición bidireccional precio↔margen,
   margen objetivo por producto.
4. Alerta de margen post-compra con precios sugeridos y aplicación masiva.

Criterios de aceptación:
- [ ] Una compra con $2.000 de combustible reparte exactamente $2.000 entre los
      ítems (sin perder ni inventar centésimos).
- [ ] Las piezas creadas por la compra heredan el costo real por kg.
- [ ] Cambiar margen objetivo sugiere precio con redondeo comercial correcto.
- [ ] Confirmada una compra que sube costos, aparecen las alertas de margen.

## Fase 3 — Inteligencia de negocio

Objetivo: reportes que responden preguntas de plata.

Tareas:
1. Congelar costo en el ítem de venta (pieza o promedio) para ganancia real.
2. Reportes: ventas y ganancia bruta por día/semana/mes, por producto y categoría;
   ranking de rentabilidad.
3. Alertas: vencimientos próximos (configurable), stock bajo umbral.
4. Reporte "rendimiento de compra/viaje": ganancia generada por la mercadería de
   una compra vs. sus gastos.
5. Registro y reporte de merma (¿cuánto queso se pierde por mes?).

Criterios de aceptación:
- [ ] El dueño puede ver cuánto ganó (no solo cuánto vendió) el mes pasado.
- [ ] Puede ver si el último viaje a Colonia fue rentable.
- [ ] Recibe aviso de piezas que vencen en los próximos N días.

## Fase 4 — Cerrajería (segunda app)

Ver `docs/05-cerrajeria.md`. NO empezar sin cerrar Fase 2 de la quesería como
mínimo. Al construirla, todo lo que se quiera copiar-pegar de la quesería es
candidato a moverse a `packages/`: esa es la señal de qué faltaba abstraer.

## Backlog explícitamente fuera de alcance

- Facturación electrónica (DGI/CFE): el sistema es de gestión interna.
- Integración con balanzas / lectura de códigos de barras de balanza etiquetadora.
- Multitenancy / panel multi-negocio.
- App nativa (la PWA cubre mobile).
- Cuenta corriente de clientes (evaluar recién si el dueño lo pide con casos reales).
