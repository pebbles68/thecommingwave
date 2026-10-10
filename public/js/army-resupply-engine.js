// Motor puro del Reabastecimiento de Campo / Reabastecimiento Logístico del
// Ejército (roadmap Fase 14; data/rules/army-resupply.json + data/tables/
// page-32.json#army-logistics-resupply). Cita el Decision Book §8.11.3
// (p. 186) y la página 32 impresa de Tablas-de-combate 5.pdf. Sin "hoja de
// ayuda" con ejemplo resuelto: las pruebas verifican la mecánica contra la
// regla citada y contra celdas leídas de la página impresa.
//
//   §8.11.3  Una unidad principal "No Actuada" que no comparte hexágono con
//            unidades principales enemigas y puede recibir apoyo logístico
//            (Línea de Suministro sin cortar) lanza 1d10 y consulta la tabla
//            por su Nivel de Iniciativa (A-D). Éxito: +1 punto de fuerza, como
//            máximo hasta su límite impreso original. Tenga éxito o no, pasa a
//            "Acción Realizada".
//
// El texto de cada condición vive en el JSON de reglas; este módulo solo
// decide cuáles bloquean y lee la tabla. La Línea de Suministro no está
// modelada (capítulo 11): la declara el jugador.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArmyResupplyEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class ArmyResupplyError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'ArmyResupplyError';
      this.code = code;
    }
  }

  const LEVELS = ['A', 'B', 'C', 'D'];

  // `conditions` = `conditions` del JSON de reglas ({id, blocksWhen?}); `answers`
  // = {id: 'yes'|'no'|''}. Una condición bloquea cuando su respuesta no es la
  // esperada: por defecto hay que responder "yes"; con `blocksWhen: "yes"`,
  // bloquea responder "yes". Sin respuesta (`''`) la condición queda pendiente.
  function checkConditions(conditions, answers) {
    const blocking = [];
    const pending = [];
    conditions.forEach((c) => {
      const a = answers[c.id];
      if (a === undefined || a === '') { pending.push(c.id); return; }
      const blocks = c.blocksWhen === 'yes' ? a === 'yes' : a !== 'yes';
      if (blocks) blocking.push(c.id);
    });
    return { allowed: blocking.length === 0 && pending.length === 0, blocking, pending };
  }

  function toCount(value, label) {
    const n = Number(value);
    if (value === '' || value === undefined || value === null || Number.isNaN(n) || n < 0 || !Number.isInteger(n)) {
      throw new ArmyResupplyError('invalid_number', `${label} debe ser un número entero ≥ 0.`);
    }
    return n;
  }

  // `table` = army-logistics-resupply; `successCell` = texto de la celda de éxito
  // (del JSON de reglas). El aumento se limita al límite impreso original.
  function resolveArmyResupply(table, tableEngine, { initiativeLevel, roll, currentForce, printedForceLimit, successCell }) {
    const level = String(initiativeLevel || '').toUpperCase();
    if (!LEVELS.includes(level)) throw new ArmyResupplyError('invalid_level', 'El Nivel de Iniciativa debe ser A, B, C o D.');
    const natural = Number(roll);
    if (roll === '' || roll === undefined || roll === null || Number.isNaN(natural)) throw new ArmyResupplyError('invalid_roll', 'La tirada debe ser un número (1d10).');
    const current = toCount(currentForce, 'El tamaño de fuerza actual');
    const limit = toCount(printedForceLimit, 'El límite impreso de fuerza');
    if (current > limit) throw new ArmyResupplyError('force_above_limit', 'El tamaño de fuerza actual no puede superar el límite impreso.');

    const cell = tableEngine.resolveCell(table, natural, level);
    const success = cell.rawCell === successCell;
    const gained = success && current < limit ? 1 : 0;
    return {
      level, roll: natural, cell, success,
      cappedByLimit: success && current >= limit,
      currentForce: current, printedForceLimit: limit,
      gained, newForce: current + gained
    };
  }

  return { ArmyResupplyError, LEVELS, checkConditions, resolveArmyResupply };
});
