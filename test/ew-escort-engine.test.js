// Pruebas del motor de prioridad de absorción del avión EW (public/js/ew-escort-engine.js;
// Decision Book §7.10.4 y §6.3 p. 98) y de los datos `area_defense.ewEscortAbsorption`
// del workflow 06.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/ew-escort-engine.js');
const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'workflows', '06_defensa_aerea_area.json'), 'utf8'));
const stage = wf.stages.find((s) => s.id === 'area_defense');

test('workflow 06: area_defense.ewEscortAbsorption con regla, sin efecto, secuencia de absorción y fuentes §7.10.4 y §6.3', () => {
  const r = stage.ewEscortAbsorption;
  ['rule', 'noEffect', 'escortNotCounted', 'sequence', 'readingNote'].forEach((k) => assert.ok(r[k], k));
  assert.ok(r.sourceRefs.some((s) => /7\.10\.4/.test(s.section)));
  assert.ok(r.sourceRefs.some((s) => /6\.3/.test(s.section)));
  assert.ok(stage.questions.some((q) => q.id === 'ew_escort'));
});

test('puntos de impacto menores que la Protección del avión EW: el ataque no tiene efecto', () => {
  const r = engine.resolveEwEscortAbsorption({ impacts: 2, ewProtection: 3 });
  assert.deepEqual([r.noEffect, r.ewDamage, r.ewAbsorbed, r.remaining], [true, 0, 0, 0]);
  assert.equal(engine.resolveEwEscortAbsorption({ impacts: 0, ewProtection: 1 }).noEffect, true);
});

test('con puntos >= Protección el avión EW absorbe tantos puntos como su Protección y sufre 1 punto de daño', () => {
  const r = engine.resolveEwEscortAbsorption({ impacts: 7, ewProtection: 3 });
  assert.deepEqual([r.noEffect, r.ewDamage, r.ewAbsorbed, r.remaining, r.others], [false, 1, 3, 4, null]);
  const exact = engine.resolveEwEscortAbsorption({ impacts: 3, ewProtection: 3 });
  assert.deepEqual([exact.ewDamage, exact.remaining], [1, 0]);
});

test('el remanente pasa a la siguiente unidad con la misma regla: 1 punto de daño si alcanza su Protección', () => {
  const dmg = engine.resolveEwEscortAbsorption({ impacts: 7, ewProtection: 3, otherProtection: 2 });
  assert.deepEqual(dmg.others, { protection: 2, damage: 1, absorbed: 2, left: 2 });
  const none = engine.resolveEwEscortAbsorption({ impacts: 4, ewProtection: 3, otherProtection: 2 });
  assert.deepEqual(none.others, { protection: 2, damage: 0, absorbed: 0, left: 1 });
  const exact = engine.resolveEwEscortAbsorption({ impacts: 5, ewProtection: 3, otherProtection: 2 });
  assert.deepEqual(exact.others, { protection: 2, damage: 1, absorbed: 2, left: 0 });
});

test('entradas inválidas fallan con error claro', () => {
  assert.throws(() => engine.resolveEwEscortAbsorption({ impacts: 7, ewProtection: 0 }), /1 o mayor/);
  assert.throws(() => engine.resolveEwEscortAbsorption({ impacts: '', ewProtection: 2 }), /número/);
  assert.throws(() => engine.resolveEwEscortAbsorption({ impacts: -1, ewProtection: 2 }), /negativos/);
  assert.throws(() => engine.resolveEwEscortAbsorption({ impacts: 5, ewProtection: 2, otherProtection: 0 }), /1 o mayor/);
});
