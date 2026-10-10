# Revisión de ingeniería de software — Correcciones 03

## 1. Motivo de esta revisión

Este documento sustituye la interpretación funcional utilizada en `correcciones.02.md` respecto al turno guiado.

La decisión de producto confirmada por el mantenedor es la siguiente:

> El turno guiado es una ayuda de consulta y seguimiento que puede utilizarse solo en los momentos necesarios. No debe obligar a jugar todas las fases o subfases, ni imponer su orden como requisito de uso.

Esta decisión prevalece sobre cualquier redacción anterior que describa el turno como una máquina de estados secuencial o que considere anómalo usar una fase fuera del orden impreso.

Fecha de revisión: **2026-09-28**  
Rama revisada: **`master`**  
Commit de referencia: **`c4cf6a0`**  
Nota de estado: durante esta revisión existen cambios locales ajenos en curso relacionados con el wizard de ataque antibuque no guiado. Se han preservado y quedan fuera del alcance de este documento.

## 2. Criterio funcional corregido

### 2.1. Qué debe hacer el turno guiado

El turno guiado debe:

- representar la estructura y el orden de la hoja de turnos;
- permitir abrir directamente cualquier proceso, fase o subfase;
- proporcionar explicación, acciones, ayudas y resoluciones contextuales;
- conservar marcas de progreso cuando el usuario decida utilizarlas;
- permitir recorridos completos, parciales o puramente consultivos;
- proteger datos ya introducidos y resoluciones activas frente a pérdidas accidentales.

### 2.2. Qué no debe hacer

El turno guiado no debe:

- bloquear una fase porque otra anterior no esté terminada;
- obligar a mantener una única fase actual;
- considerar «fuera de secuencia» una acción legítima del usuario;
- pedir confirmación únicamente por apartarse del orden impreso;
- exigir visitar o completar todas las subfases para marcar una fase como terminada;
- interpretar automáticamente las subfases no visitadas como incidencias o trabajo pendiente;
- considerar incompleta o errónea una sesión usada solo como consulta parcial.

El orden del turno puede mostrarse y utilizarse para ofrecer atajos «anterior» y «siguiente», pero siempre con carácter informativo.

## 3. Revaluación de `correcciones.02.md`

| Incidencia anterior | Estado en esta revisión | Decisión |
|---|---|---|
| COR02-001 — progreso por banda | **Se mantiene resuelta** | Conservar progreso independiente por banda sigue siendo correcto y protege el trabajo del usuario. |
| COR02-002 — máquina de estados | **Anulada como requisito** | No debe utilizarse para imponer orden, avisar de acciones «fuera de secuencia» ni definir una única fase obligatoria. |
| COR02-003 — resoluciones activas | **Se mantiene con reinterpretación** | Vincular una resolución al contexto desde el que se abrió es útil; no debe depender de una «fase actual» secuencial. |
| COR02-004 — derivación del plan | **Se mantiene resuelta con su alcance acordado** | No cambia por esta decisión. |
| COR02-005 — métodos sin daño completo | **Se mantiene resuelta** | No cambia por esta decisión. |
| COR02-006 — reglas fijas en JavaScript | **Se mantiene resuelta en su alcance declarado** | El commit `f94222d` externalizó las siete evidencias originales; esta revisión propone una segunda pasada sobre constantes de negocio residuales. |
| COR02-007 — inventario y trazabilidad | **Se mantiene resuelta** | No cambia por esta decisión. |
| COR02-008 — reconciliación documental | **Se mantiene resuelta en su alcance anterior** | La nueva decisión de producto es posterior al commit `c4cf6a0` y exige una reconciliación documental adicional. |
| COR02-009 — cobertura 198/198 | **Se mantiene resuelta** | No cambia por esta decisión. |
| COR02-010 — Fase 8 | **Sigue abierta** | No cambia por esta decisión. |
| COR02-011 — tamaño de vistas | **Sigue siendo necesaria** | No cambia por esta decisión. |

## 4. Correcciones necesarias

### COR03-001 — Alinear el turno guiado con un uso libre, parcial y no prescriptivo

**Prioridad:** Alta  
**Tipo:** Producto / UX / Estado de sesión  
**Fases afectadas:** 1 y 2  
**Estado:** Resuelta (2026-09-28) — `public/js/turn-progress-engine.js` y `public/js/views/turn.js`: `evaluatePhaseSequencing` eliminada, `getPhaseSequenceState` reducida a `completed`/`skipped`/`not-started`, `evaluatePhaseCompletion` renombra `pendingSubphases`→`unmarkedSubphases` y `canFinishNormally` depende solo de `pendingResolutions` (riesgo real de pérdida de datos). `getCurrentPhaseId` se conserva como dato orientativo ("→ Siguiente sugerida" en vez de "▶ Actual"), nunca gatea una mutación. Tests actualizados en `test/turn-progress-engine.test.js` y `test/e2e/turno.spec.js` (285/285 unitarios + 23/23 e2e en verde). Punto 7 (resoluciones desde Inicio/Ayuda rápida sin fase actual) ya estaba cubierto por `getLastTurnContext()`/`linkToTurnContextIfNeeded` (COR02-003), sin cambios necesarios.

#### Evidencia

La implementación incorporada para COR02-002 mantiene actualmente conceptos propios de una secuencia normativa:

- `getCurrentPhaseId` calcula una única fase actual;
- `getPhaseSequenceState` asigna el estado `current`;
- `evaluatePhaseSequencing` clasifica acciones como `outOfSequence`;
- `public/js/views/turn.js` muestra la insignia «Actual»;
- terminar u omitir otra fase provoca una confirmación específica y registra la acción como fuera de secuencia;
- los tests de `test/turn-progress-engine.test.js` y `test/e2e/turno.spec.js` fijan ese comportamiento.

Además, `evaluatePhaseCompletion` interpreta todas las subfases no terminadas como pendientes y la UI solicita confirmación para terminar la fase. Con el objetivo ahora aclarado, una subfase no utilizada no equivale necesariamente a una tarea pendiente.

#### Problema

Aunque la implementación no aplica un bloqueo absoluto, introduce fricción y transmite al jugador que está utilizando incorrectamente la ayuda si actúa en otro orden. Eso contradice la finalidad del producto: consultar o resolver solo lo necesario en cada momento de la partida.

#### Corrección solicitada

1. Retirar la noción obligatoria de «fase actual» de la lógica de autorización y de los mensajes de advertencia.
2. Eliminar las confirmaciones y eventos `outOfSequence` cuyo único motivo sea el orden de la hoja.
3. Mantener el orden como metadato visual y permitir, si aporta valor, accesos opcionales «anterior» y «siguiente según la hoja».
4. Tratar `Terminar fase` y `Terminar subfase` como marcas voluntarias e independientes.
5. No considerar pendientes las subfases simplemente no visitadas. Si se desea distinguirlas, usar un estado neutral como `sin usar` o `sin marcar`.
6. Mantener advertencias únicamente cuando exista riesgo de perder información: formularios con datos, tiradas, resultados o resoluciones activas.
7. Conservar el vínculo de una resolución con la fase desde la que se abrió, pero aceptar resoluciones iniciadas desde Inicio o Ayuda rápida sin inventar una fase actual.

No es obligatorio eliminar las funciones de orientación si se reutilizan de manera puramente informativa. Sí debe eliminarse cualquier semántica de validación, anomalía o requisito asociada al orden.

#### Criterios de aceptación

- Se puede abrir, terminar u omitir cualquier fase sin haber completado las anteriores.
- No aparece una confirmación por el mero hecho de actuar fuera del orden impreso.
- No se registra `outOfSequence` como incidencia de usuario.
- Marcar una fase como terminada no exige visitar todas sus subfases.
- Una resolución activa con datos sin guardar sí genera una advertencia contextual.
- Los accesos directos desde Inicio, Ayuda rápida y cualquier fase continúan funcionando.
- Los tests describen navegación libre y protección de datos, no cumplimiento obligatorio de una secuencia.

---

### COR03-002 — Ejecutar una segunda pasada sobre reglas fijas residuales

**Prioridad:** Media-Alta  
**Tipo:** Arquitectura / Datos declarativos  
**Origen:** seguimiento de COR02-006  
**Estado:** Resuelta (2026-09-28) — inventario/clasificación de las 6 evidencias completado; las 4 que eran reglas TCW o contenido duplicado se trasladaron a datos, las 2 restantes se clasifican explícitamente como detalle técnico legítimo con su justificación (ver desglose abajo). `npm test` → 288/288 OK, `npx playwright test` → 23/23 OK.

#### Clasificación final (2026-09-28)

| Evidencia | Clasificación | Resultado |
| --- | --- | --- |
| `DICE_FORMULAS` | Regla TCW compartida entre workflows (02/07/12 usan el mismo vocabulario de IDs) | Trasladada a `data/rules/dice-formulas.json#formulas`, con `sourceRefs` propios por fórmula. `describeDiceFormula(diceFormulas, diceValue)` ahora recibe los datos ya cargados. |
| `FINAL_TABLE_ROW_SCHEME_BY_METHOD` | Regla TCW específica del workflow 07 | Trasladada a `methodOptions[].finalTableRowScheme` (+ `finalTableRowSchemeNote` con la cita), mismo patrón ya establecido por `damagePerImpactForMethod`/COR02-006 para el mismo array de opciones. `finalTableRowScheme(method, methodOptions)` ya no tiene una constante propia. |
| `CM_BM_MARKER_ICONS` + regla `method === 'ballistic'` | Regla TCW específica del workflow 07 | El array de iconos pasa a `workflow.cmBmMarkerIcons` (nivel de workflow, no de opción — un plan puede llevar el icono con cualquier método). La regla del método Balístico pasa a `methodOptions[].impliesCmBmMarker` (`true` solo para `ballistic`). `derivePlanCmOrBmMarker(plan, method, methodOptions, cmBmMarkerIcons)` ya no compara literales ni arrays incrustados. |
| Etiquetas de método (`METHOD_LABELS`, `views/antiship-guided-wizard.js`) | Contenido duplicado (no una regla nueva) | Era una copia literal de `methodOptions[].label`, ya transcrito en el workflow — riesgo de desincronización si el label cambiara en los datos. Eliminada por completo; sustituida por `methodLabel(methodOptions, method)`, un `.find()` sobre los datos ya cargados. |
| `detection-engine.js#REFS` | Detalle técnico legítimo (bookkeeping de citas, no una regla de juego) | `data/detection/help-sheet.json` ya declara sus propios `sourceRefs` por sección, pero a un grano más amplio (p.ej. `groundDetection` cubre páginas 4-5 en bloque) que el que necesitan funciones individuales como `resolveBrieflyDetectable`/`resolveFixedInstallationDetection` (página 5 y página 4 exactas, respectivamente). Derivarlo del JSON exigiría añadir nuevas entradas `sourceRefs` anidadas sin que ninguna regla de cálculo cambie — se deja registrado como mejora futura de bajo riesgo, no como esta corrección (que es sobre reglas de negocio incrustadas, no sobre duplicar citas ya correctas). |
| `WIZARD_STEPS`/`ANTISHIP_WIZARD_STEPS` (`ground-close-combat-wizard.js`, `antiship-unguided-wizard.js`, `antiship-guided-wizard.js`) | Detalle técnico/UI legítimo | Los títulos de "Paso X de N" no son una copia de ningún campo ya transcrito: combinan/reordenan y añaden pasos (p.ej. "Resultado", "Datos base del ataque") que no corresponden 1:1 a ningún `stage` de `data/workflows/*.json` — moverlos a datos exigiría inventar un concepto nuevo ("lista de pasos de UI") sin fuente TCW que lo respalde. AGENTS.md §5 separa "contenido"/"reglas" de la UI, pero no prohíbe que la UI tenga sus propios títulos de navegación cuando no hay contenido transcrito que dupliquen. |

#### Verificación

- `npm test` → **288/288 OK** (3 tests nuevos: `dice-formulas.json` válido, `method.options` declara `finalTableRowScheme`/`impliesCmBmMarker`, `cmBmMarkerIcons` referencia iconos reales).
- `npx playwright test` → **23/23 OK**, incluido el golden test end-to-end del wizard de ataque guiado a superficie (verifica que el refactor no cambió ningún resultado calculado).
- Verificado manualmente en el navegador: `#/wizard/antiship-guided` renderiza sin errores de consola tras cargar `data/rules/dice-formulas.json` además de los datos ya existentes.

#### Evidencia

El commit `f94222d` trasladó a JSON las siete evidencias enumeradas en COR02-006: reglas de detección, daño por impacto, relación icono-método y tramos de distancia. Esa corrección puede mantenerse como resuelta dentro de su alcance.

Una búsqueda posterior muestra, sin embargo, elementos residuales que deben revisarse para determinar si son lógica técnica o reglas de negocio todavía incrustadas:

- `DICE_FORMULAS`;
- `FINAL_TABLE_ROW_SCHEME_BY_METHOD`;
- `CM_BM_MARKER_ICONS`;
- la regla especial `method === 'ballistic'`;
- referencias de fuente agrupadas en `detection-engine.js#REFS`;
- etiquetas de método y pasos del wizard en la vista.

Parte de estas constantes puede ser lógica técnica legítima. Esta corrección no reabre automáticamente COR02-006: solicita una segunda clasificación para evitar que el cierre de las siete evidencias originales se interprete como una auditoría exhaustiva de todas las constantes del dominio.

#### Corrección solicitada

- Inventariar las constantes restantes y clasificarlas como regla TCW, contenido visible o detalle técnico.
- Trasladar a datos declarativos las reglas TCW, correspondencias, modificadores, secuencias y textos de negocio.
- Mantener en JavaScript únicamente algoritmos genéricos y estructuras técnicas estables.
- Evitar que el motor requiera conocimiento específico de un método si ese conocimiento ya está declarado en el workflow.
- Añadir validación de esquema para los nuevos campos.
- Registrar el resultado como seguimiento nuevo: elementos trasladados, elementos técnicos conservados y justificación de cada excepción.

#### Criterios de aceptación

- Cada constante restante tiene una justificación técnica o se ha trasladado a `data/`.
- Las reglas declarativas incluyen fuente y validación.
- Cambiar una regla fija no requiere editar la vista ni el motor genérico.
- Las pruebas unitarias y E2E pasan sobre el árbol definitivo, no sobre cambios parciales.
- El cierre identifica expresamente qué constantes permanecen y por qué no son datos de negocio.

---

### COR03-003 — Reconciliar la documentación con el carácter no prescriptivo del turno

**Prioridad:** Alta  
**Tipo:** Documentación operativa / Producto  
**Origen:** ampliación de COR02-008  
**Estado:** Resuelta (2026-09-28) — `roadmap.md` (Objetivo de Fase 2 reescrito sin "máquina de estados configurable"; checklist de Fase 2 y la entrada COR02-002 de Fase 20 anotadas como registro histórico, con nota de revocación remitiendo a COR03-001); `development_status.md` (ítem 86/COR02-002 anotado con la misma revocación); `data/phases/turn-sequence-help.json#note` reescrita (ya no describe Fase 2 como "sin empezar" ni el turno como máquina de estados); `correcciones.02.md` ya remitía a esta revocación desde su cierre (§9, commit `4098944`), sin cambios adicionales. Comentarios y nombres de test que presentaban la navegación libre como anomalía ya se corrigieron en COR03-001 (`test/turn-progress-engine.test.js`, `test/e2e/turno.spec.js`).

#### Evidencia

Persisten afirmaciones que presentan el turno como una máquina de estados o una secuencia que debe recorrerse:

- `ROADMAP.md` Fase 2 define el objetivo como «máquina de estados configurable»;
- el roadmap da COR02-002 por resuelta como incorporación de una fase actual;
- `development_status.md` describe como mejora los avisos por actuar fuera de secuencia;
- `data/phases/turn-sequence-help.json#note` conserva texto obsoleto y contradictorio sobre la Fase 2;
- `correcciones.02.md` todavía enumera la ausencia de máquina de estados como incumplimiento, aunque esa conclusión queda revocada por esta decisión de producto.

#### Problema

Si solo se cambia `AGENTS.md`, futuros desarrolladores pueden volver a introducir restricciones al seguir el roadmap o el estado de desarrollo. Las fuentes operativas deben expresar un único criterio vigente.

#### Corrección solicitada

Actualizar de forma coordinada:

- `ROADMAP.md`;
- `development_status.md`;
- `data/phases/turn-sequence-help.json`;
- `correcciones.02.md`, dejando una nota visible de que COR02-002 fue anulada por decisión de producto;
- comentarios y nombres de tests que presenten la navegación libre como comportamiento anómalo.

La historia de COR02-002 puede conservarse, pero debe quedar marcada como decisión posteriormente sustituida, no como requisito actual.

#### Criterios de aceptación

- Ningún documento vigente exige una fase actual única ni finalización secuencial.
- El roadmap describe el turno como ayuda navegable y seguimiento opcional.
- El estado de desarrollo distingue claramente historial y criterio actual.
- Las notas de datos no afirman que el turno sea una máquina de estados pendiente o necesaria.
- `correcciones.02.md` remite a esta revisión para la revocación de COR02-002.

---

### COR03-004 — Transcribir o delimitar las dos fuentes visuales de detección pendientes

**Prioridad:** Media-Alta  
**Tipo:** Reglas / Trazabilidad  
**Fases afectadas:** 0 y 4  
**Estado:** Resuelta (2026-09-28) — `Deteección Electrónica.jpg` confirmada e integrada (Decision Book §4.4/§4.4.1/§4.4.2/§7.1.4, con una excepción real de las unidades de superficie que la imagen no menciona); `detección Aire Aire.jpg` investigada a fondo y bloqueada explícitamente como `needs_review` — no corresponde al capítulo de detección aérea vigente del Decision Book, procedencia sin confirmar. Ambas siguen los criterios de aceptación de la corrección: fuente/sección/estado documentados para las dos, ninguna regla se integró sin poder trazarse y probarse. Detalle completo en `docs/rules/known-ambiguities.md`.

#### Evidencia

La resolución de COR02-007 identificó dos imágenes que contienen reglas funcionales no transcritas:

- `detección Aire Aire.jpg`, con la tabla «2.1 Nivel de exploración»;
- `Deteección Electrónica.jpg`, con mecánica adicional de detección electrónica.

Se registraron correctamente como fuentes funcionales pendientes, pero su contenido todavía no forma parte del modelo de detección.

#### Problema

La Fase 4 se presenta como motor de detección cerrado, mientras existen reglas entregadas que todavía no se han analizado ni delimitado formalmente. No debe asumirse que la ayuda PDF ya cubre todo el dominio si estas imágenes aportan contenido adicional.

#### Corrección solicitada

- Identificar la procedencia y sección canónica de ambas imágenes.
- Compararlas con el Decision Book y la hoja de ayuda de detección.
- Registrar cualquier discrepancia en `known-ambiguities.md`.
- Transcribir los datos legibles y verificados a `data/detection/`.
- Marcar como `needs_review` cualquier elemento cuya fuente no permita una lectura segura.
- Integrar solo las reglas que puedan trazarse y probarse.

#### Criterios de aceptación

- Cada imagen tiene fuente, sección, estado y relación con los datos existentes.
- La tabla de nivel de exploración queda estructurada o explícitamente bloqueada con motivo verificable.
- La detección electrónica no duplica ni contradice silenciosamente reglas existentes.
- Existen pruebas para toda regla nueva incorporada.
- El estado de la Fase 4 refleja el alcance realmente soportado.

---

### COR03-005 — Mantener la Fase 8 abierta hasta demostrar reutilización defensiva real

**Prioridad:** Media  
**Tipo:** Alcance funcional  
**Origen:** COR02-010  
**Estado:** Resuelta (2026-09-29), con una excepción documentada explícitamente:

- **Contraataque a Baja Altura** gana su primer consumidor real (`antiship_unguided`, sección opcional tras la asignación de daño en `public/js/views/antiship-unguided-wizard.js`, nueva etapa `low_altitude_counterattack` en `data/workflows/08_ataque_antibuque_no_guiado.json` — `data/tables/page-26.json` ya citaba `workflowRefs: ["antiship_unguided"]` y `reusesTable` hacia `page-22.json#surface-artillery-low-altitude-counterattack` desde antes, sin conectar). `resolveLowAltitudeCounterattackShot` pasa de 0 a 1 consumidor real.
- **Defensa Antiaérea de Área** (`resolveAreaAirDefenseShot`, disparo contra el avión atacante) gana su segundo consumidor real: `renderWizardStepAreaAirDefense`/`computeAreaAirDefenseShot` se promovieron de `views/antiship-guided-wizard.js` a `public/js/core.js` (tal como el propio comentario del código ya anticipaba desde 2026-09-25) y `antiship_unguided` los reutiliza como su nuevo paso 1 de 5. Confirmado contra Decision Book §6.3: la reacción aplica contra "cualquier objetivo expuesto" (unidades aéreas, de vuelo bajo, misiles de crucero, ataques balísticos), sin restricción a munición CM/BM ni a ataques guiados — esa restricción es de la OTRA mecánica homónima (`resolveAreaAirDefenseAttackReduction`, reducción de Valor de Ataque, que sigue con un solo consumidor).
- **Interceptación de Misiles Balísticos** gana su flujo de elegibilidad: `data/workflows/06_defensa_aerea_area.json#area_defense` añade `ballistic_missile_interception`/`missile_defense_symbol`/`missile_alert_network` (Decision Book §6.9/§6.9.1, informan sin bloquear — AGENTS.md §14), reutilizando la Defensa Antiaérea de Área ya conectada para **Fase Media** sin ningún cambio de motor, y conectando `checkHighSpeedInterceptionFailure` (probada desde 2026-09-27, sin consumidor hasta ahora) para **Interceptación de Alta Velocidad**.

**Excepción documentada — Interceptación Terminal:** al implementar la elegibilidad se descubrió que, a diferencia de Fase Media/Alta Velocidad, esta variante NO es solo un flujo sin conectar: la fila "Terminal" que el Decision Book §6.9.2 exige usar en la tabla de Interceptación de Munición no está transcrita en `data/tables/page-04.json`/`page-08.json` — es una laguna de datos, no de código. Se documenta en `docs/rules/known-ambiguities.md` (junto con una duda relacionada, sin resolver ni tocar ningún cálculo: si el modificador 2d10-menor de §6.3.2 para objetivos de espacio cercano pertenece a `resolveAreaAirDefenseShot` o a `resolveAreaAirDefenseAttackReduction`) en vez de aproximar la tabla o bloquear el cierre de esta incidencia por un hallazgo nuevo y distinto de su alcance original.

`npm test` → 294/294 OK, `npx playwright test` → 23/23 OK. Ver `roadmap.md` Fase 8 para el detalle completo.

#### Motivo

La aclaración sobre navegación no modifica el criterio técnico de la Fase 8. Las funciones defensivas existentes siguen sin estar integradas de forma reutilizable en varios tipos de ataque.

#### Corrección solicitada

Mantener la fase abierta hasta que defensa aérea de área, interceptación final, interceptación de munición, defensa balística y contraataque a baja altura dispongan del alcance declarado en el roadmap y tengan consumidores reales.

La integración debe poder iniciarse desde cualquier contexto que la necesite, sin depender de que el jugador haya seguido previamente una secuencia de fases.

#### Criterios de aceptación

- Al menos dos workflows consumen los mismos módulos defensivos compartidos.
- Los módulos pueden abrirse desde consulta rápida o desde cualquier fase relacionada.
- No existe dependencia de una «fase actual» para resolverlos.
- Elegibilidad, modificadores, consumo y resultados están probados.
- El criterio de salida puede marcarse sin excepciones contradictorias.

---

### COR03-006 — Reducir responsabilidades de las vistas antes de ampliar nuevos dominios

**Prioridad:** Media-Baja  
**Tipo:** Mantenibilidad  
**Origen:** COR02-011  
**Estado:** Resuelta (2026-10-04, en el alcance de los 3 archivos citados en la Evidencia; residual documentado abajo). **`core.js` (1003 líneas) queda dividido en 4 módulos + fachada de 136 líneas**: `core-data.js` (`AppData`, cargadores y caches sin DOM, 324), `core-widgets.js` (`AppWidgets`, constructores DOM y widgets de formulario, 256), `core-visuals.js` (`AppVisuals`, galerías/recortes/visor de fichas, 236) y `core-wizard-steps.js` (`AppWizardSteps`, paso "Disparo en Área" compartido, 118); `core.js` conserva solo lo propio de la cáscara (DOM de `#view-root`/migas, envoltorios de persistencia, hashes de wizard, último contexto de turno) y re-exporta todo bajo `AppCore` sin cambiar ninguna llamada. Historial de progreso — 2026-10-04: **`views/antiship-guided-wizard.js` (1012 líneas) también dividido** en `antiship-guided-model.js` — estado y cálculos puros, testeable en Node —, `views/antiship-guided-steps.js`, `views/antiship-guided-result.js` y el propio `antiship-guided-wizard.js` reducido a controlador (139 líneas); luego `core.js`) (2026-09-29): **`views/help.js` (1726 líneas) queda dividido** en 9 módulos por categoría funcional — `help-index.js` (índice/favoritos, 97 líneas), `help-counters.js` (149), `help-municion.js` (264), `help-combate.js` (167), `help-search.js` (147), `help-deteccion.js` (397, referencia + resolutor interactivo), `help-secuencia.js` (81), `help-reglas.js` (76) y `help-tablas.js` (351) — cada uno con su propio namespace (`Views.HelpXxx`), en vez de un único `Views.Help` monolítico. `public/js/app.js` actualizado para enrutar a cada namespace nuevo. Los 3 cargadores de datos usados por más de una categoría (`loadDetectionHelp`, `loadRulesExcerpts`, `loadAirMissions`) y `ICON_LABELS`/`renderIconChip` (usados por Munición Y Combate por tipo) se promovieron a `public/js/core.js`, siguiendo el mismo patrón ya usado para `renderWizardStepAreaAirDefense` (COR03-005). **Sigue pendiente:** separar estado/controlador/renderizado de `views/antiship-guided-wizard.js` (1012 líneas) y seguir reduciendo `core.js` (creció de 929 a 1003 líneas por las promociones anteriores, ninguna reestructuración interna todavía). `npm test` → 294/294 OK, `npx playwright test` → 23/23 OK, más verificación manual de las rutas no cubiertas por los tests automatizados (tablas/router, tablas/página, visor de tabla, iconos de munición, buscador).

**Residual (no bloquea el cierre):** la petición "separar estado/controlador, adaptación de datos y renderizado de cada wizard" se aplicó al único wizard de los 3 archivos que la Evidencia cita (`antiship-guided-wizard.js`). `views/antiship-unguided-wizard.js` (596 líneas) y `views/ground-close-combat-wizard.js` (418) siguen en un solo archivo cada uno — son menores, ya reutilizan `AppWizardSteps`/motores de dominio y no se tocaron para no ampliar el alcance; si crecen, el patrón modelo/pasos/resultado/controlador de `antiship-guided-*` es la plantilla a repetir.

#### Evidencia

La extracción de `app.js` fue correcta, pero `views/help.js`, `views/antiship-guided-wizard.js` y `core.js` siguen concentrando varias responsabilidades. La incorporación de nuevos resolutores aumentará el acoplamiento si se mantiene esta estructura.

#### Corrección solicitada

- dividir la ayuda por categorías funcionales;
- separar estado/controlador, adaptación de datos y renderizado de cada wizard;
- separar utilidades DOM de repositorios y cargadores de dominio;
- mantener la navegación libre mediante rutas independientes, sin introducir una coordinación secuencial central.

#### Criterios de aceptación

- Cada módulo tiene una responsabilidad identificable.
- Los motores de dominio no dependen de componentes visuales.
- Las rutas pueden abrirse directamente y conservar enlaces de retorno contextuales.
- El refactor no altera las pruebas funcionales existentes.

## 5. Elementos que dejan de considerarse errores

A partir de esta decisión no son defectos:

- entrar en Campaña 2 antes de Campaña 1;
- abrir una fase posterior sin completar las anteriores;
- terminar una fase sin utilizar todas sus subfases;
- completar subfases en un orden distinto al impreso;
- usar el turno exclusivamente como índice de ayudas;
- iniciar un wizard desde Inicio o Ayuda rápida sin contexto de fase;
- abandonar una sesión sin completar toda la plantilla.

Sí siguen siendo defectos:

- perder progreso o respuestas sin advertencia;
- mezclar el estado de dos bandas o campañas;
- asociar una resolución a una fase equivocada;
- impedir el acceso directo a una ayuda o resolución;
- presentar como completa una regla que no puede llegar a resultado;
- ocultar modificadores, fuentes o limitaciones.

## 6. Orden recomendado

1. `COR03-001`: eliminar la semántica restrictiva introducida por COR02-002.
2. `COR03-003`: reconciliar inmediatamente la documentación para que el criterio no vuelva a divergir.
3. Evaluar `COR03-002` como segunda pasada independiente, sin reabrir el alcance ya cerrado de COR02-006.
4. `COR03-004`: analizar las fuentes de detección pendientes.
5. `COR03-006`: reducir deuda estructural antes de multiplicar wizards.
6. `COR03-005`: desarrollar la Fase 8 con módulos reutilizables y acceso libre.

## 7. Conclusión

COR02-002 partía de una interpretación demasiado estricta del término «turno guiado». La aplicación debe guiar por contexto, no dirigir ni validar la forma de jugar. El orden de la hoja es información útil, pero no una regla de autorización de la interfaz.

La nueva prioridad es eliminar la fricción secuencial introducida, proteger únicamente el trabajo real del usuario y mantener todos los módulos accesibles de forma independiente. Las correcciones de datos, trazabilidad, detección, defensa antiaérea y mantenibilidad continúan siendo necesarias porque no dependen de esa interpretación.

