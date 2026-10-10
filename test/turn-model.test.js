const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Model = require('../public/js/turn-model.js');

const root = path.join(__dirname, '..');
const t = JSON.parse(fs.readFileSync(path.join(root, 'data', 'phases', 'turn-template.json'), 'utf8'));

const DB = 'TCW_Decision_Book_v1.0_-_COMPLETO_[v.ESP_-_1.2].pdf';

// --- Estructura validada por el mantenedor (ajustes_de_turno.md §2 y §3) ---

test('una banda contiene exactamente dos días y seis impulsos; cada día, mañana, tarde y noche', () => {
  assert.equal(t.schemaVersion, 4);
  assert.equal(t.band.durationDays, 2);
  assert.equal(Model.listDays(t).length, 2);
  const all = Model.listImpulses(t);
  assert.deepEqual(all.map((i) => i.number), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(new Set(all.map((i) => i.id)).size, 6);
  Model.listDays(t).forEach((day) => {
    assert.equal(day.impulses.length, 3);
    assert.deepEqual(day.impulses.map((id) => t.impulses[id].period), ['morning', 'afternoon', 'night'], day.id);
    day.impulses.forEach((id) => assert.equal(t.impulses[id].dayId, day.id));
  });
  assert.deepEqual(Model.listDays(t).map((d) => d.parity), ['odd', 'even']);
});

test('horarios impresos y orden de segmentos coinciden con la matriz validada', () => {
  const hours = Object.fromEntries(Model.listImpulses(t).map((i) => [i.number, i.hours]));
  assert.deepEqual(hours, { 1: '4-12/16', 2: '12-20', 3: '20/16-4 día siguiente', 4: '4-12/16', 5: '12-20', 6: '20/16-4 día siguiente' });
  Model.listImpulses(t).forEach((i) => {
    // Refuerzos es una fase adicional al principio de cada fase de campaña, antes de Aire I (indicación del mantenedor).
    const expected = [1, 3, 4, 6].includes(i.number)
      ? ['reinforcements', 'air-1', 'surface', 'air-2', 'ground', 'submarine']
      : ['reinforcements', 'air-1', 'surface', 'air-2', 'submarine'];
    assert.deepEqual(i.segments.map((s) => s.id), expected, `fase ${i.number}`);
  });
});

test('la segunda y la quinta fase no tienen Tierra; las letras terrestres son exactas por fase', () => {
  [2, 5].forEach((n) => {
    const i = Model.getImpulseByNumber(t, n);
    assert.equal(i.segments.some((s) => s.id === 'ground'), false, `fase ${n} no debe tener segmento de Tierra`);
    assert.equal(Model.groundReactionLevels(t, i.id), null);
  });
  const levels = Object.fromEntries([1, 3, 4, 6].map((n) => [n, Model.groundReactionLevels(t, Model.getImpulseByNumber(t, n).id)]));
  assert.deepEqual(levels, { 1: ['A', 'B', 'C'], 3: ['A', 'B'], 4: ['A', 'B', 'C', 'D'], 6: ['A'] });
  const ground4 = Model.getImpulseByNumber(t, 4).segments.find((s) => s.id === 'ground');
  assert.deepEqual(ground4.sheetSteps, ['Combate cercano']);
});

test('las letras de Tierra son un Nivel de Reacción y su lectura está marcada pendiente de revisión', () => {
  Model.listImpulses(t).filter((i) => i.groundReactionLevels).forEach((i) => assert.equal(i.groundReactionStatus, 'needs_review', i.id));
  assert.match(t.sheet.groundActivationMarkersNote, /Nivel de Reacción/);
  assert.match(t.sheet.groundActivationMarkersNote, /needs_review/);
});

test('la Fase 0 existe una vez por banda y no forma parte de ningún día', () => {
  assert.equal(t.band.strategic.id, 'phase-0');
  assert.ok(t.band.strategic.phases.length > 0);
  Model.listDays(t).forEach((d) => assert.equal(d.impulses.includes('phase-0'), false));
  assert.equal(Model.listNodes(t).filter((n) => n.kind === 'strategic').length, 1);
  // Los resaltados de las bandas 4, 8 y 12 son informativos y no deciden la existencia de la Fase 0.
  assert.ok(t.sheet.dayBands.bands.some((b) => b.strategicPhaseHighlight));
});

test('Recuperación de Mando y Refuerzos son nodos consultables con fuente o con la búsqueda documentada', () => {
  const cr = t.band.consultables['command-recovery'];
  const rf = t.band.consultables.reinforcements;
  assert.ok(cr && rf);
  assert.ok(cr.sourceRefs.some((r) => r.document === DB && r.page), 'Recuperación de Mando cita el Decision Book con página');
  assert.ok(Array.isArray(cr.procedure) && cr.procedure.length > 0);
  assert.ok(rf.pending && /pendiente/i.test(rf.pending), 'Refuerzos declara su contenido pendiente');
  assert.ok(rf.sourceSearch && rf.sourceSearch.document === DB, 'Refuerzos documenta la búsqueda realizada en la fuente');
  Model.listDays(t).forEach((d) => assert.ok(t.band.consultables[d.commandRecovery], `${d.id} referencia un nodo consultable inexistente`));
});

// --- Integridad del modelo canónico ---

test('todo segmento resuelve a una fase de contenido y todas las subfases existen', () => {
  Model.listImpulses(t).forEach((i) => {
    Model.listSegments(t, i.id).forEach((seg) => {
      assert.ok(seg.phase || seg.consultable, `${i.id}/${seg.id} sin fase de contenido ni nodo consultable`);
      Model.listSubphases(t, seg.phase || {}).forEach((sub) => assert.ok(sub.sourceRefs && sub.sourceRefs.length, `${sub.id} sin sourceRefs`));
    });
    assert.ok(i.sourceRefs && i.sourceRefs.length, `${i.id} sin sourceRefs propios`);
  });
  Model.listDays(t).forEach((d) => assert.ok(d.sourceRefs && d.sourceRefs.length, `${d.id} sin sourceRefs propios`));
  assert.ok(t.band.strategic.sourceRefs.length);
});

test('ninguna instancia reutiliza una identidad de progreso: los IDs de nodo son únicos y estables', () => {
  const ids = Model.listNodes(t).map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('phase-1/air-1/planificacion_misiones'));
  assert.ok(ids.includes('phase-1/air-2/planificacion_misiones'));
  assert.ok(ids.includes('phase-4/ground/combate_terrestre'));
  assert.equal(ids.includes('phase-2/ground'), false);
  assert.ok(ids.includes('phase-0/crisis'));
  assert.ok(ids.includes('day-odd') && ids.includes('day-even'));
  // Cada nodo con padre apunta a un nodo existente.
  Model.listNodes(t).filter((n) => n.parent).forEach((n) => assert.ok(ids.includes(n.parent), `${n.id}: padre inexistente`));
});

test('la fase de Mantenimiento conserva la denominación de la hoja y documenta su relación con la reparación naval', () => {
  const p = t.phases.reparacion;
  assert.equal(p.title, 'Mantenimiento');
  assert.ok(p.alternativeTitles.includes('Fase de Reparación'));
  assert.equal(p.nameStatus, 'needs_review');
  assert.match(p.nameNote, /9\.9\.4/);
});

// --- Una sola fuente canónica: la ayuda de secuencia se genera, no se mantiene a mano (TUR-001) ---

test('buildSequenceHelp genera la consulta rápida desde el modelo canónico y nunca diverge', () => {
  const help = Model.buildSequenceHelp(t);
  assert.equal(help.phases.length, 6);
  assert.deepEqual(help.phases.map((p) => p.id), Model.listImpulses(t).map((i) => i.id));
  help.phases.forEach((p) => {
    const impulse = t.impulses[p.id];
    assert.deepEqual(p.segments.map((s) => s.title), impulse.segments.map((s) => s.title));
    assert.equal(p.hours, impulse.hours);
    p.segments.forEach((s) => assert.notEqual(Array.isArray(s.steps), s.stepsNotPrinted === true));
    const ground = p.segments.find((s) => s.id === 'ground');
    if (impulse.groundReactionLevels) assert.deepEqual(ground.groundActivationMarkers, impulse.groundReactionLevels);
  });
  assert.deepEqual(help.commandRecoveryCycles.map((c) => c.phaseIds), [['phase-1', 'phase-2', 'phase-3'], ['phase-4', 'phase-5', 'phase-6']]);
  assert.deepEqual(help.strategicPhase.steps, t.band.strategic.sheetSteps);
  // La segunda verdad ya no existe.
  assert.equal(fs.existsSync(path.join(root, 'data', 'phases', 'turn-sequence-help.json')), false);
});

test('Refuerzos abre cada una de las seis fases y Recuperación de Mando va antes de cada día (indicación del mantenedor)', () => {
  Model.listImpulses(t).forEach((i) => {
    assert.equal(i.segments[0].id, 'reinforcements', `fase ${i.number}`);
    assert.equal(i.segments[1].id, 'air-1', `fase ${i.number}: Refuerzos va antes de Aire I`);
  });
  const ids = Model.listNodes(t).map((n) => n.id);
  assert.ok(ids.includes('phase-3/reinforcements'));
  Model.listDays(t).forEach((d) => {
    assert.equal(d.commandRecoveryPosition, 'before-day');
    assert.ok(ids.includes(Model.commandRecoveryNodeId(d.id)));
  });
  assert.match(t.band.consultables.reinforcements.position, /antes de las subfases de Aire I/);
  assert.match(t.band.consultables['command-recovery'].position, /Antes del inicio de cada día/);
});

// --- Workflows por segmento y origen de las resoluciones (TUR-013) ---

const coreSource = fs.readFileSync(path.join(root, 'public', 'js', 'core.js'), 'utf8');
const wizardHashKeys = [...coreSource.match(/const WORKFLOW_WIZARD_HASHES = \{([\s\S]*?)\n  \};/)[1].matchAll(/^\s+([a-z_]+):\s*'#\/wizard\//gm)].map((m) => m[1]);
const workflowIds = new Set(JSON.parse(fs.readFileSync(path.join(root, 'data', 'workflows', 'index.json'), 'utf8')).files.map((f) => f.id));

test('cada segmento con combates declara los workflows aplicables: ninguno invoca la ayuda con una lista vacía', () => {
  const ids = (n, seg) => Model.phaseWorkflows(t, Model.getSegment(t, Model.getImpulseByNumber(t, n).id, seg).phase).workflowIds;
  assert.ok(ids(1, 'air-1').includes('air_combat'));
  assert.ok(ids(1, 'air-2').includes('air_combat'), 'Aire II comparte los combates de Aire I');
  ['antiship_guided', 'antiship_unguided', 'ground_guided', 'anti_radiation', 'asw_surface_air'].forEach((w) => assert.ok(ids(1, 'air-1').includes(w), `salidas de combate: ${w}`));
  assert.deepEqual(ids(1, 'surface'), ['antiship_guided', 'antiship_unguided']);
  assert.deepEqual(ids(1, 'ground'), ['ground_close_combat', 'ground_guided', 'ground_unguided', 'anti_radiation']);
  assert.deepEqual(ids(1, 'submarine'), ['asw_search_support', 'asw_submarine', 'asw_surface_air', 'torpedo_vs_surface']);
  Model.listImpulses(t).forEach((i) => Model.listSegments(t, i.id).filter((s) => s.phase).forEach((seg) => {
    assert.ok(Model.phaseWorkflows(t, seg.phase).workflowIds.length > 0, `${i.id}/${seg.id} sin workflows`);
  }));
});

test('atajos de wizard: reacciones y resultado de ataque en Ataques terrestres, reabastecimiento en Reorganización, garantía logística en Logística, emboscada en Superficie', () => {
  const ground = Model.phaseWorkflows(t, t.phases.acciones_terrestres);
  assert.deepEqual(ground.wizardLinks.map((l) => l.wizard), ['ground_reaction', 'ground_attack_result', 'army_resupply']);
  assert.deepEqual(Model.phaseWorkflows(t, t.phases.logistica).wizardLinks.map((l) => l.wizard), ['logistics_guarantee', 'port_logistics']);
  assert.deepEqual(Model.phaseWorkflows(t, t.phases.acciones_superficie).wizardLinks.map((l) => l.wizard), ['submarine_ambush']);
});

test('todo workflow y atajo de wizard del turno existe: índice de workflows y hashes de wizard', () => {
  const all = [...Object.values(t.subphases), ...Object.values(t.phases)];
  all.forEach((x) => {
    (x.relatedWorkflowIds || []).forEach((w) => assert.ok(workflowIds.has(w), `${x.id}: workflow ${w} inexistente`));
    (x.wizardLinks || []).forEach((l) => {
      assert.ok(wizardHashKeys.includes(l.wizard), `${x.id}: wizard ${l.wizard} sin ruta`);
      assert.ok(l.title && l.description, `${x.id}/${l.wizard}`);
    });
  });
  assert.ok(wizardHashKeys.includes('ground_reaction') && wizardHashKeys.includes('army_resupply'));
});

test('describeOrigin: banda, día real, fase, segmento y subfase del contexto de turno', () => {
  const ctx = { band: 2, impulseId: 'phase-4', segmentId: 'air-2', phaseId: 'acciones_aereas', subphaseId: 'salidas_combate' };
  assert.equal(Model.describeOrigin(t, ctx), 'Banda 2 · Día 4 (par) · 4.ª fase, mañana · Aire II · Salidas de combate');
  assert.equal(Model.describeOrigin(t, { band: 1, impulseId: 'phase-1', segmentId: 'ground', phaseId: 'acciones_terrestres', subphaseId: null }), 'Banda 1 · Día 1 (impar) · 1.ª fase, mañana · Tierra');
  assert.equal(Model.describeOrigin(t, { band: 3, impulseId: null, segmentId: null, phaseId: 'logistica', subphaseId: null }), 'Banda 3 · Fase 0 — Estrategia · Fase Logística');
  assert.equal(Model.describeOrigin(t, null), '');
});

// --- Fuentes propias en cada nivel (TUR-007) ---

const registeredDocs = new Set(JSON.parse(fs.readFileSync(path.join(root, 'data', 'sources', 'sources.json'), 'utf8')).sources.map((s) => s.filename));
const STATUS = new Set(['verified', 'needs_review']);

function checkRefs(label, refs) {
  assert.ok(Array.isArray(refs) && refs.length > 0, `${label}: sin sourceRefs propios`);
  refs.forEach((r) => {
    assert.ok(registeredDocs.has(r.document), `${label}: documento «${r.document}» no registrado en sources.json`);
    assert.ok(STATUS.has(r.status), `${label}: estado de la fuente ausente o inválido`);
    if (r.status === 'needs_review') assert.ok(r.note || label.startsWith('consultable'), `${label}: una fuente pendiente de revisión debe explicar por qué`);
  });
}

test('banda, días, fases, segmentos, subfases y nodos consultables tienen fuentes propias con documento registrado y estado', () => {
  checkRefs('banda', t.band.sourceRefs);
  t.band.days.forEach((d) => checkRefs(`día ${d.id}`, d.sourceRefs));
  checkRefs('Fase 0', t.band.strategic.sourceRefs);
  Model.listImpulses(t).forEach((i) => {
    checkRefs(`fase ${i.id}`, i.sourceRefs);
    i.segments.forEach((seg) => checkRefs(`segmento ${i.id}/${seg.id}`, seg.sourceRefs));
  });
  Object.values(t.subphases).forEach((s) => checkRefs(`subfase ${s.id}`, s.sourceRefs));
  Object.values(t.phases).forEach((p) => checkRefs(`fase de contenido ${p.id}`, p.sourceRefs));
  Object.values(t.band.consultables).forEach((c) => checkRefs(`consultable ${c.id}`, c.sourceRefs));
});

test('cada subfase cita su sección y página del Decision Book (o declara por qué no la hay) en vez de la fase padre', () => {
  Object.values(t.subphases).forEach((s) => {
    const own = s.sourceRefs.filter((r) => r.document === DB && r.section && r.page);
    assert.ok(own.length > 0, `${s.id}: sin sección y página propias del Decision Book`);

  });
});

test('los segmentos de Tierra y las equivalencias por nombre quedan pendientes de revisión con su nota', () => {
  Model.listImpulses(t).filter((i) => i.groundReactionLevels).forEach((i) => {
    const ground = i.segments.find((s) => s.id === 'ground');
    assert.ok(ground.sourceRefs.some((r) => r.document === DB && r.status === 'needs_review' && /8\.3\.1/.test(r.section) && /known-ambiguities/.test(r.note)), i.id);
  });
  ['combate_terrestre', 'logistica_transporte_submarino'].forEach((id) => {
    assert.ok(t.subphases[id].sourceRefs.some((r) => r.status === 'needs_review'), id);
  });
});

test('Recupera. largas y cortas: recuperación de misiones aéreas, con los ejemplos del mantenedor y sus fuentes verificadas', () => {
  const largas = t.subphases.recuperacion_largas;
  const cortas = t.subphases.recuperacion_cortas;
  assert.match(largas.help, /CAP[\s\S]*al principio de la siguiente fase/);
  assert.match(cortas.help, /BARCAP[\s\S]*al final de la misma fase aérea/);
  [largas, cortas].forEach((s) => {
    assert.ok(s.sourceRefs.every((r) => r.status === 'verified'), s.id);
    assert.ok(s.sourceRefs.some((r) => /Indicación del mantenedor/.test(r.document)), s.id);
  });
});

test('no existe «Restablecimiento de capacidades» como subfase de cada fase aérea (indicación del mantenedor, 2026-10-08)', () => {
  assert.equal(t.subphases.restablecimiento, undefined);
  assert.equal(t.phases.acciones_aereas.subphases.includes('restablecimiento'), false);
  assert.equal(t.phases.acciones_aereas.subphases.length, 6);
  assert.equal(t.phases.acciones_aereas.actions.length, 6);
  assert.equal(JSON.stringify(t.phases.acciones_aereas).toLowerCase().includes('restablecimiento'), false);
  // La recuperación de capacidades de mando es la Recuperación de Mando, al principio de cada día.
  Model.listDays(t).forEach((d) => assert.equal(d.commandRecoveryPosition, 'before-day'));
  Model.listNodes(t).filter((n) => n.kind === 'subphase' && n.id.includes('/air-')).forEach((n) => assert.equal(n.id.endsWith('/restablecimiento'), false));
});

test('«Parálisis» es una subfase de regla opcional solo al final de Aire I y recuerda retirar la Parálisis de Red (14.4.1)', () => {
  const air1 = Model.getSegment(t, 'phase-1', 'air-1');
  const air2 = Model.getSegment(t, 'phase-1', 'air-2');
  assert.deepEqual(Model.listSubphases(t, air1.phase).map((s) => s.id).slice(-2), ['recuperacion_cortas', 'paralisis_red']);
  assert.equal(Model.listSubphases(t, air2.phase).some((s) => s.id === 'paralisis_red'), false);
  const sub = t.subphases.paralisis_red;
  assert.equal(sub.optionalRule, true);
  assert.ok(sub.sourceRefs.some((r) => /14\.4\.1/.test(r.section) && r.page === '245'));
  assert.deepEqual(sub.wizardLinks.map((l) => l.wizard), ['cyber_attack']);
  assert.equal(t.phases.acciones_aereas.subphases.includes('paralisis_red'), false, 'la fase compartida no cambia');
  assert.ok(Model.listNodes(t).some((n) => n.id === 'phase-1/air-1/paralisis_red'));
  assert.equal(Model.listNodes(t).some((n) => n.id === 'phase-1/air-2/paralisis_red'), false);
});
