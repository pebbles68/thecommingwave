// Pruebas del motor de Garantía Logística (public/js/logistics-guarantee-engine.js;
// Decision Book §11.2-§11.5) y de data/rules/logistics-guarantee.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/logistics-guarantee-engine.js');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules', 'logistics-guarantee.json'), 'utf8'));

const clear = { unitType: 'ground_main', nodeKind: 'advanced', nodeEnemyControlled: 'no', blockedEdge: 'no', enemyUnitsOnPath: 'no', enemyControlledOnPath: 'no' };
const ev = (o) => engine.evaluateGuarantee({ ...clear, ...o });

// --- Datos ---

test('logistics-guarantee.json: 4 tipos de unidad con consecuencias y fuentes, preguntas con fuente, motivos con texto', () => {
  assert.deepEqual(rules.unitTypes.map((u) => u.id), engine.UNIT_TYPES);
  rules.unitTypes.forEach((u) => { assert.ok(u.withoutGuarantee && u.label, u.id); assert.ok(u.sourceRefs.length >= 1, u.id); });
  assert.ok(rules.unitTypes.find((u) => u.id === 'airfield').carrierException);
  rules.questions.forEach((q) => assert.ok(q.sourceRefs.length >= 1, q.id));
  assert.deepEqual(rules.questions.find((q) => q.id === 'node_kind').options.map((o) => o.value), engine.NODE_KINDS);
  ['no_node', 'node_eliminated', 'blocked_edge', 'enemy_units_on_path', 'enemy_controlled_on_path', 'carrier_exception'].forEach((k) => assert.ok(rules.reasons[k], k));
  assert.ok(rules.afterRules.length >= 3 && rules.notModeled);
});

// --- Garantía ---

test('línea despejada desde un Nodo Avanzado u Ordinario: hay garantía', () => {
  assert.deepEqual(ev({}), { guaranteed: true, reasons: [], pending: [], exempt: false });
  assert.equal(ev({ nodeKind: 'ordinary' }).guaranteed, true);
});

test('sin Nodo de Suministro: sin garantía', () => {
  assert.deepEqual([ev({ nodeKind: 'none' }).guaranteed, ev({ nodeKind: 'none' }).reasons], [false, ['no_node']]);
});

test('nodo en hexágono controlado por el enemigo: el nodo se elimina', () => {
  assert.deepEqual(ev({ nodeEnemyControlled: 'yes' }).reasons, ['node_eliminated']);
});

test('borde con Restricción de Movimiento "No" o "-": bloquea; los motivos se acumulan', () => {
  assert.deepEqual(ev({ blockedEdge: 'yes' }).reasons, ['blocked_edge']);
  assert.deepEqual(ev({ blockedEdge: 'yes', enemyControlledOnPath: 'yes' }).reasons, ['blocked_edge', 'enemy_controlled_on_path']);
});

test('unidades enemigas en el camino: bloquean salvo con Contención Táctica; hexágonos controlados por el enemigo bloquean siempre', () => {
  assert.deepEqual(ev({ enemyUnitsOnPath: 'yes', tacticalContainment: 'no' }).reasons, ['enemy_units_on_path']);
  assert.equal(ev({ enemyUnitsOnPath: 'yes', tacticalContainment: 'yes' }).guaranteed, true);
  const both = ev({ enemyUnitsOnPath: 'yes', tacticalContainment: 'yes', enemyControlledOnPath: 'yes' });
  assert.deepEqual([both.guaranteed, both.reasons], [false, ['enemy_controlled_on_path']]);
});

test('faltan respuestas: guaranteed null y lista de pendientes; un motivo bloqueante decide aunque falten otras', () => {
  const p = engine.evaluateGuarantee({ unitType: 'port', nodeKind: 'advanced' });
  assert.deepEqual([p.guaranteed, p.pending], [null, ['node_enemy_controlled', 'blocked_edge', 'enemy_units_on_path', 'enemy_controlled_on_path']]);
  assert.deepEqual(engine.evaluateGuarantee({ unitType: 'port', nodeKind: 'advanced', blockedEdge: 'yes' }).guaranteed, false);
  assert.deepEqual(ev({ enemyUnitsOnPath: 'yes', tacticalContainment: '' }).pending, ['tactical_containment']);
  assert.equal(engine.evaluateGuarantee({ unitType: 'port' }).pending[0], 'node_kind');
});

test('aeródromo de portaaviones / buque de asalto anfibio: no necesita garantía para reacondicionar (§11.1)', () => {
  const r = engine.evaluateGuarantee({ unitType: 'airfield', carrier: 'yes', nodeKind: 'none' });
  assert.deepEqual([r.guaranteed, r.exempt, r.reasons], [true, true, ['carrier_exception']]);
  assert.equal(engine.evaluateGuarantee({ unitType: 'airfield', carrier: 'no', nodeKind: 'none' }).guaranteed, false);
});

test('tipo de unidad desconocido: error', () => {
  assert.throws(() => engine.evaluateGuarantee({ unitType: 'tank' }), /desconocido/);
});
