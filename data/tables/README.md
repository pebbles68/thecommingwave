# data/tables

Tablas de resolución de combate en formato estructurado (JSON), transcritas de `Tablas-de-combate 5.pdf` (34 páginas; la página 1 es solo el índice y no tiene archivo propio).

Cada `page-NN.json` puede tener:

- `tables[]`: sub-tablas con `rowAxis`/`columnAxis`/`cells` (grid numérico o textual).
- `referenceNotes[]`: reglas cualitativas (condición → efecto) que no son una tabla de doble entrada.
- `reusesTable`: cuando la página repite exactamente una tabla ya transcrita en otra página (evita duplicar datos).

**Estado de la transcripción:** pasada rápida a 300 DPI (decisión explícita del mantenedor, ver `development_status.md`), salvo las páginas 2 y 19-22 (combate cercano terrestre y el vertical slice de ataque antibuque guiado), verificadas con recortes a 600-1200 DPI. Las páginas/tablas con `needsReview: true` (ver `index.json`) tienen ambigüedades pendientes de una pasada de verificación dedicada — principalmente tablas con múltiples esquemas de etiqueta de columna superpuestos (Normal/Persecución) o con una celda menos de la esperada en la lectura rápida (marcada `null` en vez de inventada).

`index.json` lista las 33 páginas con datos, su `title`, `workflowRefs` (a qué workflow de `data/workflows/` corresponde) y si tienen contenido pendiente de revisar.
