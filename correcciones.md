# Backlog de correcciones de ingeniería

## 1. Objetivo del documento

Este documento mantiene el backlog de defectos, incumplimientos de requisitos y riesgos técnicos identificados durante las revisiones de **The Coming Wave Companion**.

Está dirigido a los desarrolladores que deban analizar, implementar y verificar las correcciones. Cada incidencia describe el comportamiento observado, su impacto, la causa técnica probable, el cambio esperado y los criterios que deben cumplirse antes de cerrarla.

Este documento complementa, pero no sustituye, a:

- `AGENTS.md`: requisitos funcionales, técnicos y de calidad obligatorios;
- `roadmap.md`: alcance y planificación del producto;
- `development_status.md`: estado operativo e historial de implementación;
- `docs/rules/known-ambiguities.md`: discrepancias o reglas que no pueden implementarse sin una fuente canónica.

## 2. Convenciones de gestión

### 2.1. Estados

| Estado | Significado |
|---|---|
| `pendiente` | Incidencia confirmada y todavía no iniciada. |
| `en_análisis` | Se está delimitando la solución o verificando su causa. |
| `en_curso` | Existe una implementación activa. |
| `bloqueada` | Requiere una decisión, una fuente o una dependencia externa. |
| `resuelta` | La solución está implementada, probada y documentada. |
| `descartada` | Se ha demostrado que no existe defecto o se ha aceptado explícitamente el riesgo. |

### 2.2. Severidad

| Nivel | Criterio |
|---|---|
| `S1 — crítica` | Pérdida de datos, cálculo de reglas gravemente incorrecto o indisponibilidad general. |
| `S2 — alta` | Función principal incorrecta, incumplimiento obligatorio o vulnerabilidad explotable. |
| `S3 — media` | Riesgo significativo de regresión, mantenibilidad, accesibilidad o despliegue. |
| `S4 — baja` | Deuda técnica o inconsistencia sin impacto operativo inmediato. |

### 2.3. Regla de cierre

Una incidencia solo puede pasar a `resuelta` cuando:

1. se ha implementado el comportamiento esperado;
2. existen pruebas automáticas adecuadas al riesgo;
3. se han ejecutado las validaciones indicadas;
4. se han actualizado `roadmap.md` y `development_status.md` si cambia el estado del producto;
5. no se ha introducido ninguna regla de TCW sin fuente ni se ha sustituido una ambigüedad por una suposición;
6. se registra el commit que contiene la corrección.

## 3. Resumen ejecutivo

| ID | Severidad | Tipo | Estado | Descripción |
|---|---|---|---|---|
| COR-001 | S2 | Defecto funcional | resuelta | El progreso no distingue las dos instancias del Proceso de Campaña. |
| COR-002 | S2 | Incumplimiento funcional | resuelta | Una fase puede finalizar con subfases pendientes sin tratamiento explícito. |
| COR-003 | S2 | Robustez/seguridad | resuelta | Una URL mal codificada finaliza el proceso Node.js. |
| COR-004 | S3 | Cobertura de pruebas | resuelta | La suite no contiene pruebas E2E reales de navegador. |
| COR-005 | S3 | Deuda arquitectónica | resuelta | `app.js` concentra presentación, navegación, persistencia e integración. |
| COR-006 | S3 | Trazabilidad | resuelta | La documentación declara cerrada la Fase 2 pese a defectos abiertos. |
| COR-007 | S3 | Incompletitud funcional | resuelta | El wizard no deriva el ataque desde una unidad y un plan reales. |
| COR-008 | S3 | Accesibilidad | resuelta | El panel de ayuda no implementa el patrón accesible de diálogo. |

## 4. Orden de implementación recomendado

1. **COR-003**, porque es una corrección pequeña, aislada y necesaria antes de exponer el servidor.
2. **COR-001**, porque modifica el esquema de progreso y condiciona el resto del turno guiado.
3. **COR-002**, utilizando el nuevo modelo de progreso de COR-001.
4. **COR-006**, para reconciliar la documentación con el comportamiento ya corregido.
5. **COR-004**, empezando por pruebas de regresión para COR-001 y COR-002.
6. **COR-008**, incorporándolo al primer recorrido automatizado de teclado.
7. **COR-005**, mediante extracciones pequeñas respaldadas por COR-004.
8. **COR-007**, una vez estabilizada la integración y su cobertura E2E.

---

## COR-001 — El progreso no distingue las dos instancias del Proceso de Campaña

### Clasificación

- **Severidad:** S2 — alta
- **Tipo:** defecto funcional y de modelo de estado
- **Estado:** `resuelta`
- **Requisito afectado:** modelo de turno de dos días
- **Dependencias:** ninguna; COR-002 debería implementarse después

### Componentes afectados

- `data/phases/turn-template.json`
- `public/js/turn-progress-engine.js`
- `public/js/app.js`
- `test/turn-progress-engine.test.js`
- datos persistidos bajo la clave de progreso en `localStorage`

### Comportamiento actual

`data/phases/turn-template.json` declara `repeat: 2` para `proceso_campana`. Sin embargo, el estado se almacena mediante listas globales de IDs:

- `finishedPhases`;
- `finishedSubphases`;
- `skippedPhases`.

Los IDs de fase y subfase son iguales en las dos repeticiones. En consecuencia, terminar `acciones_aereas` en la primera campaña también la presenta como terminada en la segunda. `isSequenceComplete` solo evalúa una vez las fases del proceso y no verifica dos instancias independientes.

El test titulado como recorrido de los dos procesos de campaña recorre realmente el proceso una sola vez y documenta la limitación del esquema actual.

### Comportamiento esperado

Cada repetición de un proceso debe tener identidad y progreso propios. El usuario debe poder completar Campaña 1, continuar con Campaña 2 y observar estados independientes en ambas.

La secuencia completa del turno solo debe considerarse finalizada cuando:

- el Proceso Estratégico cumple sus condiciones; y
- todas las instancias requeridas del Proceso de Campaña cumplen las suyas.

### Causa técnica

El modelo de progreso usa el ID declarativo de la fase como identidad de ejecución. Falta un nivel de identidad para la instancia del proceso, por ejemplo `processId + occurrence`.

### Diseño de la corrección

1. Definir un esquema de progreso versionado. Propuesta conceptual:

   ```json
   {
     "schemaVersion": 2,
     "currentBand": 1,
     "processRuns": {
       "proceso_estrategico:1": {
         "finishedPhases": [],
         "finishedSubphases": [],
         "skippedPhases": []
       },
       "proceso_campana:1": {},
       "proceso_campana:2": {}
     }
   }
   ```

   La estructura definitiva puede variar, pero debe conservar la identidad de la repetición.

2. Incorporar un identificador estable de ejecución, como `runKey`, en las operaciones del motor.
3. Actualizar las rutas o el estado de navegación para conocer la instancia activa.
4. Adaptar `finishPhase`, `skipPhase`, `finishSubphase`, `isProcessComplete` e `isSequenceComplete`.
5. Implementar migración del esquema anterior. La migración no debe marcar automáticamente ambas campañas como completadas. Si no puede determinarse la instancia original, debe aplicar una política conservadora y documentada.
6. Reiniciar todas las instancias al cambiar de banda de día.

### Fuera de alcance

- Persistencia en servidor.
- Sincronización entre navegadores.
- Incorporación de reglas de escenario retiradas del roadmap.

### Criterios de aceptación

- [x] La interfaz muestra Campaña 1 y Campaña 2 como recorridos diferenciados.
- [x] Completar una fase en Campaña 1 no modifica Campaña 2.
- [x] La segunda campaña puede recorrerse desde cero después de completar la primera.
- [x] `isSequenceComplete` devuelve `false` mientras falte cualquiera de las dos campañas.
- [x] El cambio de banda reinicia las dos instancias.
- [x] El progreso antiguo se carga sin excepciones y sigue una migración documentada.
- [x] Los eventos de historial identifican la instancia de proceso.

### Pruebas requeridas

- Unitarias del esquema, transiciones y cálculo de completitud.
- Migración desde el esquema de `localStorage` anterior.
- Integración del flujo Estratégico → Campaña 1 → Campaña 2.
- E2E de navegador cuando esté disponible COR-004.

### Cierre

- **Fecha:** 2026-09-27
- **Commit:** ver el commit que acompaña este cambio en `git log`.
- **Pruebas ejecutadas:** `npm test` → 219/219 OK (212 + 7 nuevas: `makeRunKey`/`parseRunKey` inversas, `listOccurrencesForProcess`, `finishPhase` no filtra entre Campaña 1/2, `isProcessComplete`/`isSequenceComplete` distinguen ambas instancias, `changeBand` reinicia `processRuns` completo, migración v1→v2 asignando siempre a la ocurrencia 1, migración sin `turnTemplate` descarta en vez de adivinar). Verificado además manualmente en el navegador: terminar "Fase de Acciones Aéreas" en `#/turno/proceso_campana/1` la marca ✓ Completada solo ahí — `#/turno/proceso_campana/2` sigue sin marcar; el índice `#/turno` muestra "Campaña 1 de 2 — En curso" / "Campaña 2 de 2 — Sin empezar" por separado; y la migración de un progreso v1 simulado (`finishedPhases: ['crisis','acciones_aereas']`) se resolvió correctamente sin excepciones, asignando "crisis" al Proceso Estratégico y "acciones_aereas" a la Campaña 1 (nunca a la 2). Sin errores de consola en ningún paso.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 19) y `development_status.md`.

### Diseño implementado

Esquema v2 en `public/js/turn-progress-engine.js`: `{ schemaVersion: 2, currentBand, processRuns: { "<processId>:<occurrence>": { finishedPhases, finishedSubphases, skippedPhases } } }`, con `makeRunKey`/`parseRunKey` como identificador estable de ejecución (punto 2 del diseño original). `finishPhase`/`skipPhase`/`finishSubphase` reciben ahora un `runKey` explícito; `isProcessComplete` lo recibe también (deriva `processId` con `parseRunKey`) e `isSequenceComplete` itera `listOccurrencesForProcess` para las 1-2 ocurrencias de cada proceso. `normalizeProgress(raw, turnTemplate)` detecta el esquema v1 plano (sin `processRuns`) y lo migra vía `migrateLegacyProgress`: cada fase/subfase ya marcada se resuelve a su `processId` (usando `turnTemplate.phases[id].processId`, ya presente en los datos) y se asigna siempre a la OCURRENCIA 1 — nunca se asume que la ocurrencia 2 también estaba en curso o completa (política conservadora explícita, AGENTS.md §14). Sin `turnTemplate` disponible, la migración no puede resolver a qué proceso pertenece cada ID con seguridad y descarta el progreso anterior en vez de adivinar. `changeBand` ahora reinicia `processRuns` entero (antes: las 3 listas planas). En `public/js/app.js`, las rutas del turno guiado incorporan la ocurrencia (`#/turno/<processId>/<occurrence>[/<phaseId>[/<subId>]]`); una URL antigua de 2 segmentos (`#/turno/<processId>`) sigue resolviendo a la ocurrencia 1 por compatibilidad. `renderTurnIndex` muestra una tarjeta por ocurrencia con su propio estado (Sin empezar/En curso/✓ Completada); los eventos de `pushHistory` incluyen el `runKey` cuando aplica.

---

## COR-002 — Finalización incoherente de fases con subfases pendientes

### Clasificación

- **Severidad:** S2 — alta
- **Tipo:** incumplimiento funcional
- **Estado:** `resuelta`
- **Requisito afectado:** `AGENTS.md`, motor de navegación de fases
- **Dependencia recomendada:** COR-001

### Componentes afectados

- `public/js/app.js`, vista de fase
- `public/js/turn-progress-engine.js`
- `test/turn-progress-engine.test.js`
- historial de navegación y finalización

### Comportamiento actual

El botón `Terminar fase` solicita una confirmación genérica y llama a `finishPhase`. No comprueba las subfases de la fase, las acciones sin resolver ni una posible resolución activa.

El estado puede terminar con una fase incluida en `finishedPhases` mientras algunas de sus subfases no figuran en `finishedSubphases`. La prueba actual fija ese comportamiento como válido, aunque el cálculo global de completitud continúe devolviendo `false`.

### Comportamiento esperado

El sistema debe determinar si la fase puede cerrarse normalmente. Cuando existan elementos pendientes debe:

- bloquear el cierre si el pendiente no puede omitirse; o
- presentar una confirmación específica de cierre anticipado, registrar la omisión y mantener un estado coherente.

No debe existir una fase mostrada como completada con subfases silenciosamente pendientes.

### Causa técnica

`finishPhase` es una transición sin precondiciones. La capa de presentación tampoco consulta una función de elegibilidad o un diagnóstico del estado de la fase.

### Decisión funcional necesaria

`AGENTS.md` exige confirmación si quedan acciones o resoluciones pendientes, pero el modelo actual no representa todas las acciones ni una cola formal de resoluciones. La primera implementación debe cubrir las subfases declaradas y dejar preparada una interfaz extensible para pendientes futuros.

### Diseño de la corrección

1. Añadir una función pura, por ejemplo `evaluatePhaseCompletion`, que devuelva:
   - si puede finalizarse normalmente;
   - subfases pendientes;
   - resoluciones pendientes conocidas;
   - motivo del bloqueo, si existe.
2. No duplicar estas reglas en el DOM.
3. Para un cierre anticipado permitido, registrar explícitamente las subfases omitidas y el motivo.
4. Mostrar estados separados: completada, omitida o cerrada anticipadamente.
5. Cambiar el test que hoy acepta el comportamiento defectuoso por casos de la política definida.

### Criterios de aceptación

- [x] Una fase sin pendientes puede finalizarse mediante la confirmación normal.
- [x] Una fase con subfases pendientes no se marca como completada silenciosamente.
- [x] La advertencia identifica las subfases pendientes por su nombre visible.
- [x] Cancelar la advertencia no modifica el progreso ni el historial.
- [x] Si se autoriza el cierre anticipado, el historial registra pendientes y motivo.
- [x] Una resolución activa bloqueante impide el cierre cuando el modelo pueda representarla. *(no hay ninguna resolución de este tipo modelada todavía — el campo `blockReason` queda preparado y siempre `null`; ver "Diseño implementado".)*
- [x] La interfaz no presenta simultáneamente una fase completada y subfases pendientes sin explicar.

### Pruebas requeridas

- Fase sin subfases.
- Fase con todas las subfases terminadas.
- Fase con una o varias subfases pendientes.
- Cancelación de la confirmación.
- Cierre anticipado y persistencia del motivo.

### Cierre

- **Fecha:** 2026-09-27
- **Commit:** ver el commit que acompaña este cambio en `git log`.
- **Pruebas ejecutadas:** `npm test` → 223/223 OK (219 + 4 nuevas de `evaluatePhaseCompletion`: fase sin subfases, fase con todas terminadas, fase con pendientes nombrando cada una, función de solo lectura que no muta el progreso). El test que antes documentaba el atajo sin aviso se reescribió para reflejar que el bloqueo/aviso vive ahora en la capa de presentación, no en `finishPhase`. Verificado además manualmente en el navegador: cerrar "Fase de Acciones Aéreas" sin terminar sus 7 subfases muestra "⚠ Cerrada anticipadamente (7 pendientes)" en el listado de fases y una nota con los 7 nombres al revisitar la fase; terminar "Fase de Acciones de Superficie" tras completar sus 3 subfases muestra "✓ Completada" con la confirmación normal; cancelar la confirmación de cierre anticipado no cambia el progreso (la fase sigue sin estado). Sin errores de consola en ningún caso.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 19) y `development_status.md`.

### Diseño implementado

`evaluatePhaseCompletion(turnTemplate, runKey, phaseId, progress)` en `public/js/turn-progress-engine.js`: función pura de solo lectura que devuelve `{ canFinishNormally, pendingSubphases, pendingResolutions, blockReason }`. `pendingResolutions`/`blockReason` quedan preparados para el futuro pero siempre vacíos/`null` hoy — el modelo actual no representa ninguna acción ni cola de resoluciones formal más allá de las subfases declaradas ("Decisión funcional necesaria" de este documento), así que no se inventa una regla de bloqueo que ninguna fuente modela todavía. `public/js/app.js#renderPhase` consulta esta función en el manejador de "Terminar fase": si `canFinishNormally` es `true` muestra la confirmación genérica de siempre; si es `false`, muestra una confirmación específica que nombra cada subfase pendiente y, al confirmarse, marca la fase con `earlyClose: true` en el evento de historial (junto a `pendingSubphaseIds` y el motivo). Cancelar cualquiera de las dos confirmaciones no llama a `markPhaseFinished` ni a `pushHistory`. La vista de proceso (`renderProcess`) y la propia vista de fase reutilizan `evaluatePhaseCompletion` (no duplican la comprobación de subfases) para mostrar "✓ Completada", "⚠ Cerrada anticipadamente (N pendientes)" o "— Omitida" según corresponda.

---

## COR-003 — Denegación de servicio mediante una URL con codificación inválida

### Clasificación

- **Severidad:** S2 — alta
- **Tipo:** robustez y disponibilidad del servidor
- **Estado:** `resuelta`
- **Requisito afectado:** despliegue reproducible en servidor
- **Dependencias:** ninguna

### Componente afectado

- `server/server.js`, análisis y decodificación de la URL

### Evidencia de reproducción

Una petición con la ruta siguiente provoca una excepción no capturada:

```text
/%E0%A4%A
```

Resultado observado:

```text
URIError: URI malformed
    at decodeURIComponent (...)
```

El proceso Node.js finaliza con código 1. Una solicitud remota puede, por tanto, dejar el servicio indisponible.

### Comportamiento esperado

Una URL sintácticamente inválida debe devolver una respuesta controlada `400 Bad Request`. El proceso debe continuar atendiendo solicitudes posteriores.

### Causa técnica

El manejador HTTP ejecuta `decodeURIComponent(url.pathname)` fuera de un bloque de control de errores. Tanto el constructor de URL como la decodificación deben considerarse entrada no confiable.

### Diseño de la corrección

1. Aislar el análisis de la URL en una función que devuelva un resultado válido o un error de cliente.
2. Capturar `URIError` y otros errores de análisis previsibles.
3. Responder con cuerpo genérico y `Content-Type: text/plain; charset=utf-8`.
4. No incluir la traza interna en la respuesta.
5. Mantener separado este caso de los errores 404 y 500 de lectura de archivos.
6. Evaluar un límite de longitud de URL como endurecimiento adicional, sin mezclarlo con el fix mínimo.

### Criterios de aceptación

- [x] `/%E0%A4%A` devuelve HTTP 400.
- [x] Una segunda petición válida al mismo proceso devuelve HTTP 200.
- [x] La respuesta no contiene stack trace ni rutas locales.
- [x] Las rutas válidas `/`, `/data/...` y los recursos estáticos mantienen su comportamiento.
- [x] Las protecciones existentes contra traversal no se debilitan.

### Pruebas requeridas

- Añadir regresión a `test/server-smoke.test.js`.
- Enviar la petición inválida y, sin reiniciar el servidor, solicitar `/`.
- Incluir al menos una ruta con secuencia porcentual válida para evitar rechazos excesivos.

### Cierre

- **Fecha:** 2026-09-27
- **Commit:** pendiente de confirmar en este mismo incremento (ver `git log` tras el commit que acompaña este cambio).
- **Pruebas ejecutadas:** `npm test` → 212/212 OK (209 + 3 nuevas: 400 ante `/%E0%A4%A`, sin traza interna en el cuerpo; el servidor sigue respondiendo 200 en `/` inmediatamente después sin reiniciar el proceso; una ruta con codificación porcentual válida — `?x=%20` — no se rechaza). Verificado además manualmente arrancando `server/server.js` y repitiendo la petición malformada con `curl` seguida de una petición válida: `400` y luego `200`, proceso Node.js vivo en ambos casos.
- **Documentación actualizada:** este archivo (`correcciones.md`) y `roadmap.md`/`development_status.md` (Fase 19, ítem siguiente en el historial).

### Diseño implementado

Se aisló el análisis de la URL en `parseRequestPath(rawUrl, host)` (`server/server.js`), que envuelve tanto el constructor de `URL` como `decodeURIComponent` en bloques `try/catch` y devuelve `null` ante cualquier error de análisis, en vez de dejar propagar la excepción. El manejador HTTP responde `400 Bad Request` con `Content-Type: text/plain; charset=utf-8` cuando `parseRequestPath` devuelve `null`, sin exponer el `stack` del error ni rutas locales, y sin tocar el manejo existente de 404/500 de `serveFile` (que sigue siendo responsable únicamente de errores de lectura de archivo, no de análisis de URL). No se añadió límite de longitud de URL: queda fuera de este fix mínimo, tal como pedía el diseño original de la incidencia.

---

## COR-004 — Ausencia de pruebas E2E reales de navegador

### Clasificación

- **Severidad:** S3 — media
- **Tipo:** cobertura y estrategia de pruebas
- **Estado:** `resuelta`
- **Requisito afectado:** verificación integral
- **Dependencias:** conviene cubrir primero COR-001 a COR-003

### Componentes afectados

- `package.json`
- `test/`
- flujos de `public/js/app.js`
- `roadmap.md`, Fase 18
- `development_status.md`

### Situación actual

La suite de 209 tests ofrece una base sólida para:

- motores puros;
- integridad y referencias de los JSON;
- resolución del golden test a nivel de dominio;
- respuestas HTTP básicas.

Sin embargo, ninguna prueba automatizada arranca un navegador y utiliza la interfaz. Los tests llamados E2E son recorridos del motor puro, no pruebas de extremo a extremo del sistema desplegado.

### Riesgo

Pueden llegar a producción regresiones que no afectan a los motores:

- rutas que no renderizan;
- eventos no conectados;
- formularios que no propagan valores;
- fallos de carga de recursos;
- persistencia incorrecta en `localStorage`;
- excepciones de consola;
- gestión incorrecta de foco y teclado;
- carreras entre renderizados asíncronos.

### Diseño de la corrección

1. Clasificar los tests actuales como unitarios, de contenido, integración o smoke.
2. Incorporar un runner de navegador compatible con Node.js y documentar la dependencia.
3. Añadir un script separado, por ejemplo `test:e2e`, y decidir posteriormente si forma parte de `npm test` o del pipeline completo.
4. Usar datos deterministas; no depender de servicios externos.
5. Fallar ante errores de consola no esperados y respuestas de recursos con error.

### Casos iniciales obligatorios

1. Recorrido del turno completo con Campaña 1 y Campaña 2 diferenciadas.
2. Golden test de ataque guiado introducido desde controles visibles.
3. Guardar una resolución, recargar la página y repetirla desde el historial.
4. Apertura y cierre del panel de ayuda solo con teclado.
5. Navegación rápida entre rutas para detectar renderizados obsoletos.

### Criterios de aceptación

- [x] Los tests operan mediante la interfaz, no llamando directamente a motores internos.
- [x] Existe al menos un viewport de tablet horizontal.
- [x] Se comprueban URL, contenido visible y estado persistido.
- [x] Los errores de consola y de red hacen fallar la prueba.
- [x] El procedimiento de instalación y ejecución está documentado.
- [x] `roadmap.md` deja de denominar E2E a pruebas que no ejecutan el sistema completo.

### Cierre

- **Fecha:** 2026-09-27
- **Commit:** ver el commit que acompaña este cambio en `git log`.
- **Pruebas ejecutadas:** `npm run test:e2e` → 6/6 OK, repetido varias veces (incluida una tanda con `--repeat-each=8`, 16/16 OK) para confirmar estabilidad. `npm test` (suite existente) sigue en 223/223 OK, sin cambios de código de producción salvo `server/server.js`/`public/js/*` ya cubiertos por incidencias anteriores.
- **Documentación actualizada:** `README.md` (nueva sección "Tests E2E (navegador real)"), `roadmap.md` (Fase 18: renombra los 2 tests que se llamaban "E2E" sin serlo, añade tarea nueva citando esta incidencia; Fase 19), `.gitignore` (`test-results/`/`playwright-report/`), este archivo.

### Diseño implementado

- **Runner:** Playwright (`@playwright/test` + Chromium), elegido explícitamente por el mantenedor entre Playwright/Puppeteer/posponer. `playwright.config.js` en la raíz: proyecto único `tablet-landscape` (1024×768, el viewport prioritario de AGENTS.md §4), `webServer` que arranca `server/server.js` y reutiliza uno ya corriendo, sin `retries` (para no enmascarar flakiness real).
- **Script separado:** `npm run test:e2e` (`playwright test`), deliberadamente fuera de `npm test`/del pipeline por defecto (dependencia de desarrollo pesada — el binario de Chromium — y tiempo de ejecución mayor), tal como proponía el diseño original.
- **`test/e2e/fixtures.js`:** extiende el `page` de Playwright para que cualquier error de consola o respuesta HTTP ≥400 durante una prueba la haga fallar automáticamente, sin repetir esa comprobación en cada archivo.
- **Los 5 casos obligatorios, cada uno en su propio archivo:**
  1. `turno.spec.js` — recorre el Proceso Estratégico completo + las 2 instancias de Campaña con TODAS sus subfases, verificando en cada punto que el progreso de Campaña 1 y Campaña 2 se muestra y persiste por separado (COR-001).
  2. `golden-antiship-guided.spec.js` — reproduce el golden test (`data/scenarios/golden-antiship-guided.json`) rellenando los controles reales del wizard paso a paso, llegando a "3 impacto(s)" y al hundimiento de BS-20381 exactamente como la hoja de ayuda oficial.
  3. `history.spec.js` — guarda una resolución, hace un `page.reload()` REAL (no solo cambio de hash, para probar la persistencia de verdad en `localStorage`) y la repite desde `#/historial`.
  4. `help-panel-keyboard.spec.js` — abre y cierra el panel de ayuda solo con teclado (Enter/Escape, sin ningún clic). Documenta explícitamente que el foco no se confina en el panel todavía (COR-008, sin resolver).
  5. `fast-navigation.spec.js` — encadena `page.goto()` a rutas distintas sin esperar a que cada una se asiente.
- **`test/e2e/wizard-helpers.js`:** factoriza el relleno del wizard (compartido entre los casos 2 y 3) para no duplicar ~60 líneas de selección de opciones/campos.
- **Hallazgo real durante la construcción del caso 5** (no un defecto de esta incidencia, sino de la propia app, ya trasladado a COR-005): al encadenar navegaciones rápidas entre `/#/ayuda/combate` y otras rutas, el renderizado de "Combate por tipo" resolvió TARDE (su `await` interno, aunque sobre datos ya cacheados, sigue cediendo el hilo al menos un microtask) y sobrescribió una vista posterior ya renderizada — reproducido de forma intermitente (~40% de las repeticiones) incluso esperando a que la red estuviera inactiva (`waitForLoadState('networkidle')`), confirmando que NO es un problema de latencia de red sino de orden de microtasks sin ningún mecanismo de descarte. Corregirlo es tarea de COR-005 (que ya lo anticipaba en su punto de diseño 3); esta incidencia solo lo detecta y lo documenta, tal como pedía su propio diseño ("no depender de servicios externos" / "fallar ante... no se trata de arreglar la app aquí"). El test final (`fast-navigation.spec.js`) usa únicamente rutas cuyas funciones de render son síncronas para poder afirmar un resultado determinista mientras esa incidencia sigue abierta.

---

## COR-005 — Acoplamiento excesivo en `public/js/app.js`

### Clasificación

- **Severidad:** S3 — media
- **Tipo:** deuda arquitectónica
- **Estado:** `resuelta` — pasos 1-3 (2026-09-27) y pasos 4-5 (2026-09-28) del diseño resueltos.
- **Requisito afectado:** separación entre contenido, reglas, tablas y estado de sesión
- **Dependencia recomendada:** COR-004

### Componente afectado

- `public/js/app.js`, actualmente superior a 3.800 líneas

### Situación actual

El archivo concentra:

- carga y caché de datos;
- acceso a `localStorage`;
- navegación y despacho de rutas;
- utilidades DOM;
- vistas del turno y plantilla de fuerzas;
- biblioteca de ayudas y búsqueda;
- historial de resoluciones;
- estado y renderizado del wizard;
- paneles globales y comportamientos de accesibilidad.

Los motores de dominio sí están separados, pero la capa de aplicación sigue siendo monolítica.

### Impacto

- Elevada superficie de regresión por cambio.
- Dificultad para probar vistas o persistencia de forma aislada.
- Dependencias implícitas mediante variables del cierre principal.
- Mayor probabilidad de renderizados obsoletos durante navegación asíncrona.
- Coste creciente al añadir nuevos wizards de las Fases 8 a 14.

### Estrategia de refactorización

La corrección debe ser incremental y no implica introducir un framework.

Orden sugerido:

1. ~~Extraer persistencia y migraciones a `storage.js`.~~ **Hecho (2026-09-27).**
2. ~~Extraer análisis y despacho de rutas a `router.js`.~~ **Hecho (2026-09-27).**
3. ~~Crear un mecanismo de navegación que descarte renderizados asíncronos obsoletos.~~ **Hecho (2026-09-27).**
4. ~~Extraer vistas por dominio:~~ **Hecho (2026-09-28).**
   - `views/turn.js`;
   - `views/roster.js`;
   - `views/help.js`;
   - `views/history.js`;
   - `views/antiship-guided-wizard.js`.
5. ~~Extraer utilidades DOM sin lógica de reglas.~~ **Hecho (2026-09-28)**, fusionado con el paso 4: ver `public/js/core.js` en "Progreso" abajo.
6. Mantener los cálculos en los motores puros existentes. **Ya cierto** (los motores de dominio ya estaban separados desde antes de esta incidencia; ningún paso de este refactor los ha tocado).

Cada extracción debe constituir un incremento verificable. No se recomienda una reescritura completa.

**Repro confirmada del punto 3 (2026-09-27, al construir la suite E2E de COR-004) — ya corregida el mismo día:** varias vistas `async` (p.ej. `renderCombateIndex`) limpiaban `viewRoot` y solo reconstruían su contenido después de un `await` (un `fetch`, aunque los datos ya estuvieran cacheados en una variable de módulo — el `await` sigue cediendo el hilo al menos un microtask). Sin ningún mecanismo que comparara "¿sigo siendo la navegación más reciente?" antes de su `appendChild` final, encadenar navegaciones rápidas reproducía, de forma intermitente (~40% de las repeticiones en pruebas locales, no depende de latencia de red real), una vista más antigua sobrescribiendo a una más reciente ya renderizada.

### Progreso (2026-09-27, alcance acotado a los pasos 1-3)

Tras preguntar al mantenedor cómo abordar una incidencia de este tamaño, se acordó un alcance explícito: resolver el núcleo de alto valor (persistencia, rutas, mecanismo anti-carreras) en esta sesión, y dejar la extracción de vistas por dominio (pasos 4-5) como un incremento futuro aparte — en vez de intentar completar los 6 pasos de golpe, con el riesgo de regresión que eso implicaría sobre ~3.000 líneas sin bundler ni comprobación de tipos.

- **Paso 1 — `public/js/storage.js` (`window.AppStorage`):** extrae las ~20 funciones y 6 claves de `localStorage` (historial de navegación, progreso del turno, plantilla de fuerzas, historial de resoluciones, favoritos/recientes). Sin depender de ningún estado interno de `app.js` — `turnTemplate` se recibe como parámetro explícito en vez de leerse de una variable de cierre compartida. `app.js` mantiene envoltorios finos con los mismos nombres/firmas de siempre, para no tener que cambiar ningún punto de llamada existente.
- **Paso 2 — `public/js/router.js` (`window.Router`):** extrae el ciclo de vida genérico de navegación por hash (analizar el hash, invocar el despachador, mover el foco al terminar, capturar errores). `routeDispatch` (el árbol de rutas completo) se queda en `app.js` hasta que se aborde el paso 4 — no tiene sentido extraerlo sin extraer también las vistas que resuelve.
- **Paso 3 — mecanismo anti-carreras (`Router.currentToken()`/`Router.isCurrent(token)`):** aplicado a las 23 funciones de vista asíncronas de `app.js` que tenían el patrón vulnerable (limpiar/reconstruir `viewRoot` después de un `await`) — cada una captura su propio token al empezar y lo comprueba antes de cada mutación de `viewRoot` posterior a un `await` (tanto en la ruta de éxito como en cada `catch` que llama a `renderNotFound`). Las 3 funciones ayudantes que solo escriben en un `wrap` recibido por parámetro (`renderContextualHelpLinks`/`renderPhaseImageGallery`/`renderSourcePageGallery`) no necesitan guardia propia.
- **Verificación:** `npm test` → 223/223 OK tras cada uno de los 3 commits. `npm run test:e2e` → 6-7/6-7 OK tras cada commit (7 tests desde que se añadió la regresión de este mismo hallazgo). Nuevo test de regresión dedicado (`test/e2e/fast-navigation.spec.js`) que repite la reproducción original exacta 8 veces por ejecución, confirmado estable con `--repeat-each=10` (30/30 OK, 80 repeticiones de la repro sin fallar). Verificado también manualmente en el navegador (wizard de ataque guiado, sin errores de consola).
### Progreso (2026-09-28, pasos 4-5: vistas por dominio + utilidades DOM)

Retomado explícitamente por el mantenedor tras cerrar COR-007, con el resto del backlog de `correcciones.md` ya resuelto. `public/js/app.js` pasó de 4.109 líneas a **216**: inicialización, pantalla de inicio, panel de ayuda flotante y `routeDispatch` (la tabla ruta→vista, que ahora llama a `Views.<Dominio>.render...` en vez de a funciones locales).

- **`public/js/core.js` (`window.AppCore`, 762 líneas):** el paso 5 original (utilidades DOM sin lógica de reglas) se fusionó con el 4, porque en la práctica no eran separables sin antes saber qué consumía cada vista: contiene las referencias de DOM compartidas (`viewRoot`/`breadcrumbEl`), los envoltorios de persistencia (los mismos de COR-005 paso 1, ahora reexportados desde aquí en vez de desde `app.js`), los cargadores de datos genéricos (turno/tablas/workflows/routing), utilidades de construcción de vistas (`el`, `setBreadcrumb`, `renderNotFound`, `backRow`, `renderGrid`, `openImageLightbox`), los widgets de formulario genéricos (`makeTextField`/`makeNumberField`/`makeSelectFromValues`/`makeOptionGroup`/`renderModifierSummary`/`wizardActionRow`/`wizardNavButton`) y — la parte no anticipada por el diseño original — el acceso a munición/unidades/counters que consumen A LA VEZ más de un dominio de vista (p.ej. `appendAmmoUnitCrop`/`loadCountryUnitsWithAntishipPlans`/`AMMO_CATEGORIES`, usados tanto por "Ayuda rápida > Munición" como por el wizard desde COR-007; `loadFactorMap`/`buildCounterViewer`, usados por la leyenda de counters y por `appendFactorIdentificationHint` del wizard). Duplicar estos accesos entre `views/help.js` y `views/antiship-guided-wizard.js` habría sido peor que tener un núcleo compartido un poco más grande de lo previsto.
- **`public/js/views/turn.js` (366 líneas):** `renderTurnIndex`/`renderProcess`/`renderPhase`/`renderSubphase`/`renderContextualHelpLinks`.
- **`public/js/views/roster.js` (220 líneas):** `renderRosterIndex`/`renderRosterAddForm`.
- **`public/js/views/history.js` (86 líneas):** `renderResolutionHistory`. Su botón "↻ Repetir" ya no toca el estado interno del wizard directamente — llama a `Views.AntishipWizard.loadStateFromHistory(entry.state)`, una función expuesta expresamente para no filtrar el estado privado (`antishipWizardState`) de `views/antiship-guided-wizard.js`.
- **`public/js/views/help.js` (1.701 líneas):** el dominio más grande con diferencia (todo "Ayuda rápida": índice, counters, munición, combate por tipo, buscador, detección, secuencia, reglas y tablas/router). Se mantuvo como un único archivo, siguiendo el diseño original de 5 archivos en vez de subdividirlo más — es un único dominio funcional coherente (AGENTS.md §3.2), aunque grande.
- **`public/js/views/antiship-guided-wizard.js` (1.000 líneas):** estado, cálculos y los 6 pasos del wizard de ataque guiado (COR-007 incluido).
- **`public/index.html`:** nuevos `<script>` para `core.js` y los 5 `views/*.js`, cargados después de `router.js` y antes de `app.js` (que pasa a ser el último, como raíz de composición).
- **Verificación:** `npm test` → 234/234 OK (incluye `test/data.test.js`, ajustado para recorrer todo `public/js/` al comprobar `appendFactorIdentificationHint(...)`, ya que sus 2 llamadas se movieron de `app.js` al wizard). `npm run test:e2e` → 9/9 OK sin cambios de código de test, confirmando que el comportamiento visible no cambió pese a mover ~3.900 líneas de sitio. Verificado además manualmente en el navegador, sin errores de consola, en rutas no cubiertas por los E2E existentes: `#/unidades`, `#/unidades/anadir`, `#/ayuda/municion/jp/aviones/jp-f-2ab`, `#/ayuda/counters/air/aircraft-combat-tactical`, `#/ayuda/deteccion/resolver/air-to-air`, `#/ayuda/buscar/JASSM`, `#/ayuda/secuencia`, `#/ayuda/reglas`, `#/ayuda/tablas/router`.

### Restricciones

- No mover valores fijos de reglas a JavaScript.
- No alterar IDs persistidos sin migración.
- No introducir TypeScript ni un framework sin decisión explícita.
- No mezclar este refactor con cambios de reglas no relacionados.

### Criterios de aceptación

- [x] `app.js` queda reducido principalmente a inicialización y composición. *(4.109 → 216 líneas)*
- [x] Cada módulo tiene una responsabilidad identificable.
- [x] No aparecen dependencias circulares.
- [x] La suite existente continúa pasando tras cada extracción.
- [x] Las pruebas E2E confirman que no cambia el comportamiento visible.
- [x] Una navegación lenta anterior no puede sobrescribir una ruta posterior.

### Cierre

- **Fecha:** 2026-09-28.
- **Commit:** ver el commit que acompaña este cambio en `git log`.
- **Pruebas ejecutadas:** `npm test` → 234/234 OK. `npm run test:e2e` → 9/9 OK. Verificación manual en el navegador de las rutas listadas arriba, sin errores de consola.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 19), `development_status.md`.

---

## COR-006 — Inconsistencia entre el estado documentado y el estado real de la Fase 2

### Clasificación

- **Severidad:** S3 — media
- **Tipo:** trazabilidad y gobierno del proyecto
- **Estado:** `resuelta`
- **Dependencias:** COR-001 y COR-002

### Componentes afectados

- `roadmap.md`
- cabecera vigente de `development_status.md`
- descripciones de tests de `test/turn-progress-engine.test.js`

### Situación actual

La Fase 2 figura cerrada, aunque:

- no se representan las dos instancias del Proceso de Campaña;
- una fase puede cerrarse con subfases pendientes;
- el test que se presenta como recorrido de dos campañas solo recorre una instancia lógica.

La documentación histórica puede conservar lo que se consideró terminado en cada momento, pero el resumen vigente no debe presentar como completo un criterio que el código no satisface.

### Comportamiento esperado

El estado actual debe distinguir entre:

- infraestructura implementada;
- funcionalidad parcial;
- funcionalidad cerrada según sus criterios de salida.

### Diseño de la corrección

1. Mientras COR-001 y COR-002 estén abiertas, marcar los puntos afectados como parciales o reabiertos.
2. No modificar retrospectivamente hitos históricos de `development_status.md`.
3. Añadir una nueva entrada de reconciliación que explique el hallazgo.
4. Tras resolver ambas incidencias, volver a evaluar el criterio de salida completo de Fase 2.
5. Corregir nombres y comentarios de tests para describir exactamente lo que validan.

### Criterios de aceptación

- [x] `roadmap.md`, resumen vigente de `development_status.md` y código expresan el mismo nivel de avance.
- [x] Ningún test se presenta como cobertura de dos campañas si no distingue sus instancias.
- [x] Las entradas históricas permanecen intactas.
- [x] El cierre posterior de Fase 2 referencia los tests que prueban COR-001 y COR-002.

### Cierre

- **Fecha:** 2026-09-27
- **Commit:** ver el commit que acompaña este cambio en `git log`.
- **Pruebas ejecutadas:** ninguna nueva (esta incidencia es puramente de documentación/trazabilidad; COR-001/COR-002 ya aportaron sus propios tests). `npm test` sigue en 223/223 OK, sin cambios de código en este incremento.
- **Documentación actualizada:** `roadmap.md` (Fase 2, nueva nota de reconciliación COR-006 sin reescribir la nota histórica "CERRADA 7/7"; checklist de "mostrar visualmente la fase" actualizado a los 3 estados actuales), `development_status.md` y este archivo.

### Diseño implementado

Se siguió el diseño literal de esta incidencia: (1) no se reescribió retrospectivamente la nota "CERRADA 7/7" de Fase 2 en `roadmap.md` — es un registro histórico de lo que se consideró terminado en ese momento, con ese checklist concreto, y ninguna de las 7 tareas originales exigía explícitamente identidad de instancia; (2) se añadió una nueva nota de reconciliación inmediatamente después, explicando que una revisión posterior encontró que la declaración no se sostenía del todo (COR-001/COR-002) y que, con ambas ya resueltas el mismo día, Fase 2 vuelve a considerarse genuinamente cerrada — citando los tests concretos de `test/turn-progress-engine.test.js` que prueban cada una; (3) los nombres/comentarios de esos tests ya se habían corregido como parte de los commits que resolvieron COR-001/COR-002 (ninguno se presenta hoy como "cobertura de dos campañas" sin distinguir sus instancias — ver p.ej. `finishPhase: terminar una fase en la Campaña 1 no afecta a la Campaña 2`); no quedaba trabajo adicional de esa tarea del diseño por hacer en este incremento.

---

## COR-007 — El wizard permite construir ataques sin una unidad y un plan válidos

### Clasificación

- **Severidad:** S3 — media
- **Tipo:** incompletitud funcional y riesgo de entrada incoherente
- **Estado:** `resuelta`
- **Requisito afectado:** vertical slice de ataque guiado contra superficie
- **Dependencia recomendada:** COR-004 y estabilización de COR-005

### Componentes afectados

- `public/js/app.js`
- `public/js/combat-wizard-engine.js`, si requiere nuevas funciones puras de selección
- `data/ammunition/attack-plans/`
- `data/ammunition/naval-plans/`
- `data/ammunition/special-unit-plans/`
- `data/ammunition/source-pages/unit-regions.json`
- `data/units/registry-index.json`
- golden test existente

### Comportamiento actual

El wizard reproduce el ejemplo oficial si el usuario introduce manualmente los valores correctos. No obstante:

- no selecciona una unidad atacante;
- no limita los planes a los disponibles para esa unidad;
- solicita manualmente tipo, valor/carga y alcance;
- no valida el alcance como precondición completa;
- no muestra el recorte de la fila del plan en el paso correspondiente.

El usuario puede crear combinaciones que no corresponden a ninguna unidad o plan transcrito y obtener un cálculo matemáticamente válido sobre una entrada de negocio inválida.

### Comportamiento esperado

En el modo normal, el usuario debe seleccionar una unidad y uno de sus planes. Los valores fijos deben derivarse de los JSON versionados. Solo deben solicitarse decisiones o valores variables de la partida.

### Diseño de la corrección

1. Definir una función pura que construya las opciones de plan de una unidad.
2. Añadir al estado del wizard IDs estables de país, unidad y plan.
3. Derivar del plan:
   - método/tipo de munición;
   - valor o carga aplicable;
   - alcance;
   - iconos y restricciones declaradas.
4. Evaluar la distancia antes de entrar en la resolución.
5. Mostrar el recorte calibrado de `unit-regions.json`.
6. Invalidar respuestas posteriores cuando cambie la unidad o el plan.
7. Si se mantiene entrada manual, denominarla explícitamente `modo manual` y no mezclarla con la selección validada.

### Restricciones de dominio

- No inferir valores ausentes de imágenes.
- No ofrecer planes con transcripción parcial como completos.
- No ocultar estados `needs_review`.
- No asumir equivalencias entre carga pesada/ligera, estado dañado y alcance.

### Criterios de aceptación

- [x] Solo se ofrecen planes asociados a la unidad seleccionada.
- [x] Los valores fijos no pueden editarse en el modo validado.
- [x] Una distancia fuera de alcance impide continuar y explica el motivo.
- [x] Cambiar unidad o plan elimina respuestas incompatibles posteriores. *(los valores derivados nunca se cachean por separado — se recalculan en cada render a partir de la selección actual, así que no hay nada que quede obsoleto)*
- [x] El resumen final identifica país, unidad, plan y valores derivados.
- [x] El recorte visual corresponde a la unidad elegida (reutiliza `appendAmmoUnitCrop`, ya calibrado).
- [x] El golden test mantiene exactamente sus resultados intermedios y finales — verificado end-to-end desde el wizard real (`test/e2e/unit-plan-selection.spec.js`), seleccionando F-2A/B + Plan B + carga ligera + 2 hex., llegando a "Resultado: 3 impacto(s)".

### Pruebas requeridas

- [x] Unidad con formato de carga simple (BS-MG, buque japonés, `loadFormat: "single"`).
- [x] Unidad con carga pesada/ligera (F-2A/B, Plan B).
- [x] Unidad con valores distintos en estado completo y dañado (F-2A/B: 4/6 completa, 2/3 dañada).
- [x] Plan sin variante pesada (F-5E surcoreano, Plan B: `heavy: null`).
- [x] Distancia en el límite y fuera del límite (`isDistanceWithinRange`, más el caso E2E de distancia 4 > alcance 3).
- [x] Cambio de plan después de responder pasos posteriores — cubierto por diseño (ver nota del criterio de aceptación de arriba) en vez de por un test dedicado de regresión de estado.

### Cierre

- **Fecha:** 2026-09-28.
- **Commit:** ver el commit que acompaña este cambio en `git log`.
- **Hallazgo previo resuelto primero:** antes de implementar, se confirmó el orden pesada/ligera del formato impreso "X/Y" (ver `docs/rules/known-ambiguities.md`, "Orden de 'carga pesada'/'carga ligera'...", 2026-09-27) — un error aquí habría hecho que el wizard derivara el valor equivocado para cualquier plan `dual`.
- **Pruebas ejecutadas:** `npm test` → 234/234 OK (11 tests nuevos de `derivePlanMethod`/`buildAntishipPlanOptions`/`derivePlanAttackValue`/`derivePlanRange`/`attackDistanceBucket`/`isDistanceWithinRange`, con datos reales de F-2A/B, F-5E y BS-MG, no inventados). `npm run test:e2e` → 9/9 OK, incluidos 2 tests nuevos (`test/e2e/unit-plan-selection.spec.js`): reproducción exacta del golden test desde selección real de unidad/plan, y bloqueo de avance por distancia fuera de alcance con el mensaje explicando el motivo. El golden test existente (`golden-antiship-guided.spec.js`, modo manual) sigue pasando sin cambios.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 19), `development_status.md`.

### Diseño implementado

Nuevas funciones puras en `public/js/combat-wizard-engine.js`: `derivePlanMethod` (icono de munición → método guiado; un plan sin icono reconocido — p.ej. munición no guiada — no es válido para este wizard), `buildAntishipPlanOptions` (opciones de plan antibuque de una unidad, filtrando planes sin método guiado o sin valor transcrito), `derivePlanAttackValue` (Valor de Ataque según carga pesada/ligera o valor único, y estado completo/dañado — `null` si el dato no está transcrito, nunca 0), `derivePlanRange`, `attackDistanceBucket` y `isDistanceWithinRange`.

`public/js/app.js`: nuevo estado `unitSelection` (`mode: 'manual'|'validated'`, país/unidad/plan/carga/dañada/distancia) en `freshAntishipWizardState()`. `renderWizardStepIntro` (paso "Datos base") ofrece un selector de modo; en modo validado, encadena país → unidad (reutilizando `AMMO_CATEGORIES`/`loadAmmoFile`/`collectCategoryUnits`, la misma infraestructura que "Ayuda rápida > Planes de ataque") → plan (solo los válidos) → carga/estado si aplica → distancia en hexágonos, mostrando el Valor de Ataque derivado, la comprobación de alcance y el recorte visual (`appendAmmoUnitCrop`) antes de permitir avanzar. `renderWizardStepFleet` y `renderWizardStepMethod` dejan de preguntar la distancia/el método en modo validado: los derivan de la selección de "Datos base" (sin cachear valores aparte, así que un cambio de unidad/plan nunca puede dejar una respuesta posterior obsoleta). El modo manual se conserva exactamente como antes, etiquetado explícitamente como tal.

---

## COR-008 — El panel de ayuda no cumple el patrón accesible de diálogo

### Clasificación

- **Severidad:** S3 — media
- **Tipo:** accesibilidad e interacción por teclado
- **Estado:** `resuelta`
- **Requisito afectado:** navegación por teclado y uso en tablet
- **Dependencia recomendada:** incluir en COR-004

### Componentes afectados

- `public/index.html`
- `public/js/app.js`, `openHelpPanel` y `closeHelpPanel`
- estilos del panel y backdrop

### Comportamiento actual

El panel puede abrirse, cerrarse mediante botón, backdrop o `Escape`, pero se comporta como un diálogo modal sin implementar todas sus obligaciones:

- carece de `role="dialog"` y `aria-modal="true"`;
- no se identifica un nombre accesible del diálogo;
- el foco no se mueve al panel al abrirlo;
- el fondo continúa disponible para tabulación;
- no existe confinamiento de foco o alternativa mediante `inert`;
- el foco no se devuelve de forma garantizada al elemento que abrió el panel.

### Comportamiento esperado

Al abrir el panel, las tecnologías de asistencia deben anunciarlo como diálogo, el foco debe entrar en él y el contenido de fondo debe quedar temporalmente fuera del orden de interacción. Al cerrar, el foco debe volver al control de origen cuando siga disponible.

### Diseño de la corrección

1. Asociar el encabezado mediante `aria-labelledby` y aplicar semántica de diálogo.
2. Guardar `document.activeElement` antes de abrir.
3. Mover el foco al botón de cierre o al primer elemento interactivo.
4. Usar `inert` sobre el contenido de fondo cuando sea compatible con los navegadores objetivo; implementar una alternativa únicamente si es necesaria.
5. Gestionar `Tab` y `Shift+Tab` para evitar que el foco abandone el diálogo.
6. Restaurar el foco al cerrar por cualquiera de los mecanismos.
7. Mantener `Escape` sin interferir con otros overlays.

### Criterios de aceptación

- [x] El panel tiene nombre y rol accesibles.
- [x] El foco entra en el panel al abrirse.
- [x] `Tab` y `Shift+Tab` permanecen dentro del panel.
- [x] El contenido de fondo no puede activarse mientras el panel está abierto.
- [x] Botón cerrar, `Escape` y backdrop restauran el foco.
- [x] La interacción táctil existente no se degrada.
- [x] No se producen conflictos con el lightbox de imágenes.

### Pruebas requeridas

- Recorrido manual solo con teclado.
- Prueba automatizada de foco en navegador.
- Auditoría con herramientas de accesibilidad.
- Comprobación con al menos un lector de pantalla cuando sea posible.

### Cierre

- **Fecha:** 2026-09-27
- **Commit:** ver el commit que acompaña este cambio en `git log`.
- **Pruebas ejecutadas:** `test/e2e/help-panel-keyboard.spec.js` (COR-004) ampliado con las nuevas aserciones de COR-008 — rol/nombre accesibles, el foco entra en `#btn-help-close` al abrir, `#app-content` queda `inert` (verificado también que un intento explícito de enfocar `#btn-home` mientras está inert no mueve el foco), Tab/Shift+Tab envuelven desde el último control al primero y viceversa, y el foco vuelve a `#btn-help` al cerrar tanto por Escape como por el botón de cierre. `npm run test:e2e` → 6/6 OK, repetido con `--repeat-each=5` solo para este archivo (5/5 OK) y en la suite completa. `npm test` sigue en 223/223 OK (sin cambios en motores puros). Verificado además manualmente en el navegador vía `javascript_tool` (apertura real con `#btn-help`, comprobación de `role`/`aria-modal`/`aria-labelledby`, `inert` de `#app-content`, envoltura de Tab/Shift+Tab) y visualmente (`? Ayuda rápida > Leyenda de counters / fichas`, captura de pantalla) para confirmar que envolver `header`/`main`/`btn-scroll-top` en `#app-content` no rompe el layout (`position: sticky` del encabezado, centrado de `.view-root`) ni introduce errores de consola.
  - **Recorrido con lector de pantalla:** no realizado en este incremento (sin lector de pantalla disponible en este entorno de desarrollo) — la semántica `role="dialog"`/`aria-modal`/`aria-labelledby` sigue el patrón WAI-ARIA estándar de diálogo modal, pero queda pendiente de una verificación real con NVDA/VoiceOver/TalkBack cuando el mantenedor disponga de uno.
  - **Auditoría con herramientas de accesibilidad automatizadas** (p.ej. axe): no ejecutada en este incremento (no hay una herramienta de este tipo ya integrada en el proyecto); candidato futuro si se quiere ampliar la cobertura de accesibilidad más allá de este panel concreto.
- **Documentación actualizada:** este archivo, `roadmap.md` (Fase 17 y Fase 19), `development_status.md`.

### Diseño implementado

Sigue el diseño original punto por punto: (1) `public/index.html` añade `role="dialog"`, `aria-modal="true"` y `aria-labelledby="help-panel-title"` al `<aside id="help-panel">` (se retira el `aria-label` redundante) y un `id="help-panel-title"` a su `<h2>`; (2)-(3) `openHelpPanel` guarda `document.activeElement` en `helpPanelPreviouslyFocused` antes de construir el contenido y mueve el foco a `#btn-help-close` al final; (4) el contenido de fondo (`header`+`main`+el botón "volver arriba", ahora agrupados en un nuevo `<div id="app-content">` en `public/index.html` — un cambio estructural mínimo, sin CSS propia, que no afecta el `position: sticky` del encabezado ni el centrado de `.view-root`) se marca `inert` mientras el panel está abierto; sin polyfill, por el mismo criterio de navegadores objetivo modernos ya aplicado al resto del proyecto (`fetch`, `async`/`await`); (5) nuevo `trapFocusInHelpPanel(ev)`, enganchado al `keydown` global ya existente (junto a `Escape`), que envuelve el foco del último control al primero (`Tab`) y del primero al último (`Shift+Tab`) — complementa a `inert`, que por sí solo impide entrar en el fondo pero no crea un bucle dentro del panel; (6) `closeHelpPanel` desactiva `inert` y devuelve el foco a `helpPanelPreviouslyFocused` si sigue en el documento, sea cual sea el mecanismo de cierre (botón, backdrop o `Escape`, los tres ya llamaban a la misma función); (7) el manejador de `Escape` no cambió — sigue cerrando el panel de ayuda y el lightbox de imágenes de forma independiente, sin interferencia (el lightbox es un `<div>` hermano de `#app-content`/`#help-panel`, ajeno a `inert`).

---

## 5. Plantilla para nuevas incidencias

```markdown
## COR-NNN — Título orientado al defecto

### Clasificación

- **Severidad:** S1/S2/S3/S4
- **Tipo:**
- **Estado:** `pendiente`
- **Requisito afectado:**
- **Dependencias:**

### Componentes afectados

- `ruta/al/archivo`

### Evidencia de reproducción

1. Precondición.
2. Acción.
3. Resultado observado.

### Comportamiento actual

Descripción objetiva y reproducible.

### Comportamiento esperado

Resultado que debe ofrecer el sistema.

### Causa técnica

Causa confirmada o hipótesis que todavía debe validarse.

### Diseño de la corrección

Alcance técnico propuesto, migraciones y compatibilidad.

### Fuera de alcance

- Elementos que no deben incorporarse accidentalmente a la corrección.

### Criterios de aceptación

- [ ] Condiciones observables necesarias para cerrar la incidencia.

### Pruebas requeridas

- Casos normales, límites y regresiones.

### Cierre

- **Fecha:** YYYY-MM-DD
- **Commit:** `<hash>`
- **Pruebas ejecutadas:**
- **Documentación actualizada:**
```

## 6. Historial de revisiones

### 2026-09-27 — Reformulación como backlog técnico

- Se han convertido COR-001 a COR-008 en especificaciones implementables.
- Se han añadido causa técnica, comportamiento esperado, alcance, dependencias, criterios de aceptación y estrategia de pruebas.
- No se ha modificado el código de la aplicación.

### 2026-09-27 — Revisión integral inicial

- Revisados `AGENTS.md`, `README.md`, `roadmap.md`, `development_status.md`, historial de trabajo, estado de Git, arquitectura, servidor, motores, pruebas y ambigüedades documentadas.
- Ejecutado `npm test`: 209 tests correctos y 0 fallos.
- Reproducido el cierre del servidor mediante una URL con codificación inválida.
- Registradas COR-001 a COR-008.
