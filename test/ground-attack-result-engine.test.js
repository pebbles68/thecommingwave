// Pruebas del motor de Resolución del Resultado del Ataque Terrestre
// (public/js/ground-attack-result-engine.js; Decision Book §5.15.1-§5.15.3) y de
// data/rules/ground-attack-results.json. Los valores salen de las reglas citadas y de su
// único ejemplo (Protección 7 + Terreno 3 = 10).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/ground-attack-result-engine.js');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules', 'ground-attack-results.json'), 'utf8'));

const terrainOf = (kind) => rules.groundUnit.attackKinds.find((k) => k.id === kind).terrainApplies;
const unitHit = (o) => engine.resolveGroundUnitHit({ terrain: 0, kind: 'normal', terrainApplies: terrainOf(o.kind || 'normal'), ...o });

// --- Datos ---

test('ground-attack-results.json: 3 tipos de objetivo, textos de regla con fuente §5.15 y tipos de ataque con/sin terreno', () => {
  assert.deepEqual(rules.targets.map((t) => t.id), ['ground_unit', 'port', 'airfield']);
  assert.deepEqual(rules.groundUnit.attackKinds.map((k) => [k.id, k.terrainApplies]), [['normal', true], ['no_terrain', false], ['air_pursuit', false]]);
  ['terrainRule', 'normalRule', 'airPursuitRule'].forEach((k) => assert.ok(rules.groundUnit[k], k));
  ['assignRule', 'portRule', 'repairRule', 'shipsRule'].forEach((k) => assert.ok(rules.port[k], k));
  ['assignRule', 'runwayRule', 'apronRule', 'absorbRule', 'logisticsRule'].forEach((k) => assert.ok(rules.airfield[k], k));
  [rules.groundUnit, rules.port, rules.airfield].forEach((s) => assert.ok(s.sourceRefs.some((r) => /5\.15/.test(r.section))));
  assert.ok(rules.notModeled);
});

// --- Unidad terrestre (§5.15.1) ---

test('ejemplo del reglamento: Protección 7 + Terreno 3 = 10; con 9 impactos no hay daño y con 10 sí (1 punto de fuerza)', () => {
  const r10 = unitHit({ impacts: 10, protection: 7, terrain: 3 });
  assert.deepEqual([r10.effectiveProtection, r10.damage, r10.forceLoss], [10, 1, 1]);
  assert.equal(unitHit({ impacts: 9, protection: 7, terrain: 3 }).damage, 0);
});

test('ataque normal: como máximo 1 punto de daño por ataque aunque sobren impactos (se señala)', () => {
  const r = unitHit({ impacts: 30, protection: 7, terrain: 3 });
  assert.deepEqual([r.damage, r.forceLoss, r.capped], [1, 1, true]);
  assert.equal(unitHit({ impacts: 10, protection: 7, terrain: 3 }).capped, false);
});

test('Interdicción Aérea / ARM: sin protección del terreno (el terreno introducido se ignora)', () => {
  const r = unitHit({ kind: 'no_terrain', impacts: 7, protection: 7, terrain: 3 });
  assert.deepEqual([r.terrain, r.effectiveProtection, r.damage], [0, 7, 1]);
});

test('Persecución Aérea: floor(impactos / Protección) puntos de daño, sin límite y sin terreno', () => {
  const r = unitHit({ kind: 'air_pursuit', impacts: 17, protection: 5, terrain: 4 });
  assert.deepEqual([r.damage, r.forceLoss, r.terrain, r.capped], [3, 3, 0, false]);
  assert.equal(unitHit({ kind: 'air_pursuit', impacts: 4, protection: 5 }).damage, 0);
});

test('unidad terrestre: entradas inválidas fallan con error claro', () => {
  assert.throws(() => unitHit({ impacts: '', protection: 7 }), /entero/);
  assert.throws(() => unitHit({ impacts: 5, protection: 0 }), /≥ 1/);
  assert.throws(() => unitHit({ impacts: 5, protection: 7, terrain: -1 }), /≥ 0/);
});

// --- Puerto (§5.15.2) ---

test('puerto: floor(impactos al puerto / Protección) = Instalaciones Paralizadas; munición y combustible bajan lo mismo', () => {
  const r = engine.resolvePortAttack({ totalImpacts: 7, portImpacts: 7, portProtection: 3, ships: [] });
  assert.deepEqual([r.paralyzed, r.ammoFuelLoss, r.unassigned], [2, 2, 0]);
  assert.equal(engine.resolvePortAttack({ totalImpacts: 2, portImpacts: 2, portProtection: 3, ships: [] }).paralyzed, 0);
});

test('puerto y buques a la vez: superficie = 1 punto de daño por impacto; submarino = destruido; los impactos sin asignar se informan', () => {
  const r = engine.resolvePortAttack({ totalImpacts: 10, portImpacts: 3, portProtection: 3, ships: [{ type: 'surface', impacts: 2 }, { type: 'submarine', impacts: 1 }] });
  assert.equal(r.paralyzed, 1);
  assert.deepEqual(r.ships[0], { type: 'surface', impacts: 2, damagePoints: 2, destroyed: false });
  assert.deepEqual(r.ships[1], { type: 'submarine', impacts: 1, damagePoints: 0, destroyed: true });
  assert.deepEqual([r.assigned, r.unassigned], [6, 4]);
});

test('puerto: no se pueden asignar más impactos de los obtenidos; un buque sin impactos no es destruido', () => {
  assert.throws(() => engine.resolvePortAttack({ totalImpacts: 3, portImpacts: 2, portProtection: 2, ships: [{ type: 'surface', impacts: 2 }] }), /solo hay 3/);
  assert.equal(engine.resolvePortAttack({ totalImpacts: 3, portImpacts: 0, portProtection: 2, ships: [{ type: 'submarine', impacts: 0 }] }).ships[0].destroyed, false);
  assert.throws(() => engine.resolvePortAttack({ totalImpacts: 3, portImpacts: 0, portProtection: 2, ships: [{ type: 'carrier', impacts: 1 }] }), /superficie o submarino/);
});

// --- Aeródromo (§5.15.3) ---

test('pista: cada 2 impactos baja 1 nivel; no baja de E y el exceso se ignora', () => {
  assert.deepEqual(engine.resolveRunway({ impacts: 5, levelsAboveE: 3 }), { impacts: 5, levelsLost: 2, levelsAfter: 1, ignored: 1 });
  assert.deepEqual(engine.resolveRunway({ impacts: 10, levelsAboveE: 2 }), { impacts: 10, levelsLost: 2, levelsAfter: 0, ignored: 6 });
});

test('apron: el defensor asigna a quien quiera; sin impactos suficientes no pasa nada y los impactos pasan al siguiente avión (confirmado por el mantenedor, 2026-10-07)', () => {
  // Protecciones 4, 1, 3 con 5 impactos: el primero absorbe 4 (daño), el segundo 1 (daño), el tercero no se alcanza.
  const r = engine.resolveApron({ impacts: 5, airfieldProtection: 4, hangarCapacity: 3, units: [
    { name: 'A', usesAirfieldProtection: true }, { name: 'B', usesAirfieldProtection: false }, { name: 'C', usesAirfieldProtection: true }] });
  assert.deepEqual(r.units.map((u) => [u.damaged, u.absorbed]), [[true, 4], [true, 1], [false, 0]]);
  assert.equal(r.ignored, 0);
  // Un avión con más Protección que los impactos restantes no gasta impactos: pasan al siguiente.
  const skip = engine.resolveApron({ impacts: 3, airfieldProtection: 4, hangarCapacity: 3, units: [
    { name: 'Fuerte', usesAirfieldProtection: true }, { name: 'Débil', usesAirfieldProtection: false }] });
  assert.deepEqual(skip.units.map((u) => [u.damaged, u.absorbed]), [[false, 0], [true, 1]]);
  assert.equal(skip.ignored, 2);
});

test('apron, propiedad general: los impactos se reparten sin pérdida y nunca queda sin dañar un avión que los impactos restantes podrían dañar', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 300; i++) {
    const n = 1 + rnd(6);
    const airfieldProtection = 1 + rnd(5);
    const units = Array.from({ length: n }, (_, k) => ({ name: 'U' + k, usesAirfieldProtection: rnd(2) === 1 }));
    const hangarCapacity = n;
    const impacts = rnd(25);
    const r = engine.resolveApron({ impacts, airfieldProtection, hangarCapacity, units });
    const absorbed = r.units.reduce((s, u) => s + u.absorbed, 0);
    assert.equal(absorbed + r.ignored, impacts, 'no se pierden impactos');
    r.units.forEach((u) => {
      if (!u.damaged) assert.ok(u.protection > r.ignored, 'un avión sin dañar tiene más Protección que los impactos ignorados');
      else assert.equal(u.absorbed, u.protection);
    });
  }
});

test('pista por letra (A la mejor … E la peor): baja de letra por cada 2 impactos, no baja de E', () => {
  const letters = ['A', 'B', 'C', 'D', 'E'];
  assert.deepEqual(engine.resolveRunwayByLetter({ impacts: 5, letter: 'B', letters }), { impacts: 5, levelsLost: 2, levelsAfter: 1, ignored: 1, letterBefore: 'B', letterAfter: 'D' });
  assert.equal(engine.resolveRunwayByLetter({ impacts: 20, letter: 'A', letters }).letterAfter, 'E');
  assert.equal(engine.resolveRunwayByLetter({ impacts: 20, letter: 'A', letters }).ignored, 12);
  assert.equal(engine.resolveRunwayByLetter({ impacts: 4, letter: 'E', letters }).letterAfter, 'E');
  assert.equal(engine.resolveRunwayByLetter({ impacts: 1, letter: 'C', letters }).letterAfter, 'C');
  assert.throws(() => engine.resolveRunwayByLetter({ impacts: 2, letter: 'Z', letters }), /Calidad de pista desconocida/);
});

test('instalaciones logísticas (opcional): cada 2 impactos baja 1 de Preparación, mínimo 0', () => {
  assert.deepEqual(engine.resolveLogistics({ impacts: 7, readiness: 2 }), { impacts: 7, readinessLost: 2, readinessAfter: 0, ignored: 3 });
});

test('apron con unidades <= capacidad de hangares: pueden usar la Protección del aeródromo; si no la usan, Protección 1', () => {
  const units = [{ name: 'F-16', usesAirfieldProtection: true }, { name: 'MiG-29', usesAirfieldProtection: false }];
  assert.deepEqual(engine.apronProtections(units, { airfieldProtection: 3, hangarCapacity: 4 }), [3, 1]);
});

test('apron con unidades > capacidad: solo hasta la capacidad pueden usar la Protección del aeródromo; más es un error', () => {
  const units = [{ usesAirfieldProtection: true }, { usesAirfieldProtection: true }, { usesAirfieldProtection: false }];
  assert.deepEqual(engine.apronProtections(units, { airfieldProtection: 4, hangarCapacity: 2 }), [4, 4, 1]);
  const over = units.map(() => ({ usesAirfieldProtection: true }));
  assert.throws(() => engine.apronProtections(over, { airfieldProtection: 4, hangarCapacity: 2 }), /como máximo 2/);
});

test('apron: cada unidad absorbe hasta igualar su Protección y sufre 1 punto de daño; se da la vuelta o es eliminada si no puede sobrevivir', () => {
  const r = engine.resolveApron({
    impacts: 9, airfieldProtection: 4, hangarCapacity: 5,
    units: [{ name: 'A', usesAirfieldProtection: true }, { name: 'B', usesAirfieldProtection: true, cannotSurviveDamage: true }, { name: 'C', usesAirfieldProtection: false }]
  });
  assert.deepEqual(r.units.map((u) => [u.name, u.absorbed, u.flipped, u.eliminated]), [['A', 4, true, false], ['B', 4, false, true], ['C', 1, true, false]]);
  assert.equal(r.ignored, 0);
});

test('apron: una unidad que no alcanza su Protección con los impactos restantes no sufre daño y el resto se ignora', () => {
  const r = engine.resolveApron({
    impacts: 6, airfieldProtection: 4, hangarCapacity: 5,
    units: [{ name: 'A', usesAirfieldProtection: true }, { name: 'B', usesAirfieldProtection: true }]
  });
  assert.deepEqual(r.units.map((u) => [u.name, u.damaged]), [['A', true], ['B', false]]);
  assert.equal(r.ignored, 2);
});
