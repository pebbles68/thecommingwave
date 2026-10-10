// Pruebas del motor de Búsqueda por Diferencia de Firma (public/js/asw-signature-search-engine.js;
// Decision Book §9.14.2, §9.15.1, §9.15.3) y de los datos de la página 33 / etapa
// `signature_search` del workflow 13. Los valores esperados de celda están leídos
// de la página 33 impresa de Tablas-de-combate 5.pdf (render a 130 DPI, 2026-10-05),
// no derivados del motor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/asw-signature-search-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const page33 = readJson('tables/page-33.json');
const table = page33.tables[0];
const workflow = readJson('workflows/13_busqueda_asw_apoyo.json');
const stage = workflow.stages.find((s) => s.id === 'signature_search');

const search = (o) => engine.resolveSignatureSearch(table, tableEngine, o);

// --- Datos ---

test('page-33: los 3 marcos de superficie apuntan a columnas e imágenes existentes y las columnas son las 9 de superficie', () => {
  assert.equal(page33.surfaceFrames.length, 3);
  const all = [];
  page33.surfaceFrames.forEach((f) => {
    assert.ok(fs.existsSync(path.join(DATA_DIR, 'tables', f.image)), f.image);
    f.columns.forEach((c) => { assert.ok(table.columnAxis.values.includes(c), c); all.push(c); });
  });
  assert.equal(new Set(all).size, 9);
  assert.ok(page33.surfaceFramesNote.includes('9.15.1'));
});

test('workflow 13: etapa signature_search con preguntas, restricciones, selección de 3 unidades, regla de resolución y fuentes', () => {
  ['searcher_kind', 'trigger', 'target_depth', 'surface_frame', 'frame_closed', 'searcher_signature', 'target_signature', 'target_moving', 'distance']
    .forEach((id) => assert.ok(stage.questions.some((q) => q.id === id), id));
  ['high_speed_no_routine', 'adjacent_needs_deep_water', 'closed_frame_own_hex'].forEach((id) => assert.ok(stage.restrictions.find((r) => r.id === id), id));
  assert.ok(stage.unitSelection.text && stage.resolutionRule.text);
  const frameQ = stage.questions.find((q) => q.id === 'surface_frame');
  assert.deepEqual(frameQ.options.map((o) => o.value), page33.surfaceFrames.map((f) => f.id));
  assert.ok(stage.restrictions.every((r) => r.sourceRefs.length >= 1));
});

// --- Columna (Paso 3) ---

test('columna: submarino por su Firma (8 o más = "8+"); superficie por marco + profundidad', () => {
  assert.equal(engine.searchColumnLabel({ searcherKind: 'submarine', searcherSignature: 9 }), 'sub-8+');
  assert.equal(engine.searchColumnLabel({ searcherKind: 'submarine', searcherSignature: 8 }), 'sub-8+');
  assert.equal(engine.searchColumnLabel({ searcherKind: 'submarine', searcherSignature: 3 }), 'sub-3');
  assert.equal(engine.searchColumnLabel({ searcherKind: 'surface', frame: '2', depth: 'P3' }), 'sup2-p3');
  assert.throws(() => engine.searchColumnLabel({ searcherKind: 'surface', frame: '4', depth: 'P3' }), /marco/);
  assert.throws(() => engine.searchColumnLabel({ searcherKind: 'surface', frame: '1', depth: 'P1' }), /profundidad/);
  assert.throws(() => engine.searchColumnLabel({ searcherKind: 'submarine', searcherSignature: -1 }), /≥ 0/);
});

// --- Resolución (Pasos 2-7) ---

test('submarino Firma 4 busca un objetivo de Firma 5: fila 4; Rutina HEX = "9" (solo tirada 9), Después del ataque HEX = "5+"', () => {
  const base = { searcherKind: 'submarine', searcherSignature: 4, targetSignature: 5, targetMoving: 'no', distance: 'hex' };
  const routine = search({ ...base, trigger: 'routine_movement', roll: 9 });
  assert.deepEqual([routine.columnLabel, routine.rowIndex, routine.rangeColumnLabel, routine.cell.rawCell, routine.success], ['sub-4', 4, 'rango1-hex', '9', true]);
  assert.equal(search({ ...base, trigger: 'routine_movement', roll: 8 }).success, false);
  const after = search({ ...base, trigger: 'after_attack_evasion', roll: 5 });
  assert.deepEqual([after.cell.rawCell, after.success], ['5+', true]);
  assert.equal(search({ ...base, trigger: 'after_attack_evasion', roll: 4 }).success, false);
});

test('unidad de superficie, marco 1, P.4: Firma 3 + 1 En Movimiento = 4 -> fila 3; Rutina HEX "." (sin detección), Después del ataque HEX "6+"', () => {
  const base = { searcherKind: 'surface', frame: '1', depth: 'P4', targetSignature: 3, targetMoving: 'yes', distance: 'hex' };
  const routine = search({ ...base, trigger: 'routine_movement', roll: 9 });
  assert.deepEqual([routine.columnLabel, routine.effectiveSignature, routine.rowIndex, routine.cell.rawCell, routine.success], ['sup1-p4', 4, 3, '.', false]);
  const after = search({ ...base, trigger: 'after_attack_evasion', roll: 6 });
  assert.deepEqual([after.cell.rawCell, after.success], ['6+', true]);
});

test('casilla adyacente: marco 1 P.4 con Firma 8 -> fila 7; Rutina ADYAC "9", Después del ataque ADYAC "5+"', () => {
  const base = { searcherKind: 'surface', frame: '1', depth: 'P4', targetSignature: 8, targetMoving: 'no', distance: 'adjacent' };
  assert.equal(search({ ...base, trigger: 'routine_movement', roll: 9 }).cell.rawCell, '9');
  assert.equal(search({ ...base, trigger: 'after_attack_evasion', roll: 5 }).cell.rawCell, '5+');
});

test('rangos de la columna del buscador: "0~1" cubre Firma 0 y 1, "9+" cubre 9 o más; marco 3 P.2 usa "0~3"', () => {
  const base = { searcherKind: 'surface', frame: '1', depth: 'P4', targetMoving: 'no', distance: 'hex', trigger: 'after_attack_evasion', roll: 0 };
  assert.equal(search({ ...base, targetSignature: 0 }).rowIndex, 0);
  assert.equal(search({ ...base, targetSignature: 1 }).rowIndex, 0);
  assert.equal(search({ ...base, targetSignature: 9 }).rowIndex, 8);
  assert.equal(search({ ...base, targetSignature: 12 }).rowIndex, 8);
  const f3 = search({ ...base, frame: '3', depth: 'P2', targetSignature: 3 });
  assert.deepEqual([f3.columnLabel, f3.rowIndex, f3.cell.rawCell], ['sup3-p2', 0, '9']);
});

test('una celda "." en el rango o una tirada fuera del rango es fallo automático; sin tirada no hay éxito', () => {
  const base = { searcherKind: 'submarine', searcherSignature: 4, targetSignature: 2, targetMoving: 'no', distance: 'hex', trigger: 'routine_movement' };
  const r = search({ ...base, roll: 9 });
  assert.deepEqual([r.rowIndex, r.cell.rawCell, r.range.kind, r.success], [1, '.', 'none', false]);
  const noRoll = search({ ...base, targetSignature: 5, roll: '' });
  assert.deepEqual([noRoll.cell.rawCell, noRoll.roll, noRoll.success], ['9', null, false]);
});

test('entradas inválidas fallan con error claro', () => {
  const ok = { searcherKind: 'submarine', searcherSignature: 4, targetSignature: 5, distance: 'hex', trigger: 'routine_movement' };
  assert.throws(() => search({ ...ok, trigger: 'x' }), /qué activó/);
  assert.throws(() => search({ ...ok, distance: 'far' }), /misma casilla/);
  assert.throws(() => search({ ...ok, targetSignature: '' }), /≥ 0/);
});

// --- Restricciones ---

test('restricciones: Alta Velocidad no hace Rutina; el alcance adyacente exige aguas profundas y marco abierto', () => {
  const check = (o) => engine.checkRestrictions({ searcherKind: 'surface', trigger: 'after_attack_evasion', highSpeed: 'no', frameClosed: 'no', depth: 'P4', distance: 'hex', ...o });
  assert.deepEqual(check({}), { allowed: true, blocking: [] });
  assert.deepEqual(check({ highSpeed: 'yes', trigger: 'routine_movement' }).blocking, ['high_speed_no_routine']);
  assert.equal(check({ highSpeed: 'yes', trigger: 'after_attack_evasion' }).allowed, true);
  assert.deepEqual(check({ distance: 'adjacent', depth: 'P3' }).blocking, ['adjacent_needs_deep_water']);
  assert.deepEqual(check({ distance: 'adjacent', frameClosed: 'yes' }).blocking, ['closed_frame_own_hex']);
  assert.deepEqual(check({ distance: 'adjacent', frameClosed: 'yes', depth: 'P2' }).blocking, ['closed_frame_own_hex', 'adjacent_needs_deep_water']);
  assert.equal(engine.checkRestrictions({ searcherKind: 'submarine', trigger: 'routine_movement', highSpeed: 'yes', distance: 'hex', depth: 'P4' }).allowed, true);
});
