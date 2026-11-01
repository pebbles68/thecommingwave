'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../public/js/decision-graph-engine.js');

const root = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const graph = readJson('data/routing/decision-graph.json');
const links = readJson('data/routing/decision-graph-links.json');
const appJs = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
const table = (page) => readJson(`data/tables/page-${page}.json`);

// Elige por texto de respuesta (solo en pruebas: la aplicación siempre trabaja con el índice de la ruta).
function pick(session, answer) {
  const node = Engine.currentNode(graph, session);
  const index = node.routes.findIndex((r) => r.answer === answer);
  assert.notEqual(index, -1, `respuesta «${answer}» inexistente en ${node.id}`);
  return Engine.choose(graph, session, index);
}
const walk = (answers, options) => answers.reduce(pick, Engine.createSession(graph, options));
const effectOf = (nodeId, answer) => graph.nodes[nodeId].routes.find((r) => r.answer === answer).effects.join(' ');
const noteRows = (page, topic) => table(page).referenceNotes.find((n) => n.topic === topic).rows;

test('árbol: invariantes del grafo (rutas, terminales, alcanzables, fuentes)', () => {
  assert.deepEqual(Engine.validateGraph(graph), []);
  assert.equal(graph.reviewStatus, 'needs_review');
  const ids = Object.keys(graph.nodes);
  assert.equal(ids.length, 117);
  assert.equal(ids.filter((id) => graph.nodes[id].type === 'terminal').length, 25);
});

test('árbol: la validación detecta rutas rotas, decisiones de una salida y nodos inalcanzables', () => {
  const broken = JSON.parse(JSON.stringify(graph));
  broken.nodes['land.kind'].routes[0].to = 'no.existe';
  broken.nodes['air.kind'].routes = broken.nodes['air.kind'].routes.slice(0, 1);
  broken.nodes['huerfano'] = { type: 'terminal', title: 'x', instructions: ['x'], source: ['x'] };
  const errors = Engine.validateGraph(broken);
  assert.ok(errors.some((e) => e.startsWith('ruta rota: land.kind')));
  assert.ok(errors.includes('decisión con menos de dos rutas: air.kind'));
  assert.ok(errors.includes('nodo inalcanzable: huerfano'));
});

test('árbol: cada respuesta acumula sus efectos y el terminal no pregunta más', () => {
  const s = walk(['Combate o ataque contra un objetivo terrestre']);
  const node = Engine.currentNode(graph, s);
  assert.equal(node.id, 'land.kind');
  const guided = node.routes.findIndex((r) => r.to === 'land.guided.target');
  let session = Engine.choose(graph, s, guided);
  session = pick(session, graph.nodes['land.guided.target'].routes.find((r) => r.to === 'land.guided.fixed_ecm').answer);
  session = pick(session, '2');
  assert.equal(Engine.accumulatedEffects(session).at(-1).text, 'Modificador -5 columnas.');
  assert.ok(Engine.sourceTrace(graph, session).includes('Tablas p.5'));
  assert.equal(Engine.isFinished(graph, session), false);
});

test('árbol: volver atrás y cambiar una respuesta descartan los efectos posteriores', () => {
  let s = Engine.createSession(graph, { startNode: 'land.guided.fixed_ecm' });
  s = pick(s, '3');
  s = pick(s, graph.nodes['land.guided.area'].routes[0].answer);
  assert.equal(Engine.accumulatedEffects(s).some((e) => e.text === 'Modificador -10 columnas.'), true);
  const back = Engine.goBack(Engine.goBack(s));
  assert.equal(Engine.currentNodeId(back), 'land.guided.fixed_ecm');
  assert.deepEqual(Engine.accumulatedEffects(back), []);
  const rewound = Engine.rewindTo(s, 0);
  assert.equal(Engine.currentNodeId(rewound), 'land.guided.fixed_ecm');
  assert.equal(rewound.history.length, 0);
  assert.equal(Engine.accumulatedEffects(pick(rewound, '1'))[0].text, 'Modificador -1 columna.');
});

test('árbol: entrada a mitad del árbol con respuestas previas marcadas como dadas', () => {
  const s = Engine.createSession(graph, { startNode: 'start.scope', presetAnswers: [{ nodeId: 'start.scope', routeIndex: 0 }] });
  assert.equal(Engine.currentNodeId(s), 'land.kind');
  assert.equal(s.history[0].preset, true);
  assert.throws(() => Engine.createSession(graph, { startNode: 'start.scope', presetAnswers: [{ nodeId: 'land.kind', routeIndex: 0 }] }));
  assert.throws(() => Engine.createSession(graph, { startNode: 'no.existe' }));
});

test('árbol: bucle WVR repetible y con salida', () => {
  let s = Engine.createSession(graph, { startNode: 'air.intercept.round' });
  const again = graph.nodes['air.intercept.round'].routes.findIndex((r) => r.to === 'air.intercept.round');
  const stop = graph.nodes['air.intercept.round'].routes.findIndex((r) => r.to === 'terminal.air.intercept');
  s = Engine.choose(graph, s, again);
  s = Engine.choose(graph, s, again);
  assert.equal(Engine.currentNodeId(s), 'air.intercept.round');
  assert.equal(s.history.length, 2);
  s = Engine.choose(graph, s, stop);
  assert.equal(Engine.isFinished(graph, s), true);
});

test('árbol: las cuatro combinaciones AWACS dan efectos distintos', () => {
  const routes = graph.nodes['air.intercept.awacs'].routes;
  assert.equal(routes.length, 4);
  assert.equal(new Set(routes.map((r) => r.effects.join(' '))).size, 4);
  assert.match(effectOf('air.intercept.awacs', routes[3].answer), /ambos bandos/);
});

test('árbol: un camino ilegal por dominio termina en su resultado de ilegalidad', () => {
  const illegal = (startNode, answer, terminal) => {
    const s = pick(Engine.createSession(graph, { startNode }), answer);
    assert.equal(Engine.currentNodeId(s), terminal);
  };
  const answerTo = (nodeId, to) => graph.nodes[nodeId].routes.find((r) => r.to === to).answer;
  illegal('land.close.supply', answerTo('land.close.supply', 'terminal.illegal.active_out_of_supply'), 'terminal.illegal.active_out_of_supply');
  illegal('air.area.eligible', answerTo('air.area.eligible', 'terminal.illegal.air_area'), 'terminal.illegal.air_area');
  illegal('surface.close.same_hex', answerTo('surface.close.same_hex', 'terminal.illegal.naval_close'), 'terminal.illegal.naval_close');
  illegal('asw.air.cap', answerTo('asw.air.cap', 'terminal.illegal.asw_air'), 'terminal.illegal.asw_air');
  illegal('strategic.logistics.supply', answerTo('strategic.logistics.supply', 'terminal.illegal.resupply'), 'terminal.illegal.resupply');
});

// Contraste con las tablas ya transcritas (Fase 25, paso 1): el árbol no puede contradecir un dato de data/tables/.
test('contraste: Valor Electrónico de instalaciones fijas y unidades técnicas (página 5)', () => {
  const fixed = noteRows('05', 'Instalaciones fijas').map((r) => Number(r.effect));
  const tech = noteRows('05', 'Unidades técnicas').map((r) => Number(r.effect));
  ['0', '1', '2', '3'].forEach((v, i) => {
    const f = effectOf('land.guided.fixed_ecm', v).match(/-?\d+(?= col)|Modificador 0/)[0];
    assert.equal(f === 'Modificador 0' ? 0 : Number(f), fixed[i]);
    const t = effectOf('land.guided.tech_ecm', v).match(/-?\d+(?= col)|Técnico 0/)[0];
    assert.equal(t === 'Técnico 0' ? 0 : Number(t), tech[i]);
  });
});

test('contraste: distancia contra unidades móviles (páginas 5 y 8) y contra flotas (página 24)', () => {
  const nums = (rows) => rows.slice(0, 3).map((r) => Math.abs(Number(r.effect)));
  const fromGraph = (nodeId) => graph.nodes[nodeId].routes.map((r) => Math.abs(Number((r.effects.join(' ').match(/-?\d+(?= col)/) || ['0'])[0])));
  assert.deepEqual(fromGraph('land.guided.mobile_distance'), nums(noteRows('05', table('05').referenceNotes.find((n) => /Unidades móviles/.test(n.topic)).topic)));
  assert.deepEqual(fromGraph('land.unguided.distance'), nums(noteRows('08', table('08').referenceNotes.find((n) => /Unidades móviles/.test(n.topic)).topic)));
  assert.deepEqual(fromGraph('surface.unguided.range'), nums(noteRows('24', table('24').referenceNotes.find((n) => /Flota/.test(n.topic)).topic)));
});

test('contraste: DRM por diferencia de Iniciativa (página 15) y modificador del VEF (página 21)', () => {
  const drm = table('15').tables.find((t) => t.id === 'air-combat-initiative-drm').cells.map((c) => c[0]);
  const graphDrm = graph.nodes['air.intercept.initiative'].routes.slice(1).map((r) => r.effects[0].match(/DRM (\+\d+)/)[1]);
  assert.deepEqual(graphDrm, drm);
  const vef = table('21').tables.find((t) => t.id === 'antiship-guided-vef-modifier').cells.map((c) => c[0]);
  const routes = graph.nodes['surface.guided.vef'].routes;
  assert.match(routes[0].effects[0], new RegExp(`VEF \\${vef[0]}`));
  assert.match(routes[1].effects[0], new RegExp(`VEF \\${vef[1]}`));
  assert.match(routes[3].effects[0], new RegExp(`VEF ${vef[3]}`));
  assert.match(routes[4].effects[0], new RegExp(`VEF ${vef[4]}`));
});

test('contraste: antirradiación -5 (página 13)', () => {
  assert.equal(noteRows('13', '3) Modificación del Valor del Ataque')[0].effect, '-5');
  assert.match(effectOf('land.arm.target_active', 'Sí'), /-5/);
});

test('enlaces: cada resultado no ilegal lleva al cálculo existente y a páginas de tabla reales', () => {
  const pages = new Set(fs.readdirSync(path.join(root, 'data/tables')).filter((f) => /^page-\d+\.json$/.test(f)));
  const isKnownHash = (hash) => {
    const m = hash.match(/^#\/wizard\/([a-z-]+)$/);
    return Boolean(m) && appJs.includes(`parts[1] === '${m[1]}'`);
  };
  assert.deepEqual(Engine.validateLinks(graph, links, isKnownHash, pages), []);
});

// Puntos de entrada por página (Fase 25, AD-003).
const entrypoints = readJson('data/routing/decision-entrypoints.json');

function subphaseIndex() {
  const all = new Set();
  const combat = new Set();
  const visit = (o) => {
    if (Array.isArray(o)) { o.forEach(visit); return; }
    if (!o || typeof o !== 'object') return;
    if (o.id && (o.relatedWorkflowIds || o.wizardLinks || o.title)) all.add(o.id);
    if (o.id && o.relatedWorkflowIds && o.relatedWorkflowIds.length) combat.add(o.id);
    Object.values(o).forEach(visit);
  };
  visit(readJson('data/phases/turn-template.json'));
  return { all, required: combat };
}

test('entradas: todas llevan a una pregunta del árbol y toda página de combate tiene la suya', () => {
  const workflows = new Set(readJson('data/workflows/index.json').files.map((f) => f.id));
  const pages = new Set(readJson('data/tables/index.json').pages.filter((p) => (p.workflowRefs || []).length).map((p) => p.file));
  const known = {
    subphases: subphaseIndex(),
    workflows: { all: workflows, required: workflows },
    tablePages: { all: pages, required: pages }
  };
  assert.deepEqual(Engine.validateEntrypoints(graph, entrypoints, known), []);
});

test('entradas: la página 5 abre el ataque terrestre guiado con dos respuestas ya dadas y cambiables', () => {
  const entryId = Engine.entryForContext(entrypoints, 'tablePages', 'page-05.json');
  const s = Engine.sessionFromEntry(graph, entrypoints, entryId);
  assert.equal(Engine.currentNodeId(s), 'land.guided.target');
  assert.deepEqual(s.history.map((h) => h.preset), [true, true]);
  const changed = Engine.rewindTo(s, 1);
  assert.equal(Engine.currentNodeId(changed), 'land.kind');
  assert.equal(Engine.entryForContext(entrypoints, 'workflows', 'no_existe'), null);
  assert.throws(() => Engine.sessionFromEntry(graph, entrypoints, 'no-existe'));
});

test('entradas: una subfase con combates de varios dominios entra por el inicio del árbol', () => {
  const s = Engine.sessionFromEntry(graph, entrypoints, Engine.entryForContext(entrypoints, 'subphases', 'salidas_combate'));
  assert.equal(Engine.currentNodeId(s), graph.entrypoint);
  assert.equal(Engine.currentNodeId(Engine.sessionFromEntry(graph, entrypoints, Engine.entryForContext(entrypoints, 'subphases', 'combate_terrestre'))), 'land.close.mode');
});

// Correcciones tras la primera prueba del mantenedor (2026-11-01): tablas en pantalla, rondas y fichas.
test('tablas: páginas citadas por un nodo, sin el índice ni los resúmenes de dominio', () => {
  assert.deepEqual(Engine.tablePagesFromSource(['Tablas p.16'], 3), ['page-16.json']);
  assert.deepEqual(Engine.tablePagesFromSource(['Tablas pp.6, 9 y 22', 'Reglas 5.12'], 3), ['page-06.json', 'page-09.json', 'page-22.json']);
  assert.deepEqual(Engine.tablePagesFromSource(['Tablas pp.2-14'], 3), []);
  assert.deepEqual(Engine.tablePagesFromSource(['Tablas p.1'], 3), []);
  assert.deepEqual(Engine.tablePagesFromSource(graph.nodes['air.intercept.bvr'].source, 3), ['page-16.json']);
});

test('ronda WVR: la repetición de la pregunta se cuenta', () => {
  const again = graph.nodes['air.intercept.round'].routes.findIndex((r) => r.to === 'air.intercept.round');
  let s = Engine.createSession(graph, { startNode: 'air.intercept.round' });
  assert.equal(Engine.repeatCount(s), 0);
  s = Engine.choose(graph, s, again);
  assert.equal(Engine.repeatCount(s), 1);
  s = Engine.choose(graph, s, again);
  assert.equal(Engine.repeatCount(s), 2);
});

test('fichas: cada pregunta con factor apunta a nodos y entradas de ayuda visual existentes', () => {
  const nodeRefs = readJson('data/routing/decision-graph-visual-refs.json').nodes;
  const entries = new Map(readJson('data/rules/wizard-visual-refs.json').entries.map((e) => [e.id, e]));
  const templates = new Set(readJson('data/counters/factor-map.json').counterTemplates.map((t) => t.id));
  Object.entries(nodeRefs).forEach(([nodeId, items]) => {
    assert.equal(graph.nodes[nodeId] && graph.nodes[nodeId].type, 'decision', `nodo inexistente o no es pregunta: ${nodeId}`);
    items.forEach((item) => {
      const id = typeof item === 'string' ? item : item.ref;
      if (typeof item !== 'string') assert.ok(templates.has(item.templateId), `plantilla inexistente: ${item.templateId}`);
      const entry = entries.get(id);
      assert.ok(entry, `entrada de ayuda visual inexistente: ${id}`);
      assert.ok(entry.entityRef || entry.reason, `entrada sin ficha ni motivo: ${id}`);
    });
  });
  assert.deepEqual(nodeRefs['land.close.ew'], ['ground-electronic']);
  assert.ok(nodeRefs['air.intercept.initiative'].includes('bvr-initiative'));
  // En el combate aéreo solo combaten aviones de combate: el botón abre esa ficha y no las del resto del grupo.
  assert.ok(nodeRefs['air.intercept.bvr'].every((x) => x.templateId === 'aircraft-combat-tactical'));
  assert.ok(calculators.calculators['bvr-attack'].fields.filter((f) => f.visualRef).every((f) => f.visualTemplate === 'aircraft-combat-tactical'));
});

// Cálculo de la ronda WVR dentro del asistente y su marcado en la página real (2026-11-01).
const Calc = require('../public/js/decision-graph-calculators.js');
const calculators = readJson('data/routing/decision-graph-calculators.json');
const tableHotspots = readJson('data/image-hotspots/table-pages.json');

test('cálculo WVR: columna, fila y celda de cada bando con la tabla de la página 17', () => {
  const calc = Calc.calculatorForNode(calculators, 'air.intercept.round');
  assert.equal(calc.id, 'wvr-round');
  const wvrTable = table('17').tables.find((t) => t.id === calc.table.tableId);
  const groupTypes = Calc.resolveChoices(readJson(`data/workflows/${calc.choices.workflow}`), calc.choices);
  const r = Calc.compute(calc, { table: wvrTable, choices: groupTypes }, {
    shared: { roundBonus: 1 },
    sides: { A: { groupType: 'cap', airCombatValue: 9, roll: 4 }, B: { groupType: 'intercept', airCombatValue: 9, roll: 9 }, C: { groupType: 'cap', airCombatValue: '', roll: 3 } }
  });
  // Azul: CAPs, CA 9 → columna 7~12 (índice 3), tirada 4 + 1 = 5 → fila 5: celda impresa «4».
  assert.equal(r.sides.A.columnLabel, '7~12');
  assert.equal(r.sides.A.rowValue, 5);
  assert.equal(r.sides.A.impacts, 4);
  // Rojo: Interceptación, CA 9 → columna 7~12 (índice 4), tirada 9 + 1 → fila 9 (tope): celda «7».
  assert.equal(r.sides.B.columnIndex, 4);
  assert.equal(r.sides.B.rowValue, 9);
  assert.equal(r.sides.B.impacts, 7);
  assert.equal(r.sides.C.status, 'incomplete');
  const transport = Calc.compute(calc, { table: wvrTable, choices: groupTypes }, { shared: {}, sides: { A: { groupType: 'transport', airCombatValue: 3, roll: 2 } } });
  assert.equal(transport.sides.A.status, 'no-row');
});

test('marcado: la columna de cada bando cae en su cabecera y dentro del marco calibrado', () => {
  const geometry = Calc.geometryFor(tableHotspots, 'page-17.json', 'air-combat-wvr-damage');
  assert.ok(geometry, 'falta la rejilla calibrada de la página 17');
  // Rejilla revisada por el mantenedor en #/revision (2026-11-01): verified solo con quién y cuándo.
  assert.ok(geometry.reviewStatus === 'needs_review' || (geometry.reviewStatus === 'verified' && geometry.reviewedBy && geometry.reviewedAt));
  assert.equal(geometry.columnEdges.length, 9);
  assert.equal(geometry.rowEdges.length, 11);
  const rects = Calc.markRects(geometry, { status: 'ok', columnScheme: 'caps', columnIndex: 3, rowIndex: 5 });
  assert.equal(rects.header.y, geometry.headerBands.caps[0]);
  assert.ok(rects.cell.x >= geometry.frame[0] && rects.cell.x + rects.cell.w <= geometry.frame[2] + 1e-6);
  assert.ok(rects.cell.y >= geometry.frame[1] && rects.cell.y + rects.cell.h <= geometry.frame[3] + 1e-6);
  assert.equal(Calc.markRects(geometry, { status: 'incomplete' }), null);
});

test('cálculos: cada uno apunta a preguntas, tablas, rejillas y ayudas visuales existentes', () => {
  const visual = new Set(readJson('data/rules/wizard-visual-refs.json').entries.map((e) => e.id));
  Object.entries(calculators.calculators).forEach(([id, c]) => {
    c.nodes.forEach((n) => assert.equal(graph.nodes[n].type, 'decision', `${id}: ${n}`));
    const t = readJson(`data/tables/${c.table.page}`).tables.find((x) => x.id === c.table.tableId);
    assert.ok(t, `${id}: tabla inexistente`);
    assert.ok(Calc.geometryFor(tableHotspots, c.table.page, c.table.tableId), `${id}: sin rejilla calibrada`);
    c.fields.filter((f) => f.visualRef).forEach((f) => assert.ok(visual.has(f.visualRef), `${id}: ayuda visual ${f.visualRef}`));
  });
});

// Fichas reales (images/, fuera del repositorio) con sus factores calibrados (2026-11-01).
test('fichas reales: factores de su plantilla, zonas dentro de la imagen y verified solo con revisión', () => {
  const real = readJson('data/image-hotspots/real-counters.json');
  const fmap = readJson('data/counters/factor-map.json');
  assert.ok(real.instances.length >= 4);
  real.instances.forEach((inst) => {
    const tpl = fmap.counterTemplates.find((t) => t.id === inst.templateId);
    assert.ok(tpl, `plantilla inexistente: ${inst.templateId}`);
    assert.match(inst.image, /^images\//);
    assert.match(inst.sha256, /^[0-9a-f]{64}$/);
    const factors = new Set(tpl.factors.map((f) => f.factor));
    inst.hotspots.forEach((h) => {
      assert.ok(factors.has(h.id), `${inst.templateId}: factor ${h.id} no es de la plantilla`);
      assert.ok(h.reviewStatus === 'needs_review' || (h.reviewStatus === 'verified' && h.reviewedBy && h.reviewedAt), `${inst.templateId}/${h.id}: verified sin revisión`);
      if (h.notPrinted || h.unidentified) return;
      const r = h.rect;
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= 1.0001 && r.y + r.height <= 1.0001, `${inst.templateId}/${h.id} fuera de la imagen`);
    });
  });
});

test('cálculo BVR: fila por condición, modificador electrónico y celda de la página 16', () => {
  const calc = Calc.calculatorForNode(calculators, 'air.intercept.bvr');
  assert.equal(calc.id, 'bvr-attack');
  const bvrTable = table('16').tables.find((t) => t.id === calc.table.tableId);
  const conditions = Calc.resolveChoices(readJson(`data/workflows/${calc.choices.workflow}`), calc.choices);
  assert.deepEqual(conditions.map((c) => c.value), ['intercept_awacs', 'intercept', 'cap_awacs', 'cap']);
  const r = Calc.compute(calc, { table: bvrTable, choices: conditions }, {
    sides: { A: { condition: 'cap', airCombatValue: 7, electronic: 5, roll: 4 }, B: { condition: 'intercept_awacs', airCombatValue: 9, electronic: 3, roll: 3 } }
  });
  // Azul: CAPs, CA 7 → 5.ª columna; tirada 4 + 2 (Electrónica 5 frente a 3) = 6 → celda impresa «1».
  assert.equal(r.electronic.side, 'A');
  assert.equal(r.sides.A.columnIndex, 4);
  assert.equal(r.sides.A.rowValue, 6);
  assert.equal(r.sides.A.impacts, 1);
  // Rojo: Intercepción/DdE + AWACS (etiquetado canónico), CA 9 → 13.ª columna; tirada 3 → celda «5».
  assert.equal(r.sides.B.columnScheme, 'canonical');
  assert.equal(r.sides.B.columnIndex, 12);
  assert.equal(r.sides.B.impacts, 5);
  const geometry = Calc.geometryFor(tableHotspots, 'page-16.json', 'air-combat-bvr-damage');
  assert.equal(geometry.columnEdges.length, 17);
  assert.ok(Calc.markRects(geometry, r.sides.B).header, 'la fila canónica tiene banda de cabecera');
  assert.deepEqual(geometry.headerBands.intercepcion_dde, geometry.headerBands.caps_awacs);
});

test('cálculo de combate cercano terrestre: filas Activo/Pasivo, celda y guerra electrónica de la página 2', () => {
  const calc = Calc.calculatorForNode(calculators, 'land.close.roll');
  assert.equal(calc.id, 'ground-close-combat');
  const p2 = table('02');
  const main = p2.tables.find((t) => t.id === calc.table.tableId);
  const ew = p2.tables.find((t) => t.id === 'ground-close-combat-electronic-warfare');
  const roles = Calc.resolveChoices(null, calc.choices);
  const r = Calc.compute(calc, { table: main, choices: roles, extra: { 'ground-close-combat-electronic-warfare': ew } }, {
    sides: { A: { role: 'activo', attackTotal: 7, electronic: 4, roll: 6 }, B: { role: 'pasivo', attackTotal: 9, electronic: 1, roll: 6 } }
  });
  // Azul (activo): 7 → columna «7~8», tirada 6 → celda 5; Electrónica 4 frente a 1 → diferencia 3 («3~4»), tirada 6 → ✔: 10.
  assert.equal(r.sides.A.columnLabel, '7~8');
  assert.equal(r.electronicWarfare.sideId, 'A');
  assert.equal(r.electronicWarfare.cell.rawCell, 'x2');
  assert.equal(r.sides.A.impacts, 10);
  // Rojo (pasivo): 9 → columna «9~10», tirada 6 → celda 4, sin guerra electrónica a su favor.
  assert.equal(r.sides.B.columnLabel, '9~10');
  assert.equal(r.sides.B.impacts, 4);
  assert.equal(r.extraMarks.length, 1);
  ['ground-close-combat-result', 'ground-close-combat-electronic-warfare'].forEach((id) => assert.ok(Calc.geometryFor(tableHotspots, 'page-02.json', id), `sin rejilla: ${id}`));
});
