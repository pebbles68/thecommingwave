// Pruebas del motor de Ataque con Torpedos a unidades de superficie
// (public/js/torpedo-attack-engine.js; Decision Book §9.13.1). Los valores
// esperados de celda están leídos de la página 27 impresa de
// Tablas-de-combate 5.pdf (render a 110 DPI, 2026-10-04), no derivados del motor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/torpedo-attack-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const page27 = readJson('tables/page-27.json');
const workflow = readJson('workflows/09_ataque_torpedos_superficie.json');
const table = page27.tables.find((t) => t.id === 'torpedo-vs-surface-damage');

const resolve = (opts) => engine.resolveTorpedoAttack(table, tableEngine, opts);

// --- Datos ---

test('page-27: los esquemas exposed/hidden tienen una etiqueta por columna y coinciden con attackerStateGrouping', () => {
  const sets = table.columnAxis.alternateLabelSets;
  assert.equal(sets.exposed.length, table.columnAxis.values.length);
  assert.equal(sets.hidden.length, table.columnAxis.values.length);
  const { expuesto, oculto } = table.columnAxis.attackerStateGrouping;
  assert.deepEqual(sets.exposed.slice(0, expuesto.length), expuesto);
  assert.deepEqual(sets.hidden.slice(0, oculto.length), oculto);
  assert.ok(sets.exposed.slice(expuesto.length).every((l) => l === null));
  assert.ok(sets.hidden.slice(oculto.length).every((l) => l === null));
});

test('workflow 09: declara torpedo_type (círculo/hexágono) con fuentes, y la regla de impactos del Paso 5', () => {
  const stage = workflow.stages.find((s) => s.id === 'detection_context');
  const q = stage.questions.find((x) => x.id === 'torpedo_type');
  assert.deepEqual(q.options.map((o) => o.value), ['circle', 'hexagon']);
  assert.ok(q.sourceRefs.length >= 1);
  assert.ok(stage.parallelGroups[0].includes('torpedo_type'));
  assert.equal(workflow.impactResolution.rules.length, 2);
  assert.ok(workflow.impactResolution.sourceRefs.length >= 1);
});

test('workflow 09: el atajo de velocidad ≤ 3 ignora el DADO (no fija el valor de ataque) — corrección contra el Decision Book §9.13.1 Paso 2', () => {
  const shortcut = workflow.shortcuts.find((s) => s.question === 'all_target_speed_le3');
  assert.match(shortcut.note, /DADO se ignora/);
  assert.doesNotMatch(shortcut.note, /se fija en 9 para toda la flota objetivo/);
});

// --- Paso 1: selección de columna ---

test('selectColumnScheme: con búsqueda por diferencia de firma / Zona Central de MPA, Expuesto -> exposed, Oculto -> hidden', () => {
  assert.equal(engine.selectColumnScheme({ aswContext: 'surface_search_or_mpa', attackerState: 'exposed' }), 'exposed');
  assert.equal(engine.selectColumnScheme({ aswContext: 'surface_search_or_mpa', attackerState: 'hidden' }), 'hidden');
});

test('selectColumnScheme: sin esa situación se usa la tercera fila (esquema canónico) sea cual sea el estado', () => {
  assert.equal(engine.selectColumnScheme({ aswContext: 'none', attackerState: 'exposed' }), undefined);
  assert.equal(engine.selectColumnScheme({ aswContext: 'none', attackerState: 'hidden' }), undefined);
});

test('selectColumnScheme: un estado desconocido con contexto ASW lanza error en vez de elegir una fila', () => {
  assert.throws(() => engine.selectColumnScheme({ aswContext: 'surface_search_or_mpa', attackerState: '' }), /desconocido/);
});

// --- Pasos 2-3: celda de la tabla (valores leídos de la página impresa) ---

test('Expuesto con Valor 7 cae en la columna "6~9"; tirada 6 -> 1 (fila 6, 2ª columna de datos)', () => {
  const r = resolve({ columnScheme: 'exposed', torpedoValue: 7, roll: 6, torpedoType: 'circle' });
  assert.equal(r.cell.columnLabel, '6~9');
  assert.equal(r.cell.rawCell, '1');
  assert.equal(r.finalImpacts, 1);
});

test('Oculto con Valor 7 cae en "6~7"; tirada 3 -> "." (sin impactos)', () => {
  const r = resolve({ columnScheme: 'hidden', torpedoValue: 7, roll: 3, torpedoType: 'circle' });
  assert.equal(r.cell.columnLabel, '6~7');
  assert.equal(r.outcome, 'no_effect');
  assert.equal(r.finalImpacts, 0);
});

test('Valor 12 se lee como "10+" (esquema canónico); tirada 9 -> 8', () => {
  const r = resolve({ torpedoValue: 12, roll: 9, torpedoType: 'circle' });
  assert.equal(r.cell.columnLabel, '10+');
  assert.equal(r.finalImpacts, 8);
});

test('tirada 0 o 1 es "NO ATACÓ": sin impactos y sin consumir munición', () => {
  for (const roll of [0, 1]) {
    const r = resolve({ torpedoValue: 5, roll, torpedoType: 'hexagon' });
    assert.equal(r.outcome, 'no_attack');
    assert.equal(r.finalImpacts, 0);
  }
});

// --- Paso 2: velocidad impresa <= 3 ---

test('Velocidad impresa ≤ 3: el dado se ignora y el resultado es 9, aunque se haya introducido otro', () => {
  const r = resolve({ torpedoValue: 3, roll: 1, allTargetsSpeedLe3: true, torpedoType: 'circle' });
  assert.equal(r.rollIgnored, true);
  assert.equal(r.effectiveRoll, 9);
  assert.equal(r.cell.rawCell, '3'); // fila 9, columna 3
  assert.equal(r.finalImpacts, 3);
});

// --- Paso 4: tipo de torpedo ---

test('Círculo con asterisco: pide un segundo dado y toma el MENOR (4* y dado 2 -> 2; dado 7 -> 4; dado igual -> 4)', () => {
  const base = { torpedoValue: 10, roll: 5, torpedoType: 'circle' }; // fila 5, 10+ = "4*"
  const pending = resolve(base);
  assert.equal(pending.cell.rawCell, '4*');
  assert.equal(pending.needsFollowUpRoll, true);
  assert.equal(pending.finalImpacts, null);
  assert.equal(resolve({ ...base, followUpRoll: 2 }).finalImpacts, 2);
  assert.equal(resolve({ ...base, followUpRoll: 7 }).finalImpacts, 4);
  assert.equal(resolve({ ...base, followUpRoll: 4 }).finalImpacts, 4);
});

test('Círculo sin asterisco: los Puntos de Impacto se mantienen sin segundo dado', () => {
  const r = resolve({ torpedoValue: 6, roll: 4, torpedoType: 'circle' }); // fila 4, columna 6 = "1"
  assert.equal(r.cell.rawCell, '1');
  assert.equal(r.needsFollowUpRoll, false);
  assert.equal(r.finalImpacts, 1);
});

test('Hexágono con tirada 9: segundo dado y se toma el menor (fila 9, Valor 7 = 6; dado 3 -> 3)', () => {
  const base = { torpedoValue: 7, roll: 9, torpedoType: 'hexagon' };
  assert.equal(resolve(base).needsFollowUpRoll, true);
  const r = resolve({ ...base, followUpRoll: 3 });
  assert.equal(r.cell.rawCell, '6');
  assert.equal(r.finalImpacts, 3);
  assert.equal(r.generalUnitsOnly, false);
});

test('Hexágono con asterisco y tirada distinta de 9: el ataque no tiene efecto', () => {
  const r = resolve({ torpedoValue: 10, roll: 5, torpedoType: 'hexagon' }); // "4*"
  assert.equal(r.outcome, 'no_effect');
  assert.equal(r.finalImpacts, 0);
});

test('Hexágono sin 9 ni asterisco: se aplican las dos reglas, solo unidades generales y un solo buque (confirmado por el mantenedor, 2026-10-07)', () => {
  const r = resolve({ torpedoValue: 6, roll: 4, torpedoType: 'hexagon' }); // "1"
  assert.equal(r.finalImpacts, 1);
  assert.equal(r.generalUnitsOnly, true);
  assert.equal(r.singleShipOnly, true);
  assert.match(r.notes.join(' '), /solo puede ser impactado un buque aunque el resultado sea otro número/);
  // Con un resultado mayor sigue siendo un solo buque.
  assert.equal(resolve({ torpedoValue: 9, roll: 6, torpedoType: 'hexagon' }).singleShipOnly, true);
  // En el resto de casos no se aplica.
  assert.notEqual(resolve({ torpedoValue: 6, roll: 4, torpedoType: 'circle' }).singleShipOnly, true);
});

test('Velocidad ≤ 3 con torpedo de hexágono cuenta como tirada inicial 9: pide segundo dado', () => {
  const r = resolve({ torpedoValue: 3, roll: '', allTargetsSpeedLe3: true, torpedoType: 'hexagon' });
  assert.equal(r.needsFollowUpRoll, true);
  assert.equal(resolve({ torpedoValue: 3, roll: '', allTargetsSpeedLe3: true, torpedoType: 'hexagon', followUpRoll: 2 }).finalImpacts, 2);
});

// --- Validación de entradas ---

test('un tipo de torpedo o un Valor de Ataque inválidos lanzan error en vez de resolver', () => {
  assert.throws(() => resolve({ torpedoValue: 5, roll: 4, torpedoType: '' }), /Tipo de torpedo/);
  assert.throws(() => resolve({ torpedoValue: 0, roll: 4, torpedoType: 'circle' }), /1 o mayor/);
});

test('parseImpactCell: ".", "N", "N*" y "NO_ATACO"; una celda desconocida lanza', () => {
  assert.deepEqual(engine.parseImpactCell('.'), { kind: 'none', impacts: 0, star: false });
  assert.deepEqual(engine.parseImpactCell('3*'), { kind: 'impacts', impacts: 3, star: true });
  assert.deepEqual(engine.parseImpactCell('8'), { kind: 'impacts', impacts: 8, star: false });
  assert.equal(engine.parseImpactCell('NO_ATACO').kind, 'no_attack');
  assert.throws(() => engine.parseImpactCell('x'), /no reconocida/);
});
