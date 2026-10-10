# Ajustes de la secuencia de turno y de sus ayudas contextuales

Fecha de revisión: 2026-10-07  
Repositorio: `C:\Users\p.alvarez\thecommingwave`  
Estado: análisis validado por el mantenedor; implementación pendiente  
Objetivo: corregir el modelo del turno guiado y convertir su ayuda textual y visual en una referencia fiel, contextual, reversible y utilizable durante la partida.

## 1. Resultado ejecutivo

El turno guiado no representa actualmente la estructura temporal real de la hoja de turnos. La aplicación muestra dos repeticiones idénticas de un «Proceso de Campaña» y dentro de cada una presenta una sola secuencia `Aérea → Superficie → Tierra → Submarina`. La estructura validada por el mantenedor es una banda de dos días; cada día tiene tres impulsos —mañana, tarde y noche— y cada impulso sigue `Aire I → Superficie → Aire II → Tierra, cuando corresponda → Submarino`.

La corrección no puede limitarse a cambiar `repeat: 2` por otro número. El modelo actual reutiliza los mismos IDs de fase y subfase, la persistencia guarda el progreso por repetición genérica y las resoluciones activas se vinculan a esos IDs. Duplicar fases produciría colisiones entre Aire I y Aire II y entre impulsos. Se requiere modificar datos, motor de progreso, rutas, persistencia, ayuda contextual, pruebas y migración.

La ayuda visual también debe cambiar. Cada referencia a una entidad con imágenes explicativas —aeródromo, puerto, C4I, unidad, plan de ataque, munición, etc.— debe ser activable y abrir una ayuda lateral sin perder el contexto. Si la referencia es genérica se mostrarán todos los tipos aplicables; si el contexto determina un tipo concreto, solo se mostrará ese tipo. En un wizard que solicite un factor, el mismo panel se abrirá con ese factor ya resaltado.

## 2. Decisiones funcionales confirmadas

Estas decisiones fueron validadas por el mantenedor el 2026-10-07 y no deben tratarse como hipótesis:

1. La jerarquía es `banda de dos días → día impar/par → impulso de mañana/tarde/noche → segmentos del impulso`.
2. Las activaciones terrestres son:
   - Primera fase: A, B y C.
   - Segunda fase: sin segmento terrestre.
   - Tercera fase: A y B.
   - Cuarta fase: A, B, C y D, con «Combate cercano».
   - Quinta fase: sin segmento terrestre.
   - Sexta fase: A.
3. Las letras A/B/C/D identifican el tipo de unidad terrestre. La ayuda debe explicar qué tipos de ficha pueden activarse en cada fase y señalar visualmente la letra identificativa en una ficha representativa cuando exista una imagen calibrada.
4. La Fase 0 o Estratégica se ejecuta una vez por cada banda de dos días.
5. Recuperación de Mando y Refuerzos serán elementos consultables del turno, no simples adornos visuales.
6. En las ayudas visuales:
   - si el contexto fija un tipo de unidad, se muestra ese tipo;
   - si el contexto admite varios tipos, se muestran todos los tipos compatibles;
   - si la referencia es genérica, por ejemplo «unidades aéreas», se muestran todos los tipos de unidad aérea disponibles en el catálogo;
   - no se escogerá arbitrariamente el primer ejemplo disponible.

## 3. Secuencia canónica que debe representar la aplicación

| Día de la banda | Impulso | Fase | Horario impreso | Secuencia | Tipos terrestres habilitados |
|---|---|---:|---|---|---|
| Día impar | Mañana | 1.ª | 4-12/16 | Aire I → Superficie → Aire II → Tierra → Submarino | A, B y C |
| Día impar | Tarde | 2.ª | 12-20 | Aire I → Superficie → Aire II → Submarino | Ninguno; no existe segmento terrestre |
| Día impar | Noche | 3.ª | 20/16-4 del día siguiente | Aire I → Superficie → Aire II → Tierra → Submarino | A y B |
| Día par | Mañana | 4.ª | 4-12/16 | Aire I → Superficie → Aire II → Tierra → Submarino | A, B, C y D; «Combate cercano» |
| Día par | Tarde | 5.ª | 12-20 | Aire I → Superficie → Aire II → Submarino | Ninguno; no existe segmento terrestre |
| Día par | Noche | 6.ª | 20/16-4 del día siguiente | Aire I → Superficie → Aire II → Tierra → Submarino | A |

La línea temporal debe mostrar también:

- Fase 0/Estratégica una vez al comienzo de la banda de dos días.
- Recuperación de Mando asociada a cada ciclo diario de tres impulsos.
- Refuerzos en la posición que establezca la fuente de reglas.
- Número real de día de campaña, además de «impar/par».
- Orden recomendado, sin convertirlo en un requisito de navegación.

## 4. Diagnóstico del estado actual

### 4.1. Modelo de datos divergente

`data/phases/turn-template.json` declara un proceso estratégico y un proceso de campaña con `repeat: 2`. Cada repetición contiene solo cuatro fases: aérea, superficie, terrestre y submarina. En cambio, `data/phases/turn-sequence-help.json` contiene las seis fases de la banda, sus horarios, Aire I/Aire II, la ausencia de Tierra en la segunda y quinta fase y la matriz A/B/C/D.

La separación entre «modelo real» y «ayuda de solo lectura» ha permitido que dos representaciones del mismo turno evolucionen de forma incompatible. Debe existir una única fuente canónica consumida por el turno guiado, la consulta rápida, el buscador y las pruebas.

### 4.2. Navegación temporal incorrecta

`public/js/views/turn.js` construye las tarjetas a partir de `repeat` y las titula «Campaña N de M». No conoce día, paridad, impulso, horario ni número de fase. Tampoco puede aplicar variantes por instancia, porque todas las repeticiones reutilizan la misma lista de fases.

### 4.3. Colisiones de estado

`public/js/turn-progress-engine.js` almacena `finishedPhases` y `finishedSubphases` como listas de IDs dentro de una repetición. Aire I y Aire II necesitarán subfases con nombres similares dentro del mismo impulso; si se conservan IDs globales, terminar una subfase de Aire I podría marcar la de Aire II.

Las resoluciones activas usan `band + runKey + phaseId` para formar su identidad. Ese conjunto tampoco distingue dos instancias aéreas del mismo impulso ni, de forma segura, la subfase desde la que se inició la resolución.

### 4.4. Finalización incoherente con el uso libre

El motor exige todas las subfases marcadas para considerar completo un proceso incluso cuando la fase se ha marcado voluntariamente como terminada. Esto contradice la política de uso libre de `AGENTS.md`: las subfases no visitadas no deben impedir que el proceso aparezca como terminado si el usuario decidió terminar sus fases.

### 4.5. Ayuda visual parcial y fuera de contexto

Las ayudas del turno son texto plano y enlaces que cambian de ruta. Solo cuatro subfases muestran galerías de aeródromos o puertos, y esas galerías cargan todas las páginas del PDF. No existe una relación declarativa entre una frase concreta y una entidad visual ni un panel lateral que conserve visible la explicación original.

Los wizards disponen de ayudas visuales para numerosos campos numéricos, pero el mecanismo depende principalmente de reconocer el texto de la etiqueta. No cubre de manera uniforme preguntas de opción, entidades citadas dentro de una explicación ni todas las referencias no numéricas.

## 5. Modificaciones necesarias

### TUR-001 — Unificar la secuencia en un modelo canónico

**Prioridad:** P1  
**Ámbito:** datos, carga de datos, ayuda rápida, turno guiado y buscador.

Crear un único archivo canónico —puede evolucionar `turn-template.json` o sustituirse por un archivo versionado— que contenga:

- bandas de dos días;
- Fase 0;
- días dentro de la banda;
- impulsos con número, nombre y horario;
- instancias ordenadas de Aire I, Superficie, Aire II, Tierra y Submarino;
- Recuperación de Mando y Refuerzos como nodos consultables;
- variantes por impulso;
- subfases y ayudas reutilizables;
- referencias de fuente en cada nivel.

`turn-sequence-help.json` debe desaparecer como segunda verdad funcional o quedar generado automáticamente desde el modelo canónico. No se mantendrán manualmente dos árboles equivalentes.

Ejemplo conceptual:

```json
{
  "schemaVersion": 4,
  "band": {
    "durationDays": 2,
    "strategicPhaseRef": "fase-0",
    "days": [
      {
        "id": "day-odd",
        "parity": "odd",
        "commandRecoveryRef": "command-recovery",
        "impulses": ["phase-1", "phase-2", "phase-3"]
      },
      {
        "id": "day-even",
        "parity": "even",
        "commandRecoveryRef": "command-recovery",
        "impulses": ["phase-4", "phase-5", "phase-6"]
      }
    ]
  }
}
```

**Criterio de aceptación:** la consulta rápida y el turno guiado obtienen la misma secuencia de un único árbol y una prueba impide que vuelvan a divergir.

---

### TUR-002 — Representar dos días y tres impulsos por día

**Prioridad:** P1

Sustituir «Proceso de Campaña 1 de 2» por una presentación explícita de:

- Día N — impar o par dentro de la banda.
- Mañana / Tarde / Noche.
- Primera a sexta fase.
- Horario impreso.

La interfaz puede agrupar los tres impulsos en una tarjeta de día y permitir desplegarlos, pero todos deben poder abrirse directamente. Los enlaces anterior/siguiente serán atajos recomendados, nunca bloqueos.

**Criterio de aceptación:** una banda muestra seis impulsos y nunca presenta solo dos campañas genéricas.

---

### TUR-003 — Modelar las instancias Aire I y Aire II

**Prioridad:** P1

Cada impulso debe contener dos nodos aéreos distintos con IDs de instancia estables, por ejemplo `phase-1/air-1` y `phase-1/air-2`. Podrán reutilizar una definición común de contenido, pero no compartirán estado de progreso.

Los pasos concretos de Aire I y Aire II solo se incorporarán cuando estén respaldados por la hoja o por el Decision Book. La hoja imprime detalles completos en la primera fase y deja varias columnas posteriores sin texto; no debe asumirse automáticamente que todos los pasos se repiten de forma idéntica.

Debe revisarse expresamente la relación entre «Parálisis», «Salidas de combate» y «Restablecimiento de capacidades». Mientras no se confirme, el contenido dudoso permanecerá como `needs_review` y no se presentará como regla cerrada.

---

### TUR-004 — Corregir la fase terrestre y las letras de tipo de unidad

**Prioridad:** P1

La fase terrestre será una instancia opcional en la estructura, no una fase global presente siempre:

- no se crea en la segunda y quinta fase;
- incluye `allowedGroundUnitTypes` con las letras confirmadas en las demás;
- la cuarta fase incorpora la ayuda «Combate cercano»;
- la pantalla explica que las letras identifican tipos de unidades terrestres.

La ayuda debe mostrar fichas representativas de todos los tipos terrestres habilitados en ese impulso. Si una regla o acción restringe posteriormente el tipo a uno solo, el panel filtrará el conjunto y mostrará únicamente ese tipo. La letra identificativa debe resaltarse mediante hotspot cuando la geometría y el significado estén validados.

No se hardcodearán las letras en la vista: deben proceder del nodo de impulso.

---

### TUR-005 — Incorporar Recuperación de Mando y Refuerzos como ayuda consultable

**Prioridad:** P1

Crear nodos informativos directamente accesibles desde la línea temporal:

- `command-recovery`, asociado al comienzo de cada ciclo diario de tres impulsos;
- `reinforcements`, asociado a la posición exacta confirmada por la fuente.

Cada nodo debe incluir título, resumen, procedimiento, entidades relacionadas, fuente y estado de validación. Si el procedimiento aún no está transcrito, el nodo seguirá siendo consultable pero mostrará «Contenido pendiente de transcribir/validar»; no se inventará una secuencia.

Estos nodos no bloquearán el acceso a ningún impulso ni exigirán marcarse como terminados.

---

### TUR-006 — Ejecutar la Fase 0 una vez por banda de dos días

**Prioridad:** P1

La Fase 0 debe aparecer una vez al principio de cada banda de dos días. Los resaltados de las bandas 4, 8 y 12 no se usarán para decidir si existe o se ejecuta la fase estratégica.

Debe revisarse la discrepancia de nombre entre `Mantenimiento`, impreso en la hoja, y `Fase de Reparación`, utilizado por el turno guiado. Hasta verificar su equivalencia y alcance, el modelo debe conservar la denominación de la fuente principal y documentar la relación con la regla de reparación naval.

---

### TUR-007 — Corregir referencias y trazabilidad

**Prioridad:** P1

Cada banda, día, impulso, segmento, subfase, activación terrestre y ayuda contextual debe tener `sourceRefs` propios. La vista de subfase no debe sustituirlos por la referencia general de la fase padre.

Como mínimo se mostrarán de forma secundaria:

- documento;
- página o sección;
- estado `verified` o `needs_review`;
- nota de discrepancia cuando dos fuentes no coincidan.

---

### TUR-008 — Preservar la navegación libre y corregir el cálculo de finalización

**Prioridad:** P1

El rediseño no debe convertir la línea temporal en una máquina de estados restrictiva. Debe mantenerse:

- acceso directo a cualquier día, impulso, segmento o ayuda;
- terminación voluntaria de subfase, fase, impulso o día;
- ausencia de advertencias por consultar fuera de orden;
- confirmación únicamente si hay datos o resoluciones activas que puedan perderse.

Un impulso o día podrá considerarse terminado cuando el usuario lo marque como tal, aunque existan subfases no visitadas. La aplicación podrá mostrar progreso detallado, pero no reinterpretará lo no visitado como error.

---

### TUR-009 — Crear referencias semánticas a entidades visuales

**Prioridad:** P1  
**Relacionado con:** `ajuste_imagenes.md`.

Los textos del turno no deben buscarse mediante expresiones regulares para decidir qué imagen mostrar. El contenido declarativo debe incluir referencias explícitas, por ejemplo:

```json
{
  "text": "Planifica las misiones en las fichas de aeródromo.",
  "entityRefs": [
    {
      "entityType": "airfield-board",
      "scope": "generic",
      "presentation": "side-panel",
      "label": "fichas de aeródromo"
    }
  ]
}
```

Las referencias pueden aparecer en títulos, párrafos, acciones, requisitos, notas y preguntas. El término visible será un botón-enlace accesible, no un enlace que cambie la ruta principal.

---

### TUR-010 — Seleccionar la imagen según el contexto y el tipo de unidad

**Prioridad:** P1

Crear un catálogo declarativo que relacione entidades de reglas con plantillas visuales. La selección seguirá este orden:

1. **Entidad concreta conocida:** mostrar su plantilla o imagen concreta.
2. **Tipo determinado por la regla:** mostrar únicamente las plantillas compatibles. Ejemplo: si un combate aéreo solo admite avión de combate, no mostrar transporte, EW u otros tipos aéreos.
3. **Subconjunto permitido:** mostrar todas las plantillas del subconjunto.
4. **Referencia genérica:** mostrar todos los tipos del dominio. Ejemplo: al mencionar simplemente «unidades aéreas», mostrar todas las clases aéreas existentes en el catálogo.
5. **Contexto insuficiente:** no elegir el primer elemento arbitrariamente; mostrar el selector completo del dominio o declarar que falta contexto.

Cuando haya varios tipos, el panel lateral mostrará un selector por pestañas, lista o carrusel accesible. Solo una imagen necesita estar expandida a la vez, pero todos los tipos compatibles deben ser alcanzables sin cerrar el panel.

El catálogo debe reutilizar las plantillas y hotspots calibrados del sistema de `ajuste_imagenes.md`. No se crearán recortes duplicados ni coordenadas específicas del turno.

Cobertura mínima:

- aeródromos;
- puertos;
- C4I/Capacidad de Mando;
- unidades aéreas, distinguiendo todos sus tipos existentes;
- unidades terrestres, distinguiendo sus tipos y letras identificativas;
- unidades de superficie;
- submarinos;
- helicópteros o aviación del ejército;
- planes de ataque;
- tipos de munición.

---

### TUR-011 — Implementar un panel lateral de ayuda visual

**Prioridad:** P1

En tablet horizontal y escritorio, activar una entidad debe abrir un panel lateral sin sustituir la pantalla actual. El usuario debe seguir viendo el texto, fase o pregunta que originó la ayuda.

El panel incluirá:

- título de la entidad;
- imagen o selector de tipos aplicables;
- hotspots con nombre y resumen de uso;
- fuente desplegable;
- indicador de ejemplo genérico cuando no sea la unidad concreta;
- botón de cierre;
- acceso opcional a la ayuda completa.

Comportamiento responsive:

- tablet horizontal/escritorio: panel lateral acoplado;
- móvil: diálogo o panel inferior;
- toque, teclado y puntero equivalentes;
- foco trasladado y devuelto correctamente;
- Escape cierra;
- el scroll y las respuestas del turno o wizard se conservan.

El panel global de «Ayuda rápida» puede aportar patrones de accesibilidad, pero no debe reutilizarse sin adaptación: actualmente convierte todo el contenido de fondo en `inert`, mientras esta ayuda contextual debe mantener visible la relación entre texto e imagen.

---

### TUR-012 — Aplicar la misma ayuda a los wizards de combate

**Prioridad:** P1

Todos los wizards deben usar el mismo catálogo y panel lateral:

- una referencia genérica a unidades aplica la lógica de todos los tipos compatibles;
- una restricción de combate filtra las plantillas;
- una pregunta sobre un factor abre la ficha con ese factor seleccionado;
- si existen varias plantillas compatibles con el factor, se ofrecen todas con el mismo hotspot seleccionado;
- una pregunta sobre plan o munición abre el recorte correcto y sus zonas;
- una pregunta sobre aeródromo, puerto o C4I abre una tarjeta representativa con la zona correspondiente.

La cobertura no puede limitarse a campos numéricos ni depender del texto exacto de la etiqueta. Las definiciones del wizard deben declarar `visualRef` o `entityRef` por ID estable.

Si un factor carece de geometría o explicación validada, el panel mostrará `needs_review` o «Ayuda visual pendiente»; no dibujará una zona aproximada como si fuese exacta.

---

### TUR-013 — Corregir los enlaces de combate desde el turno

**Prioridad:** P2

Cada segmento y subfase debe declarar los workflows aplicables según el contexto real. Las páginas de fase no deben invocar siempre la ayuda con una lista vacía.

Debe revisarse, como mínimo:

- Salidas de combate y sus combates aéreos.
- Combate de superficie.
- Combate terrestre.
- Ataques terrestres, incluida la ayuda de reacciones terrestres cuando proceda.
- Búsqueda y combate submarino/ASW.
- Restricciones de misión heredadas del segmento desde el que se abre el wizard.

Abrir un wizard desde el turno debe conservar banda, día, impulso, segmento y subfase de origen.

---

### TUR-014 — Versionar y migrar el progreso del turno

**Prioridad:** P1

Crear un nuevo esquema de persistencia. En vez de `processId:occurrence`, usar IDs estables de instancia, por ejemplo:

```text
band-01/phase-0
band-01/day-odd/morning/air-1
band-01/day-odd/morning/surface
band-01/day-even/night/ground
```

El estado debe separar:

- nodo visitado;
- nodo marcado como terminado;
- nodo omitido voluntariamente cuando proceda;
- subfases terminadas dentro de cada instancia;
- resoluciones activas vinculadas;
- contexto de navegación reciente.

La migración desde el esquema actual debe ser conservadora:

1. No repartir automáticamente una campaña antigua entre tres impulsos.
2. Conservar el dato antiguo en una copia de migración o registro de legado.
3. Cuando no exista correspondencia inequívoca, iniciar los nuevos impulsos sin marcar e informar una sola vez al usuario.
4. No descartar borradores o resoluciones activas sin aviso.
5. Añadir pruebas para esquemas anteriores y datos parciales/corruptos.

---

### TUR-015 — Vincular las resoluciones a la instancia exacta

**Prioridad:** P1

La identidad de una resolución activa debe incluir:

- banda;
- día;
- impulso;
- segmento —incluido Aire I/Aire II—;
- subfase o acción, cuando exista;
- workflow;
- identificador propio de resolución.

Dos resoluciones del mismo tipo abiertas en Aire I y Aire II no pueden sobrescribirse. Reabrir exactamente la misma resolución sí debe recuperar su borrador.

---

### TUR-016 — Actualizar pruebas y validaciones de contenido

**Prioridad:** P1

Eliminar las aserciones que consolidan `repeat: 2` y cuatro fases idénticas. Añadir:

#### Tests de datos

- una banda contiene exactamente dos días y seis impulsos;
- cada día contiene mañana, tarde y noche;
- el orden de segmentos coincide con la matriz validada;
- segunda y quinta fase no tienen Tierra;
- letras terrestres exactas por fase;
- Fase 0 aparece una vez por banda;
- Recuperación de Mando y Refuerzos tienen nodos y fuente;
- todos los `entityRefs` y `visualRefs` resuelven a elementos existentes;
- ninguna instancia reutiliza una identidad de progreso incompatible.

#### Tests unitarios

- resolución de día real y paridad dentro de cada banda;
- siguiente sugerido sin bloqueo;
- finalización voluntaria sin exigir todas las subfases;
- migración del esquema anterior;
- selección visual por entidad concreta, tipo restringido, subconjunto y dominio genérico;
- identidad de resoluciones por instancia.

#### Tests E2E

- recorrido de las seis fases visibles;
- acceso directo a cualquier impulso;
- ausencia de Tierra en 2.ª y 5.ª;
- fichas A/B/C, A/B, A/B/C/D y A según el impulso;
- Recuperación de Mando y Refuerzos consultables;
- apertura/cierre del panel lateral sin perder la posición;
- «unidades aéreas» genérico muestra todos los tipos;
- un combate restringido a avión de combate muestra solo ese tipo;
- pregunta por un factor abre el hotspot ya seleccionado;
- dos resoluciones del mismo workflow en segmentos distintos no colisionan;
- tablet horizontal, móvil, teclado y toque.

---

### TUR-017 — Actualizar documentación operativa

**Prioridad:** P1

El desarrollador deberá actualizar:

- `development_status.md`, con migración, archivos, pruebas y forma de comprobarlo en la web;
- `roadmap.md`, si cambia el estado de la fase del turno guiado;
- documentación de ambigüedades, para los subpasos no impresos y la relación Mantenimiento/Reparación;
- comentarios de código que actualmente describen dos procesos de campaña.

La ayuda no debe mostrar al jugador términos internos como `schemaVersion`, `needs_review` o nombres de archivos; esos datos pertenecen a la trazabilidad desplegable o a la documentación técnica.

---

### TUR-018 — Incorporar esta política a `AGENTS.md`

**Prioridad:** P1  
**Responsable:** desarrollador que implemente la corrección.

Este análisis no modifica `AGENTS.md`. Al implementar estos ajustes, el desarrollador deberá añadir allí una política permanente que establezca:

1. La secuencia canónica del turno es una banda de dos días, con tres impulsos diarios y los segmentos/activaciones confirmados en este documento.
2. Fase 0 se ejecuta una vez por banda de dos días.
3. Recuperación de Mando y Refuerzos son ayudas consultables y no bloqueantes.
4. Toda referencia a una entidad con ayuda visual debe poder abrir el componente común de hotspots.
5. Una referencia genérica muestra todos los tipos compatibles; una referencia restringida muestra solo los tipos permitidos por el contexto.
6. Cuando un wizard pida un factor, la ayuda se abre con ese factor ya resaltado.
7. Las relaciones texto→entidad→visual deben ser declarativas y usar IDs estables, no inferirse por coincidencias de texto.
8. Las imágenes, coordenadas, fuentes y estados de revisión siguen la política de `ajuste_imagenes.md`.
9. Ninguna ayuda visual calcula valores a partir de píxeles ni sustituye los datos estructurados.

La implementación no se considerará terminada hasta que `AGENTS.md` refleje esta forma de proceder. La modificación debe hacerla el desarrollador junto con el código definitivo, usando los nombres y rutas realmente implementados.

## 6. Orden recomendado de implementación

1. Consolidar la fuente canónica y añadir validaciones de contenido.
2. Crear IDs por instancia para días, impulsos y segmentos.
3. Adaptar el motor de progreso y escribir la migración.
4. Corregir las rutas y el vínculo de resoluciones/borradores.
5. Rediseñar el índice del turno y la consulta rápida sobre el mismo árbol.
6. Incorporar Recuperación de Mando, Refuerzos y activaciones terrestres.
7. Crear el catálogo `entityRef`/`visualRef` y su algoritmo de filtrado por tipo.
8. Implementar el panel lateral reutilizando los hotspots existentes.
9. Migrar la ayuda del turno y después los wizards al nuevo mecanismo.
10. Ejecutar tests, QA responsive y actualizar documentación, incluido `AGENTS.md`.

No se recomienda construir primero las pantallas sobre el JSON actual: consolidaría nuevamente una estructura incorrecta y obligaría a una segunda migración.

## 7. Definition of Done

La corrección se considerará terminada únicamente cuando:

- el turno guiado muestre dos días y seis impulsos por banda;
- cada impulso presente el orden correcto con Aire I y Aire II separados;
- Tierra no aparezca en segunda y quinta fase;
- las letras de tipos terrestres coincidan con la matriz validada;
- Fase 0 aparezca una vez por banda de dos días;
- Recuperación de Mando y Refuerzos sean consultables;
- turno guiado y consulta rápida consuman la misma fuente canónica;
- el usuario pueda abrir cualquier nodo sin prerrequisitos;
- terminar una fase o impulso no exija visitar todas sus subfases;
- progreso y resoluciones estén aislados por instancia y sobrevivan a recarga;
- las referencias visuales genéricas muestren todos los tipos compatibles;
- las referencias restringidas muestren solo los tipos que admite la regla;
- los factores solicitados por un wizard aparezcan resaltados;
- la ayuda lateral conserve el contexto y sea accesible en tablet, móvil, teclado y toque;
- no queden tests que esperen la estructura antigua;
- `development_status.md`, `roadmap.md`, ambigüedades y `AGENTS.md` estén actualizados;
- todos los tests pertinentes hayan sido ejecutados y su resultado real esté documentado.

## 8. Archivos previsiblemente afectados por la implementación

La lista exacta dependerá del diseño final, pero el desarrollador deberá revisar al menos:

- `data/phases/turn-template.json`;
- `data/phases/turn-sequence-help.json`;
- `data/sources/tcw_phase_help.xml`;
- nuevos datos de entidades o referencias visuales bajo `data/`;
- `public/js/turn-progress-engine.js`;
- `public/js/views/turn.js`;
- `public/js/views/help-secuencia.js`;
- `public/js/core-data.js`;
- `public/js/core-visuals.js`;
- `public/js/core-visual-refs.js`;
- `public/js/storage.js`;
- `public/js/router.js` y rutas que codifiquen la estructura antigua;
- estilos y estructura del panel contextual;
- tests unitarios de datos/progreso/referencias visuales;
- tests E2E del turno y de los wizards;
- `docs/rules/known-ambiguities.md`;
- `roadmap.md`;
- `development_status.md`;
- `AGENTS.md`, únicamente durante la implementación, como exige TUR-018.

## 9. Elementos que deben permanecer bloqueados hasta verificar la fuente

Las siguientes cuestiones no alteran las decisiones ya confirmadas, pero no deben resolverse por intuición:

- lista exacta de subpasos que se repite o cambia en Aire I/Aire II de cada impulso cuando la hoja deja columnas en blanco;
- equivalencia y alcance entre «Mantenimiento» y «Reparación»;
- procedimiento completo de Recuperación de Mando;
- procedimiento y posición exacta de Refuerzos;
- nombre reglamentario de cada tipo terrestre A/B/C/D y ubicación exacta de la letra en todas las plantillas de ficha.

Mientras falte una fuente verificable, la aplicación mostrará el nodo o ayuda como pendiente, conservará la navegación y bloqueará únicamente el cálculo que dependa de la regla ausente.
