# Casos especiales de detección y reacción por tipo de ataque

Inventario (2026-10-19) de lo que ya está en los datos del proyecto, para decidir qué casos se explican en las guías de pasos (Fase 24, TC-006). **No añade reglas**: cada caso cita el archivo de datos donde ya consta y su fuente. Lo que el mantenedor ha indicado de palabra figura como «Indicación del mantenedor». Los huecos están en la última sección.

## Ataque aéreo

| Caso | Dónde consta | Fuente |
| --- | --- | --- |
| Si el ataque es un Air Strike, también pueden detectar al atacante las CAPs o BARCAPs del defensor. | `data/guides/combat-steps.json` (aclaración del paso `defense-detection`) | Indicación del mantenedor, 2026-10-19 |
| La red solo puede estar formada por un AWACS con CAPs o por CAPs entre ellas (reglas avanzadas): el criterio de «en red» no se aplica a la salida de emergencia ni a los ataques a superficie o a tierra. | `data/guides/combat-steps.json` | Indicación del mantenedor, 2026-10-19 |
| Un avión MPA en la misma casilla que un AWACS y una CAP: la CAP puede reaccionar a un ataque al MPA aunque no se haya detectado. | `data/guides/combat-steps.json` | Indicación del mantenedor, 2026-10-19 |
| Si el defensor detecta al atacante, puede responder con una CAP o una salida de emergencia. | `data/guides/combat-steps.json` (paso `defense-detection`) | Indicación del mantenedor, 2026-10-18 |
| Una CAP en el mismo hexágono que el objetivo puede reaccionar aunque no se haya detectado al atacante, si la CAP y el objetivo están en red (el AWACS es solo un ejemplo). | `data/guides/combat-steps.json` (aclaración del paso `defense-detection`) | Indicación del mantenedor, 2026-10-19 |
| Un AWACS en red que detecta y expone al objetivo da +1 al Valor de Iniciativa del bando. | `data/workflows/05_combate_aereo.json` (`sideFlags.awacs_in_network`) | Decision Book 7.16.2, p. 144 |
| Selección de objetivos BVR: sin escolta electrónica en ninguno o en ambos bandos, eligen primero las unidades **no detectadas** y después las detectadas. | `data/workflows/05_combate_aereo.json` (`interceptionRules.targetAssignment`) | Decision Book 7.16.1 |
| Unidades sigilosas (Firma Aérea 1) y duelo sigiloso: «Sin BVR». | `data/workflows/05_combate_aereo.json` (`sideFlags.stealth`, `outcomeRule.bothStealth`) | Decision Book 7.16.2; Tablas de combate p. 15 |
| Quién puede exponer a una unidad aérea: CAPs con valor de combate y AWACS (aéreas), unidades de radar (terrestres) y todas las de superficie según su firma terrestre. | `data/detection/help-sheet.json` (`air.detectedByOthers`) | Hoja de ayuda de detección, pp. 2-4 |

## Ataque a superficie

| Caso | Dónde consta | Fuente |
| --- | --- | --- |
| Estado de detección del ataque guiado: atacante detectado / atacante no detectado pero guía sí / ni atacante ni guía detectados. | `data/workflows/07_ataque_antibuque_guiado.json` (etapa 2, `detection_state`) | Tablas de combate, ataque antibuque guiado |
| Quién detecta unidades navales: aéreas (solo misión especial o ISR), terrestres (hexágono costero), baja altitud (lado operativo) y superficie (cualquier unidad). | `data/detection/help-sheet.json` (`naval.detectedBy`) | Hoja de ayuda de detección, p. 4 |
| Defensa aérea de área contra un objetivo de baja altitud: el sistema que dispara debe haberlo detectado por sí mismo; si no, no puede disparar. | `data/workflows/06_defensa_aerea_area.json` (`flowCuts`, `self_detected_low_altitude`) | Tablas de combate, defensa aérea de área |
| Los misiles de crucero expuestos también pueden ser interceptados por unidades aéreas en CAP o despegue de emergencia si el misil cruza su zona de patrulla. | `data/rules/decision-book-excerpts.json` (§6.8, regla 7.15) | Decision Book 6.8 / 7.15 — **la regla 7.15 no está transcrita todavía** |
| Tras cualquier disparo antiaéreo la unidad queda brevemente detectable y, si se expone, puede sufrir un Contrafuego (AS). | `data/rules/decision-book-excerpts.json` (§6.7) | Decision Book 6.7 / 5.16.2 |

## Ataque terrestre

| Caso | Dónde consta | Fuente |
| --- | --- | --- |
| Instalaciones fijas: siempre expuestas. | `data/detection/help-sheet.json` (`ground.fixedInstallations`) | Hoja de ayuda de detección, pp. 4-5 |
| Unidades móviles: detectables si Terreno ×4 es menor que la Fuerza (principales) o que el número de unidades técnicas (técnicas); si no, ocultas. | `data/detection/help-sheet.json` (`ground.mobileUnitDetectability`) | Hoja de ayuda de detección, pp. 4-5 |
| Quién puede exponer unidades terrestres: solo aéreas o de baja altitud en misión ISR. | `data/detection/help-sheet.json` (`ground.whoCanDetect`) | Hoja de ayuda de detección, pp. 4-5 |
| Las acciones (movimiento, disparo, apoyo, retirada) dejan a una unidad «brevemente detectable»; si se detecta, puede recibir ataques de reacción antes de que el atacante resuelva el primero. | `data/detection/help-sheet.json` (`ground.brieflyDetectableTriggers`) y `data/rules/ground-reactions.json` | Hoja de ayuda de detección; Decision Book 5.16, 8.5.6 y 8.7.8 |
| Reacciones: Contrabatería (CF), Contrafuegos (AS), Persecución Aérea (KB) e Interdicción de Batalla (BAI), cada una con su disparador, atacantes y objetivos. Solo reaccionan las unidades aéreas en Ataque Dinámico, las de baja altitud operativas y, en la contrabatería, la artillería. | `data/rules/ground-reactions.json` (wizard `#/wizard/ground-reaction`) | Decision Book 5.16, 8.5.6 y 8.7.8 |
| Estado de detección en los ataques terrestres guiado, no guiado y antirradiación: atacante detectado, no detectado pero guía sí, o ninguno. | `data/workflows/02`, `03` y `04` (`detection_state`) | Tablas de combate |

## Huecos

Respuestas del mantenedor del 2026-10-19: (1) en un Air Strike también detectan CAPs o BARCAPs; (2) el criterio de red no se extiende a la salida de emergencia ni a superficie y tierra, y un MPA con AWACS y CAP en su casilla puede ser defendido por la CAP; (3) la guía terrestre sigue el orden «acción → ¿se detecta? → ¿quién reacciona? → ¿qué reacción?» (hecha: `#/guia/ground-reaction`); (4) la tirada de detección BVR es la misma que la de penetración / interceptación (página 15); el paso BVR de la guía ya la explica.

Siguen abiertos:

1. **Ataque a superficie:** la guía de pasos del ataque a superficie aún no existe; faltan sus casos de reacción más allá de la detección por CAPs o BARCAPs en un Air Strike y de la interceptación de misiles de crucero (regla 7.15, sin transcribir).
