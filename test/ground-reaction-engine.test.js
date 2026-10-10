// Fase 10: Ataques de Reacción terrestres (Decision Book §5.16, §8.5.6, §8.7.8).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../public/js/ground-reaction-engine.js');

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules', 'ground-reactions.json'), 'utf8'));

test('cada hecho desencadena su reacción: CF, AS, KB y BAI', () => {
  assert.equal(E.reactionForTrigger(rules, 'artillery_assigned_cas').id, 'cf');
  assert.equal(E.reactionForTrigger(rules, 'artillery_attacked_or_aa_fired').id, 'as');
  assert.equal(E.reactionForTrigger(rules, 'main_unit_defeated').id, 'kb');
  assert.equal(E.reactionForTrigger(rules, 'unit_moving').id, 'bai');
  assert.equal(E.reactionForTrigger(rules, 'nada'), null);
});

test('los datos son coherentes: tipos de atacante declarados, condiciones y consecuencias por tipo, fuente en cada reacción', () => {
  const kinds = rules.attackerKinds.map((k) => k.id);
  rules.reactions.forEach((r) => {
    assert.ok(r.sourceRef && r.sourceRef.section && r.sourceRef.page, `${r.id}: sin fuente`);
    r.attackerKinds.forEach((k) => {
      assert.ok(kinds.includes(k), `${r.id}: tipo ${k} sin declarar`);
      assert.ok(r.attackerConditions[k], `${r.id}/${k}: sin condición de posición`);
      assert.ok(r.aftermath[k], `${r.id}/${k}: sin consecuencia`);
    });
  });
});

test('solo las Operaciones de Contrabatería admiten artillería como atacante (§5.16)', () => {
  assert.ok(E.findReaction(rules, 'cf').attackerKinds.includes('artillery_fire'));
  ['as', 'kb', 'bai'].forEach((id) => assert.ok(!E.findReaction(rules, id).attackerKinds.includes('artillery_fire'), id));
  const res = E.evaluateAttacker(rules, 'kb', { kind: 'artillery_fire', inPosition: 'yes' });
  assert.equal(res.eligible, false);
  assert.match(res.reasons[0], /no puede ejecutar Persecución Aérea/);
});

test('unidad aérea ON CALL: debe cumplir la posición y no haber hecho ya un ataque dinámico; en CF y AS su alcance sube +1', () => {
  const ok = E.evaluateAttacker(rules, 'cf', { kind: 'air_on_call', inPosition: 'yes', alreadyDynamic: 'no' });
  assert.equal(ok.eligible, true);
  assert.deepEqual(ok.notes, ['El alcance de su plan de ataque terrestre aumenta en +1.']);
  assert.equal(E.evaluateAttacker(rules, 'kb', { kind: 'air_on_call', inPosition: 'yes', alreadyDynamic: 'no' }).notes.length, 0);
  const far = E.evaluateAttacker(rules, 'as', { kind: 'air_on_call', inPosition: 'no', alreadyDynamic: 'no' });
  assert.equal(far.eligible, false);
  const twice = E.evaluateAttacker(rules, 'bai', { kind: 'air_on_call', inPosition: 'yes', alreadyDynamic: 'yes' });
  assert.equal(twice.eligible, false);
  assert.match(twice.reasons[0], /solo puede realizar un ataque dinámico/);
  assert.match(twice.reasons[0], /Apoyo Aéreo Cercano/);
});

test('el límite de un ataque dinámico vale también para la aviación del ejército (baja altitud) y el CAS cuenta como ataque dinámico', () => {
  const lowAlt = { kind: 'low_altitude_operational', inPosition: 'yes' };
  assert.equal(E.evaluateAttacker(rules, 'kb', { ...lowAlt, alreadyDynamic: 'no' }).eligible, true);
  const twice = E.evaluateAttacker(rules, 'kb', { ...lowAlt, alreadyDynamic: 'yes' });
  assert.equal(twice.eligible, false);
  assert.match(twice.reasons[0], /por salida o fase/);
  assert.equal(E.evaluateAttacker(rules, 'bai', lowAlt).pending, true, 'sin contestar si ya hizo un ataque dinámico queda pendiente');
  assert.match(rules.generalRules.find((g) => g.id === 'cas').text, /El CAS es también un ataque dinámico/);
  assert.match(rules.generalRules.find((g) => g.id === 'one-dynamic').text, /Apoyo Aéreo Cercano \(CAS\), Contrabatería \(CF\)/);
});

test('el terreno se tiene en cuenta salvo que la regla lo quite (BAI y KB); CF y AS lo conservan', () => {
  ['cf', 'as'].forEach((id) => assert.equal(E.attackSettings(rules, id).targetGetsTerrainBonus, true, id));
  ['kb', 'bai'].forEach((id) => assert.equal(E.attackSettings(rules, id).targetGetsTerrainBonus, false, id));
  assert.match(rules.generalRules.find((g) => g.id === 'terrain').text, /siempre se tiene en cuenta el terreno/);
});

test('artillería en Contrabatería: sin CAS, con munición y una sola vez por enfrentamiento', () => {
  const base = { kind: 'artillery_fire', inPosition: 'yes', usesCas: 'no', hasAmmo: 'yes', alreadyDidCf: 'no' };
  assert.equal(E.evaluateAttacker(rules, 'cf', base).eligible, true);
  assert.equal(E.evaluateAttacker(rules, 'cf', { ...base, usesCas: 'yes' }).eligible, false);
  assert.equal(E.evaluateAttacker(rules, 'cf', { ...base, hasAmmo: 'no' }).eligible, false);
  assert.equal(E.evaluateAttacker(rules, 'cf', { ...base, alreadyDidCf: 'yes' }).eligible, false);
});

test('mientras falten respuestas la unidad queda pendiente, no elegible ni rechazada', () => {
  const res = E.evaluateAttacker(rules, 'cf', { kind: 'low_altitude_operational' });
  assert.equal(res.eligible, false);
  assert.equal(res.pending, true);
  assert.deepEqual(res.reasons, []);
  assert.equal(E.evaluateAttacker(rules, 'cf', {}).pending, true);
});

test('ajustes de ataque: KB usa la fila Persecución y no da terreno; BAI no da terreno; KB impide el contraataque a baja altura', () => {
  const kb = E.attackSettings(rules, 'kb');
  assert.equal(kb.usesPursuitRow, true);
  assert.equal(kb.targetGetsTerrainBonus, false);
  assert.equal(kb.targetCanLowAltitudeCounterattack, false);
  const bai = E.attackSettings(rules, 'bai');
  assert.equal(bai.usesPursuitRow, false);
  assert.equal(bai.targetGetsTerrainBonus, false);
  const cf = E.attackSettings(rules, 'cf');
  assert.equal(cf.targetGetsTerrainBonus, true);
  assert.match(cf.limits, /una Operación de Contrabatería/);
});

test('validatePlan: objetivo detectado, todos con objetivo y orden único, y aviso de que todo se decide antes del primer ataque', () => {
  const eligible = { eligible: true };
  const plan = (over) => ({ targetDetected: 'yes', attackers: [
    { name: 'A', evaluation: eligible, target: 'X', order: '1' },
    { name: 'B', evaluation: eligible, target: 'X', order: '2' },
    { name: 'C', evaluation: { eligible: false }, target: '', order: '' }
  ], ...over });
  const ok = E.validatePlan(rules, 'kb', plan());
  assert.equal(ok.ok, true);
  assert.match(ok.warnings.join(' '), /antes del primer ataque/);

  assert.equal(E.validatePlan(rules, 'kb', plan({ targetDetected: 'no' })).ok, false);
  const dup = E.validatePlan(rules, 'kb', plan({ attackers: [
    { name: 'A', evaluation: eligible, target: 'X', order: '1' },
    { name: 'B', evaluation: eligible, target: 'Y', order: '1' }] }));
  assert.equal(dup.ok, false);
  assert.match(dup.errors.join(' '), /Orden de resolución repetido: 1/);
  const missing = E.validatePlan(rules, 'kb', plan({ attackers: [{ name: 'A', evaluation: eligible, target: '', order: '' }] }));
  assert.match(missing.errors.join(' '), /falta el objetivo/);
  assert.match(missing.errors.join(' '), /falta el orden/);
  assert.equal(E.validatePlan(rules, 'kb', plan({ attackers: [] })).ok, false);
});

test('aftermath: consecuencias por tipo de unidad que participó y reglas especiales de la reacción', () => {
  const cf = E.aftermath(rules, 'cf', ['air_on_call', 'artillery_fire', 'artillery_fire']);
  assert.equal(cf.length, 2);
  assert.match(cf.find((l) => l.kind === 'artillery_fire').text, /marcador de consumo de munición «-1»/);
  assert.match(cf.find((l) => l.kind === 'artillery_fire').text, /Ataque de Contrafuegos \(AS\)/);
  const bai = E.aftermath(rules, 'bai', ['air_on_call']);
  assert.ok(bai.some((l) => /pierde 1 punto de tamaño de fuerza/.test(l.text)));
  assert.ok(E.aftermath(rules, 'kb', ['low_altitude_operational']).some((l) => /fila «Persecución»/.test(l.text)));
});
