// Pruebas del grupo de misión aéreo compartido (public/js/air-mission-group.js; roadmap Fase 11).
const test = require('node:test');
const assert = require('node:assert/strict');

const G = require('../public/js/air-mission-group.js');

function sample() {
  let g = G.emptyGroup();
  g = JSON.parse(JSON.stringify(g));
  g.sides.A.units.push(G.newUnit({ id: 'a1', name: 'F-16 1', airCombatValue: '5', protection: '3', electronic: '2' }));
  g.sides.A.units.push(G.newUnit({ id: 'a2', name: 'F-16 2', airCombatValue: '5', protection: '3', network: 'yes' }));
  g.sides.B.units.push(G.newUnit({ id: 'b1', name: 'Su-35', airCombatValue: '6', protection: '4', electronic: '4', detected: 'yes' }));
  g.sides.A.groupType = 'cap';
  return g;
}

test('normalize: valores raros vuelven al grupo vacío; estados desconocidos pasan a «en combate»', () => {
  assert.deepEqual(G.normalize(null), G.emptyGroup());
  assert.deepEqual(G.normalize('x'), G.emptyGroup());
  const g = G.normalize({ sides: { A: { label: 'Azul', eea: 'yes', units: [{ id: 'u', name: 'X', status: 'raro', network: 'sí' }] } } });
  assert.equal(g.sides.A.label, 'Azul');
  assert.equal(g.sides.A.eea, 'yes');
  assert.equal(g.sides.A.units[0].status, 'active');
  assert.equal(g.sides.A.units[0].network, 'no');
  assert.equal(g.sides.B.label, 'Bando B');
});

test('toWvrSides: las eliminadas no entran; retiradas y fuera de combate van como salidas del BVR', () => {
  let g = sample();
  g = G.setStatus(g, 'A', 'a1', 'withdrawn');
  g = G.setStatus(g, 'B', 'b1', 'eliminated');
  const w = G.toWvrSides(g);
  assert.deepEqual(w.A.units.map((u) => [u.id, u.bvrOut]), [['a1', 'yes'], ['a2', 'no']]);
  assert.equal(w.A.groupType, 'cap');
  assert.equal(w.A.units[1].network, 'yes');
  assert.deepEqual(w.B.units, []);
});

test('toInterceptState: solo participan las unidades en combate, con los campos que usa la interceptación', () => {
  let g = sample();
  g = G.setStatus(g, 'A', 'a2', 'out');
  const st = G.toInterceptState(g);
  assert.deepEqual(st.units.map((u) => u.id), ['a1', 'b1']);
  assert.equal(st.units[1].detected, 'yes');
  assert.equal(st.units[1].electronic, '4');
  assert.equal(st.units[0].airToAir, 'yes');
});

test('mergeWvr: guarda las unidades del asistente, marca las que salen de combate y no toca el original', () => {
  const g = sample();
  const wvr = G.toWvrSides(g);
  wvr.A.units[0].bvrOut = 'yes';
  const merged = G.mergeWvr(g, wvr, { A: ['a2'], B: ['b1'] });
  assert.equal(g.sides.A.units[0].status, 'active', 'el grupo original no cambia');
  assert.deepEqual(merged.sides.A.units.map((u) => [u.id, u.status]), [['a1', 'out'], ['a2', 'out']]);
  assert.equal(merged.sides.B.units[0].status, 'out');
});

test('mergeWvr: una unidad nueva se añade y una fila vacía se ignora; una eliminada no resucita', () => {
  let g = sample();
  g = G.setStatus(g, 'A', 'a1', 'eliminated');
  const wvr = G.toWvrSides(g);
  wvr.A.units.push({ id: 'nueva', name: 'Refuerzo', airCombatValue: '4', protection: '2', network: 'no', bvrOut: 'no' });
  wvr.B.units.push({ id: 'vacia', name: '', airCombatValue: '', protection: '', network: 'no', bvrOut: 'no' });
  const merged = G.mergeWvr(g, wvr, {});
  assert.equal(merged.sides.A.units.find((u) => u.id === 'a1').status, 'eliminated');
  assert.equal(merged.sides.A.units.find((u) => u.id === 'nueva').name, 'Refuerzo');
  assert.equal(merged.sides.B.units.some((u) => u.id === 'vacia'), false);
});

test('mergeIntercept: guarda bando y unidades y conserva el estado de las ya conocidas', () => {
  let g = sample();
  g = G.setStatus(g, 'A', 'a2', 'withdrawn');
  const st = G.toInterceptState(g);
  st.sides.A.eea = 'yes';
  st.units[0].electronic = '7';
  st.units.push({ id: 'x', side: 'B', name: 'Su-57', electronic: '5', detected: 'no', ew: 'yes' });
  const merged = G.mergeIntercept(g, st);
  assert.equal(merged.sides.A.eea, 'yes');
  assert.equal(merged.sides.A.units.find((u) => u.id === 'a1').electronic, '7');
  assert.equal(merged.sides.A.units.find((u) => u.id === 'a2').status, 'withdrawn');
  assert.equal(merged.sides.B.units.find((u) => u.id === 'x').ew, 'yes');
});

test('counts e isEmpty resumen del grupo', () => {
  assert.equal(G.isEmpty(G.emptyGroup()), true);
  let g = sample();
  g = G.setStatus(g, 'A', 'a1', 'eliminated');
  assert.equal(G.isEmpty(g), false);
  assert.deepEqual(G.counts(g).A, { total: 2, active: 1, withdrawn: 0, out: 0, eliminated: 1 });
  assert.equal(G.activeUnits(g, 'A').length, 1);
});
