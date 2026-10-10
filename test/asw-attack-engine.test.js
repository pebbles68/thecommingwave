// Pruebas del motor de Ataque ASW por unidades de superficie y aéreas
// (public/js/asw-attack-engine.js; Decision Book §9.17-§9.17.2). Los valores
// esperados de celda están leídos de la página 29 impresa de
// Tablas-de-combate 5.pdf (render a 110 DPI, 2026-10-04), no derivados del motor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/asw-attack-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const page29 = readJson('tables/page-29.json');
const workflow = readJson('workflows/10_ataque_asw_superficie_aereo.json');
const table = page29.tables.find((t) => t.id === 'asw-surface-air-attack-damage');

const resolve = (opts) => engine.resolveAswAttack(table, tableEngine, opts);

// --- Datos ---

test('page-29: tres bandas de etiquetas con una entrada por columna de datos y tres rangos de Firma por posición', () => {
  const sets = table.columnAxis.alternateLabelSets;
  ['band_1', 'band_2', 'band_3'].forEach((k) => assert.equal(sets[k].length, table.columnAxis.values.length, k));
  assert.deepEqual(sets.band_3, table.columnAxis.values, 'la banda 3 es el esquema canónico');
  for (const position of ['P4', 'P3', 'P2_P1']) {
    assert.equal(table.columnAxis.signatureBands[position].length, 3, position);
  }
  assert.ok(!('positionGrouping' in table.columnAxis), 'la agrupación incompleta anterior ya no debe existir');
});

test('workflow 10: firma numérica, "En Movimiento" (+1), profundidad y protección, con fuentes; elegibilidad de superficie adyacente', () => {
  const stage = workflow.stages.find((s) => s.id === 'attack_table');
  const ids = stage.questions.map((q) => q.id);
  assert.deepEqual(ids, ['water_depth', 'target_signature', 'target_moving', 'asw_attack_value', 'target_protection']);
  assert.equal(stage.questions.find((q) => q.id === 'target_signature').type, 'number');
  assert.equal(stage.questions.find((q) => q.id === 'target_moving').options.find((o) => o.value === 'yes').effects[0].value, 1);
  const elig = workflow.stages.find((s) => s.id === 'eligibility');
  assert.deepEqual(elig.questions.map((q) => q.id), ['attacker_type', 'target_in_enemy_cap_zone', 'adjacent_target', 'adjacent_capability', 'attacker_in_enemy_cap_zone']);
});

// --- Pasos 1-2: banda ---

test('selectBand: P.4 -> 0~3 / 4~6 / 7+ = bandas 1 / 2 / 3', () => {
  const pick = (signature) => engine.selectBand(table, tableEngine, { position: 'P4', signature }).columnScheme;
  assert.equal(pick(0), 'band_1');
  assert.equal(pick(3), 'band_1');
  assert.equal(pick(4), 'band_2');
  assert.equal(pick(6), 'band_2');
  assert.equal(pick(7), 'band_3');
  assert.equal(pick(10), 'band_3');
});

test('selectBand: P.3 -> 0~1 / 2~4 / 5+ y P.2-1 -> 0 / 1~3 / 4+', () => {
  assert.equal(engine.selectBand(table, tableEngine, { position: 'P3', signature: 1 }).columnScheme, 'band_1');
  assert.equal(engine.selectBand(table, tableEngine, { position: 'P3', signature: 2 }).columnScheme, 'band_2');
  assert.equal(engine.selectBand(table, tableEngine, { position: 'P3', signature: 5 }).columnScheme, 'band_3');
  assert.equal(engine.selectBand(table, tableEngine, { position: 'P2_P1', signature: 0 }).columnScheme, 'band_1');
  assert.equal(engine.selectBand(table, tableEngine, { position: 'P2_P1', signature: 3 }).columnScheme, 'band_2');
  assert.equal(engine.selectBand(table, tableEngine, { position: 'P2_P1', signature: 4 }).columnScheme, 'band_3');
});

test('selectBand: un submarino "En Movimiento" suma +1 a la Firma (§9.17.2 Paso 1) y puede cambiar de banda', () => {
  const still = engine.selectBand(table, tableEngine, { position: 'P4', signature: 3, targetMoving: false });
  const moving = engine.selectBand(table, tableEngine, { position: 'P4', signature: 3, targetMoving: true });
  assert.equal(still.columnScheme, 'band_1');
  assert.equal(moving.effectiveSignature, 4);
  assert.equal(moving.columnScheme, 'band_2');
});

test('selectBand: posición desconocida o firma inválida lanzan error en vez de elegir una banda', () => {
  assert.throws(() => engine.selectBand(table, tableEngine, { position: 'P9', signature: 1 }), /desconocida/);
  assert.throws(() => engine.selectBand(table, tableEngine, { position: 'P4', signature: -3 }), /≥ 0/);
});

// --- Pasos 3-4: celda (valores leídos de la página impresa) ---

test('P.4, firma 2 (banda 1), Valor ASW 5 cae en la etiqueta "5"; tirada 7 -> 1', () => {
  const r = resolve({ position: 'P4', signature: 2, aswAttackValue: 5, roll: 7 });
  assert.equal(r.band.columnScheme, 'band_1');
  assert.equal(r.cell.columnLabel, '5');
  assert.equal(r.impacts, 1);
});

test('el mismo Valor ASW 5 y tirada 7 da 1 / 2 / 3 impactos en las bandas 1 / 2 / 3 (Firma más alta = más fácil de dañar)', () => {
  const run = (signature) => resolve({ position: 'P4', signature, aswAttackValue: 5, roll: 7 }).impacts;
  assert.deepEqual([run(2), run(5), run(8)], [1, 2, 3]);
});

test('P.3, firma 1 "En Movimiento" (=2, banda 2), Valor ASW 3 cae en "3~4"; tirada 9 -> 3', () => {
  const r = resolve({ position: 'P3', signature: 1, targetMoving: true, aswAttackValue: 3, roll: 9 });
  assert.equal(r.band.effectiveSignature, 2);
  assert.equal(r.cell.columnLabel, '3~4');
  assert.equal(r.impacts, 3);
});

test('P.2-1, firma 0 (banda 1), Valor ASW 8 cae en "8+"; tirada 4 -> 1', () => {
  const r = resolve({ position: 'P2_P1', signature: 0, aswAttackValue: 8, roll: 4 });
  assert.equal(r.cell.columnLabel, '8+');
  assert.equal(r.impacts, 1);
});

test('tirada 0 siempre es "." (sin impactos), sea cual sea la columna', () => {
  const r = resolve({ position: 'P2_P1', signature: 5, aswAttackValue: 8, roll: 0 });
  assert.equal(r.impacts, 0);
  assert.equal(r.noEffect, true);
});

test('Valor de Ataque ASW menor que 1: sin impactos, sin inventar una celda', () => {
  const r = resolve({ position: 'P4', signature: 2, aswAttackValue: 0, roll: 9 });
  assert.equal(r.cell, null);
  assert.equal(r.noEffect, true);
});

// --- Paso 4: hundimiento ---

test('los Puntos de Impacto >= Valor de Protección hunden al submarino; menos no; sin Protección introducida no se afirma nada', () => {
  const base = { position: 'P2_P1', signature: 4, aswAttackValue: 12, roll: 9 }; // 3 impactos
  assert.equal(resolve({ ...base, targetProtection: 3 }).sunk, true);
  assert.equal(resolve({ ...base, targetProtection: 4 }).sunk, false);
  assert.equal(resolve(base).sunk, null);
  assert.equal(resolve({ ...base, targetProtection: '' }).sunk, null);
});

test('0 impactos nunca hunde, ni con Protección 0', () => {
  assert.equal(resolve({ position: 'P4', signature: 2, aswAttackValue: 3, roll: 0, targetProtection: 0 }).sunk, false);
});

// --- Elegibilidad ---

test('checkEligibility: una unidad aérea no puede atacar dentro de una zona de patrulla aérea enemiga', () => {
  assert.equal(engine.checkEligibility({ attackerType: 'air', targetInEnemyCapZone: 'yes' }).eligible, false);
  assert.equal(engine.checkEligibility({ attackerType: 'air', targetInEnemyCapZone: 'no' }).eligible, true);
});

test('checkEligibility: la unidad de superficie ataca su misma casilla sin condiciones adicionales', () => {
  assert.equal(engine.checkEligibility({ attackerType: 'surface', adjacentTarget: 'no', targetInEnemyCapZone: 'yes' }).eligible, true);
});

test('checkEligibility: objetivo adyacente exige capacidad de detección aérea (o portaaviones) Y ambas casillas fuera de zona de patrulla enemiga', () => {
  const ok = { attackerType: 'surface', adjacentTarget: 'yes', adjacentCapability: 'air_search', attackerInEnemyCapZone: 'no', targetInEnemyCapZone: 'no' };
  assert.equal(engine.checkEligibility(ok).eligible, true);
  assert.equal(engine.checkEligibility({ ...ok, adjacentCapability: 'carrier' }).eligible, true);
  assert.equal(engine.checkEligibility({ ...ok, adjacentCapability: 'none' }).eligible, false);
  assert.equal(engine.checkEligibility({ ...ok, attackerInEnemyCapZone: 'yes' }).eligible, false);
  const both = engine.checkEligibility({ ...ok, adjacentCapability: 'none', targetInEnemyCapZone: 'yes' });
  assert.equal(both.reasons.length, 2);
});

test('checkEligibility: un tipo de atacante desconocido lanza error', () => {
  assert.throws(() => engine.checkEligibility({ attackerType: '' }), /desconocido/);
});
