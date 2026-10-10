// Motor genérico de modificadores de Fuerza de Ataque (roadmap Fase 5).
//
// Gap detectado al reconciliar roadmap.md contra el código real (2026-09-27):
// public/js/table-engine.js resuelve fila/columna/celda de forma declarativa,
// pero la mecánica de "Modificación de Intensidad de Ataque" — modificadores
// que reducen el Valor de Ataque y, más allá de cierto límite, DESPLAZAN la
// columna de resolución hacia la izquierda en vez de seguir restando al
// valor — seguía sin generalizarse: cada wizard tendría que reimplementarla
// a mano. Este módulo la implementa una sola vez, sin conocer ningún dominio
// de combate concreto (no sabe qué es un "Valor de Ataque" ni una "Fuerza de
// Ataque"; solo opera sobre números y un array de etiquetas de columna ya
// resuelto por el llamador).
//
// Mecánica (Decision Book v1.0 [ESP.v1.2], secciones casi idénticas salvo el
// límite numérico):
//   §5.12.10 Resolución de Ataque Terrestre Guiado (límite 13, páginas 76-77)
//   §5.13.6 Resolución de Ataque Terrestre No Guiado (límite 66, páginas 79-80)
// Pasos 3-6 de ambas secciones, citados literalmente:
//   "Si el Valor de Ataque > [límite]: por cada punto de modificación
//    negativa a la fuerza de ataque, el Valor de Ataque se reduce en 1,
//    hasta que el Valor de Ataque llegue a [límite]."
//   "Si el Valor de Ataque (antes o después de la reducción) <= [límite]: se
//    busca la columna correspondiente a ese valor. Por cada punto de
//    modificación negativa a la fuerza de ataque, la columna de resolución
//    utilizada se desplaza 1 columna hacia la izquierda. Se salta cualquier
//    columna marcada con '.' durante este desplazamiento."
//   "Si las modificaciones negativas requieren desplazar la columna más
//    allá del extremo izquierdo de la tabla, se utiliza la columna más a la
//    izquierda."
// Y (§5.12.9/§5.13.2, ya transcritas en varias páginas de data/tables/ como
// referenceNotes): "las modificaciones positivas solo pueden usarse para
// contrarrestar las negativas... la modificación máxima de fuerza de ataque
// es 0 (no puede ser netamente positiva)".
//
// Esta mecánica todavía no tiene ningún wizard que la consuma (ni
// ground_guided ni ground_unguided tienen wizard propio, a diferencia de
// antiship_guided) y no hay golden test oficial que la ejercite con un
// ejemplo numérico completo (los ejemplos de §5.12.10/§5.13.6 dan
// directamente "la columna de resolución es X" sin desglosar valor bruto +
// modificador). Los tests de este módulo verifican la mecánica contra la
// regla citada arriba, no contra un ejemplo de partida verificado.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CombatModifierEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Resuelve la columna final de una tabla de daño con el mecanismo de
  // "cap + desplazamiento" de arriba.
  //
  // - rawAttackValue: Valor de Ataque antes de aplicar modificadores.
  // - modifierTotal: suma de todos los modificadores de Fuerza de Ataque
  //   aplicables (puede venir de CombatWizardEngine#sumModifiers). Un total
  //   positivo se trata como 0 (§5.12.9: no puede ser netamente positiva).
  // - valueCap: límite superior del Valor de Ataque de esta tabla (13 en
  //   page-05.json/ground_guided, 66 en page-09.json/ground_unguided).
  // - columnLabels: array de etiquetas de columna ya resuelto por el
  //   llamador con `tableEngine.pickAxisLabels` (el esquema correcto —
  //   p.ej. `normal_ataque` o `persecucion_ataque` de
  //   data/tables/page-05.json — ya elegido antes de llamar a esta función;
  //   este módulo no elige esquemas, solo opera sobre el array ya resuelto).
  function resolveAttackValueColumnShift(tableEngine, { rawAttackValue, modifierTotal, valueCap, columnLabels }) {
    const netModifier = Math.min(modifierTotal, 0) || 0; // evita -0
    const reductionBudget = -netModifier || 0; // evita -0

    const excess = Math.max(rawAttackValue - valueCap, 0);
    const consumedByCap = Math.min(excess, reductionBudget);
    const effectiveValue = Math.min(rawAttackValue - consumedByCap, valueCap);
    const remainingShift = reductionBudget - consumedByCap;

    const startMatch = tableEngine.matchAxisIndex(columnLabels, effectiveValue);
    if (startMatch.index === -1) {
      throw new Error(`No se encontró columna para el Valor de Ataque efectivo "${effectiveValue}" en el esquema dado.`);
    }
    const columnIndex = tableEngine.shiftColumnIndex(columnLabels, startMatch.index, remainingShift);

    return {
      rawAttackValue,
      modifierTotal: netModifier,
      reductionBudget,
      consumedByCap,
      effectiveValue,
      remainingShift,
      columnIndex,
      columnLabel: columnLabels[columnIndex]
    };
  }

  return {
    resolveAttackValueColumnShift
  };
});
