// Pruebas del motor de Asignación de Objetivos BVR y retirada previa
// (public/js/air-intercept-targets-engine.js; Decision Book §7.16.1-§7.16.2)
// y de `interceptionRules` del workflow 05.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/air-intercept-targets-engine.js');

const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'workflows', '05_combate_aereo.json'), 'utf8'));

test('workflow 05: interceptionRules con textos de asignación y retirada citando §7.16.1-§7.16.3', () => {
  const r = workflow.interceptionRules;
  ['eea', 'priority', 'pass', 'stop', 'oneOpponent'].forEach((k) => assert.ok(r.targetAssignment[k], k));
  ['targeted', 'lowAltitude', 'sustainedFlown', 'transportGroup'].forEach((k) => assert.ok(r.preBvrWithdrawal.exceptions[k], k));
  assert.ok(r.targetAssignment.sourceRefs.some((s) => /7\.16\.1/.test(s.section)));
  assert.ok(r.preBvrWithdrawal.sourceRefs.some((s) => /7\.16\.2/.test(s.section)));
  assert.ok(r.afterBvr);
});

test('modo: un solo bando con EEA elige; ambos o ninguno -> prioridad', () => {
  assert.deepEqual(engine.selectionMode(true, false), { mode: 'eea', side: 'A' });
  assert.deepEqual(engine.selectionMode(false, true), { mode: 'eea', side: 'B' });
  assert.equal(engine.selectionMode(true, true).mode, 'priority');
  assert.equal(engine.selectionMode(false, false).mode, 'priority');
});

const units = [
  { id: 'a1', side: 'A', electronic: 2, detected: true },
  { id: 'a2', side: 'A', electronic: 3, detected: false },
  { id: 'b1', side: 'B', electronic: 3, detected: false },
  { id: 'b2', side: 'B', electronic: 4, detected: true }
];

test('orden por prioridad: no detectadas primero, Valor Electrónico mayor primero, empate entre bandos -> el que inició', () => {
  const ids = (initiatorSide) => engine.selectionOrder(units, { eeaA: false, eeaB: false, initiatorSide }).order.map((o) => o.id);
  assert.deepEqual(ids('A'), ['a2', 'b1', 'b2', 'a1']);
  assert.deepEqual(ids('B'), ['b1', 'a2', 'b2', 'a1']);
});

test('empate de Valor Electrónico dentro del mismo bando: se respeta el orden listado y se marca', () => {
  const u = [{ id: 'a1', side: 'A', electronic: 2, detected: false }, { id: 'a2', side: 'A', electronic: 2, detected: false }, { id: 'b1', side: 'B', electronic: 1, detected: false }];
  const { order } = engine.selectionOrder(u, { eeaA: false, eeaB: false, initiatorSide: 'B' });
  assert.deepEqual(order.map((o) => [o.id, o.tieWithinSide]), [['a1', true], ['a2', true], ['b1', false]]);
});

test('modo EEA: solo eligen las unidades del bando con escolta, en el orden listado', () => {
  const { mode, order } = engine.selectionOrder(units, { eeaA: false, eeaB: true, initiatorSide: 'A' });
  assert.equal(mode.side, 'B');
  assert.deepEqual(order.map((o) => o.id), ['b1', 'b2']);
});

test('asignación: un avión emparejado no elige ni es elegido; termina cuando el bando menos numeroso está emparejado', () => {
  const u = [
    { id: 'a1', side: 'A', electronic: 5, detected: false },
    { id: 'b1', side: 'B', electronic: 4, detected: false },
    { id: 'b2', side: 'B', electronic: 3, detected: false },
    { id: 'b3', side: 'B', electronic: 1, detected: false }
  ];
  const { order } = engine.selectionOrder(u, { eeaA: false, eeaB: false, initiatorSide: 'A' });
  let r = engine.applySelections(u, order, []);
  assert.deepEqual(r.next, { chooserId: 'a1', available: ['b1', 'b2', 'b3'] });
  r = engine.applySelections(u, order, [{ chooserId: 'a1', targetId: 'b2' }]);
  assert.equal(r.done, true);
  assert.deepEqual(r.pairs, [{ chooserId: 'a1', targetId: 'b2' }]);
  assert.deepEqual(r.nonParticipants, ['b1', 'b3']);
  assert.deepEqual(r.targetedIds, ['b2']);
});

test('asignación: renunciar pasa el turno al siguiente; un objetivo ya emparejado no se puede elegir', () => {
  const { order } = engine.selectionOrder(units, { eeaA: false, eeaB: false, initiatorSide: 'A' });
  // Orden a2, b1, b2, a1. a2 renuncia; b1 elige a1; b2 elige a2.
  let r = engine.applySelections(units, order, [{ chooserId: 'a2', targetId: null }]);
  assert.deepEqual(r.next, { chooserId: 'b1', available: ['a1', 'a2'] });
  r = engine.applySelections(units, order, [{ chooserId: 'a2', targetId: null }, { chooserId: 'b1', targetId: 'a1' }]);
  assert.deepEqual(r.next, { chooserId: 'b2', available: ['a2'] });
  r = engine.applySelections(units, order, [{ chooserId: 'a2', targetId: null }, { chooserId: 'b1', targetId: 'a1' }, { chooserId: 'b2', targetId: 'a2' }]);
  assert.equal(r.done, true);
  assert.equal(r.pairs.length, 2);
  assert.deepEqual(r.passed, ['a2']);
  assert.throws(() => engine.applySelections(units, order, [{ chooserId: 'a2', targetId: 'b1' }, { chooserId: 'b2', targetId: 'a2' }]), /oponente|mismo bando|toca/);
});

test('retirada antes del BVR (§7.16.2): aire-aire no; objetivo, baja altitud, Vuelo Sostenido "Volado" y grupo de transporte con objetivo no pueden', () => {
  const ctx = { targetedIds: ['t'], transportGroupTargeted: { A: true, B: false } };
  const block = (u) => engine.preBvrWithdrawalBlock(Object.assign({ side: 'A' }, u), ctx);
  assert.equal(block({ id: 'x', airToAir: true }), 'airToAir');
  assert.equal(block({ id: 't' }), 'targeted');
  assert.equal(block({ id: 'x', lowAltitude: true }), 'lowAltitude');
  assert.equal(block({ id: 'x', sustainedFlown: true }), 'sustainedFlown');
  assert.equal(block({ id: 'x', transport: true }), 'transportGroup');
  assert.equal(engine.preBvrWithdrawalBlock({ id: 'y', side: 'B', transport: true }, ctx), null);
  assert.equal(block({ id: 'x' }), null);
});

// --- Interceptación de penetración (§7.10.4) ---

test('penetración: solo el bando que penetra con EEA (y el interceptor sin ella) activa el modo propio', () => {
  const m = (eeaA, eeaB, penetratorSide) => engine.selectionMode(eeaA, eeaB, { context: 'penetration', penetratorSide }).mode;
  assert.equal(m(true, false, 'A'), 'eea_penetration');
  assert.equal(m(false, true, 'B'), 'eea_penetration');
  assert.equal(m(true, true, 'A'), 'priority');          // ambos con EEA: sin efecto adicional
  assert.equal(m(false, true, 'A'), 'priority');         // solo el interceptor: la fuente no da efecto
  assert.equal(m(false, false, 'A'), 'priority');
  assert.equal(engine.selectionMode(false, true).mode, 'eea'); // sin contexto: interceptación de combate aéreo
});

test('penetración con EEA: el avión EW del que penetra elige el primero y el resto sigue la prioridad', () => {
  const u = [
    { id: 'a1', side: 'A', electronic: 1, detected: false },
    { id: 'a2', side: 'A', electronic: 0, detected: true, ew: true },
    { id: 'b1', side: 'B', electronic: 5, detected: false },
    { id: 'b2', side: 'B', electronic: 2, detected: true }
  ];
  const { mode, order } = engine.selectionOrder(u, { eeaA: true, eeaB: false, initiatorSide: 'B', context: 'penetration', penetratorSide: 'A' });
  assert.equal(mode.mode, 'eea_penetration');
  assert.deepEqual(order.map((o) => o.id), ['a2', 'b1', 'a1', 'b2']);
  assert.equal(order[0].tier, 0);
});

test('en interceptación de combate aéreo con EEA no se usa la bandera ew: eligen todas las unidades de ese bando', () => {
  const u = [{ id: 'a1', side: 'A', electronic: 1, detected: false, ew: true }, { id: 'a2', side: 'A', electronic: 2, detected: false }, { id: 'b1', side: 'B', electronic: 3, detected: false }];
  const { order } = engine.selectionOrder(u, { eeaA: true, eeaB: false, initiatorSide: 'A', context: 'air_combat' });
  assert.deepEqual(order.map((o) => o.id), ['a1', 'a2']);
});
