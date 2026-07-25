# Reseteo de datos operativos (`reset-operativo.mjs`) — tarea A5

Deja la base de un proyecto Firebase **lista para que el dueño arranque de cero**:
borra los datos operativos (que hoy son pruebas del desarrollador) y pone en cero
los contadores que quedarían "recordando" lo borrado, **conservando** la
configuración y el catálogo del negocio.

Se corre **una sola vez por proyecto**, antes de entregarle el sistema a Adrián.
Después del reseteo, todo lo que se genere nace con el costeo congelado por ítem
(`costeo`, `packages/core/src/costeo.ts`), que es el motivo por el que esta
limpieza existe: mezclar ventas viejas sin costo con ventas nuevas congeladas
haría que los reportes de Fase 3 mientan sin que nadie pueda detectarlo.

## Archivos

| Archivo               | Qué es                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resetPlan.mjs`       | Módulo **puro** (sin Firebase, sin red, sin `fs`): catálogo de colecciones con su justificación, parseo de argumentos, cálculo de los parches de contadores derivados y (de)serialización del backup. |
| `resetPlan.test.mjs`  | Tests de todo lo anterior. Es la única verificación posible del criterio "qué se borra / qué se conserva": contra Firestore real no se puede probar, porque borrar es irreversible.                   |
| `reset-operativo.mjs` | El **shell**: guardrails de proyecto, confirmación, backup, batches, verificación final y log. Sin lógica de decisión propia.                                                                         |

Misma separación que el seed de demo (`generador.mjs` + `mapeoAdmin.mjs` puros,
`seed-demo.mjs` shell).

## Qué toca y qué no

| Colección       | Acción                                                        | Por qué                                                                                                                          |
| --------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ventas`        | **BORRAR**                                                    | Dato operativo (doc 02 "Venta").                                                                                                 |
| `movimientos`   | **BORRAR**                                                    | Auditoría de las operaciones que se borran (doc 02).                                                                             |
| `piezas`        | **BORRAR**                                                    | ES el stock físico de los productos por pieza (doc 02).                                                                          |
| `compras`       | **BORRAR**                                                    | Compras de prueba, borradores y confirmadas (doc 03).                                                                            |
| `clientes`      | conservar, **resetear `stats`**                               | El cliente es dato del negocio; `stats` es cache denormalizado de las ventas (doc 07, decisión 5).                               |
| `productos`     | conservar, **resetear stock agregado y `costoPromedioCents`** | El catálogo es dato del negocio; el stock granel/unidad y el costo promedio son derivados de compras y ventas (doc 02, "Notas"). |
| `usuarios`      | intacta                                                       | Sin ella el dueño no entra.                                                                                                      |
| `categorias`    | intacta                                                       | Vocabulario del catálogo, sin campos derivados.                                                                                  |
| `proveedores`   | intacta                                                       | Datos de contacto y pago; su historial se calcula leyendo compras, no se cachea.                                                 |
| `configuracion` | intacta                                                       | `general`, `tema` y `plantillasWhatsApp`: es lo que el dueño ya dejó configurado.                                                |

La lista vive en el propio código (`resetPlan.mjs` → `COLECCIONES_A_BORRAR` /
`COLECCIONES_A_RESETEAR` / `COLECCIONES_A_CONSERVAR`), cada entrada con su motivo,
y hay un test que verifica que cubra exactamente las 10 colecciones del modelo.

**Si Firestore tiene una colección que no está en esa lista, el script se planta**
(no sabe si es dato o basura). Nunca la borra; hay que revisarla a mano y, si se
confirma que puede ignorarse, repetir con `--permitir-desconocidas`.

Detalle de los contadores:

- `clientes.stats` se reescribe entero como `{cantidadVentas: 0, totalHistoricoCents: 0}`
  — eso también elimina `primeraCompra`/`ultimaCompra`, y deja el mismo shape con
  el que nace un cliente en `firestore.rules` (`clienteAltaValida`).
- `productos`: `costoPromedioCents` → 0 (cero o ausente significa "sin base de
  costo" en el resto del sistema, que es la verdad después de borrar las compras);
  `stockGranelGramos` / `stockUnidades` → 0 **solo si el campo ya existe** (un
  campo ausente no recuerda nada, así que no se crea); `actualizadoEn` se refresca
  solo si el documento efectivamente cambió.
- No se toca **Firebase Auth**: los usuarios de prueba siguen existiendo como
  cuentas. Si hay que dar de baja alguno, se hace desde la pantalla de Usuarios.

## Salvaguardas (por qué es difícil hacer daño con esto)

1. **Dry-run por defecto.** Sin `--ejecutar` solo lee e informa: no crea el
   directorio de backup ni escribe un byte.
2. **`--project` obligatorio, sin default.** Un default que apunte a producción es
   justamente el accidente a evitar.
3. **Doble señal de proyecto** (mismo patrón que el "GUARDRAIL DURO" de
   `seed-demo.mjs`): el `--project` declarado tiene que coincidir **exactamente**
   con el `projectId` que se desprende de las credenciales activas, resuelto
   **localmente y sin red** _antes_ de inicializar `firebase-admin`. A diferencia
   del seed —que tiene una allowlist fija de `quesarte-uy-dev`— acá el objetivo
   legítimo puede ser prod, así que no hay allowlist: hay coincidencia exacta o
   aborto.
4. **Confirmación tipeada.** Con `--ejecutar`, después del resumen hay que tipear
   el projectId completo. **Sin TTY no corre**: no hay bypass no-interactivo.
5. **Backup primero.** Se exporta la base entera a JSON, se relee del disco y se
   verifican los conteos. Si algo falla, no se borra nada.
6. **Colección desconocida ⇒ aborta** (ver arriba).
7. **Idempotente.** Solo escribe los documentos que realmente cambian: la 2ª
   corrida reporta `0 documentos borrados, 0 con contadores reseteados`.
8. **Log en disco** al lado del backup, con los conteos antes/después.

Se lee la base una sola vez y se borra exactamente eso: si alguien registrara una
venta entre la lectura y la confirmación, ese documento no entra al backup y por
lo tanto **tampoco se borra** (el error cae siempre del lado de conservar), y la
verificación final lo detecta y sale con código 1. Aun así, esto se corre con el
negocio parado: es un reseteo previo a la entrega.

## Credenciales

Igual que el seed: Application Default Credentials para el proyecto objetivo.

1. **Service account key** (recomendado — el guardrail lee su `project_id`):
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/service-account-quesarte-uy.json
   ```
   Se descarga en la consola de Firebase → _Configuración del proyecto_ →
   _Cuentas de servicio_ → _Generar nueva clave privada_. Es un archivo con
   permisos de administrador sobre esa base: **no se commitea** y se borra del
   disco cuando termina la operación.
2. `gcloud auth application-default login` **+** `export GOOGLE_CLOUD_PROJECT=<projectId>`
   (las credenciales de usuario no traen `project_id` embebido).

## Uso

Desde `apps/quesarte/`:

```bash
# 1. Dry-run (default): dice qué borraría, cuántos documentos y contra qué proyecto.
pnpm run reset:operativo -- --project quesarte-uy-dev

# 2. Ensayo completo en DEV primero. Siempre.
pnpm run reset:operativo -- --project quesarte-uy-dev --ejecutar

# 3. Recién después, producción (pide tipear el projectId).
pnpm run reset:operativo -- --project quesarte-uy --ejecutar

# Dónde dejar backup y log (default: ./backups)
pnpm run reset:operativo -- --project quesarte-uy --ejecutar --backup-dir ~/backups-quesarte
```

El `--` después del nombre del script es de pnpm: separa sus flags de los del
script. Hay **un solo** comando declarado en `package.json` (no hay un
`reset:operativo:ejecutar`): el flag destructivo se tipea a mano, a propósito.

Los archivos que quedan:

```
backups/reset-<projectId>-<timestamp>.json      ← backup completo (todas las colecciones)
backups/reset-<projectId>-<timestamp>.log.txt   ← log de la corrida
```

El backup **no se commitea**: contiene datos personales de clientes. Guardalo
fuera del repo hasta confirmar que el sistema quedó bien.

## Cómo restaurar si algo sale mal

El mismo script restaura desde un backup (también con dry-run por defecto):

```bash
# Qué reescribiría (no escribe nada):
pnpm run reset:operativo -- --project quesarte-uy --restaurar backups/reset-quesarte-uy-<ts>.json

# Restaurar de verdad:
pnpm run reset:operativo -- --project quesarte-uy --restaurar backups/reset-quesarte-uy-<ts>.json --ejecutar
```

Detalles importantes:

- Reescribe cada documento del backup **con su id original**, así que las
  referencias (`venta.items[].piezaId`, `pieza.compraId`, `venta.clienteId`)
  siguen siendo válidas.
- El backup guarda los `Timestamp` con marcador de tipo explícito
  (`{"__tipo__":"timestamp", ...}`), no como texto suelto: las fechas vuelven
  como `Timestamp`, no como string. Cualquier tipo de dato que el script no sepa
  reconstruir hace **fallar el backup** (y por lo tanto aborta el borrado) en vez
  de perderlo silenciosamente.
- La restauración **no borra** documentos creados después del backup: si el
  negocio ya empezó a operar, primero hay que ver qué se creó desde entonces.
- Solo restaura sobre el **mismo** proyecto del que se tomó el backup (lo verifica
  contra `meta.projectId` del archivo).

## Cómo se probó

El módulo puro está cubierto por `resetPlan.test.mjs` (`pnpm test`, 40 casos):
catálogo, parseo de argumentos, idempotencia de los parches, round-trip del
backup por JSON y verificación del archivo escrito.

El shell se probó de punta a punta contra el **emulador de Firestore** (nunca
contra un proyecto real), con datos sembrados en las 10 colecciones más una
colección desconocida:

```bash
pnpm exec firebase emulators:exec --only firestore --project demo-reset "<script de e2e>"
```

Verificado en esa corrida: dry-run sin escribir nada; aborto por colección
desconocida; aborto por projectId mal tipeado; aborto sin TTY; ejecución real
(backup verificado de 27 documentos → 12 borrados → 5 con contadores reseteados →
verificación final en cero); 2ª corrida idempotente (0 y 0); y restauración
completa desde el backup, con las `stats` y las fechas de los clientes,
los `Timestamp` y los mapas anidados de los ítems de venta vueltos a su valor
original.

**Nunca se corrió contra `quesarte-uy` ni `quesarte-uy-dev`.** Esa ejecución la
hace una persona.
