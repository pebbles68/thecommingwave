# AGENTS.md — Resolución de combate de The Coming Wave

## Misión

Guiar al jugador por `routemap.json` para seleccionar y resolver el procedimiento correcto de combate, ataque, localización, búsqueda ASW o acción estratégica con el mínimo de preguntas necesarias.

## Fuentes normativas

1. `TCW_Decision_Book_v1.0_-_COMPLETO_[v.ESP_-_1.2].pdf` gobierna legalidad, elegibilidad, secuencia y excepciones.
2. `Tablas-de-combate 5.pdf` gobierna cruces numéricos, modificadores, daños y resultados.
3. Las referencias de página del routemap son páginas físicas del PDF, no el número impreso de regla.
4. Si regla y tabla parecen contradecirse, detener la resolución y mostrar ambas referencias; no inventar una conciliación.
5. Los pictogramas de capacidad, Protección, Resistencia, trayectoria o potencia de torpedo deben comprobarse visualmente en la ficha y en la página citada. La extracción de texto no conserva todos los pictogramas.

## Contrato de ejecución

- Cargar `routemap.json` y comenzar siempre en `entrypoint` salvo que el usuario identifique inequívocamente un procedimiento concreto.
- En un nodo `decision`, formular únicamente `question` y mostrar únicamente sus `routes[].answer`.
- No adelantar preguntas de ramas que aún no han sido seleccionadas.
- Cuando el jugador elige una ruta, acumular sus `effects`, conservar la respuesta en el estado y saltar a `to`.
- En un nodo `terminal`, no formular más preguntas. Presentar `title`, `instructions`, efectos acumulados y `source`.
- No crear pasos automáticos como nodos nuevos. Un cálculo, ajuste o consumo automático debe vivir como efecto de la ruta que lo activa.
- Si el jugador cambia una respuesta anterior, descartar todos los efectos y respuestas posteriores y recorrer de nuevo desde ese nodo.

## Estado mínimo recomendado

```json
{
  "current_node": "start.scope",
  "history": [],
  "answers": {},
  "effects": [],
  "source_trace": []
}
```

Cada elemento de `history` debería guardar `node_id`, `answer`, `to` y una copia de los efectos añadidos. Esto permite volver atrás sin dejar modificadores huérfanos.

## Reglas de conversación

- Usar preguntas cerradas, con la redacción exacta del nodo.
- Si el usuario aporta ya una respuesta (por ejemplo, “ataque antibuque guiado supersónico”), registrarla sin volver a preguntarla.
- Pedir un valor de ficha solo cuando la rama seleccionada lo requiere.
- Para un cruce numérico, indicar siempre: tabla/página, fila, columna, tirada y cualquier desplazamiento.
- Separar claramente tres capas: legalidad, reducción/modificación y resultado/daño.
- No interpretar `·` como cero: significa ausencia de resultado/efecto en esa celda.
- Un resultado natural de 9 cancela modificaciones de intensidad solo en los procedimientos que lo dicen expresamente.
- En intercepción aérea, comprobar por separado si el AWACS del atacante detecta al defensor y si el AWACS del defensor detecta al atacante. Cada bando obtiene su propio `+1` a Iniciativa; si ambos lo obtienen, la diferencia no cambia por AWACS.
- No iniciar una resolución por daño de localización. Las preguntas de aeródromo, puerto o unidad móvil solo se recorren al final de un ataque que pueda causarlo; la profundidad marítima se decide dentro de la búsqueda ASW correspondiente.

## Invariantes del grafo

- Todo nodo `decision` debe tener al menos dos rutas.
- Todo nodo `terminal` debe carecer de rutas.
- Toda ruta debe apuntar a un nodo existente.
- Un nodo puede converger con otra rama si sus efectos acumulados mantienen la diferencia de estado.
- Los bucles solo están permitidos cuando representan una elección real de repetir, como otra ronda WVR.

## Implementación de software

- Validar el archivo contra `routemap.schema.json` y ejecutar las comprobaciones semánticas anteriores al cargarlo.
- Tratar `node_id` como identificador estable; no usar el texto visible como clave.
- Mantener los textos de fuente como metadatos auditables.
- El routemap modela el árbol y referencia las matrices normativas. Para convertirlo en calculadora completa, digitalizar las matrices de las páginas citadas en un módulo separado de datos, con pruebas de celda contra el PDF.
- No codificar pictogramas por OCR. Crear un catálogo explícito de iconos después de inspección visual de las fichas y tablas.

## Pruebas mínimas

1. Recorrer todos los nodos desde `entrypoint` y detectar referencias rotas o nodos inalcanzables.
2. Afirmar `routes.length >= 2` para decisiones y ausencia de `routes` para terminales.
3. Probar al menos un camino válido y uno ilegal por cada dominio.
4. Probar que una respuesta modificada elimina efectos posteriores.
5. Probar los bucles WVR y que el usuario puede terminar la repetición.
6. Probar las cuatro combinaciones AWACS: ninguno, solo atacante, solo defensor y ambos.
7. Comparar manualmente una celda de cada tabla numérica digitalizada con el PDF.
