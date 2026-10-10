// AJ-007: interpretación declarativa de showIf / parallelGroups / invalidación.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../public/js/stage-questions-engine.js');

const wf = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'workflows', f), 'utf8'));

const stage = {
  questions: [{ id: 'a' }, { id: 'b', showIf: { questionId: 'a', equals: 'x' } }, { id: 'c', showIf: { questionId: 'b', equals: 'y' } }, { id: 'd' }, { id: 'e' }],
  parallelGroups: [['d', 'e']]
};

test('visibleQuestions respeta showIf encadenados', () => {
  assert.deepEqual(E.visibleQuestions(stage, {}).map((q) => q.id), ['a', 'd', 'e']);
  assert.deepEqual(E.visibleQuestions(stage, { a: 'x' }).map((q) => q.id), ['a', 'b', 'd', 'e']);
  assert.deepEqual(E.visibleQuestions(stage, { a: 'x', b: 'y' }).map((q) => q.id), ['a', 'b', 'c', 'd', 'e']);
});

test('layout agrupa en un bloque paralelo las preguntas visibles del mismo grupo', () => {
  const blocks = E.layout(stage, {});
  assert.deepEqual(blocks.map((b) => [b.parallel, b.questions.map((q) => q.id)]), [[false, ['a']], [true, ['d', 'e']]]);
  // Un grupo con un solo miembro visible no es paralelo.
  const single = { questions: [{ id: 'p' }, { id: 'q', showIf: { questionId: 'p', equals: '1' } }], parallelGroups: [['p', 'q']] };
  assert.equal(E.layout(single, {})[0].parallel, false);
  assert.equal(E.layout(single, { p: '1' })[0].parallel, true);
});

test('pruneHidden retira en cascada las respuestas de preguntas que dejan de ser visibles', () => {
  const answers = { a: 'x', b: 'y', c: 'z', d: '1' };
  assert.deepEqual(E.pruneHidden(stage, answers), []);
  answers.a = 'w';
  assert.deepEqual(E.pruneHidden(stage, answers).sort(), ['b', 'c']);
  assert.deepEqual(answers, { a: 'w', d: '1' });
});

test('dependentsOf devuelve los descendientes directos e indirectos', () => {
  assert.deepEqual(E.dependentsOf(stage, 'a').sort(), ['b', 'c']);
  assert.deepEqual(E.dependentsOf(stage, 'b'), ['c']);
  assert.deepEqual(E.dependentsOf(stage, 'd'), []);
});

test('con los workflows reales: showIf y parallelGroups solo citan preguntas de su etapa', () => {
  const index = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'workflows', 'index.json'), 'utf8'));
  index.files.forEach((f) => {
    wf(f.file).stages.forEach((s) => {
      const ids = new Set(s.questions.map((q) => q.id));
      s.questions.forEach((q) => { if (q.showIf) assert.ok(ids.has(q.showIf.questionId), `${f.id}/${s.id}/${q.id}: showIf cita una pregunta ajena`); });
      (s.parallelGroups || []).forEach((g) => g.forEach((id) => assert.ok(ids.has(id), `${f.id}/${s.id}: parallelGroups cita ${id}, que no existe`)));
    });
  });
  // Ejemplo real: en la etapa de intensidad terrestre, las preguntas dependientes del tipo de objetivo se ocultan y limpian.
  const intensity = wf('02_ataque_terrestre_guiado.json').stages.find((s) => s.id === 'attack_intensity');
  const answers = { target_type: 'mobile_main', attack_distance_band: '0' };
  assert.ok(E.visibleQuestions(intensity, answers).some((q) => q.id === 'attack_distance_band'));
  answers.target_type = 'fixed';
  assert.ok(E.pruneHidden(intensity, answers).includes('attack_distance_band'));
});

test('evaluateCondition: igualdades con texto o número, unidas con &&; lo que no se puede evaluar da null', () => {
  assert.equal(E.evaluateCondition("a == 'x'", { a: 'x' }), true);
  assert.equal(E.evaluateCondition("a == 'x'", { a: 'y' }), false);
  assert.equal(E.evaluateCondition('finalRoll == 9', { finalRoll: '9' }), true);
  assert.equal(E.evaluateCondition('finalRoll == 9', { finalRoll: 8 }), false);
  assert.equal(E.evaluateCondition("a == 'x' && b == 2", { a: 'x', b: 2 }), true);
  assert.equal(E.evaluateCondition("a == 'x' && b == 2", { a: 'x', b: 3 }), false);
  assert.equal(E.evaluateCondition('finalRoll == 9', {}), null);
  assert.equal(E.evaluateCondition("torpedoType == 'hexagon' && tableResult does not contain '*'", { torpedoType: 'hexagon' }), null);
  assert.equal(E.evaluateCondition('', {}), true);
});

test('activeRules: cortes de flujo, reglas de dados y reglas por tirada de los workflows reales', () => {
  const guided = wf('02_ataque_terrestre_guiado.json');
  assert.equal(E.activeRules(guided, 'munition_interception', { same_hex_or_central_zone: 'yes' }).flowCuts.length, 1);
  assert.equal(E.activeRules(guided, 'munition_interception', { same_hex_or_central_zone: 'no' }).flowCuts.length, 0);
  assert.equal(E.activeRules(guided, 'area_air_defense', { near_space_trajectory: 'yes' }).diceRules.length, 1);
  assert.equal(E.activeRules(guided, 'area_air_defense', { near_space_trajectory: 'no' }).diceRules.length, 0);
  assert.equal(E.activeRules(guided, 'attack_intensity', {}, { finalRoll: 9 }).rollDependentRules.length, 1);
  assert.equal(E.activeRules(guided, 'attack_intensity', {}, { finalRoll: 4 }).rollDependentRules.length, 0);
  // Una regla de otra etapa no se activa.
  assert.equal(E.activeRules(guided, 'attack_intensity', { same_hex_or_central_zone: 'yes' }).flowCuts.length, 0);
  // Condiciones no evaluables (dependen del resultado de la tabla) nunca se activan por suposición.
  const sub = wf('11_ataque_asw_submarino.json');
  assert.equal(E.activeRules(sub, 'attack_table', {}).rollDependentRules.length, 0);
});
