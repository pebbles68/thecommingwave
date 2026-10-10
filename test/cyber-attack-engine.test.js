// Pruebas del motor del ataque cibernético (public/js/cyber-attack-engine.js; Decision Book §14.3-§14.4)
// y de data/rules/cyber-attack.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/cyber-attack-engine.js');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules', 'cyber-attack.json'), 'utf8'));

const base = { restricted: 'no', attackPoints: 2, defenseUsed: 'no', attackSuccesses: 3, attackFailures: 1 };
const ev = (over) => engine.evaluateCyberAttack({ ...base, ...over });

test('cyber-attack.json: opcional, con fuentes, cinco objetivos con efecto y motivos con texto', () => {
  assert.equal(rules.optionalRule, true);
  assert.ok(rules.sourceRefs.length >= 2 && rules.sourceRefs.every((s) => s.document && s.section));
  assert.equal(rules.rollsPerPoint, engine.ROLLS_PER_POINT);
  assert.deepEqual(rules.targets.map((t) => t.section), ['14.4.1', '14.4.2', '14.4.3', '14.4.4', '14.4.5']);
  rules.targets.forEach((t) => assert.ok(t.label && (t.onSuccess || t.onSuccessTemplate), t.value));
  ['restricted_target', 'defense_counts_exceed', 'attack_counts_exceed'].forEach((k) => assert.ok(rules.reasons[k], k));
  assert.deepEqual(rules.table, { file: 'page-32.json', id: 'strategic-actions-outcome', column: 'cyber', hash: '#/ayuda/tablas/page-32.json/strategic-actions-outcome' });
  assert.equal(rules.pendingRules, undefined, 'el umbral ya consta en la tabla de la pág. 32');
});

test('cada punto de Capacidad da 3 tiradas', () => {
  assert.equal(engine.baseRolls(2), 6);
  assert.equal(engine.baseRolls(0), 0);
  assert.equal(engine.baseRolls(-1), null);
});

test('sin defensa: éxitos finales = éxitos − fracasos; hay éxito si son más de 0', () => {
  const r = ev({});
  assert.equal(r.attackRolls, 6);
  assert.equal(r.netSuccesses, 2);
  assert.equal(r.success, true);
  assert.equal(ev({ attackSuccesses: 2, attackFailures: 2 }).success, false);
  assert.equal(ev({ attackSuccesses: 0, attackFailures: 3 }).netSuccesses, -3);
});

test('la defensa quita una tirada por Éxito y añade una por Fracaso al atacante', () => {
  const r = ev({ defenseUsed: 'yes', defensePoints: 1, defenseSuccesses: 2, defenseFailures: 1, attackSuccesses: 2, attackFailures: 0 });
  assert.equal(r.defenseRolls, 3);
  assert.equal(r.attackRolls, 5);
  assert.equal(engine.attackRolls({ attackPoints: 1, defenseSuccesses: 0, defenseFailures: 3 }), 6);
  assert.equal(engine.attackRolls({ attackPoints: 1, defenseSuccesses: 3, defenseFailures: 0 }), 0, 'no baja de 0 tiradas');
});

test('no se pueden declarar más resultados que tiradas', () => {
  assert.deepEqual(ev({ defenseUsed: 'yes', defensePoints: 1, defenseSuccesses: 3, defenseFailures: 1 }).reasons, ['defense_counts_exceed']);
  assert.deepEqual(ev({ attackSuccesses: 6, attackFailures: 1 }).reasons, ['attack_counts_exceed']);
});

test('un objetivo restringido no admite el ataque', () => {
  const r = ev({ restricted: 'yes' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.reasons, ['restricted_target']);
});

test('con datos incompletos no decide', () => {
  assert.equal(engine.evaluateCyberAttack({}).ok, null);
  assert.equal(ev({ attackSuccesses: undefined }).ok, null);
  assert.equal(ev({ defenseUsed: 'yes' }).ok, null);
});
