// Pruebas del ataque ASW de submarinos contra submarinos (página 30;
// AswAttackEngine.resolveSubmarineAswAttack; Decision Book §9.13.2). Los valores
// esperados de celda están leídos de la página 30 impresa de
// Tablas-de-combate 5.pdf (render a 110 DPI, 2026-10-04), no derivados del motor.
// La fila depende de la profundidad (confirmado por el mantenedor, 2026-10-04).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/asw-attack-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const page29 = readJson('tables/page-29.json').tables[0];
const table = readJson('tables/page-30.json').tables.find((t) => t.id === 'asw-submarine-vs-submarine-damage');
const workflow = readJson('workflows/11_ataque_asw_submarino.json');

const resolve = (opts) => engine.resolveSubmarineAswAttack(table, tableEngine, opts);

// --- Datos ---

test('page-30: mismas tres bandas y rangos de Firma por posición que la página 29, y la cabecera 5+/4/0~3 se asocia a P4/P3/P2_P1', () => {
  assert.deepEqual(table.columnAxis.signatureBands, page29.columnAxis.signatureBands);
  assert.deepEqual(table.columnAxis.alternateLabelSets, page29.columnAxis.alternateLabelSets);
  assert.deepEqual(table.columnAxis.headerGroupToPosition, { '5+': 'P4', '4': 'P3', '0~3': 'P2_P1' });
  assert.ok(!('attackerSignatureGrouping' in table.columnAxis), 'la agrupación por "firma del atacante" ya no debe existir');
});

test('workflow 11: profundidad, Firma numérica, En Movimiento, tipo de torpedo, valor y protección; ya no pide "firma del atacante"', () => {
  const ids = workflow.stages[0].questions.map((q) => q.id);
  assert.deepEqual(ids, ['water_depth', 'target_signature', 'target_moving', 'torpedo_type', 'torpedo_attack_value', 'target_protection']);
  assert.ok(!ids.includes('attacker_signature'));
  workflow.stages[0].questions.filter((q) => q.sourceRefs).forEach((q) => assert.ok(q.sourceRefs.length >= 1, q.id));
  assert.match(workflow.rollDependentRules[0].condition, /hexagon/, 'la regla del asterisco es solo del hexágono');
});

// --- Celdas (valores leídos de la página impresa) ---

test('P.4, Firma 8 (banda 3), Valor 8+ , tirada 9 -> 3* (el torpedo de círculo cuenta 3; el de hexágono también, por el asterisco)', () => {
  const circle = resolve({ position: 'P4', signature: 8, torpedoValue: 8, torpedoType: 'circle', roll: 9 });
  assert.equal(circle.cell.rawCell, '3*');
  assert.equal(circle.impacts, 3);
  const hexagon = resolve({ position: 'P4', signature: 8, torpedoValue: 8, torpedoType: 'hexagon', roll: 9 });
  assert.equal(hexagon.impacts, 3);
  assert.equal(hexagon.hexagonNoEffect, false);
});

test('torpedo de hexágono sin asterisco no tiene efecto (tirada 5, columna 8+ -> "1" sin *); el de círculo sí cuenta el impacto', () => {
  const base = { position: 'P4', signature: 8, torpedoValue: 8, roll: 5 };
  const hexagon = resolve({ ...base, torpedoType: 'hexagon' });
  assert.equal(hexagon.cell.rawCell, '1');
  assert.equal(hexagon.impacts, 0);
  assert.equal(hexagon.hexagonNoEffect, true);
  assert.equal(resolve({ ...base, torpedoType: 'circle' }).impacts, 1);
});

test('el asterisco no limita al torpedo de círculo: P.2-1, Firma 5, Valor 7, tirada 8 -> 3*', () => {
  const r = resolve({ position: 'P2_P1', signature: 5, torpedoValue: 7, torpedoType: 'circle', roll: 8 });
  assert.equal(r.band.columnScheme, 'band_3');
  assert.equal(r.cell.columnLabel, '7');
  assert.equal(r.impacts, 3);
});

test('tirada 0-3 es "NO DISPARAR": sin impactos y sin búsqueda posterior', () => {
  for (const roll of [0, 1, 2, 3]) {
    const r = resolve({ position: 'P3', signature: 3, torpedoValue: 2, torpedoType: 'circle', roll });
    assert.equal(r.noFire, true);
    assert.equal(r.impacts, 0);
  }
});

test('la misma Firma lee bandas distintas según la profundidad (Firma 3: P.4 -> 1, P.3 -> 2, P.2-1 -> 2; Firma 4: P.4 -> 2, P.3 -> 2, P.2-1 -> 3)', () => {
  const band = (position, signature) => engine.selectBand(table, tableEngine, { position, signature }).columnScheme;
  assert.deepEqual([band('P4', 3), band('P3', 3), band('P2_P1', 3)], ['band_1', 'band_2', 'band_2']);
  assert.deepEqual([band('P4', 4), band('P3', 4), band('P2_P1', 4)], ['band_2', 'band_2', 'band_3']);
});

test('un submarino en movimiento suma +1 a la Firma y puede cambiar de banda', () => {
  const still = resolve({ position: 'P4', signature: 3, targetMoving: false, torpedoValue: 5, torpedoType: 'circle', roll: 9 });
  const moving = resolve({ position: 'P4', signature: 3, targetMoving: true, torpedoValue: 5, torpedoType: 'circle', roll: 9 });
  assert.equal(still.band.columnScheme, 'band_1');
  assert.equal(moving.band.columnScheme, 'band_2');
});

// --- Hundimiento y validación ---

test('Puntos de Impacto >= Protección hunden al submarino (3* con Protección 3 sí; con 4 no)', () => {
  const base = { position: 'P4', signature: 8, torpedoValue: 8, torpedoType: 'circle', roll: 9 };
  assert.equal(resolve({ ...base, targetProtection: 3 }).sunk, true);
  assert.equal(resolve({ ...base, targetProtection: 4 }).sunk, false);
  assert.equal(resolve(base).sunk, null);
});

test('Valor de Ataque con Torpedos menor que 1: sin celda ni impactos; tipo de torpedo inválido lanza error', () => {
  const none = resolve({ position: 'P4', signature: 3, torpedoValue: 0, torpedoType: 'circle', roll: 9 });
  assert.equal(none.cell, null);
  assert.equal(none.noEffect, true);
  assert.throws(() => resolve({ position: 'P4', signature: 3, torpedoValue: 3, torpedoType: '', roll: 9 }), /Tipo de torpedo/);
});
