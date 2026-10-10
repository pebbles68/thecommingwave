# AGENTS.md — The Coming Wave Companion

## 1. Propósito del proyecto

Este repositorio implementa una aplicación de ayuda para **The Coming Wave (TCW)**. La aplicación no sustituye al reglamento: permite consultar la secuencia de juego, explica cada subfase, recoge decisiones y modificadores, conduce a la tabla correcta y ayuda a interpretar y aplicar el resultado.

La aplicación parte de una **plantilla de dos días**, pero esa plantilla es una referencia de apoyo, no un itinerario obligatorio. El jugador debe poder entrar directamente en cualquier fase, subfase, ayuda o resolución cuando la necesite, utilizar solo una parte del turno y abandonar o retomar la consulta sin completar los elementos anteriores. Desde cualquier submenú deben estar disponibles accesos directos a ayudas independientes: fases/subfases, tablas, armamento/munición, reglas, detección y lectura de fichas.

La aplicación debe priorizar:

1. **Fidelidad a las reglas y ayudas suministradas**.
2. **Trazabilidad**: todo resultado calculado debe explicar qué entradas y modificadores se han aplicado.
3. **Navegación reversible**: el usuario debe poder volver atrás, cancelar una resolución, terminar una subfase o terminar una fase.
4. **Datos antes que lógica hardcodeada**: tablas, resultados, modificadores, secuencias y textos fijos deben residir en archivos de texto versionables y legibles (preferentemente JSON cuando sean datos estructurados), nunca incrustados en la lógica de la aplicación.
5. **No inventar reglas**: si una situación no está soportada por las fuentes del proyecto, mostrarla como pendiente/no implementada en vez de inferirla.
6. **Uso libre y no prescriptivo**: el seguimiento del turno puede informar, recordar y conservar progreso, pero no debe obligar a recorrer fases o subfases en orden ni tratar como error que el usuario consulte o utilice solo las partes que necesita.

---

## 2. Fuentes funcionales del proyecto

Las fuentes entregadas son la referencia de negocio. **Los PDF y DOCX originales no se versionan en el repositorio** (decisión del mantenedor, 2026-10-10; ver `NOTICE.md` y `.gitignore`): el mantenedor los conserva en local y el repositorio guarda los datos y las imágenes derivadas, con el inventario en `data/sources/sources.json`. Entre ellas:

- `TCW_Decision_Book_v1.0_-_COMPLETO_[v.ESP_-_1.2](2).pdf`: reglamento/Decision Book traducido al español.
- `Tablas-de-combate 5(1).pdf`: tablas de resolución de combate agrupadas por dominio.
- `Mapa de uso de tablas(1).txt`: mapa de decisión para llegar a la tabla de combate apropiada según objetivo, origen y tipo de ataque.
- `TCW - Hoja de turnos 1.1(2).pdf`: plantilla visual de turnos y fases.
- `TCW-Hoja-de-Ayuda-Deteccion.pdf`: estados y procedimientos de detección.
- `TCW_-_Hoja_de_Ayuda_-_Ataque_Guiado_Superficie.pdf`: ejemplo guiado de ataque contra unidades de superficie.
- `Resumen counters - Español.pdf` y las imágenes de counters: leyendas de atributos de fichas.
- `Tablas de municiones.pdf`, `Plan de ataque*.png`, `Tipos de munición.png`: lectura de planes de ataque y munición.
- `Aeródromos y puertos 1.pdf`, `Aeródromos y puertos 2.pdf`: sin transcribir todavía. Revisadas por primera vez el 2026-09-27 (Fase 2, ver `development_status.md`): no son solo apoyo visual — `Aeródromos y puertos 1.pdf` (17 páginas) contiene las fichas de seguimiento físico de cada puerto (munición/combustible disponible, nivel, buques en dique, área de carga del ejército) y `Aeródromos y puertos 2.pdf` (15 páginas) las de cada aeródromo (salidas disponibles, nivel, capacidad de baja altitud, tablero de reacondicionamiento/aterrizaje, casillas de misión Superioridad Aérea/A Demanda/Ataque Aéreo/Aerotransporte/Especial) más las cartas de "Capacidad de Mando" (C4I) por país y dominio (Conjunto/Aéreo/Terrestre/Superficie). Quedan pendientes de transcribir a `data/` cuando se aborde el modelo real de unidades/mando.
- escenarios `.docx`: ejemplos y contenido contextual de uso de reglas.
- `Mejoras y ajustes de TCW.txt`: correcciones de diseño y ajustes de UX aportadas por el mantenedor tras el cierre de la Fase 3 (roadmap.md), ya incorporadas a este documento (§4, §9) — no es una fuente de reglas de juego, es la referencia de los requisitos de diseño que se listan en esas secciones.

### Regla de precedencia

Cuando haya discrepancias:

1. No corregir silenciosamente una fuente con otra.
2. Registrar la discrepancia en `docs/rules/known-ambiguities.md` o equivalente.
3. Mantener la implementación bloqueada o marcada como `needs_review` si la diferencia afecta al cálculo.
4. Si el proyecto define una fuente canónica explícita posteriormente, actualizar esta sección.

---

## 3. Alcance funcional objetivo

La aplicación debe soportar dos modos complementarios:

### 3.1. Modo Turno guiado

El nombre «Turno guiado» significa que la aplicación ofrece contexto y ayuda dentro de la hoja de turnos; no significa que imponga una secuencia de ejecución. Debe permitir consultar o utilizar directamente cualquier fase o subfase, con independencia de lo visitado, terminado u omitido anteriormente. El seguimiento de progreso es opcional e informativo.

Cada subfase debe incluir:

- nombre y posición dentro del turno;
- texto explicativo breve;
- acciones permitidas;
- misiones relevantes;
- accesos a resolución de combate/reacción cuando corresponda;
- accesos contextuales a reglas, tablas y ayudas;
- botones `Terminar subfase` y, cuando tenga sentido, `Terminar fase`, entendidos como marcas voluntarias de seguimiento y no como requisitos para desbloquear otras partes.

Reglas de libertad de uso:

- ninguna fase o subfase se bloquea por no haber completado otra anterior;
- no existe la obligación de mantener una única «fase actual»;
- no se debe pedir confirmación ni registrar una anomalía únicamente porque una acción se realice fuera del orden impreso;
- una fase puede marcarse como terminada aunque no se hayan visitado todas sus subfases; las subfases no visitadas no son por sí solas trabajo pendiente ni un error;
- sí debe advertirse antes de descartar datos introducidos o cerrar una resolución activa vinculada, porque eso protege trabajo del usuario y no impone el orden del juego;
- el usuario puede emplear el turno como índice, checklist parcial o guía completa, según lo que necesite en cada partida.

La estructura general de campaña debe modelar, como mínimo:

- **Fase de acciones aéreas**: planificación de misiones, mantenimiento de alerta aérea, recuperación de misiones largas, preparación/integración en aeródromo, operaciones/salidas de combate, y recuperación de misiones cortas. La subfase de preparación/integración en aeródromo debe apoyarse visualmente con las imágenes de `Aeródromos y puertos 1.pdf`/`Aeródromos y puertos 2.pdf` (ya en el repositorio, sin transcribir todavía) cuando se construya.
- **Fase de acciones de superficie**: reorganización de formaciones, combate naval de superficie y operaciones logísticas de transporte.
- **Fase de acciones terrestres**: despliegue de aviación del ejército, maniobras terrestres, combate terrestre, ataques terrestres y reorganización terrestre.
- **Fase de acciones submarinas**: búsqueda rutinaria, combate submarino y operaciones logísticas de transporte.

Las fases estratégicas/opcionales y las reglas de refuerzos/recuperación de mando deben poder incorporarse sin rediseñar el motor.

### 3.1.1. Secuencia canónica del turno y ayudas contextuales

Política permanente (origen: `ajustes_de_turno.md`, Fase 23), con los nombres y rutas reales:

1. **Secuencia canónica:** una **banda de dos días** (14 bandas de la hoja) con tres fases por día (mañana, tarde y noche: seis fases de campaña por banda) y, en cada fase, los segmentos `Refuerzos → Aire I → Superficie → Aire II → Tierra (solo si corresponde) → Submarino`. La única fuente es `data/phases/turn-template.json` (esquema v4); la lógica pura está en `public/js/turn-model.js` y la ayuda de «Secuencia de turno y fases» se **genera** desde ese modelo (`TurnModel.buildSequenceHelp`): nunca se mantiene a mano una segunda copia.
2. **Tierra:** la 2.ª y la 5.ª fase no tienen segmento terrestre. Las letras A/B/C/D de la hoja son el **Nivel de Reacción** (Iniciativa) de las unidades terrestres móviles que pueden activarse: A, B, C en la 1.ª; A, B en la 3.ª; A, B, C, D en la 4.ª (con «Combate cercano»); solo A en la 6.ª. Las letras salen del modelo, nunca de la vista; la lectura de las definiciones literales de 8.3.1 sigue `needs_review` (`docs/rules/known-ambiguities.md`).
3. **Fase 0 (Estrategia)** se ejecuta una vez por banda. Los resaltados de las bandas 4, 8 y 12 de la hoja son informativos.
4. **Recuperación de Mando** (al principio de cada día, antes de Refuerzos de la fase de mañana) y **Refuerzos** (fase adicional al principio de cada fase de campaña, antes de Aire I) son nodos consultables y no bloqueantes. **No existe** «Restablecimiento de capacidades» como paso de cada fase aérea.
5. **Progreso y resoluciones por instancia** (`public/js/turn-progress-engine.js`, esquema v4): cada nodo tiene un ID estable (`phase-1/air-2/<subfase>`); Aire I y Aire II comparten contenido pero no estado (salvo que Aire I termina con la subfase opcional «Parálisis»: recordatorio de retirar la Parálisis de Red, regla opcional de ciberataque 14.4.1). Terminado, omitido y visitado son marcas voluntarias e independientes. Las resoluciones y los borradores de wizard quedan ligados al nodo exacto donde se abrieron y el wizard muestra y guarda su origen (banda, día, fase, segmento y subfase). El progreso anterior se migra de forma conservadora (nunca se reparte una «campaña» antigua entre las seis fases).
6. **Ayuda visual declarativa:** toda mención a una entidad con imágenes (aeródromo, puerto, C4I, unidades aéreas/terrestres/de superficie/submarinas/de baja altitud, planes de ataque, munición) es un `entityRef` con IDs estables, resuelto contra `data/visual-help/entities.json` y abierto en el **panel lateral** (`public/js/views/visual-help-panel.js`) sin cambiar de ruta ni perder el contexto. Los textos del turno marcan la mención con `[[id]]` y declaran su `entityRefs`; nunca se infiere la imagen por coincidencia de texto.
7. **Selección por contexto** (`public/js/visual-help-engine.js`): entidad concreta → esa plantilla; tipo restringido → solo las plantillas de su subconjunto; referencia genérica → **todos** los tipos del dominio, marcados como ejemplo genérico; contexto insuficiente → selector completo declarado como tal. Nunca se elige el primer ejemplo disponible.
8. **Wizards:** un campo numérico declara el ID estable de su ayuda (`makeNumberField(..., { visualRef })`, atributo `data-visual-ref`; nunca se localiza por el texto de la etiqueta) y esa entrada de `data/rules/wizard-visual-refs.json` declara su `entityRef`; el campo abre el mismo panel con el factor ya resaltado en todas las fichas compatibles; si ninguna lo tiene, el panel dice «ayuda visual pendiente» y no dibuja una zona aproximada.
9. **Imágenes, coordenadas, fuentes y estados de revisión** siguen §9.6. Ninguna ayuda visual calcula valores a partir de píxeles ni sustituye los datos estructurados.
10. **Fuentes por nivel:** banda, día, fase, segmento, subfase y nodo consultable tienen `sourceRefs` propios (documento registrado en `data/sources/sources.json`, sección, página y `status` `verified`/`needs_review` con nota cuando es pendiente), visibles en el bloque plegable «Fuentes y trazabilidad». Las decisiones del mantenedor sin documento se registran como la fuente «Indicación del mantenedor».
11. **Workflows por segmento:** cada subfase declara sus `relatedWorkflowIds` y `wizardLinks`; las páginas de segmento muestran la unión de los de sus subfases, nunca una lista vacía si les corresponde algún combate.

### 3.2. Modo Consulta rápida

Desde cualquier pantalla principal debe poder abrirse un menú de ayuda con:

- Secuencia de turno y fases.
- Detección.
- Combate por tipo.
- Tablas.
- Planes de ataque y municiones.
- Leyenda de counters/fichas.
- Reglas o extractos explicativos.

La consulta rápida no debe alterar el estado del turno guiado salvo que el usuario confirme expresamente que quiere iniciar una resolución desde ella.

---

## 4. Arquitectura técnica obligatoria

La aplicación será una **aplicación web alojable en un servidor**. El stack base del proyecto queda fijado a:

- **HTML** para la estructura de la interfaz web.
- **JavaScript** para la lógica de cliente y servidor. No introducir TypeScript salvo decisión explícita posterior del mantenedor.
- **Node.js** para el servidor, herramientas de desarrollo, tests y cualquier API necesaria. **Única excepción (herramienta de desarrollo, nunca de ejecución):** los calibradores de imágenes de `scripts/image-hotspots/` usan Python 3.12 + OpenCV con versiones fijadas, lanzados sin instalación global con `uv` (comando exacto en `scripts/image-hotspots/requirements.txt`). Ni el servidor ni el cliente ni los tests de Node dependen de Python: los resultados se versionan como JSON en `data/image-hotspots/`.
- El proyecto debe poder arrancarse mediante Node.js y desplegarse en un servidor convencional sin depender de un entorno de escritorio.
- **Dispositivo objetivo prioritario:** tablet en **modo horizontal (landscape)**. La interfaz, navegación, tablas, formularios, botones, diálogos y flujos guiados deben diseñarse y probarse primero para este formato de uso.
- El diseño debe ser responsive, pero la experiencia de tablet horizontal prevalece sobre móvil o escritorio cuando exista un conflicto de diseño. Evitar interacciones dependientes de `hover`; todos los controles principales deben ser cómodos para entrada táctil y no deben exigir precisión de ratón.
- Las tablas y ayudas deben aprovechar el ancho disponible en landscape y evitar, siempre que sea razonable, desplazamientos horizontales innecesarios. Los elementos esenciales de una resolución deben permanecer visibles o ser accesibles con el mínimo cambio de contexto.
- **Ampliaciones/tooltips en imágenes de apoyo (iconos, fichas/counters, recortes de plan de ataque, etc.):** en dispositivos con puntero pueden mostrarse al pasar el ratón por encima (`hover`), pero esto es una mejora progresiva, nunca el único mecanismo — en pantallas táctiles el mismo contenido debe poder mostrarse/ocultarse con un toque (tap) sobre el elemento, manteniendo el requisito de no depender de hover en tablet.
- **Botón "volver arriba"** visible en pantallas largas (ayudas, tablas, wizard), para no obligar a desplazarse manualmente hasta el principio.
- **Fondo de la aplicación:** usar como fondo general el logotipo del juego (`thecomingwave.png`, ya incluido en el repositorio) difuminado lo suficiente para no interferir con la lectura del contenido en primer plano, con un efecto de scroll paralaje sutil (el fondo se desplaza más lento que el contenido al hacer scroll).

La arquitectura debe separar, como mínimo, `public/` o equivalente para los recursos web, código JavaScript de cliente, código Node.js de servidor y un directorio `data/` para los datos fijos del juego. No imponer un framework de frontend o backend si todavía no ha sido elegido; cualquier incorporación debe justificarse por una necesidad concreta y registrarse en `development_status.md`.

### 4.1. Persistencia de datos fijos

Las tablas de resultados, tablas de modificadores, rutas de selección, valores y demás información fija de TCW **no se almacenarán en una base de datos**. Se guardarán en **archivos de texto dentro del repositorio**, de forma que puedan revisarse, compararse con Git y editarse sin tocar la lógica.

Para datos estructurados se recomienda **JSON** por ser texto nativo y consumible directamente desde JavaScript/Node.js. TXT o Markdown pueden utilizarse para contenido explicativo cuando no sea necesario procesarlo como estructura. Evitar formatos binarios como fuente de datos de ejecución.

Ejemplo de organización:

```text
data/
  tables/
  modifiers/
  routing/
  phases/
  ammunition/
  detection/
  sources/
```

Reglas obligatorias:

- No hardcodear en JavaScript los valores de una tabla fija o de un modificador fijo.
- Cada archivo de datos debe tener identificadores estables y referencias a la fuente TCW correspondiente.
- El servidor o el cliente cargarán estos archivos y el motor genérico interpretará sus valores.
- Los tests deben validar formato, rangos, referencias e integridad de estos archivos.
- Los cambios de datos deben quedar visibles en Git y documentados en `development_status.md` cuando formen parte de una tarea.

## 5. Arquitectura funcional recomendada

Mantener separados cuatro conceptos:

### 4.1. Contenido (`content`)

Textos, explicaciones, referencias, imágenes y ayudas.

Ejemplo conceptual:

```ts
interface HelpArticle {
  id: string;
  title: string;
  summary: string;
  body: string;
  sourceRefs: SourceRef[];
  relatedRuleIds: string[];
  relatedTableIds: string[];
}
```

### 4.2. Reglas declarativas (`rules`)

Condiciones, preguntas, modificadores y transiciones del asistente.

```ts
interface RuleStep {
  id: string;
  question?: string;
  inputType?: 'boolean' | 'number' | 'single-choice' | 'multi-choice';
  options?: RuleOption[];
  effects?: RuleEffect[];
  next?: Transition[];
  sourceRefs: SourceRef[];
}
```

### 4.3. Tablas (`tables`)

Representar las tablas de forma estructurada, no como imágenes utilizadas para calcular.

```ts
interface CombatTable {
  id: string;
  title: string;
  rowAxis: AxisDefinition;
  columnAxis: AxisDefinition;
  cells: TableCell[][];
  modifiers?: ModifierDefinition[];
  notes?: string[];
  sourceRefs: SourceRef[];
}
```

Las imágenes de tablas pueden mostrarse como apoyo visual, pero el cálculo debe usar datos estructurados validados.

### 4.4. Estado de sesión (`session`)

Estado mutable de una partida/consulta:

```ts
interface SessionState {
  turn?: number;
  dayBand?: string;
  phaseId?: string;
  subphaseId?: string;
  side?: string;
  pendingResolution?: ResolutionState;
  history: HistoryEvent[];
}
```

No mezclar reglas permanentes con estado de sesión.

---

## 6. Modelo de navegación y seguimiento de fases

Modelar la estructura del turno de forma declarativa, como una jerarquía o grafo navegable, y no como una cadena de pantallas codificada manualmente. El modelo puede conservar orden, relaciones y progreso para orientar al usuario, pero no debe convertirse en una máquina de estados restrictiva.

Cada nodo debe tener al menos:

```ts
interface PhaseNode {
  id: string;
  kind: 'phase' | 'subphase' | 'segment';
  title: string;
  description: string;
  actions: ActionDefinition[];
  children?: string[];
  next?: string[];
  canFinishEarly?: boolean;
  sourceRefs: SourceRef[];
}
```

Requisitos:

- permitir abrir directamente cualquier nodo;
- permitir mostrar el orden recomendado y ofrecer accesos al nodo anterior o siguiente como atajos opcionales;
- permitir volver al anterior sin corromper la sesión;
- soportar `Terminar subfase`;
- soportar `Terminar fase` sin exigir que todas sus subfases se hayan visitado o completado;
- confirmar únicamente cuando la acción pueda descartar datos o dejar una resolución activa sin guardar, no por apartarse del orden de la hoja;
- conservar, cuando el usuario decida usarlo, progreso independiente por banda y por instancia de nodo (día, fase, segmento y subfase; ver §3.1.1);
- no requerir un único nodo o fase actual para navegar, consultar o iniciar una resolución;
- registrar saltos u omisiones solo cuando el usuario los marque expresamente, nunca inferirlos por haber abierto otra fase;
- admitir fases opcionales y recorridos parciales sin tratarlos como sesiones incompletas o erróneas.

---

## 7. Motor de resolución de combate

### 6.1. Principio general

La resolución debe funcionar como un **wizard determinista**:

1. identificar qué se ataca;
2. identificar origen/plataforma del ataque;
3. identificar tipo de ataque/munición;
4. comprobar elegibilidad y detección;
5. preguntar solo los modificadores aplicables;
6. seleccionar la tabla y columna/fila adecuadas;
7. solicitar o generar la tirada según la configuración del producto;
8. mostrar el resultado de la tabla;
9. aplicar/explicar modificadores posteriores;
10. explicar la asignación de impactos/bajas/daños;
11. cerrar la resolución con un resumen auditable.

### 6.2. Mapa inicial de selección de tabla

Implementar el mapa de `Mapa de uso de tablas(1).txt` como árbol de decisión estructurado. Debe cubrir, como mínimo:

- objetivo terrestre;
- objetivo aéreo/baja altura;
- objetivo de superficie;
- objetivo submarino;
- acciones estratégicas;
- ataque cercano o lejano;
- guiado, no guiado, antirradiación y torpedos;
- defensa de área, interceptación final e interceptación de munición;
- BVR/WVR;
- ASW aéreo, de superficie y submarino.

Nunca seleccionar una tabla por texto libre si existe una ruta declarativa disponible.

### 6.3. Combate y reacción

Cuando una misión permita **combate** o genere/admita **reacción**, presentar ambas posibilidades según las reglas.

Las reacciones terrestres que deben ser modelables incluyen al menos:

- guerra contrabatería / Counter-Fire (CF);
- interdicción de batalla (BAI);
- persecución aérea (KB);
- ataque de contrafuegos / Anti-Fire Strike (AS).

No asumir que una reacción está disponible: validar las condiciones antes de mostrarla como acción ejecutable.

### 6.4. Modificadores

Cada modificador debe ser una entidad con:

- identificador;
- nombre visible;
- condición de aplicabilidad;
- pregunta asociada si requiere entrada del usuario;
- efecto matemático o de columna;
- orden de aplicación;
- explicación de negocio;
- referencia de fuente.

Ejemplo:

```ts
interface AppliedModifier {
  modifierId: string;
  label: string;
  value: number | string;
  reason: string;
  sourceRefs: SourceRef[];
}
```

El resultado final debe enseñar siempre una lista tipo:

- Valor base: X
- Modificador A: -2 porque ...
- Modificador B: +1 porque ...
- Columna final: Y
- Tirada: Z
- Resultado: N impactos

### 6.5. Bajas, impactos y escolta EW

La aplicación debe separar:

- cálculo de impactos;
- absorción/asignación de impactos;
- conversión de impactos en daño/bajas;
- efectos especiales posteriores.

Los casos con **escolta electrónica (EW)** no deben resolverse con una regla genérica de reparto: cuando corresponda, la unidad EW puede tener prioridad en la absorción de impactos según la regla aplicable. Cualquier prioridad o excepción debe ser explícita y testeable.

---

## 8. Detección

La detección debe ser un módulo reutilizable por combate y por consulta rápida.

Estados mínimos:

- detectable;
- oculta;
- brevemente detectable;
- no expuesta;
- expuesta;
- expuesta electrónicamente;
- expuesta continuamente cuando proceda.

El módulo debe permitir consultar o resolver:

- detección aérea;
- detección naval/superficie;
- detección terrestre;
- detección de baja altitud;
- detección electrónica/ESM.

La aplicación debe distinguir **detectable** de **expuesta/detectada** si la fuente lo hace, y debe conservar una nota de terminología cuando la traducción use ambos términos de forma intercambiable.

---

## 9. Planes de ataque y munición

El lector/ayuda de planes de ataque debe explicar visualmente:

- número/letra del plan;
- nombre de munición;
- tipo de munición;
- alcance;
- valor de ataque/carga según corresponda;
- diferencias entre unidad completa y dañada;
- iconos especiales: alta penetración, ataque balístico, bombardeo a baja altura, contraataque a baja altura, antirradiación y ataque reforzado a instalaciones;
- familias CM, LF-CM y SUP.CM cuando se usen.

Tipos de munición mostrables al menos:

- no guiada;
- subsónica;
- supersónica;
- parabólica;
- espacio cercano;
- ligera.

No deducir valores numéricos a partir de una imagen en tiempo de ejecución. Transcribirlos a datos y validarlos.

- **Apoyo visual con el PDF de origen:** en la explicación de cada plan de ataque concreto debe mostrarse el recorte de ese plan tal como aparece en el PDF de Tablas de Armamento del país correspondiente (imagen de apoyo, nunca fuente del cálculo — los valores siguen viniendo de los datos ya transcritos y validados).
- Además del recorte por plan, la ayuda de munición de cada país debe permitir ver en pantalla las imágenes completas de todos sus planes de ataque tal y como aparecen en el PDF original, para quien prefiera consultar la hoja completa en vez de navegar plan a plan.

---

## 9. Requisitos de UX

### 9.1. Pantalla de subfase

Debe tener siempre una jerarquía clara:

1. `Turno / día / fase / subfase`.
2. Explicación breve.
3. Acciones posibles.
4. Misiones disponibles.
5. Reacciones o combates pendientes.
6. Accesos a ayuda contextual.
7. `Terminar subfase` / `Terminar fase`.

### 9.2. Wizard de combate

- Una pregunta principal por paso.
- Mostrar progreso (`3 de 8`, por ejemplo).
- Permitir volver atrás conservando respuestas compatibles.
- Si cambiar una respuesta invalida pasos posteriores, descartarlos de forma explícita.
- Antes de resolver, enseñar un resumen de entradas.
- En el resultado, resaltar visualmente la **fila/columna/celda** usada.
- Mostrar debajo una explicación textual del cálculo.
- **Identificación visual de cada valor solicitado:** cuando el wizard pida un dato que se lee de una ficha, tabla o plan de ataque (p.ej. "Valor Electrónico", "Firma aérea"), debe poder mostrarse un recorte de la fuente que ayude a identificar visualmente dónde y cómo se lee ese valor, no solo el texto de la pregunta.
- **Acceso a las tablas relacionadas:** todo wizard debe dar acceso directo, sin salir del flujo, a las páginas de `data/tables/` relacionadas con ese tipo de ataque (mismo mecanismo que el enlace cruzado ya existente entre "Combate por tipo" y "Tablas").

### 9.3. Tablas

La vista de tabla debe poder:

- resaltar la columna seleccionada;
- resaltar la fila/tirada seleccionada;
- resaltar la celda final;
- mostrar notas y excepciones vinculadas;
- funcionar en móvil sin exigir zoom de navegador cuando sea razonable.
- **Cabeceras desproporcionadas:** cuando la cabecera de una tabla ocupe visualmente mucho más espacio que sus filas de datos, debe reformatearse (p.ej. repartiendo el texto en 2-3 líneas) para reducir su altura relativa en vez de dejarla dominar la pantalla.

### 9.4. Ayuda de fichas/counters

- Cuando el sistema (wizard, ayuda o cualquier otra pantalla) pida un dato que se lee de un factor concreto de una ficha, debe mostrarse la imagen de esa ficha con un **recuadro rojo** señalando exactamente el factor que hay que leer, en vez de solo describirlo por texto.
- En la leyenda de counters (`Ayuda rápida > Leyenda de counters / fichas`), la explicación de cada factor debe poder mostrarse anclada a su posición sobre la imagen de la ficha (tooltip en dispositivos con puntero; toque para mostrar/ocultar en pantallas táctiles — ver la nota de hover/touch en AGENTS.md §4), no solo como lista de texto aparte.

### 9.5. Iconos

- En la leyenda de iconos de ataque/munición, cada icono debe poder ampliarse (zoom) al pasar el ratón por encima en dispositivos con puntero, y al tocarlo en pantallas táctiles (ver AGENTS.md §4).

### 9.6. Ayudas sobre imágenes (hotspots)

Política permanente para **toda imagen con varias zonas explicativas**, existente o futura (fichas, tarjetas de aeródromo/puerto/mando, planes de ataque, hojas de ayuda). Origen: `ajuste_imagenes.md` (Fase 22).

- **Componente único:** `public/js/image-hotspot-viewer.js` (`ImageHotspotViewer.create`). Imagen + capa SVG con el mismo `viewBox`; no conoce reglas de counters, puertos ni planes. Las vistas no crean coordenadas con constantes de JavaScript: toda zona procede de datos.
- **Datos separados en dos capas** (`data/image-hotspots/`): **geometría** por instancia (`counters.json`, `boards.json`, `ammo-plans.json`; rectángulos o polígonos normalizados entre 0 y 1, con `sha256` y dimensiones de la imagen, `confidence` y `reviewStatus`) y **semántica** reutilizable por concepto (`concepts.json`, `board-concepts.json`: nombre, resumen, fuente y estado). En los planes de ataque el texto de cada zona se construye con los datos validados de `data/ammunition/`: la imagen solo aporta la posición.
- **Estados de revisión:** `generated`, `needs_review`, `verified`, `rejected`. Un calibrador nunca produce `verified`; lo marca la revisión del mantenedor mediante un perfil versionado (`profiles/*-review.json`, con `reviewedBy`/`reviewedAt`). Una zona sin geometría fiable se declara `needs_review` o queda fuera con su motivo (`unmatched`); **nunca se aproxima una zona como si estuviera calibrada**. Posición verificada y texto de uso pendiente son estados distintos y el visor muestra el más débil.
- **Calibración reproducible y offline:** `scripts/image-hotspots/` (fichas con segmentación + ajuste humano, tarjetas con SIFT + RANSAC sobre perfiles, planes con rejilla validada). Cada ejecución genera imágenes de control en `docs/image-hotspots/review/` que hay que revisar a ojo antes de dar nada por bueno.
- **Accesibilidad y táctil:** cada zona es un control con foco (Tab, Enter/Espacio, Escape), área táctil mínima de 48×48 px aunque el borde visible sea menor, lista textual espejo (plegable si hay muchas zonas) y el mismo contenido con puntero, foco y toque; el hover es mejora progresiva. Una sola zona activa; el recuadro de explicación no se superpone a la imagen (lateral o acoplado debajo).
- **Wizards:** un campo que se lee de una imagen declara en `data/rules/wizard-visual-refs.json` la ficha/tarjeta y la zona (`templateId`+`factor`, o `boardType`+`hotspotId`); si la equivalencia con una zona impresa no está validada, se enseña el elemento sin zona preseleccionada.
- **Toda imagen nueva** debe incluir en la misma funcionalidad su calibración, conceptos, fuentes, pruebas de datos (hash, rangos, conceptos existentes, ningún `verified` sin revisión) y evidencia QA; si aún no la tiene, queda como ayuda visual no interactiva pendiente.

---

## 10. Persistencia e historial

El historial de una sesión debe ser reproducible y legible:

```ts
interface HistoryEvent {
  id: string;
  timestamp: string;
  type: 'navigation' | 'answer' | 'modifier' | 'roll' | 'result' | 'finish';
  payload: Record<string, unknown>;
}
```

Para un combate finalizado, conservar al menos:

- tipo de combate;
- atacante/objetivo si se introdujeron;
- respuestas del wizard;
- modificadores aplicados;
- tabla y coordenadas utilizadas;
- tirada;
- resultado;
- explicación de bajas/daño.

No guardar datos que el usuario no necesite para la sesión o historial funcional.

---

## 11. Convenciones de implementación

Estas reglas son obligatorias salvo que el repositorio existente establezca otras:

- Usar nombres de dominio en español o inglés de forma consistente; no mezclar ambos arbitrariamente.
- IDs internos estables, en `kebab-case` o la convención ya existente.
- Evitar números mágicos de reglas en componentes UI.
- Todo cálculo de reglas debe estar en servicios/módulos de dominio, no en componentes visuales.
- Todo contenido transcrito debe incluir `sourceRefs`.
- No introducir una regla sin test y fuente.
- Preferir funciones puras para resolución y modificadores.
- Mantener la UI independiente del origen físico de los datos.

---

## 13. Testing

### 12.1. Unit tests

Obligatorios para:

- selección de tabla;
- cada modificador;
- cambio de columna;
- límites/caps de valores;
- interpretación de tiradas;
- asignación de impactos y bajas;
- reglas especiales de EW;
- persistencia y actualización independiente del progreso de fase/subfase;
- acceso y finalización de fases/subfases en cualquier orden, sin prerrequisitos artificiales;
- protección de resoluciones activas o datos introducidos al cerrar una fase/subfase.

### 12.2. Golden tests / casos de ejemplo

Convertir las hojas de ayuda existentes en casos reproducibles. En particular, el ejemplo de ataque guiado contra unidades de superficie debe convertirse en un escenario de test de extremo a extremo donde cada paso esperado quede fijado.

### 12.3. Tests de contenido

Crear validaciones que detecten:

- tablas con celdas vacías inesperadas;
- IDs duplicados;
- referencias a reglas/tablas inexistentes;
- modificadores sin fuente;
- nodos de fase sin salida;
- rutas del mapa de tablas que no terminan en una resolución.

---

## 13. Definición de terminado (Definition of Done)

Una funcionalidad de reglas solo se considera terminada cuando:

- está soportada por una fuente del proyecto;
- la regla está representada en datos o dominio, no solo en UI;
- existen tests del camino normal y de excepciones relevantes;
- el resultado explica los modificadores aplicados;
- la tabla se muestra con la selección resaltada cuando corresponda;
- el usuario puede volver atrás sin perder la coherencia;
- el usuario puede salir/cancelar de forma segura;
- la funcionalidad es usable en el flujo guiado y enlazable desde consulta rápida cuando proceda.

---

## 14. Política para agentes de código

Antes de modificar reglas:

1. Identificar la fuente concreta.
2. Localizar la sección o tabla exacta.
3. Comprobar si ya existe un modelo de datos equivalente.
4. Implementar primero datos/dominio.
5. Añadir tests.
6. Integrar la UI.
7. Añadir explicación y referencias.

Nunca:

- inventar valores faltantes;
- aproximar una tabla ilegible;
- usar OCR/transcripción dudosa como dato canónico sin revisión;
- cambiar una regla porque “parece más lógica”;
- mezclar reglas básicas y de expansión sin indicarlo;
- ocultar al usuario qué modificadores se han aplicado.

Si una fuente es ambigua, crear un TODO explícito y bloquear el cálculo afectado con un mensaje de contenido pendiente de validar.

---

## 17. Primer objetivo de producto

El primer incremento usable debe permitir:

1. abrir la plantilla de dos días;
2. entrar en una fase/subfase;
3. leer su explicación y acciones;
4. iniciar una misión/combate soportado;
5. responder un wizard de modificadores;
6. llegar a una tabla estructurada;
7. ver columna/fila/celda resaltadas;
8. obtener una explicación de impactos/bajas;
9. volver a la subfase;
10. terminar subfase o fase;
11. abrir en cualquier momento ayudas de detección, counters, munición y tablas.


---

## 18. Seguimiento del desarrollo con `development_status.md` y Git

El repositorio puede y, salvo indicación contraria del mantenedor, **debe utilizar `development_status.md` como registro operativo del estado del desarrollo**. Este archivo complementa el historial de Git: Git conserva qué cambió en el código; `development_status.md` explica qué se hizo, por qué, qué se validó y cuál es el siguiente paso.

### 18.1. Objetivo

`development_status.md` debe permitir que cualquier agente o desarrollador retome el trabajo sin reconstruir el contexto únicamente a partir de commits, issues o conversaciones previas.

Debe registrar, como mínimo:

- fecha de la actualización;
- rama de Git activa, cuando sea relevante;
- objetivo o tarea abordada;
- estado: `pending`, `in_progress`, `blocked`, `done` o equivalente;
- cambios realizados y archivos principales afectados;
- reglas, tablas o fuentes TCW utilizadas;
- tests ejecutados y resultado;
- decisiones técnicas relevantes;
- dudas, ambigüedades o bloqueos pendientes;
- siguiente paso recomendado;
- commit, PR o issue relacionado, si existe;
- **si el paso es observable en la aplicación web** (algo que cambie lo que se ve o se puede hacer en `public/`, no solo un archivo de datos en `data/`) y, si lo es, **cómo comprobarlo** (URL/ruta, pantalla, acción a realizar). Si el paso es puramente de datos/backend sin efecto visible todavía, decirlo explícitamente en vez de dejarlo implícito, para que quien retome el trabajo no tenga que arrancar el servidor para averiguarlo.

### 18.2. Flujo obligatorio para agentes

Antes de comenzar una tarea de desarrollo:

1. Revisar `AGENTS.md`, `roadmap.md` y `development_status.md` si existe.
2. Revisar el estado de Git (`status`, rama actual y cambios locales) antes de modificar archivos.
3. No sobrescribir ni descartar cambios locales ajenos a la tarea.
4. Identificar el punto del roadmap y las fuentes de reglas relacionadas.

Durante el trabajo:

1. Mantener los cambios acotados a la tarea actual.
2. Usar Git para inspeccionar diferencias y comprobar qué archivos se han modificado.
3. Ejecutar los tests o validaciones pertinentes antes de considerar completado un paso.
4. Si aparece un bloqueo o una ambigüedad de reglas, registrarlo en `development_status.md` aunque la tarea no pueda finalizarse.

Al finalizar un paso significativo:

1. Actualizar `development_status.md` en el mismo conjunto de cambios.
2. Indicar claramente qué quedó terminado y qué continúa pendiente.
3. Registrar los tests/validaciones realmente ejecutados; no afirmar que un test pasó si no se ejecutó.
4. Relacionar la actualización con el commit/PR/issue cuando esa información esté disponible.
5. Comprobar `git diff` y `git status` para evitar archivos accidentales o cambios no documentados.
6. **Indicar si el paso se puede observar en la web y cómo**: si toca `public/` (HTML/CSS/JS de cliente) o cambia una respuesta del servidor, decir qué URL/pantalla abrir y qué mirar para verlo (arrancando `npm start` si hace falta). Si el paso es solo un archivo de `data/` todavía no conectado a la interfaz, decirlo explícitamente ("no visible en la web todavía: falta conectar este JSON a `public/js/app.js`") en vez de dejar que se asuma.

### 18.3. Formato recomendado

Mantener una sección inicial de estado actual y un historial breve de hitos. Por ejemplo:

```md
# Development Status

## Estado actual

- Fecha: YYYY-MM-DD
- Rama: feature/...
- Roadmap: Fase X / tarea Y
- Estado: in_progress
- Objetivo: ...

### Cambios realizados
- ...

### Fuentes TCW utilizadas
- Regla/sección/tabla: ...

### Validación
- `npm test ...`: OK
- `npm run lint`: OK

### Visible en la web
- Sí/No, y si es sí: qué URL/pantalla abrir y qué se ve. Si es no, decir qué falta conectar.

### Pendiente / bloqueos
- ...

### Siguiente paso
- ...

### Git
- Commit: `<hash>` si existe
- PR/Issue: `#...` si existe

## Historial

### YYYY-MM-DD — Hito o tarea
- Resumen breve del cambio y resultado.
```

No convertir `development_status.md` en una copia completa del changelog ni del historial de commits. Debe ser un **documento de continuidad de trabajo**, conciso pero suficiente para que otro agente conozca el estado real del proyecto.

### 18.4. Relación con Git

- Git es la fuente de verdad de los cambios de código y archivos.
- `development_status.md` es la fuente de verdad del **contexto operativo y progreso actual**.
- `roadmap.md` define qué se pretende construir y en qué orden.
- `AGENTS.md` define cómo deben trabajar los agentes.

Cuando exista discrepancia entre `development_status.md` y el repositorio, verificar primero el estado real mediante Git y corregir después `development_status.md`.

Los agentes pueden proponer commits y mensajes de commit claros y atómicos. **No deben hacer `commit`, `push`, rebase destructivo, reset destructivo, force-push ni modificar historia compartida salvo que el usuario lo solicite expresamente o el flujo del entorno lo autorice explícitamente.**
