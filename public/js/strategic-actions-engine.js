// Motor puro de las Acciones Estratégicas (roadmap Fase 14): lectura de la tabla de resultados de la página 32
// impresa de Tablas-de-combate 5.pdf (data/tables/page-32.json#strategic-actions-outcome) y mecánica de la
// Guerra Espacial del Decision Book §14.5-§14.9 (pp. 246-251). Los textos viven en data/rules/space-war.json y
// data/rules/cyber-attack.json; aquí solo se decide y se calcula.
//
//   Tabla: filas 0-9 (resultado del d10); columnas «Guerra Cibernética», «Destrucción Espacial»,
//   «Fragmentos Espaciales (Reacción)» y «Desaparición de Fragmentos (Fase Espacial)».
//   §14.5.3  Orden de las acciones activas: empieza quien tenga menos Recursos de Lanzamiento; si empatan, quien
//            tenga más Recursos Orbitales; si vuelven a empatar, 1d10 y el más alto elige; si repiten, se vuelve a tirar.
//   §14.7    Ataque Duro / Blando / Orbital: costes, tiradas y efectos.
//   §14.8.1  Maniobra Orbital: -2 tiradas del enemigo en un Ataque Duro u Orbital.
//   §14.9    Escombros: tirada de Tormenta (1d10 + escombros presentes; «Impacto» = Colisión) y desaparición.
//
// Que una suma por encima de 9 se lea en la última fila de la tabla (9) es una extensión mínima: la tabla solo
// llega a 9 y los resultados altos no pueden ser más benignos (ver docs/rules/known-ambiguities.md).
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StrategicActionsEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLUMNS = Object.freeze({ cyber: 0, destruction: 1, debrisStorm: 2, debrisVanish: 3 });
  const isInt = (n) => Number.isInteger(n);

  // «3 7 0 9» o «3, 7, 0, 9» → [3, 7, 0, 9]. null si algún valor no es una cifra 0-9.
  function parseRolls(text) {
    const parts = String(text === undefined || text === null ? '' : text).split(/[\s,;]+/).filter(Boolean);
    const rolls = parts.map((p) => (/^\d$/.test(p) ? Number(p) : NaN));
    return rolls.some(Number.isNaN) ? null : rolls;
  }

  // Texto de la celda (fila = resultado 0-9, columna por nombre en COLUMNS); sumas > 9 se leen en la fila 9.
  function cell(table, column, roll) {
    if (!table || !isInt(roll) || roll < 0) return null;
    const row = table.cells[Math.min(roll, 9)];
    return row ? row[COLUMNS[column]] : null;
  }

  // Éxito / Fallo / Impacto / none (celda «.») de una celda.
  function kindOfCell(text) {
    if (text === 'Éxito') return 'success';
    if (text === 'Fallo') return 'failure';
    if (text === 'Impacto') return 'impact';
    return 'none';
  }

  function tallyRolls(table, column, rolls) {
    const t = { successes: 0, failures: 0, none: 0 };
    rolls.forEach((r) => {
      const k = kindOfCell(cell(table, column, r));
      if (k === 'success') t.successes += 1;
      else if (k === 'failure') t.failures += 1;
      else t.none += 1;
    });
    return t;
  }

  // §14.5.3. `launch`/`orbital` = recursos disponibles de cada bando; `tieRollA/B` solo si empatan en ambos.
  function actionOrder({ launchA, launchB, orbitalA, orbitalB, tieRollA, tieRollB }) {
    if (![launchA, launchB, orbitalA, orbitalB].every((n) => isInt(n) && n >= 0)) return { status: 'incomplete' };
    if (launchA !== launchB) return { status: 'decided', first: launchA < launchB ? 'A' : 'B', by: 'launch' };
    if (orbitalA !== orbitalB) return { status: 'decided', first: orbitalA > orbitalB ? 'A' : 'B', by: 'orbital' };
    if (!isInt(tieRollA) || !isInt(tieRollB)) return { status: 'needs_roll' };
    if (tieRollA === tieRollB) return { status: 'reroll' };
    return { status: 'decided', chooser: tieRollA > tieRollB ? 'A' : 'B', by: 'dice' };
  }

  const DESTRUCTION_KINDS = Object.freeze({
    hard: { rolls: 3, ownCost: 'destroy_launch', debrisOnSuccess: 2, debrisOnFailure: 1 },
    soft: { rolls: 1, ownCost: 'consume_launch', debrisOnSuccess: 0, debrisOnFailure: 0 },
    orbital: { rolls: 3, ownCost: 'destroy_orbital', debrisOnSuccess: 2, debrisOnFailure: 1 }
  });

  // Tiradas que debe hacer el atacante; la Maniobra Orbital (§14.8.1) las reduce en 2 en Duro y Orbital.
  function destructionRolls(kind, maneuver) {
    const k = DESTRUCTION_KINDS[kind];
    if (!k) return null;
    return maneuver === 'yes' && kind !== 'soft' ? Math.max(0, k.rolls - 2) : k.rolls;
  }

  // §14.7: efecto de un ataque con las tiradas ya hechas. `enemyOrbital` = recursos orbitales disponibles del enemigo.
  function resolveDestruction({ table, kind, maneuver, rolls, enemyOrbital }) {
    const k = DESTRUCTION_KINDS[kind];
    const expected = destructionRolls(kind, maneuver);
    if (!k || !Array.isArray(rolls)) return null;
    if (rolls.length !== expected) return { error: 'wrong_roll_count', expected };
    const tally = tallyRolls(table, 'destruction', rolls);
    const wanted = kind === 'soft' ? Math.min(1, tally.successes) : tally.successes;
    const destroyed = isInt(enemyOrbital) ? Math.min(wanted, enemyOrbital) : wanted;
    return {
      expected,
      ...tally,
      ownCost: k.ownCost,
      enemyOrbitalLost: destroyed,
      enemyOrbitalLostKind: kind === 'soft' ? 'consumed' : 'destroyed',
      capped: destroyed < wanted,
      debrisGenerated: tally.successes * k.debrisOnSuccess + tally.failures * k.debrisOnFailure
    };
  }

  // §14.9: Tormenta de Escombros. «Impacto» en la tabla = Colisión.
  function debrisStorm({ table, roll, debris }) {
    if (!isInt(roll) || roll < 0 || roll > 9 || !isInt(debris) || debris < 0) return null;
    const total = roll + debris;
    const text = cell(table, 'debrisStorm', total);
    return { total, clamped: total > 9, collision: kindOfCell(text) === 'impact' };
  }

  // §14.9: al inicio de cada Fase Espacial se tira 1d10 y desaparecen tantos escombros como indica la tabla (0 = ninguno).
  function debrisVanish({ table, roll, debris }) {
    if (!isInt(roll) || roll < 0 || roll > 9 || !isInt(debris) || debris < 0) return null;
    const text = cell(table, 'debrisVanish', roll);
    const n = /^\d+$/.test(text) ? Number(text) : 0;
    return { removed: Math.min(n, debris), tableValue: n, remaining: debris - Math.min(n, debris) };
  }

  return { COLUMNS, DESTRUCTION_KINDS, parseRolls, cell, kindOfCell, tallyRolls, actionOrder, destructionRolls, resolveDestruction, debrisStorm, debrisVanish };
});
