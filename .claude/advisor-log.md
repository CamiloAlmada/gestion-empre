# Log de consultas al advisor

El `advisor` **no recuerda sus consultas previas**: cada invocación arranca en
frío y puede contradecirse a sí mismo sin notarlo. Este archivo es esa memoria,
y vive acá —no en el contexto de la sesión— para sobrevivir a una compactación.

Lo mantiene el orquestador. Se escribe **inmediatamente después** de cada
respuesta del `advisor`, no al final de la tarea.

A partir de la segunda llamada de una tarea, el brief abre con el bloque
CONSULTAS PREVIAS armado desde acá (ver `CLAUDE.md`, «Protocolo del advisor»).

Formato de cada entrada:

```
## <tarea> — llamada <N> (<temprano | cierre | trabado | desempate | post-mortem>)
Fecha: AAAA-MM-DD

**Se le preguntó:** una o dos frases.

**RECOMENDACIÓN:** textual, sin parafrasear.
**SUPUESTOS:** textual.
**BLOQUEANTES:** textual.

**Qué se hizo después:** qué se implementó, qué se descartó y por qué.
**Divergencias:** en qué difiere lo hecho de lo que el advisor asumió.
```

Textual, no parafraseado: el objetivo es que el `advisor` reciba de vuelta sus
propias palabras y pueda detectar si se está contradiciendo.

---

_(sin entradas todavía)_
