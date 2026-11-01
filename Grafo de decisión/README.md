# Árbol de decisión — The Coming Wave

## Entregables

- `arbol-decision-tcw.html`: vista gráfica interactiva, recorrido de preguntas y auditoría de nodos.
- `arbol-decision-tcw.mmd`: grafo general resumido en Mermaid; el detalle completo está en el HTML y en el routemap.
- `routemap.json`: definición ejecutable del árbol completo.
- `routemap.schema.json`: esquema estructural para validar el routemap.
- `AGENTS.md`: contrato para un agente o asistente que recorra el árbol.
- `validacion-routemap.txt`: resultado de las comprobaciones automáticas.

## Cobertura

El árbol cubre los procedimientos enumerados en la página 1 de las tablas: combate cercano terrestre; ataques terrestres guiados, no guiados y antirradiación; intercepción y defensa aérea de área; ataques antibuque guiados/no guiados y artillería; torpedos contra superficie; búsquedas ASW por firma y aéreas; ataques ASW de superficie, aéreos y submarinos; guerra cibernética; destrucción espacial; reabastecimiento logístico. Los efectos de aeródromos, puertos y unidades móviles se aplican al final de las ramas de ataque correspondientes; la profundidad marítima se decide dentro de la búsqueda ASW.

En la intercepción aérea, los AWACS del atacante y del defensor se evalúan independientemente: cada uno aporta `+1` a la Iniciativa de su propio bando si detecta a la unidad contraria. El árbol contempla las cuatro combinaciones posibles.

## Diseño

No hay nodos intermedios con salida única. Los cálculos automáticos se anotan como efectos de la respuesta que los activa. Los únicos nodos sin salida son resultados terminales. Las preguntas dependientes de una rama —como el Valor Electrónico de una instalación o la zona CAP en ASW aéreo— no aparecen fuera de esa rama.

## Límite deliberado

El routemap selecciona la tabla, la fila/columna y las excepciones, pero no sustituye las matrices numéricas originales. Una implementación de calculadora debe digitalizar esas matrices en un módulo de datos separado y verificar sus pictogramas visualmente; varios símbolos no sobreviven a la extracción textual del PDF.
