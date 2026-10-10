// Pruebas del motor de resolución del Ataque Anti-Radiación
// (public/js/anti-radiation-attack-engine.js; Decision Book §5.14.2-§5.14.3).
// Los valores esperados de celda están leídos de la página 13 impresa de
// Tablas-de-combate 5.pdf (render a 100 DPI, 2026-10-04), no derivados del motor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/anti-radiation-attack-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const table = readJson('tables/page-13.json').tables.find((t) => t.id === 'anti-radiation-target-damage');
const workflow = readJson('workflows/04_ataque_antirradiacion.json');

const resolve = (opts) => engine.resolveAntiRadiationAttack(table, tableEngine, opts);

// --- Datos ---

test('workflow 04: declara light_plan con fuente y el modificador -5 del sistema de detección activado', () => {
  const stage = workflow.stages.find((s) => s.id === 'anti_radiation_modifier');
  const light = stage.questions.find((q) => q.id === 'light_plan');
  assert.deepEqual(light.options.map((o) => o.value), ['yes', 'no']);
  assert.ok(light.sourceRefs.length >= 1);
  assert.ok(stage.parallelGroups[0].includes('light_plan'));
  const active = stage.questions.find((q) => q.id === 'detection_system_active');
  assert.equal(active.options.find((o) => o.value === 'yes').effects[0].value, -5);
});

test('workflow 04: la interceptación declara los casos de consumo Bajo forzado con cita', () => {
  const stage = workflow.stages.find((s) => s.id === 'munition_interception');
  assert.ok(stage.lowConsumptionOnlyCases.length >= 1);
  stage.lowConsumptionOnlyCases.forEach((c) => assert.ok(c.sourceRefs.length >= 1));
});

test('page-13: ambos esquemas de columna tienen 18 etiquetas (una por columna de datos)', () => {
  assert.equal(tableEngine.pickAxisLabels(table.columnAxis).length, 18);
  assert.equal(tableEngine.pickAxisLabels(table.columnAxis, engine.LIGHT_SCHEME).length, 18);
  table.cells.forEach((row) => assert.equal(row.length, 18));
});

// --- Esquema [L] / Normal (valores de la página impresa) ---

test('Valor 7, tirada 5, sin modificación: fila Normal -> columna "7" -> 10; fila [L] -> columna "7" -> 6', () => {
  const normal = resolve({ attackValue: 7, lightPlan: false, intensityModifier: 0, roll: 5 });
  assert.equal(normal.columnResult.columnLabel, '7');
  assert.equal(normal.impacts, 10);
  const light = resolve({ attackValue: 7, lightPlan: true, intensityModifier: 0, roll: 5 });
  assert.equal(light.columnResult.columnLabel, '7');
  assert.equal(light.impacts, 6);
  assert.equal(light.columnScheme, 'L_ligero');
});

// --- Modificación -5: desplazamiento de columna saltando "·" ---

test('Valor 7 Normal con -5: desplaza 5 columnas a la izquierda saltando los "·" -> columna "2" -> tirada 5 -> 3', () => {
  const r = resolve({ attackValue: 7, lightPlan: false, intensityModifier: -5, roll: 5 });
  assert.equal(r.columnResult.columnLabel, '2');
  assert.equal(r.impacts, 3);
  assert.equal(r.appliedModifier, -5);
  assert.equal(r.cancelledByNine, false);
});

test('tirada 9 cancela la modificación: Valor 7 Normal con -5 y tirada 9 usa la columna "7" -> 21', () => {
  const r = resolve({ attackValue: 7, lightPlan: false, intensityModifier: -5, roll: 9 });
  assert.equal(r.cancelledByNine, true);
  assert.equal(r.appliedModifier, 0);
  assert.equal(r.columnResult.columnLabel, '7');
  assert.equal(r.impacts, 21);
});

test('tirada 9 sin modificación negativa no se marca como cancelación', () => {
  const r = resolve({ attackValue: 7, lightPlan: false, intensityModifier: 0, roll: 9 });
  assert.equal(r.cancelledByNine, false);
  assert.equal(r.impacts, 21);
});

test('Valor > 13: cada punto negativo lo reduce en 1 hasta 13 y el resto desplaza (15 con -5 -> 13 y 3 columnas -> "10" -> tirada 6 -> 24)', () => {
  const r = resolve({ attackValue: 15, lightPlan: false, intensityModifier: -5, roll: 6 });
  assert.equal(r.columnResult.effectiveValue, 13);
  assert.equal(r.columnResult.columnLabel, '10');
  assert.equal(r.impacts, 24);
});

test('Valor > 13 sin modificación se trata como 13 (tope)', () => {
  const r = resolve({ attackValue: 20, lightPlan: false, intensityModifier: 0, roll: 9 });
  assert.equal(r.columnResult.columnLabel, '13+');
  assert.equal(r.impacts, 40);
});

test('un desplazamiento que sale por la izquierda usa la columna más a la izquierda ([L]: Valor 2 con -5 -> "1" -> tirada 6 -> 1)', () => {
  const r = resolve({ attackValue: 2, lightPlan: true, intensityModifier: -5, roll: 6 });
  assert.equal(r.columnResult.columnLabel, '1');
  assert.equal(r.impacts, 1);
});

test('una modificación positiva nunca sube la columna (neto máximo 0)', () => {
  const r = resolve({ attackValue: 7, lightPlan: false, intensityModifier: 3, roll: 5 });
  assert.equal(r.columnResult.columnLabel, '7');
  assert.equal(r.impacts, 10);
});

// --- Sin columna: no se inventa nada ---

test('un Valor de Ataque sin columna (0) devuelve noColumn sin celda ni impactos inventados', () => {
  const r = resolve({ attackValue: 0, lightPlan: false, intensityModifier: 0, roll: 6 });
  assert.equal(r.noColumn, true);
  assert.equal(r.cell, null);
  assert.equal(r.impacts, 0);
});

test('tirada 0 siempre da "." (sin impactos)', () => {
  const r = resolve({ attackValue: 13, lightPlan: false, intensityModifier: 0, roll: 0 });
  assert.equal(r.impacts, 0);
});

test('un Valor de Ataque no numérico lanza error', () => {
  assert.throws(() => resolve({ attackValue: 'x', lightPlan: false, intensityModifier: 0, roll: 1 }), /número/);
});
