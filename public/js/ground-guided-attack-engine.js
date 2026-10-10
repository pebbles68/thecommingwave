// Motor puro del Ataque Terrestre Guiado (roadmap Fase 9; data/workflows/
// 02_ataque_terrestre_guiado.json + data/tables/page-05.json). Cita el Decision
// Book §5.12.2-§5.12.10 (pp. 75-77) y la página 5 impresa de
// Tablas-de-combate 5.pdf. Las etapas de Defensa Aérea de Área e Interceptación
// de Munición (§5.12.1) reutilizan las funciones de CombatWizardEngine /
// AntishipGuidedModel y el Contraataque a Baja Altura (§5.12.11),
// `resolveLowAltitudeCounterattackShot`. Este módulo resuelve lo propio del
// ataque terrestre guiado:
//
//   §5.12.2  Las modificaciones de Fuerza de Ataque se acumulan; las
//            positivas solo compensan negativas (neto máximo 0).
//   §5.12.9  Qué modificaciones aplican según el objetivo: principal -> las de
//            "objetivo móvil"; técnica -> móvil + técnica; fija -> solo las de
//            instalación fija. El grupo de cada tipo de objetivo viene de los
//            datos del workflow (`modifierGroups`).
//   §5.12.10 Cada punto negativo reduce en 1 un Valor de Ataque > 13 hasta 13;
//            con <= 13 desplaza la columna 1 a la izquierda saltando las "·";
//            tope 13; fuera por la izquierda = columna más a la izquierda.
//            1d10: la columna de tirada (Móvil o Fijo) da la fila. Un 9
//            natural cancela las modificaciones de intensidad.
//   Página 5 La combinación tipo de ataque (Ligero / no ligero) × munición
//            (Normal / Persecución) elige el esquema de etiquetas de columna
//            (`finalResolution.methodRows`, confirmado por el mantenedor
//            2026-10-05).
//
// Sin golden test oficial de extremo a extremo: las pruebas verifican la
// mecánica contra la regla citada, el ejemplo textual de §5.12.10
// (Persecución, móvil, columna "4", tirada 4 -> 11 impactos) y celdas leídas de
// la página impresa.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./combat-modifier-engine.js'));
  } else {
    root.GroundGuidedAttackEngine = factory(root.CombatModifierEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (CombatModifierEngine) {
  'use strict';

  class GroundGuidedError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'GroundGuidedError';
      this.code = code;
    }
  }

  // Fila de etiquetas para el método (`methodRows` del workflow).
  function selectMethodRow(methodRows, { lightPlan, pursuit }) {
    const row = methodRows.find((m) => m.lightPlan === Boolean(lightPlan) && m.pursuit === Boolean(pursuit));
    if (!row) throw new GroundGuidedError('no_method_row', 'No hay fila de resolución para esa combinación de método.');
    return row;
  }

  // Bloques completos de `blockSize` puntos que exceden `limit` (§5.12.5).
  function forceSizeBlocks(forceSize, { limit, blockSize }) {
    const size = Number(forceSize);
    if (forceSize === '' || forceSize === undefined || forceSize === null || Number.isNaN(size) || size < 0) {
      throw new GroundGuidedError('invalid_force_size', 'El tamaño de fuerza debe ser un número ≥ 0.');
    }
    return Math.max(0, Math.floor((size - limit) / blockSize));
  }

  // `groups` = modifierGroups.byTargetType; `values` = { questionId: número }
  // ya resuelto por quien llama. Solo suman las preguntas del grupo del objetivo.
  function computeIntensityModifier(groups, targetType, values) {
    const ids = groups[targetType];
    if (!ids) throw new GroundGuidedError('unknown_target', `Tipo de objetivo desconocido: "${targetType}".`);
    const parts = ids.map((id) => ({ id, value: Number(values[id]) || 0 }));
    const raw = parts.reduce((sum, p) => sum + p.value, 0);
    return { parts, raw, net: Math.min(raw, 0) || 0, positiveDiscarded: raw > 0 };
  }

  // Resolución final. `table` = ground-precision-attack-damage.
  // `targetFixed`: objetivo Instalación Fija (fila 'fijo') o Móvil (fila 'movil').
  function resolveGroundGuidedAttack(table, tableEngine, { attackValue, columnScheme, targetFixed, intensityModifier, roll, valueCap, rollRowSchemes }) {
    const value = Number(attackValue);
    if (attackValue === '' || Number.isNaN(value)) throw new GroundGuidedError('invalid_value', 'El Valor de Ataque debe ser un número.');
    const natural = Number(roll);
    if (roll === '' || roll === undefined || Number.isNaN(natural)) throw new GroundGuidedError('invalid_roll', 'La tirada debe ser un número (1d10).');
    const modifier = Number(intensityModifier) || 0;
    const cancelledByNine = natural === 9 && modifier < 0;
    const appliedModifier = natural === 9 ? 0 : modifier;
    const rowScheme = targetFixed ? rollRowSchemes.fixed : rollRowSchemes.mobile;

    const columnLabels = tableEngine.pickAxisLabels(table.columnAxis, columnScheme);
    const base = { attackValue: value, columnScheme, rowScheme, targetFixed: Boolean(targetFixed), intensityModifier: modifier, appliedModifier, cancelledByNine };
    let columnResult;
    try {
      columnResult = CombatModifierEngine.resolveAttackValueColumnShift(tableEngine, {
        rawAttackValue: value, modifierTotal: appliedModifier, valueCap, columnLabels
      });
    } catch (err) {
      return Object.assign(base, { noColumn: true, columnResult: null, cell: null, impacts: 0, reason: err.message });
    }

    // Fila y columna por índice (las etiquetas de columna se repiten: "·").
    const rowLabels = tableEngine.pickAxisLabels(table.rowAxis, rowScheme);
    const rowMatch = tableEngine.matchAxisIndex(rowLabels, natural);
    if (rowMatch.index === -1) throw new GroundGuidedError('row_out_of_range', `Ninguna fila coincide con la tirada ${natural}.`);
    const rawCell = table.cells[rowMatch.index][columnResult.columnIndex];
    const cell = {
      tableId: table.id,
      rowIndex: rowMatch.index,
      columnIndex: columnResult.columnIndex,
      rowLabel: rowLabels[rowMatch.index],
      columnLabel: columnLabels[columnResult.columnIndex],
      rawCell,
      isMissingData: rawCell === null,
      legendText: rawCell === '.' && table.cellLegend ? table.cellLegend['.'] || null : null,
      displayValue: rawCell === null ? null : String(rawCell)
    };
    const impacts = rawCell === '.' ? 0 : Number(rawCell);
    if (Number.isNaN(impacts)) throw new GroundGuidedError('unparseable_cell', `Celda de la tabla no reconocida: "${rawCell}".`);
    return Object.assign(base, { noColumn: false, columnResult, cell, impacts });
  }

  // Banda de distancia de las páginas 5 y 8 (0 / 1 / ≥2) a partir de la distancia
  // contada desde el hexágono propio y de si la misión es de Área: en una misión
  // de Área, con destino también de área, se cuenta hasta un hexágono adyacente al
  // de la ficha de destino, es decir, uno menos (confirmado por el mantenedor,
  // 2026-10-07; §5.12.3 p. 75 y §5.13.3 p. 79: «0 // Misión de Área ≤1», «1 // ≤2»,
  // «≥2 // ≥3»). Devuelve '0' | '1' | '2plus', o null si falta la distancia o no se
  // sabe si la misión es de Área.
  function distanceBand(distanceHexes, areaMission) {
    if (distanceHexes === '' || distanceHexes === null || distanceHexes === undefined) return null;
    const d = Number(distanceHexes);
    if (Number.isNaN(d) || d < 0) return null;
    if (areaMission !== 'yes' && areaMission !== 'no') return null;
    const effective = areaMission === 'yes' ? Math.max(d - 1, 0) : d;
    if (effective <= 0) return '0';
    if (effective === 1) return '1';
    return '2plus';
  }

  return { GroundGuidedError, distanceBand, selectMethodRow, forceSizeBlocks, computeIntensityModifier, resolveGroundGuidedAttack };
});
