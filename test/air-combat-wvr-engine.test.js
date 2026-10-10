// Pruebas del motor de Combate Aéreo Cercano WVR (public/js/air-combat-wvr-engine.js;
// Decision Book §7.16.4) y de los datos de la etapa `wvr` del workflow 05. Los
// valores esperados de celda están leídos de la página 17 impresa de
// Tablas-de-combate 5.pdf (render a 110 DPI, 2026-10-04), no derivados del motor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/air-combat-wvr-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const workflow = readJson('workflows/05_combate_aereo.json');
const page17 = readJson('tables/page-17.json').tables[0];
const wvrStage = workflow.stages.find((s) => s.id === 'wvr');
const groupTypes = wvrStage.roundRule.groupTypes;
const schemeFor = (type) => (groupTypes.find((g) => g.value === type) || {}).columnScheme || null;

const attack = (o) => engine.resolveWvrAttack(page17, tableEngine, o);

// --- Datos ---

test('workflow 05 / wvr: roundRule con tipos de grupo, textos de regla y sourceRefs del Decision Book §7.16.4', () => {
  const rule = wvrStage.roundRule;
  assert.deepEqual(groupTypes.map((g) => [g.value, g.columnScheme]), [['cap', 'caps'], ['intercept', 'intercepcion_dde'], ['transport', null], ['other', null]]);
  groupTypes.filter((g) => g.columnScheme).forEach((g) => assert.ok(page17.columnAxis.alternateLabelSets[g.columnScheme], g.value));
  ['participation', 'networkPatrol', 'electronicEscort', 'noAirCombatValue', 'absorption', 'exitAndDefeat', 'nextRound', 'noDamageBonus', 'noDamageBonusApplication', 'groupTypesNote'].forEach((k) => assert.ok(rule[k], k));
  ['order', 'cap', 'intercept', 'sustained', 'other'].forEach((k) => assert.ok(rule.withdrawal[k], k));
  assert.ok(rule.sourceRefs.some((r) => /7\.16\.4/.test(r.section)));
});

test('los tipos de grupo CAPs e INK/DdE usan la misma fila que la pregunta `condition` del workflow', () => {
  const cond = wvrStage.questions.find((q) => q.id === 'condition');
  cond.options.forEach((o) => assert.equal(schemeFor(o.value), o.columnScheme, o.value));
});

// --- Ataque (página 17) ---

test('CAPs (fila "Patrulla Aérea"): CA 5 -> columna «3~6»; tirada 4 -> 3 impactos; tirada 0 -> 1', () => {
  const r = attack({ columnScheme: 'caps', airCombatValue: 5, roll: 4 });
  assert.equal(r.cell.columnLabel, '3~6');
  assert.equal(r.impacts, 3);
  assert.equal(attack({ columnScheme: 'caps', airCombatValue: 5, roll: 0 }).impacts, 1);
});

test('INK/DdE (fila "Intercepción/Despegue"): CA 5 -> columna «4~6»; tirada 4 -> 4 impactos', () => {
  const r = attack({ columnScheme: 'intercepcion_dde', airCombatValue: 5, roll: 4 });
  assert.equal(r.cell.columnLabel, '4~6');
  assert.equal(r.impacts, 4);
});

test('columna más baja: CAPs CA 1 (tirada 4 -> sin impactos, 5 -> 1); INK/DdE CA 1 usa la columna «1» (tirada 1 -> sin impactos, 2 -> 1)', () => {
  assert.equal(attack({ columnScheme: 'caps', airCombatValue: 1, roll: 4 }).impacts, 0);
  assert.equal(attack({ columnScheme: 'caps', airCombatValue: 1, roll: 5 }).impacts, 1);
  const ink = attack({ columnScheme: 'intercepcion_dde', airCombatValue: 1, roll: 1 });
  assert.equal(ink.cell.columnLabel, '1');
  assert.equal(ink.impacts, 0);
  assert.equal(attack({ columnScheme: 'intercepcion_dde', airCombatValue: 1, roll: 2 }).impacts, 1);
});

test('columna abierta: CAPs CA 60 -> «49+», tirada 9 -> 11; INK/DdE CA 30 -> «25+», tirada 7 -> 10', () => {
  assert.equal(attack({ columnScheme: 'caps', airCombatValue: 60, roll: 9 }).impacts, 11);
  assert.equal(attack({ columnScheme: 'intercepcion_dde', airCombatValue: 30, roll: 7 }).impacts, 10);
});

test('CA total 0 -> no ataca (sin pedir tirada); misión sin fila con CA > 0 -> noRow, sin inventar celda', () => {
  assert.equal(attack({ columnScheme: 'caps', airCombatValue: 0, roll: '' }).noAttack, true);
  const r = attack({ columnScheme: null, airCombatValue: 4, roll: 3 });
  assert.equal(r.noRow, true);
  assert.equal(r.cell, null);
});

test('bonificación de rondas sin daño: se suma a la tirada; > 9 se lee en la fila 9 (rollClamped)', () => {
  const r = attack({ columnScheme: 'caps', airCombatValue: 5, roll: 3, roundBonus: 2 });
  assert.deepEqual([r.modifiedRoll, r.rowValue, r.rollClamped, r.impacts], [5, 5, false, 3]);
  const c = attack({ columnScheme: 'caps', airCombatValue: 5, roll: 8, roundBonus: 2 });
  assert.deepEqual([c.modifiedRoll, c.rowValue, c.rollClamped, c.impacts], [10, 9, true, 4]);
});

// --- Participación, absorción, derrota ---

test('patrulla en red: entra en la ronda 1 salvo que el oponente tenga escolta electrónica (entonces en la 2)', () => {
  const net = { id: 'n', network: true };
  assert.equal(engine.joinsInRound(net, 0, false), true);
  assert.equal(engine.joinsInRound(net, 0, true), false);
  assert.equal(engine.joinsInRound(net, 1, true), true);
  assert.equal(engine.joinsInRound({ id: 'm', network: false }, 0, true), true);
});

test('suma de CA: una unidad sin CA (vacío) aporta 0', () => {
  assert.equal(engine.sumAirCombatValue([{ id: 'a', airCombatValue: 3 }, { id: 'h', airCombatValue: '' }, { id: 'b', airCombatValue: '2' }]), 5);
});

test('absorción: 1 punto de daño consume la Protección; el remanente menor que toda Protección se ignora', () => {
  const units = [{ id: 'a', protection: 2 }, { id: 'b', protection: 3 }];
  const ok = engine.applyAbsorption({ impacts: 4, units, damageByUnit: { b: 1 } });
  assert.deepEqual([ok.consumed, ok.remaining, ok.mustAbsorbMore, ok.overAllocated], [3, 1, false, false]);
  const more = engine.applyAbsorption({ impacts: 4, units, damageByUnit: {} });
  assert.equal(more.mustAbsorbMore, true);
  const over = engine.applyAbsorption({ impacts: 4, units, damageByUnit: { a: 1, b: 1 } });
  assert.equal(over.overAllocated, true);
});

test('derrota: CAPs con todas sus unidades fuera; Transporte con una unidad dañada; INK nunca por esta regla', () => {
  const units = [{ id: 'a' }, { id: 'b' }];
  assert.equal(engine.checkDefeat('cap', units, new Set(['a']), new Set(['a'])), false);
  assert.equal(engine.checkDefeat('cap', units, new Set(['a', 'b']), new Set(['a', 'b'])), true);
  assert.equal(engine.checkDefeat('transport', units, new Set(), new Set(['b'])), true);
  assert.equal(engine.checkDefeat('intercept', units, new Set(['a', 'b']), new Set(['a', 'b'])), false);
});

test('bonificación: ronda sin daño -> +1 acumulativo; cualquier daño la restablece a 0', () => {
  assert.equal(engine.nextRoundBonus(0, false), 1);
  assert.equal(engine.nextRoundBonus(1, false), 2);
  assert.equal(engine.nextRoundBonus(2, true), 0);
});

// --- Rondas encadenadas ---

const capsDuel = () => ({
  A: { groupType: 'cap', eea: true, units: [{ id: 'a1', name: 'F-15J', airCombatValue: 3, protection: 2 }, { id: 'a2', name: 'EA-18G', airCombatValue: 2, protection: 3 }] },
  B: { groupType: 'cap', eea: false, units: [{ id: 'b1', name: 'J-16', airCombatValue: 4, protection: 2 }, { id: 'b2', name: 'J-11 (red)', airCombatValue: 3, protection: 2, network: true }] }
});

test('replay: escolta EW de A retrasa la patrulla en red de B a la ronda 2; ronda sin daño da +1 a la siguiente', () => {
  const sides = capsDuel();
  // Ronda 1: A CA 5 (caps «3~6»), tirada 0 -> 1 impacto; B CA 4 sin el J-11 (caps «3~6»), tirada 0 -> 1 impacto.
  // Ningún impacto alcanza la Protección mínima (2): no hay daño.
  const rounds = [{ rolls: { A: '0', B: '0' }, damage: { A: {}, B: {} }, eliminated: { A: [], B: [] } }];
  const r = engine.replayRounds(page17, tableEngine, { sides, rounds, schemeFor }).rounds[0];
  assert.deepEqual(r.sides.B.inCombat.map((u) => u.id), ['b1']);
  assert.deepEqual([r.sides.A.airCombatValue, r.sides.B.airCombatValue], [5, 4]);
  assert.deepEqual([r.sides.A.attack.impacts, r.sides.B.attack.impacts], [1, 1]);
  assert.equal(r.complete, true);
  assert.equal(r.anyDamage, false);
  assert.equal(r.nextBonus, 1);
  assert.equal(r.canContinue, true);

  // Ronda 2: entra el J-11 (B CA 7 -> «7~12»); bonificación +1: A tirada 4+1=5 -> 3; B tirada 3+1=4 -> 4.
  rounds.push({ rolls: { A: '4', B: '3' }, damage: { A: { a1: 1 }, B: { b1: 1 } }, eliminated: { A: [], B: [] } });
  const r2 = engine.replayRounds(page17, tableEngine, { sides, rounds, schemeFor }).rounds[1];
  assert.deepEqual(r2.sides.B.inCombat.map((u) => u.id), ['b1', 'b2']);
  assert.equal(r2.roundBonus, 1);
  assert.deepEqual([r2.sides.A.attack.impacts, r2.sides.B.attack.impacts], [3, 4]);
  // A recibe 4 y el F-15J absorbe 2: los 2 restantes aún alcanzan una Protección 2, así que la regla pide seguir absorbiendo.
  assert.equal(r2.sides.A.absorption.mustAbsorbMore, true);
  assert.equal(r2.anyDamage, true);
  assert.equal(r2.nextBonus, 0);
  assert.equal(r2.canContinue, true);
});

test('replay: CAPs dañados salen de combate; si salen todos, el grupo queda Derrotado y no hay otra ronda', () => {
  const sides = {
    A: { groupType: 'cap', eea: false, units: [{ id: 'a1', airCombatValue: 6, protection: 2 }] },
    B: { groupType: 'cap', eea: false, units: [{ id: 'b1', airCombatValue: 1, protection: 2 }] }
  };
  // A CA 6 (caps «3~6»), tirada 9 -> 4 impactos; B CA 1 (caps «1»), tirada 0 -> sin impactos.
  const rounds = [{ rolls: { A: '9', B: '0' }, damage: { A: {}, B: { b1: 1 } }, eliminated: { A: [], B: [] } }];
  const { rounds: res, out } = engine.replayRounds(page17, tableEngine, { sides, rounds, schemeFor });
  assert.equal(res[0].sides.A.attack.impacts, 4);
  assert.ok(out.B.has('b1'));
  assert.deepEqual(res[0].defeated, { A: false, B: true });
  assert.equal(res[0].canContinue, false);
});

test('replay: si un bando no es CAPs no hay otra ronda; misión sin fila deja la ronda incompleta', () => {
  const sides = {
    A: { groupType: 'intercept', eea: false, units: [{ id: 'a1', airCombatValue: 4, protection: 2 }] },
    B: { groupType: 'cap', eea: false, units: [{ id: 'b1', airCombatValue: 4, protection: 2 }] }
  };
  const res = engine.replayRounds(page17, tableEngine, { sides, rounds: [{ rolls: { A: '0', B: '0' }, damage: { A: {}, B: {} } }], schemeFor }).rounds[0];
  assert.equal(res.complete, true);
  assert.equal(res.canContinue, false);
  sides.A.groupType = 'other';
  const blocked = engine.replayRounds(page17, tableEngine, { sides, rounds: [{ rolls: { A: '0', B: '0' }, damage: { A: {}, B: {} } }], schemeFor }).rounds[0];
  assert.equal(blocked.sides.A.attack.noRow, true);
  assert.equal(blocked.complete, false);
});

test('absorción: una unidad eliminada en la ronda no cuenta para exigir seguir absorbiendo', () => {
  const units = [{ id: 'a', protection: 2 }];
  assert.equal(engine.applyAbsorption({ impacts: 6, units, damageByUnit: { a: 1 } }).mustAbsorbMore, true);
  assert.equal(engine.applyAbsorption({ impacts: 6, units, damageByUnit: { a: 1 }, eliminatedIds: ['a'] }).mustAbsorbMore, false);
});
