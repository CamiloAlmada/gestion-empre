# Setup de CI/CD — quesarte

El workflow `.github/workflows/quesarte.yml` necesita que el dueño del repo
cargue manualmente 2 **secrets** y 12 **repository variables** en GitHub antes
de que los jobs de deploy funcionen. El job `verificar` (lint/test/build) no
necesita nada de esto y ya funciona sin configuración adicional.

Repo → **Settings → Secrets and variables → Actions**.

## 1. Secrets (pestaña "Secrets")

Cuenta de servicio de Firebase para cada proyecto. El workflow la usa para
**dos cosas**: deploy a Firebase Hosting (`FirebaseExtended/action-hosting-deploy`)
y deploy de `firestore.rules` / `firestore.indexes.json` (`firebase-tools deploy
--only firestore`, autenticado vía `GOOGLE_APPLICATION_CREDENTIALS`) — el mismo
secret cubre ambos. Dos formas de generarla:

- **Opción rápida**: correr `firebase init hosting:github` desde
  `apps/quesarte/` (con el CLI de Firebase autenticado) y dejar que cree los
  secrets automáticamente en el repo — pero como esta tarea usa nombres de
  secret específicos, si el CLI genera otros nombres hay que renombrarlos (o
  copiar el valor) para que coincidan con los de abajo.
- **Manual**: Firebase Console → engranaje ⚙️ → **Project settings** →
  **Service accounts** → **Generate new private key** (para cada proyecto).
  Pegar el JSON completo como valor del secret.

| Secret | Proyecto Firebase | Contenido |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_QUESARTE_UY_DEV` | `quesarte-uy-dev` | JSON completo de la service account |
| `FIREBASE_SERVICE_ACCOUNT_QUESARTE_UY` | `quesarte-uy` | JSON completo de la service account |

No hace falta crear ni configurar `GITHUB_TOKEN`: lo provee GitHub
automáticamente en cada run.

**Permisos necesarios de la service account**: para deployar `firestore.rules`
e índices además de Hosting, la cuenta necesita el rol **Firebase Rules
Admin** (o **Editor** del proyecto, que ya lo incluye). El JSON que se genera
desde Firebase Console → Service accounts (el mismo que se usa para Hosting)
normalmente ya alcanza, porque esa cuenta suele tener rol Editor por defecto.
Si el paso "Deploy Firestore (rules + indexes)" falla con un error **403 /
PERMISSION_DENIED**, hay que ir a Google Cloud Console → IAM & Admin → IAM,
buscar la cuenta de servicio (termina en
`@<proyecto>.iam.gserviceaccount.com`) y otorgarle el rol **Firebase Rules
Admin** (o **Editor**) en el proyecto correspondiente (`quesarte-uy-dev` o
`quesarte-uy`).

## 2. Repository variables (pestaña "Variables")

Son la config de cliente de Firebase (`VITE_FIREBASE_*`) para que la app
buildeada apunte al proyecto correcto. Los valores salen de: Firebase Console
→ proyecto correspondiente → ⚙️ **Project settings** → pestaña **General** →
sección **Your apps** → app web → **SDK setup and configuration** → "Config".

Sufijo `_DEV` = proyecto `quesarte-uy-dev` (se usa en los previews de PR).
Sin sufijo = proyecto `quesarte-uy` (producción, se usa en push a `main`).

| Variable | Proyecto | Campo del SDK config |
|---|---|---|
| `VITE_FIREBASE_API_KEY_DEV` | quesarte-uy-dev | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN_DEV` | quesarte-uy-dev | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID_DEV` | quesarte-uy-dev | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET_DEV` | quesarte-uy-dev | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID_DEV` | quesarte-uy-dev | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID_DEV` | quesarte-uy-dev | `appId` |
| `VITE_FIREBASE_API_KEY` | quesarte-uy | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | quesarte-uy | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | quesarte-uy | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | quesarte-uy | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | quesarte-uy | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | quesarte-uy | `appId` |

Estos son los mismos 6 campos que `apps/quesarte/.env.example` pide para
desarrollo local, pero cargados dos veces (dev y prod) como variables de
repo en vez de archivos `.env`.

## Qué dispara cada job

- **Push a `main`** (que toca `apps/quesarte/**`, `packages/**`,
  `pnpm-lock.yaml`, `turbo.json` o `package.json`): `verificar` →
  `deploy-prod` (deploy de `firestore.rules` + `firestore.indexes.json` y de
  Hosting a `quesarte-uy`, canal `live`).
- **Pull request** con los mismos paths: `verificar` → `deploy-preview`
  (deploy de `firestore.rules` + `firestore.indexes.json` y de un canal de
  preview de Hosting, ambos contra `quesarte-uy-dev`, con comentario
  automático del bot en el PR con la URL).
- Un push/PR que no toca ninguno de esos paths no dispara el workflow.

## Notas

- Mientras no se carguen los secrets, los jobs `deploy-preview` /
  `deploy-prod` van a fallar (la action de Firebase no puede autenticarse).
  `verificar` sigue funcionando igual.
- Mientras no se carguen las variables `VITE_FIREBASE_*`, el build de los
  jobs de deploy va a compilar igual (la validación de esas env es en
  runtime, no en build) pero la app deployada quedará sin config de Firebase
  válida — inútil en producción. Cargar las 12 variables antes del primer
  deploy real.
