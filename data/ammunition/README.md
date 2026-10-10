# data/ammunition

Planes de ataque y tipos de munición (alcance, valor de ataque/carga, iconos especiales).

Pendiente: transcripción de `Tablas de municiones.pdf` y los planes de ataque (roadmap Fase 3 y Fase 9).

## Convención `heavy`/`light` (formato `dual`)

Un plan con `loadFormat: "dual"` imprime sus dos valores como `"X/Y"` (p.ej. `"4/6"`, con un superíndice opcional de alcance). Confirmado por la Leyenda oficial de `Tablas de municiones.pdf` (recuadro "Plan de ataque"): el **primer** número es la **carga pesada** (`heavy` en el JSON) y el **segundo** es la **carga ligera** (`light`). Ver `docs/rules/known-ambiguities.md` ("Orden de 'carga pesada'/'carga ligera'...", 2026-09-27) para el detalle de una fuente secundaria (la hoja de ayuda del ataque guiado) que describe un ejemplo concreto en el orden contrario — resuelto a favor de la Leyenda, que es la referencia de formato/notación (mismo precedente que el caso F-15E de esa misma página).
