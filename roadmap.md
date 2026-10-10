# Roadmap — The Coming Wave Companion

## Estado de las capacidades (taxonomía única, AJ-004)

Cada capacidad de combate se clasifica como `done` (completa y validada), `partial`, `needs_review`, `blocked_by_source` o `not_started`. La matriz vigente por workflow (wizard, etapas cubiertas, aplicación del resultado, huecos y estado de la fuente) está en `data/rules/workflow-coverage.json` y un test la contrasta con los workflows, las rutas y `docs/rules/known-ambiguities.md`; el jugador la ve en «Ayuda rápida → Combate por tipo». Una fase **solo se declara «cerrada»** si cumple la Definition of Done; en otro caso se declara «corte vertical cerrado» indicando exactamente el subconjunto cubierto y lo que queda.

## Objetivo

Construir una aplicación de ayuda para **The Coming Wave** que permita recorrer la secuencia de juego desde una plantilla de dos días, entrar en cada fase y subfase, consultar reglas y ayudas, y resolver combates/reacciones mediante asistentes que conduzcan de forma trazable hasta la tabla y resultado correctos.

El desarrollo debe ser incremental: primero navegación y modelo de reglas; después resolución de combates; finalmente cobertura completa de dominios y reglas especiales. El producto será una **aplicación web desplegable en un servidor**, desarrollada con **HTML, JavaScript y Node.js**. Las tablas de resultados, modificadores y demás datos fijos se mantendrán en **archivos de texto versionados en Git**, preferentemente JSON cuando deban ser procesados por la aplicación; no se requiere una base de datos para estos datos estáticos.

La **plataforma de uso prioritaria será una tablet en orientación horizontal (landscape)**. Todas las fases de interfaz y UX deben diseñarse y validarse primero para este formato, con controles táctiles, tablas legibles y aprovechamiento del ancho de pantalla. El diseño seguirá siendo responsive para otros tamaños, pero tablet horizontal constituye el objetivo principal de aceptación.

---

# Fase 0 — Auditoría y normalización de fuentes

**Objetivo:** convertir el material entregado en una base de conocimiento implementable y verificable.

**🎉 Cerrada.** Reconciliado el 2026-09-27: esta fase llevaba tiempo completa en la práctica (ver `development_status.md`, historial 2026-09-24/25) pero el checklist nunca se había marcado. Al revisar se encontraron y corrigieron 3 fuentes sin inventariar (`Aeródromos y puertos 1.pdf`/`2.pdf` y `TWC Flotas Castellano.docx`) — ya añadidas a `data/sources/sources.json` como `pending`/`verified` según corresponda; los dos PDFs de aeródromos/puertos siguen sin transcribir (bloqueados por no existir todavía un modelo de unidades/logística al que enlazarlos).

### Tareas

- [x] Inventariar todos los PDFs, DOCX, TXT e imágenes disponibles — `data/sources/sources.json`, 17 fuentes (14 ya existentes + 3 encontradas sin inventariar el 2026-09-27).
- [x] Definir identificadores canónicos para reglas, tablas, fases, subfases, tipos de unidad, ataques y municiones — `tableId`/`workflowId`/`leaf`/`phaseId`/`subphaseId`/etc., consistentes en todo `data/`.
- [x] Crear un registro de fuentes con documento, página/sección y estado de transcripción — `data/sources/sources.json`.
- [x] Transcribir a archivos de texto estructurados (preferentemente JSON) el `Mapa de uso de tablas` — `data/routing/table-routing.json`.
- [x] Inventariar las 34 páginas de `Tablas-de-combate`, asignar un `tableId` a cada tabla/proceso y preparar su transcripción a archivos de texto versionables — `data/tables/page-02.json`..`page-34.json` + `index.json` (33/34; la página 1 es solo el índice del documento).
- [x] Documentar ambigüedades de traducción y diferencias entre reglas básicas/expandidas — `docs/rules/known-ambiguities.md`.
- [x] Crear un conjunto inicial de casos de ejemplo extraídos de las hojas de ayuda — `data/scenarios/golden-antiship-guided.json` (el golden test de Fase 7).

### Entregables

- `data/sources.json` o formato de texto equivalente
- `data/table-routing.json` o formato de texto equivalente
- estructura `data/tables/` y `data/modifiers/` para resultados y modificadores fijos
- `docs/rules/known-ambiguities.md`
- inventario de tablas y reglas con estado `pending | verified | implemented`.

### Criterio de salida

No se implementa un cálculo cuyo origen no pueda trazarse a una fuente concreta.

---

# Fase 1 — Esqueleto de aplicación y navegación

**Objetivo:** disponer de una app navegable antes de implementar cálculos complejos.

**🎉 Cerrada.** Reconciliado el 2026-09-27: completa desde el principio del proyecto (commits `b636349`/`0ddd503`), pero el checklist nunca se había marcado — el mismo problema de documentación detectado en Fase 0. Ver Fase 2 más abajo: la pantalla `Turno guiado` que satisface el criterio de salida de esta fase ya no es "ficticia", navega la plantilla real de `data/phases/turn-template.json`.

### Tareas

- [x] Inicializar el proyecto web con Node.js (`package.json`, scripts de desarrollo, test y arranque).
- [x] Definir una estructura de servidor Node.js capaz de servir la aplicación HTML/JavaScript y sus datos estáticos — `server/server.js`.
- [x] Crear `public/` o estructura equivalente para HTML, JavaScript de cliente, CSS e imágenes.
- [x] Crear `data/` con subdirectorios para tablas, modificadores, routing, fases, munición, detección y referencias de fuente.
- [x] Definir y documentar los esquemas JSON/texto usados por los datos fijos — cada `data/*/README.md` o convención equivalente, y validados por `test/data.test.js`.
- [x] Confirmar que la aplicación puede arrancarse y accederse desde navegador a través del servidor Node.js — `npm start`.
- [x] Crear layout principal.
- [x] Crear pantalla `Inicio`.
- [x] Crear pantalla `Turno guiado`.
- [x] Crear menú global `Ayuda rápida`.
- [x] Implementar navegación hacia:
  - [x] fases/subfases;
  - [x] tablas;
  - [x] detección;
  - [x] armamento/munición;
  - [x] lectura de fichas;
  - [x] reglas.
- [x] Añadir breadcrumbs de `Turno > Fase > Subfase` — `setBreadcrumb`.
- [x] Añadir historial básico de navegación — `pushHistory`/`HISTORY_KEY` en `localStorage`.
- [x] Añadir acciones `Volver`, `Terminar subfase` y `Terminar fase`.

### Criterio de salida

El usuario puede navegar por un turno ficticio completo sin cálculos y volver a cualquier ayuda sin perder su posición. — **Cumplido y superado:** desde Fase 2, el turno ya no es ficticio, es la plantilla real de `tcw_phase_help.xml`.

---

# Fase 2 — Modelo del turno de dos días

**Objetivo:** reproducir la plantilla de turno como una jerarquía/grafo navegable de fases y subfases, con seguimiento de progreso opcional — nunca como una máquina de estados que imponga una única "fase actual" o un orden obligatorio de finalización (AGENTS.md §3.1/§6; decisión de producto formalizada en `correcciones03.md#COR03-001`, que revoca en este sentido la lectura anterior de `correcciones.02.md#COR02-002`).

**⚠️ Reconciliado el 2026-09-27: esta fase NO estaba "sin empezar" como decía `development_status.md` hasta hoy.** Tiene un primer incremento real desde el commit `0ddd503` (muy al principio del proyecto): `data/phases/turn-template.json` modela el Proceso Estratégico (Crisis/Espacio/Diplomacia/Logística/Reparación) y los 2 Procesos de Campaña con las 4 fases de campaña (Aéreas/Superficie/Terrestres/Submarinas) y **las 18 subfases mínimas exigidas por AGENTS.md §3.1, las 18 presentes**; `public/js/app.js` (`renderTurnIndex`/`renderProcess`/`renderPhase`/`renderSubphase`) navega proceso→fase→subfase con fases opcionales saltables, progreso persistente en `localStorage` (`✓ Completada`/`— Omitida`) e historial de navegación. `test/data.test.js` valida IDs únicos, referencias cruzadas fase↔proceso↔subfase y presencia de `sourceRefs`/`ruleReference`/`endCondition`. De los gaps encontrados en la reconciliación, ya se cerraron los enlaces contextuales, el contador de banda de día y la recuperación/restablecimiento (modelo mínimo de unidades). **🎉 CERRADA (2026-09-27): "Soportar escenarios que omiten alguna fase" se elimina del checklist** — dependía del concepto de "escenario" de la antigua Fase 15 (Sistema de escenarios), retirada del roadmap a petición del mantenedor ("no lo vamos a hacer"); sin esa fase, esta tarea no tiene ya ningún requisito que cumplir dentro de Fase 2.

**⚠️→🎉 Reconciliación COR-006 (correcciones.md, 2026-09-27):** una revisión de ingeniería posterior a la declaración "CERRADA 7/7" de arriba encontró que, en la práctica, esa declaración no se sostenía del todo: el progreso de las 2 instancias del Proceso de Campaña compartía estado (`finishedPhases`/`finishedSubphases`/`skippedPhases` globales, sin distinguir Campaña 1 de Campaña 2 — COR-001) y `Terminar fase` podía cerrar una fase con subfases pendientes sin ningún aviso ni registro (COR-002). No se reescribe la nota "CERRADA 7/7" de arriba (AGENTS.md §18.3: es un registro histórico de lo que se consideró terminado en ese momento, con ese checklist concreto — ninguna de las 7 tareas originales pedía explícitamente "cada Campaña con progreso propio"), pero el resumen vigente debía dejar de presentar como cerrado un criterio que el código no cumplía todavía. **Ambas incidencias ya están resueltas** (mismo día): COR-001 introduce un esquema de progreso `processRuns` con identidad propia por `runKey` (`processId:occurrence`) — ver `public/js/turn-progress-engine.js` y `test/turn-progress-engine.test.js` (`finishPhase: terminar una fase en la Campaña 1 no afecta a la Campaña 2`, `isProcessComplete/isSequenceComplete distinguen Campaña 1 de Campaña 2`, y el E2E `recorrer el proceso estratégico + las 2 instancias de Campaña, cada una con su propio runKey`); COR-002 añade `evaluatePhaseCompletion` y una confirmación específica de cierre anticipado — ver los 4 tests de `evaluatePhaseCompletion` en el mismo archivo. Con ambas resueltas y probadas, **Fase 2 vuelve a considerarse genuinamente cerrada 7/7**, esta vez incluyendo también la identidad de instancia y el tratamiento explícito de cierres con pendientes que el checklist original no exigía por escrito pero que el criterio de salida de la fase (recorrer la secuencia de principio a fin de forma coherente) sí implicaba.

### Tareas

- [x] Modelar bandas de días/turnos de la hoja de turnos — **hecho (2026-09-27)**: `#/turno` muestra "Banda de día N de 14 (Días X-Y)" con controles "← Banda anterior"/"Siguiente banda →", leyendo las 14 bandas ya transcritas en `data/phases/turn-sequence-help.json#dayBands` (sin duplicar el dato); resalta la nota "destacada en la hoja física" en las bandas 4/8/12. Cambiar de banda reinicia el progreso de fases/subfases del turno guiado (es un recorrido nuevo; ninguna fuente transcrita dice qué persiste de una banda a otra, así que no se inventa).
- [x] Modelar fase estratégica/fase 0 — `proceso_estrategico` (crisis/espacio/diplomacia/logistica/reparacion).
- [x] Modelar fases de campaña — `proceso_campana` ×2 (acciones_aereas/superficie/terrestres/submarinas).
- [x] Soportar fases opcionales — flag `optional` + botón "Saltar fase".
- [x] Implementar recuperación/restablecimientos vinculados al cambio de fase o turno cuando estén soportados — **hecho (2026-09-27), alcance mínimo deliberado.** Nuevo modelo de unidades: `data/units/registry-index.json` (catálogo de las 264 unidades ya transcritas, generado con `scripts/build-unit-registry.js`) + una "Plantilla de fuerzas" de sesión (`#/unidades`, `localStorage`) con 2 estados por unidad (Actuada/No Actuada, Dañada/Operativa — ambos ya confirmados por fuente, no inventados). Terminar la Fase Logística ahora sí ejecuta "cambia las unidades marcadas como Actuadas a No Actuadas" tal como el propio texto de la fase ya describía. Deliberadamente **no** modela posición/alcance/detección/munición consumida (esos mecanismos necesitarían fuentes que este proyecto no ha transcrito todavía, p.ej. "apoyo logístico" por hexágono para el reabastecimiento de munición antiaérea — ver Decision Book §6.2.1, extracto en `data/rules/decision-book-excerpts.json#defensa-antiaerea`).
- [x] Mostrar visualmente el estado de cada fase — `✓ Completada`/`— Omitida`/`→ Siguiente sugerida` (dato orientativo, no una fase "actual" con efectos de autorización) en `phase-card`/`subphase-card`, con progreso propio por cada instancia (`runKey`) de un proceso repetido (COR-001/COR-002, correcciones.md, 2026-09-27). **Actualizado el 2026-09-28 (COR03-001, correcciones03.md):** el estado `⚠ Cerrada anticipadamente` y la insignia "▶ Actual" se retiraron — terminar una fase con subfases sin marcar es una acción voluntaria normal, no una anomalía.
- [x] Guardar/restaurar sesión local — `loadProgress`/`markPhaseFinished`/`markSubphaseFinished` en `localStorage`.

### Subfases mínimas a representar

**Acciones aéreas**
- Planificación de misiones.
- Mantenimiento de alerta aérea.
- Recuperación de misiones largas.
- Preparación/integración de aeródromo.
- Salidas/operaciones de combate.
- Recuperación de misiones cortas.
- Restablecimiento de capacidades.

**Acciones de superficie**
- Reorganización de formaciones.
- Combate naval de superficie.
- Operaciones logísticas de transporte.

**Acciones terrestres**
- Despliegue de aviación militar.
- Maniobras terrestres.
- Combate terrestre.
- Ataques terrestres.
- Reorganización terrestre.

**Acciones submarinas**
- Búsqueda rutinaria.
- Combate submarino.
- Operaciones logísticas de transporte.

### Criterio de salida

La secuencia puede recorrerse de principio a fin y cada nodo muestra explicación, acciones disponibles y enlaces contextuales. — **Cumplido (2026-09-27).** Cada fase y subfase del turno guiado muestra ahora una sección "Ayuda contextual" (`renderContextualHelpLinks` en `public/js/app.js`) con acceso directo a Tablas/Detección/Reglas y extractos/Leyenda de counters, y las 6 subfases que corresponden a un combate concreto (`salidas_combate`, `combate_superficie`, `combate_terrestre`, `ataques_terrestres`, `busqueda_rutina`, `combate_submarino`) enlazan además a su(s) workflow(s) de "Combate por tipo" — vía el nuevo campo `relatedWorkflowIds` en `data/phases/turn-template.json`, validado contra `data/workflows/index.json` por un test de integridad nuevo. Verificado manualmente en el navegador (con y sin `relatedWorkflowIds`, a nivel de fase y de subfase) y en tablet horizontal (1024×768, sin scroll horizontal), sin errores de consola. `npm test` → 154/154 OK (era 153/153).

---

# Fase 3 — Biblioteca de ayudas

**Objetivo:** hacer útil la aplicación incluso antes del motor completo de combate.

### Tareas

- [x] Ayuda de lectura de counters aéreos.
- [x] Ayuda de counters navales/terrestres/submarinos/baja altitud.
- [x] Ayuda de planes de ataque.
- [x] Leyenda de iconos de ataque.
- [x] Ayuda de tipos de munición.
- [x] Ayuda de estados de detección.
- [x] Buscador por término/regla.
- [x] Enlaces cruzados entre ayuda, regla y tabla.

### Criterio de salida

Desde cualquier subfase, el usuario puede entender los campos básicos de una ficha y de un plan de ataque sin salir del flujo principal.

---

# Fase 3.5 — Correcciones de diseño y ajustes (mantenedor)

**Objetivo:** aplicar la ronda de correcciones de diseño y ajustes que el mantenedor entregó tras el cierre de la Fase 3, en `Mejoras y ajustes de TCW.txt` (2026-09-26). Los requisitos ya están incorporados como reglas permanentes en `AGENTS.md` §4 y §9 (aplican a todo el proyecto, no solo a lo ya construido); esta fase es el checklist de implementación sobre las pantallas existentes.

**🎉 Cerrada (2026-09-27).** Las 11 tareas del checklist están hechas; la última (imagen de aeródromo) se desbloqueó al reconciliar Fase 2 el mismo día.

### Tareas

- [x] Recuadro rojo sobre la imagen de una ficha, señalando el factor exacto que pide el sistema (AGENTS.md §9.4).
- [x] Reformatear las cabeceras de tabla desproporcionadamente grandes a 2-3 líneas (AGENTS.md §9.3).
- [x] Botón "volver arriba" en pantallas largas (AGENTS.md §4).
- [x] Ampliar (zoom) cada icono de la leyenda al pasar el ratón por encima / al tocar en táctil (AGENTS.md §9.5).
- [x] Tooltip/toque con la explicación de cada factor, anclado a su posición sobre la imagen de la ficha, en la leyenda de counters (AGENTS.md §9.4).
- [x] Fondo de la aplicación con el logotipo (`thecomingwave.png`) difuminado y scroll paralaje (AGENTS.md §4).
- [x] **Recorte del plan de ataque del PDF de origen en la explicación de cada plan concreto — COBERTURA COMPLETA (AGENTS.md §9, Planes de ataque y munición):** las 17 hojas de "Tablas de Armamento" están calibradas y verificadas, cubriendo las **198 de 198 unidades** transcritas en `attack-plans`/`special-unit-plans`/`naval-plans` de los 6 países (verificado por comparación directa entre el recuento real de unidades y las entradas de `unit-regions.json`). Última hoja calibrada: RU 3 (submarinos rusos + helicópteros/artillería, sin rotar; 20 unidades). Cada unidad muestra el recorte de su fila exacta en la hoja original, tocable para ver la hoja completa; ninguna región fue aproximada — todas se midieron con una rejilla de coordenadas y se verificaron con un recorte de prueba antes de fijarlas (AGENTS.md §14).
- [x] Ver en pantalla las imágenes completas de los planes de ataque de un país tal como aparecen en el PDF (AGENTS.md §9, Planes de ataque y munición).
- [x] Recorte visual de identificación para cada valor que pide el Wizard (AGENTS.md §9.2) — hecho para los 3 valores que el wizard actual lee de un factor de ficha (Protección del avión, Valor Electrónico de la flota, A.A. de interceptación), reutilizando el visor de counters. Sigue sin engancharse para el único valor que viene de un plan de ataque ("Valor de Ataque base de la munición"): aunque el recorte por unidad ya está calibrado al 100% (ver la tarea de arriba), el wizard no rastrea qué unidad concreta ataca en cada paso, así que no hay un id de unidad al que apuntar ese recorte todavía.
- [x] Acceso directo del Wizard a las páginas de tablas relacionadas con ese tipo de ataque, en cada paso relevante (AGENTS.md §9.2).
- [x] Imagen de aeródromo (`Aeródromos y puertos 1.pdf`/`2.pdf`) en la subfase de Preparación/integración en aeródromo — **hecho (2026-09-27)**: las 15 páginas de `Aeródromos y puertos 2.pdf` (fichas de aeródromo) se muestran como galería de apoyo visual en la subfase `preparacion_aerodromo`, mismo patrón (miniatura → visor a pantalla completa) que las hojas completas de Tablas de Armamento. Sin recorte por aeródromo concreto todavía (no hay modelo de datos de aeródromos/mando al que enlazarlo, ver `data/sources/sources.json#aerodromos-puertos-2`) — solo apoyo visual, tal como pedía la tarea. De paso, las 17 páginas de `Aeródromos y puertos 1.pdf` (fichas de puerto, distinto contenido del que se creía) se añadieron igual a las 3 subfases cuyo texto ya menciona "puertos"/"puerto" (`reorganizacion_formaciones`, `logistica_transporte_superficie`, `logistica_transporte_submarino`).

### Criterio de salida

Las pantallas ya construidas en la Fase 3 (y el wizard de ataque guiado a superficie) cumplen los requisitos de `AGENTS.md` §4/§9 añadidos en esta ronda. **🎉 Las 11 de 11 tareas están cerradas (2026-09-27).**

**🎉 Recorte por unidad de armamento: cobertura completa (2026-09-26).** Las 17 hojas de "Tablas de Armamento" están calibradas, cubriendo las 198 de 198 unidades de `attack-plans`/`special-unit-plans`/`naval-plans`. Ya no queda ninguna hoja pendiente de esta tarea. Lecciones acumuladas durante el proceso (relevantes si alguna región necesita recalibrarse en el futuro, p.ej. tras detectar un error): (a) en crops estrechos (poco ancho en píxeles, por tanto muy ampliados al mostrarse a 900px), cualquier margen de más alrededor de la fila se amplifica mucho al verse — medir con un margen de pocos píxeles, no solo comprobar que la unidad aparece dentro; (b) dentro de una misma rejilla, dos "columnas" pueden no tener el mismo ancho en píxeles — medir cada columna por separado con su propia rejilla fina, nunca asumir simetría; (c) una misma hoja de armamento puede mezclar unidades de `ammunition/` (con plan de ataque) y unidades de `data/units/` (sin plan de ataque, p.ej. SAM/EWR/HLSC/brigadas terrestres genéricas) — antes de calibrar, confirmar contra los archivos de datos qué unidades hay que buscar realmente en esa hoja. Ver `data/ammunition/source-pages/unit-regions.json#coverage` y `development_status.md` para el historial completo, hoja a hoja.

---

# Fase 4 — Motor de detección

**Objetivo:** resolver y explicar la detección como módulo independiente y reutilizable.

**🎉 Cerrada (2026-09-27).** `public/js/detection-engine.js` (funciones puras, mismo patrón UMD-lite que los motores de tablas/combate) + una pantalla interactiva "Resolver detección" (`#/ayuda/deteccion/resolver`, enlazada desde la referencia de solo lectura ya construida en la Fase 3) con 8 resolutores, uno por cada regla comprobable de `data/detection/help-sheet.json`. Ninguna función inventa una distancia/umbral que la hoja no declare: donde la fuente solo da una regla categórica (electrónica, quién puede detectar terrestres/navales), el resolutor explica esa regla tal cual, sin fingir un cálculo numérico que no existe.

### Tareas

- [x] Estados: detectable, oculta y brevemente detectable — `resolveGroundMobileDetectability` (detectable/oculta, precondición terrestre) y `resolveBrieflyDetectable` (oculta → brevemente detectable por acción).
- [x] Estados de exposición: no expuesta, expuesta, electrónica y continua cuando proceda — los 4 estados aparecen como `state` en las salidas de los resolutores (`exposed`/`not-exposed`/`exposed-electronically`/`continuously-exposed`).
- [x] Detección aérea contra unidades aéreas — `resolveAirToAirExposure`/`resolveAirToAirMutualExposure` (distancia en hexágonos vs. firma aérea del objetivo, en los dos sentidos).
- [x] Detección aérea contra superficie/tierra cuando proceda — cubierto por `resolveNavalDetectorEligibility` (detectorType `air`) y `resolveGroundDetectorEligibility` (detectorType `air-isr`): ambas categóricas, tal como las declara la fuente (sin alcance numérico).
- [x] Detección naval — `resolveNavalDetectorEligibility` (quién puede exponer a un buque: superficie siempre, aérea/terrestre/baja altitud bajo condición) + `resolveSurfaceDetectsAir` (la unidad naval detectando una unidad aérea/baja altitud).
- [x] Detección terrestre — `resolveGroundDetectorEligibility` (quién puede) + `resolveGroundMobileDetectability` (Terreno×4 vs. Fuerza/unidades técnicas).
- [x] Detección de baja altitud — como objetivo: `resolveAirToAirExposure` (firma superior) y `resolveSurfaceDetectsAir` (alcance fijo de 1 hex). La tabla modificadora de radar específica de cada counter sigue `needs_review` (ya documentado en `data/detection/help-sheet.json#airDetection.radarModifierCaveat`): no se transcribe como tabla genérica porque cada radar imprime la suya propia.
- [x] Detección electrónica/ESM — `resolveElectronicDetection` (EW vs. radar).
- [x] Mostrar alcance calculado y motivo — cada resolutor devuelve `reason` con la distancia/umbral usados, mostrado en la UI.
- [x] Registrar la fuente y el cálculo — cada resolutor devuelve `sourceRefs` (documento + página), mostrado en la UI.

### Tests prioritarios

- [x] ejemplos de la hoja de ayuda de detección — `test/detection-engine.test.js` reproduce los 3 casos cualitativos del ejemplo KF-16C/D (firma 3) vs. J-16 (firma 5) de la hoja, con distancias ilustrativas (la hoja no transcribe la distancia exacta en hexágonos).
- [x] diferencia entre detectable y expuesta — `resolveGroundMobileDetectability` resuelve la precondición "detectable" por separado de "expuesta" (que depende además del alcance del detector).
- [x] brevemente detectable y ataques de reacción — `resolveBrieflyDetectable`.
- [x] instalaciones fijas siempre expuestas cuando la regla aplicable así lo establezca — `resolveFixedInstallationExposure`.

### Criterio de salida

El módulo responde no solo `sí/no`, sino `por qué`, `a qué distancia` y `qué estado resulta` — verificado en los 8 resolutores, cada uno con su `reason`, su `state`/`exposed`/`capable` y sus `sourceRefs`.

---

# Fase 5 — Infraestructura de tablas y modificadores

**Objetivo:** crear el motor genérico que usarán todos los combates.

**🎉 Cerrada (2026-09-27).** Primer incremento real desde el commit `179441a`, con `public/js/table-engine.js` (funciones puras, resolución de fila/columna/celda de cualquier página de `data/tables/`) y su visor conectado en `? Ayuda rápida > Tablas`. El checklist original nunca se marcó pese a estar en producción — reconciliado el mismo día que se detectó el gap: el motor resuelve tablas, y desde ese día también generaliza modificadores/desplazamiento de columnas/caps (`public/js/combat-modifier-engine.js`, ver criterio de salida), en vez de la lógica ad-hoc por workflow que había antes solo dentro de `public/js/combat-wizard-engine.js` (Fase 7).

### Tareas

- [x] Definir formato de archivo de texto/JSON para tablas y modificadores — `data/tables/page-NN.json` (`rowAxis`/`columnAxis`/`cells`/`cellLegend`/`alternateLabels`/`variants`/`reusesTable`).
- [x] Implementar carga y validación de esos archivos desde JavaScript/Node.js — `table-engine.js#findTableInPage`/`resolveCell`, validado por `test/table-engine.test.js` y `test/data.test.js`.
- [x] Garantizar que ningún valor fijo de resultados o modificadores quede hardcodeado en componentes o funciones — ninguna tabla vive en JS, solo en `data/tables/`.
- [x] Modelo de tabla bidimensional — `rowAxis`/`columnAxis`/`cells`.
- [x] Modelo de rangos (`1`, `2-3`, `18+`, etc.) — `parseRangeToken` (valor exacto, rango `~`, límite abierto `+`, `<=`/`>=`, placeholder `.`, asterisco `*`).
- [x] Modelo de modificadores numéricos — `CombatWizardEngine.sumModifiers(questions, answers, target)` ya era genérico (suma los efectos `{type:"modifier", target, value}` declarados en cualquier `data/workflows/*.json`, sin conocer el dominio); usado por V.E.F., interceptación y, desde 2026-09-27, por la reducción de Defensa Aérea de Área.
- [x] Modelo de desplazamiento de columnas — **hecho (2026-09-27)**: nuevo módulo `public/js/combat-modifier-engine.js#resolveAttackValueColumnShift` + `table-engine.js#shiftColumnIndex`, generalizando la mecánica "Modificación de Intensidad" (Decision Book §5.12.10/§5.13.6: modificadores negativos reducen primero el Valor de Ataque hasta un límite, luego desplazan la columna de resolución a la izquierda). Sin wizard consumidor todavía (`ground_guided`/`ground_unguided` no tienen wizard propio) — ver criterio de salida.
- [x] Soporte de columnas especiales/saltables — el desplazamiento de columna (arriba) salta las columnas etiquetadas "." sin que cuenten para el desplazamiento, reutilizando el mismo criterio "skip" que ya usaba `parseRangeToken` para celdas.
- [x] Soporte de caps/mínimos/máximos — `resolveAttackValueColumnShift` implementa el cap declarativo (`valueCap`, parametrizable: 13 en `ground_guided`, 66 en `ground_unguided`, ambos confirmados por cita textual) que reduce el valor bruto antes de convertir el resto del modificador en desplazamiento de columna.
- [x] Soporte de resultados no numéricos — `cellLegend` (p.ej. `"."` = sin impacto) y `isMissingData` para celdas `needsReview`.
- [x] Render de tabla con fila/columna/celda resaltada — `renderGrid` en `public/js/app.js`.
- [x] Panel `Cómo se ha calculado` — `TableEngine.describeResolution(table, result)`, mostrado bajo el resultado en el visor.
- [x] Tests automáticos de integridad de tablas — `test/data.test.js` (índice sincronizado, dimensiones, `sourceRefs`, `reusesTable`, IDs únicos) + `test/table-engine.test.js` (14 tests).

### Criterio de salida

Una tabla de ejemplo puede resolverse únicamente con datos declarativos, sin lógica específica en el componente de UI. — **Cumplido (2026-09-27).** La resolución de fila/columna/celda ya era 100% genérica (el visor de `? Ayuda rápida > Tablas`); el mecanismo de modificadores/desplazamiento de columnas/caps también lo es ahora (`public/js/combat-modifier-engine.js`, nuevo motor hermano de `table-engine.js`/`table-routing-engine.js`/`combat-wizard-engine.js`), parametrizado por `valueCap` y sin conocer ningún dominio de combate. **Matiz honesto:** "generalizado y probado" no es lo mismo que "en uso" — ningún wizard lo consume todavía, porque `ground_guided`/`ground_unguided` (las 2 tablas que necesitan este mecanismo, páginas 5 y 9) no tienen wizard propio (solo `antiship_guided` lo tiene, y esa tabla final no usa desplazamiento de columna). 11 tests nuevos contra la regla citada del Decision Book (sin golden test oficial que la ejercite con un ejemplo numérico completo). `npm test` → 173/173 OK.

---

# Fase 6 — Router de combate

**Objetivo:** guiar al usuario hasta la familia de tablas correcta.

**🎉 Cerrada.** Reconciliado el 2026-09-27: primer incremento real desde el commit `8d066d7`. `data/routing/table-routing.json` transcribe el árbol completo de `Mapa de uso de tablas.txt` (14 hojas, `gaps: []` — el único gap detectado, "Logística", ya se resolvió apuntando a `data/tables/page-32.json`); `public/js/table-routing-engine.js` (funciones puras) lo recorre pregunta a pregunta sin elegir nunca una rama por defecto, y `#/ayuda/tablas/router` lo expone como pantalla interactiva con breadcrumb de decisiones. El checklist nunca se había marcado pese a estar en producción y con 12 tests (`test/table-routing-engine.test.js`).

Implementar el árbol del `Mapa de uso de tablas`.

### Rutas mínimas

- [x] Tierra → cercano — `ground_close_combat`.
- [x] Tierra → lejano → guiado — `ground_guided`.
- [x] Tierra → lejano → no guiado — `ground_unguided`.
- [x] Tierra → lejano → antirradiación — `anti_radiation`.
- [x] Aire/baja altura → origen aéreo → interceptación/BVR/WVR — `air_combat` (workflow 05: initiative/bvr/wvr).
- [x] Aire/baja altura → origen tierra/mar → defensa aérea — `area_air_defense`.
- [x] Mar → guiado — `antiship_guided` (vertical slice de Fase 7).
- [x] Mar → no guiado — `antiship_unguided`.
- [x] Mar → torpedos — `torpedo_vs_surface`.
- [x] Submarino → ASW aéreo — `asw_search_support`/`asw_surface_air` (search_type `air`).
- [x] Submarino → ASW superficie — `asw_search_support`/`asw_surface_air` (search_type `signature`).
- [x] Submarino → ataque antisubmarino submarino — `asw_search_support`/`asw_submarine`.
- [x] Estratégico → guerra espacial/ultraterrestre — `strategic_actions` (etapa `space_destruction`).
- [x] Estratégico → logística — `data/tables/page-32.json#army-logistics-resupply` (sin workflow propio, gap ya cerrado).

### Criterio de salida

Para cualquier ruta implementada, las respuestas del usuario terminan de manera determinista en una tabla/proceso concreto. — **Cumplido para las 14 rutas.** Limitación conocida y ya documentada (`crossReferences` en el propio archivo de datos, no un fallo de routing): 3 hojas (`ground_guided`/`anti_radiation`/`antiship_guided`) tienen un salto condicional de su primera etapa según el tipo de munición que el router no expresa todavía como `showIf`/`skipIf` — el wizard de Fase 7 sí lo resuelve caso a caso.

---

# Fase 7 — Vertical slice: ataque guiado contra superficie

**Objetivo:** implementar de extremo a extremo el caso mejor documentado y usarlo como patrón para el resto.

**🎉 Cerrada como vertical slice (2026-09-24/25), reconciliado el 2026-09-25→27.** `public/js/combat-wizard-engine.js` + el wizard de 6 pasos (hoy en `public/js/views/antiship-guided-wizard.js`, extraído de `app.js` por COR-005 el 2026-09-28) resuelven de extremo a extremo `data/workflows/07_ataque_antibuque_guiado.json` hasta el daño/hundimiento final, verificado exactamente contra `data/scenarios/golden-antiship-guided.json`. El checklist de "Flujo" no se había marcado nunca: al reconciliarlo se confirma que 9 de 13 pasos están hechos y los 4 restantes compartían una misma causa raíz ya documentada en Fase 3.5 (el wizard no tenía todavía un modelo de unidades/planes de ataque del que leer valores automáticamente — todo se introducía a mano). **Los 4 pasos restantes se cerraron el 2026-09-28 (correcciones.md COR-007):** ver detalle abajo.

### Flujo

- [x] Elegir unidad atacante — **Resuelta por COR-007 (2026-09-28):** modo "Seleccionar unidad y plan" (país→unidad), reutilizando `data/ammunition/` ya transcrito; el modo manual se conserva para quien prefiera introducir los valores a mano.
- [x] Elegir plan de ataque — **Resuelta por COR-007**, misma corrección: selector de plan que solo ofrece los planes con método guiado reconocido de la unidad elegida.
- [x] Leer tipo, alcance y valor/carga de munición — **Resuelta por COR-007:** método, Valor de Ataque (según carga pesada/ligera y estado completo/dañado) y alcance se derivan de `data/ammunition/` en vez de introducirse a mano en modo validado.
- [x] Validar alcance — **Resuelta por COR-007:** en modo validado, una distancia que supere el alcance transcrito del plan bloquea el avance ("Siguiente →") con un mensaje explícito, en vez de ser solo informativa.
- [x] Resolver posible defensa aérea contra la plataforma atacante — "Disparo en Área" (paso 1, `resolveAreaAirDefenseShot`, workflow 06).
- [x] Resolver interceptación de munición — paso 3 (`resolveInterceptionShot`/`sumInterceptionReductions`).
- [x] Preguntar rendimiento de defensa AA — pregunta `interception_performance` de la etapa `munition_interception`, renderizada genéricamente por `stage.questions`.
- [x] Preguntar detección de atacante/guía — preguntas `attacker_detected`/`detection_state` de las etapas `area_air_defense`/`munition_interception`/`fleet_electronic_resistance`.
- [x] Aplicar reducción de valor de ataque — `computeAttackValueAfterDefenses` (suma reducción de Defensa de Área + Interceptación de Munición).
- [x] Resolver defensa electrónica de la flota — paso 4 (`resolveVefRollModifier`/`resolveAttackMultiplier`).
- [x] Resolver ataque final — paso 5 (`attack_method`, tabla final página 22 con el esquema de fila correcto según método).
- [x] Interpretar impactos/daños — sección de asignación/daño/hundimiento dentro del paso Resultado (`assignImpactTarget`/`applyImpactsToShip`/`checkSinking`). **Corregido (2026-09-27):** `applyImpactsToShip` asumía 1 impacto = 1 daño para cualquier método; Decision Book §5.6.5 confirma que Supersónico causa 2 daños/impacto (el golden test solo ejercita Subsónico, por lo que el error era invisible). Balístico/Espacio Cercano (6 daños/impacto con escudo, hundimiento directo sin él) queda explícitamente sin modelar — depende de un atributo "escudo" por buque que este proyecto no registra todavía.
- [x] Mostrar resumen completo — resumen de entradas + traza de cálculo en cada paso y en el resultado final.

### Golden test

Reproducir paso a paso el ejemplo de la hoja de ayuda de ataque guiado contra unidades de superficie. — [x] `data/scenarios/golden-antiship-guided.json` + `test/golden-antiship-guided.test.js`, verificado también manualmente en el navegador con los valores exactos del ejemplo (ver `development_status.md`, 2026-09-25).

### Criterio de salida

Un usuario puede completar el ejemplo sin consultar externamente una tabla y obtiene los mismos valores intermedios y finales que la hoja de ayuda. — **Cumplido**, verificado dos veces (test automático + navegador manual, resultado "3 impacto(s)" idéntico en cada paso intermedio).

---

# Fase 8 — Defensa antiaérea e interceptaciones

**Objetivo:** consolidar los procesos defensivos reutilizados por múltiples ataques.

**⚠️ Auditada el 2026-09-27 (confirmado 0% real, con matices).** A diferencia de las Fases 0-7, aquí el checklist en 0% SÍ reflejaba la realidad: no existía ningún módulo "consolidado y reutilizado por múltiples ataques" (el criterio de salida de esta fase). Lo que sí existía eran piezas sueltas construidas dentro del vertical slice de Fase 7 (`antiship_guided`) y del motor de modificadores de Fase 5, cada una resolviendo solo UNA de las 9 tareas de abajo para UN solo workflow. **El mismo día se conectó/construyó motor puro para "Interceptación más allá del horizonte", "Interceptación final", "Contraataque a baja altura" y el marco de "Interceptación de misiles balísticos" (capítulo 6 completo del Decision Book, §6.1-§6.10, ya leído y consolidado en `data/rules/decision-book-excerpts.json#defensa-antiaerea`) — pero seguía sin existir NINGÚN módulo compartido reutilizado por más de un ataque real.**

**🎯 COR02-010 (correcciones.02.md), Resuelta parcialmente (2026-09-28):** nuevo wizard `#/wizard/antiship-unguided` (workflow `08_ataque_antibuque_no_guiado.json`) — el segundo consumidor real de módulos defensivos que pedía la incidencia. Cierra 2 de las 5 tareas marcadas como "sin consumidor" en la auditoría de arriba (Interceptación Final, Interceptación de Munición — ver detalle en cada tarea) y de paso da su primer consumidor real a `CombatModifierEngine.resolveAttackValueColumnShift` (Fase 5, "Modificación de Intensidad" del workflow 08, con `valueCap: Infinity` porque este workflow no declara el tope de §5.12.10/§5.13.6 que sí usan `ground_guided`/`ground_unguided`). Quedan sin consumidor real "Defensa Antiaérea de Área" (compartida), "Interceptación de Misiles Balísticos" y "Contraataque a Baja Altura" — el criterio de salida de la fase sigue sin cumplirse íntegramente, pero ya no en 0%; ver `correcciones.02.md#COR02-010`.

### Tareas

- [x] Defensa antiaérea de área — dos mecánicas distintas con este nombre: `resolveAreaAirDefenseShot` (disparo contra el avión atacante, page-18) y `resolveAreaAirDefenseAttackReduction`/`combat-modifier-engine.js` (reducción de Valor de Ataque de munición CM/BM, page-03). **Resuelta (COR03-005, `correcciones03.md`, 2026-09-28) para `resolveAreaAirDefenseShot`:** gana su segundo consumidor real — `renderWizardStepAreaAirDefense`/`computeAreaAirDefenseShot` se promovieron de `views/antiship-guided-wizard.js` a `public/js/core.js` (tal como el propio comentario original anticipaba) y `antiship_unguided` los reutiliza como su nuevo paso 1 de 5, confirmado contra Decision Book §6.3 ("las unidades antiaéreas pueden en cualquier momento realizar un disparo antiaéreo contra... cualquier objetivo expuesto", sin restricción a munición CM/BM ni a ataques guiados — esa restricción es solo de la OTRA mecánica homónima). `resolveAreaAirDefenseAttackReduction` (reducción CM/BM) sigue con un solo consumidor (`antiship_guided`); workflow 08 no declara esa etapa — pendiente para `ground_guided`/`anti_radiation` (02/04), que sí la declaran.
- [x] Interceptación final — **Resuelta (COR02-010, 2026-09-28):** segundo consumidor real, el wizard `#/wizard/antiship-unguided` (`public/js/views/antiship-unguided-wizard.js`), contra `ground-unguided-final-interception` (page-07.json, reutilizada en page-23.json). `resolveFinalInterceptionShot` ya existía y estaba probada, pero sin ningún consumidor — ahora lo tiene. La lógica de absorción de impactos sobre el bando atacante sigue sin modelarse (ninguna fuente disponible especifica la consecuencia, a diferencia de "Disparo en Área" del ataque guiado): el wizard muestra los impactos sin inventar una consecuencia (AGENTS.md §14).
- [x] Interceptación de munición — **Resuelta (COR02-010, 2026-09-28):** `resolveInterceptionShot`/`sumInterceptionReductions` ahora tienen 2 consumidores reales, `antiship_guided` (page-04.json) Y `antiship_unguided` (page-08.json) — misma función pura, sin cambios, alimentada con la tabla propia de cada workflow. Satisface el criterio de aceptación de COR02-010 ("al menos dos workflows distintos consumen los mismos módulos defensivos"). Los workflows 02/03/04 declaran la misma mecánica sin wizard todavía.
- [x] Interceptación más allá del horizonte — conectada al wizard de `antiship_guided` (2026-09-27): nueva pregunta `early_warning_effect` (workflow 07) + `combat-wizard-engine.js#applyBeyondHorizonCap`, que topa el A.A. efectivo a la columna más a la derecha de la sección "No más allá del horizonte" cuando no hay alerta temprana. **Alcance limitado, no inventado:** solo cubre el esquema de columna "Convencional" que el wizard ya modela (A.A. propio usado directamente como columna 1-9); la agrupación de consumo Bajo (`columnAxis.lowConsumptionGrouping`) sigue sin un flujo que la use — sigue siendo una tarea de generalización pendiente, no de esta.
- [x] Interceptación de misiles balísticos — §6.9 leído y consolidado en `data/rules/decision-book-excerpts.json#defensa-antiaerea` (marco de elegibilidad: símbolo especial, red de alerta de misiles). **Resuelta (COR03-005, `correcciones03.md`, 2026-09-29) para elegibilidad + Fase Media + Alta Velocidad:** `data/workflows/06_defensa_aerea_area.json#area_defense` gana 3 preguntas nuevas (`ballistic_missile_interception`, `missile_defense_symbol`, `missile_alert_network`, con `sourceRefs` a §6.9/§6.9.1) que gatean la elegibilidad sin bloquear el flujo (AGENTS.md §14: informa, no impide); **Fase Media** ya funciona sin cambios de motor — es la misma `resolveAreaAirDefenseShot` que el paso "Disparo en Área" ya resuelve; **Interceptación de Alta Velocidad** conecta `checkHighSpeedInterceptionFailure` (probada desde antes, sin consumidor) como aviso junto a la tirada. **Interceptación Terminal queda fuera, con un hallazgo nuevo:** no es solo un flujo sin conectar — falta transcribir la fila "Terminal" de la tabla de Interceptación de Munición (páginas 4/8), que no existe en los datos ya transcritos; ver `docs/rules/known-ambiguities.md` (también documenta una duda sobre si el modificador 2d10-menor de §6.3.2 para objetivos de espacio cercano pertenece a esta mecánica o a la reducción de Valor de Ataque CM/BM, sin tocar ningún cálculo ya verificado).
- [x] Contraataque a baja altura — motor puro `combat-wizard-engine.js#resolveLowAltitudeCounterattackShot` (Decision Book §6.6.1-§6.6.2: 1d10 por cada unidad de vuelo bajo atacante contra el A.A. total ya confirmado del defensor; impactos ≥ Protección destruye al atacante). Las 3 tablas de origen (páginas 6/10 "Unidad principal", 14 "Sistema de Defensa Aérea", 22/26 "Artillería Naval") re-verificadas visualmente a 600 DPI, coinciden con la transcripción — se resolvieron de paso 2 needsReview obsoletos (page-06 sugería que el esquema alternativo no estaba transcrito; sí lo estaba, en page-14). **Resuelta (COR03-005, `correcciones03.md`, 2026-09-28): primer consumidor real** — `data/workflows/08_ataque_antibuque_no_guiado.json` gana la etapa `low_altitude_counterattack` (página 26, ya citada por `data/tables/page-26.json#workflowRefs`/`reusesTable` desde antes sin conectar), y `public/js/views/antiship-unguided-wizard.js` la resuelve como sección opcional tras la asignación de daño (Valor de Artillería Naval total de la flota superviviente + 1 disparo por atacante). Las 2 condiciones de elegibilidad de `page-26.json#referenceNotes` (solo dispara a plataformas de baja altura; buques con avería no contraatacan) se muestran como nota, sin comprobación automática todavía — no hay dato de "buque dañado por avería" ni de "tipo de plataforma objetivo" modelado. Sigue con un solo consumidor (antiship_unguided).
- [x] Rendimiento bajo/medio/alto — ya generalizado como pregunta de datos (`interception_performance`) reutilizada por los workflows que la necesitan, y sus modificadores (-2/-1/0) confirmados por cita textual (Decision Book §6.5.3).
- [x] Modificadores por detección — igual: pregunta `detection_state` ya generalizada y confirmada por cita.
- [x] Reglas de trayectoria/tipo de munición cuando correspondan — CM/BM y espacio cercano ya resueltos para la etapa de Defensa de Área (page-03.json); munición Ligera [L] (-3, Decision Book §6.5.3.D) **ya estaba transcrita** (2026-09-27): resultó ser el campo `unguided_icon_type` ya presente en los workflows 03/08 desde Fase 0, pero con un `iconRef`/prompt erróneo (`munition_unguided`, genérico y tautológico en un workflow ya exclusivamente no guiado) en vez del real (`munition_light`). Corregido con la cita exacta ahora localizada, en `data/workflows/03_ataque_terrestre_no_guiado.json`/`08_ataque_antibuque_no_guiado.json` y `data/tables/page-08.json`/`page-24.json`. Sigue sin wizard propio (Fase 9/13), pero el dato ya es correcto y visible en "Combate por tipo".

### Criterio de salida

Los ataques guiados/no guiados pueden reutilizar los mismos módulos defensivos sin duplicar lógica. — **Cumplido (actualizado 2026-09-29, COR03-005):** Interceptación de Munición, Fase 5 (`resolveAttackValueColumnShift`) y Defensa Antiaérea de Área (`resolveAreaAirDefenseShot`, promovida a `public/js/core.js`) se reutilizan sin duplicar lógica entre `antiship_guided` y `antiship_unguided`; Contraataque a Baja Altura tiene su primer consumidor real (`antiship_unguided`); Interceptación de Misiles Balísticos tiene ya su flujo de elegibilidad (workflow 06) con Fase Media y Alta Velocidad conectadas. **Excepción documentada (actualizada 2026-10-04):** Interceptación Terminal no es un módulo sin reutilizar ni una fila sin transcribir — la fuente no imprime ninguna fila "Terminal"; es la fila de consumo Bajo "Convencional / Penetración / BM" de la tabla de Interceptación de Munición (§6.5.1 + §6.9.2). Ya tiene datos (`alternateLabelSets.low` en páginas 4 y 8) y motor (`resolveBallisticMunitionInterceptionShot`) con tests; el consumo Alto/Bajo ya se elige por disparo en los wizards antibuque guiado y no guiado (2026-10-04); la opción "ataque balístico" (2d10) sigue sin ofrecerse en ningún wizard porque los planes balísticos están excluidos hasta transcribir la marca de Escudo. Ver `docs/rules/known-ambiguities.md`.

---

# Fase 9 — Ataques terrestres

**Objetivo:** cubrir la familia de ataques contra objetivos terrestres.

**Primer vertical slice — Combate cercano terrestre (2026-09-28):** `#/wizard/ground-close-combat`, construido sobre `data/workflows/01_combate_cercano_terrestre.json` + `data/tables/page-02.json` (ambos ya transcritos desde Fase 0) y el nuevo `public/js/ground-close-combat-engine.js`. A diferencia del ataque guiado a superficie (Fase 7), no existe ninguna "hoja de ayuda" con un ejemplo oficial resuelto para este dominio: cada paso cita el Decision Book §8.7 directamente, y el umbral de Derrota se verificó reproduciendo el propio ejemplo textual del Decision Book (§8.7.7, unidad Clase B/Tamaño de Fuerza 6). El combate real es simétrico (ambos bandos calculan y tiran a la vez, §8.7.4), pero el workflow transcrito solo modela una perspectiva; el wizard resuelve deliberadamente "tu bando" a la vez, en vez de inventar una UI de doble resolución simultánea que la fuente no describe.

### Tareas

- [x] Combate cercano terrestre — wizard `#/wizard/ground-close-combat` (2026-09-28).
- [x] Guerra electrónica del combate cercano — paso 3 del wizard, con la ventaja aplicada solo al bando con el Valor Electrónico más alto (2026-09-28).
- [ ] Cálculo y asignación de bajas — **PENDIENTE EXPLÍCITO por falta de datos (única casilla abierta de la Fase 9)**; parcial (2026-09-28): el wizard calcula los Puntos de Impacto y el umbral de Derrota (Decision Book §8.7.7, con la elección Clase A/B correctamente modelada como opcional, no automática). La asignación de esos Puntos de Impacto a una unidad principal concreta vía su Valor de Defensa Cercana (§8.7.6) NO está modelada — ese dato no existe en ningún registro de unidades del proyecto; el wizard lo señala explícitamente y pide el daño ya acumulado en su lugar, en vez de inventar un registro de datos nuevo.
- [x] Ataque terrestre guiado — **hecho (2026-10-05)**: wizard `#/wizard/ground-guided` (`public/js/views/ground-guided-wizard.js` + motor `public/js/ground-guided-attack-engine.js`) sobre `data/workflows/02_ataque_terrestre_guiado.json` + páginas 3-6 y el Decision Book §5.12: Defensa Aérea de Área e Interceptación de Munición (reutilizadas), modificación de Fuerza de Ataque, tabla de ataque de precisión con las 4 combinaciones de método (Ligero/no ligero × Normal/Persecución), fila Móvil/Fijo, tirada 9 y Contraataque a Baja Altura. Reproduce el ejemplo del reglamento (11 impactos). Resuelto con la confirmación del mantenedor del 2026-10-05 (ver `known-ambiguities.md`). Un método de ataque por ejecución; los efectos de los impactos sobre la unidad no se aplican.
- [x] Modificación de intensidad de ataque — **hecho (2026-10-05)**: grupos de modificadores por tipo de objetivo (`modifierGroups` del workflow 02, §5.12.9), densidad de tropas (+2 por cada 5 puntos sobre 30), designación, alta penetración + supersónico y neto máximo 0.
- [x] Objetivos móviles — **hecho (2026-10-05)**: modificaciones de §5.12.3-§5.12.6 y fila Móvil.
- [x] Unidades técnicas — **hecho (2026-10-05)**: móvil + Valor Electrónico técnico (§5.12.7, §5.12.9).
- [x] Instalaciones fijas — **hecho (2026-10-05)**: solo el Valor Electrónico de instalación (§5.12.8, §5.12.9) y fila Fijo.
- [x] Ataque terrestre no guiado — **hecho (2026-10-05)**: wizard `#/wizard/ground-unguided` (`public/js/views/ground-unguided-wizard.js`, mismo motor `public/js/ground-guided-attack-engine.js`) sobre `data/workflows/03_ataque_terrestre_no_guiado.json` + páginas 7-10 y el Decision Book §5.13: Intercepción Final, Interceptación de Munición (el plan Ligero aplica -3 y se deriva del tipo de ataque), modificaciones solo contra unidades móviles (distancia, densidad de tropas, designación; §5.13.2), tabla de la página 9 con las 4 combinaciones de método (Ligero/no ligero × Normal/Persecución), fila Móvil/Fijo, tope 66, tirada 9 y Contraataque a Baja Altura. Reproduce el ejemplo del reglamento (9 impactos). Un método de ataque por ejecución; los efectos de los impactos sobre la unidad no se aplican.
- [x] Ataque antirradiación — **hecho (2026-10-04)**: wizard `#/wizard/anti-radiation` (`public/js/views/anti-radiation-wizard.js` + motor puro `public/js/anti-radiation-attack-engine.js`) sobre `data/workflows/04_ataque_antirradiacion.json` + páginas 11-14, siguiendo el Decision Book §5.14: Defensa Aérea de Área e Interceptación de Munición (reutilizan las funciones del ataque guiado a superficie), modificación -5 con desplazamiento de columna y tope 13, fila [L]/Normal de la página 13, cancelación por tirada 9 y Contraataque a Baja Altura. La aplicación de los Puntos de Impacto a la unidad de radar (§5.14.3 "similar a 5.15") no está modelada.
- [x] Resolución de resultados sobre puertos/aeródromos/unidades — **hecho (2026-10-05)**: wizard `#/wizard/ground-attack-result` (`public/js/views/ground-attack-result-wizard.js` + motor `public/js/ground-attack-result-engine.js` + reglas en `data/rules/ground-attack-results.json`) sobre el Decision Book §5.15.1-§5.15.3: unidad terrestre (ataque normal con Valor de Terreno, sin terreno en Interdicción Aérea/ARM, Persecución Aérea sin límite), puerto (Instalaciones Paralizadas, munición y combustible, buques de superficie y submarinos) y aeródromo (pista, apron con capacidad de hangares y logística opcional). Los wizards de ataque terrestre guiado y no guiado le trasladan los impactos con un botón. No se modela la Planificación Profunda (§5.15.4, opcional) ni las fortificaciones.

### Atención especial

- [x] diferencias entre valor base y columna final — **hecho (2026-10-05)**: los wizards guiado y no guiado muestran el Valor de Ataque tras defensas, la modificación neta y la columna final.
- [x] límites del valor de ataque — **hecho (2026-10-05)**: tope 13 (página 5) y 66 (página 9), con la reducción previa por cada punto negativo.
- [x] modificadores por distancia — **hecho (2026-10-05)**: -2 / -5 / -10 según la distancia o la Misión de Área (§5.12.3, §5.13.3).
- [x] electrónica del objetivo — **hecho (2026-10-05)**: Valor Electrónico de unidad técnica e instalación fija (§5.12.7-§5.12.8); el no guiado no la aplica.
- [x] penetración/supersónico — **hecho (2026-10-05)**: +2 de alta penetración supersónica en el ataque guiado (§5.12.4); el ARM y el no guiado no lo usan.
- [x] densidad/tamaño de fuerza — cubierto para Combate cercano terrestre (tabla de Derrota por Clase + Tamaño de Fuerza, 2026-09-28); pendiente para el resto de tareas de la fase.
- [x] explicación exacta de pérdidas — **hecho (2026-10-05)**: el umbral de Derrota del combate cercano con su cita y, para los ataques, el resultado sobre unidad, puerto o aeródromo con la regla citada en cada línea (wizard de Resultado del ataque terrestre). Queda la asignación en el combate cercano (ver la única casilla pendiente de arriba).

### Criterio de salida

Todas las rutas terrestres del mapa de tablas tienen una implementación funcional o un estado explícito `pendiente`.

**Fase 9 — corte vertical cerrado (2026-10-05), fase NO completa (AJ-004):** las rutas terrestres del mapa de tablas (combate cercano, ataque guiado, no guiado, antirradiación y la resolución del resultado) tienen wizard; la única casilla abierta, la asignación de bajas del combate cercano por Valor de Defensa Cercana, queda como pendiente explícito porque ningún registro de unidades del proyecto tiene ese dato. Sigue abierta la asignación de bajas del combate cercano (`blocked_by_source`), y los wizards guiado y no guiado conservan un hueco menor (modificador de intensidad por distancia sin derivar de la misión). Las reacciones terrestres son la Fase 10.

---

# Fase 10 — Ataques de reacción terrestres

**Objetivo:** integrar las reacciones con el flujo de subfases terrestres.

### Tareas

- [x] Guerra contrabatería (CF) — **hecho (2026-10-07)**: `#/wizard/ground-reaction` (`public/js/views/ground-reaction-wizard.js` + motor `public/js/ground-reaction-engine.js` + reglas en `data/rules/ground-reactions.json`, Decision Book §5.16.1): artillería sin CAS y con munición, una sola vez por enfrentamiento, o aire ON CALL (+1 de alcance) / baja altitud; consecuencias (munición «-1», la artillería pasa a ser objetivo de AS).
- [x] Interdicción de batalla (BAI) — **hecho (2026-10-07)** (§5.16.4 y §8.5.6): ajustes (sin terreno), decisiones posteriores de la unidad atacada (-1 de tamaño de fuerza si sigue moviéndose) y contraataque a baja altura si el atacante es aviación del ejército.
- [x] Persecución aérea (KB) — **hecho (2026-10-07)** (§5.16.3 y §8.7.8): fila «Persecución» (preseleccionada al abrir el ataque terrestre), sin terreno y sin contraataque a baja altura.
- [x] Ataque de contrafuegos (AS) — **hecho (2026-10-07)** (§5.16.2).
- [x] Detectar cuándo una acción vuelve a una unidad brevemente detectable — **cerrado por decisión del mantenedor (2026-10-10)**: que una unidad esté brevemente detectable lo determina el jugador, no la aplicación. El wizard recoge el hecho que el jugador declara (asignar CAS, disparar, quedar «Derrotada», moverse) y deduce la reacción; no hace falta modelar el mapa ni el estado de cada ficha. Ver known-ambiguities.
- [x] Ofrecer reacción solo a quien cumpla condiciones — **hecho (2026-10-07)**: cada unidad se evalúa (tipo, posición, CAS, munición, una contrabatería por enfrentamiento, un ataque dinámico por salida) y se descarta con su motivo.
- [x] Permitir declarar múltiples reacciones si la regla lo permite — **hecho (2026-10-07)**: varios atacantes y objetivos con el plan completo (objetivo y orden únicos) fijado antes del primer ataque; para otra reacción distinta se repite el wizard.
- [x] Cerrar el estado de brevemente detectable cuando finalicen las reacciones aplicables — **hecho (2026-10-07)**: confirmación por objetivo en el paso final, que consta en el resumen guardado.

### Criterio de salida

Las reacciones aparecen en contexto durante la secuencia de juego y no como un módulo aislado desconectado de la acción que las dispara.

**Estado (2026-10-07):** cumplido salvo la detección automática (casilla parcial: sin mapa no se puede detectar solo). El wizard se ofrece desde Inicio → «Resolver combate» y desde «Combate por tipo → Combate cercano terrestre»; pasa los ajustes de la reacción a los wizards de ataque terrestre y de resultado. Los dos supuestos (terreno en CF/AS y CAS como ataque dinámico) los confirmó el mantenedor el 2026-10-07.

---

# Fase 11 — Combate aéreo

**Objetivo:** resolver operaciones aire-aire.

### Tareas

- [x] Interceptación aérea — **hecho (2026-10-04)**: asignación de objetivos BVR y retirada previa en `#/wizard/air-intercept-targets` (`public/js/air-intercept-targets-engine.js`, Decision Book §7.16.1-§7.16.2: modo escolta electrónica o prioridad por detección/Valor Electrónico/bando que inició, renuncia, un oponente por avión, fin al emparejar el bando menos numeroso, excepciones A-D de retirada); iniciativa y tipo de combate BVR en `#/wizard/air-combat-bvr`; combate cercano en `#/wizard/air-combat-wvr`. Los tres wizards se enlazan entre sí y desde "Combate por tipo". Sigue siendo un duelo BVR por ejecución.
- [x] Combate BVR — **hecho (2026-10-04)**: wizard `#/wizard/air-combat-bvr` (`public/js/views/air-combat-bvr-wizard.js` + motor `public/js/air-combat-bvr-engine.js`) sobre `data/workflows/05_combate_aereo.json` + páginas 15-16 (Decision Book §7.16.2-§7.16.3): iniciativa (+1 AWACS) y DRM, tipo de combate con 1d10, ataque 1 contra 1 con la fila por misión + AWACS, modificador electrónico y daño por Protección (CAPs solo absorben 1). Un duelo por ejecución.
- [x] Combate WVR — **hecho (2026-10-04)**: wizard `#/wizard/air-combat-wvr` (`public/js/views/air-combat-wvr-wizard.js` + motor `public/js/air-combat-wvr-engine.js`) sobre la etapa `wvr` de `data/workflows/05_combate_aereo.json` (`roundRule`) + página 17 (Decision Book §7.16.4): fuerzas por bando, patrulla en red, CA sumado, fila por misión, tiradas simultáneas, absorción elegida por el jugador, salida de combate / derrota, rondas adicionales entre CAPs con +1 sin daño. 4 supuestos `needs_review` en `known-ambiguities.md`.
- [x] CAP y apoyos relevantes — **hecho (2026-10-04)**: la patrulla CAPs en red que se une al WVR (un grupo, mismo nodo, ≤ 4 hex; Decision Book §7.11 y §7.16.4 punto 1) está en `#/wizard/air-combat-wvr`, con su retraso a la 2.ª ronda por escolta electrónica enemiga; los CAPs dañados salen de combate y el grupo queda "Derrotado" (§7.16.4 punto 3). La distancia en hexágonos y el nodo los declara el jugador (no hay modelo de mapa).
- [x] AWACS cuando proceda — **hecho (2026-10-04)**: §7.11 (+1 al Valor de Iniciativa y fila "+AWACS" cuando el AWACS en red detecta al oponente real) está en `#/wizard/air-combat-bvr`; el AWACS como nodo de la patrulla en red, en el WVR. El rango de red lo declara el jugador.
- [~] retirada/regreso — **parcial (2026-10-04; actualizado 2026-10-08)**: el estado retirada/fuera de combate/eliminada pasa ahora de un asistente a otro por el grupo de misión compartido (el WVR carga las retiradas como salidas del BVR y guarda las que salen de combate). retirada antes del BVR calculada por unidad (§7.16.2); en el WVR cada unidad puede marcarse como retirada o fuera de combate desde el BVR y deja de participar; tras el BVR (§7.16.3 punto 5) y tras el WVR (§7.16.4 punto 4, por misión) se muestran las reglas de retirada. El duelo BVR no actualiza el grupo (las retiradas se marcan a mano en él) y no se ejecuta el Regreso en el mapa (§7.5.3).
- [~] absorción de impactos — **parcial (2026-10-04)**: en el WVR el jugador elige qué unidades absorben y el wizard calcula lo consumido, el remanente ignorado y avisa si aún debe absorber; la capacidad de daño de cada avión la marca el jugador.
- [~] escolta electrónica — **parcial (2026-10-04)**: en el combate aéreo está la elección de objetivos del bando con EEA (interceptación de combate aéreo y de penetración, §7.10.4 y §7.16.1) y el retraso de la patrulla en red enemiga a la 2.ª ronda del WVR. La prioridad de absorción del avión EW ante defensa aérea (§7.10.4, pp. 135-136) está en el "Disparo en Área" de los wizards de ataque a superficie desde el 2026-10-05; no se aplica al contraataque a baja altura del wizard ARM porque la fuente no lo extiende (ver `known-ambiguities.md`).

### Caso crítico: escolta EW

- [x] Modelar la composición del grupo de misión — **hecho (2026-10-08)**: grupo compartido de los dos bandos (`public/js/air-mission-group.js`, pantalla `#/wizard/air-mission-group`, guardado en el navegador) con unidades, valores y estado (en combate, retirada, fuera de combate, eliminada). Los asistentes de Asignación de objetivos BVR y de combate cercano WVR pueden cargarlo y guardar en él; el WVR devuelve las unidades que salieron de combate. El BVR no lo usa: es un duelo con valores por bando. Sin mapa: todo lo declara el jugador.
- [x] Aplicar prioridad de absorción de impactos por la unidad EW cuando la regla correspondiente lo exija — **hecho (2026-10-05)**: §7.10.4 (impactos de defensa aérea) con la secuencia de absorción de §6.3 en el paso compartido "Disparo en Área" de los wizards de ataque a superficie (`public/js/ew-escort-engine.js`: sin efecto si puntos < Protección EW; el EW absorbe primero y sufre 1 punto de daño; el remanente pasa a la siguiente unidad). No se aplica al contraataque a baja altura del wizard ARM porque la fuente no menciona allí la escolta (`known-ambiguities.md`).
- [x] Explicar el reparto de impactos antes de confirmar bajas/daño — **hecho (2026-10-08)** en el combate cercano WVR: al completar una ronda se muestra el reparto (impactos recibidos, quién absorbe cuántos, eliminadas, absorbidos y restantes) antes de continuar o ver el resultado; el duelo BVR ya muestra el daño por Protección en su resultado.

### Criterio de salida

Cada combate aéreo muestra participantes, modificadores, tiradas, impactos y retiradas de forma trazable.

---

# Fase 12 — Combate naval de superficie

**Objetivo:** completar ataques contra unidades de superficie.

### Tareas

- [x] Guiado — **hecho** (Fase 7): wizard `#/wizard/antiship-guided`.
- [x] No guiado — **hecho** (Fase 8, COR02-010): wizard `#/wizard/antiship-unguided`.
- [~] Artillería naval si se incluye en el alcance del producto — **parcial**: la resolución (tabla de la pág. 25 y asignación de daño, Decision Book §5.8) la hace el wizard `#/wizard/antiship-unguided` con el Valor de Ataque introducido a mano. **Pendiente:** el flujo propio del combate de cañones al final del combate naval (§5.8: ambos bandos suman a la vez su Valor de Artillería Naval, lo asignan por formación enemiga, Límite Máximo de Daño y bucle por formación) y el Valor de Artillería Naval por unidad (no está modelado).
- [x] Torpedos contra superficie — **hecho (2026-10-04)**: wizard `#/wizard/torpedo-surface` (`public/js/views/torpedo-surface-wizard.js` + motor puro `public/js/torpedo-attack-engine.js`) sobre `data/workflows/09_ataque_torpedos_superficie.json` + `data/tables/page-27.json`, siguiendo el Decision Book §9.13.1 paso a paso (fila de cabecera por estado/contexto ASW, velocidad ≤ 3, torpedo de círculo/hexágono con segundo dado). Calcula los Puntos de Impacto finales y explica su absorción; la asignación a buques concretos depende de la hoja de flota física y no está modelada.
- [x] daño crítico — **hecho (2026-10-04)**: verificación por daño crítico (§5.9.1) en el wizard `#/wizard/ship-impact-effects` (`public/js/views/ship-impact-effects-wizard.js` + motor `public/js/ship-impact-effects-engine.js` + reglas en `data/rules/ship-impact-effects.json`): buque único / doble / multi-buque, lado dañado, Escudo, Buque de Asalto Anfibio. **Integrado (2026-10-05)** en la asignación de impactos de los wizards antibuque guiado y no guiado con `resolveFleetShipHit` (mismo motor): un buque ya dañado (marcado en la flota o dañado en un impacto anterior) que sufre otro punto de daño es eliminado directamente, sin verificación crítica; antes se le volvía a pedir la tirada de hundimiento. Casco doble/multi, escudo, portaeronaves y transportes siguen en el wizard de efectos.
- [x] daño/hundimiento de portaaviones — **hecho (2026-10-04)**: consecuencias de §5.9.2 (no opera aeronaves si está dañado; pierde las de su ficha si se hunde; las desplegadas buscan otra base) en el mismo wizard.
- [x] daño/hundimiento de transportes — **hecho (2026-10-04)**: consecuencia de §5.9.3 (eliminar tropas/suministros equivalentes a la capacidad perdida) en el mismo wizard; la regla 10.4 de pérdidas de transporte no está modelada.
- [x] contraataque a baja altura — **hecho** (Fase 8): `combat-wizard-engine.js#resolveLowAltitudeCounterattackShot` (Decision Book §6.6) y reacción de la flota superviviente en el wizard no guiado.

### Criterio de salida

La familia `objetivo = superficie` queda cubierta desde la selección del plan de ataque hasta el daño final.

---

# Fase 13 — Guerra antisubmarina y combate submarino

**Objetivo:** cubrir búsquedas y ataques ASW/submarinos.

### Tareas

- [x] Búsqueda por diferencia de firma — **hecho (2026-10-05)**: wizard `#/wizard/asw-signature-search` (`public/js/views/asw-signature-search-wizard.js` + motor `public/js/asw-signature-search-engine.js`) sobre la etapa `signature_search` de `data/workflows/13_busqueda_asw_apoyo.json` + `data/tables/page-33.json` (Decision Book §9.14.2, §9.15.1, §9.15.3): columna por Firma del submarino buscador o por marco del Valor ASW + profundidad, Firma del objetivo (+1 En Movimiento) buscada en esa columna, rango de descubrimiento HEX/ADYAC según lo que activó la búsqueda y 1d10. **Los 3 iconos de la página 33 son las formas del marco del Valor ASW (§9.15.1)**; el wizard los muestra como recorte y pide la forma que ve el jugador en su ficha. Sigue abierto qué clase de buque lleva cada marco (`known-ambiguities.md`).
- [x] Búsqueda aérea ASW — **hecho (2026-10-04)**: wizard `#/wizard/asw-air-search` (`public/js/views/asw-air-search-wizard.js` + motor `public/js/asw-air-search-engine.js`) sobre `data/workflows/13_busqueda_asw_apoyo.json` + `data/tables/page-34.json`, siguiendo el Decision Book §9.15.4: suma de Valores de Detección Aérea con sus exclusiones, tabla según el evento, Firma por profundidad (+1 En Movimiento) y rango de descubrimiento con 1d10. Una discrepancia sobre la Emboscada y Alta Velocidad queda en Pendientes.
- [x] Búsqueda desde superficie — **hecho (2026-10-05)**: es la rama «unidad de superficie» del mismo wizard (marco del Valor ASW + profundidad del objetivo, Alta Velocidad sin Rutina, alcance adyacente solo en aguas profundas y con marco abierto). La selección de las 3 unidades que buscan tras un ataque (§9.15.3 Paso 1) se muestra como regla, sin automatizarla.
- [x] Ataque ASW desde aeronave — **hecho (2026-10-04)**: wizard `#/wizard/asw-surface-air` (`public/js/views/asw-surface-air-wizard.js` + motor `public/js/asw-attack-engine.js`), con la restricción de zona de patrulla aérea enemiga.
- [x] Ataque ASW desde superficie — **hecho (2026-10-04)**: mismo wizard, con las condiciones de alcance a hex adyacente (Decision Book §9.17.1), banda de la cabecera por profundidad + Firma (+1 si "En Movimiento") y comprobación de hundimiento por Protección.
- [x] Ataque submarino contra submarino — **hecho (2026-10-04)**: wizard `#/wizard/asw-submarine` (`public/js/views/asw-submarine-wizard.js` + `AswAttackEngine.resolveSubmarineAswAttack`). Desbloqueado por la confirmación del mantenedor: la fila depende de la profundidad (la cabecera "Firma del atacante 5+/4/0~3" de la página 30 es P.4/P.3/P.2-1); ver `docs/rules/known-ambiguities.md`.
- [x] Torpedos submarino-superficie — **hecho (2026-10-04)** (wizard `#/wizard/torpedo-surface`, ver Fase 12).
- [x] Emboscadas y estados oculto/expuesto cuando procedan — **hecho (2026-10-08)**: wizard `#/wizard/submarine-ambush` (`public/js/views/submarine-ambush-wizard.js` + motor `public/js/submarine-ambush-engine.js` + `data/rules/submarine-ambush.json`), según Decision Book §9.16 (págs. 219-220): solo un submarino Oculto, una Emboscada por Fase de Acciones de Superficie, Zona de Emboscada de 0 casillas (convencional) o 1 (nuclear), suceso que la dispara y secuencia de resolución con enlaces a los wizards de Búsqueda ASW y Torpedos. El mapa no está modelado: el jugador declara la posición y el suceso. El seguimiento del estado Oculto/Expuesto de cada ficha no se modela (queda como dato que declara el jugador).

### Golden test sugerido

Usar el escenario de entrenamiento `A la caza del Liaoning` para validar que el producto permite practicar las formas principales de detección y combate antisubmarino descritas por el escenario.

### Criterio de salida

El flujo de búsqueda → exposición → ataque puede recorrerse completo para cada plataforma soportada.

---

# Fase 14 — Estrategia, logística y reglas opcionales

**Objetivo:** ampliar la app más allá del núcleo de combate.

### Tareas

- [x] Reabastecimiento de Campo del Ejército — **hecho (2026-10-05)**: wizard `#/wizard/army-resupply` (`public/js/views/army-resupply-wizard.js` + motor `public/js/army-resupply-engine.js` + reglas en `data/rules/army-resupply.json`) sobre la tabla `army-logistics-resupply` de la página 32 y el Decision Book §8.11.3: condiciones (No Actuada, Línea de Suministro sin cortar, sin unidad principal enemiga en el hexágono), 1d10 por Nivel de Iniciativa A-D, +1 de fuerza hasta el límite impreso y paso a "Acción Realizada". Cierra la hoja `Estratégico > Logística` del mapa de tablas (antes sin workflow). La Línea de Suministro y el capítulo 11 no están modelados: los declara el jugador.
- [x] Fase logística — **hecho (2026-10-08)**: la Fase Logística de la Fase 0 incluye ahora la verificación de garantía (11.4, con atajo al wizard), la marca «Falta de Suministros», el desgaste de los Nodos de Suministro Ordinarios al final de la fase (11.2.2, calculado en `#/wizard/port-logistics`) y el paso a No Actuadas; la reparación de buques (9.9.4) y el reabastecimiento de munición tienen su atajo en la misma fase.
- [x] Reabastecimiento de munición — **hecho (2026-10-08)** en el wizard `#/wizard/port-logistics` (`public/js/views/port-logistics-wizard.js` + motor `public/js/port-logistics-engine.js` + `data/rules/port-logistics.json`), Decision Book §9.9.4, §9.9.5 y §11.6. Límite por el valor del puerto y área de espera; agotamiento de munición (§11.6.2).
- [x] efectos de falta de soporte logístico — **hecho (2026-10-05)**: wizard `#/wizard/logistics-guarantee` (`public/js/views/logistics-guarantee-wizard.js` + motor `public/js/logistics-guarantee-engine.js` + reglas en `data/rules/logistics-guarantee.json`) sobre el Decision Book §11.2-§11.5: Nodo de Suministro (Avanzado / Ordinario nivel ≥ 1) y Línea de Comunicación (bordes con Restricción de Movimiento, unidades o control enemigo, Contención Táctica), exención del aeródromo de portaaviones / buque de asalto anfibio y las consecuencias de perder la garantía para unidad terrestre principal, técnica, aeródromo y puerto. El mapa no está modelado: el jugador declara la línea. Enlazado desde el wizard de Reabastecimiento de Campo.
- [x] guerra ciberespacial/ultraterrestre si se incluye — **hecho (2026-10-08)**: ciberataque (§14.2-§14.4) en `#/wizard/cyber-attack` y guerra espacial (§14.5-§14.9: orden de acciones, apoyo, destrucción dura/blanda/orbital con Maniobra Orbital, garantía y escombros) en `#/wizard/space-war` (`public/js/views/space-war-wizard.js` + `public/js/strategic-actions-engine.js` + `data/rules/space-war.json`), ambos reglas opcionales. Los d10 se clasifican con la tabla de la pág. 32 de Tablas-de-combate 5.pdf (`data/tables/page-32.json`). Quedan como texto informativo, sin cálculo, el Apoyo Espacial y la Garantía Espacial; la suma de la Tormenta de Escombros por encima de 9 es `needs_review`.
- [x] reparación — **hecho (2026-10-08)** en el wizard `#/wizard/port-logistics` (`public/js/views/port-logistics-wizard.js` + motor `public/js/port-logistics-engine.js` + `data/rules/port-logistics.json`), Decision Book §9.9.4, §9.9.5 y §11.6. Reparación de buques opcional (1d10 menor que REP, DOCK, un intento por fase) y reparaciones de emergencia (RR). Los valores del puerto los lee el jugador de su ficha: no hay puertos transcritos.
- [x] reglas de expansión/opcionales con toggle de configuración — **hecho (2026-10-08)**: pantalla `#/perfil-reglas` (`public/js/views/rule-profile.js`, textos en `data/rules/rule-profile.json`), perfil guardado en el navegador (`AppStorage.loadRuleProfile`) e interpretado por `RuleProfileEngine`. Por defecto reglas básicas; la reparación de buques (9.9.4, opcional) solo se ofrece con las reglas opcionales activadas.
- [x] etiquetar visualmente reglas básicas vs. expansión — **hecho (2026-10-08)** para lo ya marcado en los datos: «Solo expansión» en fichas y hotspots, «regla opcional» en la ayuda de reglas (con «desactivada en tu perfil» cuando no está activa) y operaciones ocultas en el wizard de puerto. Los datos nuevos deben llevar `expansionOnly`/`optionalRule`.

### Criterio de salida

Una sesión puede configurarse con un perfil de reglas y la aplicación solo pregunta/aplica las opciones activadas.

---

# Fase 16 — Empaquetado y despliegue web

**Objetivo:** garantizar que la aplicación pueda ejecutarse y alojarse de forma reproducible en un servidor.

**⚠️ Auditada el 2026-09-27** (misma reconciliación que Fases 0-7, ahora extendida a 8-18 a petición del mantenedor): 5 de las 7 tareas ya estaban hechas o eran fáciles de cerrar del todo sin inventar nada; el checklist nunca se había marcado. Quedan genuinamente pendientes solo 2: verificar en un entorno limpio de verdad (necesita una máquina/contenedor aparte, no algo que se pueda hacer dentro de esta sesión) y nada más.

### Tareas

- [x] Definir scripts Node.js de `start`, desarrollo y test — `package.json` (`start`/`dev`/`test`), ya en uso durante toda la sesión.
- [x] Servir HTML, JavaScript, CSS, imágenes y archivos de datos mediante el servidor Node.js — `server/server.js`, sin dependencias externas, en producción desde el principio del proyecto.
- [x] Configurar variables de entorno solo para configuración de despliegue — `PORT` (`process.env.PORT || 3000`); los datos fijos siguen en `data/`.
- [x] Verificar ejecución en un entorno limpio a partir de una instalación de Node.js soportada — **hecho (2026-10-08)**: el CI de GitHub (`.github/workflows/ci.yml`) hace `npm ci`, `npm test` y las pruebas E2E en una máquina Linux limpia con Node 18 (datos y motores) y Node 22 (también E2E); verde en la ejecución de `faf97d0`.
- [x] Documentar instalación, arranque, actualización y despliegue en servidor — **hecho (2026-09-27)**: `README.md` ya cubría instalación/arranque/tests; se añadieron las secciones "Actualización" (`git pull` + `npm test` + reiniciar el proceso) y "Despliegue en servidor" (gestor de procesos, `PORT`, proxy inverso, sin estado de servidor que migrar — el progreso de sesión vive en `localStorage` del navegador).
- [x] Comprobar rutas y carga de datos cuando la aplicación se sirve por HTTP, no únicamente en desarrollo local — no existe un "modo desarrollo" distinto: `npm start`/`npm run dev` arrancan el mismo servidor HTTP real que serviría en producción, ya verificado exhaustivamente en el navegador durante toda la sesión.
- [x] Añadir prueba de humo del servidor y de la página inicial — **hecho (2026-09-27)**: `test/server-smoke.test.js` (4 tests) arranca `server/server.js` en un puerto efímero y comprueba página inicial (200 + `<title>`), datos JSON servidos bajo `/data/`, enrutado por hash de cliente (ruta desconocida sirve `index.html`, no 404) y un archivo JS de `public/`. Requirió un pequeño refactor no invasivo en `server/server.js` (guardar `server.listen(...)` tras `if (require.main === module)` y exportar el servidor) para poder importarlo desde un test sin que arranque a escuchar en el puerto real de desarrollo — verificado que `npm start` sigue arrancando exactamente igual tras el cambio.

### Criterio de salida

Un servidor limpio puede obtener el repositorio, instalar dependencias, arrancar la aplicación con Node.js y acceder a ella desde un navegador; las tablas y modificadores se cargan desde sus archivos de texto sin base de datos. — **Verificado en este entorno de desarrollo** (sin dependencias que instalar, arranque y acceso confirmados repetidamente); la verificación en una máquina completamente limpia queda pendiente, ver tarea de arriba.

---

# Fase 17 — Calidad, accesibilidad y UX avanzada

**Objetivo:** convertir el prototipo funcional en una herramienta de mesa rápida.

**🎉 Cerrada (2026-09-27), salvo 1 tarea condicional.** Varias tareas ya se cumplían como consecuencia de aplicar AGENTS.md §4 desde el principio del proyecto (tablet horizontal es el objetivo de diseño por defecto), aunque el checklist nunca lo reflejó; a esas se añadieron 6 tareas concretas construidas en esta sesión (historial de resoluciones, repetir, copiar/compartir resumen, navegación por teclado, responsive de móvil, favoritos/recientes). Solo queda "modo oscuro opcional" — condicional en el propio roadmap ("si forma parte del producto"): la app ya usa un tema oscuro fijo, no hay tema claro que alternar, así que no hay una decisión de datos que tomar sin que el mantenedor decida primero si quiere además un tema claro.

### Tareas

- [x] Diseñar y optimizar la interfaz prioritariamente para **tablet en modo horizontal (landscape)** — AGENTS.md §4 lo exige desde el principio; cada incremento de esta sesión (y de las anteriores) se ha verificado explícitamente a 1024×768 sin scroll horizontal antes de darse por terminado.
- [ ] **Aplazado hasta publicar la primera versión completa (decisión del mantenedor, 2026-10-10)** — Validar navegación, formularios, tablas, diálogos y flujos completos mediante interacción táctil — parcial: verificado repetidamente con clics simulados a resolución de tablet, pero no con un dispositivo táctil real (hover/precisión de puntero no se pueden descartar del todo con automatización de ratón).
- [x] Evitar dependencias de `hover` y dimensionar los controles para uso táctil cómodo — confirmado en Fase 3.5: zoom de iconos y tooltips de counters usan hover como mejora progresiva con toque como alternativa siempre disponible (AGENTS.md §4).
- [x] Aprovechar el ancho de landscape para mantener visibles contexto, opciones y resultados, minimizando el scroll horizontal en tablas — verificado sistemáticamente (scrollWidth === clientWidth a 1024×768) en cada pantalla nueva de toda la sesión.
- [x] Mantener diseño responsive para escritorio y móvil como objetivos secundarios, sin degradar la experiencia principal en tablet horizontal — **hecho (2026-09-27)**: auditadas ~28 rutas a 375×812 (móvil), incluidas las más exigentes (tablas con 20+ columnas, recortes de fichas/munición, wizard, plantilla de fuerzas, historial). Encontrados y corregidos 2 desbordamientos horizontales reales — no solo enmascarados: `.counter-factor` (reutilizada por `renderExcerptCard` para párrafos largos, además de su uso original de par corto label/posición) es un contenedor flex cuyos hijos `<p>` no se encogían por debajo del ancho de su contenido (bug clásico de flexbox); corregido con `min-width: 0` + una línea propia por párrafo, sin tocar el layout original de la leyenda de counters. Añadida además una red de seguridad (`overflow-x: hidden` en `html, body`) para que el fondo decorativo (`.bg-logo`, intencionadamente más ancho que el viewport para el paralaje) nunca produzca scroll horizontal de página. Tablet horizontal (1024×768) reverificado sin cambios tras el arreglo.
- [ ] **Aplazado hasta publicar la primera versión completa y recoger opiniones de usuarios (decisión del mantenedor, 2026-10-10)** — Modo oscuro si forma parte del producto — la app ya usa un tema oscuro fijo (no hay tema claro que alternar); "si forma parte del producto" es ambiguo aquí, se deja sin marcar en vez de decidir por el mantenedor si se quiere además un tema claro opcional.
- [x] Navegación por teclado — **hecho (2026-09-27)**: auditado con `Tab`/`Enter`/`Escape` en el navegador. El orden de tabulación ya era correcto por construcción (todo control es un `<button>`/`<select>`/`<input>` real, nunca un `<div>` con `onclick`), pero faltaban 2 piezas: (1) foco visible consistente — añadido `:focus-visible` con anillo (`outline`, color `--accent`) a `.btn` (y por tanto a `.wizard-option`, que hereda de él), `.table-viewer__select`, `.source-page-gallery__item` e `.icon-btn`, que antes dependían del estilo por defecto del navegador; (2) gestión de foco entre rutas — el router ahora mueve el foco a `#view-root` (`tabindex="-1"`) después de cada navegación, así un usuario de teclado no tiene que recorrer otra vez todo el encabezado para llegar al contenido nuevo (antes el foco quedaba perdido en `<body>`). También se añadió `Escape` para cerrar el panel de ayuda flotante (la imagen a pantalla completa ya lo tenía desde antes). **Ampliado (2026-09-27, COR-008/Fase 19):** el panel de ayuda flotante ahora además cumple el patrón de diálogo modal accesible completo (rol/nombre, foco confinado con `Tab`/`Shift+Tab`, contenido de fondo `inert`, foco devuelto al cerrar) — ver `correcciones.md#COR-008`.
- [x] Contraste suficiente en resaltados de tablas — corregido explícitamente en Fase 3.5 (especificidad CSS de `.help-card--highlight` sobre `.router-trail__item`, verificado con `getComputedStyle`); el resaltado de fila/columna/celda del visor de tablas reutiliza el mismo sistema de color.
- [x] Historial de resoluciones — **hecho (2026-09-27)**: nuevo `#/historial`, alimentado por un botón explícito "💾 Guardar en historial" en el paso Resultado del wizard (guarda resumen + snapshot completo del estado en `localStorage`, distinto de `tcw-nav-history` que solo registra navegación de fases/subfases).
- [x] Duplicar/repetir una resolución anterior — **hecho (2026-09-27)**: botón "↻ Repetir" en `#/historial` recarga el snapshot guardado en el estado del wizard y salta directamente al paso Resultado, reproduciendo el mismo cálculo sin volver a introducir ningún dato.
- [x] Compartir/copiar resumen textual de un combate — **hecho (2026-09-27)**: botón "📋 Copiar resumen" tanto en el paso Resultado del wizard como en cada entrada de `#/historial` (`navigator.clipboard.writeText` con fallback a `execCommand('copy')`, nunca lanza — muestra "No se pudo copiar" en vez de romper la interacción si ninguno de los dos funciona).
- [x] Búsqueda global — `#/ayuda/buscar` (Fase 3, ya cerrada): indexa tablas, tipos de combate, fichas/counters, unidades/munición y detección en un solo buscador.
- [x] Favoritos/ayudas recientes si aporta valor — **hecho (2026-09-27)**: en `#/ayuda`, cada una de las 7 categorías tiene un botón "☆ Añadir a favoritos"/"★ Quitar de favoritos"; los favoritos aparecen en una sección "⭐ Favoritos" propia arriba de todo. Las categorías visitadas (incluidas sus sub-páginas, p.ej. una unidad concreta de munición) se registran automáticamente al navegar y aparecen en "🕐 Recientes" (las 4 más recientes, sin duplicar las que ya están en Favoritos). Ambas listas viven en `localStorage`, igual que la plantilla de fuerzas y el historial de resoluciones.

### Criterio de salida

La aplicación puede completar sus flujos principales cómodamente en una tablet en orientación horizontal mediante controles táctiles, sin depender de hover ni de precisión de ratón, y las tablas principales son legibles sin desplazamiento horizontal evitable. — **Sustancialmente cumplido** para lo ya construido (verificado en cada incremento de esta sesión), aunque no se ha probado en un dispositivo táctil físico.

La app puede utilizarse durante una partida sin ralentizar la mesa y sin depender de consultar constantemente el PDF original. — Cierto para los flujos ya construidos (Fases 3-7); no evaluable todavía para los dominios de combate sin wizard (Fases 8-13).

---

# Fase 18 — Verificación integral

**Objetivo:** validar que la app reproduce correctamente las fuentes.

**⚠️ Auditada el 2026-09-27.** Como en Fase 8, varias tareas ya están genuinamente bien cubiertas (aunque repartidas entre `test/data.test.js` y los tests de cada motor, no como una tarea aislada "Fase 18"); otras son honestamente parciales o siguen sin empezar. `npm test` → **178/178 OK** en el momento de esta auditoría. **Los 2 tests E2E se cerraron el mismo día, ver más abajo — quedan 6/9 tareas.**

### Tareas

- [x] Test unitario de todas las tablas implementadas — **hecho (2026-10-08)**: `test/table-cells-roundtrip.test.js` recorre las 33 páginas y comprueba, para las más de 6.300 celdas con ejes numéricos (cada esquema de etiquetas), que el valor representativo de su fila y su columna devuelve exactamente esa celda; detecta ejes solapados, etiquetas ilegibles y filas desalineadas. Las celdas con ejes no numéricos o placeholders siguen cubiertas por `data.test.js` y los tests de cada wizard.
- [x] Tests de límites y rangos — `table-engine.test.js` (`row_out_of_range`/`column_out_of_range`/límite abierto `+`/rango `~`), genérico para cualquier tabla.
- [x] Tests de cada modificador — **hecho (revisado 2026-10-08; corrige la nota anterior de este mismo día)**: `test/modifiers-exhaustive.test.js` ya genera una prueba por cada modificador numérico declarado en los 13 workflows (más de 80: valor, destino, traza y suma) y comprueba que cada destino lo consume el código o consta como excepción documentada (`search_roll`, firma de la pág. 28); los modificadores de reacciones terrestres y del resto de motores tienen sus pruebas en los tests de cada motor. No hacía falta una matriz nueva.
- [x] Golden tests de hojas de ayuda — `test/golden-antiship-guided.test.js`, la única hoja de ayuda con ejemplo numérico completo disponible en las fuentes (roadmap Fase 0 ya inventarió que es la única).
- [x] Casos de reglas básicas y expandidas — **hecho (2026-10-08)**: `test/rule-profile-engine.test.js` verifica que todo elemento marcado (`expansionOnly`/`optionalRule`) se excluye del perfil básico y aparece con todo activado, que la reparación de buques es la única operación opcional del wizard de puerto, y que las marcas solo existen en archivos conocidos; `test/e2e/rule-profile.spec.js` cubre la pantalla.
- [x] Revisión manual de transcripciones — hecha extensamente para las páginas `needsReview` (Fase 0/18 ya cerrada esa pasada) y para cada hoja de armamento calibrada (Fase 3.5); no hay garantía de que sea "el 100%" de cada transcripción palabra por palabra, pero la cobertura es alta y documentada caso a caso en `known-ambiguities.md`.
- [x] Auditoría de referencias a fuente — `data.test.js` exige `sourceRefs` en tablas, workflows, fases/subfases del turno, y varios tests dedicados de integridad (IDs únicos, referencias cruzadas resueltas).
- [x] Test de recorrido completo del motor de progreso del turno de dos días — `test/turn-progress-engine.test.js` (2026-09-27; **renombrado de "Test E2E" el mismo día que se resolvió COR-004**, ver nota de abajo: recorre el MOTOR puro, no la interfaz desplegada). La lógica de transición de estado del turno guiado (antes solo dentro del cierre de `app.js`) se extrajo a `public/js/turn-progress-engine.js`, un módulo puro sin `localStorage`/DOM, para poder recorrer `data/phases/turn-template.json` de principio a fin en un test de Node. Dos tests: recorrido completo de los 2 procesos (terminando cada subfase y luego cada fase, verificando que `isSequenceComplete` es `false` hasta el último paso y `true` solo al final) y un segundo recorrido que salta la única fase opcional del Proceso Estratégico en vez de terminarla, confirmando que `isProcessComplete` igual se satisface.
- [x] Test de cierre de fase con subfases pendientes (motor puro) — `test/turn-progress-engine.test.js` (**renombrado de "Test E2E" el mismo día que se resolvió COR-004**, mismo motivo que arriba). Documenta que `finishPhase` en sí no bloquea (es responsabilidad de la capa de presentación, ver `evaluatePhaseCompletion`/COR-002) y confirma que, pese a eso, `isProcessComplete`/`isSequenceComplete` siguen detectando correctamente la incompletitud.
- [x] **Pruebas E2E reales de navegador — `test/e2e/` (2026-09-27, resuelve COR-004).** Los dos tests de arriba nunca fueron E2E de verdad (ejercitan el motor puro con el runner nativo de Node, no un navegador); ahora sí existe una suite real con Playwright (`npm run test:e2e`, documentada en `README.md`) que arranca Chromium contra el servidor real y cubre los 5 casos obligatorios de `correcciones.md#COR-004`: turno completo con Campaña 1/2 diferenciadas, golden test del wizard desde sus controles visibles, guardar/recargar/repetir desde el historial, apertura/cierre del panel de ayuda solo con teclado, y navegación rápida entre rutas. Ver `correcciones.md#COR-004` para el detalle, incluido un hallazgo real (no de esta tarea, sino del propio código): una carrera de renderizados asíncronos reproducida de forma intermitente, ya documentada como parte de COR-005.

### Criterio de salida

No existe ningún cálculo implementado sin fuente, explicación y cobertura de test.

---

# Fase 19 — Backlog de correcciones técnicas (`correcciones.md`)

**Objetivo:** cerrar los defectos y riesgos técnicos registrados en `correcciones.md` (revisión integral del 2026-09-27), sin mezclarlos con nuevas reglas de negocio ni con el resto del roadmap de dominios de combate (Fases 8-14).

Cada tarea remite a su ficha completa en `correcciones.md` (clasificación, evidencia, causa técnica, diseño de la corrección, criterios de aceptación y pruebas requeridas); este roadmap solo hace seguimiento de alto nivel del progreso, para no duplicar el mismo contenido en dos sitios.

### Tareas (orden recomendado, `correcciones.md` §4)

- [x] **COR-003** (S2) — Denegación de servicio: una URL con codificación inválida (`decodeURIComponent(url.pathname)` sin capturar `URIError`) tumba el proceso Node.js de `server/server.js`. **Resuelta (2026-09-27):** nueva `parseRequestPath` aísla `URL`/`decodeURIComponent` en `try/catch` y responde `400` sin traza interna; ver `correcciones.md#COR-003`.
- [x] **COR-001** (S2) — El progreso del turno guiado no distingue las dos instancias del Proceso de Campaña: `finishedPhases`/`finishedSubphases`/`skippedPhases` usan el ID de fase/subfase como identidad, igual en Campaña 1 y 2. **Resuelta (2026-09-27):** esquema v2 con `processRuns` por `runKey` (`processId:occurrence`), migración conservadora del esquema anterior y rutas `#/turno/<processId>/<occurrence>/...`; ver `correcciones.md#COR-001`.
- [x] **COR-002** (S2) — `Terminar fase` (`finishPhase`) no comprueba subfases pendientes ni una resolución activa antes de cerrar la fase; usa el nuevo esquema de progreso de COR-001. **Resuelta (2026-09-27):** nueva `evaluatePhaseCompletion` (motor puro) + confirmación específica de cierre anticipado en la UI, que nombra las subfases pendientes y lo registra en el historial; ver `correcciones.md#COR-002`.
- [x] **COR-006** (S3) — Reconciliar el resumen vigente de `roadmap.md`/`development_status.md`: Fase 2 figura cerrada pese a que COR-001/COR-002 documentan que su criterio de salida no se cumple todavía del todo. **Resuelta (2026-09-27):** con COR-001/COR-002 ya corregidas el mismo día, se añadió una nota de reconciliación a Fase 2 (sin reescribir la nota histórica "CERRADA 7/7") citando los tests que prueban ambas; ver `correcciones.md#COR-006`.
- [x] **COR-004** (S3) — La suite no contiene pruebas E2E reales de navegador (los tests llamados "E2E" en Fase 18 recorren el motor puro, no la interfaz desplegada). **Resuelta (2026-09-27):** nueva suite Playwright en `test/e2e/` (`npm run test:e2e`), 6 tests cubriendo los 5 casos obligatorios; ver `correcciones.md#COR-004`. Descubrió de paso una carrera real de renderizados asíncronos (documentada abajo, en COR-005) — no se corrige aquí, solo se detecta y se documenta, tal como pedía esta incidencia.
- [x] **COR-008** (S3) — El panel de ayuda (`openHelpPanel`/`closeHelpPanel`) no implementa el patrón accesible de diálogo modal: falta `role="dialog"`/`aria-modal`, gestión de foco al abrir/cerrar y confinamiento de `Tab`. **Resuelta (2026-09-27):** `role`/`aria-modal`/`aria-labelledby`, foco al abrir/cerrar, contenido de fondo `inert` (nuevo `#app-content`) y envoltura de Tab/Shift+Tab; ver `correcciones.md#COR-008`.
- [x] **COR-005** (S3) — `public/js/app.js` (~3.800 líneas) concentra carga de datos, `localStorage`, routing, vistas y accesibilidad; extraer de forma incremental (`storage.js`, `router.js`, `views/*.js`) respaldado por la cobertura de COR-004. **Hallazgo confirmado (2026-09-27, al construir la suite E2E de COR-004):** varias vistas `async` de `app.js` (p.ej. `renderCombateIndex`) limpian `viewRoot` y reconstruyen su contenido con un `await` de por medio (típicamente un `fetch` cacheado) sin comprobar si, mientras tanto, ya se navegó a otra ruta — encadenar navegaciones rápidas reprodujo, de forma intermitente, una vista más antigua sobrescribiendo a una más reciente. **Resuelta (2026-09-28):** pasos 1-3 (2026-09-27) — `public/js/storage.js` (persistencia), `public/js/router.js` (ciclo de navegación + `Router.currentToken()`/`isCurrent()`), mecanismo anti-carreras aplicado a las 23 vistas asíncronas vulnerables (la repro de arriba ya no reproduce, confirmado con un test dedicado repetido 80 veces). Pasos 4-5 (2026-09-28) — `public/js/core.js` (DOM/persistencia/cargadores/widgets compartidos) y 5 archivos `public/js/views/*.js` (turno, plantilla de fuerzas, historial, ayuda rápida, wizard de ataque guiado); `app.js` queda en 216 líneas (inicialización y composición). Ver `correcciones.md#COR-005`.
- [x] **COR-007** (S3) — El wizard de ataque guiado permite construir ataques sin seleccionar una unidad/plan real transcritos: tipo, valor/carga y alcance se introducen a mano en vez de derivarse de `data/ammunition/`. **Resuelta (2026-09-28):** nuevo modo "Seleccionar unidad y plan" (país→unidad→plan→carga/estado→distancia), con método/Valor de Ataque/alcance derivados de `data/ammunition/` y validados contra el alcance; el modo manual se conserva, etiquetado explícitamente. Verificado que reproduce el golden test exacto seleccionando F-2A/B + Plan B; ver `correcciones.md#COR-007`.

### Restricciones

- No cerrar una incidencia en `roadmap.md` sin haber actualizado también su estado, criterios de aceptación y commit en `correcciones.md`.
- No mezclar esta fase con nuevas reglas de dominio de combate no relacionadas (Fases 8-14 siguen siendo el frente de contenido de juego, no de correcciones de ingeniería).
- Respetar el orden recomendado salvo que una dependencia real obligue a alterarlo (p.ej. COR-002 necesita el esquema de progreso que introduce COR-001).

### Criterio de salida

Las 8 incidencias de `correcciones.md` quedan en estado `resuelta` o `descartada` (con justificación explícita), sin ninguna en `pendiente` sin motivo documentado.

**Cumplido (2026-09-28):** las 8 incidencias (COR-001 a COR-008) están en estado `resuelta`. Fase 19 queda cerrada.

---

# Fase 20 — Backlog de correcciones técnicas 02 (`correcciones.02.md`)

**Objetivo:** cerrar las incidencias de la segunda revisión de ingeniería (`correcciones.02.md`, 2026-09-28, auditoría independiente sobre el commit `af909a4` tras cerrar COR-001 a COR-008), siguiendo su propio "§6. Orden recomendado de ejecución".

Cada tarea remite a su ficha completa en `correcciones.02.md`; este roadmap solo hace seguimiento de alto nivel del progreso, mismo criterio que Fase 19.

### Tareas (orden recomendado, `correcciones.02.md` §6)

**Bloque 1 — Integridad del estado**

- [x] **COR02-001** (Alta) — Cambiar de banda de día borraba en silencio todo el progreso de fases/subfases, sin confirmación ni historial. **Resuelta (2026-09-28):** a petición explícita del mantenedor, nuevo esquema v3 (`bandRuns[bandIndex].processRuns[runKey]`, `public/js/turn-progress-engine.js`) — cada banda guarda su propio progreso; cambiar de banda ya no destruye nada y volver a una banda ya visitada lo recupera intacto; ver `correcciones.02.md#COR02-001`.
- [x] **COR02-002** (Alta) — El turno guiado era un checklist navegable, no una máquina de estados: se podía terminar/omitir cualquier fase sin respetar el orden. **Resuelta (2026-09-28), adelantada sobre COR02-003** (ver más abajo el motivo): nuevas `getCurrentPhaseId`/`getPhaseSequenceState`/`evaluatePhaseSequencing` (`turn-progress-engine.js`) modelan la fase "actual" y los 5 estados pedidos; `views/turn.js` exige una confirmación distinta y registra en el historial cualquier mutación fuera de secuencia, sin bloquear la consulta de fases futuras; ver `correcciones.02.md#COR02-002`. **⚠️ Revocada por decisión de producto posterior (2026-09-28) y corregida por COR03-001 (`correcciones03.md`, resuelta el mismo día):** esta descripción es un registro histórico de lo que se implementó entonces, no del comportamiento actual — `evaluatePhaseSequencing` se eliminó, `getPhaseSequenceState` ya no tiene un estado `current`, y `views/turn.js` ya no exige ninguna confirmación por actuar "fuera de secuencia". El turno guiado es de uso libre y no prescriptivo (AGENTS.md §3.1/§6); ver `correcciones03.md#COR03-001` para el estado vigente.
- [x] **COR02-003** (Alta) — Modelar resoluciones pendientes en el cierre de fase. **Resuelta (2026-09-28)**, ya con el contexto de "fase actual" de COR02-002 disponible: nuevo `lastTurnContext` (`core.js`) mantenido por `app.js#routeDispatch` a lo largo de la cadena fase → Ayuda contextual → Combate por tipo → wizard; cada wizard se vincula a su fase de origen (`linkToTurnContextIfNeeded`) y `evaluatePhaseCompletion` ya no devuelve `pendingResolutions` siempre vacío. La fase muestra la resolución activa con acceso directo para retomarla o cancelarla; ver `correcciones.02.md#COR02-003`.

**Bloque 2 — Corrección del vertical slice**

- [x] **COR02-004** (Alta) — Derivar todas las propiedades conocidas del plan en el modo validado del wizard. **Resuelta con alcance reducido (2026-09-28):** tras excluir COR02-005 los planes Balístico/Espacio Cercano del modo validado, `near_space_trajectory` y la alerta temprana automática por BM ya no pueden plantearse ahí — el alcance real quedó en `munition_marked_cm_or_bm` (siempre derivable del plan) y `short_range_restriction` (derivable salvo con distancia exactamente 2 hex., el único caso ambiguo, donde se pregunta solo "¿Es Misión de Área?" en vez del dato ya conocido); ver `correcciones.02.md#COR02-004`.
- [x] **COR02-005** (Alta) — Se ofrecían como resolubles los planes balístico y de espacio cercano aunque su flujo de daño está incompleto (falta la marca de Escudo del buque objetivo, sin transcribir). **Resuelta (2026-09-28):** a petición explícita del mantenedor, se excluyen esos planes del conjunto «resoluble» en vez de completar ahora el modelo de Escudo — `buildAntishipPlanOptions` (`combat-wizard-engine.js`) marca cada opción con `resoluble`; `loadCountryUnitsWithAntishipPlans` (`core.js`) separa `options`/`partialOptions`; el wizard antibuque solo ofrece `options` en el selector y muestra una nota explicando los planes excluidos y el motivo antes de que el usuario pueda avanzar; ver `correcciones.02.md#COR02-005`.

**Bloque 3 — Arquitectura y trazabilidad**

- [x] **COR02-007** (Alta para planificación) — Normalizar fuentes y `sourceId`. **Resuelta (2026-09-28):** los 12 artefactos de la raíz sin registrar quedan inventariados en `data/sources/sources.json` con un `role` explícito (2 resultaron ser contenido de reglas real todavía sin transcribir, `fuente-funcional-pendiente` — ver `correcciones.02.md#COR02-007`; el resto, duplicados/activos de proyecto); `tablas-armamento` gana un esquema formal de subdocumentos (`files[]`, 17 nombres exactos, corrigiendo 2 referencias rotas a `JP 2.pdf` que no existía en disco); los 13 workflows + índice normalizan `"TCW - TABLAS DE COMBATE"` a `"Tablas-de-combate 5.pdf"` + `sourceId`; 3 tests nuevos en `test/data.test.js` validan que toda referencia resuelve contra una fuente registrada, que toda fuente registrada existe en disco, y que ningún archivo de la raíz queda fuera del inventario.
- [x] **COR02-006** (Media) — Externalizar reglas y textos fijos incrustados en JavaScript. **Resuelta (2026-09-28):** las 7 evidencias citadas (4 de `detection-engine.js`: alcance fijo de baja altitud, multiplicador de terreno, acciones "brevemente detectable", tipos de detector; 3 de `combat-wizard-engine.js`: icono→método, daño por impacto, límites de bucket de distancia) se movieron a `data/detection/help-sheet.json` y `data/workflows/07_ataque_antibuque_guiado.json` respectivamente; se encontró además una tercera copia independiente de las mismas listas en la UI del resolutor interactivo (`public/js/views/help.js`), consolidada a la vez. `renderDetectionResolverDetail` pasa de síncrono a async (carga los datos antes de renderizar, mismo patrón que `renderDeteccionHelp`). Ver `correcciones.02.md#COR02-006`.
- [x] **COR02-009** (Media) — Cerrar la prueba de cobertura 198/198 de recortes de unidades. **Resuelta (2026-09-28):** nuevo test en `test/data.test.js` que compara por igualdad de conjuntos las unidades esperadas (`attack-plans`/`special-unit-plans`/`naval-plans`) contra las claves de `unit-regions.json.units`, en ambos sentidos (unidad sin región, región sin unidad) más el tamaño exacto (198) — antes solo se comprobaba que cada región existente apuntara a una unidad real, nunca el inverso; ver `correcciones.02.md#COR02-009`.

**Bloque 4 — Reconciliación y evolución**

- [x] **COR02-008** (Media) — Reconciliar documentación y metadatos con el código actual. **Resuelta (2026-09-28):** 4 descripciones de `data/sources/sources.json` corregidas (capítulo 6 del Decision Book, gap de Logística, contador de banda de día, automatización de "Disparo en Área"), checklist "Flujo" de esta misma Fase 7 marcado, y 2 referencias a `public/js/app.js` desactualizadas en `development_status.md` corregidas a sus ubicaciones tras COR-005; el historial fechado se deja intacto (AGENTS.md §18.3). Ver `correcciones.02.md#COR02-008`.
- [ ] **COR02-011** (Media-Baja) — Reducir la concentración de responsabilidades en las vistas extraídas de COR-005. Diferida explícitamente por el mantenedor; continúa en `correcciones03.md` como **COR03-006** (Fase 21, ver más abajo).
- [x] **COR02-010** (Media-Baja) — Desarrollar y cerrar Fase 8 con módulos defensivos reutilizables. **Resuelta parcialmente (2026-09-28):** segundo wizard real (`antiship_unguided`) consumiendo Interceptación Final/Interceptación de Munición junto a `antiship_guided`; ver detalle en la propia sección "Fase 8" de este documento y `correcciones.02.md#COR02-010`. Fase 8 sigue abierta por diseño — continúa en `correcciones03.md` como **COR03-005** (Fase 21).

### Restricciones

- No cerrar una incidencia en `roadmap.md` sin haber actualizado también su estado, criterios de aceptación y commit en `correcciones.02.md`.
- Respetar el orden recomendado salvo que una dependencia real obligue a alterarlo.

### Criterio de salida

Las 11 incidencias de `correcciones.02.md` quedan en estado `Resuelta` o `Descartada` (con justificación explícita), y se cumplen las condiciones de "§7. Condición recomendada para volver a declarar cerradas las fases" antes de volver a marcar como cerrada cualquier fase afectada.

**🎉 Fase 20 CERRADA (2026-09-28), con Bloque 4 en el estado indicado arriba.** Las 11 incidencias de `correcciones.02.md` están todas resueltas (íntegra o parcialmente por decisión explícita del mantenedor) o correctamente clasificadas como "sigue abierta por diseño". El seguimiento que queda pendiente (COR02-010/COR02-011) continúa en `correcciones03.md` como COR03-005/COR03-006, dentro de la nueva Fase 21. **Revisión posterior (`correcciones03.md`, commit de referencia `c4cf6a0`):** la interpretación de COR02-002 (máquina de estados con "fase actual" obligatoria) fue **revocada por una decisión de producto posterior** — el turno guiado debe ser de uso libre, no secuencial; ver Fase 21, `COR03-001`. COR02-001/003/004/005/006/007/008/009 se mantienen íntegramente resueltas: esa revocación no las afecta.

---

# Fase 21 — Backlog de correcciones técnicas 03 (`correcciones03.md`)

**Objetivo:** cerrar las incidencias de la tercera revisión de ingeniería (`correcciones03.md`, 2026-09-28, revisión de producto sobre el commit `c4cf6a0`), que sustituye la interpretación secuencial del turno guiado introducida por COR02-002 por la decisión de producto confirmada por el mantenedor: **el turno guiado es una ayuda de consulta y seguimiento de uso libre, no una secuencia obligatoria** — ya incorporada como requisito vigente en `AGENTS.md` §§1, 3.1, 6 y 12.1 (2026-09-28).

Cada tarea remite a su ficha completa en `correcciones03.md`; este roadmap solo hace seguimiento de alto nivel del progreso, mismo criterio que Fases 19/20.

**Análisis de compatibilidad con AGENTS.md (2026-09-28), antes de incorporar cualquier tarea al roadmap:** las 6 incidencias se contrastaron una a una contra el `AGENTS.md` vigente. Ninguna choca con él — al contrario, `AGENTS.md` ya exige exactamente lo que piden COR03-001/COR03-002/COR03-006 (§§3.1, 6, 4.1, 11) y ya reconoce como pendientes lo que piden COR03-004/COR03-005 (§2 regla de precedencia, §14). Se verificó además, leyendo el código real (no solo la evidencia del documento), que ninguna de las 6 está ya implementada: `getCurrentPhaseId`/`getPhaseSequenceState`/`evaluatePhaseSequencing`/la insignia "▶ Actual"/las confirmaciones "fuera de secuencia" siguen presentes tal cual en `turn-progress-engine.js`/`views/turn.js` (COR03-001); `DICE_FORMULAS`/`FINAL_TABLE_ROW_SCHEME_BY_METHOD`/`CM_BM_MARKER_ICONS`/`detection-engine.js#REFS`/las etiquetas de método y pasos del wizard en la vista siguen incrustados (COR03-002); `roadmap.md` (este mismo archivo, antes de esta edición) y `data/phases/turn-sequence-help.json#note` seguían describiendo la Fase 2 como "máquina de estados configurable" (COR03-003); las 2 imágenes de detección siguen sin transcribir (COR03-004, ya señalado también como sugerencia de tarea aparte en esta sesión); Fase 8 sigue con 3 de 5 mecanismos sin segundo consumidor (COR03-005 = continuación de COR02-010); `help.js`/`antiship-guided-wizard.js`/`core.js` siguen concentrando varias responsabilidades (COR03-006 = continuación de COR02-011).

### Tareas (orden recomendado, `correcciones03.md` §6)

- [x] **COR03-001** (Alta) — Alinear el turno guiado con un uso libre, parcial y no prescriptivo: retirar la noción de "fase actual" obligatoria de `turn-progress-engine.js`/`views/turn.js` (autorización, mensajes, confirmaciones "fuera de secuencia" y el evento `outOfSequence` del historial), sin perder el orden como metadato visual/atajo opcional ni las advertencias por pérdida real de datos/resoluciones activas. Revoca la interpretación de **COR02-002** por decisión de producto — no es un defecto de aquella corrección, es un cambio de criterio posterior. **Resuelta (2026-09-28):** ver `correcciones03.md#COR03-001` para el detalle técnico completo.
- [x] **COR03-003** (Alta) — Reconciliar `roadmap.md`, `development_status.md`, `data/phases/turn-sequence-help.json#note` y `correcciones.02.md` con el carácter no prescriptivo del turno (dejar constancia expresa de que COR02-002 queda revocada por decisión de producto, no oculta ni reescrita). Debe ejecutarse junto con o inmediatamente después de COR03-001, para que el código y la documentación no vuelvan a divergir. **Resuelta (2026-09-28):** ver `correcciones03.md#COR03-003` para el detalle completo de qué se tocó en cada archivo.
- [x] **COR03-002** (Media-Alta) — Segunda pasada sobre constantes residuales no cubiertas por las 7 evidencias ya resueltas de COR02-006: `DICE_FORMULAS`, `FINAL_TABLE_ROW_SCHEME_BY_METHOD`, `CM_BM_MARKER_ICONS`, la regla `method === 'ballistic'`, `detection-engine.js#REFS` y las etiquetas de método/pasos del wizard incrustadas en la vista (`METHOD_LABELS`/`*_WIZARD_STEPS`, algunas de ellas ya duplicando `label`s que el propio workflow declara). No reabre el alcance ya cerrado de COR02-006: pide clasificar cada constante como regla TCW (→ trasladar a `data/`) o detalle técnico legítimo (→ conservar, con justificación). **Resuelta (2026-09-28):** `DICE_FORMULAS`→`data/rules/dice-formulas.json`, `FINAL_TABLE_ROW_SCHEME_BY_METHOD`/`CM_BM_MARKER_ICONS`/la regla del método Balístico→campos en `data/workflows/07_ataque_antibuque_guiado.json`, `METHOD_LABELS` eliminada (duplicaba `label` ya transcrito). `detection-engine.js#REFS` y `*_WIZARD_STEPS` se clasifican como detalle técnico legítimo con justificación — ver `correcciones03.md#COR03-002` para el desglose completo por evidencia.
- [x] **COR03-004** (Media-Alta) — Transcribir o delimitar formalmente `detección Aire Aire.jpg` (tabla "2.1 Nivel de exploración") y `Deteección Electrónica.jpg` (mecánica RADCM/CCD), ya inventariadas como `fuente-funcional-pendiente` por COR02-007 pero sin analizar su contenido en profundidad ni transcribirlo a `data/detection/`. Ya existe una sugerencia de tarea en segundo plano de esta misma sesión con este alcance exacto (verificar si sigue vigente antes de reabrirla por duplicado). **Resuelta (2026-09-28):** `Deteección Electrónica.jpg` confirmada contra el Decision Book e integrada en `data/detection/help-sheet.json`/`public/js/detection-engine.js`; `detección Aire Aire.jpg` investigada y bloqueada explícitamente (`needs_review`, sin corresponder al capítulo de detección aérea vigente) — ver `correcciones03.md#COR03-004` y `docs/rules/known-ambiguities.md`.
- [x] **COR03-006** (Media-Baja) — Reducir responsabilidades de `help.js`/`antiship-guided-wizard.js`/`core.js` antes de ampliar nuevos dominios de ataque. Continuación directa de **COR02-011**, diferida explícitamente por el mantenedor para abordarla con contexto fresco; con esta revisión gana un matiz adicional: la división debe mantener rutas independientes sin introducir ninguna coordinación secuencial central (consistente con COR03-001). **Progreso parcial (2026-09-29):** `views/help.js` dividido en 9 módulos por categoría (`help-index`/`counters`/`municion`/`combate`/`search`/`deteccion`/`secuencia`/`reglas`/`tablas`.js), cada uno con rutas independientes y su propio namespace `Views.HelpXxx` — sin coordinación secuencial central, cada módulo se carga y navega por su cuenta. Cargadores compartidos (`loadDetectionHelp`/`loadRulesExcerpts`/`loadAirMissions`/`ICON_LABELS`/`renderIconChip`) promovidos a `core.js`. **Progreso (2026-10-04):** `antiship-guided-wizard.js` dividido en `antiship-guided-model.js` (estado + cálculos puros, testeable en Node), `views/antiship-guided-steps.js`, `views/antiship-guided-result.js` y el controlador (139 líneas). **Cierre (2026-10-04):** `core.js` dividido en `core-data.js`/`core-widgets.js`/`core-visuals.js`/`core-wizard-steps.js` + fachada `AppCore` de 136 líneas (re-exporta todo, sin cambiar llamadas). Residual documentado: los wizards no guiado y de combate terrestre siguen en un archivo cada uno. Ver `correcciones03.md#COR03-006`.
- [x] **COR03-005** (Media) — Mantener la Fase 8 abierta hasta que Defensa Antiaérea de Área (compartida), Interceptación de Misiles Balísticos y Contraataque a Baja Altura tengan un segundo consumidor real, igual que ya lo tienen Interceptación Final e Interceptación de Munición desde **COR02-010**. Añade un matiz sobre el de COR02-010: la integración debe poder iniciarse desde cualquier contexto (consulta rápida o cualquier fase relacionada) sin depender de una "fase actual" — automático una vez resuelta COR03-001, y ya cierto hoy para los wizards existentes (ninguno depende del turno guiado para funcionar). **Resuelta (2026-09-29)**, con la excepción documentada de Interceptación Terminal (laguna de datos, no de flujo) — ver `correcciones03.md#COR03-005` y `docs/rules/known-ambiguities.md`.

### Restricciones

- No cerrar una incidencia en `roadmap.md` sin haber actualizado también su estado, criterios de aceptación y commit en `correcciones03.md`.
- COR03-001 no se implementa retirando funciones puras de golpe: `getCurrentPhaseId`/`getPhaseSequenceState` pueden conservarse como orientación puramente informativa (AGENTS.md §6, "permitir mostrar el orden recomendado... como atajos opcionales") — lo que debe desaparecer es la semántica de autorización/anomalía sobre ellas, no necesariamente el dato.
- Respetar el orden recomendado (`correcciones03.md` §6) salvo que una dependencia real obligue a alterarlo — COR03-001 antes que COR03-003 por la misma razón que COR-001 fue antes que COR-002 en Fase 19.

### Criterio de salida

Las 6 incidencias de `correcciones03.md` quedan en estado `Resuelta` (**cumplido el 2026-10-04**: COR03-006 cerrada), sin ninguna en `Pendiente` sin motivo documentado. — **Actualizado 2026-09-29:** COR03-001/002/003/004/005 ya `Resuelta`; solo **COR03-006** sigue abierta, con progreso parcial (`help.js` dividido en 9 módulos; wizard guiado dividido en modelo/pasos/resultado/controlador el 2026-10-04; falta seguir reduciendo `core.js`). Ningún documento vigente exige una fase actual única ni finalización secuencial del turno guiado.

---

# Prioridad recomendada para el MVP

El MVP debe limitarse a un núcleo que demuestre toda la arquitectura:

1. Navegación de la plantilla de dos días.
2. Menú de ayuda rápida.
3. Lectura de counters y planes de ataque.
4. Detección básica.
5. Motor genérico de tablas/modificadores.
6. Router de combate.
7. Ataque guiado contra superficie completo.
8. Defensa antiaérea/interceptación reutilizable.
9. Historial y explicación de resultados.

**No intentar transcribir e implementar las 34 páginas de tablas antes de validar este vertical slice.** El ataque guiado contra superficie debe servir para comprobar que el modelo de datos, wizard, render de tablas, modificadores, resultados e historial son suficientemente genéricos.

---

# Backlog posterior al MVP

- Combate terrestre cercano.
- Ataque terrestre guiado/no guiado/ARM.
- Reacciones terrestres.
- BVR/WVR.
- Ataque naval no guiado.
- Torpedos.
- ASW completo.
- Estrategia/logística.
- Escenarios.
- Reglas opcionales/expansión.

---

# Riesgos del proyecto

## R1. Transcripción incorrecta de tablas

**Mitigación:** doble revisión, tests de integridad y referencias de página/celda.

## R2. Mezcla de reglas básicas y de expansión

**Mitigación:** etiquetar cada regla/modificador con su perfil y no activarla implícitamente.

## R3. Wizard demasiado rígido

**Mitigación:** usar un motor declarativo de pasos/transiciones y no pantallas específicas por ataque.

## R4. Resultado correcto pero inexplicable

**Mitigación:** todo cálculo produce una traza con valor base, modificadores, tabla, tirada y resultado.

## R5. Navegación del turno acoplada a un escenario

**Mitigación:** máquina de estados configurable por escenario y reglas activas.

## R6. Imágenes usadas como lógica

**Mitigación:** las imágenes son referencia visual; el cálculo usa datos estructurados revisados.

## R7. Datos fijos hardcodeados o introducción innecesaria de base de datos

**Mitigación:** resultados, modificadores y demás datos estáticos viven en archivos de texto versionados; JavaScript implementa motores genéricos que los interpretan. Una base de datos solo se incorporará si aparece una necesidad de datos dinámicos distinta de estas tablas fijas y se aprueba explícitamente.

---

# Definición de éxito

La aplicación cumple su objetivo cuando un jugador puede sentarse ante una partida, abrir el turno correspondiente y, sin conocer de memoria el reglamento:

- saber qué subfase está resolviendo;
- entender qué acciones puede ejecutar;
- seleccionar una misión;
- determinar si hay combate o reacción;
- responder solo a las preguntas relevantes;
- llegar a la tabla correcta;
- ver la columna/fila/celda aplicable resaltada;
- entender todos los modificadores;
- saber cómo aplicar impactos, bajas o daños;
- volver a la secuencia de juego;
- terminar la subfase o la fase con seguridad.

---

# Fase 22 — Ayudas sobre imágenes con hotspots (`ajuste_imagenes.md`, 2026-10-07)

**Objetivo:** que toda imagen con varias zonas explicativas use un componente común de hotspots con coordenadas calibradas y versionadas, y que cada zona muestre su nombre y un resumen verificado de su utilización.

**Verificación del informe (2026-10-07):** las cifras coinciden con el repositorio — 20 plantillas de ficha, 175 apariciones de factor, 43 conceptos (`factorVocabulary`, solo con `label`), 16 `positionBoxes` compartidas, 15 páginas de aeródromos/C4I, 17 de puertos y 198 recortes de unidades de plan de ataque. Puntos a tener en cuenta antes de implementar:

- **OpenCV:** no hay Python instalado en este equipo (solo el alias de la Tienda de Windows), pero sí `uv`, que permite ejecutar OpenCV de Python sin instalación global. El informe pide un ejecutor Python o, si se exige solo Node, OpenCV.js bajo Node con el mismo esquema de salida. `AGENTS.md` §4 fija Node para herramientas: usar Python/OpenCV exige documentar la excepción. **Decisión del mantenedor pendiente.**
- **Resúmenes de uso:** los 43 conceptos solo tienen etiqueta; los resúmenes de 15-40 palabras con fuente hay que redactarlos desde el Decision Book (o dejarlos `needs_review`). Es la parte con más trabajo de reglas.
- **Revisión humana:** ningún hotspot es `verified` sin imagen de control revisada. Hay que decidir quién revisa (yo puedo generar y revisar visualmente las imágenes de control, pero la marca `verified` es del mantenedor).
- **Compatibilidad:** `buildCounterViewer`/`appendFactorIdentificationHint` los usan 9 wizards y varias pruebas E2E; la migración debe conservar su comportamiento. Los botones de factor ya miden ≥48 px (AJ-009).
- **`AGENTS.md`:** la política permanente solo se redacta cuando existan el componente, el esquema y el proceso con sus rutas definitivas (paso final).

### Tareas (orden del informe, §9)

- [x] IMG-001 — esquema declarativo común de hotspots (`data/image-hotspots/`, coordenadas normalizadas, hash y dimensiones, `reviewStatus`) y catálogo de conceptos (`concepts.json`).
- [x] IMG-007 — componente único `ImageHotspotViewer` (imagen + capa SVG con el mismo `viewBox`, lista espejo, una zona activa, popover con fuente plegable, `selectedHotspotId`).
- [x] IMG-008 — estilos: tokens, bordes de 2-4 px con radio 8-12 px, estado `needs_review` ámbar discontinuo, foco de teclado.
- [~] IMG-009 (parcial: calibrador de fichas con uv + OpenCV; faltan aeródromos, puertos y planes) — proceso OpenCV reproducible y offline (verificación de hash, preprocesado, corrección geométrica, detección, candidatos, imágenes de control, validación).
- [~] IMG-010 (cubierto sin cola dedicada: `reviewedBy`/`reviewedAt`/`reviewNote` y los perfiles `profiles/*-review.json` + imágenes de control en `docs/image-hotspots/review/`; no hay herramienta visual de revisión) — cola de revisión visual (`reviewedBy`/`reviewedAt`/`reviewNote`).
- [x] IMG-002 (20 de 20 plantillas con cajas por factor, ajustadas y revisadas visualmente sobre la imagen de control; ninguna marcada `verified` todavía) — cajas exactas por `templateId + factor` para las 175 apariciones de las 20 fichas.
- [~] IMG-003 (cubierto: 49 aeródromos localizados con 21 zonas cada uno en las 32 páginas; resúmenes de uso redactados desde el Decision Book 7.2.3-7.3.3 para las zonas con regla, estado generated; falta la revisión humana y los textos de 23 zonas sin regla transcrita) — páginas de aeródromos por tarjeta y zona (15 páginas).
- [~] IMG-004 (cubierto: 31 puertos con 15 zonas cada uno; resúmenes de uso desde el Decision Book 9.2 y 9.9.4-9.9.5, estado generated; falta la revisión humana) — páginas de puertos por tarjeta y zona (17 páginas).
- [~] IMG-005 (solo se localizan 2 paneles C4I en los PDF —el ruso y otro—; helipuertos, plataformas y tarjetas estratégicas añadidos como tipos propios) — paneles HQ/C4I como instancias `command-card` independientes.
- [x] IMG-006 (decisión del mantenedor 2026-10-07: basta con un ejemplo de cada tipo de plan; quedan 42 filas con subzonas —aviones y submarinos— y el resto conserva el recorte plano; se abandonan las 156 restantes) — subzonas de los 198 recortes de planes de ataque, enlazadas a `data/ammunition/`.
- [x] Conectar `source-page` de `wizard-visual-refs.json` con tarjeta y zona (`boardType`/`hotspotId`): Protección del puerto y del aeródromo y Capacidad de Hangares; «Preparación» sin zona preseleccionada porque su equivalencia con una zona impresa no está validada.
- [ ] Pruebas de datos, calibrador, visor/E2E y regresión visual; prueba física en tablet horizontal (**la prueba física, aplazada hasta la primera versión completa**; las pruebas de datos, visor y E2E ya existen).
- [x] Actualizar `AGENTS.md` con la política permanente de ayudas visuales (§9.6) y la excepción Python/uv de §4.

### Criterio de salida

Se cumple la Definition of Done de `ajuste_imagenes.md` §10. No se calibran las 32 páginas antes de cerrar el esquema y el componente.

---

# Fase 23 — Secuencia de turno real: banda de dos días, impulsos y ayudas contextuales (`ajustes_de_turno.md`, 2026-10-07)

**Objetivo:** que el turno guiado represente la hoja real (banda de dos días, tres impulsos por día, Aire I/Superficie/Aire II/Tierra/Submarino) sobre una única fuente canónica, con progreso y resoluciones aislados por instancia, y que las ayudas visuales se abran en un panel lateral según el contexto.

**Verificación del informe contra el repositorio (2026-10-07):** el diagnóstico coincide.

- `data/phases/turn-template.json`: proceso estratégico con `repeat: 1` (cinco fases) y proceso de campaña con `repeat: 2` y solo cuatro fases (aérea, superficie, terrestre, submarina). `turn-sequence-help.json` es una segunda verdad con las seis fases, horarios, Aire I/Aire II, ausencia de Tierra en la 2.ª y 5.ª y los marcadores A/B/C/D de Tierra.
- `public/js/views/turn.js` titula «Campaña N de M» (4 sitios) y `turn-progress-engine.js` exige todas las subfases para dar un proceso por completo (líneas ~300 y ~425), lo que contradice el uso libre de `AGENTS.md`.
- Las resoluciones se identifican por `runKey` (proceso + ocurrencia) y fase, sin distinguir Aire I de Aire II.

**Discrepancia con el Decision Book (a decidir antes de TUR-004):** el informe dice que las letras A/B/C/D «identifican el tipo de unidad terrestre». El Decision Book (8.1.2, 8.3.1, págs. 157, 169-170) las define como el **Nivel de Reacción** impreso abajo a la derecha de la ficha, y asigna un nivel a cada segmento de tiempo con fase terrestre: segmento 1 = C, 3 = B, 4 = D, 6 = A. La matriz del informe (A,B,C / A,B / A,B,C,D / A) coincide con el ejemplo del libro (una unidad de Nivel B actúa en los segmentos 1, 3 y 4); en cambio las definiciones literales de los niveles A-D de 8.3.1 están invertidas respecto de ese ejemplo. El mantenedor lo confirmó el 2026-10-07: el valor de A/B/C/D es el Nivel de Reacción o Iniciativa (como en la ayuda de la ficha). La ayuda habla de «Nivel de Reacción» y la ambigüedad de las definiciones literales queda registrada en `docs/rules/known-ambiguities.md`.

### Tareas (orden recomendado del informe, §6)

- [x] TUR-001 (modelo canónico `turn-template.json` v4 + `turn-model.js`; la ayuda de secuencia se genera y `turn-sequence-help.json` desaparece) — modelo canónico único (banda → días → impulsos → segmentos) consumido por turno guiado, consulta rápida, buscador y pruebas; desaparece la segunda verdad.
- [x] TUR-014 (progreso v4 por IDs de nodo, con visitado/terminado/omitido separados y migración conservadora desde v1/v2/v3; el legado se conserva aparte y se avisa una vez) — esquema de progreso con IDs de instancia (`band-01/day-odd/morning/air-1`) y migración conservadora desde `processId:occurrence`.
- [x] TUR-015 (identidad por nodo exacto, incluido Aire I/Aire II; borradores de wizard aislados por nodo; contexto conservado al recargar) — resoluciones y borradores vinculados a banda, día, impulso, segmento, subfase y workflow.
- [x] TUR-008 (terminar/omitir/reabrir por nodo sin exigir subfases; terminar día; sin confirmaciones por orden) — finalización voluntaria sin exigir subfases visitadas; navegación libre.
- [x] TUR-002/003 — **cerrado (2026-10-08)**: dos días y seis fases con Aire I y Aire II como instancias distintas (rutas `#/turno/fase/N/...`). Aire I termina con la subfase opcional «Parálisis» (recordatorio de retirar la Parálisis de Red de los aeródromos, ciberataque 14.4.1, pág. 245; aclarado por el mantenedor); Aire II tiene las 6 subfases de la fase aérea. Los segmentos pueden añadir subfases propias (`segmentKinds.*.extraSubphases`).
- [x] TUR-004 (Tierra solo donde corresponde con el Nivel de Reacción por fase, «Combate cercano» en la 4.ª y, en cada pantalla de Tierra, el Nivel de Reacción abre las fichas terrestres con la letra resaltada —Iniciativa en las unidades principales, Móvil / Fijo en las técnicas—; la lectura de las definiciones de 8.3.1 sigue pendiente de revisión) — fase terrestre opcional con `allowedGroundUnitTypes` por impulso (leído como Nivel de Reacción) y «Combate cercano» en la 4.ª.
- [x] TUR-005/006 (Refuerzos como fase adicional al principio de cada fase antes de Aire I y Recuperación de Mando antes de cada día, ambos consultables en la interfaz; «Mantenimiento» conservado; el procedimiento de Refuerzos sigue pendiente de fuente) — Recuperación de Mando y Refuerzos consultables; Fase 0 una vez por banda; conservar «Mantenimiento» de la hoja frente a «Reparación».
- [x] TUR-007 (banda, día, fase, segmento, subfase y nodos consultables con `sourceRefs` propios, documento registrado y estado verified / needs_review con nota; cada subfase cita su sección y página del Decision Book en vez de la fase padre; las equivalencias por nombre y los segmentos de Tierra quedan pendientes de revisión; bloque plegable «Fuentes y trazabilidad» en cada pantalla) — `sourceRefs` propios por banda, día, impulso, segmento y subfase.
- [x] TUR-009/010 (menciones `[[id]]` + `entityRefs` declarativos en las subfases del turno; catálogo `data/visual-help/entities.json` y motor `visual-help-engine.js` con selección concreta / restringida / genérica / sin contexto y filtro por factor; 10 menciones en 10 subfases) — referencias `entityRef` declarativas y catálogo de plantillas visuales con selección por contexto (concreta, restringida, subconjunto, genérica).
- [x] TUR-011 (panel lateral `visual-help-panel.js`: acoplado en tablet/escritorio, inferior en móvil, pestañas por tipo, foco devuelto, Escape, sin `inert`, la ruta y el scroll no cambian) — panel lateral de ayuda visual (acoplado en tablet/escritorio, inferior en móvil).
- [x] TUR-012 (las 18 entradas con ayuda visual declaran `entityRef`; los 57 campos numéricos de los wizards declaran el ID estable de su ayuda con `{ visualRef }` (`data-visual-ref`), de modo que la ayuda ya no depende del texto de la etiqueta —el patrón queda solo de respaldo—; el panel abre el factor resaltado en todas las fichas compatibles. Las preguntas de opción no tienen lectura física y no llevan ayuda visual) —
- [x] TUR-013 (cada segmento lista los combates de sus subfases —Salidas de combate incluye ahora los ataques antibuque, terrestres, antirradiación y ASW de las misiones aéreas— y atajos de wizard: reacciones y resultado de ataque en Ataques terrestres, reabastecimiento en Reorganización, garantía logística en Logística; el wizard muestra y guarda su origen: banda, día, fase, segmento y subfase, también en el historial) — workflows aplicables declarados por segmento y subfase; abrir un wizard conserva el origen.
- [~] TUR-016 (hecho: pruebas de datos, unitarias y E2E de las seis fases, Tierra por fase, Aire I/II independientes, finalización voluntaria, migración, resoluciones por nodo, Refuerzos y Recuperación de Mando, panel lateral, selección visual y fuentes; pendiente: móvil táctil de todo el turno y los casos que dependan de TUR-003) —
- [x] TUR-017/018 (documentación operativa al día y política permanente en `AGENTS.md` §3.1.1 con los nombres y rutas reales; una prueba comprueba que todo archivo que cita existe) —

### Criterio de salida

Se cumple la Definition of Done de `ajustes_de_turno.md` §7. No se construyen pantallas sobre el JSON actual antes de consolidar el modelo canónico (§6 del informe).
