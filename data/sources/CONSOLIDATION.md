# Consolidación de fuentes — Attack Workflows

## Fuente original

**Carpeta externa:** `C:\Users\p.alvarez\thecommingwave\Combate/`

Contiene:
- 13 XMLs de flujos de combate (`01_combate_cercano_terrestre.xml` → `13_busqueda_asw_apoyo.xml`)
- `index.xml` (índice maestro)
- `icons/` (27 PNGs de iconos)
- `README.txt` (documentación de estructura)

## Copia canónica en el proyecto

**Ubicación en Git:** `data/sources/tcw_attack_workflows/`

Los archivos son idénticos a los de `Combate/`. Esta carpeta es la versión de trabajo integrada en el proyecto Git.

## Política de actualización

1. Los cambios en los XMLs deben hacerse **primero en `data/sources/tcw_attack_workflows/`** (la copia dentro del proyecto Git).
2. Los cambios se verifican mediante tests y se comitean.
3. La carpeta `Combate/` debe actualizarse solo si hay cambios de fuente (correcciones del usuario, nuevos workflows).
4. Si se sincroniza desde `Combate/`, verificar con `diff` antes de sobrescribir.

## Estructura XML

Ver `README.txt` en la carpeta origen (`Combate/README.txt`).

Resumen:
- `source/pages`: referencias a "TCW - TABLAS DE COMBATE"
- `workflow/stage`: etapas secuenciales (elegibilidad, calcular fuerza, guerra electrónica, bayas)
- `question`: preguntas con tipos (boolean, number, select)
- `effect`: modificadores numéricos o reglas
- `iconRef`: referencias a iconos (catálogo incluido en cada XML)
- `tableReference` / `finalTableReference`: tabla a mostrar en la app

## Estado

- **Consolidado:** 2026-09-23
- **Status en sources.json:** `verified`
- **Siguiente paso:** Implementar parser/loader en servidor (`server.js`) y wizard de combate en cliente.
