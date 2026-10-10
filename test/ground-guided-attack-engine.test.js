// Pruebas del motor del Ataque Terrestre Guiado (public/js/ground-guided-attack-engine.js;
// Decision Book §5.12.2-§5.12.10) y de los datos `finalResolution` / `modifierGroups` del
// workflow 02. Los valores esperados de celda están leídos de la página 5 impresa de
// Tablas-de-combate 5.pdf (render a 110 y 300 DPI, 2026-10-05) y del ejemplo textual de
// §5.12.10 (Persecución, móvil, columna "4", tirada 4 -> 11 impactos), no derivados del motor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/ground-guided-attack-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const workflow = readJson('workflows/02_ataque_terrestre_guiado.json');
const page5 = readJson('tables/page-05.json');
const table = page5.tables.find((t) => t.id === workflow.finalResolution.table.id);
const fr = workflow.finalResolution;
const intensity = workflow.stages.find((s) => s.id === 'attack_intensity');

const resolve = (o) => engine.resolveGroundGuidedAttack(table, tableEngine, {
  columnScheme: 'persecucion_ataque', targetFixed: false, intensityModifier: 0, roll: 4,
  valueCap: fr.valueCap, rollRowSchemes: fr.rollRowScheme, ...o
});

// --- Datos ---

test('workflow 02: finalResolution con 4 combinaciones distintas, esquemas existentes en la página 5 y fuentes', () => {
  assert.equal(fr.methodRows.length, 4);
  assert.equal(new Set(fr.methodRows.map((m) => `${m.lightPlan}-${m.pursuit}`)).size, 4);
  fr.methodRows.forEach((m) => assert.ok(table.columnAxis.alternateLabelSets[m.columnScheme], m.columnScheme));
  Object.values(fr.rollRowScheme).forEach((s) => assert.ok(table.rowAxis.alternateLabels[s], s));
  assert.equal(fr.valueCap, 13);
  assert.ok(fr.sourceRefs.some((r) => /5\.12\.10/.test(r.section)));
});

test('workflow 02: modifierGroups usa ids de pregunta existentes y respeta §5.12.9 (técnica = móvil + técnica; fija = solo la suya)', () => {
  const ids = new Set(intensity.questions.map((q) => q.id));
  const g = intensity.modifierGroups.byTargetType;
  Object.values(g).flat().forEach((id) => assert.ok(ids.has(id), id));
  assert.deepEqual(g.technical, [...g.mobile_main, 'technical_electronic']);
  assert.deepEqual(g.fixed, ['fixed_electronic']);
  assert.deepEqual([intensity.forceSize.limit, intensity.forceSize.blockSize, intensity.forceSize.perBlock], [30, 5, 2]);
});

test('page-05: la regla de selección de método está resuelta y la tabla ya no está en revisión', () => {
  assert.equal(table.attackRowGroupSchemeRule.status, 'resolved');
  assert.equal(table.attackRowGroupSchemeRule.cases.length, 4);
  assert.ok(table.attackRowGroupSchemeRule.sharedLabelCell);
  assert.equal(table.needsReview, false);
});

// --- Selección de la fila de etiquetas ---

test('combinaciones: [L] Normal -> normal_ataque; [L] Persecución y Normal -> persecucion_ataque; Persecución -> persecucion_objetivo', () => {
  const s = (lightPlan, pursuit) => engine.selectMethodRow(fr.methodRows, { lightPlan, pursuit }).columnScheme;
  assert.equal(s(true, false), 'normal_ataque');
  assert.equal(s(true, true), 'persecucion_ataque');
  assert.equal(s(false, false), 'persecucion_ataque');
  assert.equal(s(false, true), 'persecucion_objetivo');
});

// --- Ejemplo del Decision Book y celdas de la página ---

test('ejemplo §5.12.10: Persecución, objetivo móvil, columna "4", tirada 4 -> 11 Puntos de Impacto', () => {
  const r = resolve({ attackValue: 4, columnScheme: 'persecucion_objetivo', roll: 4 });
  assert.deepEqual([r.columnResult.columnLabel, r.cell.rowLabel, r.impacts], ['4', '4', 11]);
});

test('Valor de Ataque 4, tirada 4 móvil: [L] Normal -> 3; Normal (no ligero) -> 6; las filas dependen del método', () => {
  assert.equal(resolve({ attackValue: 4, columnScheme: 'normal_ataque' }).impacts, 3);
  assert.equal(resolve({ attackValue: 4, columnScheme: 'persecucion_ataque' }).impacts, 6);
});

test('objetivo fijo: la tirada 4 se lee en la fila "4" de Fijo (la fila móvil 5), no en la móvil 4', () => {
  const fixed = resolve({ attackValue: 4, columnScheme: 'normal_ataque', targetFixed: true, roll: 4 });
  assert.deepEqual([fixed.rowScheme, fixed.cell.rowIndex, fixed.impacts], ['fijo', 5, 3]);
  const mobile = resolve({ attackValue: 4, columnScheme: 'normal_ataque', targetFixed: false, roll: 4 });
  assert.deepEqual([mobile.rowScheme, mobile.cell.rowIndex, mobile.impacts], ['movil', 4, 3]);
  assert.equal(resolve({ attackValue: 13, columnScheme: 'normal_ataque', targetFixed: true, roll: 0 }).cell.rowIndex, 1);
});

test('la tirada 9 en Móvil y la 8~9 en Fijo comparten la última fila', () => {
  assert.equal(resolve({ attackValue: 4, columnScheme: 'normal_ataque', roll: 9 }).cell.rowIndex, 9);
  assert.equal(resolve({ attackValue: 4, columnScheme: 'normal_ataque', targetFixed: true, roll: 8 }).cell.rowIndex, 9);
  assert.equal(resolve({ attackValue: 4, columnScheme: 'normal_ataque', targetFixed: true, roll: 9 }).cell.rowIndex, 9);
});

// --- Desplazamiento, tope y tirada 9 ---

test('modificación -5 con Valor 8 (Normal): desplaza 5 columnas saltando las "·" -> columna "3" -> 4 impactos', () => {
  const r = resolve({ attackValue: 8, intensityModifier: -5 });
  assert.deepEqual([r.columnResult.columnLabel, r.impacts, r.cancelledByNine], ['3', 4, false]);
});

test('tirada 9 cancela la modificación: Valor 8 con -5 usa la columna "8" -> fila 9 -> 24 impactos', () => {
  const r = resolve({ attackValue: 8, intensityModifier: -5, roll: 9 });
  assert.deepEqual([r.columnResult.columnLabel, r.appliedModifier, r.cancelledByNine, r.impacts], ['8', 0, true, 24]);
  assert.equal(resolve({ attackValue: 8, intensityModifier: 0, roll: 9 }).cancelledByNine, false);
});

test('Valor de Ataque > 13: cada punto negativo lo reduce hasta 13 antes de desplazar; tope 13', () => {
  const cap = resolve({ attackValue: 20, intensityModifier: 0 });
  assert.deepEqual([cap.columnResult.effectiveValue, cap.columnResult.columnLabel], [13, '13+']);
  const reduced = resolve({ attackValue: 15, intensityModifier: -2 });
  assert.deepEqual([reduced.columnResult.consumedByCap, reduced.columnResult.columnLabel], [2, '13+']);
});

test('desplazar más allá del extremo izquierdo usa la columna más a la izquierda', () => {
  const r = resolve({ attackValue: 1, columnScheme: 'normal_ataque', intensityModifier: -5 });
  assert.equal(r.columnResult.columnIndex, 0);
});

test('entradas inválidas fallan con error claro', () => {
  assert.throws(() => resolve({ attackValue: '' }), /número/);
  assert.throws(() => resolve({ attackValue: 4, roll: '' }), /1d10/);
  assert.throws(() => engine.selectMethodRow([], { lightPlan: true, pursuit: true }), /No hay fila/);
});

// --- Modificadores de intensidad (§5.12.9) ---

test('densidad de tropas: bloques completos de 5 puntos sobre 30; las fracciones se ignoran', () => {
  const fs5 = intensity.forceSize;
  const blocks = (n) => engine.forceSizeBlocks(n, fs5);
  assert.deepEqual([30, 34, 35, 44, 45, 20].map(blocks), [0, 0, 1, 2, 3, 0]);
  assert.throws(() => blocks(''), /≥ 0/);
});

test('el grupo de modificadores depende del objetivo: principal y técnica suman los de objetivo móvil; la técnica añade su Valor Electrónico; la fija solo el suyo', () => {
  const g = intensity.modifierGroups.byTargetType;
  const values = { attack_distance_band: -5, high_penetration_supersonic: 2, force_size_excess: 2, guidance_modifier: 0, technical_electronic: -4, fixed_electronic: -5 };
  assert.equal(engine.computeIntensityModifier(g, 'mobile_main', values).raw, -1);
  assert.equal(engine.computeIntensityModifier(g, 'technical', values).raw, -5);
  assert.equal(engine.computeIntensityModifier(g, 'fixed', values).raw, -5);
  assert.deepEqual(engine.computeIntensityModifier(g, 'fixed', values).parts, [{ id: 'fixed_electronic', value: -5 }]);
  assert.throws(() => engine.computeIntensityModifier(g, 'tank', values), /desconocido/);
});

test('las modificaciones positivas solo compensan negativas: el neto máximo es 0', () => {
  const g = intensity.modifierGroups.byTargetType;
  const r = engine.computeIntensityModifier(g, 'mobile_main', { attack_distance_band: -2, high_penetration_supersonic: 2, force_size_excess: 4, guidance_modifier: 3 });
  assert.deepEqual([r.raw, r.net, r.positiveDiscarded], [7, 0, true]);
});

// --- Banda de distancia (páginas 5 y 8; §5.12.3 p. 75, §5.13.3 p. 79; confirmado por el mantenedor, 2026-10-07) ---

test('distanceBand: punto 0 / 1 / ≥2; en Misión de Área se cuenta un hexágono menos (hasta uno adyacente al destino)', () => {
  assert.equal(engine.distanceBand('0', 'no'), '0');
  assert.equal(engine.distanceBand('1', 'no'), '1');
  assert.equal(engine.distanceBand('2', 'no'), '2plus');
  assert.equal(engine.distanceBand('7', 'no'), '2plus');
  // «0 // Área ≤1», «1 // ≤2», «≥2 // ≥3»
  assert.equal(engine.distanceBand('0', 'yes'), '0');
  assert.equal(engine.distanceBand('1', 'yes'), '0');
  assert.equal(engine.distanceBand('2', 'yes'), '1');
  assert.equal(engine.distanceBand('3', 'yes'), '2plus');
});

test('distanceBand: sin distancia o sin saber si la misión es de Área no se inventa una banda', () => {
  assert.equal(engine.distanceBand('', 'no'), null);
  assert.equal(engine.distanceBand('2', ''), null);
  assert.equal(engine.distanceBand('abc', 'yes'), null);
  assert.equal(engine.distanceBand('-1', 'yes'), null);
});
