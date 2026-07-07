# 01 — Arquitectura del monorepo

## Estructura

```
/
├── CLAUDE.md
├── package.json                # raíz, private, con pnpm workspaces
├── pnpm-workspace.yaml
├── turbo.json
├── docs/
├── apps/
│   ├── queseria/               # React PWA — proyecto Firebase propio
│   │   ├── src/
│   │   ├── firebase.json
│   │   ├── .firebaserc
│   │   ├── firestore.rules
│   │   ├── firestore.indexes.json
│   │   ├── .env.example        # config Firebase dev/prod vía variables VITE_*
│   │   └── vite.config.ts
│   └── cerrajeria/             # (Fase 4 — no crear aún)
└── packages/
    ├── core/                   # lógica de dominio pura (TS, sin deps de runtime)
    ├── firebase-kit/           # auth, hooks de Firestore, offline, converters
    ├── ui/                     # componentes compartidos (tablas, forms, layout POS)
    └── config/                 # tsconfig base, eslint, tema compartido de tailwind
```

## Responsabilidad de cada package

### `packages/core`
- Tipos de dominio: `Producto`, `Pieza`, `Venta`, `Compra`, `MovimientoStock`, etc.
- Tipos de valor: `Money` (centésimos, entero), `Peso` (gramos, entero) con
  helpers de creación, suma, multiplicación por escalar y formateo a string.
- Funciones puras: cálculo de precio de venta (por kg / por unidad / pieza entera),
  selección FIFO de piezas, prorrateo de gastos de compra, cálculo de margen y
  markup, redondeo comercial de precios.
- **Cero dependencias de Firebase o React.** Tests unitarios exhaustivos con Vitest.
  Esta es la parte más testeada del sistema.

### `packages/firebase-kit`
- Inicialización de Firebase app a partir de env vars.
- Habilitación de persistencia offline de Firestore.
- `FirestoreDataConverter`s tipados para cada colección (mapean documentos ↔ tipos
  de `core`).
- Hooks genéricos: `useDoc`, `useCollection`, `useAuth`, estados de
  loading/error/offline.
- Helpers de escritura transaccional (ej. venta que descuenta stock de forma atómica
  usando transacciones o batched writes de Firestore).

### `packages/ui`
- Componentes con Tailwind: `DataTable`, `MoneyInput`, `PesoInput` (acepta gramos o
  kg con conversión visual), `SearchSelect`, `Modal`, `Toast`, layout de POS
  (grilla de productos + carrito), `StatCard`.
- Sin ninguna dependencia de Firebase. Reciben datos y callbacks por props.

### `packages/config`
- `tsconfig.base.json` con `strict: true`.
- Config compartida de ESLint + Prettier.
- Tema compartido de Tailwind v4: archivo CSS con `@theme` (paleta y tipografía
  base) que cada app importa. Reemplaza al "preset" de Tailwind v3.

## Firebase por app

- Cada app tiene **dos proyectos Firebase**: `<app>-dev` y `<app>-prod`, definidos
  en `.firebaserc` como aliases.
- La config del cliente (apiKey, projectId, etc.) va por variables de entorno
  `VITE_FIREBASE_*`, con `.env.development` y `.env.production`.
- Servicios usados: Firestore, Auth (email/password + Google), Hosting.
- Reglas de Firestore: solo usuarios autenticados y autorizados. Mantener una
  colección `usuarios/{uid}` con campo `rol` (`admin` | `vendedor`); las reglas
  validan pertenencia y rol. Denegar todo por defecto.

## PWA

- `vite-plugin-pwa` con `registerType: 'autoUpdate'` y aviso de "nueva versión
  disponible" en la UI.
- Manifest con nombre, íconos e idioma `es`.
- Firestore con persistencia offline habilitada (`persistentLocalCache` con
  `persistentMultipleTabManager`).
- El POS debe poder registrar ventas offline; Firestore las sincroniza al volver
  la conexión. Mostrar indicador de estado de conexión en el header.

## CI/CD (GitHub Actions)

- Workflow `queseria.yml` con trigger por push a `main` con paths:
  `apps/queseria/**`, `packages/**`, `pnpm-lock.yaml`.
- Pasos: install (pnpm con cache) → `turbo lint test build --filter=queseria...`
  → deploy a Firebase Hosting con `FirebaseExtended/action-hosting-deploy` o
  `firebase-tools` + token/OIDC.
- PRs generan preview channels de Firebase Hosting.
- Cuando exista la cerrajería, workflow gemelo con sus propios paths. Un push que
  solo toca una app NO deploya la otra.

## Convenciones de código

- TypeScript estricto en todo. Prohibido `any` salvo justificación en comentario.
- Componentes de React en PascalCase, hooks `useXxx`, archivos de dominio en
  español (`producto.ts`, `calcularPrecio.ts`).
- Los IDs de documentos Firestore son autogenerados; nunca codificar significado
  en el ID.
- Timestamps siempre `Timestamp` de Firestore en persistencia, `Date` en dominio.
- Commits convencionales (`feat:`, `fix:`, `chore:`) con scope de app o package:
  `feat(queseria): POS de venta rápida`.
