// Pruebas del motor de Reabastecimiento de Campo (public/js/army-resupply-engine.js;
// Decision Book §8.11.3) y de data/rules/army-resupply.json. Los valores esperados de
// celda están leídos de la página 32 impresa de Tablas-de-combate 5.pdf (render a 100 DPI,
// 2026-10-05), no derivados del motor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/army-resupply-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const rules = readJson('rules/army-resupply.json');
const page32 = readJson('tables/page-32.json');
const table = page32.tables.find((t) => t.id === rules.table.id);
const resolve = (o) => engine.resolveArmyResupply(table, tableEngine, { currentForce: 3, printedForceLimit: 6, successCell: rules.table.successCell, ...o });

// --- Datos ---

test('army-resupply.json: condiciones con texto y fuentes, tabla existente y celda de éxito presente en la tabla', () => {
  assert.deepEqual(rules.conditions.map((c) => c.id), ['not_acted', 'supply_line_intact', 'no_enemy_main_in_hex']);
  rules.conditions.forEach((c) => { assert.ok(c.question && c.blockedText, c.id); assert.ok(c.sourceRefs.length >= 1, c.id); });
  assert.ok(rules.sourceRefs.some((r) => /8\.11\.3/.test(r.section)));
  assert.ok(table, 'la tabla army-logistics-resupply existe en page-32.json');
  assert.ok(table.cells.flat().includes(rules.table.successCell));
  ['rollRule', 'successRule', 'afterRule', 'terminologyNote', 'sourceTermNote'].forEach((k) => assert.ok(rules[k], k));
});

// --- Condiciones ---

test('condiciones: hay que estar No Actuada y con Línea de Suministro sin cortar, y NO compartir hexágono con una unidad principal enemiga', () => {
  const all = (a) => engine.checkConditions(rules.conditions, a);
  assert.deepEqual(all({ not_acted: 'yes', supply_line_intact: 'yes', no_enemy_main_in_hex: 'no' }), { allowed: true, blocking: [], pending: [] });
  assert.deepEqual(all({ not_acted: 'no', supply_line_intact: 'yes', no_enemy_main_in_hex: 'no' }).blocking, ['not_acted']);
  assert.deepEqual(all({ not_acted: 'yes', supply_line_intact: 'no', no_enemy_main_in_hex: 'no' }).blocking, ['supply_line_intact']);
  assert.deepEqual(all({ not_acted: 'yes', supply_line_intact: 'yes', no_enemy_main_in_hex: 'yes' }).blocking, ['no_enemy_main_in_hex']);
  const pending = all({ not_acted: 'yes', supply_line_intact: '', no_enemy_main_in_hex: 'no' });
  assert.deepEqual([pending.allowed, pending.pending], [false, ['supply_line_intact']]);
});

// --- Tabla (página 32) ---

test('Nivel A: tirada 0~4 sin éxito; 5 o más éxito', () => {
  [0, 4].forEach((r) => assert.equal(resolve({ initiativeLevel: 'A', roll: r }).success, false));
  [5, 6, 7, 8, 9].forEach((r) => assert.equal(resolve({ initiativeLevel: 'A', roll: r }).success, true));
});

test('Nivel B exige 6+, Nivel C exige 7+, Nivel D exige 8~9', () => {
  assert.deepEqual([5, 6].map((r) => resolve({ initiativeLevel: 'B', roll: r }).success), [false, true]);
  assert.deepEqual([6, 7].map((r) => resolve({ initiativeLevel: 'C', roll: r }).success), [false, true]);
  assert.deepEqual([7, 8, 9].map((r) => resolve({ initiativeLevel: 'D', roll: r }).success), [false, true, true]);
  assert.equal(resolve({ initiativeLevel: 'c', roll: 7 }).level, 'C');
});

test('un éxito suma 1 punto de fuerza hasta el límite impreso; en el límite no sube y se señala', () => {
  const gain = resolve({ initiativeLevel: 'A', roll: 5, currentForce: 3, printedForceLimit: 6 });
  assert.deepEqual([gain.success, gain.gained, gain.newForce, gain.cappedByLimit], [true, 1, 4, false]);
  const atLimit = resolve({ initiativeLevel: 'A', roll: 9, currentForce: 6, printedForceLimit: 6 });
  assert.deepEqual([atLimit.success, atLimit.gained, atLimit.newForce, atLimit.cappedByLimit], [true, 0, 6, true]);
  const fail = resolve({ initiativeLevel: 'D', roll: 3, currentForce: 2, printedForceLimit: 6 });
  assert.deepEqual([fail.success, fail.gained, fail.newForce, fail.cappedByLimit], [false, 0, 2, false]);
});

test('entradas inválidas fallan con error claro', () => {
  assert.throws(() => resolve({ initiativeLevel: 'E', roll: 5 }), /A, B, C o D/);
  assert.throws(() => resolve({ initiativeLevel: 'A', roll: '' }), /1d10/);
  assert.throws(() => resolve({ initiativeLevel: 'A', roll: 5, currentForce: 7, printedForceLimit: 6 }), /superar el límite/);
  assert.throws(() => resolve({ initiativeLevel: 'A', roll: 5, currentForce: '', printedForceLimit: 6 }), /entero/);
});
