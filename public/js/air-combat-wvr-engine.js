// Motor puro del Combate Aéreo Cercano WVR (dentro del alcance visual) de una
// Interceptación de Combate Aéreo (roadmap Fase 11; data/workflows/05_combate_aereo.json,
// etapa `wvr` + data/tables/page-17.json). Cita el Decision Book §7.16.4,
// pp. 145-148. Sin "hoja de ayuda" con ejemplo resuelto: las pruebas verifican
// la mecánica contra la regla citada y contra celdas leídas de la página 17
// impresa (Tablas-de-combate 5.pdf).
//
//   punto 1  Patrulla en red: cada bando puede unir UN grupo CAPs (mismo nodo,
//            ≤ 4 hex). Escolta Electrónica (EEA) presente desde el inicio en un
//            bando: la patrulla en red del oponente solo se une en la 2.ª ronda.
//   punto 2  Cada bando suma el CA de sus unidades en combate; fila por misión
//            (CAPs / INK-DdE); 1d10 -> Puntos de Impacto; efectos simultáneos.
//            El jugador elige qué unidades absorben: 1 punto de daño por cada
//            Valor de Protección absorbido; el resto se ignora solo cuando es
//            menor que la Protección de cualquier unidad restante.
//   punto 3  Los CAPs dañados salen temporalmente de combate; grupo CAPs con
//            todas sus unidades fuera = "Derrotado"; Transporte Aéreo /
//            Lanzamiento de Suministros con una unidad dañada = "Derrotado".
//   punto 5  Otra ronda solo si ambos bandos son CAPs y ninguno está derrotado
//            ni se retira; ronda sin daño -> +1 acumulativo para ambos bandos
//            (se aplica a la tirada: supuesto `needs_review`).
//
// El motor no decide cuántos puntos de daño aguanta un avión antes de ser
// eliminado (la ficha lo dice): la eliminación la marca el jugador.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AirCombatWvrEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class AirCombatWvrError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'AirCombatWvrError';
      this.code = code;
    }
  }

  const SIDES = ['A', 'B'];
  const other = (side) => (side === 'A' ? 'B' : 'A');

  function toNumber(value, label) {
    const n = Number(value);
    if (value === '' || value === undefined || value === null || Number.isNaN(n)) {
      throw new AirCombatWvrError('invalid_number', `${label} debe ser un número.`);
    }
    return n;
  }

  // Punto 1: una unidad de la patrulla en red de un bando no entra en la
  // primera ronda (índice 0) si el OPONENTE tiene escolta electrónica.
  function joinsInRound(unit, roundIndex, opponentHasEea) {
    if (!unit.network) return true;
    return !(opponentHasEea && roundIndex === 0);
  }

  // Unidades de un bando que combaten en la ronda `roundIndex` con el estado
  // acumulado (`out`: ids que salieron de combate o fueron eliminados).
  function unitsInCombat(units, roundIndex, opponentHasEea, out) {
    return units.filter((u) => !out.has(u.id) && joinsInRound(u, roundIndex, opponentHasEea));
  }

  // Punto 2: suma de CA; una unidad sin CA (vacío) contribuye 0.
  function sumAirCombatValue(units) {
    return units.reduce((acc, u) => acc + (u.airCombatValue === '' || u.airCombatValue === undefined ? 0 : toNumber(u.airCombatValue, `El Valor de Combate Aéreo de ${u.name || u.id}`)), 0);
  }

  // Punto 2: ataque de un bando. CA total 0 -> no ataca. `columnScheme` null
  // con CA > 0 -> la fuente no da fila (`noRow`). Tirada + bonificación de
  // rondas sin daño; > 9 se lee en la fila 9 y se marca `rollClamped`.
  function resolveWvrAttack(table, tableEngine, { columnScheme, airCombatValue, roll, roundBonus }) {
    const value = toNumber(airCombatValue, 'El Valor de Combate Aéreo');
    const bonus = roundBonus === undefined ? 0 : toNumber(roundBonus, 'La bonificación de ronda');
    if (value <= 0) return { noAttack: true, airCombatValue: value, roundBonus: bonus, impacts: 0, cell: null };
    if (!columnScheme) return { noRow: true, airCombatValue: value, roundBonus: bonus, impacts: 0, cell: null };
    const natural = toNumber(roll, 'La tirada');
    const maxRow = Math.max(...table.rowAxis.values.map(Number));
    const modifiedRoll = natural + bonus;
    const rollClamped = modifiedRoll > maxRow;
    const rowValue = Math.min(modifiedRoll, maxRow);
    const base = { columnScheme, airCombatValue: value, naturalRoll: natural, roundBonus: bonus, modifiedRoll, rollClamped, rowValue };
    const labels = tableEngine.pickAxisLabels(table.columnAxis, columnScheme);
    if (tableEngine.matchAxisIndex(labels, value).index === -1) {
      return Object.assign(base, { noColumn: true, cell: null, impacts: 0 });
    }
    const cell = tableEngine.resolveCell(table, rowValue, value, { columnScheme });
    const impacts = cell.rawCell === '.' ? 0 : Number(cell.rawCell);
    if (Number.isNaN(impacts)) throw new AirCombatWvrError('unparseable_cell', `Celda de la tabla WVR no reconocida: "${cell.rawCell}".`);
    return Object.assign(base, { noColumn: false, cell, impacts });
  }

  // Punto 2: absorción elegida por el jugador. `damageByUnit` = {id: puntos de
  // daño}; cada punto consume la Protección de esa unidad. Devuelve lo
  // consumido, el remanente, si se ha asignado de más, y `mustAbsorbMore`
  // cuando el remanente todavía alcanza la Protección de alguna unidad que
  // combate y no ha quedado eliminada (la regla obliga a absorber siempre
  // que sea posible).
  function applyAbsorption({ impacts, units, damageByUnit, eliminatedIds }) {
    const eliminated = new Set(eliminatedIds || []);
    const imp = toNumber(impacts, 'Los Puntos de Impacto');
    let consumed = 0;
    const damaged = [];
    units.forEach((u) => {
      const raw = damageByUnit[u.id];
      const points = raw === '' || raw === undefined ? 0 : toNumber(raw, `El daño de ${u.name || u.id}`);
      if (points < 0) throw new AirCombatWvrError('invalid_damage', 'El daño no puede ser negativo.');
      if (points > 0) {
        consumed += points * toNumber(u.protection, `La Protección de ${u.name || u.id}`);
        damaged.push(u.id);
      }
    });
    const remaining = imp - consumed;
    const protections = units.filter((u) => !eliminated.has(u.id)).map((u) => toNumber(u.protection, `La Protección de ${u.name || u.id}`)).filter((p) => p >= 1);
    const minProtection = protections.length ? Math.min(...protections) : null;
    return {
      impacts: imp,
      consumed,
      remaining,
      overAllocated: remaining < 0,
      damaged,
      minProtection,
      mustAbsorbMore: remaining >= 0 && minProtection !== null && remaining >= minProtection
    };
  }

  // Punto 3: ¿derrotado? Solo hay regla para CAPs y Transporte/Suministros.
  function checkDefeat(groupType, units, out, damagedEver) {
    if (groupType === 'cap') return units.length > 0 && units.every((u) => out.has(u.id));
    if (groupType === 'transport') return units.some((u) => damagedEver.has(u.id));
    return false;
  }

  // Punto 5: bonificación de la ronda siguiente.
  function nextRoundBonus(previousBonus, anyDamage) {
    return anyDamage ? 0 : previousBonus + 1;
  }

  // Recorre las rondas confirmadas y la ronda en curso. `sides[k]` =
  // {groupType, eea, units:[{id,name,airCombatValue,protection,network}]};
  // `rounds[i]` = {rolls:{A,B}, damage:{A:{id:n},B:{id:n}}, eliminated:{A:[id],B:[id]}}.
  // `schemeFor(groupType)` traduce el tipo de grupo a la fila de la tabla.
  // Cada ronda devuelve, por bando, las unidades en combate, el CA, el ataque
  // y la absorción del daño RECIBIDO; y el estado tras la ronda.
  function replayRounds(table, tableEngine, { sides, rounds, schemeFor }) {
    const out = { A: new Set(), B: new Set() };
    const damagedEver = { A: new Set(), B: new Set() };
    let bonus = 0;
    const results = [];
    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];
      const per = {};
      SIDES.forEach((k) => {
        const inCombat = unitsInCombat(sides[k].units, i, Boolean(sides[other(k)].eea), out[k]);
        const ca = sumAirCombatValue(inCombat);
        let attack = null;
        let attackError = null;
        const roll = round.rolls ? round.rolls[k] : '';
        try {
          if (ca <= 0 || !schemeFor(sides[k].groupType) || (roll !== '' && roll !== undefined)) {
            attack = resolveWvrAttack(table, tableEngine, { columnScheme: schemeFor(sides[k].groupType), airCombatValue: ca, roll, roundBonus: bonus });
          }
        } catch (err) {
          attackError = err.message;
        }
        per[k] = { inCombat, airCombatValue: ca, attack, attackError };
      });
      SIDES.forEach((k) => {
        const incoming = per[other(k)].attack;
        per[k].absorption = incoming
          ? applyAbsorption({ impacts: incoming.impacts, units: per[k].inCombat, damageByUnit: (round.damage && round.damage[k]) || {}, eliminatedIds: (round.eliminated && round.eliminated[k]) || [] })
          : null;
      });
      const complete = SIDES.every((k) => per[k].attack && !per[k].attack.noRow && !per[k].attack.noColumn && per[k].absorption && !per[k].absorption.overAllocated);
      const roundBonus = bonus;
      let anyDamage = false;
      if (complete) {
        SIDES.forEach((k) => {
          const elim = new Set((round.eliminated && round.eliminated[k]) || []);
          per[k].absorption.damaged.forEach((id) => {
            anyDamage = true;
            damagedEver[k].add(id);
            // Punto 3: un CAPs dañado sale temporalmente de combate.
            if (sides[k].groupType === 'cap') out[k].add(id);
          });
          elim.forEach((id) => out[k].add(id));
          if (elim.size) anyDamage = true;
        });
        bonus = nextRoundBonus(bonus, anyDamage);
      }
      const defeated = {};
      SIDES.forEach((k) => { defeated[k] = complete && checkDefeat(sides[k].groupType, sides[k].units, out[k], damagedEver[k]); });
      const bothCaps = SIDES.every((k) => sides[k].groupType === 'cap');
      const anyLeft = SIDES.every((k) => sides[k].units.some((u) => !out[k].has(u.id)));
      results.push({
        index: i,
        roundBonus,
        sides: per,
        complete,
        anyDamage,
        defeated,
        nextBonus: complete ? bonus : null,
        canContinue: complete && bothCaps && !defeated.A && !defeated.B && anyLeft
      });
      if (!complete) break;
    }
    return { rounds: results, out, damagedEver };
  }

  return {
    AirCombatWvrError,
    joinsInRound,
    unitsInCombat,
    sumAirCombatValue,
    resolveWvrAttack,
    applyAbsorption,
    checkDefeat,
    nextRoundBonus,
    replayRounds
  };
});
