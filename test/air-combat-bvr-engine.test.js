// Pruebas del motor de Combate Aéreo BVR (public/js/air-combat-bvr-engine.js;
// Decision Book §7.16.2-§7.16.3) y de los datos de las páginas 15-16. Los
// valores esperados de celda están leídos de las páginas 15-16 impresas de
// Tablas-de-combate 5.pdf (render a 100 DPI, 2026-10-04), no derivados del motor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/air-combat-bvr-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const workflow = readJson('workflows/05_combate_aereo.json');
const page15 = readJson('tables/page-15.json');
const page16 = readJson('tables/page-16.json').tables[0];
const page17 = readJson('tables/page-17.json').tables[0];
const drmTable = page15.tables.find((t) => t.id === 'air-combat-initiative-drm');
const outcomeTable = page15.tables.find((t) => t.id === 'air-combat-bvr-outcome');
const initiativeStage = workflow.stages.find((s) => s.id === 'initiative');
const cellOutcomes = initiativeStage.outcomeRule.cellOutcomes;

const attack = (o) => engine.resolveBvrAttack(page16, tableEngine, o);
const bvrType = (o) => engine.determineBvrType(outcomeTable, tableEngine, cellOutcomes, o).outcome;

// --- Datos ---

test('workflow 05: cada condición BVR declara su columnScheme y existe en la tabla de la página 16 (null = canónico)', () => {
  const cond = workflow.stages.find((s) => s.id === 'bvr').questions.find((q) => q.id === 'mission_condition');
  const byValue = Object.fromEntries(cond.options.map((o) => [o.value, o.columnScheme]));
  assert.deepEqual(byValue, { intercept_awacs: null, intercept: 'intercepcion_dde', cap_awacs: 'caps_awacs', cap: 'caps' });
  Object.values(byValue).filter(Boolean).forEach((k) => assert.ok(page16.columnAxis.alternateLabelSets[k], k));
  assert.ok(cond.sourceRefs.length >= 1);
});

test('workflow 05: las condiciones WVR declaran su columnScheme de la página 17', () => {
  const cond = workflow.stages.find((s) => s.id === 'wvr').questions.find((q) => q.id === 'condition');
  const byValue = Object.fromEntries(cond.options.map((o) => [o.value, o.columnScheme]));
  assert.deepEqual(byValue, { intercept: 'intercepcion_dde', cap: 'caps' });
  Object.values(byValue).forEach((k) => assert.ok(page17.columnAxis.alternateLabelSets[k], k));
});

test('workflow 05: todo texto de celda de la tabla de resultado de la página 15 tiene su id, y los ids de salida del motor tienen texto', () => {
  const texts = outcomeTable.cells.flat();
  texts.forEach((t) => assert.ok(cellOutcomes[t], t));
  const ids = new Set(Object.keys(initiativeStage.outcomeRule.outcomes));
  const emitted = ['no_bvr', 'simultaneous', 'advantage', 'stealth_penetration', 'penetration_success', 'interceptor_advantage'];
  emitted.forEach((id) => assert.ok(ids.has(id), id));
  assert.ok(initiativeStage.outcomeRule.sourceRefs.length >= 1);
});

test('page-15: la columna de la tabla de resultado se identifica como el TOTAL (tirada + DRM), no la diferencia', () => {
  assert.match(outcomeTable.rowAxis.label, /Total/);
  assert.ok(outcomeTable.rowAxis.labelCorrection);
});

// --- Iniciativa y DRM (página 15) ---

test('computeInitiative: +1 por AWACS en red, ventaja del valor mayor, empate sin ventaja', () => {
  const r = engine.computeInitiative({ initiativeA: 3, initiativeB: 5, awacsA: true, awacsB: false });
  assert.deepEqual([r.valueA, r.valueB, r.difference, r.advantageSide], [4, 5, 1, 'B']);
  const tie = engine.computeInitiative({ initiativeA: 4, initiativeB: 4, awacsA: false, awacsB: false });
  assert.deepEqual([tie.difference, tie.advantageSide], [0, null]);
  assert.throws(() => engine.computeInitiative({ initiativeA: '', initiativeB: 1 }), /número/);
});

test('DRM de la Diferencia de Iniciativa: 1 -> +3, 2 -> +5, 3~4 -> +6, 5~7 -> +7, 8+ -> +8; 0 -> sin modificación', () => {
  const drm = (d) => engine.initiativeDrm(drmTable, tableEngine, d);
  assert.deepEqual([1, 2, 3, 4, 5, 7, 8, 12].map(drm), [3, 5, 6, 6, 7, 7, 8, 8]);
  assert.equal(drm(0), 0);
});

// --- Tipo de combate BVR (página 15) ---

test('Combate Aéreo: total 0~5 -> Sin BVR; 6~9 -> BVR Simultáneo; 10+ -> Ventaja BVR (el total puede pasar de 9)', () => {
  const t = (total) => bvrType({ total, context: 'air_combat' });
  assert.deepEqual([0, 5, 6, 9, 10, 17].map(t), ['no_bvr', 'no_bvr', 'simultaneous', 'simultaneous', 'advantage', 'advantage']);
});

test('Penetración, 6~9: sigilosa si el que penetra es sigiloso; si no, BVR simultáneo', () => {
  assert.equal(bvrType({ total: 7, context: 'penetration', penetratorStealth: true }), 'stealth_penetration');
  assert.equal(bvrType({ total: 7, context: 'penetration', penetratorStealth: false }), 'simultaneous');
});

test('Penetración, 10+: penetración exitosa si tiene ventaja el que penetra; ventaja BVR del interceptor si la tiene el interceptor', () => {
  assert.equal(bvrType({ total: 11, context: 'penetration', penetratorSide: 'A', advantageSide: 'A' }), 'penetration_success');
  assert.equal(bvrType({ total: 11, context: 'penetration', penetratorSide: 'A', advantageSide: 'B' }), 'interceptor_advantage');
});

test('duelo sigiloso (ambas unidades sigilosas): Sin BVR aunque el total sea 10+', () => {
  const r = engine.determineBvrType(outcomeTable, tableEngine, cellOutcomes, { total: 14, context: 'air_combat', bothStealth: true });
  assert.equal(r.outcome, 'no_bvr');
  assert.equal(r.reason, 'both_stealth');
});

// --- Fila de la tabla de daño (página 16) ---

test('misma tirada 5 y Valor 4: Intercepción/DdE + AWACS -> 2; Intercepción/DdE -> 1; CAPs + AWACS -> 1 (misma fila); CAPs -> "." (0)', () => {
  const at = (columnScheme) => attack({ columnScheme, airCombatValue: 4, roll: 5 }).impacts;
  assert.deepEqual([at(null), at('intercepcion_dde'), at('caps_awacs'), at('caps')], [2, 1, 1, 0]);
});

test('Intercepción/DdE y CAPs + AWACS comparten literalmente la misma fila de etiquetas', () => {
  assert.deepEqual(page16.columnAxis.alternateLabelSets.intercepcion_dde, page16.columnAxis.alternateLabelSets.caps_awacs);
});

test('CAPs, Valor 12, tirada 9 -> 4 (última columna numérica)', () => {
  const r = attack({ columnScheme: 'caps', airCombatValue: 12, roll: 9 });
  assert.equal(r.cell.columnLabel, '12');
  assert.equal(r.impacts, 4);
});

test('el modificador electrónico se suma a la tirada y, si pasa de 9, se lee la última fila y se marca rollClamped', () => {
  const normal = attack({ columnScheme: 'caps', airCombatValue: 10, roll: 6, electronicBonus: 2 });
  assert.equal(normal.modifiedRoll, 8);
  assert.equal(normal.rollClamped, false);
  const clamped = attack({ columnScheme: 'caps', airCombatValue: 12, roll: 8, electronicBonus: 3 });
  assert.equal(clamped.modifiedRoll, 11);
  assert.equal(clamped.rollClamped, true);
  assert.equal(clamped.rowValue, 9);
  assert.equal(clamped.impacts, 4);
});

test('un Valor de Combate Aéreo sin columna (por debajo o por encima de la tabla) devuelve noColumn sin inventar celda', () => {
  const below = attack({ columnScheme: null, airCombatValue: 1, roll: 5 });
  assert.equal(below.noColumn, true);
  assert.equal(below.noColumnReason, 'below_table');
  const above = attack({ columnScheme: 'caps', airCombatValue: 13, roll: 5 });
  assert.equal(above.noColumn, true);
  assert.equal(above.noColumnReason, 'above_table');
  assert.equal(above.impacts, 0);
});

test('electronicModifier: la diferencia de Valores Electrónicos va al bando con el valor mayor; empate sin modificador', () => {
  assert.deepEqual(engine.electronicModifier(3, 1), { side: 'A', modifier: 2 });
  assert.deepEqual(engine.electronicModifier(1, 3), { side: 'B', modifier: 2 });
  assert.deepEqual(engine.electronicModifier(2, 2), { side: null, modifier: 0 });
});

// --- Daño (§7.16.3 Paso 4) ---

test('1 punto de daño por cada Valor de Protección absorbido (división entera); los impactos sobrantes se ignoran', () => {
  assert.equal(engine.resolveBvrDamage({ impacts: 7, protection: 3 }).damage, 2);
  assert.equal(engine.resolveBvrDamage({ impacts: 2, protection: 3 }).damage, 0);
});

test('un avión de CAPs solo absorbe 1 punto de daño y sale temporalmente de combate', () => {
  const r = engine.resolveBvrDamage({ impacts: 9, protection: 3, targetIsCaps: true });
  assert.equal(r.rawDamage, 3);
  assert.equal(r.damage, 1);
  assert.equal(r.capsCapped, true);
  assert.equal(r.exitsCombat, true);
  assert.equal(engine.resolveBvrDamage({ impacts: 2, protection: 3, targetIsCaps: true }).exitsCombat, false);
});

test('una Protección menor que 1 lanza error', () => {
  assert.throws(() => engine.resolveBvrDamage({ impacts: 3, protection: 0 }), /1 o mayor/);
});
