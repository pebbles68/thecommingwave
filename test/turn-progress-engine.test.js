const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/turn-progress-engine.js');
const Model = require('../public/js/turn-model.js');

const turnTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'phases', 'turn-template.json'), 'utf8'));

// Progreso v3 (modelo anterior, dos «campañas» genéricas) tal y como lo guardaba la aplicación.
const V3 = {
  schemaVersion: 3,
  currentBand: 2,
  bandRuns: {
    1: { processRuns: { 'proceso_estrategico:1': { finishedPhases: ['logistica'], finishedSubphases: [], skippedPhases: ['crisis'] } } },
    2: {
      processRuns: {
        'proceso_estrategico:1': { finishedPhases: ['crisis'], finishedSubphases: [], skippedPhases: [] },
        'proceso_campana:1': { finishedPhases: ['acciones_aereas'], finishedSubphases: ['planificacion_misiones'], skippedPhases: [] },
        'proceso_campana:2': { finishedPhases: [], finishedSubphases: ['combate_superficie'], skippedPhases: [] }
      }
    }
  },
  pendingResolutions: [
    { id: 'ground_close_combat:2:proceso_campana:1:acciones_terrestres', type: 'ground_close_combat', band: 2, runKey: 'proceso_campana:1', phaseId: 'acciones_terrestres', subphaseId: 'combate_terrestre', status: 'in-progress', startedAt: '2026-09-30T10:00:00.000Z', label: 'Combate cercano' },
    { id: 'x:1:proceso_estrategico:1:logistica', type: 'x', band: 1, runKey: 'proceso_estrategico:1', phaseId: 'logistica', status: 'in-progress', label: 'Logística' }
  ]
};

// --- Estado vacío y normalización ---

test('normalizeProgress: valores ausentes, inválidos o corruptos caen al progreso vacío v4 sin lanzar', () => {
  assert.deepEqual(engine.normalizeProgress(null), engine.emptyProgress());
  assert.deepEqual(engine.normalizeProgress('texto'), engine.emptyProgress());
  assert.deepEqual(engine.normalizeProgress([]), engine.emptyProgress());
  assert.equal(engine.normalizeProgress({}).schemaVersion, 4);
  assert.equal(engine.normalizeProgress({ schemaVersion: 4, bands: 'roto', currentBand: 'x' }).currentBand, 1);
  const withGarbage = engine.normalizeProgress({ schemaVersion: 4, currentBand: 1, bands: { 1: { finished: ['a', 5, null, 'a'], skipped: 'no', visited: ['b'] } }, pendingResolutions: [null, { id: 1 }] });
  assert.deepEqual(engine.getBand(withGarbage), { finished: ['a'], skipped: [], visited: ['b'] });
  assert.deepEqual(engine.listPendingResolutions(withGarbage), []);
});

// --- Marcas voluntarias por nodo (TUR-008) ---

test('finishNode/skipNode/reopenNode/visitNode son independientes, puras y reversibles', () => {
  const p0 = engine.emptyProgress();
  const p1 = engine.finishNode(p0, 'phase-1');
  assert.ok(engine.isFinished(p1, 'phase-1'));
  assert.equal(engine.isFinished(p0, 'phase-1'), false, 'no muta el original');
  const p2 = engine.skipNode(p1, 'phase-1');
  assert.ok(engine.isSkipped(p2, 'phase-1') && !engine.isFinished(p2, 'phase-1'), 'omitir sustituye a terminado');
  assert.equal(engine.getNodeState(p2, 'phase-1'), 'skipped');
  const p3 = engine.reopenNode(p2, 'phase-1');
  assert.equal(engine.getNodeState(p3, 'phase-1'), 'not-started');
  const p4 = engine.visitNode(p3, 'phase-1');
  assert.equal(engine.getNodeState(p4, 'phase-1'), 'visited');
  assert.equal(engine.visitNode(p4, 'phase-1'), p4, 'visitar dos veces no cambia nada');
  assert.deepEqual(engine.getBand(engine.finishNode(p4, 'phase-1')).finished, ['phase-1']);
});

test('terminar un nodo contenedor no exige ni marca sus hijos, y no se infiere nada de lo no visitado (TUR-008)', () => {
  let p = engine.finishNode(engine.emptyProgress(), 'phase-1');
  assert.deepEqual(engine.getBand(p).finished, ['phase-1']);
  assert.equal(engine.isFinished(p, 'phase-1/air-1'), false);
  const ev = engine.evaluateNodeCompletion(turnTemplate, p, 'phase-1/air-1');
  assert.equal(ev.canFinishNormally, true, 'sin resoluciones activas se puede terminar aunque no haya subfases terminadas');
  assert.equal(ev.blockReason, null);
  assert.ok(ev.unmarkedChildren.length > 0, 'las subfases sin marcar se listan como dato, no como error');
  p = engine.finishNode(p, 'phase-0');
  for (let n = 2; n <= 6; n += 1) p = engine.finishNode(p, `phase-${n}`);
  assert.equal(engine.isBandFinished(turnTemplate, p), true, 'una banda se da por terminada con sus nodos de primer nivel, sin subfases visitadas');
});

test('Aire I y Aire II comparten contenido pero no estado (TUR-003/014)', () => {
  let p = engine.finishNode(engine.emptyProgress(), 'phase-1/air-1/planificacion_misiones');
  assert.equal(engine.isFinished(p, 'phase-1/air-1/planificacion_misiones'), true);
  assert.equal(engine.isFinished(p, 'phase-1/air-2/planificacion_misiones'), false);
  assert.equal(engine.isFinished(p, 'phase-4/air-1/planificacion_misiones'), false, 'tampoco entre fases');
  p = engine.finishNode(p, 'phase-1/air-2/planificacion_misiones');
  assert.deepEqual(engine.getBand(p).finished.sort(), ['phase-1/air-1/planificacion_misiones', 'phase-1/air-2/planificacion_misiones']);
});

test('getSuggestedNodeId: orienta con el primer nodo de primer nivel sin marcar; nunca bloquea', () => {
  let p = engine.emptyProgress();
  assert.equal(engine.getSuggestedNodeId(turnTemplate, p), 'phase-0');
  p = engine.skipNode(p, 'phase-0');
  assert.equal(engine.getSuggestedNodeId(turnTemplate, p), 'phase-1');
  // Marcar una fase posterior no impide ni cambia el resto.
  p = engine.finishNode(p, 'phase-4');
  assert.equal(engine.getSuggestedNodeId(turnTemplate, p), 'phase-1');
  for (const id of Model.listTopLevelNodeIds(turnTemplate)) p = engine.finishNode(p, id);
  assert.equal(engine.getSuggestedNodeId(turnTemplate, p), null);
});

// --- Bandas ---

test('changeBand: cada banda conserva su propio progreso y los límites se respetan', () => {
  let p = engine.finishNode(engine.emptyProgress(), 'phase-1');
  const r = engine.changeBand(p, 1, 14);
  assert.equal(r.changed, true);
  assert.equal(r.band, 2);
  assert.deepEqual(engine.getBand(r.progress).finished, [], 'la banda 2 empieza vacía');
  const back = engine.changeBand(engine.finishNode(r.progress, 'phase-2'), -1, 14);
  assert.deepEqual(engine.getBand(back.progress).finished, ['phase-1'], 'volver a la banda 1 recupera su progreso');
  assert.equal(engine.changeBand(engine.emptyProgress(), -1, 14).changed, false);
  assert.equal(engine.changeBand({ ...engine.emptyProgress(), currentBand: 14 }, 1, 14).changed, false);
});

// --- Resoluciones por instancia (TUR-015) ---

test('makeResolutionId: incluye wizard, banda y nodo exacto; Aire I y Aire II no colisionan', () => {
  const a = engine.makeResolutionId('air_combat', 1, 'phase-1/air-1');
  const b = engine.makeResolutionId('air_combat', 1, 'phase-1/air-2');
  assert.notEqual(a, b);
  assert.equal(a, engine.makeResolutionId('air_combat', 1, 'phase-1/air-1'), 'reabrir exactamente la misma resolución la recupera');
  assert.notEqual(a, engine.makeResolutionId('air_combat', 2, 'phase-1/air-1'));
  assert.notEqual(a, engine.makeResolutionId('air_combat', 1, 'phase-4/air-1'));
});

test('registrar dos resoluciones del mismo wizard en Aire I y Aire II las conserva ambas; la misma id actualiza', () => {
  let p = engine.emptyProgress();
  const base = { type: 'air_combat', band: 1, phaseId: 'acciones_aereas', subphaseId: 'salidas_combate', label: 'Combate aéreo' };
  p = engine.registerPendingResolution(p, { ...base, nodeId: 'phase-1/air-1/salidas_combate' });
  p = engine.registerPendingResolution(p, { ...base, nodeId: 'phase-1/air-2/salidas_combate' });
  assert.equal(engine.listPendingResolutions(p).length, 2);
  p = engine.registerPendingResolution(p, { ...base, nodeId: 'phase-1/air-1/salidas_combate', label: 'Combate aéreo (editado)' });
  assert.equal(engine.listPendingResolutions(p).length, 2, 'la misma identidad no se duplica');
  assert.equal(engine.listPendingResolutions(p).find((r) => r.nodeId.includes('air-1')).label, 'Combate aéreo (editado)');
});

test('findPendingResolutionsForNode: incluye el nodo y sus descendientes, de su banda y solo en curso', () => {
  let p = engine.emptyProgress();
  p = engine.registerPendingResolution(p, { type: 'w', band: 1, nodeId: 'phase-1/air-1/salidas_combate', label: 'A' });
  p = engine.registerPendingResolution(p, { type: 'w', band: 1, nodeId: 'phase-1/air-2', label: 'B' });
  p = engine.registerPendingResolution(p, { type: 'w', band: 2, nodeId: 'phase-1/air-1', label: 'otra banda' });
  p = engine.registerPendingResolution(p, { type: 'w2', band: 1, nodeId: 'phase-1/air-1', label: 'guardada', status: 'saved' });
  assert.deepEqual(engine.findPendingResolutionsForNode(p, 1, 'phase-1/air-1').map((r) => r.label), ['A']);
  assert.deepEqual(engine.findPendingResolutionsForNode(p, 1, 'phase-1').map((r) => r.label).sort(), ['A', 'B']);
  assert.deepEqual(engine.findPendingResolutionsForNode(p, 1, 'phase-1/air').map((r) => r.label), [], 'no confunde prefijos parciales');
  assert.equal(engine.evaluateNodeCompletion(turnTemplate, p, 'phase-1/air-2').canFinishNormally, false);
  assert.equal(engine.evaluateNodeCompletion(turnTemplate, p, 'phase-4').canFinishNormally, true);
  const removed = engine.removePendingResolution(p, engine.listPendingResolutions(p)[0].id);
  assert.equal(engine.listPendingResolutions(removed).length, 3);
});

// --- Migración conservadora desde esquemas anteriores (TUR-014) ---

test('migración v3 -> v4: los pasos de la Fase 0 pasan a nodos; las «campañas» genéricas se conservan aparte sin repartir', () => {
  const p = engine.normalizeProgress(V3, turnTemplate);
  assert.equal(p.schemaVersion, 4);
  assert.equal(p.currentBand, 2);
  assert.deepEqual(p.bands[1], { finished: ['phase-0/logistica'], skipped: ['phase-0/crisis'], visited: [] });
  assert.deepEqual(p.bands[2].finished, ['phase-0/crisis']);
  // Ninguna fase nueva aparece marcada: no se reparte una campaña antigua entre seis fases.
  [1, 2, 3, 4, 5, 6].forEach((n) => assert.equal(engine.isFinished(p, `phase-${n}`), false));
  assert.equal(engine.isFinished(p, 'phase-1/air-1/planificacion_misiones'), false);
  // El dato antiguo se conserva intacto.
  assert.deepEqual(p.legacy.processRuns[2]['proceso_campana:1'], V3.bandRuns[2].processRuns['proceso_campana:1']);
  assert.deepEqual(p.legacy.processRuns[2]['proceso_campana:2'], V3.bandRuns[2].processRuns['proceso_campana:2']);
  assert.equal(p.legacy.processRuns[1], undefined, 'una banda sin progreso de campaña no genera legado');
  // Aviso de una sola vez.
  assert.equal(engine.listNotices(p).length, 1);
  assert.equal(engine.listNotices(engine.dismissNotice(p, 'legacy-campaign-progress')).length, 0);
});

test('migración v3 -> v4: las resoluciones activas no se descartan; las de la Fase 0 se enlazan y las de campaña quedan como heredadas', () => {
  const p = engine.normalizeProgress(V3, turnTemplate);
  assert.equal(engine.listPendingResolutions(p).length, 2);
  const strategic = engine.listPendingResolutions(p).find((r) => r.type === 'x');
  assert.equal(strategic.nodeId, 'phase-0/logistica');
  const legacy = engine.listLegacyPendingResolutions(p);
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].type, 'ground_close_combat');
  assert.equal(legacy[0].legacyRunKey, 'proceso_campana:1');
  assert.equal(legacy[0].nodeId, null);
  assert.equal(legacy[0].phaseId, 'acciones_terrestres');
});

test('migración v3 -> v4 sin progreso de campaña: no hay aviso ni legado', () => {
  const p = engine.normalizeProgress({ schemaVersion: 3, currentBand: 1, bandRuns: { 1: { processRuns: { 'proceso_estrategico:1': { finishedPhases: ['logistica'], finishedSubphases: [], skippedPhases: [] } } } }, pendingResolutions: [] }, turnTemplate);
  assert.equal(p.legacy, null);
  assert.deepEqual(p.notices, []);
  assert.deepEqual(engine.getBand(p, 1).finished, ['phase-0/logistica']);
});

test('migración desde v2 (processRuns global) y v1 (listas planas): conservadora y sin inventar', () => {
  const v2 = engine.normalizeProgress({ schemaVersion: 2, currentBand: 3, processRuns: { 'proceso_estrategico:1': { finishedPhases: ['crisis'], finishedSubphases: [], skippedPhases: [] }, 'proceso_campana:1': { finishedPhases: ['acciones_aereas'], finishedSubphases: [], skippedPhases: [] } } }, turnTemplate);
  assert.equal(v2.currentBand, 3);
  assert.deepEqual(engine.getBand(v2, 3).finished, ['phase-0/crisis']);
  assert.ok(v2.legacy.processRuns[3]['proceso_campana:1']);

  const v1 = engine.normalizeProgress({ currentBand: 2, finishedPhases: ['logistica', 'acciones_aereas'], finishedSubphases: ['planificacion_misiones'], skippedPhases: ['espacio'] }, turnTemplate);
  assert.deepEqual(engine.getBand(v1, 2).finished, ['phase-0/logistica']);
  assert.deepEqual(engine.getBand(v1, 2).skipped, ['phase-0/espacio']);
  assert.deepEqual(v1.legacy.processRuns[2]['proceso_campana:1'].finishedPhases, ['acciones_aereas']);
  // Sin plantilla no se puede saber qué fase es de la Fase 0: no se adivina.
  const noTemplate = engine.normalizeProgress({ currentBand: 2, finishedPhases: ['logistica'] });
  assert.deepEqual(engine.getBand(noTemplate, 2).finished, []);
});

test('migración con datos parciales o corruptos no lanza y devuelve v4 válido', () => {
  const inputs = [
    { schemaVersion: 3 },
    { schemaVersion: 3, bandRuns: 'roto', pendingResolutions: 'roto' },
    { schemaVersion: 3, bandRuns: { 1: null, 2: { processRuns: { 'proceso_campana:1': 7 } } } },
    { schemaVersion: 2, processRuns: [1, 2] },
    { schemaVersion: 99, bands: { 1: { finished: 'x' } } },
    { finishedPhases: 'no', currentBand: -4 }
  ];
  inputs.forEach((raw) => {
    const p = engine.normalizeProgress(raw, turnTemplate);
    assert.equal(p.schemaVersion, 4);
    assert.ok(p.currentBand >= 1);
    assert.ok(p.bands[p.currentBand]);
    assert.ok(Array.isArray(p.pendingResolutions) && Array.isArray(p.notices));
  });
});

test('normalizar un progreso v4 es idempotente', () => {
  const once = engine.normalizeProgress(V3, turnTemplate);
  assert.deepEqual(engine.normalizeProgress(JSON.parse(JSON.stringify(once)), turnTemplate), once);
});
