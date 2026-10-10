// Pruebas del motor de Acciones Estratégicas (public/js/strategic-actions-engine.js): tabla de la página 32 de
// Tablas-de-combate 5.pdf y Decision Book §14.5-§14.9, contra celdas leídas de la tabla transcrita.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const E = require('../public/js/strategic-actions-engine.js');
const page = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tables', 'page-32.json'), 'utf8'));
const table = page.tables.find((t) => t.id === 'strategic-actions-outcome');

test('la tabla transcrita tiene 10 filas por 4 columnas y los nombres de columna coinciden con los índices del motor', () => {
  assert.equal(table.cells.length, 10);
  table.cells.forEach((row) => assert.equal(row.length, 4));
  assert.deepEqual(Object.values(E.COLUMNS), [0, 1, 2, 3]);
  assert.equal(table.columnAxis.values[E.COLUMNS.cyber], 'Guerra Cibernética');
  assert.equal(table.columnAxis.values[E.COLUMNS.destruction], 'Destrucción Espacial');
  assert.match(table.columnAxis.values[E.COLUMNS.debrisStorm], /Fragmentos Espaciales/);
  assert.match(table.columnAxis.values[E.COLUMNS.debrisVanish], /Desaparición/);
});

test('guerra cibernética: 0-1 Fallo, 2-5 sin efecto, 6-9 Éxito', () => {
  const kinds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => E.kindOfCell(E.cell(table, 'cyber', r)));
  assert.deepEqual(kinds, ['failure', 'failure', 'none', 'none', 'none', 'none', 'success', 'success', 'success', 'success']);
  assert.deepEqual(E.tallyRolls(table, 'cyber', [0, 5, 6, 9, 1, 3]), { successes: 2, failures: 2, none: 2 });
});

test('destrucción espacial: 0-2 Fallo, 3-6 sin efecto, 7-9 Éxito', () => {
  const kinds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => E.kindOfCell(E.cell(table, 'destruction', r)));
  assert.deepEqual(kinds, ['failure', 'failure', 'failure', 'none', 'none', 'none', 'none', 'success', 'success', 'success']);
});

test('parseRolls: solo cifras 0-9 separadas por espacios, comas o punto y coma', () => {
  assert.deepEqual(E.parseRolls('3 7, 0;9'), [3, 7, 0, 9]);
  assert.deepEqual(E.parseRolls(''), []);
  assert.equal(E.parseRolls('3 10'), null);
  assert.equal(E.parseRolls('a'), null);
});

test('orden de acciones: menos Lanzamiento, luego más Orbital, luego 1d10 más alto (repetir si empatan)', () => {
  assert.deepEqual(E.actionOrder({ launchA: 2, launchB: 3, orbitalA: 1, orbitalB: 9 }), { status: 'decided', first: 'A', by: 'launch' });
  assert.deepEqual(E.actionOrder({ launchA: 3, launchB: 3, orbitalA: 2, orbitalB: 5 }), { status: 'decided', first: 'B', by: 'orbital' });
  assert.equal(E.actionOrder({ launchA: 3, launchB: 3, orbitalA: 4, orbitalB: 4 }).status, 'needs_roll');
  assert.deepEqual(E.actionOrder({ launchA: 3, launchB: 3, orbitalA: 4, orbitalB: 4, tieRollA: 7, tieRollB: 2 }), { status: 'decided', chooser: 'A', by: 'dice' });
  assert.equal(E.actionOrder({ launchA: 3, launchB: 3, orbitalA: 4, orbitalB: 4, tieRollA: 5, tieRollB: 5 }).status, 'reroll');
  assert.equal(E.actionOrder({ launchA: 3 }).status, 'incomplete');
});

test('Ataque Duro: 3d10; cada Éxito destruye 1 orbital enemigo y genera 2 escombros; cada Fallo, 1 escombro', () => {
  const r = E.resolveDestruction({ table, kind: 'hard', rolls: [8, 0, 4], enemyOrbital: 5 });
  assert.deepEqual([r.successes, r.failures, r.none], [1, 1, 1]);
  assert.equal(r.enemyOrbitalLost, 1);
  assert.equal(r.debrisGenerated, 3);
  assert.equal(r.ownCost, 'destroy_launch');
});

test('Ataque Blando: 1d10; un Éxito consume 1 orbital enemigo, nunca genera escombros', () => {
  const ok = E.resolveDestruction({ table, kind: 'soft', rolls: [9], enemyOrbital: 2 });
  assert.equal(ok.enemyOrbitalLost, 1);
  assert.equal(ok.enemyOrbitalLostKind, 'consumed');
  assert.equal(ok.debrisGenerated, 0);
  const ko = E.resolveDestruction({ table, kind: 'soft', rolls: [0], enemyOrbital: 2 });
  assert.equal(ko.enemyOrbitalLost, 0);
  assert.equal(ko.debrisGenerated, 0, 'un Fallo del blando no genera escombros');
});

test('Ataque Orbital: coste de un orbital propio, mismos efectos que el Duro; la Maniobra Orbital reduce las tiradas en 2', () => {
  assert.equal(E.resolveDestruction({ table, kind: 'orbital', rolls: [7, 7, 7], enemyOrbital: 9 }).ownCost, 'destroy_orbital');
  assert.equal(E.destructionRolls('orbital', 'yes'), 1);
  assert.equal(E.destructionRolls('hard', 'yes'), 1);
  assert.equal(E.destructionRolls('soft', 'yes'), 1, 'el Ataque Blando no se ve afectado');
  assert.equal(E.resolveDestruction({ table, kind: 'hard', maneuver: 'yes', rolls: [9], enemyOrbital: 9 }).enemyOrbitalLost, 1);
});

test('no se destruyen más orbitales enemigos de los que tiene, y se exige el número exacto de tiradas', () => {
  const r = E.resolveDestruction({ table, kind: 'hard', rolls: [9, 9, 9], enemyOrbital: 1 });
  assert.equal(r.enemyOrbitalLost, 1);
  assert.equal(r.capped, true);
  assert.equal(r.debrisGenerated, 6);
  assert.deepEqual(E.resolveDestruction({ table, kind: 'hard', rolls: [1, 2], enemyOrbital: 1 }), { error: 'wrong_roll_count', expected: 3 });
});

test('Tormenta de Escombros: 1d10 + escombros; Impacto (Colisión) desde 8; sumas por encima de 9 se leen en la última fila', () => {
  assert.deepEqual(E.debrisStorm({ table, roll: 4, debris: 3 }), { total: 7, clamped: false, collision: false });
  assert.equal(E.debrisStorm({ table, roll: 4, debris: 4 }).collision, true);
  assert.deepEqual(E.debrisStorm({ table, roll: 9, debris: 5 }), { total: 14, clamped: true, collision: true });
  assert.equal(E.debrisStorm({ table, roll: 3, debris: 0 }).collision, false);
  assert.equal(E.debrisStorm({ table, roll: 10, debris: 0 }), null);
});

test('Desaparición de escombros: el 1d10 da el número de la tabla (0 = ninguno), sin pasar de los que hay', () => {
  assert.deepEqual(E.debrisVanish({ table, roll: 0, debris: 4 }), { removed: 0, tableValue: 0, remaining: 4 });
  assert.deepEqual(E.debrisVanish({ table, roll: 3, debris: 4 }), { removed: 3, tableValue: 3, remaining: 1 });
  assert.deepEqual(E.debrisVanish({ table, roll: 9, debris: 2 }), { removed: 2, tableValue: 9, remaining: 0 });
});

test('space-war.json: opcional, con fuentes, tabla que existe, acciones de apoyo/destrucción/garantía con texto', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules', 'space-war.json'), 'utf8'));
  assert.equal(rules.optionalRule, true);
  assert.ok(rules.sourceRefs.length >= 3 && rules.sourceRefs.every((s) => s.document && s.section));
  assert.equal(rules.table.id, table.id);
  assert.deepEqual(rules.operations.map((o) => o.value), ['order', 'support', 'destruction', 'guarantee', 'debris_storm', 'debris_vanish']);
  assert.deepEqual(rules.support.map((s) => s.section), ['14.6.1', '14.6.2', '14.6.3', '14.6.4']);
  assert.deepEqual(rules.destruction.map((d) => d.value), Object.keys(E.DESTRUCTION_KINDS));
  assert.deepEqual(rules.guarantee.map((g) => g.section), ['14.8.1', '14.8.2']);
  [...rules.support, ...rules.guarantee].forEach((a) => assert.ok(a.effect && a.kind, a.value));
  rules.destruction.forEach((d) => assert.ok(d.cost && d.roll && d.success, d.value));
});
