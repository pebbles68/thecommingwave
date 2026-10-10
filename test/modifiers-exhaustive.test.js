// AJ-010: cada modificador numérico de los workflows se suma tal como está
// declarado, y cada destino de modificador lo consume alguna parte del código
// (o consta como excepción documentada).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CombatWizardEngine = require('../public/js/combat-wizard-engine.js');

const ROOT = path.join(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workflows', 'index.json'), 'utf8'));
const ambiguities = fs.readFileSync(path.join(ROOT, 'docs', 'rules', 'known-ambiguities.md'), 'utf8');

function jsSources() {
  const dirs = [path.join(ROOT, 'public', 'js'), path.join(ROOT, 'public', 'js', 'views')];
  return dirs.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(d, f), 'utf8'))).join('\n');
}

// Modificadores declarados que a propósito no se aplican: el motivo está en known-ambiguities.md.
const NOT_CONSUMED = {
  search_roll: 'Modificadores de Firma de la página 28'
};

const modifiers = [];
index.files.forEach((f) => {
  const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workflows', f.file), 'utf8'));
  wf.stages.forEach((stage) => (stage.questions || []).forEach((q) => (q.options || []).forEach((opt) => (opt.effects || []).forEach((eff) => {
    if (eff.type === 'modifier') modifiers.push({ workflow: f.id, stage: stage.id, question: q, option: opt, effect: eff });
  }))));
});

test('hay modificadores declarados en los workflows (la prueba no es vacía)', () => {
  assert.ok(modifiers.length >= 80, `solo ${modifiers.length}`);
});

modifiers.forEach((m) => {
  test(`modificador ${m.workflow}/${m.stage}/${m.question.id}=${m.option.value} → ${m.effect.target} ${m.effect.value}`, () => {
    assert.equal(typeof m.effect.value, 'number');
    assert.ok(m.effect.target);
    const { total, trace } = CombatWizardEngine.sumModifiers([m.question], { [m.question.id]: m.option.value }, m.effect.target);
    const expected = m.option.effects.filter((e) => e.type === 'modifier' && e.target === m.effect.target).reduce((s, e) => s + e.value, 0);
    assert.equal(total, expected);
    assert.ok(trace.every((t) => t.questionId === m.question.id));
  });
});

test('cada destino de modificador lo consume el código o es una excepción documentada', () => {
  const src = jsSources();
  const targets = [...new Set(modifiers.map((m) => m.effect.target))];
  targets.forEach((t) => {
    if (NOT_CONSUMED[t]) {
      assert.ok(ambiguities.includes(NOT_CONSUMED[t]), `${t}: la excepción citada no consta en known-ambiguities.md`);
    } else {
      assert.ok(src.includes(`'${t}'`), `el destino de modificador «${t}» no lo consume ningún código`);
    }
  });
  Object.keys(NOT_CONSUMED).forEach((t) => assert.ok(targets.includes(t), `excepción ${t} obsoleta: ya no hay modificadores con ese destino`));
});
