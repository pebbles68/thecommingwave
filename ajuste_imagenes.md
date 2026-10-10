# Ajuste de ayudas sobre imágenes mediante hotspots y calibración OpenCV

Fecha de revisión: 2026-10-07  
Repositorio: `C:\Users\p.alvarez\thecommingwave`  
Objetivo: especificación funcional y técnica para que todas las imágenes explicativas dispongan de zonas interactivas precisas, comprensibles y accesibles.

## 1. Resultado de la revisión

El proyecto ya dispone de una primera implementación de zonas interactivas sobre las fichas/counters. Sin embargo, no existe todavía un sistema común aplicable a todas las imágenes y la precisión actual de las fichas se basa en sectores cualitativos amplios, no en la localización exacta de cada factor.

La situación actual es:

| Recurso | Cobertura actual | Carencia principal |
|---|---|---|
| Fichas/counters | 20 plantillas, 175 apariciones de factores y visor interactivo | Solo existen 16 cajas genéricas por posición (`top-left`, `bottom-center`, etc.); el tooltip muestra nombre y posición, pero no resume el uso del factor. |
| Aeródromos | 15 páginas PNG mostradas como galería | No hay identificación de cada aeródromo, zonas funcionales ni hotspots. Algunas páginas contienen además paneles C4I. |
| Puertos | 17 páginas PNG mostradas como galería | No hay identificación de cada puerto, campos, áreas operativas ni hotspots. |
| Mando/C4I | Incluido dentro de las páginas de aeródromos | No está inventariado como tipo de imagen independiente ni tiene zonas para Conjunto, Aéreo, Terrestre o Superficie. |
| Planes de ataque | 17 hojas y 198 recortes de unidad calibrados | El recorte identifica la unidad completa, pero no sus planes, munición, alcance, valor completo/dañado o iconos. |
| Iconos de munición | Zoom por hover/toque | Son imágenes individuales, no mapas con varias zonas. Deben reutilizar el mismo popover explicativo, pero no necesitan segmentación OpenCV. |
| Marcos/iconos de tablas ASW | Imágenes individuales | No necesitan mapa multizona; sí una explicación accesible coherente si actúan como ayuda visual. |

OpenCV no forma parte actualmente de las dependencias del repositorio y no existe un script reproducible de calibración. Las regiones de fichas y planes se midieron con rejillas y comprobaciones manuales. Ese trabajo debe conservarse como referencia, pero las coordenadas nuevas y las recalibraciones deberán salir de un proceso OpenCV versionado y terminar siempre en revisión humana.

## 2. Resultado funcional esperado

Toda imagen que explique más de un dato o área funcional debe usar un componente común de hotspots.

Al pasar el puntero, enfocar con teclado o tocar una zona debe aparecer, como mínimo:

1. **Nombre del factor o área**.
2. **Resumen breve de su utilización en el juego**.
3. Estado básico/expansión/opcional cuando proceda.
4. Referencia de fuente en una sección secundaria desplegable.

Los resúmenes deben proceder de una fuente ya transcrita. Si no existe fuente suficiente, el hotspot debe mostrar el nombre y «Uso pendiente de transcribir/validar», con estado `needs_review`, en lugar de inferir la regla.

## 3. Principios obligatorios

1. OpenCV se usa **offline durante el desarrollo** para detectar, enderezar y calibrar regiones. El navegador nunca debe analizar imágenes para calcular coordenadas.
2. La aplicación consume únicamente JSON versionado con coordenadas ya verificadas.
3. Una detección automática no se convierte en dato canónico sin revisión humana.
4. Las imágenes son ayuda visual; ningún valor del juego se obtiene de sus píxeles en tiempo de ejecución.
5. Hover es una mejora progresiva. Toque, teclado y lector de pantalla deben ofrecer el mismo contenido.
6. La geometría debe ser independiente del tamaño renderizado y funcionar en tablet horizontal, móvil y escritorio.
7. El hotspot debe explicar el área, no limitarse a repetir su posición.
8. Las zonas no pueden quedar hardcodeadas en JavaScript o CSS.
9. Este procedimiento será el estándar obligatorio para **todas las imágenes y todas las ayudas sobre imágenes**, tanto las existentes como las que se incorporen en el futuro. No se limitará a fichas, aeródromos, puertos, C4I o planes de ataque.

### Política permanente y actualización de `AGENTS.md`

Al implementar esta corrección, el desarrollador deberá incorporar en `AGENTS.md` una política permanente de ayudas visuales que establezca, como mínimo:

- toda imagen con más de una zona explicativa debe usar el componente común de hotspots;
- cada hotspot debe mostrar al menos el nombre de la zona/factor y un resumen verificado de su utilización;
- las coordenadas deben residir en datos declarativos versionados, nunca hardcodeadas en la vista;
- las regiones deben calibrarse con el procedimiento OpenCV definido en este documento y superar revisión humana antes de marcarse `verified`;
- ninguna regla o valor del juego puede deducirse de la imagen u OCR en tiempo de ejecución;
- hover, toque, teclado y lector de pantalla deben ofrecer información equivalente;
- cualquier imagen nueva debe incluir su calibración, conceptos, fuentes, pruebas y evidencia QA dentro de la misma funcionalidad que la introduce;
- si una imagen no dispone todavía de calibración o explicación validada, debe quedar como `needs_review` o ayuda visual no interactiva explícitamente pendiente, sin aproximar zonas.

La modificación de `AGENTS.md` **no forma parte de este análisis documental**: deberá realizarla el desarrollador junto con la implementación, cuando el componente común, el esquema y el proceso OpenCV existan y puedan describirse con sus nombres y rutas definitivos. No debe darse la tarea por terminada sin esa actualización.

## 4. Modificaciones necesarias

### IMG-001 — Crear un modelo declarativo común de hotspots

**Prioridad:** P1  
**Archivos afectados:** nuevos archivos bajo `data/image-hotspots/`, `public/js/core-visuals.js`, `public/js/core-data.js` y tests.

Actualmente `data/counters/factor-map.json` mezcla vocabulario, selección de recorte y 16 posiciones genéricas. `data/phases/source-images/index.json` solo enumera páginas y `data/ammunition/source-pages/unit-regions.json` solo localiza filas completas.

Se debe crear un modelo común, por ejemplo:

```json
{
  "schemaVersion": 1,
  "image": {
    "id": "aerodromos-page-01",
    "src": "data/phases/source-images/aerodromos/page-01.png",
    "width": 1242,
    "height": 1755,
    "sha256": "..."
  },
  "calibration": {
    "tool": "opencv",
    "toolVersion": "...",
    "profile": "airfield-sheet-v1",
    "generatedAt": "YYYY-MM-DD",
    "reviewStatus": "verified"
  },
  "instances": [
    {
      "id": "ru-vozvizhenka",
      "type": "airfield-card",
      "label": "Vozdvizhenka",
      "rect": { "x": 0.01, "y": 0.01, "width": 0.56, "height": 0.27 },
      "confidence": 0.98,
      "reviewStatus": "verified",
      "hotspots": [
        {
          "id": "launch-value",
          "conceptId": "airfield-launch-value",
          "rect": { "x": 0.02, "y": 0.42, "width": 0.13, "height": 0.08 },
          "confidence": 0.96,
          "reviewStatus": "verified"
        }
      ]
    }
  ]
}
```

Reglas del esquema:

- Las coordenadas se almacenan normalizadas entre 0 y 1 respecto de la imagen o de la instancia padre.
- `rect` es suficiente para hojas rectificadas. Debe admitirse opcionalmente `polygon` para una región irregular.
- Cada imagen incluye dimensiones y hash. Si cambia el archivo, el test invalida la calibración.
- Cada instancia y hotspot incluye `confidence` y `reviewStatus` (`generated`, `needs_review`, `verified`, `rejected`).
- `label`, `summary`, `sourceRefs`, estado básico/expansión y estado de validación son datos; no texto incrustado en el componente.
- El vocabulario semántico se reutiliza entre imágenes repetidas. La geometría pertenece a la instancia; la explicación pertenece a un catálogo de conceptos.

**Criterio de aceptación:** ninguna vista crea coordenadas con constantes JavaScript; todas las zonas visibles proceden del esquema validado.

---

### IMG-002 — Sustituir las posiciones cualitativas de fichas por cajas exactas

**Prioridad:** P1  
**Archivos afectados:** `data/counters/factor-map.json`, datos nuevos de hotspots y `public/js/core-visuals.js`.

Estado actual: 20 plantillas, 175 apariciones de factores, 43 conceptos y solo 16 `positionBoxes` compartidas por todas las plantillas. Esas cajas cubren sectores amplios que pueden solaparse y no representan el rectángulo real del número, icono o leyenda.

Modificación requerida:

1. Detectar el recorte exacto de cada plantilla dentro de las dos hojas de counters.
2. Rectificar el recorte si tiene inclinación o perspectiva.
3. Detectar líneas guía, cajas, iconos y bloques de texto mediante contornos y morfología.
4. Asociar manualmente las regiones candidatas a los factores ya declarados.
5. Guardar geometría específica por `templateId + factor`, no geometría global por nombre de posición.
6. Mantener `position` solo como descripción humana opcional; dejar de usarla para dibujar.
7. Ampliar `factorVocabulary` con `label`, `summary`, `sourceRefs`, `status` y `aliases` cuando proceda.

**Criterios de aceptación:**

- Las 175 apariciones tienen una región propia o un estado `needs_review` explícito.
- El recuadro rodea el elemento real y no todo el cuadrante de la ficha.
- El tooltip contiene nombre y resumen de utilización.
- Los wizards que reutilizan `appendFactorIdentificationHint` reciben automáticamente la mejora.

---

### IMG-003 — Convertir las páginas de aeródromos en ayudas por tarjeta y zona

**Prioridad:** P1

Las 15 páginas pueden contener varias fichas de aeródromo y paneles de mando. No se deben superponer de golpe todos los campos porque la página quedaría ilegible.

Se requiere navegación en dos niveles:

1. **Nivel página:** hotspot por cada ficha de aeródromo o panel C4I. Al pasar/focalizar muestra nombre y tipo; al activar abre o amplía esa tarjeta.
2. **Nivel tarjeta:** hotspots de sus áreas funcionales y factores.

Inventario mínimo de zonas a calibrar, sujeto a validación de fuente:

- nombre, código, ubicación, coordenadas y mapa;
- valor de salidas/lanzamiento;
- nivel;
- capacidad de baja altitud;
- preparación/reorganización;
- valor electrónico;
- protección;
- capacidad/hangares;
- reparación;
- salida de emergencia;
- Superioridad Aérea;
- A Demanda;
- Ataque Aéreo;
- Lanzamientos/Aerotransporte;
- Transporte/Carga;
- Especial;
- área de aterrizaje/reacondicionamiento;
- área lista para salir.

No debe asumirse que todos los aeródromos tienen exactamente las mismas zonas ni que todas significan lo mismo. OpenCV propone regiones; el catálogo y la revisión humana determinan la semántica.

**Criterio de aceptación:** cada tarjeta de aeródromo visible en las 15 páginas puede seleccionarse y todas sus áreas verificadas muestran nombre, resumen y fuente.

---

### IMG-004 — Convertir las páginas de puertos en ayudas por tarjeta y zona

**Prioridad:** P1

Aplicar el mismo patrón de dos niveles a las 17 páginas de puertos.

Inventario mínimo de zonas a calibrar, sujeto a las fuentes:

- nombre, código, ubicación, coordenadas y mapa;
- munición disponible;
- combustible disponible;
- nivel;
- capacidad o reparación de flota;
- capacidad de buques;
- protección;
- valor electrónico;
- reparación;
- buques/flotas esperando órdenes en puerto;
- flota recién llegada;
- dique;
- área de carga del ejército.

Las descripciones deben distinguir entre un valor impreso y un área física de colocación. Por ejemplo, el tooltip de «Dique» explica el uso del área, mientras el de «Reparación» explica el factor numérico.

**Criterio de aceptación:** cada puerto puede abrirse como tarjeta rectificada; sus campos y áreas tienen hotspots precisos y accesibles.

---

### IMG-005 — Separar e inventariar los paneles HQ/C4I

**Prioridad:** P1

Los paneles de «Capacidad de Mando» aparecen mezclados con las fichas de aeródromo. Deben tratarse como instancias `command-card`, no como parte del último aeródromo de la página.

Zonas mínimas:

- capacidad general de mando del país;
- Conjunto;
- Aéreo;
- Terrestre;
- Superficie;
- valores numéricos asociados;
- textos de acciones/costes dentro de cada dominio.

El término «HQ» puede confundirse con nombres de sistemas como `HQ-9A`. El identificador interno debe usar `command-card` o `c4i-card`; no debe localizarse mediante una búsqueda textual genérica de «HQ».

La relación entre esos valores y costes de juego no está transcrita completamente. Hasta verificar las reglas, el hotspot mostrará el nombre impreso y un resumen marcado `needs_review`; no convertirá el valor en cálculo.

**Criterio de aceptación:** los paneles C4I de cada país están separados de los aeródromos y no afirman efectos no soportados por la fuente.

---

### IMG-006 — Añadir subzonas a los recortes de planes de ataque

**Prioridad:** P2

Las 198 regiones actuales identifican una unidad, pero el usuario no puede pasar por cada plan para saber qué representa.

OpenCV debe detectar dentro del recorte:

- identificación de unidad/modelo;
- letra o número del plan;
- nombre de munición;
- tipo de munición e iconos especiales;
- alcance;
- valor de ataque/carga;
- valor de unidad completa;
- valor de unidad dañada;
- cualquier nota o marcador especial transcrito.

La semántica debe enlazarse con los datos existentes de `data/ammunition/`; la imagen solo proporciona la posición. Si una hoja está rotada o tiene perspectiva, el script debe normalizarla antes de detectar subzonas y guardar la transformación usada.

**Criterio de aceptación:** en la ayuda de una unidad, cada plan visible se puede explorar y sus hotspots reflejan exactamente los datos estructurados de esa unidad.

---

### IMG-007 — Crear un componente único `ImageHotspotViewer`

**Prioridad:** P1  
**Archivos afectados:** nuevo módulo cliente, `core-visuals.js`, `core-widgets.js`, CSS e `index.html`.

El componente acepta imagen, instancias, hotspots, hotspot activo y callback de selección. No debe conocer reglas de counters, puertos o aeródromos.

Implementación recomendada:

- `<img>` real para conservar semántica, carga y proporción.
- Capa SVG con el mismo `viewBox` que las dimensiones naturales de la imagen.
- Cada zona rectangular se representa con `<rect rx="..." ry="...">` y un control accesible asociado.
- Popover posicionado respecto del hotspot, con la API Popover como mejora progresiva y fallback DOM.
- Lista textual espejo debajo de la imagen para navegación sin precisión espacial.
- Una sola zona activa. En toque permanece hasta tocar fuera, activar de nuevo o usar Escape.
- Soporte de `selectedHotspotId` para que un wizard abra la imagen con el factor solicitado resaltado.

Contenido mínimo:

```text
Protección
Resumen breve y verificado de su utilización.
Solo expansión                 (si procede)
Fuente y detalle ▸             (plegable)
```

No utilizar el atributo HTML `title` como única explicación.

**Criterio de aceptación:** el mismo componente renderiza una ficha, un aeródromo, un puerto, una tarjeta C4I y un plan de ataque sin ramas de dominio internas.

---

### IMG-008 — Reforzar bordes y redondear esquinas

**Prioridad:** P1  
**Archivos afectados:** `public/css/style.css`.

Definir tokens de diseño:

```css
--hotspot-color: #ff4d4f;
--hotspot-fill: rgba(255, 77, 79, 0.12);
--hotspot-border-width: 3px;
--hotspot-active-width: 4px;
--hotspot-radius: 10px;
--hotspot-focus: #7dd3fc;
```

Estados requeridos:

- **Reposo:** borde de 2–3 px visible sin ocultar el contenido.
- **Hover/foco:** borde de 3 px, relleno suave y sombra exterior.
- **Seleccionado:** borde de 4 px, relleno algo más intenso y prioridad sobre zonas solapadas.
- **`needs_review`:** estilo ámbar y trazo discontinuo; no usar rojo de error para una revisión pendiente.
- **Foco de teclado:** anillo de alto contraste independiente del color del hotspot.

Las esquinas deben tener un radio visual de 8–12 px. En SVG se aplicará `rx/ry`; en regiones HTML, `border-radius`. El relleno no debe impedir leer los valores impresos.

---

### IMG-009 — Proceso de calibración OpenCV reproducible

**Prioridad:** P1

Archivos nuevos recomendados:

```text
scripts/image-hotspots/
  calibrate.py
  detectors/
    counters.py
    airfields.py
    ports.py
    command_cards.py
    attack_plans.py
  profiles/
  render_review.py
  validate.py
  requirements.txt
data/image-hotspots/
docs/image-hotspots/review/
```

OpenCV no está instalado actualmente. Introducirlo como dependencia **solo de desarrollo**, preferentemente `opencv-python-headless` y `numpy` con versiones fijadas. La aplicación web seguirá funcionando únicamente con Node.js y JSON generado. Debido a que `AGENTS.md` establece Node.js para las herramientas, esta excepción solicitada expresamente debe documentarse en `development_status.md`; si se exige una cadena exclusivamente Node, se podrá sustituir el ejecutor por OpenCV.js bajo Node manteniendo el mismo esquema de salida.

Pipeline obligatorio:

1. **Verificación de entrada:** dimensiones, SHA-256 y rechazo si no coincide con el archivo esperado.
2. **Preprocesado:** escala de grises, CLAHE, reducción de ruido conservadora y umbral adaptativo/Otsu según perfil.
3. **Corrección geométrica:** inclinación mediante Hough Lines o `minAreaRect`, enderezado y homografía cuando exista perspectiva. Conservar la matriz de transformación.
4. **Detección de tarjetas:** morfología para líneas, `findContours`, `approxPolyDP` y filtros de área, relación de aspecto y rectangularidad.
5. **Detección interna:** rejillas por líneas y template matching para iconos/encabezados estables. OCR solo puede sugerir etiquetas, nunca ser fuente canónica.
6. **Generación de candidatos:** coordenadas normalizadas, confianza, perfil y estado `generated`.
7. **Revisión humana:** PNG de control con ID/borde/coordenadas; aceptar, ajustar o rechazar. Solo `verified` se muestra como ayuda definitiva.
8. **Validación:** límites, tamaños, duplicados, solapamientos, conceptos, fuentes, hash y dimensiones.

La ejecución debe ser determinista con la misma imagen y perfil. No debe depender de una interfaz gráfica manual para regenerar candidatos e imágenes de control.

---

### IMG-010 — Crear una cola de revisión visual

**Prioridad:** P2

Los escaneos contienen perspectiva, ruido, varios idiomas, fondos de color y diseños repetidos. OpenCV reduce el trabajo, pero no sustituye la revisión.

Cada ejecución debe producir:

- imagen original;
- imagen rectificada de cada tarjeta;
- imagen QA con zonas e IDs;
- JSON candidato;
- informe de confianza, solapamientos y zonas no detectadas.

La revisión registra `reviewedBy`, `reviewedAt` y `reviewNote`. No existe ninguna región `verified` sin imagen QA y hash de fuente.

## 5. Interacción y accesibilidad

### Puntero

- `mouseenter` abre el popover tras 100–200 ms para evitar parpadeo.
- Moverse entre hotspot y popover no debe cerrarlo accidentalmente.
- La zona conserva el resaltado mientras el popover esté abierto.

### Táctil

- Un toque abre y fija el popover; otro toque en la misma zona o fuera lo cierra.
- El área táctil mínima es 48×48 px, aunque el borde visual sea menor.
- Si el área ampliada provoca solapamientos, elegir la zona más cercana al toque y ofrecer la lista textual como alternativa.

### Teclado y lector de pantalla

- Cada hotspot es alcanzable con Tab o desde la lista espejo.
- `Enter`/`Espacio` abre; `Escape` cierra.
- El nombre accesible es la etiqueta del factor y `aria-describedby` enlaza con el resumen.
- El popover no roba foco en hover; sí administra foco cuando se abre como diálogo en móvil.
- El orden de tabulación es semántico y declarado, no el orden accidental de contornos.

### Posicionamiento

- Evitar el recorte por `overflow: hidden` del visor actual.
- Elegir arriba, abajo, izquierda o derecha según espacio.
- Mantener el popover dentro del viewport y no cubrir la zona cuando haya alternativa.
- En móvil estrecho, usar hoja inferior o panel bajo la imagen si el popover flotante no es legible.

## 6. Catálogo semántico y fuentes

Crear `data/image-hotspots/concepts.json` separado de la geometría:

```json
{
  "id": "protection",
  "label": "Protección",
  "summary": "...",
  "details": "...",
  "status": "verified",
  "basicOrExpansion": "basic",
  "sourceRefs": []
}
```

Reglas:

- Un concepto puede reutilizarse en varias fichas.
- Una misma palabra con funciones distintas necesita IDs distintos.
- Los resúmenes deben tener aproximadamente 15–40 palabras y explicar la utilización, no la posición.
- Las notas extensas, bandas por rol y excepciones van en `details`.
- Si la regla no está transcrita, usar `status: needs_review` y un resumen honesto de la limitación.

## 7. Archivos que deberá modificar el desarrollador

### Datos

- Migrar la geometría precisa desde `factor-map.json` al esquema común o enlazarla desde él.
- Ampliar el vocabulario con resúmenes y fuentes.
- Enriquecer `data/phases/source-images/index.json` con tipo de contenido por página y calibraciones.
- Añadir calibraciones de 15 páginas de aeródromos/C4I y 17 de puertos.
- Añadir subzonas a las 198 regiones de planes en IMG-006.
- Actualizar `wizard-visual-refs.json` para apuntar a `imageId`, `instanceId` y `hotspotId`, no solo al documento.

### Cliente

- Crear `public/js/image-hotspot-viewer.js` o equivalente.
- Convertir `buildCounterViewer` en adaptador del componente común.
- Sustituir `renderPhaseImageGallery` por una galería que abre el visor hotspot.
- Hacer que `source-page` en `core-visual-refs.js` abra la página y zona exactas.
- Enlazar recortes de planes con sus subzonas.
- Mantener `openImageLightbox` como «Ver imagen sin anotaciones».

### Estilos y herramientas

- Añadir tokens, estados, popover adaptable, lista accesible y estilo `needs_review`.
- Respetar `prefers-reduced-motion`.
- Añadir pipeline OpenCV y versiones fijadas.
- No ejecutar OpenCV durante `npm start` ni en el navegador.

### Normativa del repositorio

- Actualizar `AGENTS.md` para convertir este procedimiento en la política obligatoria de cualquier ayuda presente o futura basada en imágenes.
- Incluir en esa política las rutas y comandos definitivos del esquema, componente, calibrador y validaciones una vez implementados.
- No modificar `AGENTS.md` con nombres provisionales antes de que esas piezas existan; la acción corresponde al desarrollador que implemente la corrección.

## 8. Pruebas necesarias

### Datos

- Esquema válido e IDs únicos.
- Coordenadas normalizadas dentro de límites.
- Hash/dimensiones coinciden con la imagen.
- Todo hotspot tiene concepto, nombre, resumen, estado y fuente o motivo de revisión.
- No hay regiones verificadas sin imagen QA.
- Cobertura de 175 apariciones de factores.
- Cobertura de 15 páginas de aeródromos/C4I y 17 de puertos.
- Solapamientos problemáticos detectados.
- Referencias de wizard apuntan a zonas existentes.

### Calibrador

- Fixtures para inclinación, perspectiva y líneas rotas.
- Misma entrada/perfil produce el mismo JSON dentro de tolerancia.
- Un hash distinto invalida la calibración.
- Confianza baja nunca produce `verified` automáticamente.
- La homografía transforma correctamente los cuatro vértices.

### Visor y E2E

- Conversión correcta de coordenadas normalizadas a `viewBox`.
- Hover, foco y toque muestran el mismo nombre y resumen.
- Segundo toque/Escape cierra.
- El popover permanece dentro del viewport.
- Bordes tienen radio y grosor correctos.
- Área táctil mínima de 48×48 px.
- Abrir desde un wizard activa el factor solicitado.
- Seleccionar un aeródromo/puerto abre su tarjeta y sus zonas.
- Perfil básico etiqueta u oculta expansión correctamente.
- Sin scroll horizontal en 1024×768 ni 390×844.

### Regresión visual

Guardar referencias para una ficha aérea, naval y terrestre; una página con varios aeródromos; un panel C4I; una página con varios puertos; y un plan con valores completos/dañados. La comparación debe fallar si el borde se desplaza fuera del elemento objetivo.

## 9. Orden recomendado

1. Definir esquema y catálogo semántico.
2. Construir `ImageHotspotViewer` con datos de prueba.
3. Crear pipeline OpenCV e imágenes QA.
4. Migrar una ficha de cada categoría y validar precisión/interacción.
5. Migrar las 20 plantillas y 175 factores.
6. Segmentar páginas y tarjetas de aeródromos, puertos y C4I.
7. Transcribir y validar resúmenes de uso.
8. Conectar ayudas `source-page` de wizards con la zona exacta.
9. Añadir subzonas de los 198 planes.
10. Completar E2E, regresión visual y prueba física en tablet horizontal.

No se recomienda calibrar las 32 páginas antes de cerrar el esquema y el componente: una modificación tardía obligaría a repetir la revisión manual.

## 10. Definition of Done

La tarea se considera terminada cuando:

- todas las imágenes multizona usadas por la aplicación se renderizan mediante el componente común;
- cada hotspot muestra al menos nombre y resumen de utilización;
- las coordenadas fueron generadas o recalibradas con OpenCV, revisadas y versionadas;
- las 175 apariciones de factores tienen región exacta o bloqueo explícito;
- las 15 páginas de aeródromos/C4I y las 17 de puertos están segmentadas por tarjeta y zona;
- las referencias visuales de wizards abren la imagen y zona exactas cuando existen;
- los bordes son visibles, redondeados y distinguibles en reposo, hover, foco, selección y revisión pendiente;
- puntero, toque, teclado y lector de pantalla acceden al mismo contenido;
- ningún valor de juego se deduce de la imagen en tiempo de ejecución;
- los tests de datos, unidad, E2E y regresión visual están en verde;
- `AGENTS.md` establece este mismo procedimiento como norma obligatoria para todas las imágenes y ayudas sobre imágenes, incluidas las incorporaciones futuras;
- `development_status.md` documenta grupos completados, fuentes y comprobación web.

## 11. Riesgos que deben controlarse

- **Falsa precisión:** OpenCV puede detectar una caja correcta y asignarle semántica incorrecta. Revisión humana obligatoria.
- **Perspectiva:** guardar la transformación y comprobar sobre la imagen que realmente sirve la web.
- **Solapamiento táctil:** ampliar áreas sin volver imposible elegir zonas vecinas.
- **Textos no verificados:** C4I, aeródromos y puertos siguen parcialmente transcritos; OCR no se convierte en regla.
- **Hashes:** regenerar un PNG obliga a revisar calibraciones aunque parezca igual.
- **Rendimiento:** cargar datos por página bajo demanda, no toda la geometría al abrir Inicio.
- **Dependencia OpenCV:** mantenerla fuera del runtime del servidor y documentar instalación reproducible.
