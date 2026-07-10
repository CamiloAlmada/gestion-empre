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
5. Crear `apps/quesarte`: Vite + React + TS + Tailwind + vite-plugin-pwa,
   login con Firebase Auth (email + Google), ruta protegida vacía.
6. `firestore.rules` con deny-all + acceso solo a usuarios activos.
7. GitHub Actions: lint + test + build + deploy a Hosting con path filters,
   preview channels en PRs.

Criterios de aceptación:
- [x] `pnpm turbo build --filter=quesarte` funciona en limpio.
- [x] La app deployada en Firebase Hosting es instalable como PWA. *(verificado
      2026-07-08: prompt de instalación y aviso "lista para usar offline")*
- [x] Login funciona; usuario no autenticado no ve nada. *(verificado en producción
      con Google el 2026-07-08)*
- [x] Un push que no toca la app no dispara su deploy. *(verificado 2026-07-08:
      push solo-docs no disparó el workflow)*
- [x] Tests de `Money`/`Peso` en verde (creación, suma, formato, redondeos).

**FASE 0 CERRADA (2026-07-08)**: 5/5 criterios verificados en producción
(https://quesarte-uy.web.app). El CI deploya hosting + reglas de Firestore en
cada push a `main` que toque la app; previews de PR van contra `quesarte-uy-dev`.

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
- **Auth y alta de usuarios (decidido con el dueño, 2026-07-08, v2 — reemplaza
  las notas anteriores)**: SOLO email/contraseña; se elimina Google del login
  (evita además el problema de `signInWithPopup` en PWA standalone de iOS).
  Alta por **invitación desde la app** (pantalla "Usuarios", solo admin, sin
  Cloud Functions): el admin ingresa email/nombre/rol → la app crea la cuenta
  de Auth vía instancia secundaria de Firebase (no desloguea al admin) con
  contraseña aleatoria descartada → crea `usuarios/{uid}` (`activo: true`, rol)
  → dispara `sendPasswordResetEmail` en español ("establecé tu contraseña";
  personalizar plantilla en consola). Revocación = `activo: false` desde la
  misma pantalla (las reglas verifican `activo` en cada operación); usuarios no
  se borran, se desactivan (preservan auditoría). Reglas de `usuarios`: cada uno
  lee su propio doc; admin lee/crea/actualiza todos; sin delete. Post-login, la
  app verifica existencia + `activo` del doc propio: si falta o es false →
  "cuenta no autorizada" + signOut. Nota asumida: el sign-up de Auth queda
  habilitado (la invitación lo usa por debajo); riesgo aceptado porque sin doc
  en `usuarios` las reglas niegan todo y la app no tiene pantalla de registro.
  Deshabilitar el proveedor Google en consola (dev y prod).
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
9. Gestión de usuarios: pantalla "Usuarios" (solo admin, dentro de Ajustes) con
   invitación por email, listado y activar/desactivar + rol (ver nota de auth
   arriba). Incluye quitar Google del login y el guard post-login por `activo`.
10. Pantalla Ajustes: apariencia (light/dark/system), cuenta y cerrar sesión;
    acceso a Usuarios (admin).

Toda la UI de esta fase se rige por `docs/06-ui-ux.md` (tab bar
`Stock | Historial | ●Venta | Reportes | Ajustes`, tema ámbar con
light/dark/system, checklist a11y en la DoD). Las tareas de `packages/ui`
incluyen `ProveedorTema`/`useTema` y `BarraPestanas` además de los componentes
de datos.

Estado: las 10 tareas implementadas, con review senior integral (C8) aprobado y
sus hallazgos corregidos. 761 tests en verde (255+ de la app, 53 de reglas
contra emulador).

Criterios de aceptación:
- [x] Vender 0,5 kg de un queso descuenta de la rueda más antigua y deja rastro
      en movimientos.
- [x] Vender un salame consume la pieza exacta elegida y cobra por SU peso.
- [x] Vender 100 g de nuez descuenta del granel sin piezas.
- [x] Vender 2 frascos de miel descuenta unidades a precio fijo.
- [x] Una venta anulada restaura stock vía movimientos inversos.
- [x] Con el wifi apagado se puede completar una venta; al volver la conexión
      aparece en Firestore.
- [x] Un `vendedor` no puede editar precios (bloqueado por reglas, no solo UI).

**FASE 1 CERRADA (2026-07-08)**: 7/7 criterios verificados por el dueño sobre la
app en producción con datos reales (incluido offline en dispositivo real Android).
Incidente resuelto durante la verificación: `firestore.indexes.json` estaba vacío
desde Fase 0 y las queries con `where`+`orderBy` fallaban en prod con un error
genérico — se poblaron los 3 índices compuestos prescritos en doc 02 y los hooks
de firebase-kit ahora loguean el `FirestoreError` a consola (trae el link de
creación del índice faltante).

## Fase 1.5 — Clientes y proveedores (modelo + CRUD + cliente en POS) — CERRADA

CERRADA 2026-07-10: los 6 criterios validados por el dueño en producción.
Incluyó además (feedback de uso real): navegación reorganizada (tab Clientes;
Historial cuelga de Venta con atajo de icono en su header), orden consistente
de acciones (+ a la derecha), arrastre del carrito sin tope intermedio, e
índice compuesto de proveedores (incidente en prod: query con where+orderBy
sin índice declarado — ver la lección en los checklists de review).

Objetivo: conocer a quién se le vende y a quién se le compra (ver doc 07, que
es el contrato de este tramo). Va ANTES de Fase 2 a propósito: si `proveedores`
existe primero, el módulo de compras NACE con selector de proveedor
(`proveedorId` + nombre denormalizado) y nunca existe el texto libre — la
cláusula de retrocompatibilidad del doc 07 queda como red de seguridad, no como
migración a ejecutar.

Alcance del tramo (la inteligencia — frecuencias, preferencias, compras
estimadas — NO va acá: extiende Fase 3):
1. Modelo + reglas: colecciones `clientes` y `proveedores`, campos nuevos
   opcionales en `ventas` (`clienteId?`, `clienteNombre?`) y `productos`
   (`proveedorPrincipalId?`), índice `ventas (clienteId, fecha desc)`.
   Reglas del doc 07: `proveedores` solo admin; `clientes` con create de
   vendedor (alta rápida) y update de vendedor restringido a `stats` con
   deltas coherentes con una venta.
2. `registrarVenta`/`anularVenta`: cliente opcional; `stats` del cliente con
   `FieldValue.increment()` en el MISMO `writeBatch` (compatible offline,
   doc 06 §8 — verificado 2026-07-09: el cobro ya es batch puro, sin
   transacciones). La anulación revierte los increments. `primeraCompra`/
   `ultimaCompra` son cache aproximado (se escriben desde el cliente con la
   fecha de la venta; la anulación no las rebobina): la fuente de verdad son
   las ventas.
3. Pantalla Clientes como sección interna de Historial (patrón Productos
   dentro de Stock): listado con búsqueda, ficha con datos + stats + historial.
4. Cliente opcional en el POS, dentro del carrito: buscar o alta rápida
   (solo nombre), sin tocar el presupuesto de ≤3 toques de la venta anónima.
5. Pantalla Proveedores como sección interna de Stock (solo admin): listado y
   ficha con datos de pago; el historial de compras de la ficha se completa
   solo cuando Fase 2 exista.

Deuda CERRADA (RE-1, 2026-07-10, decidido con el dueño): `reactivarCliente` /
`reactivarProveedor` en firebase-kit + botón "Reactivar" en ambas fichas;
Proveedores ganó el toggle "mostrar inactivos" y su ficha pasó a `useDoc` +
badge "Inactivo" (patrón unificado al de Clientes). Nota: el índice compuesto
`proveedores (activo, nombre)` quedó SIN consumidor (la query dejó de filtrar
por activo) — se deja declarado a propósito: borrarlo obligaría a verificar el
comportamiento de `firebase deploy --only firestore` no-interactivo ante
eliminaciones y el costo de mantenerlo es despreciable. Pendiente aún:
`normalizar` (búsqueda acento-insensible) cuadruplicado en la app — extraer a
un helper compartido cuando se toque ese código (candidato: tanda visual UI-3).

Decisión consciente (CP-A, 2026-07-09): las reglas exigen que una venta con
cliente SUBA estrictamente `stats.totalHistoricoCents` — asociar cliente a una
venta de $0 haría fallar el batch. Una venta de mostrador siempre es > 0; si
algún día existieran ventas de $0 (muestras), relajar la regla a `>=` junto
con `registrarVenta`. El índice `compras (proveedorId, fecha desc)` del doc 07
queda para Fase 2 (la colección aún no existe).

Criterios de aceptación (los 6 primeros del doc 07; los de inteligencia y
"próximo viaje" quedan para Fase 3):
- [ ] Venta sin cliente idéntica a hoy (≤3 toques, cero fricción nueva).
- [ ] Asociar cliente existente: un toque + búsqueda desde el carrito.
- [ ] Alta rápida offline con solo nombre (patrón doc 06 §8).
- [ ] Vender y anular actualizan `stats` vía increments en el mismo batch,
      incluso offline.
- [ ] Ficha de cliente con historial, ticket promedio y días desde la última compra.
- [ ] Un `vendedor` no puede leer `proveedores` (verificado por reglas).

## Fase 2 — Compras, costeo y precios

Objetivo: costo real con gastos de viaje prorrateados y gestión de márgenes
(ver doc 03).

Notas arrastradas del cierre de Fase 1 (reviews):
- **Bundle**: 984 KB (288 KB gzip), Vite avisa — hacer code-splitting por ruta.
- **Historial**: paginación por límite simple; migrar a cursor si el volumen molesta.
- **Merma post-venta bajo umbral** (doc 02): cuando una pieza fraccionada queda
  bajo `umbralPiezaAgotadaGramos` tras una venta, ofrecer marcarla agotada con
  merma del resto. Hoy la merma es manual desde Stock.
- **`ingresarPiezas`**: decidir si el alta de piezas por compra reusa este helper
  o va por uno propio (nació para ingreso manual, sin `compraId`).
- **Reglas**: el vendedor hoy puede técnicamente aumentar `stockGranelGramos`
  (solo piezas tienen monotonía). Revisar al definir el flujo de compras.
- **Emulador de Auth**: no está configurado; si se quiere test de integración
  del flujo de invitación, agregarlo a `firebase.json` y al script de tests.
- **Granel sin reserva cruzada en el carrito** (detectado en POS-3, preexistente):
  dos ítems `granel` del mismo producto validan cada uno contra el stock de
  catálogo sin descontar lo que el otro ya reservó — se puede sobrevender
  localmente hasta que `registrarVenta` lo rechace al cobrar. Candidato a
  `granelAjustadoPorCarrito` espejo de `piezasAjustadasPorCarrito`.
- **Categorías (review post-Fase 1, deuda consciente)**: (1) el seed de
  categorías trimea nombres pero la agrupación/renombre comparan sin trim — un
  producto legacy con espacios en `categoria` cae en "Sin categoría" hasta
  re-guardarlo (auto-cura por el select); (2) el offset del sticky de los
  encabezados de Stock (`3.5rem`) está acoplado a la altura del header de
  `Shell.tsx` — extraer a una CSS var `--altura-header` si el header cambia;
  (3) crear/renombrar categoría hace `await` incondicional (deshabilitado
  offline, mismo criterio que invitaciones) — si la conexión cae mid-await
  queda "Guardando…" hasta reconectar.

Decisiones tomadas con el dueño (2026-07-09): el ingreso manual de stock convive
con Compras (queda para casos sin costo: regalos, muestras, correcciones — no
afecta costo promedio); redondeo comercial default a múltiplos de $5;
code-splitting por ruta se hace al INICIO de la fase, antes de las pantallas nuevas.

Tareas:
0. Code-splitting por ruta (`React.lazy` + `Suspense` por pantalla) — cierra la
   nota de bundle de Fase 1.
1. `core`: `prorratearGastos` (invariante de suma exacta), cálculo de costo real
   por kg, `precioDesdeMargen`, `margenDesdePrecio`, redondeo comercial.
2. Pantalla de compra: borrador → ítems (con detalle de piezas) → gastos del
   viaje → confirmación con efectos atómicos (piezas, stock, movimientos,
   costo promedio). El proveedor es selector con alta inline desde el día uno
   (`proveedorId` + `proveedorNombre` denormalizado, doc 07) — Fase 1.5 deja
   la colección lista antes.
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
6. Inteligencia de clientes y proveedores (doc 07, sección "Inteligencia"):
   frecuencia y clientes inactivos, preferencias por cliente, ranking de
   mejores clientes; historial de costo por proveedor, sugerencia de próxima
   compra con cobertura estimada en días y vista "próximo viaje a <proveedor>",
   comparativa entre proveedores. Requiere datos de Fase 1.5 (clienteId en
   ventas) y Fase 2 (compras con proveedorId).

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
