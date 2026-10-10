// Pruebas del motor de Efectos de Impacto antibuque (public/js/ship-impact-
// effects-engine.js; Decision Book §5.9-§5.9.3) y de los datos de reglas
// (data/rules/ship-impact-effects.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/ship-impact-effects-engine.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules', 'ship-impact-effects.json'), 'utf8'));

const base = { hullType: 'single', hasDamagedSide: true, alreadyDamaged: false, hasShield: false };
const resolve = (o) => engine.resolveShipImpactEffect({ ...base, ...o });

// --- Datos ---

test('ship-impact-effects.json: ids de reglas únicos, cada regla con fuente, y los tipos de casco apuntan a reglas existentes', () => {
  const ids = data.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  data.rules.forEach((r) => { assert.ok(r.text); assert.ok(r.sourceRefs.length >= 1, r.id); });
  data.hullTypes.forEach((h) => assert.ok(ids.includes(h.ruleId), h.id));
  assert.deepEqual(data.hullTypes.map((h) => h.id), engine.HULL_TYPES);
});

test('todo ruleId que el motor puede devolver existe en los datos', () => {
  const ids = new Set(data.rules.map((r) => r.id));
  const scenarios = [
    { hullType: 'multi', fleetSize: 1, isCarrier: true, isTransport: true },
    { hullType: 'multi', fleetSize: 4, isTransport: true },
    { hasDamagedSide: false, isCarrier: true },
    { alreadyDamaged: true, isTransport: true },
    { isAmphibiousAssault: true, isTransport: true },
    { hullType: 'double', isCarrier: true },
    { hasShield: true, isCarrier: true },
    { sinkingResistance: 5, criticalRoll: 5, isCarrier: true },
    { sinkingResistance: 5, criticalRoll: 6 },
    { sinkingResistance: 5 }
  ];
  scenarios.forEach((s) => resolve(s).ruleIds.forEach((id) => assert.ok(ids.has(id), `${id} (${JSON.stringify(s)})`)));
});

// --- Buque único ---

test('buque único sin escudo: se da la vuelta y exige verificación por daño crítico (sin tirada, outcome null)', () => {
  const r = resolve({ sinkingResistance: 5 });
  assert.equal(r.needsCriticalRoll, true);
  assert.equal(r.outcome, null);
  assert.deepEqual(r.ruleIds, ['single_flips_and_critical_check', 'critical_check']);
});

test('verificación por daño crítico: tirada <= Resistencia al Hundimiento hunde; mayor, queda dañado', () => {
  assert.equal(resolve({ sinkingResistance: 5, criticalRoll: 5 }).outcome, 'sunk');
  assert.equal(resolve({ sinkingResistance: 5, criticalRoll: 0 }).outcome, 'sunk');
  assert.equal(resolve({ sinkingResistance: 5, criticalRoll: 6 }).outcome, 'damaged');
  assert.equal(resolve({ sinkingResistance: 5, criticalRoll: 6 }).criticalResult, 'damaged');
});

test('buque único con escudo: solo se da la vuelta, sin verificación por daño crítico', () => {
  const r = resolve({ hasShield: true });
  assert.equal(r.outcome, 'damaged');
  assert.equal(r.needsCriticalRoll, false);
  assert.ok(r.ruleIds.includes('shield_no_critical_check'));
});

test('Buque de Asalto Anfibio: hundido inmediatamente con 1 punto de daño, sin tirada', () => {
  const r = resolve({ isAmphibiousAssault: true });
  assert.equal(r.outcome, 'sunk');
  assert.equal(r.needsCriticalRoll, false);
});

test('buque único ya dañado, o sin lado dañado, es eliminado directamente sin verificación', () => {
  const damaged = resolve({ alreadyDamaged: true, sinkingResistance: 5 });
  assert.equal(damaged.outcome, 'eliminated');
  assert.equal(damaged.needsCriticalRoll, false);
  assert.equal(resolve({ hasDamagedSide: false }).outcome, 'eliminated');
});

// --- Doble buque y multi-buque ---

test('doble buque (x2): se da la vuelta inmediatamente, sin verificación crítica; si ya estaba dañado, eliminado', () => {
  assert.equal(resolve({ hullType: 'double' }).outcome, 'damaged');
  assert.equal(resolve({ hullType: 'double' }).needsCriticalRoll, false);
  assert.equal(resolve({ hullType: 'double', alreadyDamaged: true }).outcome, 'eliminated');
});

test('multi-buque (x3-x5): reduce el tamaño de flota en 1; con 1 barco restante es eliminado', () => {
  const r = resolve({ hullType: 'multi', fleetSize: 4 });
  assert.equal(r.outcome, 'fleet_reduced');
  assert.equal(r.newFleetSize, 3);
  assert.equal(resolve({ hullType: 'multi', fleetSize: 1 }).outcome, 'eliminated');
});

// --- Portaeronaves y transportes ---

test('portaeronaves dañado: no opera aeronaves; hundido o eliminado: pierde las de su ficha; ambos: las desplegadas buscan otra base', () => {
  const damaged = resolve({ hasShield: true, isCarrier: true });
  assert.deepEqual(damaged.ruleIds.filter((id) => id.startsWith('carrier')), ['carrier_damaged', 'carrier_deployed_units']);
  const sunk = resolve({ sinkingResistance: 5, criticalRoll: 3, isCarrier: true });
  assert.deepEqual(sunk.ruleIds.filter((id) => id.startsWith('carrier')), ['carrier_sunk', 'carrier_deployed_units']);
  const eliminated = resolve({ alreadyDamaged: true, isCarrier: true });
  assert.ok(eliminated.ruleIds.includes('carrier_sunk'));
});

test('un portaeronaves pendiente de tirada crítica todavía no añade consecuencias', () => {
  const r = resolve({ sinkingResistance: 5, isCarrier: true });
  assert.equal(r.outcome, null);
  assert.ok(!r.ruleIds.some((id) => id.startsWith('carrier')));
});

test('transporte: cualquier daño resuelto añade la pérdida de capacidad de carga', () => {
  assert.ok(resolve({ hullType: 'double', isTransport: true }).ruleIds.includes('transport_capacity_loss'));
  assert.ok(resolve({ hullType: 'multi', fleetSize: 3, isTransport: true }).ruleIds.includes('transport_capacity_loss'));
  assert.ok(!resolve({ hullType: 'double' }).ruleIds.includes('transport_capacity_loss'));
});

// --- Validación ---

test('entradas inválidas lanzan error en vez de resolver', () => {
  assert.throws(() => resolve({ hullType: 'triple' }), /desconocido/);
  assert.throws(() => resolve({ hullType: 'multi', fleetSize: 0 }), /al menos 1/);
  assert.throws(() => resolve({ sinkingResistance: '', criticalRoll: 4 }), /Resistencia/);
});

// --- Buque de una flota en la asignación de impactos (resolveFleetShipHit; §5.9) ---

test('resolveFleetShipHit: un buque ya dañado que sufre otro punto de daño es eliminado directamente, sin tirada', () => {
  const r = engine.resolveFleetShipHit({ alreadyDamaged: true, sinkingThreshold: 4 });
  assert.deepEqual([r.outcome, r.removed, r.eliminatedDirectly, r.needsSinkingRoll], ['eliminated', true, true, false]);
  assert.deepEqual(r.ruleIds, ['already_damaged_eliminated']);
});

test('resolveFleetShipHit: primer daño -> verificación crítica: tirada <= Valor de Hundimiento hunde (golden test 4 <= 4), si no sobrevive dañado', () => {
  const sunk = engine.resolveFleetShipHit({ alreadyDamaged: false, sinkingThreshold: 4, sinkingRoll: 4 });
  assert.deepEqual([sunk.outcome, sunk.removed, sunk.eliminatedDirectly], ['sunk', true, false]);
  const alive = engine.resolveFleetShipHit({ alreadyDamaged: false, sinkingThreshold: 4, sinkingRoll: 5 });
  assert.deepEqual([alive.outcome, alive.removed], ['damaged', false]);
});

test('resolveFleetShipHit: sin tirada pide la tirada; sin Valor de Hundimiento no decide el hundimiento (queda dañado)', () => {
  assert.equal(engine.resolveFleetShipHit({ alreadyDamaged: false, sinkingThreshold: 4, sinkingRoll: '' }).needsSinkingRoll, true);
  const noThreshold = engine.resolveFleetShipHit({ alreadyDamaged: false, sinkingThreshold: '', sinkingRoll: 2 });
  assert.deepEqual([noThreshold.outcome, noThreshold.removed], ['damaged', false]);
});
