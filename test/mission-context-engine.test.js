// AJ-002: contexto de misión derivado de data/missions/air-missions.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../public/js/mission-context-engine.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'missions', 'air-missions.json'), 'utf8'));

test('listMissions excluye procedimientos y estados adicionales', () => {
  const ids = E.listMissions(data).map((m) => m.id);
  assert.ok(ids.includes('caps') && ids.includes('ink') && ids.includes('air-strike'));
  assert.ok(!ids.includes('cap-maintenance') && !ids.includes('sustained-flight'));
});

test('con surfaceOrGround se excluyen las misiones aire-aire que los datos marcan como incapaces de atacar objetivos terrestres', () => {
  const all = E.listMissions(data).map((m) => m.id);
  const filtered = E.listMissions(data, { surfaceOrGround: true }).map((m) => m.id);
  assert.ok(all.includes('caps') && all.includes('ink'));
  assert.ok(!filtered.includes('caps') && !filtered.includes('ink'));
  assert.ok(filtered.includes('on-call') && filtered.includes('air-strike'));
  assert.equal(E.isMissionAllowed(data, 'caps', { surfaceOrGround: true }), false);
  assert.equal(E.isMissionAllowed(data, 'on-call', { surfaceOrGround: true }), true);
  assert.equal(data.definitions.categories['air-air'].canAttackSurfaceAndGround, false);
});

test('restricción por fase: fuera de la Fase de acciones aéreas solo ON CALL, y se preselecciona', () => {
  assert.deepEqual(E.listMissions(data, { surfaceOrGround: true, phaseId: 'acciones_terrestres' }).map((m) => m.id), ['on-call']);
  assert.deepEqual(E.listMissions(data, { surfaceOrGround: true, phaseId: 'acciones_superficie' }).map((m) => m.id), ['on-call']);
  assert.equal(E.presetMissionForPhase(data, 'acciones_terrestres', { surfaceOrGround: true }), 'on-call');
  assert.deepEqual(E.listMissions(data, { surfaceOrGround: true, phaseId: 'acciones_submarinas' }).map((m) => m.id), ['mpa']);
  // Sin restricción: Fase aérea o sin fase.
  ['acciones_aereas', null].forEach((p) => {
    assert.equal(E.restrictionForPhase(data, p), null);
    assert.equal(E.presetMissionForPhase(data, p, { surfaceOrGround: true }), '');
    assert.ok(E.listMissions(data, { surfaceOrGround: true, phaseId: p }).length > 1);
  });
});

test('areaMissionAnswer deriva Área/Punto del tipo de misión del JSON y no inventa nada si falta', () => {
  assert.equal(E.areaMissionAnswer(data, 'caps'), 'yes');
  assert.equal(E.areaMissionAnswer(data, 'on-call'), 'yes');
  assert.equal(E.areaMissionAnswer(data, 'ink'), 'no');
  assert.equal(E.areaMissionAnswer(data, 'air-strike'), 'no');
  assert.equal(E.areaMissionAnswer(data, E.NONE), '');
  assert.equal(E.areaMissionAnswer(data, ''), '');
  assert.equal(E.areaMissionAnswer(data, 'no-existe'), '');
});

test('todas las misiones elegibles con tipo declarado dan una respuesta Área/Punto coherente con su JSON', () => {
  E.listMissions(data).forEach((m) => {
    const expected = m.missionType === 'area' ? 'yes' : (m.missionType === 'point' ? 'no' : '');
    assert.equal(E.areaMissionAnswer(data, m.id), expected, m.id);
  });
});

test('buildCard: Zona Central, alcance y fuente salen del JSON', () => {
  const caps = E.buildCard(data, 'caps');
  assert.match(caps.centralZone, /^Sí/);
  assert.deepEqual(caps.ranges, ['Bloqueo Aéreo: x2 el Alcance (ALC)', 'Alerta Aérea: x1 el Alcance (ALC)']);
  assert.deepEqual(caps.sourceRefs, ['Decision Book §7.7.2, p. 128']);
  const ink = E.buildCard(data, 'ink');
  assert.match(ink.centralZone, /^No/);
  assert.deepEqual(ink.ranges, ['x2 el Alcance (ALC)']);
  assert.equal(ink.category, 'Aire-aire');
  assert.equal(ink.commandCost, 1);
  assert.equal(E.buildCard(data, 'no-existe'), null);
});

test('buildContext y claves invalidadas al cambiar de misión', () => {
  assert.deepEqual(E.buildContext(data, 'caps', 'turn'), { missionId: 'caps', areaMission: 'yes', source: 'turn' });
  assert.deepEqual(E.buildContext(data, E.NONE), { missionId: 'none', areaMission: '', source: 'manual' });
  assert.deepEqual(E.invalidatedAnswerKeys(), ['short_range_restriction_area_mission']);
});
