// Pruebas del motor de Búsqueda Aérea ASW (public/js/asw-air-search-engine.js;
// Decision Book §9.14.3 y §9.15.4) y de los datos de la página 34. Los valores
// esperados de celda están leídos de la página 34 impresa de
// Tablas-de-combate 5.pdf (render a 100 DPI, 2026-10-04), no derivados del motor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/asw-air-search-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const page34 = readJson('tables/page-34.json');
const workflow = readJson('workflows/13_busqueda_asw_apoyo.json');
const routine = page34.tables.find((t) => t.id === 'asw-air-search-routine');
const postAttack = page34.tables.find((t) => t.id === 'asw-air-search-post-attack');

const search = (table, o) => engine.resolveAirSearch(table, tableEngine, o);

// --- Datos ---

test('page-34: cada tabla declara las tres lecturas P4/P3/P2 con una etiqueta por fila de datos', () => {
  for (const t of [routine, postAttack]) {
    const labels = t.rowAxis.alternateLabels;
    assert.deepEqual(Object.keys(labels), ['P4', 'P3', 'P2']);
    Object.values(labels).forEach((l) => assert.equal(l.length, t.cells.length));
    t.cells.forEach((row) => assert.equal(row.length, t.columnAxis.values.length));
  }
});

test('page-34: toda celda es "." o un rango de descubrimiento N / N+ que el motor sabe interpretar', () => {
  for (const t of [routine, postAttack]) {
    t.cells.flat().forEach((c) => assert.doesNotThrow(() => engine.parseDiscoveryRange(c), c));
  }
});

test('workflow 13: cada evento declara su tabla de búsqueda aérea, y esas tablas existen', () => {
  const eventQ = workflow.stages[0].questions.find((q) => q.id === 'event');
  const ids = new Set(page34.tables.map((t) => t.id));
  eventQ.options.forEach((o) => assert.ok(ids.has(o.airSearchTable), o.value));
  assert.equal(eventQ.options.find((o) => o.value === 'routine').airSearchTable, 'asw-air-search-routine');
  assert.equal(eventQ.options.find((o) => o.value === 'post_attack').airSearchTable, 'asw-air-search-post-attack');
  assert.equal(eventQ.options.find((o) => o.value === 'pre_evasion').airSearchTable, 'asw-air-search-post-attack');
});

test('workflow 13: la etapa air_search declara restricciones con fuente y todos los ids que el motor devuelve', () => {
  const stage = workflow.stages.find((s) => s.id === 'air_search');
  const ids = new Set(stage.restrictions.map((r) => r.id));
  stage.restrictions.forEach((r) => assert.ok(r.sourceRefs.length >= 1, r.id));
  const emitted = [
    engine.checkTargetRestrictions({ event: 'routine', targetInEnemyCapZone: 'yes', depth: 'P4' }).blocking,
    engine.sumAirValue([{ airValue: 1, inEnemyCapZone: true }, { airValue: 1, highSpeed: true }], 'routine').contributions.map((c) => c.excludedBy)
  ].flat().filter(Boolean);
  emitted.forEach((id) => assert.ok(ids.has(id), id));
  assert.match(stage.restrictions.find((r) => r.id === 'high_speed_excluded').text, /Antes de la Emboscada/);
  assert.equal(stage.ambushHighSpeedDiscrepancy, undefined, 'la discrepancia está resuelta y su bloque retirado');
});

// --- Pasos 3-5: celdas leídas de la página impresa ---

test('rutina, P.3, Firma 5 (fila "6+" de P.3), Valor total 12 (col 12~13) -> "6+": éxito con tirada 6, fallo con 5', () => {
  const base = { depth: 'P3', signature: 5, totalAirValue: 12 };
  const ok = search(routine, { ...base, roll: 6 });
  assert.equal(ok.cell.rawCell, '6+');
  assert.equal(ok.success, true);
  assert.equal(search(routine, { ...base, roll: 5 }).success, false);
});

test('rutina, P.4, Firma 7 (fila "7+"), Valor 3 -> "9": solo una tirada de 9', () => {
  const base = { depth: 'P4', signature: 7, totalAirValue: 3 };
  assert.equal(search(routine, { ...base, roll: 9 }).success, true);
  assert.equal(search(routine, { ...base, roll: 8 }).success, false);
  assert.equal(search(routine, { ...base, roll: 8 }).range.kind, 'exact');
});

test('rutina, P.4, Firma 3 (fila "0~3"): siempre "." -> la búsqueda falla automáticamente, incluso con tirada 9', () => {
  const r = search(routine, { depth: 'P4', signature: 3, totalAirValue: 24, roll: 9 });
  assert.equal(r.cell.rawCell, '.');
  assert.equal(r.success, false);
});

test('la misma Firma 4 lee filas distintas según la profundidad (Valor 24+: P.4 -> fila "4" = "9"; P.3 -> fila "5/4/3" = "7+"; P.2 -> fila "6/5/4" = "4+")', () => {
  const at = (depth) => search(routine, { depth, signature: 4, totalAirValue: 24, roll: 0 }).cell.rawCell;
  assert.deepEqual([at('P4'), at('P3'), at('P2')], ['9', '7+', '4+']);
});

test('un submarino En Movimiento suma +1 a la Firma y puede cambiar de fila (P.4, Firma 3 -> 4)', () => {
  const still = search(routine, { depth: 'P4', signature: 3, targetMoving: false, totalAirValue: 24, roll: 9 });
  const moving = search(routine, { depth: 'P4', signature: 3, targetMoving: true, totalAirValue: 24, roll: 9 });
  assert.equal(still.success, false);
  assert.equal(moving.effectiveSignature, 4);
  assert.equal(moving.cell.rawCell, '9');
  assert.equal(moving.success, true);
});

test('después del ataque, P.2, Firma 6 (fila "5+"), Valor 9 (col 9~10) -> "1+": éxito con cualquier tirada de 1 a 9, no con 0', () => {
  const base = { depth: 'P2', signature: 6, totalAirValue: 9 };
  assert.equal(search(postAttack, { ...base, roll: 1 }).cell.rawCell, '1+');
  assert.equal(search(postAttack, { ...base, roll: 1 }).success, true);
  assert.equal(search(postAttack, { ...base, roll: 0 }).success, false);
});

test('el Valor total 24+ usa la última columna; un Valor menor que 1 no busca (sin celda inventada)', () => {
  assert.equal(search(routine, { depth: 'P4', signature: 7, totalAirValue: 40, roll: 0 }).cell.columnLabel, '24+');
  const none = search(routine, { depth: 'P4', signature: 7, totalAirValue: 0, roll: 9 });
  assert.equal(none.noSearch, true);
  assert.equal(none.cell, null);
  assert.equal(none.success, false);
});

// --- Paso 1: restricciones y suma ---

test('el objetivo en una zona de patrulla aérea enemiga, o una búsqueda de rutina en aguas profundas, impiden la búsqueda', () => {
  assert.deepEqual(engine.checkTargetRestrictions({ event: 'routine', targetInEnemyCapZone: 'yes', depth: 'P4' }).blocking, ['target_in_enemy_cap_zone', 'routine_no_deep_water']);
  assert.equal(engine.checkTargetRestrictions({ event: 'routine', targetInEnemyCapZone: 'no', depth: 'P3' }).allowed, true);
  assert.equal(engine.checkTargetRestrictions({ event: 'movement', targetInEnemyCapZone: 'no', depth: 'P4' }).allowed, true, 'solo la rutina excluye aguas profundas');
});

test('sumAirValue: suma las unidades que pueden buscar; excluye las de zona enemiga y las de Alta Velocidad en rutina, movimiento y antes de la emboscada', () => {
  const units = [{ airValue: 4 }, { airValue: 3, highSpeed: true }, { airValue: 2, inEnemyCapZone: true }, { airValue: '5' }];
  const routineSum = engine.sumAirValue(units, 'routine');
  assert.equal(routineSum.total, 9);
  assert.deepEqual(routineSum.contributions.map((c) => c.excludedBy), [null, 'high_speed_excluded', 'unit_in_enemy_cap_zone', null]);
  assert.equal(engine.sumAirValue(units, 'movement').total, 9);
  assert.equal(engine.sumAirValue(units, 'post_attack').total, 12, 'después del ataque la Alta Velocidad no excluye');
});

test('"Antes de la Emboscada": una formación a Alta Velocidad no puede buscar (confirmado por el mantenedor, 2026-10-07)', () => {
  const r = engine.sumAirValue([{ airValue: 4 }, { airValue: 3, highSpeed: true }], 'pre_ambush');
  assert.equal(r.total, 4);
  assert.deepEqual(r.contributions.map((c) => c.excludedBy), [null, 'high_speed_excluded']);
  assert.equal(r.ambushHighSpeedDiscrepancy, undefined, 'ya no hay discrepancia que informar');
});

test('entradas inválidas lanzan error en vez de resolver', () => {
  assert.throws(() => engine.sumAirValue([{ airValue: '' }], 'routine'), /Valor de Detección Aérea/);
  assert.throws(() => search(routine, { depth: 'P4', signature: '', totalAirValue: 3, roll: 1 }), /Firma/);
  assert.throws(() => engine.parseDiscoveryRange('x'), /no reconocida/);
});
