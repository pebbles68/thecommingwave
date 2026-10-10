// Pruebas del motor de logística de puerto y munición (public/js/port-logistics-engine.js;
// Decision Book §9.9.4, §9.9.5, §11.6) y de data/rules/port-logistics.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/port-logistics-engine.js');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules', 'port-logistics.json'), 'utf8'));

test('port-logistics.json: fuentes, operaciones con texto y todos los motivos y textos usados por el motor', () => {
  assert.ok(rules.sourceRefs.length >= 2 && rules.sourceRefs.every((s) => s.document && s.section));
  assert.deepEqual(rules.operations.map((o) => o.value), ['ammo_resupply', 'ship_repair', 'emergency_repair', 'ammo_depletion', 'supply_node_decay']);
  ['not_in_waiting_area', 'over_port_value', 'not_damaged', 'multi_ship', 'not_in_port', 'already_tried', 'no_dock']
    .forEach((k) => assert.ok(rules.reasons[k], `falta el motivo ${k}`));
  ['repair_success', 'repair_failure', 'emergency_when', 'depletion_zero', 'depletion_reduced', 'ammo_resupply_effect']
    .forEach((k) => assert.ok(rules.texts[k], `falta el texto ${k}`));
});

test('reabastecimiento: limitado por el valor del puerto y por el área de espera', () => {
  assert.deepEqual(engine.evaluateResupply({ units: 2, portValue: 3, inWaitingArea: 'yes' }), { ok: true, reasons: [], resupplied: 2, left: 0 });
  const over = engine.evaluateResupply({ units: 5, portValue: 3, inWaitingArea: 'yes' });
  assert.equal(over.resupplied, 3);
  assert.equal(over.left, 2);
  assert.deepEqual(over.reasons, ['over_port_value']);
  const out = engine.evaluateResupply({ units: 2, portValue: 3, inWaitingArea: 'no' });
  assert.equal(out.resupplied, 0);
  assert.deepEqual(out.reasons, ['not_in_waiting_area']);
  assert.equal(engine.evaluateResupply({ units: 2 }).ok, null);
});

test('reparación: éxito solo si 1d10 es menor que REP', () => {
  const base = { inPort: 'yes', damaged: 'yes', multiShip: 'no', alreadyTried: 'no', shipsInDock: 1, docks: 2, rep: 6 };
  assert.equal(engine.evaluateRepair({ ...base, roll: 5 }).success, true);
  assert.equal(engine.evaluateRepair({ ...base, roll: 6 }).success, false);
  assert.equal(engine.evaluateRepair({ ...base, roll: 10 }).success, false);
  assert.equal(engine.evaluateRepair({ ...base, roll: 1, rep: 1 }).success, false);
  assert.equal(engine.evaluateRepair({ ...base }).success, null);
  assert.equal(engine.evaluateRepair({ ...base, roll: 11 }).success, null);
});

test('reparación: requisitos del buque y del dique', () => {
  const base = { inPort: 'yes', damaged: 'yes', multiShip: 'no', alreadyTried: 'no', shipsInDock: 1, docks: 1, rep: 6, roll: 2 };
  assert.deepEqual(engine.evaluateRepair({ ...base, damaged: 'no' }).reasons, ['not_damaged']);
  assert.deepEqual(engine.evaluateRepair({ ...base, multiShip: 'yes' }).reasons, ['multi_ship']);
  assert.deepEqual(engine.evaluateRepair({ ...base, inPort: 'no' }).reasons, ['not_in_port']);
  assert.deepEqual(engine.evaluateRepair({ ...base, alreadyTried: 'yes' }).reasons, ['already_tried']);
  assert.deepEqual(engine.evaluateRepair({ ...base, shipsInDock: 2 }).reasons, ['no_dock']);
  assert.equal(engine.evaluateRepair({ ...base, damaged: 'no' }).eligible, false);
  assert.deepEqual(engine.evaluateRepair({ multiShip: 'yes' }).reasons, ['multi_ship']);
  assert.equal(engine.evaluateRepair({}).eligible, null);
});

test('reparaciones de emergencia: se eliminan tantos marcadores como RR, sin pasar de los que hay', () => {
  assert.deepEqual(engine.evaluateEmergencyRepair({ rr: 2, markers: 5 }), { removed: 2, remaining: 3 });
  assert.deepEqual(engine.evaluateEmergencyRepair({ rr: 4, markers: 1 }), { removed: 1, remaining: 0 });
  assert.equal(engine.evaluateEmergencyRepair({ rr: 2 }).removed, null);
});

test('agotamiento: el valor de ataque baja a la munición restante', () => {
  assert.deepEqual(engine.evaluateDepletion({ remaining: 3, attackValue: 5 }), { effective: 3, reduced: true, exhausted: false });
  assert.deepEqual(engine.evaluateDepletion({ remaining: 6, attackValue: 5 }), { effective: 5, reduced: false, exhausted: false });
  assert.deepEqual(engine.evaluateDepletion({ remaining: 0, attackValue: 5 }), { effective: 0, reduced: true, exhausted: true });
});

test('desgaste de Nodos de Suministro Ordinarios: baja 1 nivel si dio garantía, se elimina al llegar a 0 (§11.2.2)', () => {
  assert.deepEqual(engine.evaluateNodeDecay({ level: 3, providedSupply: 'yes' }), { newLevel: 2, eliminated: false, changed: true });
  assert.deepEqual(engine.evaluateNodeDecay({ level: 1, providedSupply: 'yes' }), { newLevel: 0, eliminated: true, changed: true });
  assert.deepEqual(engine.evaluateNodeDecay({ level: 2, providedSupply: 'no' }), { newLevel: 2, eliminated: false, changed: false });
  assert.equal(engine.evaluateNodeDecay({ level: 2 }).newLevel, null);
  assert.ok(rules.operations.some((o) => o.value === 'supply_node_decay') && rules.texts.node_decay_rule);
});
