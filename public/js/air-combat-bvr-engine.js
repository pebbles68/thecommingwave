// Motor puro del Combate Aéreo BVR (más allá del alcance visual) de una
// Interceptación de Combate Aéreo (roadmap Fase 11; data/workflows/05_combate_aereo.json
// + data/tables/page-15.json y page-16.json). Cita el Decision Book §7.16.2
// (iniciativa y tipo de combate BVR) y §7.16.3 (resolución del ataque BVR),
// pp. 143-145. Sin "hoja de ayuda" con ejemplo resuelto: las pruebas verifican
// la mecánica contra la regla citada y contra celdas leídas de las páginas
// impresas 15-16 (Tablas-de-combate 5.pdf).
//
// El combate aéreo cercano (WVR, página 17) NO está en este módulo.
//
//   §7.16.2  Valor de Iniciativa (+1 por AWACS en red); el bando con el valor
//            más alto tiene ventaja; Diferencia -> DRM; 1d10 + DRM = total que
//            elige "Sin BVR" / "BVR Simultáneo" / "Ventaja BVR". Duelo sigiloso
//            (ambas unidades sigilosas) = "Sin BVR".
//   §7.16.3  Modificador electrónico (diferencia de Valores Electrónicos, para
//            el bando con el valor mayor) se suma a su tirada; la misión
//            (CAPs / INK) y la detección por AWACS eligen la fila de la
//            tabla; 1d10 -> Puntos de Impacto; 1 punto de daño por cada
//            Valor de Protección absorbido; los CAPs solo absorben 1 punto.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AirCombatBvrEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class AirCombatBvrError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'AirCombatBvrError';
      this.code = code;
    }
  }

  function toNumber(value, label) {
    const n = Number(value);
    if (value === '' || value === undefined || value === null || Number.isNaN(n)) {
      throw new AirCombatBvrError('invalid_number', `${label} debe ser un número.`);
    }
    return n;
  }

  // §7.16.2: Valor de Iniciativa de cada bando (+1 si su unidad atacante está
  // en red con un AWACS propio que detecta y expone al objetivo). `advantageSide`
  // es 'A', 'B' o null si empatan (diferencia 0: los jugadores deciden quién tira).
  function computeInitiative({ initiativeA, initiativeB, awacsA, awacsB }) {
    const valueA = toNumber(initiativeA, 'La Iniciativa del bando A') + (awacsA ? 1 : 0);
    const valueB = toNumber(initiativeB, 'La Iniciativa del bando B') + (awacsB ? 1 : 0);
    const difference = Math.abs(valueA - valueB);
    return { valueA, valueB, difference, advantageSide: valueA === valueB ? null : (valueA > valueB ? 'A' : 'B') };
  }

  // DRM de la tabla de la página 15 para la Diferencia de Iniciativa; con
  // diferencia 0 no hay modificación ("sin modificación de tirada de dispersión").
  function initiativeDrm(drmTable, tableEngine, difference) {
    if (difference === 0) return 0;
    const cell = tableEngine.resolveCell(drmTable, difference, 'DRM');
    return Number(cell.rawCell);
  }

  // Tipo de combate BVR (§7.16.2 punto 4 y tabla de resultado de la página 15).
  // `cellOutcomes` (workflow 05, `initiative.outcomeRule.cellOutcomes`) traduce el
  // texto de la celda a un id; los ids con "/" dependen de quién penetra:
  //   - "Penetración sigilosa / BVR simultánea": sigilosa si el que penetra lo es.
  //   - "Penetración exitosa / Interceptación con ventaja BVR": exitosa si el
  //     bando con ventaja es el que penetra; si no, ventaja del interceptor.
  function determineBvrType(outcomeTable, tableEngine, cellOutcomes, { total, context, penetratorSide, penetratorStealth, advantageSide, bothStealth }) {
    if (bothStealth) return { outcome: 'no_bvr', cell: null, reason: 'both_stealth' };
    const columnLabel = context === 'penetration' ? 'Interceptación de Penetración' : '(Interceptación de) Combate Aéreo';
    const cell = tableEngine.resolveCell(outcomeTable, total, columnLabel);
    const cellId = cellOutcomes[cell.rawCell];
    if (!cellId) throw new AirCombatBvrError('unknown_outcome', `Resultado de la tabla no reconocido: "${cell.rawCell}".`);
    let outcome = cellId;
    if (cellId === 'penetration_stealth_or_simultaneous') {
      outcome = penetratorStealth ? 'stealth_penetration' : 'simultaneous';
    } else if (cellId === 'penetration_success_or_interceptor_advantage') {
      outcome = advantageSide !== null && advantageSide === penetratorSide ? 'penetration_success' : 'interceptor_advantage';
    }
    return { outcome, cell, reason: null };
  }

  // §7.16.3 Paso 1: el bando con el Valor Electrónico mayor suma la diferencia a
  // su tirada BVR.
  function electronicModifier(electronicA, electronicB) {
    const a = toNumber(electronicA, 'El Valor Electrónico del bando A');
    const b = toNumber(electronicB, 'El Valor Electrónico del bando B');
    return { side: a === b ? null : (a > b ? 'A' : 'B'), modifier: Math.abs(a - b) };
  }

  // §7.16.3 Pasos 2-3: fila por misión/AWACS (`columnScheme`, null = canónico),
  // Valor de Combate Aéreo -> columna, 1d10 (+ modificador electrónico) -> celda.
  // La tabla solo tiene filas de tirada 0-9: una tirada modificada mayor se lee
  // en la última fila y se marca `rollClamped` (el reglamento no dice qué hacer;
  // supuesto explícito registrado en docs/rules/known-ambiguities.md).
  function resolveBvrAttack(table, tableEngine, { columnScheme, airCombatValue, roll, electronicBonus }) {
    const value = toNumber(airCombatValue, 'El Valor de Combate Aéreo');
    const natural = toNumber(roll, 'La tirada');
    const bonus = electronicBonus === undefined ? 0 : toNumber(electronicBonus, 'El modificador electrónico');
    const maxRow = Math.max(...table.rowAxis.values.map(Number));
    const modifiedRoll = natural + bonus;
    const rollClamped = modifiedRoll > maxRow;
    const rowValue = Math.min(modifiedRoll, maxRow);

    const scheme = columnScheme || undefined;
    const labels = tableEngine.pickAxisLabels(table.columnAxis, scheme);
    const base = { columnScheme: scheme, airCombatValue: value, naturalRoll: natural, electronicBonus: bonus, modifiedRoll, rollClamped, rowValue };
    if (tableEngine.matchAxisIndex(labels, value).index === -1) {
      const numeric = labels.map((l) => Number(String(l).replace('+', ''))).filter((n) => !Number.isNaN(n));
      const above = numeric.length > 0 && value > Math.max(...numeric);
      return Object.assign(base, { noColumn: true, noColumnReason: above ? 'above_table' : 'below_table', cell: null, impacts: 0 });
    }
    const cell = tableEngine.resolveCell(table, rowValue, value, { columnScheme: scheme });
    const impacts = cell.rawCell === '.' ? 0 : Number(cell.rawCell);
    if (Number.isNaN(impacts)) throw new AirCombatBvrError('unparseable_cell', `Celda de la tabla BVR no reconocida: "${cell.rawCell}".`);
    return Object.assign(base, { noColumn: false, cell, impacts });
  }

  // §7.16.3 Paso 4: 1 punto de daño por cada Valor de Protección absorbido
  // (división entera); los CAPs solo absorben 1 punto de daño y "salen
  // temporalmente de combate"; el resto de impactos se ignora.
  function resolveBvrDamage({ impacts, protection, targetIsCaps }) {
    const imp = toNumber(impacts, 'Los Puntos de Impacto');
    const pro = toNumber(protection, 'El Valor de Protección');
    if (pro < 1) throw new AirCombatBvrError('invalid_protection', 'El Valor de Protección debe ser 1 o mayor.');
    const rawDamage = Math.floor(imp / pro);
    const damage = targetIsCaps ? Math.min(rawDamage, 1) : rawDamage;
    return { impacts: imp, protection: pro, rawDamage, damage, exitsCombat: Boolean(targetIsCaps) && damage >= 1, capsCapped: Boolean(targetIsCaps) && rawDamage > 1 };
  }

  return { AirCombatBvrError, computeInitiative, initiativeDrm, determineBvrType, electronicModifier, resolveBvrAttack, resolveBvrDamage };
});
