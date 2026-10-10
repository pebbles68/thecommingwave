# Revisión de ingeniería de software — Correcciones 02

## 1. Objeto de la revisión

Este documento recoge la segunda revisión técnica del proyecto **The Coming Wave Companion** después de la implementación de las incidencias `COR-001` a `COR-008` registradas en `correcciones.md`.

La revisión se ha realizado con cuatro objetivos:

1. comprobar que las correcciones anteriores están realmente presentes en el código;
2. verificar su comportamiento mediante pruebas automatizadas;
3. volver a auditar las fases 0 a 8 contra el estado real del repositorio, `AGENTS.md`, `ROADMAP.md` y `development_status.md`;
4. identificar defectos funcionales, incumplimientos de arquitectura, carencias de prueba y discrepancias documentales que impidan considerar una fase cerrada con garantías.

Fecha de revisión: **2026-09-28**  
Rama revisada: **`master`**  
Commit de referencia: **`af909a4`**

## 2. Resumen ejecutivo

Las ocho correcciones de `correcciones.md` están incorporadas al repositorio y la base de pruebas es estable:

- `npm test`: **234 pruebas superadas de 234**.
- `npm run test:e2e`: **9 pruebas superadas de 9**.
- La ejecución E2E requirió instalar previamente el navegador de Playwright mediante `npx playwright install chromium`, requisito que ya está documentado en el proyecto.

No obstante, el resultado global de la auditoría es **conforme solo de forma parcial** con `AGENTS.md`. No puede afirmarse que todas sus reglas se cumplan en el código actual.

Los principales motivos son:

- cambiar de banda de día elimina todo el progreso de la banda actual sin confirmación, historial ni recuperación;
- el turno guiado funciona como un conjunto de listas navegables, pero no como la máquina de estados secuencial exigida;
- el cierre de fase solo detecta subfases pendientes y desconoce resoluciones o acciones en curso;
- el modo validado del wizard aún solicita manualmente propiedades que ya se conocen por el plan seleccionado, por lo que admite respuestas contradictorias;
- se ofrecen métodos balísticos y de espacio cercano aunque el flujo no puede completar su asignación de daño;
- varias reglas y valores fijos permanecen incrustados en JavaScript en contra del principio «datos antes que lógica hardcodeada»;
- el inventario y la trazabilidad de fuentes no están cerrados de forma verificable;
- `ROADMAP.md`, `development_status.md` y `data/sources/sources.json` contienen afirmaciones obsoletas o contradictorias;
- la Fase 8 está explícitamente abierta según su propio criterio de salida.

### Recomendación de estado de las fases 0 a 8

| Fase | Estado declarado | Estado recomendado tras la revisión | Motivo principal |
|---|---|---|---|
| 0 — Fuentes | Cerrada | **Reabrir** | Inventario incompleto y trazabilidad no validada contra un registro canónico. |
| 1 — Esqueleto | Cerrada | **Aceptada con observaciones** | La navegación base existe y funciona. |
| 2 — Turno | Cerrada | **Reabrir** | Pérdida de progreso y ausencia de una máquina de estados secuencial completa. |
| 3 — Ayudas | Cerrada | **Aceptada con deuda documental** | Funcionalidad disponible, pero metadatos de fuentes obsoletos. |
| 3.5 — Diseño | Cerrada | **Aceptada condicionada** | La cobertura 198/198 no está protegida por un test de igualdad de conjuntos. |
| 4 — Detección | Cerrada | **Reabrir por arquitectura** | Reglas, textos y umbrales fijos siguen hardcodeados en JavaScript. |
| 5 — Tablas | Cerrada | **Aceptada con observaciones** | El motor genérico funciona; falta completar la separación declarativa de algunas reglas auxiliares. |
| 6 — Router | Cerrada | **Aceptada con limitación conocida** | El árbol termina de forma determinista; quedan saltos condicionales fuera del modelo general. |
| 7 — Vertical slice | Cerrada | **Reabrir parcialmente** | Selección validada incompleta y métodos ofrecidos sin resolución final de daño. |
| 8 — Defensa AA | No cerrada en el roadmap | **Abierta** | No cumple el criterio de reutilización entre ataques. |

## 3. Validación de las correcciones anteriores

| Corrección | Resultado de revisión | Observación |
|---|---|---|
| COR-001 — progreso independiente por campaña | **Validada** | El esquema v2 usa `processRuns` y `runKey = processId:occurrence`; Campaña 1 y Campaña 2 tienen estado independiente. |
| COR-002 — cierre de fase con pendientes | **Validada parcialmente** | Detecta subfases pendientes y registra el cierre anticipado, pero `pendingResolutions` está siempre vacío y `blockReason` siempre es `null`. |
| COR-003 — URL malformada | **Validada** | El servidor devuelve un error controlado y no termina el proceso. |
| COR-004 — pruebas E2E reales | **Validada** | Playwright ejecuta nueve casos en Chromium y todos pasan. |
| COR-005 — descomposición de `app.js` | **Validada con deuda residual** | `app.js` quedó reducido a 216 líneas; persisten vistas de dominio excesivamente grandes. |
| COR-006 — reconciliación de Fase 2 | **Validada parcialmente** | Se corrigió el estado documentado de Fase 2, pero la documentación global vuelve a contener datos obsoletos. |
| COR-007 — selección de unidad y plan | **Validada parcialmente** | Unidad, plan, método, valor y alcance se derivan, pero otras propiedades derivables siguen siendo preguntas manuales. |
| COR-008 — panel de ayuda accesible | **Validada** | El diálogo modal, el foco, el cierre por teclado y el aislamiento del fondo están cubiertos por E2E. |

## 4. Correcciones requeridas

### COR02-001 — Evitar pérdida silenciosa del progreso al cambiar de banda

**Prioridad:** Alta  
**Tipo:** Integridad de estado / UX  
**Fases afectadas:** 2  
**Estado:** Resuelta (2026-09-28)

#### Evidencia

`public/js/turn-progress-engine.js:157-163` implementa el cambio de banda sustituyendo `processRuns` por un objeto vacío. Los botones de `public/js/views/turn.js:33-44` llaman directamente a esa operación, sin diálogo de confirmación ni comprobación de actividad previa.

El comportamiento está además fijado por el test `test/turn-progress-engine.test.js:108-121`, que comprueba que se reinicie el progreso de todas las repeticiones.

#### Problema

Un toque accidental en «Banda anterior» o «Siguiente banda» borra fases terminadas, fases omitidas y subfases completadas. El usuario no recibe advertencia, no se crea un evento de historial y no existe deshacer.

Esto incumple los principios de navegación reversible e historial reproducible de `AGENTS.md` §§1, 6 y 10.

#### Corrección solicitada

Separar conceptualmente «consultar otra banda» de «iniciar una banda nueva». Se recomienda almacenar el progreso por banda, por ejemplo:

```text
bandRuns[bandIndex].processRuns[runKey]
```

Si por decisión de producto debe mantenerse el reinicio, este deberá ser una acción explícita y destructiva:

- mostrar el resumen del progreso que se perderá;
- solicitar confirmación únicamente si existe actividad;
- registrar un evento de historial con banda origen, banda destino y motivo;
- permitir cancelar sin modificar el estado;
- ofrecer restauración o conservar una instantánea de la banda anterior.

#### Criterios de aceptación

- Cambiar de banda no destruye datos sin confirmación explícita.
- Cancelar conserva exactamente el estado anterior.
- Volver a una banda recupera su progreso si se adopta persistencia por banda.
- El historial registra el cambio o reinicio.
- Existen tests unitarios y E2E para banda vacía, banda con progreso, cancelación y restauración.

#### Cierre

- **Fecha:** 2026-09-28.
- **Decisión de producto:** a petición explícita del mantenedor, se adoptó la primera vía de la corrección solicitada — persistir el progreso por banda (`bandRuns[bandIndex].processRuns[runKey]`) — en vez de mantener el reinicio con confirmación explícita.
- **Pruebas ejecutadas:** `npm test` → **247/247 OK** (245 + 2 nuevas: `changeBand` no destruye la banda de origen ni ninguna otra; volver a una banda ya visitada recupera exactamente su progreso — además de actualizar las 2 pruebas de migración v1/v2 que asumían el esquema anterior). `npm run test:e2e` → **13/13 OK** (1 nueva: recorrido real en el navegador que termina una fase en la banda 1, navega a la banda 2 —comprobando que empieza vacía—, vuelve a la banda 1 y confirma que "Proceso Estratégico" sigue "En curso" y "Fase de Crisis" sigue "✓ Completada"). Verificado además manualmente en el navegador (sin errores de consola): terminar la Fase de Crisis en la banda 1, pasar a la banda 2 (vacía, como debe ser — es una banda nunca visitada), y volver a la banda 1 recupera el progreso intacto.
- **Documentación actualizada:** este archivo, `roadmap.md` (nueva Fase 20 — backlog de `correcciones.02.md`), `development_status.md`.

#### Diseño implementado

Esquema v3 en `public/js/turn-progress-engine.js`: `{ schemaVersion: 3, currentBand, bandRuns: { [bandIndex]: { processRuns: { [runKey]: run } } } }`. Como ninguna ruta de la aplicación incluye la banda en la URL, "banda actual" (`progress.currentBand`) sigue siendo el concepto operativo de navegación — `getRun`/`finishPhase`/`skipPhase`/`finishSubphase` siguen teniendo exactamente las mismas firmas que antes (`(progress, runKey, ...)`), pero ahora leen/escriben implícitamente en `bandRuns[progress.currentBand]` en vez de en un único `processRuns` global. Esto mantuvo el cambio acotado a `turn-progress-engine.js`: ni `storage.js` ni `views/turn.js` necesitaron ningún cambio, porque sus firmas de llamada no cambiaron.

`changeBand(progress, delta, maxBand)` deja de vaciar nada: solo cambia `currentBand` dentro del rango `[1, maxBand]`. Una banda nunca visitada se crea de forma perezosa (`emptyBandRun()`) en el primer `finishPhase`/`skipPhase`/`finishSubphase` que escribe en ella, no al cambiar de banda — así que "banda nueva" y "banda vacía" son lo mismo sin necesitar inicialización explícita. Como cambiar de banda ya no destruye nada, no hace falta ningún diálogo de confirmación (la alternativa que sí lo habría necesitado era la otra vía propuesta, no la elegida).

Migración: v1 (plano) → v3 directamente (antes iba v1→v2), asignando todo lo migrado a `currentBand` — la única banda que el esquema v1 podía conocer en la práctica, con la misma política conservadora ya aplicada en COR-001 para las ocurrencias del Proceso de Campaña (nunca se asume progreso de otra banda que la fuente no distinguía). v2 (`processRuns` global) → v3 anida ese único `processRuns` bajo `currentBand`, por el mismo motivo: en v2 nunca pudo sobrevivir progreso de una banda distinta a la actual (su propio `changeBand` lo vaciaba), así que no hay nada más que recuperar.

---

### COR02-002 — Convertir el turno guiado en una máquina de estados real

**Prioridad:** Alta  
**Tipo:** Arquitectura funcional  
**Fases afectadas:** 1 y 2  
**Estado:** Resuelta (2026-09-28) — **⚠️ Revocada por decisión de producto posterior (2026-09-28, `correcciones03.md`):** el turno guiado debe ser de uso libre, no secuencial. La implementación de abajo fue correcta según el `AGENTS.md` vigente en su momento; no es un defecto suyo, es un cambio de criterio de producto. Corrección de código de vuelta: `correcciones03.md#COR03-001`. Ver §9 "Cierre de este documento" al final de este archivo.

#### Evidencia

`public/js/views/turn.js:58-76` presenta todas las ocurrencias como tarjetas accesibles. `public/js/views/turn.js:103-113` hace lo mismo con todas las fases de un proceso. El estado persistido conserva listas de elementos terminados u omitidos, pero no mantiene un nodo actual ni aplica transiciones `next`/`previous`.

`public/js/turn-progress-engine.js:169-209` ordena procesos, fases y subfases, pero no valida que una transición respete ese orden. Es posible iniciar o terminar Campaña 2 antes de Campaña 1 y acceder a cualquier fase sin haber resuelto la anterior.

#### Problema

La implementación actual es un checklist navegable, no la máquina de estados configurable descrita en `ROADMAP.md` Fase 2 y `AGENTS.md` §6. Tampoco existe la acción funcional «avanzar al siguiente nodo» requerida por esa sección.

#### Corrección solicitada

Modelar explícitamente:

- `currentBand`;
- `currentRunKey`;
- `currentNodeId`;
- transiciones permitidas hacia el nodo siguiente y anterior;
- condiciones de entrada y salida;
- fases opcionales y motivo de omisión;
- estados `not-started`, `current`, `completed`, `skipped` y `closed-early`.

La consulta de fases futuras puede mantenerse, pero debe diferenciarse de la ejecución de la secuencia. No debe ser posible mutar el estado de una fase fuera de secuencia sin una acción excepcional, explícita y registrada.

#### Criterios de aceptación

- La plantilla define o permite derivar transiciones inequívocas.
- Existe un único nodo actual por ejecución.
- «Siguiente» y «Anterior» funcionan sin corromper el estado.
- Las fases futuras pueden consultarse, pero no completarse accidentalmente.
- Campaña 2 no puede ejecutarse como Campaña 1 por error de contexto.
- Hay pruebas de transición normal, retorno, omisión opcional, cierre anticipado e intento fuera de secuencia.

#### Cierre

- **Fecha:** 2026-09-28.
- **Orden de ejecución:** el §6 de este documento recomendaba abordar primero COR02-003 (Bloque 1, punto 2) y dejar COR02-002 para el punto 3. Al investigar COR02-003 se encontró que, tal como está pedida, presupone que los wizards ya pueden lanzarse desde una fase/subfase concreta del turno guiado y recordar ese origen — algo que hoy no existe (los wizards se abren desde Inicio o Ayuda rápida, sin ningún vínculo con el turno). Se presentaron 3 vías al mantenedor (construir ese vínculo completo, un aviso genérico sin vincular a fase/subfase, o abordar antes COR02-002); se eligió la tercera, ya que COR02-002 introduce precisamente el concepto de "fase actual"/contexto de turno que una versión bien fundamentada de COR02-003 necesitaría de todas formas.
- **Pruebas ejecutadas:** `npm test` → **252/252 OK** (247 + 5 nuevas: `getCurrentPhaseId` con progreso vacío/parcial/completo y aislamiento entre Campaña 1/2; `getPhaseSequenceState` cubriendo los 5 estados solicitados con datos reales de `turn-template.json`; `evaluatePhaseCompletion`/`evaluatePhaseSequencing` distinguiendo terminar la fase actual de terminar una futura o una ya pasada). `npm run test:e2e` → **14/14 OK** (1 nueva en `turno.spec.js`: intenta terminar "Fase Logística" sin haber tocado las 3 fases anteriores del Proceso Estratégico — aparece el aviso "todavía no es la actual de la secuencia (la actual es «Fase de Crisis»)"; cancelar el diálogo no cambia nada; confirmarlo sí la completa, y "Fase de Crisis" sigue siendo la actual después). El recorrido completo normal (`turno.spec.js`, caso obligatorio 1 de COR-004) sigue pasando sin ningún diálogo adicional, confirmando que la secuencia normal no se ve afectada. Verificado además manualmente en el navegador: la insignia "▶ Actual" aparece en la primera fase de Campaña 1; visitar una fase futura (Acciones Terrestres) muestra la nota de aviso sin bloquear la lectura de sus subfases.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 20), `development_status.md`.

#### Diseño implementado

3 funciones puras nuevas en `public/js/turn-progress-engine.js`: `getCurrentPhaseId(turnTemplate, runKey, progress)` (la primera fase, en el orden de `turn-template.json`, que no está ni terminada ni omitida; `null` cuando la repetición ya está completa), `getPhaseSequenceState(turnTemplate, runKey, phaseId, progress)` (los 5 estados solicitados: `not-started`/`current`/`completed`/`skipped`/`closed-early`, reutilizando `evaluatePhaseCompletion` para distinguir `completed` de `closed-early` sin duplicar esa comprobación) y `evaluatePhaseSequencing(turnTemplate, runKey, phaseId, progress)` (si mutar `phaseId` respetaría la secuencia). `evaluatePhaseCompletion` (COR-002 de `correcciones.md`) se amplió con `outOfSequence`/`currentPhaseId` en vez de duplicar la lógica en un tercer sitio.

Consistente con el criterio de "el motor no impone un bloqueo duro que ninguna fuente describe" (AGENTS.md §14): estas funciones informan, nunca bloquean por sí solas. `public/js/views/turn.js` es quien decide qué hacer con esa información — `renderProcess` muestra la insignia "▶ Actual" (nueva, además de "✓ Completada"/"— Omitida"/"⚠ Cerrada anticipadamente") y exige una confirmación distinta ("«X» no es la fase actual de la secuencia... ¿de todas formas?") antes de "Terminar fase" o "Saltar fase" cuando la fase no es la actual, registrando `outOfSequence: true` (con el `currentPhaseId` esperado) en el evento de historial. `renderPhase` añade una nota informativa (no bloqueante) al consultar una fase futura, dejando claro que **consultarla sigue sin restricción** — solo mutarla exige la confirmación excepcional, tal como pedía la corrección ("la consulta de fases futuras puede mantenerse... no debe ser posible mutar el estado de una fase fuera de secuencia sin una acción excepcional, explícita y registrada").

"Campaña 2 no puede ejecutarse como Campaña 1 por error de contexto" ya estaba garantizado por el `runKey` de COR-001 (`processId:occurrence`); `getCurrentPhaseId` lo hereda automáticamente al operar siempre sobre un `runKey` explícito, nunca sobre un proceso implícito — confirmado con un test dedicado.

No se modeló la subsecuencia dentro de una fase (orden de sus subfases): ninguno de los criterios de aceptación de esta incidencia lo pide explícitamente (piden secuencia entre FASES, no entre subfases de una misma fase), así que ampliar el alcance ahí habría sido una regla no solicitada — las subfases de una fase siguen pudiendo completarse en cualquier orden dentro de esa fase, como ya era el caso.

---

### COR02-003 — Incluir acciones y resoluciones activas en el cierre de fase

**Prioridad:** Alta  
**Tipo:** Integridad funcional  
**Fases afectadas:** 2 y 7  
**Estado:** Resuelta (2026-09-28)

#### Evidencia

`public/js/turn-progress-engine.js:219-233` declara expresamente que:

- `pendingResolutions` siempre es `[]`;
- `blockReason` siempre es `null`;
- el modelo no representa acciones ni una cola formal de resoluciones.

#### Problema

COR-002 evita cerrar silenciosamente una fase con subfases pendientes, pero no evita cerrar una fase mientras existe un wizard de combate iniciado, una reacción pendiente o una resolución parcial. Esto deja sin cumplir el requisito de `AGENTS.md` §6: confirmar si quedan acciones o resoluciones pendientes.

Además, el estado del wizard no está asociado formalmente al turno, fase o subfase que lo inició. El cierre puede dejar una resolución huérfana o un historial incoherente.

#### Corrección solicitada

Crear un modelo de resolución pendiente vinculado a la sesión:

```text
pendingResolution = {
  id,
  type,
  runKey,
  phaseId,
  subphaseId,
  status,
  startedAt
}
```

`evaluatePhaseCompletion` deberá consultar ese estado y devolver resoluciones reales. La UI deberá permitir volver a la resolución, cancelarla de forma segura o cerrar anticipadamente dejando trazabilidad explícita.

#### Criterios de aceptación

- Una resolución iniciada queda vinculada a su contexto del turno.
- El cierre normal se bloquea o solicita una decisión explícita si existen resoluciones activas.
- Cancelar una resolución genera historial y limpia solo su estado.
- Hay tests para resolución activa, resolución terminada, cancelación y cierre anticipado.

#### Cierre

- **Fecha:** 2026-09-28.
- **Sobre el "modelo de resolución pendiente vinculado a la sesión":** se implementó tal como lo pedía la corrección, con el campo adicional `band` (el esquema v3 de COR02-001 hace que un mismo `runKey` exista independientemente en cada banda de día, así que una resolución necesita saber también en qué banda se abrió para no vincularse por error a la instancia equivocada del mismo proceso en otra banda) y `label` (nombre legible del workflow, para no tener que volver a resolverlo contra `data/workflows/` solo para mostrar el aviso).
- **Hallazgo durante la implementación:** la corrección, tal como está redactada, presupone que un wizard ya puede lanzarse "desde" una fase/subfase concreta y recordar ese origen — ninguna vista lo hacía todavía (los wizards se abren desde Inicio o Ayuda rápida, sin vínculo con el turno). Por eso se investigó primero, se preguntó al mantenedor cómo seguir, y se adelantó COR02-002 (que introduce el concepto de "fase actual"/contexto de turno) antes de abordar esta incidencia.
- **Pruebas ejecutadas:** `npm test` → **258/258 OK** (252 + 6 nuevas: vinculación exacta por banda/runKey/fase, reabrir el mismo wizard desde el mismo contexto actualiza en vez de duplicar, cancelar limpia solo esa resolución, una resolución vinculada bloquea el cierre normal de SU fase pero no de otra, y `normalizeProgress` descarta entradas de `pendingResolutions` incompletas en vez de conservarlas a medias). `npm run test:e2e` → **15/15 OK** (1 nueva: abre el wizard de Combate cercano terrestre desde la subfase real que lo relaciona — `combate_terrestre` → `acciones_terrestres`/Campaña 1 —, confirma que la fase muestra "⏳ Resolución activa", que "Terminar fase" avisa de ella en el mismo diálogo que las subfases pendientes, y que "✕ Cancelar resolución" la retira). Verificado además manualmente en el navegador paso a paso, incluida la lectura directa de `localStorage` en cada punto, sin errores de consola.
  - **Carrera real encontrada y corregida, pero en el TEST, no en la aplicación:** la primera versión del caso E2E esperaba solo el título `<h1>` tras el segundo clic ("▶ Resolver con el wizard de combate") para confirmar que ya se había navegado al wizard — pero la página de "Combate por tipo" y el propio wizard comparten literalmente el mismo texto de encabezado ("Combate cercano terrestre"), así que la espera podía darse por satisfecha contra el encabezado ANTERIOR, todavía no reemplazado, dejando que el test siguiera antes de que `location.hash` cambiara de verdad — reproducido de forma intermitente (fallaba en la mayoría de las repeticiones, tanto en serie como en paralelo). Corregido esperando la URL (`page).toHaveURL(/#\/wizard\/ground-close-combat/)`) y un texto exclusivo del wizard ("Paso 1 de 5") en vez de un encabezado ambiguo; confirmado estable con `--repeat-each=6` en ambos modos.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 20), `development_status.md`.

#### Diseño implementado

**Motor (`public/js/turn-progress-engine.js`):** `progress.pendingResolutions` pasa de una lista siempre vacía a una lista real, con `registerPendingResolution`/`removePendingResolution`/`findPendingResolutionsForPhase`/`listPendingResolutions`/`makeResolutionId` (pura, sin `localStorage`). El `id` es determinista (`type:band:runKey:phaseId`) para que reabrir el mismo wizard desde el mismo contexto actualice la entrada en vez de duplicarla. `evaluatePhaseCompletion` ahora calcula `pendingResolutions` de verdad (antes: `[]` fijo) filtrando por banda/runKey/fase exactos — su fórmula `canFinishNormally` ya comparaba `pendingResolutions.length === 0`, así que toda la UI de cierre anticipado que ya existía para subfases pendientes (COR-002) se generalizó automáticamente a resoluciones sin tocar esa lógica.

**Persistencia:** nuevas `AppStorage.registerPendingResolution`/`removePendingResolution` (`public/js/storage.js`, mismo patrón que `markPhaseFinished`) y sus envoltorios en `public/js/core.js` (`AppCore`).

**Vínculo wizard↔turno sin acoplar cada vista a cada wizard:** `public/js/core.js` mantiene `lastTurnContext` (solo en memoria, igual de volátil que el propio estado de los wizards) — `band`/`runKey`/`phaseId`/`subphaseId` de la última fase/subfase del turno visitada. `app.js#routeDispatch` lo mantiene en un único sitio (`maintainLastTurnContext`): se fija al visitar una fase/subfase del turno, se conserva al pasar por "Combate por tipo" o un wizard (pasos intermedios de la cadena fase → Ayuda contextual → Combate por tipo → wizard, ninguno de los cuales tiene su propio contexto de turno que fijar), y se limpia en cualquier otra ruta — así un wizard nunca se vincula a un contexto de turno obsoleto de una navegación anterior no relacionada. Cada wizard (`views/antiship-guided-wizard.js`, `views/ground-close-combat-wizard.js`) llama a su propio `linkToTurnContextIfNeeded(state, título)` al renderizarse (antes de cualquier `await`, así que es determinista): si hay un `lastTurnContext` y el estado todavía no está vinculado, registra la resolución; si el wizard se abrió sin pasar por una fase (desde Inicio o Ayuda rápida directamente), no hay nada que vincular y sigue siendo una resolución "suelta" válida, sin inventar un contexto. `unlinkTurnContext(state)` se llama al guardar en historial (la resolución se da por completada) y al reiniciar el wizard (se abandona).

**UI (`public/js/views/turn.js`):** cada resolución pendiente de la fase se muestra como una tarjeta "⏳ Resolución activa: «label»" con dos acciones — "↩ Volver a la resolución" (navega al wizard vía el mismo mapa `AppCore.WORKFLOW_WIZARD_HASHES` ya compartido con `views/help.js`) y "✕ Cancelar resolución" (pide confirmación, la retira y registra un evento de historial `resolution-cancel`). El mensaje de "Terminar fase" con pendientes ahora nombra subfases Y resoluciones cuando hay de ambas, en vez de solo subfases.

**No se implementó un bloqueo duro** ("se bloquea o solicita una decisión explícita" de los criterios de aceptación): se eligió la segunda vía, consistente con el resto de esta sesión (COR-002 de `correcciones.md`, COR02-001, COR02-002) — el motor informa, la UI exige una confirmación explícita y registra la acción, pero no impide cerrar la fase, porque ninguna fuente describe una regla de bloqueo real para este caso (AGENTS.md §14).

---

### COR02-004 — Completar la derivación de propiedades en el modo validado del wizard

**Prioridad:** Alta  
**Tipo:** Regla de negocio / Consistencia de datos  
**Fases afectadas:** 7  
**Estado:** Resuelta con alcance reducido (2026-09-28) — ver "Nota de alcance" y "Cierre" más abajo.

#### Nota de alcance (2026-09-28, previa a la implementación)

Esta incidencia se investigó después de cerrar `COR02-005` (planes Balístico/Espacio Cercano excluidos del conjunto «resoluble» del modo validado). Eso cambia lo que queda realmente por hacer aquí: 2 de las 4 propiedades que pedía la corrección original —`near_space_trajectory` y la alerta temprana automática por Misil Balístico— ya NO pueden llegar a plantearse en el modo validado, porque un plan Balístico o de Espacio Cercano ya no es seleccionable ahí. Solo quedan en alcance real `munition_marked_cm_or_bm` y `short_range_restriction`. Se preguntó al mantenedor cómo seguir (reducir el alcance a lo que sigue siendo relevante, implementar las 4 propiedades igualmente, o posponer la incidencia); se eligió reducir el alcance.

#### Evidencia

La selección validada deriva correctamente el método, el valor de ataque, el alcance y el tramo de distancia. Sin embargo:

- `public/js/views/antiship-guided-wizard.js:590-592` presenta sin excepción todas las preguntas de interceptación;
- `munition_marked_cm_or_bm` se responde manualmente;
- `near_space_trajectory` se responde manualmente aunque el método ya se derivó del icono del plan;
- `early_warning_effect` se responde manualmente aunque el propio workflow indica que es automático para ataques balísticos;
- `short_range_restriction` vuelve a preguntar una condición relacionada con una distancia ya introducida.

Los datos del plan contienen `icons` y, en los casos aplicables, `cruiseMissile`, por lo que una parte importante de estas respuestas es derivable.

#### Problema

El usuario puede seleccionar un plan de espacio cercano y responder que no usa trayectoria de espacio cercano, o seleccionar una munición balística y negar el efecto automático de alerta. El modo se presenta como validado, pero todavía admite combinaciones imposibles.

Esto afecta directamente a modificadores, número de dados y aplicabilidad de etapas defensivas.

#### Corrección solicitada

Crear una función de dominio que normalice el plan seleccionado a propiedades de resolución, por ejemplo:

```text
deriveGuidedAttackProfile(plan, missionContext)
```

Debe devolver al menos:

- método;
- marcador CM/BM;
- trayectoria de espacio cercano;
- alerta temprana automática por BM;
- alcance y distancia efectiva;
- restricción de corto alcance, cuando el contexto punto/área permita calcularla.

Las propiedades derivadas deben mostrarse como información de solo lectura, con su origen, y no como preguntas editables. Si falta un dato, el modo validado debe bloquear el avance o solicitar únicamente el contexto realmente desconocido.

#### Criterios de aceptación

- Ninguna pregunta editable duplica un dato inequívoco del plan. **Cumplido para `munition_marked_cm_or_bm` y `short_range_restriction`** (los 2 que siguen en alcance tras COR02-005); `near_space_trajectory` y la alerta temprana automática por BM se dejan sin tocar (ver "Nota de alcance") porque un plan Balístico/Espacio Cercano ya no llega al modo validado.
- No puede introducirse una respuesta contradictoria con el método o los iconos seleccionados. **Cumplido**: al ya no poder seleccionarse un plan Balístico/Espacio Cercano en modo validado, la contradicción original (elegir ese método y negar su propiedad asociada) ya no es posible ahí.
- El contexto de misión de punto/área se modela antes de derivar restricciones de distancia. **Cumplido de forma acotada, no como un campo de "tipo de misión" persistente**: `short_range_restriction` se deriva sin preguntar nada cuando la distancia ya introducida es 1 (siempre aplica) o > 2 (nunca aplica); solo se pregunta el tipo de misión ("¿Es Misión de Área?") en el único caso realmente ambiguo, distancia exactamente 2 — ver "Diseño implementado".
- El modo manual conserva preguntas manuales y queda claramente separado. **Cumplido**, sin cambios: toda la derivación nueva se activa solo con `s.unitSelection.mode === 'validated'` (mismo patrón que las derivaciones ya existentes de COR-007).
- Existen tests por método: subsónico, supersónico, balístico y espacio cercano. **No aplica con el alcance reducido**: balístico y espacio cercano ya no llegan al modo validado (COR02-005), así que no hay wizard que testear en esos métodos; los tests cubren `derivePlanCmOrBmMarker`/`deriveShortRangeRestriction` como funciones puras para sus casos reales (incluido un método Balístico pasado explícitamente, para no perder cobertura de esa rama de la función).

#### Cierre

- **Fecha:** 2026-09-28.
- **Pruebas ejecutadas:** `npm test` → **270/270 OK** (261 + 9 nuevas: `derivePlanCmOrBmMarker` con método Balístico, con/sin marcador, con marcador combinado con un icono de método guiado —caso no visto todavía en datos reales, pero sí en el patrón real de `icons[]` combinados—, con el campo `cruiseMissile` transcrito, y sin plan; `deriveShortRangeRestriction` para distancia 1, > 2, exactamente 2 con ambas respuestas de Misión de Área, y distancia vacía/no numérica). `npm run test:e2e` → **16/16 OK** (`test/e2e/unit-plan-selection.spec.js` actualizado: la pregunta CM/BM ya no se hace clic, se comprueba el texto derivado; la pregunta de distancia corta ahora hace clic en "¿Es Misión de Área?" en vez de en la pregunta original, y se comprueba el texto derivado resultante). Verificado además manualmente en el navegador con el flujo completo F-2A/B + Plan B + Ligera + distancia 2 hex (el caso ambiguo real del golden test): "¿La munición... CM o BM?" aparece como texto derivado ("No"), y "¿La distancia de ataque es 1 (o 2 en Misión de Área)?" se sustituye por "¿Es Misión de Área?" (al responder "No", deriva correctamente "Derivado de la distancia de ataque introducida en 'Datos base' (2 hex.): No."), sin errores de consola.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 20), `development_status.md`.

#### Diseño implementado

**Motor (`public/js/combat-wizard-engine.js`):** 2 funciones puras nuevas.
- `derivePlanCmOrBmMarker(plan, method)`: `true` si el método derivado es `'ballistic'` (Misil Balístico), o si el plan lleva alguno de los 3 iconos de marcador (`marker_cruise_missile`/`marker_low_flight_cruise_missile`/`marker_supersonic_cruise_missile`) o el campo `cruiseMissile` transcrito. Ningún plan antibuque ya transcrito combina hoy un icono de método guiado reconocido con uno de estos marcadores dentro de `antiShip` (los únicos casos reales con marcador no tienen icono de método reconocido y por tanto no llegan a `buildAntishipPlanOptions` — ver más abajo), pero la función se implementó para reconocer la combinación si ocurre, en vez de asumir "nunca ocurre".
- `deriveShortRangeRestriction(distanceHexes, isAreaMission)`: devuelve `'yes'`/`'no'` cuando la distancia ya deja el resultado sin ambigüedad (1 → siempre `'yes'`; > 2 → siempre `'no'`), o `null` cuando distancia === 2 y todavía no se conoce `isAreaMission` — el único caso donde el texto original de la pregunta ("¿La distancia de ataque es 1, o 2 en Misión de Área?") depende de un dato que el wizard no tiene.

**UI (`public/js/views/antiship-guided-wizard.js`):** mismo patrón ya establecido por COR-007 para `attack_distance`/`method` (comprobar `s.unitSelection.mode === 'validated' && s.unitSelection.resolvedPlan` dentro del `.forEach` de preguntas de la etapa, y sustituir la pregunta editable por un párrafo "Derivado de..." cuando aplica):
- `renderWizardStepDefenses`, etapa `area_air_defense`: `munition_marked_cm_or_bm` se deriva siempre (nunca hace falta preguntar nada más).
- `renderWizardStepDefenses`, etapa `munition_interception`: `short_range_restriction` se deriva cuando `deriveShortRangeRestriction` no devuelve `null`; si devuelve `null` (distancia === 2), se muestra en su lugar una pregunta nueva y mínima "¿Es Misión de Área?" (Sí/No, misma UI que cualquier otra pregunta del wizard) — la única entrada manual que sigue haciendo falta, guardada en `stageAnswers.munition_interception.short_range_restriction_area_mission` (una clave nueva, no parte del workflow transcrito, que no interfiere con `collectRuleEffects` porque esa función solo mira las preguntas reales del workflow).

**Deliberadamente NO implementado en esta incidencia:** un modelo persistente de "tipo de misión" (Punto/Área) como campo de `unitSelection` u otro estado de sesión — no lo pide ningún otro punto del wizard, y `AGENTS.md` §9.2 pide preguntar solo "el contexto realmente desconocido"; modelarlo como campo persistente habría sido una abstracción sin otro consumidor. Tampoco se tocó `near_space_trajectory` ni `early_warning_effect`: siguen siendo preguntas manuales exactamente como antes, ahora estructuralmente inalcanzables con un método que las necesite en modo validado (ver "Nota de alcance").

---

### COR02-005 — No ofrecer como resolubles métodos cuyo flujo de daño está incompleto

**Prioridad:** Alta  
**Tipo:** Cobertura funcional / Definition of Done  
**Fases afectadas:** 7  
**Estado:** Resuelta (2026-09-28)

#### Evidencia

`public/js/combat-wizard-engine.js:407-410` devuelve `null` para el daño por impacto de métodos balísticos y de espacio cercano. `public/js/views/antiship-guided-wizard.js:799-801` interrumpe la asignación de impactos al final del wizard porque no existe el atributo de escudo del buque.

Sin embargo, `buildAntishipPlanOptions` admite planes balísticos y de espacio cercano como opciones válidas del modo validado.

#### Problema

El usuario puede completar casi todo el flujo con un plan que la aplicación presenta como soportado y descubrir solo en el resultado que no puede aplicar el daño. La funcionalidad no cumple la Definition of Done de `AGENTS.md` §13 para esos métodos.

#### Corrección solicitada

Elegir una de estas estrategias:

1. modelar el atributo de escudo por unidad objetivo y completar las reglas de 6 puntos de daño/hundimiento directo; o
2. excluir temporalmente esos planes del conjunto «resoluble» y mostrarlos como consulta o «resolución parcial no disponible» antes de iniciar el wizard.

No se debe esperar hasta el último paso para comunicar la limitación.

#### Criterios de aceptación

- Todo plan ofrecido como resoluble alcanza un resultado de daño auditable.
- Los planes parciales se identifican antes de empezar.
- La prueba golden se complementa con al menos un caso por cada método habilitado.
- El resumen final incluye asignación, daño y efecto posterior, no solo impactos.

#### Cierre

- **Fecha:** 2026-09-28.
- **Decisión de producto:** a petición explícita del mantenedor, se adoptó la segunda vía de la corrección solicitada — excluir temporalmente del conjunto «resoluble» los planes balístico y de espacio cercano, identificándolos antes de empezar el wizard — en vez de modelar ahora el atributo de escudo por unidad objetivo (vía 1), que queda pendiente de una fuente que lo transcriba.
- **Pruebas ejecutadas:** `npm test` → **261/261 OK** (258 + 3 nuevas: `buildAntishipPlanOptions` marca `resoluble: true` para métodos subsónico/supersónico y `resoluble: false` para balístico/espacio cercano, usando el Plan C real de `ch-bs-055` — YJ-21 — como caso balístico no resoluble). `npm run test:e2e` → **16/16 OK** (1 nueva: seleccionar la unidad `ch-bs-055` en modo validado confirma que el Plan C no aparece en el `<select>` de "Plan de ataque" y que la nota de aviso nombra el plan excluido, su munición y el motivo). Verificado además manualmente en el navegador: País=China, Unidad=BS-055 muestra únicamente los planes A y B (supersónicos) en el selector, y la nota "⚠ Esta unidad tiene 1 plan(es) adicional(es) no disponible(s) para resolución todavía: C (YJ-21, Trayectoria balística). Su daño final depende de si el buque objetivo tiene la marca de Escudo (Decision Book §9.x), un dato sin transcribir para ninguna unidad." aparece antes de que el usuario pueda avanzar.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 20), `development_status.md`.

#### Diseño implementado

**Motor (`public/js/combat-wizard-engine.js`):** `buildAntishipPlanOptions` ya derivaba el `method` de cada plan a partir de sus iconos; ahora añade `resoluble: !!method && damagePerImpactForMethod(method) !== null` a cada opción, sin dejar de devolver las opciones no resolubles (los llamantes deciden qué hacer con la información, la función no las oculta).

**Carga de datos (`public/js/core.js#loadCountryUnitsWithAntishipPlans`):** separa las opciones de cada unidad en `options` (resolubles) y `partialOptions` (no resolubles), incluyendo la unidad en los resultados si tiene al menos un plan con método reconocido de cualquiera de los dos tipos — así una unidad con solo planes no resolubles sigue apareciendo (con `options` vacío) en vez de desaparecer silenciosamente del selector de unidades.

**UI (`public/js/views/antiship-guided-wizard.js#renderWizardStepIntro`):** el `<select>` de "Plan de ataque" sigue iterando únicamente `unitEntry.options`, por lo que los planes no resolubles quedan excluidos por construcción, sin tocar la validación de "Siguiente →" (que ya opera sobre `sel.resolvedPlan`, derivado de `options`). Antes del selector se añade una nota que enumera por letra/munición/método los planes de `unitEntry.partialOptions`, con la razón concreta (dependencia de la marca de Escudo, sin transcribir) y un enlace textual a "Ayuda rápida > Planes de ataque y munición" para quien quiera consultarlos igualmente; si `unitEntry.options` queda vacío, se añade además una nota indicando que esa unidad no tiene ningún plan resoluble todavía.

**Alcance no tocado:** el modo manual (`public/js/combat-wizard-engine.js` sin pasar por `buildAntishipPlanOptions`) no se ve afectado — sigue permitiendo introducir cualquier combinación a mano (COR-007), incluida una que corresponda a un método balístico, bajo la advertencia ya existente de que el modo manual no se valida contra ningún plan transcrito.

---

### COR02-006 — Extraer reglas, textos y valores fijos incrustados en JavaScript

**Prioridad:** Media-Alta  
**Tipo:** Arquitectura / Cumplimiento de `AGENTS.md`  
**Fases afectadas:** 4, 5 y 7  
**Estado:** Resuelta (2026-09-28)

#### Evidencia

Ejemplos actuales:

- `public/js/detection-engine.js:77`: alcance fijo de baja altitud `1`;
- `public/js/detection-engine.js:111`: multiplicador de terreno `4`;
- `public/js/detection-engine.js:128-133`: lista y etiquetas de acciones brevemente detectables;
- `public/js/detection-engine.js:169-173`: tipos de detectores terrestres;
- `public/js/detection-engine.js:195-200`: reglas y textos de detectores navales;
- `public/js/combat-wizard-engine.js:407-410`: daño por impacto `1` y `2`;
- `public/js/combat-wizard-engine.js:463-468`: correspondencia de icono a método;
- `public/js/combat-wizard-engine.js:528-533`: límites de distancia `2` y `5`.

#### Problema

Son reglas, secuencias, etiquetas o valores fijos de negocio. `AGENTS.md` §§1.4, 4.1 y 11 exige que este tipo de información resida en datos versionables y que el motor la interprete.

Aunque las funciones estén probadas, una prueba de código no sustituye la trazabilidad declarativa ni evita que la fuente y la implementación diverjan.

#### Corrección solicitada

Crear datos declarativos para:

- reglas y estados de detección;
- perfiles de método de ataque;
- bandas de distancia;
- daño por impacto;
- correspondencias entre iconos y semántica;
- etiquetas y explicaciones fijas.

El JavaScript debe conservar solo algoritmos genéricos, validación y composición de resultados. Cada regla declarativa debe tener `id`, `sourceRefs`, condición y efecto.

#### Criterios de aceptación

- Los motores no contienen valores de reglas TCW sin una parametrización procedente de `data/`.
- Los textos explicativos de negocio se cargan desde datos o contenido versionado.
- Los tests validan esquema, referencias y comportamiento de los datos.
- Modificar una banda o un valor fijo no requiere editar el motor JavaScript.

#### Cierre

- **Fecha:** 2026-09-28.
- **Las 8 evidencias citadas se resolvieron todas**, no solo una muestra: los 4 valores/listas de `detection-engine.js` (alcance fijo de baja altitud, multiplicador de terreno, acciones "brevemente detectable", tipos de detector terrestre) y los 3 de `combat-wizard-engine.js` (icono→método, daño por impacto, límites de bucket de distancia) — además de un `NAVAL_DETECTOR_RULES` no citado explícitamente en la evidencia pero con el mismo defecto exacto (una tabla de reglas categóricas incrustada como constante del motor).
- **Hallazgo durante la implementación:** en `public/js/views/help.js`, las listas de tipos de detector terrestre/naval y las etiquetas de acciones "brevemente detectable" NO solo estaban en el motor — también vivían, por TERCERA vez, hardcodeadas de forma independiente en la UI del resolutor interactivo (`renderDetectionGroundDetectorEligibility`/`renderDetectionNavalDetectorEligibility`/`renderDetectionBrieflyDetectable`), con etiquetas que ya habían divergido ligeramente de las del motor (p.ej. "¿Está en misión aérea especial o ISR?" en la UI vs. "Misión aérea especial o ISR" en el motor). Consolidar a una sola fuente (`data/detection/help-sheet.json`) elimina las 3 copias a la vez, no solo la del motor.
- **Pruebas ejecutadas:** `npm test` → **281/281 OK** (271 + 10 nuevas: 4 de esquema para los campos nuevos de `help-sheet.json`, 2 de esquema para las opciones de `method`/`attack_distance` del workflow 07, y las llamadas ya existentes de `detection-engine.test.js`/`combat-wizard-engine.test.js` actualizadas para pasar los datos reales en vez de constantes). `npm run test:e2e` → **21/21 OK** (16 ya existentes, sin cambios en sus archivos de test — confirma que ningún cálculo cambió de resultado — + 5 nuevas en `test/e2e/detection-resolver.spec.js`, cubriendo las pantallas de "Resolver detección" que pasaron de síncronas a asíncronas). Verificado además manualmente en el navegador, con recarga completa de página entre pasos (para descartar JS en caché de una sesión anterior): las 5 pantallas interactivas de detección muestran los valores derivados correctamente («Terreno×4 (1×4=4)», «alcance fijo de 1 hex», tipos de detector con las etiquetas ya consolidadas), sin errores de consola.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 20), `development_status.md`.

#### Diseño implementado

**Detección (`data/detection/help-sheet.json` + `public/js/detection-engine.js` + `public/js/views/help.js`):**
- `airDetection.lowAltitudeFixedRangeHex: 1` y `groundDetection.mobileUnitDetectability.terrainMultiplier: 4` — nuevos campos numéricos; `resolveSurfaceDetectsAir`/`resolveGroundMobileDetectability` los reciben como parámetro en vez de tenerlos incrustados.
- `groundDetection.brieflyDetectableTriggers.actions` pasa de `string[]` a `{id,label}[]`; `groundDetection.whoCanDetect.cannotDetect` igual; nuevo `whoCanDetect.capableTypes: {id,label}[]`; `navalDetection.detectedBy` gana `id`/`conditionLabel`/`alwaysCapable` por regla. `resolveBrieflyDetectable`/`resolveGroundDetectorEligibility`/`resolveNavalDetectorEligibility` reciben estas listas como parámetro en vez de las constantes `BRIEFLY_DETECTABLE_ACTIONS`/`GROUND_DETECTOR_CAPABLE`/`GROUND_DETECTOR_INCAPABLE`/`NAVAL_DETECTOR_RULES` (eliminadas).
- `renderDeteccionHelp` (la referencia de solo lectura) se ajustó en los 2 puntos donde leía `cannotDetect`/`actions` como strings (`.map(t=>t.label)`).
- `renderDetectionResolverDetail` (el resolutor interactivo) pasa de síncrono a async — carga `loadDetectionHelp()` (ya existente, cacheada) antes de renderizar, con el mismo patrón `Router.currentToken()`/`isCurrent` que ya usan `renderDeteccionHelp`/`renderSecuenciaHelp` para evitar una carrera si el usuario navega antes de que termine de cargar. Los 5 renderers que necesitan datos (`renderDetectionSurfaceVsAir`/`renderDetectionGroundMobile`/`renderDetectionBrieflyDetectable`/`renderDetectionGroundDetectorEligibility`/`renderDetectionNavalDetectorEligibility`) ganan un tercer parámetro `data` y construyen sus opciones de UI directamente desde él, eliminando las 3 listas que antes tenían hardcodeadas de forma independiente al motor (ver "Hallazgo durante la implementación").

**Ataque guiado a superficie (`data/workflows/07_ataque_antibuque_guiado.json` + `public/js/combat-wizard-engine.js` + `public/js/views/antiship-guided-wizard.js` + `public/js/core.js`):**
- Cada opción de la pregunta `method` (`attack_method` stage) gana `munitionIconRef` (el icono de MUNICIÓN que identifica ese método en los planes ya transcritos — distinto del `iconRefs` ya existente, que es el icono REPRESENTATIVO de la pregunta en la UI del workflow; para "ballistic" son 2 iconos distintos: `attack_ballistic` vs `munition_parabolic`, confirmado comparando ambos catálogos, así que no podían fusionarse en un solo campo) y `damagePerImpact` (número o `null` explícito, con `damagePerImpactNote` citando Decision Book §5.6.5).
- `derivePlanMethod(plan, methodOptions)` busca el icono del plan contra `methodOptions[].munitionIconRef` en vez de la constante `GUIDED_METHOD_BY_ICON` (eliminada). `damagePerImpactForMethod(method, methodOptions)` lee `methodOptions[].damagePerImpact` en vez de un `if/else` fijo. `buildAntishipPlanOptions(unit, methodOptions)` propaga el parámetro.
- Nueva `parseDistanceBucketValue(value)`: interpreta el formato `"N_M"`/`"Nplus"` que YA usan los `value` de las opciones de `attack_distance` (`"0_2"`/`"3_5"`/`"6plus"`) — `attackDistanceBucket(distanceHexes, bucketOptions)` deriva los 3 buckets de esos `value` reales en vez de los límites fijos `2`/`5`.
- `core.js#loadCountryUnitsWithAntishipPlans` carga `07_ataque_antibuque_guiado.json` una vez (cacheado por `loadWorkflow`) y pasa `methodOptions` a `buildAntishipPlanOptions`. `antiship-guided-wizard.js` pasa `q.options`/`stage4.questions.find(...).options` en los 3 puntos donde ya tenía el `workflow`/`stage` a mano (COR-007 ya había establecido ese acceso).
- El resumen "Daño por impacto (Decision Book §5.6.5)" del paso Resultado, antes un texto fijo "Subsónico: 1... Supersónico: 2...", ahora se genera iterando `methodOptions` (solo la frase de Balística/Espacio cercano — el "6" no modelado — sigue siendo prosa fija, porque no hay ningún valor de `damagePerImpact` del que derivarla: es explícitamente `null`).

**Deliberadamente no tocado:** el resto de motores del proyecto (`table-engine.js`, `combat-modifier-engine.js`, `ground-close-combat-engine.js`, etc.) no tenían las mismas 7 evidencias citadas — ya seguían el patrón "el motor recibe la tabla/regla como parámetro" desde su diseño original (Fase 5/9), así que no había nada que extraer ahí.

---

### COR02-007 — Cerrar el inventario y normalizar la trazabilidad de fuentes

**Prioridad:** Media-Alta  
**Tipo:** Datos / Auditoría  
**Fases afectadas:** 0  
**Estado:** Resuelta (2026-09-28)

#### Evidencia

`ROADMAP.md:21` afirma que se inventariaron todos los PDF, DOCX, TXT e imágenes y que el registro contiene 17 fuentes. En la raíz existen 25 artefactos de esos tipos. Al menos los siguientes no tienen una entrada individual inequívoca en `data/sources/sources.json`:

- `Antiaéreos.jpg`;
- `detección Aire Aire.jpg`;
- `Deteección Electrónica.jpg`;
- `Ejemplo de pantallas.png`;
- `Fases de Juego - Epañol.jpg`;
- `Mejoras y ajustes de TCW.txt`;
- `Plan de ataque - leyenda.png`;
- `Plan de ataque.png`;
- `TCW Flota Español.jpg`;
- `thecomingwave.png`;
- `Tipos de munición.png`;
- `TWC - Hoja de turnos 1.1.jpg`.

Además, las referencias de datos utilizan nombres libres. Por ejemplo, 14 workflows indican `TCW - TABLAS DE COMBATE`, mientras que el registro canónico identifica `Tablas-de-combate 5.pdf`. Las referencias a las hojas de armamento apuntan a archivos concretos, pero el registro agrupa todo el directorio en una sola entrada.

`test/data.test.js` comprueba que `sourceRefs` no esté vacío, pero no que cada referencia resuelva contra una fuente registrada.

#### Problema

La Fase 0 no dispone de una cadena de trazabilidad comprobable automáticamente. Una referencia puede contener texto, pero no necesariamente identificar una fuente canónica existente.

#### Corrección solicitada

- Inventariar todos los artefactos y clasificarlos como fuente funcional, apoyo visual, activo de aplicación o descartado.
- Asignar `sourceId` estable a cada fuente o subfuente necesaria.
- Sustituir referencias libres por `sourceId` más página/sección.
- Registrar individualmente las 17 hojas de armamento o definir un esquema formal de subdocumentos dentro de la fuente agregada.
- Añadir una validación que recorra todos los JSON y compruebe que cada `sourceId` existe.

#### Criterios de aceptación

- Todos los archivos entregados figuran en el inventario o en una lista explícita de activos no funcionales.
- Ningún `sourceRef` depende únicamente de un nombre libre.
- Toda referencia resuelve a una fuente canónica.
- Los tests fallan ante una fuente inexistente, un alias no registrado o una página/sección inválida cuando sea verificable.

#### Cierre

- **Fecha:** 2026-09-28.
- **Hallazgo no anticipado durante la implementación:** al inventariar los 12 artefactos sin registrar, 2 de ellos (`detección Aire Aire.jpg`, `Deteección Electrónica.jpg`) resultaron ser **contenido de reglas real y todavía no transcrito** — no apoyo visual duplicado como los otros 10. `detección Aire Aire.jpg` es una tabla completa (valores reales, no plantilla) titulada "2.1 Nivel de exploración" que cruza nivel de exploración aérea contra RCS; `Deteección Electrónica.jpg` detalla la mecánica de detección electrónica (unidades RADCM/CCD, cálculo de distancia desde el marcador del detector) con más profundidad que el resumen ya transcrito en `data/detection/help-sheet.json#electronicDetection`. Siguiendo AGENTS.md §14 (no aproximar, no inventar), NO se transcribieron ahora: se registraron en `sources.json` con `"status": "not-transcribed"` y `"role": "fuente-funcional-pendiente"`, dejando la transcripción real como una tarea aparte, explícitamente señalada.
- **Pruebas ejecutadas:** `npm test` → **274/274 OK** (271 + 3 nuevas: toda referencia `document`/`sourceDocument`/`sourceId` de `data/**/*.json` resuelve contra `sources.json`; toda fuente registrada de la raíz del repositorio existe en disco, incluidas las 17 hojas de `tablas-armamento.files`; ningún archivo PDF/DOCX/TXT/JPG/PNG de la raíz queda fuera del inventario). Los 2 tests de validación fallaron primero contra los datos reales (confirmando que detectaban los problemas genuinos descritos en la Evidencia) y pasaron después de corregirlos — no se escribieron contra datos ya arreglados sin verificar que fallaran antes. `npm run test:e2e` → **16/16 OK**, sin cambios en los archivos de test (confirma que normalizar el nombre de fuente en los 13 workflows + index.json no rompió ninguna pantalla). Verificado además manualmente en el navegador: `#/ayuda/combate/ground_close_combat` muestra ahora "Tablas-de-combate 5.pdf — págs. 2" en vez de "TCW - TABLAS DE COMBATE — págs. 2".
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 20), `development_status.md`.

#### Diseño implementado

**Corrección de 2 referencias realmente rotas** (no solo de nombre libre, sino apuntando a un archivo INEXISTENTE): `data/ammunition/special-unit-plans/jp.json` y `data/units/jp.json` citaban `"Tablas de Armamento/JP 2.pdf"` (con espacio) cuando el archivo real en disco es `"JP2.pdf"` (sin espacio) — corregido a la grafía real, sin tocar ningún valor de juego.

**Normalización de "TCW - TABLAS DE COMBATE"** (evidencia original de la incidencia): los 13 archivos de `data/workflows/*.json` + `index.json` cambian su `source.document`/`sourceRefs[].document` de `"TCW - TABLAS DE COMBATE"` a `"Tablas-de-combate 5.pdf"` (el nombre real registrado como `tablas-combate`), y añaden `"sourceId": "tablas-combate"` junto al nombre legible — visible en `? Ayuda rápida > Combate por tipo > <cualquiera>` y en el wizard de Combate Cercano Terrestre.

**Esquema formal de subdocumentos para `tablas-armamento`** (en vez de registrar 17 entradas individuales casi idénticas): la entrada agregada `tablas-armamento` de `sources.json` gana un campo `"files"` con los 17 nombres EXACTOS tal como aparecen en los `sourceRefs` reales de `data/ammunition/**/*.json` y `data/units/*.json` (ya con la corrección de `JP2.pdf` aplicada), más `"filesNote"` documentando la corrección. La comprobación de "toda referencia resuelve a una fuente canónica" trata `filename` y cada entrada de `files[]` como igualmente válidos.

**12 fuentes nuevas registradas en `sources.json`**, cada una con `"role"`:
- `fuente-funcional-pendiente` (2): `deteccion-aire-aire-jpg`, `deteccion-electronica-jpg` — contenido real de reglas sin transcribir (ver "Hallazgo no anticipado").
- `apoyo-visual-duplicado` (7): `antiaereos-jpg`, `fases-de-juego-jpg`, `hoja-turnos-jpg`, `plan-de-ataque-png`, `plan-de-ataque-leyenda-png`, `tipos-de-municion-png`, `flota-espanol-jpg` — cada una con `"relatedSourceId"` apuntando a la fuente ya registrada de la que es duplicado/variante (confirmado visualmente comparando el contenido de la imagen, no solo por el nombre de archivo).
- `activo-proyecto` (2): `ejemplo-pantallas-png` (mockup de diseño de la propia aplicación, no fuente de reglas), `mejoras-ajustes-tcw-txt` (ya citado en AGENTS.md §2, solo le faltaba entrada de inventario).
- `activo-aplicacion` (1): `thecomingwave-png` (logotipo de fondo de la aplicación).

**3 tests nuevos en `test/data.test.js`:**
1. Recorre recursivamente todo `data/**/*.json` (salvo `sources.json`), recoge cada objeto con `document`/`sourceDocument`/`sourceId`, y comprueba que resuelve contra `sources.json` (`filename`, `files[]`, o `id` respectivamente) — encontró y permitió corregir los 2 problemas reales de la Evidencia antes de poder pasar.
2. Comprueba que cada fuente registrada en la raíz existe realmente en disco (excluyendo explícitamente, por id, las 4 entradas cuyo `filename` es una descripción agregada o cuya ubicación real no es la raíz: `tablas-armamento`, `attack-workflows-xml`, `attack-workflows-json`, `phase-help-xml`), y que las 17 entradas de `tablas-armamento.files` existen todas.
3. Recorre los archivos PDF/DOCX/TXT/JPG/PNG de la raíz del repositorio y comprueba que ninguno queda fuera de `sources.json` — la comprobación inversa de la Evidencia original ("25 artefactos, 17 fuentes registradas").

**Deliberadamente no implementado:** transcripción real de `deteccion-aire-aire-jpg`/`deteccion-electronica-jpg` a `data/detection/` (ver "Hallazgo no anticipado" — requiere confirmar la fuente/sección exacta y no se puede hacer de forma segura dentro del alcance de una incidencia de inventario/trazabilidad); validación de página/sección dentro de cada documento (el criterio de aceptación lo permite "cuando sea verificable" — los `pages`/`page` ya transcritos no tienen un total de páginas por documento modelado en `sources.json` contra el que comparar, así que no se pudo verificar automáticamente sin inventar ese dato).

---

### COR02-008 — Reconciliar documentación y metadatos con el código actual

**Prioridad:** Media  
**Tipo:** Documentación operativa  
**Fases afectadas:** 0 a 8  
**Estado:** Resuelta (2026-09-28)

#### Evidencia

Se han detectado, entre otras, estas contradicciones:

- `data/sources/sources.json#decision-book.pendingSections` incluye «cap. 1-6 completos» y, en la misma frase, afirma que el capítulo 6 está completo.
- La descripción de `mapa-uso-tablas` mantiene «Logística página 32» como gap, mientras `ROADMAP.md` Fase 6 declara `gaps: []`.
- La descripción de `hoja-turnos` afirma que el turno guiado no tiene contador de banda, pero el contador ya está implementado.
- La descripción de `hoja-ataque-guiado-superficie` afirma que «Disparo en Área» no está automatizado, pero el wizard sí lo resuelve.
- `ROADMAP.md:278-281` mantiene sin marcar unidad, plan, lectura de valores y validación de alcance, aunque COR-007 implementó esas funciones.
- `development_status.md` conserva referencias a funciones del wizard dentro de `public/js/app.js`, aunque COR-005 las trasladó a `public/js/views/antiship-guided-wizard.js`.
- El estado visible de secuencia de turno aún contiene frases que dicen que no existe contador de banda.

#### Problema

`AGENTS.md` §18 define `development_status.md` como fuente de verdad del contexto operativo. Las contradicciones hacen que un desarrollador no pueda conocer el alcance real sin volver a auditar el repositorio.

#### Corrección solicitada

Realizar una reconciliación única de:

- `ROADMAP.md`;
- `development_status.md`;
- `data/sources/sources.json`;
- `docs/rules/known-ambiguities.md`;
- comentarios que todavía señalen ubicaciones anteriores al refactor.

La documentación histórica puede conservarse, pero debe separarse claramente del estado vigente.

#### Criterios de aceptación

- Cada fase tiene un único estado vigente y un apartado histórico separado.
- No se describen como pendientes funciones ya implementadas.
- No se presentan como completas funciones aún parciales.
- Las rutas y nombres de archivo corresponden a la estructura actual.
- Una búsqueda automática de términos obsoletos no devuelve afirmaciones vigentes contradictorias.

#### Cierre

- **Fecha:** 2026-09-28.
- **Alcance de esta reconciliación:** las 6 contradicciones citadas explícitamente en la Evidencia, más 2 menciones adicionales de `public/js/app.js` en la sección "Estado actual" de `development_status.md` (mismo patrón que la evidencia 6, encontradas al buscar el mismo síntoma). **No** se reescribió el resto del historial fechado de `development_status.md` ni las entradas ya marcadas `resolved`/tachadas de `docs/rules/known-ambiguities.md` — esas secciones narran correctamente lo que era cierto en su fecha, y `AGENTS.md` §18.3 pide conservar la documentación histórica separada del estado vigente, no reescribirla. Reescribir cientos de líneas de historial fechado por una incidencia de "reconciliación" habría sido el error opuesto: ocultar cómo evolucionó realmente el proyecto.
- **Pruebas ejecutadas:** `npm test` → **282/282 OK** (281 + 1 nueva: guarda de regresión que comprueba que las 4 frases concretas ya corregidas en `sources.json` no reaparecen). No se ejecutó `npm run test:e2e` (cambio puramente de documentación/metadatos, sin superficie de UI).
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 7 y Fase 20), `development_status.md`, `data/sources/sources.json`.

#### Diseño implementado

**`data/sources/sources.json` (4 descripciones corregidas):**
- `decision-book.pendingSections`: ya no incluye el capítulo 6 entre lo pendiente (estaba en la misma frase que decía "cap. 6 íntegro desde 2026-09-27" — contradicción literal dentro de la propia oración).
- `mapa-uso-tablas`: el gap de "Logística página 32" se presenta como cerrado (apunta a `data/tables/page-32.json`), no como pendiente — coincide con `roadmap.md` Fase 6, que ya declaraba `gaps: []`.
- `hoja-turnos`: ya no afirma que el turno guiado carece de contador de banda de día — existe desde el 2026-09-27, y desde COR02-001 (esta misma sesión) cada banda persiste su propio progreso.
- `hoja-ataque-guiado-superficie`: "Disparo en Área" ya no se describe como "no automatizada en el wizard" — se automatizó como paso 1 del wizard el mismo 2026-09-25, poco después de escribirse la descripción original.

**`roadmap.md` Fase 7 (checklist "Flujo"):** las 4 tareas que seguían sin marcar (elegir unidad/plan, leer tipo/alcance/valor, validar alcance) pasan a `[x]`, citando COR-007 como la corrección que las cerró — la fase llevaba marcada "🎉 Cerrada como vertical slice" en su propio párrafo introductorio mientras su checklist seguía diciendo lo contrario.

**`development_status.md` ("Estado actual"):** 2 referencias a `public/js/app.js` para el wizard de ataque guiado y la navegación del turno guiado se actualizan a sus ubicaciones reales tras COR-005 (`public/js/views/antiship-guided-wizard.js`/`public/js/views/turn.js`), sin borrar la mención histórica de dónde vivían antes. La entrada de "Secuencia de turno y fases" que decía "todavía sin contador de banda de día" se corrige — esa misma frase se contradecía con otras 3 entradas más abajo en el propio archivo que sí documentan el contador correctamente.

**Guarda de regresión (`test/data.test.js`):** un test nuevo comprueba que las 4 frases concretas de `sources.json` corregidas arriba no reaparecen — no vuelve a auditar el repositorio entero (eso sería un test frágil e inmantenible), solo protege esta reconciliación puntual de revertirse por accidente.

**Deliberadamente no tocado:** el historial narrativo fechado de `development_status.md` (secciones `### ... (2026-09-2X)` y la lista numerada 1-92) y las entradas ya `resolved`/tachadas de `known-ambiguities.md` — ver "Alcance de esta reconciliación" arriba.

---

### COR02-009 — Probar realmente la cobertura 198/198 de recortes de unidades

**Prioridad:** Media  
**Tipo:** Calidad de pruebas / Integridad de datos  
**Fases afectadas:** 3.5  
**Estado:** Resuelta (2026-09-28)

#### Evidencia

`data/ammunition/source-pages/unit-regions.json` contiene 198 regiones y declara cobertura completa. Sin embargo, `test/data.test.js:942-967` solo verifica que cada región existente apunte a una unidad válida, una imagen válida y coordenadas dentro de límites.

El test no comprueba el sentido inverso: que cada una de las 198 unidades de armamento tenga exactamente una región. Tampoco detecta duplicados lógicos o una unidad eliminada accidentalmente del archivo de regiones.

#### Problema

La afirmación 198/198 depende de una revisión manual pasada, pero no queda protegida contra regresiones futuras.

#### Corrección solicitada

Construir el conjunto esperado a partir de `attack-plans`, `special-unit-plans` y `naval-plans`, y compararlo por igualdad con las claves de `unit-regions.json`.

#### Criterios de aceptación

- El test compara tamaño e igualdad de ambos conjuntos.
- Falla si falta una unidad, sobra una región o existe una identificación duplicada.
- El texto de cobertura se genera o valida contra el recuento real.

#### Cierre

- **Fecha:** 2026-09-28.
- **Pruebas ejecutadas:** `npm test` → **271/271 OK** (270 + 1 nueva). El nuevo test pasó a la primera contra los datos reales — confirma que la afirmación "cobertura completa 198/198" (`unit-regions.json#coverage`) es correcta hoy, y a partir de ahora queda protegida frente a regresiones futuras. Verificado además con una simulación manual fuera de la suite (script de un solo uso, no incorporado): borrar una clave de `unit-regions.json.units` hace que el test detecte exactamente esa unidad como "missing"; añadir una clave con un id inventado la detecta como "extra" — confirma que la lógica de comparación de conjuntos funciona en ambos sentidos, no solo en el caso ya-correcto.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 20), `development_status.md`.

#### Diseño implementado

**`test/data.test.js`:** nuevo test, junto al ya existente que verifica el sentido "cada región apunta a una unidad real". Construye `expectedUnitIds` exactamente igual que el test anterior (unión de `id` de `attack-plans`, `special-unit-plans` y `naval-plans.surfaceShips`/`submarines` de los 6 países) y `regionUnitIds` a partir de `Object.keys(unit-regions.json.units)`; compara ambos conjuntos por diferencia en los dos sentidos (`missing`/`extra`, listados por nombre en el mensaje de fallo para facilitar el diagnóstico), compara el tamaño de ambos conjuntos (para detectar el caso "clave JSON duplicada silenciosamente colapsada por `JSON.parse`", ya que un objeto JS no puede tener dos claves iguales tras parsear — la única forma de que sobreviva una duplicación lógica es que el tamaño del conjunto de claves sea menor de lo esperado) y, por último, fija el número 198 explícitamente contra `expectedUnitIds.size` para que un cambio legítimo en el número de unidades transcritas obligue a revisar también la afirmación de cobertura en `unit-regions.json`/`AGENTS.md`/`development_status.md` en vez de pasar desapercibido.

**No se tocó `unit-regions.json` ni ningún archivo de `ammunition/`:** esta incidencia era puramente de cobertura de test (el dato ya era correcto, solo le faltaba una prueba que lo protegiera).

---

### COR02-010 — Mantener la Fase 8 abierta hasta disponer de módulos defensivos reutilizables

**Prioridad:** Alta para planificación; Media para ejecución inmediata  
**Tipo:** Alcance / Gestión del roadmap  
**Fases afectadas:** 8  
**Estado:** Resuelta parcialmente (2026-09-28) — ver "Cierre" más abajo; Fase 8 sigue abierta por diseño (ver `roadmap.md`).

#### Evidencia

`ROADMAP.md:306-322` indica expresamente que el criterio de salida no está cumplido. Permanecen sin cerrar:

- defensa antiaérea de área como módulo compartido;
- interceptación final integrada en un flujo;
- interceptación de munición reutilizada por otros ataques;
- interceptación de misiles balísticos con elegibilidad conectada;
- contraataque a baja altura con wizard o consumidor real.

Las piezas existentes son funciones puras o lógica consumida únicamente por `antiship_guided`.

#### Problema

La petición de revisar las «fases 0 a 8 ya cerradas» no coincide con el estado del propio roadmap. Marcar Fase 8 como cerrada ocultaría trabajo funcional pendiente y violaría la Definition of Done.

#### Corrección solicitada

Mantener la fase abierta y diseñar una API defensiva común que pueda ser consumida por ataques guiados y no guiados sin duplicación. La fase deberá incluir integración real, no solo funciones sin consumidor.

#### Criterios de aceptación

- Al menos dos workflows distintos consumen los mismos módulos defensivos. **Cumplido:** `antiship_guided` y `antiship_unguided` consumen ahora `resolveInterceptionShot`/`sumInterceptionReductions` (Interceptación de Munición) sin duplicar la función, cada uno con la tabla de su propio workflow.
- Elegibilidad, modificadores, consumo, tiradas y resultados están en datos o dominio compartido. **Cumplido para los 2 mecanismos reutilizados** (Interceptación de Munición, y de paso `CombatModifierEngine.resolveAttackValueColumnShift` de Fase 5); Defensa Antiaérea de Área/Interceptación de Misiles Balísticos/Contraataque a Baja Altura quedan fuera de este incremento.
- Existe un flujo interactivo o integración real para cada tarea marcada como terminada. **Cumplido para las 2 tareas que se marcan `[x]` en esta incidencia** (Interceptación Final, Interceptación de Munición) — ninguna otra tarea de Fase 8 se marca como terminada sin tener un consumidor real.
- Hay tests normales, límites y excepciones por mecanismo. **Cumplido:** ver "Cierre" (tests nuevos por mecanismo, más un escenario de extremo a extremo).
- El criterio de salida de `ROADMAP.md` puede marcarse sin matices contradictorios. **No cumplido íntegramente, a propósito:** el criterio de salida de Fase 8 sigue con matices (3 de 5 gaps de la auditoría original permanecen abiertos) — la corrección solicitada pedía "mantener la fase abierta", no cerrarla; este incremento reduce el alcance real de lo que queda abierto sin fingir un cierre que no corresponde.

#### Cierre

- **Fecha:** 2026-09-28.
- **Alcance elegido (de 2 candidatos presentados al mantenedor):** construir un segundo wizard real (`antiship_unguided`, workflow 08) en vez de refactorizar primero los módulos ya existentes sin un segundo consumidor que los ejercite — evita el riesgo de "generalizar en abstracto" sin un caso real que confirme que la generalización es correcta. Entre los 2 workflows candidatos que más reutilización ofrecían (`antiship_unguided`, que reutiliza Interceptación Final —sin ningún consumidor hasta ahora— e Interceptación de Munición; o `anti_radiation`, que reutiliza Defensa Antiaérea de Área e Interceptación de Munición), se eligió `antiship_unguided` por compartir además el dominio antibuque con el wizard ya existente (reutiliza también la asignación de impactos/hundimiento).
- **Pruebas ejecutadas:** `npm test` → **285/285 OK** (283 + 2 nuevas de esquema/reuso, más un test de escenario de extremo a extremo que encadena las 4 funciones puras del wizard con los valores exactos verificados en el navegador). `npm run test:e2e` → **23/23 OK** (21 ya existentes sin cambios en sus archivos de test — confirma que ningún cálculo cambió de resultado — + 2 nuevas en `test/e2e/antiship-unguided.spec.js`, cubriendo el flujo completo de 4 pasos con asignación de impactos, y el enlace desde "Combate por tipo"). Verificado además manualmente en el navegador paso a paso (con recarga completa de página para descartar JS en caché), incluido guardar en historial y "↻ Repetir", sin errores de consola.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 8), `development_status.md`.

#### Diseño implementado

**Nuevo wizard `public/js/views/antiship-unguided-wizard.js`** (4 pasos: Intercepción Final → Datos base del ataque → Interceptación de Munición → Modificación de Intensidad y Resultado), mismo patrón UMD/estado/render que `antiship-guided-wizard.js`/`ground-close-combat-wizard.js` (vínculo con el turno guiado vía COR02-003, guardar/repetir en historial, `Router.currentToken()`/`isCurrent`).

**Reutilización real, sin cambios en las funciones reutilizadas:**
- `CombatWizardEngine.resolveFinalInterceptionShot` (ya existía, sin consumidor) — paso 1, contra `ground-unguided-final-interception` (page-07.json, reutilizada en page-23.json).
- `CombatWizardEngine.resolveInterceptionShot`/`sumInterceptionReductions` (ya consumidas por `antiship_guided`) — paso 3, contra `munition-interception-unguided` (page-08.json, reutilizada en page-24.json). `CombatWizardEngine.deriveShortRangeRestriction` (COR02-004) también se reutiliza sin cambios para el mismo caso ambiguo (distancia exactamente 2 hex.).
- `CombatModifierEngine.resolveAttackValueColumnShift` (Fase 5, sin consumidor) — paso 4, con `valueCap: Infinity` porque este workflow (a diferencia de §5.12.10/§5.13.6, los únicos con un límite de Valor de Ataque citado) no declara ningún tope: con el cap en infinito la función se comporta exactamente como el desplazamiento simple que sí describe el propio workflow ("los valores negativos desplazan columnas a la izquierda, se omite la columna '.'"), sin inventar un límite que la fuente no da.
- `CombatWizardEngine.assignImpactTarget`/`applyImpactsToShip`/`checkSinking` — misma mecánica de asignación de daño que `antiship_guided` (Decision Book §5.6.5), con `damagePerImpact` fijo en 1 (el caso documentado en page-25.json; la variante de 2 daños depende de un icono de Protección ilegible en la fuente, ya marcado `needsReview`).

**Alcance deliberadamente NO igual al de COR-007 (selección de unidad/plan):** no existe ningún plan de ataque antibuque con icono `munition_unguided` transcrito en `data/ammunition/` (verificado: 0 de 0) — el ataque naval no guiado de este juego es Combate Naval Cercano con Artillería, cuyo Valor de Ataque se calcula sumando valores de combate de unidades, un dato que este proyecto no modela todavía por unidad. El wizard pide el Valor de Ataque a mano, con una nota explícita — no es una regresión respecto a COR-007, es la única opción honesta con los datos disponibles (AGENTS.md §14).

**Extensión menor de `combat-wizard-engine.js`:** `parseDistanceBucketValue` gana un tercer formato (número suelto `"N"` como rango exacto [N,N]), necesario porque `attack_intensity#distance` del workflow 08 usa `"0"`/`"1"`/`"2plus"` (sin el formato `"N_M"` que ya soportaba de workflow 07).

**Integración:** nueva tarjeta en Inicio, ruta `#/wizard/antiship-unguided`, entrada en `WORKFLOW_WIZARD_HASHES` (`core.js`) — enlaza automáticamente desde "Combate por tipo" y el router de tablas, mismo mecanismo ya compartido por los otros 2 wizards — y rama nueva en `views/history.js` para "↻ Repetir".

**Deliberadamente no implementado en esta incidencia:** Defensa Antiaérea de Área como módulo compartido (necesitaría un wizard para `ground_guided`/`anti_radiation`, que sí la declaran), Interceptación de Misiles Balísticos e Interceptación/Contraataque a Baja Altura (ninguno tiene todavía un dominio con wizard propio — Fase 9/13). Quedan como trabajo futuro explícito, no ocultado.

---

### COR02-011 — Reducir la concentración de responsabilidades en las vistas extraídas

**Prioridad:** Media-Baja  
**Tipo:** Mantenibilidad  
**Fases afectadas:** Transversal / seguimiento de COR-005  
**Estado:** Pendiente

#### Evidencia

COR-005 redujo correctamente `public/js/app.js` a 216 líneas, pero trasladó una concentración significativa a:

- `public/js/views/help.js`: aproximadamente 1.700 líneas;
- `public/js/views/antiship-guided-wizard.js`: aproximadamente 1.000 líneas;
- `public/js/core.js`: más de 700 líneas y responsabilidades de DOM, carga de datos, recursos de munición, counters e imágenes.

#### Problema

La raíz de composición ha mejorado, pero los nuevos módulos siguen mezclando carga, estado, reglas de presentación y renderizado de múltiples pantallas. El coste de cambio y el riesgo de regresión seguirán creciendo con las fases 8 a 14.

No se considera un fallo funcional actual, sino deuda técnica que conviene resolver antes de añadir varios wizards.

#### Corrección solicitada

- Dividir `help.js` por categorías funcionales.
- Dividir el wizard en estado/controlador, adaptador de datos y vistas por paso.
- Separar en `core.js` las utilidades DOM puras de los repositorios/cargadores de dominio.
- Mantener dependencias explícitas y evitar nuevos objetos globales.

#### Criterios de aceptación

- Cada módulo tiene una responsabilidad funcional identificable.
- Los cálculos permanecen fuera de la UI.
- La división no altera las nueve pruebas E2E existentes.
- Se añaden tests unitarios para cualquier lógica extraída que hoy solo esté ejercitada a través del navegador.

## 5. Incumplimientos de `AGENTS.md` confirmados

La respuesta a «¿se cumplen todas las reglas de `AGENTS.md`?» es **no**. Los incumplimientos o cumplimientos parciales confirmados son:

1. **Navegación reversible:** el cambio de banda elimina progreso sin recuperación (`COR02-001`).
2. **Máquina de estados:** no existe nodo actual ni transición secuencial obligatoria (`COR02-002`).
3. **Pendientes al cerrar fase:** no se modelan resoluciones activas (`COR02-003`).
4. **Wizard determinista:** el modo validado permite respuestas contradictorias (`COR02-004`).
5. **Definition of Done:** balístico y espacio cercano no llegan a asignación de daño (`COR02-005`).
6. **Datos antes que lógica:** persisten valores, secuencias y textos fijos en JavaScript (`COR02-006`).
7. **Trazabilidad:** `sourceRefs` no se validan contra un registro canónico (`COR02-007`).
8. **Testing de contenido:** algunas afirmaciones de cobertura no están protegidas en ambos sentidos (`COR02-009`).
9. **Finalización de funcionalidades:** Fase 8 no está integrada ni reutilizada por varios ataques (`COR02-010`).

Sí se consideran cumplidos o correctamente encaminados:

- stack HTML/JavaScript/Node y despliegue web;
- separación general entre `public/`, servidor y `data/`;
- uso de tablas JSON estructuradas para los cálculos principales;
- prevención de invención silenciosa en los casos incompletos revisados;
- referencias de fuente presentes en la mayoría de datos de reglas;
- funciones puras para los motores principales;
- navegación de ayuda, tablas, counters y munición;
- accesibilidad del diálogo de ayuda corregida por COR-008;
- suite unitaria y E2E ejecutable y actualmente verde.

## 6. Orden recomendado de ejecución

### Bloque 1 — Integridad del estado

1. `COR02-001` — preservar o confirmar el progreso al cambiar de banda.
2. `COR02-003` — modelar resoluciones pendientes.
3. `COR02-002` — completar la máquina de estados del turno.

### Bloque 2 — Corrección del vertical slice

4. `COR02-004` — derivar todas las propiedades conocidas del plan.
5. `COR02-005` — completar o excluir métodos sin resolución final.

### Bloque 3 — Arquitectura y trazabilidad

6. `COR02-007` — normalizar fuentes y `sourceId`.
7. `COR02-006` — externalizar reglas y textos fijos.
8. `COR02-009` — cerrar la prueba de cobertura de recortes.

### Bloque 4 — Reconciliación y evolución

9. `COR02-008` — reconciliar documentación.
10. `COR02-011` — reducir módulos de vista antes de multiplicar wizards.
11. `COR02-010` — desarrollar y cerrar Fase 8 con reutilización real.

## 7. Condición recomendada para volver a declarar cerradas las fases

No debería volver a declararse cerrada una fase afectada hasta que:

- todas sus correcciones de prioridad alta estén resueltas;
- los criterios de aceptación de este documento tengan pruebas automatizadas;
- `npm test` y `npm run test:e2e` permanezcan en verde;
- la documentación vigente coincida con el código;
- `development_status.md` registre los tests realmente ejecutados y el alcance visible;
- `git diff` no muestre cambios accidentales;
- no queden limitaciones funcionales presentadas al usuario como capacidades completas.

## 8. Conclusión

El proyecto ha mejorado de forma sustancial con COR-001 a COR-008: el progreso por campaña, la robustez del servidor, la cobertura E2E, la accesibilidad y la modularización básica son avances reales y verificables.

La segunda revisión, sin embargo, demuestra que el cierre documental fue más amplio que el cierre técnico en varios puntos. Las fases 0, 2, 4 y 7 necesitan correcciones adicionales; la Fase 8 continúa abierta por definición. El riesgo inmediato no está en que las pruebas actuales fallen, sino en que cubren el comportamiento implementado y no todos los requisitos de estado, trazabilidad y determinismo establecidos por `AGENTS.md`.

La recomendación es corregir primero la integridad de sesión y las contradicciones del modo validado, después consolidar la trazabilidad y la arquitectura declarativa, y solo entonces ampliar los dominios defensivos de la Fase 8.

## 9. Cierre de este documento (2026-09-28)

**Este documento se da por cerrado.** Las 11 incidencias quedan en el estado siguiente, verificado contra el código real en el momento del cierre:

- **Resueltas íntegramente:** COR02-001, COR02-003, COR02-004, COR02-005, COR02-006, COR02-007, COR02-008, COR02-009.
- **Resuelta parcialmente, por diseño:** COR02-010 — Fase 8 queda abierta a propósito (segundo consumidor real logrado para Interceptación Final/Interceptación de Munición; Defensa Antiaérea de Área/Interceptación de Misiles Balísticos/Contraataque a Baja Altura siguen pendientes de un tercer dominio con wizard propio).
- **Diferida por decisión del mantenedor, sin reabrir:** COR02-011 — el mantenedor pidió expresamente abordarla en una sesión aparte, con contexto fresco.
- **⚠️ Revocada por una decisión de producto posterior (`correcciones03.md`, 2026-09-28):** **COR02-002**. La interpretación de "turno guiado" como máquina de estados con una única "fase actual" obligatoria —correcta según el `AGENTS.md` vigente en el momento en que se implementó— fue sustituida por una decisión de producto explícita del mantenedor: el turno guiado debe ser una ayuda de consulta y seguimiento de **uso libre, parcial y no prescriptivo**. Esto NO es un defecto de la implementación original de COR02-002 (que cumplió fielmente lo que entonces pedía `AGENTS.md`): es un cambio de criterio de producto posterior, ya incorporado al `AGENTS.md` vigente (§§1, 3.1, 6, 12.1). La corrección de código correspondiente se registra como **COR03-001** en `correcciones03.md`; no se reescribe aquí el análisis original de COR02-002 (AGENTS.md §18.3: la documentación histórica se conserva, marcada como sustituida, no se borra).

**Seguimiento futuro:** las 2 incidencias que continúan abiertas (COR02-010, COR02-011) y la revocación de COR02-002 se recogen y amplían en `correcciones03.md` (Fase 21 de `roadmap.md`) como COR03-005, COR03-006 y COR03-001/COR03-003 respectivamente. Cualquier trabajo nuevo sobre navegación del turno, Fase 8 o el tamaño de las vistas extraídas debe partir de `correcciones03.md`, no reabrir este documento.
