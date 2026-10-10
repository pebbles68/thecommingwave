// Pruebas del motor de la Emboscada de submarino (public/js/submarine-ambush-engine.js;
// Decision Book §9.16) y de data/rules/submarine-ambush.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/submarine-ambush-engine.js');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules', 'submarine-ambush.json'), 'utf8'));

const base = { subState: 'hidden', subType: 'conventional', alreadyAmbushed: 'no', relation: 'same_hex', event: 'enters', hasAmmo: 'yes' };
const ev = (over) => engine.evaluateAmbush({ ...base, ...over });

test('submarine-ambush.json: fuentes, textos de todos los motivos y pasos con texto', () => {
  assert.ok(rules.sourceRefs.length >= 1 && rules.sourceRefs.every((s) => s.document && s.section));
  const used = ['not_hidden', 'already_ambushed', 'no_event', 'outside_zone_conventional', 'outside_zone_nuclear'];
  used.forEach((k) => assert.ok(rules.reasons[k], `falta el texto del motivo ${k}`));
  assert.ok(rules.steps.length >= 5 && rules.steps.every((s) => s.id && s.text));
  rules.subTypes.forEach((t) => assert.equal(t.zoneRange, engine.ZONE_RANGE[t.value]));
});

test('un submarino Oculto con la formación en su casilla puede emboscar', () => {
  const r = ev({});
  assert.equal(r.eligible, true);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.mayAttackWithAmmo, true);
});

test('un submarino Expuesto no puede emboscar', () => {
  const r = ev({ subState: 'exposed' });
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ['not_hidden']);
});

test('solo una Emboscada por Fase de Acciones de Superficie', () => {
  assert.deepEqual(ev({ alreadyAmbushed: 'yes' }).reasons, ['already_ambushed']);
});

test('zona: convencional 0 casillas, nuclear 1 casilla', () => {
  assert.deepEqual(ev({ relation: 'adjacent' }).reasons, ['outside_zone_conventional']);
  assert.equal(ev({ relation: 'adjacent', subType: 'nuclear' }).eligible, true);
  assert.deepEqual(ev({ relation: 'farther', subType: 'nuclear' }).reasons, ['outside_zone_nuclear']);
  assert.equal(ev({ relation: 'same_hex', subType: 'nuclear' }).eligible, true);
});

test('hace falta que la formación entre, salga o se mueva dentro de la zona', () => {
  ['enters', 'leaves', 'moves_within'].forEach((event) => assert.equal(ev({ event }).eligible, true));
  assert.deepEqual(ev({ event: 'none' }).reasons, ['no_event']);
});

test('sin munición puede emboscar pero no atacar con munición (9.16.2)', () => {
  const r = ev({ hasAmmo: 'no' });
  assert.equal(r.eligible, true);
  assert.equal(r.mayAttackWithAmmo, false);
});

test('con respuestas incompletas no decide; con un impedimento ya lo niega', () => {
  assert.equal(engine.evaluateAmbush({}).eligible, null);
  assert.equal(engine.evaluateAmbush({ subState: 'exposed' }).eligible, false);
});
