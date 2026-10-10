// Motor puro de la resolución final del Ataque Anti-Radiación (ARM; roadmap
// Fase 9; data/workflows/04_ataque_antirradiacion.json + data/tables/page-13.json).
// Cita el Decision Book §5.14.2-§5.14.3 (pp. 82-83) y la página 13 impresa de
// Tablas-de-combate 5.pdf. Las etapas de Defensa Aérea de Área e Interceptación
// de Munición (§5.14.1) reutilizan las funciones ya existentes de
// CombatWizardEngine; el Contraataque a Baja Altura, `resolveLowAltitude-
// CounterattackShot`. Este módulo solo resuelve lo propio del ARM:
//
//   §5.14.2  Un plan ARM contra una unidad de radar otorga Fuerza de Ataque -5
//            (el sistema de detección del objetivo está activado); las
//            modificaciones positivas solo compensan negativas (neto máx. 0).
//   §5.14.3  1-2 Confirmar el Valor de Ataque y aplicar la modificación.
//            3   Si el Valor de Ataque > 13: por cada punto negativo se reduce
//                en 1 hasta llegar a 13.
//            4   Si <= 13: se busca su columna y cada punto negativo la
//                desplaza 1 columna a la izquierda.
//            5-6 Tope de 13; si se sale por la izquierda, columna más a la
//                izquierda.
//            Se lanza 1d10; en la columna resultante la fila la da la tirada.
//            Nota: si el dado es 9, todas las modificaciones se cancelan.
//   Página 13  "Los planes de ataque [L] utilizan la fila [L] en la resolución":
//            esquema de columna 'L_ligero' (1…13+) frente al canónico 'Normal'
//            (0.5, 1, ·, 2…13+).
//
// Sin golden test oficial de extremo a extremo: las pruebas verifican la
// mecánica contra la regla citada y contra celdas leídas de la página impresa.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./combat-modifier-engine.js'));
  } else {
    root.AntiRadiationAttackEngine = factory(root.CombatModifierEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (CombatModifierEngine) {
  'use strict';

  const VALUE_CAP = 13;
  const LIGHT_SCHEME = 'L_ligero';

  // `intensityModifier` viene de los datos del workflow (-5 con el sistema de
  // detección activado, 0 si no); este módulo no lo conoce.
  function resolveAntiRadiationAttack(table, tableEngine, { attackValue, lightPlan, intensityModifier, roll }) {
    const value = Number(attackValue);
    if (Number.isNaN(value)) throw new Error('El Valor de Ataque debe ser un número.');
    const natural = Number(roll);
    const cancelledByNine = natural === 9 && intensityModifier < 0;
    const appliedModifier = natural === 9 ? 0 : intensityModifier;
    const columnScheme = lightPlan ? LIGHT_SCHEME : undefined;
    const columnLabels = tableEngine.pickAxisLabels(table.columnAxis, columnScheme);

    const base = { attackValue: value, lightPlan: Boolean(lightPlan), columnScheme, intensityModifier, appliedModifier, cancelledByNine };

    let columnResult;
    try {
      columnResult = CombatModifierEngine.resolveAttackValueColumnShift(tableEngine, {
        rawAttackValue: value, modifierTotal: appliedModifier, valueCap: VALUE_CAP, columnLabels
      });
    } catch (err) {
      return Object.assign(base, { noColumn: true, columnResult: null, cell: null, impacts: 0, reason: err.message });
    }

    const cell = tableEngine.resolveCell(table, natural, columnResult.columnLabel, { columnScheme });
    const impacts = cell.rawCell === '.' ? 0 : Number(cell.rawCell);
    if (Number.isNaN(impacts)) throw new Error(`Celda de la tabla ARM no reconocida: "${cell.rawCell}".`);
    return Object.assign(base, { noColumn: false, columnResult, cell, impacts });
  }

  return { VALUE_CAP, LIGHT_SCHEME, resolveAntiRadiationAttack };
});
