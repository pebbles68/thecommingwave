// Pruebas de los datos y la resolución del Ataque Terrestre No Guiado (workflow 03 +
// data/tables/page-09.json + public/js/ground-guided-attack-engine.js, que resuelve
// ambas tablas con los mismos pasos: Decision Book §5.13.2-§5.13.6). Los valores
// esperados de celda están leídos de la página 9 impresa de Tablas-de-combate 5.pdf
// (render a 110 DPI, 2026-10-05) y del ejemplo textual de §5.13.6 (Convencional -
// Estándar, instalación fija, columna "26~35", tirada 6 -> 9 impactos).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/ground-guided-attack-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const workflow = readJson('workflows/03_ataque_terrestre_no_guiado.json');
const page9 = readJson('tables/page-09.json');
const fr = workflow.finalResolution;
const table = page9.tables.find((t) => t.id === fr.table.id);
const intensity = workflow.stages.find((s) => s.id === 'attack_intensity');

const methodScheme = (lightPlan, pursuit) => engine.selectMethodRow(fr.methodRows, { lightPlan, pursuit }).columnScheme;
const resolve = (o) => engine.resolveGroundGuidedAttack(table, tableEngine, {
  columnScheme: 'persecucion_ataque', targetFixed: false, intensityModifier: 0, roll: 5,
  valueCap: fr.valueCap, rollRowSchemes: fr.rollRowScheme, ...o
});

// --- Datos ---

test('workflow 03: finalResolution con 4 combinaciones, tope 66, esquemas existentes (null = etiquetas canónicas) y fuentes', () => {
  assert.equal(fr.methodRows.length, 4);
  assert.equal(new Set(fr.methodRows.map((m) => `${m.lightPlan}-${m.pursuit}`)).size, 4);
  fr.methodRows.forEach((m) => { if (m.columnScheme !== null) assert.ok(table.columnAxis.alternateLabelSets[m.columnScheme], m.columnScheme); });
  assert.equal(fr.valueCap, 66);
  assert.ok(fr.sourceRefs.some((r) => /5\.13\.6/.test(r.section)));
});

test('workflow 03: modifierGroups usa ids existentes y respeta §5.13.2 (móvil: distancia, densidad, designación; fija: sin modificaciones)', () => {
  const ids = new Set(intensity.questions.map((q) => q.id));
  const g = intensity.modifierGroups.byTarget;
  Object.values(g).flat().forEach((id) => assert.ok(ids.has(id), id));
  assert.deepEqual(g.mobile, ['distance', 'force_size_excess', 'guidance_modifier']);
  assert.deepEqual(g.fixed, []);
  assert.deepEqual([intensity.forceSize.limit, intensity.forceSize.blockSize, intensity.forceSize.perBlock], [30, 5, 2]);
});

test('page-09: la regla de selección de método está resuelta y la tabla ya no está en revisión', () => {
  assert.equal(table.attackRowGroupSchemeRule.status, 'resolved');
  assert.equal(table.attackRowGroupSchemeRule.cases.length, 4);
  assert.equal(table.needsReview, false);
  assert.equal(table.cells.length, 10);
  assert.equal(table.cells[0].length, table.columnAxis.values.length);
});

// --- Selección y ejemplo del reglamento ---

test('combinaciones: [L] Normal -> normal_ataque; [L] Persecución y Normal -> persecucion_ataque; Persecución -> etiquetas canónicas (null)', () => {
  assert.equal(methodScheme(true, false), 'normal_ataque');
  assert.equal(methodScheme(true, true), 'persecucion_ataque');
  assert.equal(methodScheme(false, false), 'persecucion_ataque');
  assert.equal(methodScheme(false, true), null);
});

test('ejemplo §5.13.6: Convencional - Estándar (fila blanca), instalación fija, columna "26~35", tirada 6 -> 9 Puntos de Impacto', () => {
  const r = resolve({ attackValue: 30, columnScheme: methodScheme(false, false), targetFixed: true, roll: 6 });
  assert.deepEqual([r.columnResult.columnLabel, r.cell.rowLabel, r.rowScheme, r.impacts], ['26~35', '6', 'fijo', 9]);
});

// --- Celdas de la página 9 por método ---

test('[L] Normal: Valor 25 -> columna "21~30"; tirada 7 móvil -> 4; Valor 10 tirada 4 -> 1', () => {
  assert.deepEqual([resolve({ attackValue: 25, columnScheme: 'normal_ataque', roll: 7 }).columnResult.columnLabel, resolve({ attackValue: 25, columnScheme: 'normal_ataque', roll: 7 }).impacts], ['21~30', 4]);
  assert.equal(resolve({ attackValue: 10, columnScheme: 'normal_ataque', roll: 4 }).impacts, 1);
});

test('Normal (no ligero) con Valor 8 -> columna "7~8"; Persecución con Valor 8 -> columna "6~8"; misma tirada 5 móvil, 2 y 3 impactos', () => {
  const normal = resolve({ attackValue: 8, columnScheme: 'persecucion_ataque', roll: 5 });
  assert.deepEqual([normal.columnResult.columnLabel, normal.impacts], ['7~8', 2]);
  const pursuit = resolve({ attackValue: 8, columnScheme: null, roll: 5 });
  assert.deepEqual([pursuit.columnResult.columnLabel, pursuit.impacts], ['6~8', 3]);
});

test('tope 66: Valor 100 usa la columna "66+"; modificación -5 desplaza a la izquierda y se detiene en el extremo', () => {
  assert.equal(resolve({ attackValue: 100, columnScheme: 'normal_ataque' }).columnResult.columnLabel, '66+');
  const shifted = resolve({ attackValue: 12, columnScheme: 'normal_ataque', intensityModifier: -5 });
  assert.deepEqual([shifted.columnResult.columnIndex, shifted.columnResult.columnLabel], [0, '3~5']);
});

test('tirada 9 cancela la modificación: Valor 12 [L] Normal con -5 y tirada 9 usa la columna "12~16" -> fila 9 -> 4', () => {
  const r = resolve({ attackValue: 12, columnScheme: 'normal_ataque', intensityModifier: -5, roll: 9 });
  assert.deepEqual([r.cancelledByNine, r.columnResult.columnLabel, r.impacts], [true, '12~16', 4]);
});

// --- Modificadores (§5.13.2) ---

test('objetivo móvil: suma distancia, densidad y designación; la instalación fija no lleva modificaciones', () => {
  const g = intensity.modifierGroups.byTarget;
  const values = { distance: -5, force_size_excess: 2, guidance_modifier: 1 };
  assert.deepEqual(engine.computeIntensityModifier(g, 'mobile', values), { parts: [{ id: 'distance', value: -5 }, { id: 'force_size_excess', value: 2 }, { id: 'guidance_modifier', value: 1 }], raw: -2, net: -2, positiveDiscarded: false });
  const fixed = engine.computeIntensityModifier(g, 'fixed', values);
  assert.deepEqual([fixed.parts, fixed.raw, fixed.net], [[], 0, 0]);
});
