# Cambios

## 1.0.0 — primera versión pública

Aplicación web de ayuda para *The Coming Wave*, pensada para tablet en horizontal.

- **Turno guiado** con la banda de dos días, las seis fases de campaña y sus segmentos (Refuerzos, Aire I, Superficie, Aire II, Tierra y Submarino), Recuperación de Mando, Fase 0 de Estrategia, progreso opcional y no obligatorio, y ayudas contextuales en cada paso.
- **Wizards de resolución** con tabla resaltada, modificadores explicados, historial y borradores: combate cercano y ataques terrestres, reacciones terrestres, combate aéreo (asignación de objetivos, BVR y WVR con grupo de misión compartido), defensa aérea, ataques antibuque, torpedos, emboscada de submarino, ASW y búsquedas, efectos del impacto antibuque.
- **Logística y estrategia:** garantía logística, reabastecimiento de campo del ejército, logística de puerto y munición, Fase Logística con desgaste de Nodos de Suministro, ciberataque y guerra espacial (reglas opcionales).
- **Perfil de reglas** (expansión y reglas opcionales), con etiquetas «Solo expansión» y «regla opcional».
- **Ayudas:** detección, 33 páginas de tablas de combate, planes de ataque y munición por país, leyenda de fichas con zonas explicadas, tarjetas de aeródromos y puertos, y buscador.
- **Despliegue estático:** `npm run build` genera `dist/`, la web lista para cualquier alojamiento de archivos (ver `README.md`).

### Limitaciones conocidas

- Reglas pendientes de validar por el mantenedor: `docs/rules/known-ambiguities.md`.
- Asignación de bajas a una unidad principal y artillería naval por unidad: faltan datos por unidad.
- Pendiente de probar con una tablet táctil real y de decidir un modo oscuro (tras esta primera versión).
