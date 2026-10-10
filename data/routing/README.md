# data/routing

Árbol de decisión para seleccionar la tabla/workflow de combate correcto según objetivo, origen y tipo de ataque.

`table-routing.json` transcribe `Mapa de uso de tablas.txt` completo (roadmap Fase 6): cada hoja del árbol referencia el `id` y el archivo de `data/workflows/` que resuelve esa combinación. Un destino (`estratégico > logística`, página 32) no tiene workflow transcrito todavía y queda marcado en `gaps` con `leaf: null` en vez de inventarse.
