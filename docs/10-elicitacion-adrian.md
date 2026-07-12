# 10 — Sesión de elicitación con Adrián (guía)

Objetivo: definir el rumbo post-fidelización con datos reales del mostrador,
no con supuestos nuestros. Esta sesión DESBLOQUEA decisiones marcadas en otros
docs (mapa al final) y descubre lo que no sabemos que no sabemos.

## Método (leer antes de la sesión)

1. **Observar antes de preguntar.** La parte más valiosa no es la charla: es
   mirar 30-45 min de ventas reales, idealmente **en la feria un sábado** (es
   el contexto más exigente); si se puede, presenciar también la preparación
   de un pedido a domicilio. Anotar cada venta: qué pidió el cliente, qué hizo
   Adrián físicamente (qué pieza agarró y POR QUÉ esa), qué pesó, qué
   tipeó/anotó, cómo calculó el precio, cómo cobró. El orden de los
   movimientos de sus manos vale más que cualquier respuesta.
2. **Preguntas abiertas primero, opciones después.** "¿Cómo hacés X?" antes
   que "¿preferís A o B?". Si le mostramos la solución antes de entender el
   problema, va a decir que sí a todo.
3. **Capturar SU vocabulario** (¿le dice horma, rueda, pieza? ¿fraccionar,
   cortar?). La UI debe hablar como él.
4. **No prometer features en vivo.** Anotar, decir "buenísimo, lo anoto", y
   priorizar después en frío.
5. Cerrar con priorización forzada (sección 8): que ÉL ordene, no nosotros.
6. Duración realista: 30-45 min de observación + 60-75 min de conversación.
   Si no da el tiempo, priorizar secciones 1, 2 y 8.

---

## 1. Flujo de venta al peso (DESBLOQUEA doc 09 §A) 🔑

**Pregunta previa a todo — ¿piezas o kilos?** Antes de discutir CÓMO elegir
piezas, validar si las piezas individuales le importan en absoluto, o si
piensa en agregado ("tengo tantos kg de dambo"). El modelo ya soporta ambos
(doc 02: `fraccionado_por_pieza` vs `granel`); esto decide qué modo se asigna
a cada producto, no la arquitectura.

- ¿Pensás en hormas individuales o en "me quedan tantos kilos de dambo"?
- ¿Las hormas de una misma compra vencen igual o distinto? ¿Alguna vez
  necesitaste saber CUÁL horma era (vencimiento, un lote que salió malo,
  reclamo al proveedor)?
- Cuando comprás, ¿la boleta lista el peso de cada horma o solo kilos totales?
- **La pregunta decisiva (hacerla honesta)**: si al volver de Colonia
  tuvieras que cargar cada horma con su peso en la app, ¿lo harías siempre, o
  a la tercera vez cargarías "30 kg de dambo" y chau? No hay respuesta
  incorrecta: piezas que no se cargan bien son peores que agregado bien
  llevado.
- ¿Y los embutidos? ¿El cliente elige "ese salame" en particular o da igual
  cuál? (define si `pieza_entera` sobrevive aunque los quesos vayan a granel)

La pregunta madre operativa: **cuando un cliente pide "1 kilo de dambo", ¿qué
hacés, paso por paso, con las manos?**

- ¿Elegís vos la pieza o el cliente señala una? ¿Por qué esa? (¿la más vieja,
  la más chica, la que está abierta, la de arriba?)
- ¿Cortás intentando clavar el kilo, o cortás "más o menos" y va lo que salió?
  ¿Cuánto de más/de menos acepta un cliente típico? ¿Alguien se queja por 950 g?
- ¿Pesás ANTES de saber el precio o el cliente pide "por plata" ("dame $500 de
  queso")? ¿Con qué frecuencia pasa cada caso?
- Si queda una punta chica de la horma, ¿qué hacés con ella? ¿La ofrecés más
  barata? ¿La regalás? ¿Va a merma?
- **La balanza**: ¿qué balanza tiene? ¿Solo pesa, o calcula precio? ¿Imprime
  ticket/etiqueta? ¿Le carga precios por memoria/PLU?
  - Si la balanza calcula el precio → evaluar si en el POS conviene poder
    tipear el PRECIO y derivar el peso (o ambos), en vez de solo peso.
- ¿Cuántas piezas del mismo queso suele tener abiertas a la vez? ¿Abre una
  nueva con otra empezada?

**Decisiones que salen de acá**: primero, la granularidad POR PRODUCTO —
qué queda en `fraccionado_por_pieza`, qué pasa a `granel` (agregado en kg) y
si `pieza_entera` se mantiene para embutidos; puede ser mixto (quesos caros
con vencimiento por horma, rotación rápida a granel) o todo agregado. Recién
después, y solo si sobreviven las piezas: si el flujo es pieza-primero, el
§A del doc 09 se convierte en selector manual rápido + sugerencia visual de
"la más vieja"; si es peso-primero, aplica el algoritmo candidato y falta
calibrar tolerancia. Definir también si el input principal del POS es peso,
precio o ambos.

## 1b. Los dos modos: feria y pedidos a domicilio 🔑

Confirmado antes de la sesión: vende en **feria** (sábados, quizás otro día)
donde los clientes piden en el momento y hay que atender rápido, y por
**pedidos telefónicos con entrega a domicilio**, más tranquilos. Son dos
operaciones distintas; la app debe servir a las dos sin que una arruine a la
otra.

**Feria:**
- ¿Qué llevás a la feria? ¿Todo el stock o una selección? ¿Cómo decidís qué
  y cuánto llevar? ¿Volvés con mucho?
- ¿El stock de la feria y el de los pedidos es el mismo? ¿Dónde vive la
  mercadería el resto de la semana? (¿cámara/heladera en casa, depósito?)
- ¿Te ayuda alguien en la feria? ¿Cuánta gente atendés a la vez en el pico?
- ¿Cómo anda la señal de celular en la feria? (crítico para nosotros)
- ¿Con qué cobrás ahí? (efectivo, transferencia, POS de tarjeta) ¿Usás
  precios redondos para agilizar?
- ¿Qué anotás HOY durante la feria, si algo? ¿O reconstruís al final del día?
- Al terminar: ¿contás lo que quedó? ¿Cómo sabés cuánto vendiste?

**Pedidos a domicilio:**
- ¿Por dónde llegan? (llamada, WhatsApp texto, audios) ¿Cómo los anotás hoy?
  (pedir VER cómo: cuaderno, chats fijados, memoria)
- ¿Cuándo los preparás? ¿Pesás y etiquetás por pedido?
- Si piden "1 kg" y al pesar salió 1,050: ¿cobrás lo que salió? ¿Avisás el
  total antes de salir a repartir?
- ¿Cuándo y cómo cobrás? (efectivo al entregar, transferencia previa/posterior)
  ¿Fiás? ¿Existe cuenta corriente informal con alguno?
- ¿Cuántos pedidos por semana? ¿Días fijos de reparto? ¿Armás recorrido?
- ¿Hay pedidos recurrentes ("todas las semanas lo mismo")?

**Sale de acá**: si "Pedidos" es un módulo de primera clase (pedido: tomado →
preparado → en reparto → entregado/cobrado, siempre ligado a cliente), cómo
descuenta stock (¿al preparar o al entregar?), si hace falta noción de
ubicación de stock (casa vs. feria) o alcanza con uno solo, y si el POS
necesita un "modo feria" aún más ágil. Disciplina: NO diseñar el módulo en la
sesión; entender el flujo y sus dolores.

## 2. Merma y precios (DESBLOQUEA doc 03 ajuste + pregunta 1 del doc 09)

- ¿Sabés cuánto "pierde" cada tipo de queso entre que lo comprás y lo terminás
  de vender (secado, corteza, puntas)? ¿Tenés un número, aunque sea a ojo?
- Cuando ponés el precio de venta, ¿pensás en esa pérdida? ¿Cómo calculás el
  precio hoy? (¿costo × algo? ¿mirás la competencia? ¿redondeás a qué?)
- ¿El costo del viaje a Colonia lo tenés presente al poner precios, o "va
  aparte"?
- ¿Cambiás precios cuando sube el costo, o aguantás? ¿Cada cuánto los revisás?

**Sale de acá**: si existe `mermaEsperadaPct` y cómo se redondean los precios
sugeridos (múltiplos de $5, $10, terminación en 9…).

## 3. Stock hoy (valida doc 02)

- ¿Cómo sabés hoy cuánto queso tenés? ¿Contás? ¿Cada cuánto? ¿A ojo?
- ¿Alguna vez te quedaste sin algo sin darte cuenta? ¿Qué producto? ¿Qué
  costó eso?
- ¿Controlás vencimientos? ¿Cómo? ¿Perdiste mercadería por vencimiento?
- ¿Los frutos secos y especias los fraccionás vos en bolsitas de antemano, o
  pesás en el momento? (Si pre-fracciona → quizás son unidades, no granel:
  impacta el modelo del doc 02.)

## 4. Compras y viajes (valida doc 03 + inteligencia doc 07)

- ¿Cada cuánto viajás a Colonia? ¿Y al mayorista? ¿Qué te hace decidir "ya
  tengo que ir"?
- ¿Cómo decidís cuánto traer de cada cosa? ¿Te pasó de traer de más y que se
  pierda, o de menos y quedarte corto?
- ¿Le comprás siempre a los mismos? ¿Cuántos proveedores reales tenés?
- ¿Cómo pagás? (transferencia, efectivo) — valida los campos de proveedores.

## 5. Clientes y WhatsApp (valida docs 07 y 08)

- ¿Conocés a tus clientes habituales por nombre? ¿Cuántos dirías que son?
- ¿Ya usás WhatsApp con clientes? ¿Para qué? (los pedidos se cubren en §1b;
  acá interesa lo demás: avisos, consultas, "¿te queda X?")
- ¿Tenés sus números guardados? ¿Dónde?
- Mostrarle (recién acá) los 3 mensajes seed del doc 08 y pedirle que los
  reescriba con sus palabras.

## 6. Dispositivo y local (restricciones físicas del doc 06)

- ¿Con qué va a usar la app en el mostrador? (¿su celular? ¿una tablet fija?
  ¿qué modelo/tamaño?)
- ¿Cómo es el internet del local? ¿Se corta seguido?
- ¿Atiende solo o hay alguien más? ¿Esa persona usaría la app? (valida el rol
  `vendedor` y si la gestión de usuarios importa ya)
- ¿Manos libres/sucias al atender? (guantes, manos húmedas → afecta targets y
  si conviene voz/toques grandes)

## 7. Lo que no preguntamos

- "Si esta app te ahorrara UNA sola molestia de tu día, ¿cuál elegirías?"
- "¿Qué anotás hoy en papel/cuaderno/celular?" (pedirle VER el cuaderno: ahí
  está el sistema real)
- "¿Hay algo que un cliente te pide seguido y no podés responder?" (ej. "¿te
  queda X?" por teléfono)

## 8. Cierre: priorización forzada

Cartitas (papel o lista) con las features candidatas, en su idioma, y que las
ordene él solo explicando en voz alta:

1. Saber cuánto tengo de cada cosa sin contar
2. Avisos de vencimiento
3. Saber cuánto GANO de verdad (con viaje incluido)
4. Lista para el próximo viaje (qué y cuánto traer)
5. Mensajes de WhatsApp listos para mandar (pedido pronto, hace mucho no
   venís)
6. Ficha de clientes (qué compra cada uno)
7. Fotos en las cards de venta
8. Gestión de pedidos a domicilio (tomarlos, prepararlos, repartir, cobrar)
9. Control de bolsas/tarros/insumos

Regla: nosotros NO opinamos durante el ordenamiento. El resultado manda sobre
nuestro roadmap (doc 04) salvo dependencias técnicas.

---

## Mapa de decisiones bloqueadas → dónde impactan

| Pregunta | Desbloquea |
|---|---|
| §1 piezas vs kilos / flujo / balanza | granularidad de stock POR PRODUCTO (pieza vs granel, doc 02), destino del doc 09 §A, input peso/precio del POS |
| §1b feria y pedidos | posible **módulo Pedidos** (doc nuevo), "modo feria" del POS, si hace falta ubicación de stock, momento de descuento de stock |
| §2 merma y redondeo | doc 03 (precio sugerido), `mermaEsperadaPct`, redondeo comercial |
| §3 fraccionado previo de granel | doc 02 (modoStock de frutos secos/especias) |
| §4 ritmo de viajes | doc 07 (parámetros de compra sugerida) |
| §5 uso actual de WhatsApp | doc 08 (plantillas y puntos de contacto reales) |
| §6 dispositivo | doc 06 (validar supuestos de mostrador) |
| §8 priorización | doc 04 (orden del roadmap post-08) |

## Registro de resultados

Después de la sesión, crear `docs/10b-resultados-elicitacion.md` con: fecha,
respuestas por sección, vocabulario capturado, decisiones tomadas (cada una
con "decisión + evidencia que la respalda"), y features nuevas descubiertas.
Ese doc es la fuente para actualizar 02, 03, 04, 06 §6, 09 §A.
