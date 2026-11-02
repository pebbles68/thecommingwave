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
  // Con las ramas añadidas: un enlace puede ser un wizard registrado o una pregunta del árbol (#/decision/<nodo>).
  const full = Engine.mergeExtensions(graph, readJson('data/routing/decision-graph-extensions.json'));
  const isKnownHash = (hash) => {
    const d = hash.match(/^#\/decision\/(.+)$/);
    if (d) return Boolean(full.nodes[d[1]]);
    const m = hash.match(/^#\/wizard\/([a-z-]+)$/);
    return Boolean(m) && appJs.includes(`parts[1] === '${m[1]}'`);
  };
  assert.deepEqual(Engine.validateLinks(full, links, isKnownHash, pages), []);
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
  // La Iniciativa aérea es el superíndice del Combate aéreo (indicación del mantenedor, 2026-11-02).
  assert.deepEqual(nodeRefs['air.intercept.initiative'], [{ ref: 'bvr-initiative', templateId: 'aircraft-combat-tactical' }]);
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

// Una página que repite la tabla de otra (`reusesTable`) la toma de donde está transcrita, como hace la vista.
function tableOf(pageFile, tableId) {
  const p = readJson(`data/tables/${pageFile}`);
  const t = (p.tables || []).find((x) => x.id === tableId);
  if (t || !p.reusesTable || p.reusesTable.id !== tableId) return t;
  return tableOf(p.reusesTable.definedIn.split('/').pop(), tableId);
}

const fullGraph = Engine.mergeExtensions(graph, readJson('data/routing/decision-graph-extensions.json'));

test('cálculos: cada uno apunta a preguntas, tablas, rejillas y ayudas visuales existentes', () => {
  const visual = new Set(readJson('data/rules/wizard-visual-refs.json').entries.map((e) => e.id));
  Object.entries(calculators.calculators).forEach(([id, c]) => {
    c.nodes.forEach((n) => assert.ok(fullGraph.nodes[n], `${id}: ${n}`));
    // Un procedimiento sin tabla (puerto, aeródromo, efectos del impacto) solo necesita sus reglas.
    if (!c.table) { if (c.rules) assert.ok(fs.existsSync(path.join(root, 'data/rules', c.rules)), `${id}: reglas ${c.rules}`); return; }
    assert.ok(tableOf(c.table.page, c.table.tableId), `${id}: tabla inexistente`);
    assert.ok(Calc.geometryFor(tableHotspots, c.table.page, c.table.tableId), `${id}: sin rejilla calibrada`);
    (c.extraTables || []).forEach((x) => assert.ok(tableOf(x.page, x.tableId), `${id}: tabla extra ${x.tableId}`));
    c.fields.filter((f) => f.visualRef).forEach((f) => assert.ok(visual.has(f.visualRef), `${id}: ayuda visual ${f.visualRef}`));
    // Un campo que es una pregunta del workflow tiene opciones (y su modificador sale de ellas).
    const wf = c.workflow ? readJson(`data/workflows/${c.workflow}`) : null;
    c.fields.filter((f) => f.questionId).forEach((f) => assert.ok((Calc.fieldOptions(f, wf) || []).length, `${id}: pregunta ${f.questionId}`));
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

test('cálculos ASW: fila de cabecera por profundidad y Firma, columna por Valor de Ataque (páginas 29 y 30)', () => {
  const a = Calc.calculatorForNode(calculators, 'asw.attack.roll');
  const t29 = table('29').tables.find((t) => t.id === a.table.tableId);
  // P. 4, Firma 5 → banda 2 («4~6»); ataque 4 → columna «3~4»; tirada 6 → celda impresa «1».
  const r = Calc.compute(a, { table: t29 }, { sides: { A: { position: 'P4', signature: 5, moving: 'no', attack: 4, roll: 6 } } });
  assert.equal(r.sides.A.columnScheme, 'band_2');
  assert.equal(r.sides.A.columnLabel, '3~4');
  assert.equal(r.sides.A.impacts, 1);
  const s = Calc.calculatorForNode(calculators, 'asw.attack.sub_result');
  const t30 = table('30').tables.find((t) => t.id === s.table.tableId);
  // P. 3, Firma 1 + 1 en movimiento = 2 → banda 2; torpedo 7 → columna «7»; tirada 8 → celda «3».
  const r2 = Calc.compute(s, { table: t30 }, { sides: { A: { position: 'P3', signature: 1, moving: 'yes', torpedoType: 'circle', attack: 7, roll: 8 } } });
  assert.equal(r2.sides.A.columnLabel, '7');
  assert.equal(r2.sides.A.impacts, 3);
  const noFire = Calc.compute(s, { table: t30 }, { sides: { A: { position: 'P3', signature: 1, moving: 'no', torpedoType: 'circle', attack: 7, roll: 2 } } });
  assert.equal(noFire.sides.A.rawCell, 'NO_DISPARAR');
  ['page-29.json', 'page-30.json'].forEach((p, i) => assert.ok(Calc.geometryFor(tableHotspots, p, [a, s][i].table.tableId)));
});

test('búsquedas ASW: diferencia de firma (página 33) y aérea (página 34), con su celda de rango', () => {
  const sig = Calc.calculatorForNode(calculators, 'asw.signature.roll');
  const t33 = table('33').tables.find((t) => t.id === sig.table.tableId);
  // Superficie, marco 1, P. 4: columna «sup1-p4»; Firma 6 → 6.ª fila; rango Rutina/misma casilla «8+»; tirada 8 → detectado.
  const r = Calc.compute(sig, { table: t33 }, { sides: { A: { searcherKind: 'surface', frame: '1', depth: 'P4', trigger: 'routine_movement', distance: 'hex', targetSignature: 6, moving: 'no', roll: 8 } } });
  assert.equal(r.sides.A.columnIndex, t33.columnAxis.values.indexOf('sup1-p4'));
  assert.equal(r.sides.A.rowIndex, 5);
  assert.equal(r.sides.A.success, true);
  assert.equal(r.sides.A.extraCells.length, 1);
  // El campo de Firma del submarino que busca no se pide a una unidad de superficie.
  assert.equal(Calc.fieldApplies(sig.fields.find((f) => f.id === 'searcherSignature'), { searcherKind: 'surface' }), false);
  const air = Calc.calculatorForNode(calculators, 'asw.air.roll');
  const p34 = table('34').tables;
  const extra = { 'asw-air-search-post-attack': p34.find((t) => t.id === 'asw-air-search-post-attack') };
  // Rutina, P. 3, Firma 4 → 3.ª fila; Valor aéreo 11 → columna «11»; celda «9»; tirada 9 → detectado.
  const a = Calc.compute(air, { table: p34.find((t) => t.id === 'asw-air-search-routine'), extra }, { sides: { A: { trigger: 'routine', depth: 'P3', signature: 4, moving: 'no', airValue: 11, roll: 9 } } });
  assert.equal(a.tableId, 'asw-air-search-routine');
  assert.equal(a.sides.A.columnLabel, '11');
  assert.equal(a.sides.A.success, true);
  const b = Calc.compute(air, { table: p34[0], extra }, { sides: { A: { trigger: 'post_attack', depth: 'P3', signature: 4, moving: 'no', airValue: 11, roll: 3 } } });
  assert.equal(b.tableId, 'asw-air-search-post-attack');
  ['asw-signature-difference-search', 'asw-air-search-routine', 'asw-air-search-post-attack'].forEach((id) => assert.ok(tableHotspots.tables.some((g) => g.tableId === id), `sin rejilla: ${id}`));
});

test('torpedos contra superficie (página 27) y reabastecimiento de campo (página 32)', () => {
  const t = Calc.calculatorForNode(calculators, 'surface.torpedo.result');
  const t27 = table('27').tables.find((x) => x.id === t.table.tableId);
  const base = { aswContext: 'none', torpedoType: 'circle', attack: 6, slowTargets: 'no', roll: 5 };
  // Sin búsqueda en la casilla: fila «Cualq.»; 6 → columna «6»; tirada 5 → «2*»: el círculo pide una segunda tirada.
  const pending = Calc.compute(t, { table: t27 }, { sides: { A: base } });
  assert.equal(pending.sides.A.rawCell, '2*');
  assert.equal(pending.sides.A.impacts, null);
  const done = Calc.compute(t, { table: t27 }, { sides: { A: { ...base, followUpRoll: 1 } } });
  assert.equal(done.sides.A.impacts, 1);
  // Todos los buques lentos: la tirada no se pide y se fija en 9.
  const slow = Calc.compute(t, { table: t27 }, { sides: { A: { ...base, slowTargets: 'yes', roll: '' } } });
  assert.equal(slow.sides.A.rowValue, 9);
  const r = Calc.calculatorForNode(calculators, 'strategic.logistics.roll');
  const t32 = table('32').tables.find((x) => x.id === r.table.tableId);
  const rules = readJson(`data/rules/${r.rules}`);
  const ok = Calc.compute(r, { table: t32, rules }, { sides: { A: { level: 'B', currentForce: 3, printedForceLimit: 5, roll: 6 } } });
  assert.equal(ok.sides.A.success, true);
  assert.match(ok.sides.A.explanation.join(' '), /de 3 a 4/);
  ['torpedo-vs-surface-damage', 'army-logistics-resupply'].forEach((id) => assert.ok(tableHotspots.tables.some((g) => g.tableId === id), `sin rejilla: ${id}`));
});

test('sin tirada se marca ya la columna; con la tirada, además la fila y la celda (indicación del mantenedor)', () => {
  const s = Calc.calculatorForNode(calculators, 'asw.attack.sub_result');
  const t30 = table('30').tables.find((t) => t.id === s.table.tableId);
  const r = Calc.computeWithColumn(s, { table: t30 }, { sides: { A: { position: 'P3', signature: 1, moving: 'yes', torpedoType: 'circle', attack: 7, roll: '' } } });
  assert.equal(r.sides.A.status, 'column');
  assert.equal(r.sides.A.columnLabel, '7');
  assert.equal(r.sides.A.rowIndex, undefined);
  const geometry = Calc.geometryFor(tableHotspots, 'page-30.json', s.table.tableId);
  const rects = Calc.markRects(geometry, r.sides.A);
  assert.ok(rects.column && rects.header);
  assert.equal(rects.cell, null);
  // Con un dato que no sea la tirada sin rellenar, todavía no hay columna.
  const none = Calc.computeWithColumn(s, { table: t30 }, { sides: { A: { position: 'P3', signature: '', moving: 'yes', torpedoType: 'circle', attack: 7, roll: '' } } });
  assert.equal(none.sides.A.status, 'incomplete');
  // WVR con los dos bandos sin tirar: columna de cada uno.
  const w = Calc.calculatorForNode(calculators, 'air.intercept.round');
  const wt = table('17').tables.find((t) => t.id === w.table.tableId);
  const choices = Calc.resolveChoices(readJson(`data/workflows/${w.choices.workflow}`), w.choices);
  const wr = Calc.computeWithColumn(w, { table: wt, choices }, { shared: {}, sides: { A: { groupType: 'cap', airCombatValue: 9, roll: '' }, B: { groupType: 'intercept', airCombatValue: 9, roll: '' } } });
  assert.deepEqual([wr.sides.A.status, wr.sides.B.status], ['column', 'column']);
});

test('ataque terrestre guiado (página 5): método, desplazamiento por intensidad, Móvil/Fijo y 9 natural', () => {
  const g = Calc.calculatorForNode(calculators, 'land.guided.roll9');
  const t5 = table('05').tables.find((t) => t.id === g.table.tableId);
  const wf = readJson(`data/workflows/${g.choices.workflow}`);
  const methods = Calc.resolveChoices(wf, g.choices);
  assert.equal(methods.length, 4);
  const ln = methods.find((m) => m.columnScheme === 'normal_ataque').value;
  // [L] Normal, Valor 8, -2 columnas → columna «6»; Móvil, tirada 5 → fila «5»: celda impresa 5.
  const r = Calc.compute(g, { table: t5, choices: methods, workflow: wf }, { sides: { A: { method: ln, target: 'mobile', attack: 8, intensity: -2, roll: 5 } } });
  assert.equal(r.sides.A.columnLabel, '6');
  assert.equal(r.sides.A.impacts, 5);
  // Un 9 natural cancela la modificación: columna «8».
  const nine = Calc.compute(g, { table: t5, choices: methods, workflow: wf }, { sides: { A: { method: ln, target: 'mobile', attack: 8, intensity: -2, roll: 9 } } });
  assert.equal(nine.sides.A.columnLabel, '8');
  assert.equal(Calc.columnShiftFromEffects([{ text: 'Modificador -5 columnas.' }, { text: 'Modificador Básico -2 columnas.' }, { text: 'Añadir +2.' }]), -7);
  assert.ok(Calc.geometryFor(tableHotspots, 'page-05.json', g.table.tableId));
});

test('ataque terrestre no guiado (página 9) y antirradiación (página 13)', () => {
  const u = Calc.calculatorForNode(calculators, 'land.unguided.roll9');
  const t9 = table('09').tables.find((t) => t.id === u.table.tableId);
  const wf = readJson(`data/workflows/${u.choices.workflow}`);
  const methods = Calc.resolveChoices(wf, u.choices);
  const canon = methods.find((m) => m.columnScheme === null);
  // Persecución (plan no ligero): fila canónica; Valor 12 → «11~15»; -2 → «6~8»; Móvil, tirada 6 → celda impresa 4.
  const r = Calc.compute(u, { table: t9, choices: methods, workflow: wf }, { sides: { A: { method: canon.value, target: 'mobile', attack: 12, intensity: -2, roll: 6 } } });
  assert.equal(r.sides.A.columnScheme, 'canonical');
  assert.equal(r.sides.A.columnLabel, '6~8');
  const a = Calc.calculatorForNode(calculators, 'land.arm.roll9');
  const t13 = table('13').tables.find((t) => t.id === a.table.tableId);
  // [L] Ligero, Valor 10, -5 → columna «5»; tirada 4 → celda impresa 4.
  const arm = Calc.compute(a, { table: t13 }, { sides: { A: { light: 'yes', attack: 10, intensity: -5, roll: 4 } } });
  assert.equal(arm.sides.A.columnScheme, 'L_ligero');
  assert.equal(arm.sides.A.columnLabel, '5');
  assert.equal(arm.sides.A.impacts, 4);
  ['page-09.json', 'page-13.json'].forEach((p, i) => assert.ok(Calc.geometryFor(tableHotspots, p, [u, a][i].table.tableId)));
});

test('antibuque guiado (tabla final, página 22) y no guiado (página 25)', () => {
  const g = Calc.calculatorForNode(calculators, 'surface.guided.counter');
  const t22 = table('22').tables.find((t) => t.id === g.table.tableId);
  // Supersónico, Valor 4 × 3 = 12 → columna «11~12»; tirada 5, lectura SUB/SUP → fila «5»: celda impresa 4.
  const r = Calc.compute(g, { table: t22 }, { sides: { A: { method: 'supersonic', attack: 4, multiplier: '3', roll: 5 } } });
  assert.equal(r.sides.A.columnLabel, '11~12');
  assert.equal(r.sides.A.impacts, 4);
  // Subsónico: 2d10, la mayor (2 y 7 → 7).
  const sub = Calc.compute(g, { table: t22 }, { sides: { A: { method: 'subsonic', attack: 4, multiplier: '3', roll: 2, roll2: 7 } } });
  assert.equal(sub.sides.A.rowValue, 7);
  const u = Calc.calculatorForNode(calculators, 'surface.unguided.roll9');
  const t25 = table('25').tables.find((t) => t.id === u.table.tableId);
  // Fila inferior, Valor 12 → «11~15», -3 → «5~6»; tirada 4 → celda impresa 1.
  const n = Calc.compute(u, { table: t25 }, { sides: { A: { light: 'no', attack: 12, intensity: -3, roll: 4 } } });
  assert.equal(n.sides.A.columnLabel, '5~6');
  assert.equal(n.sides.A.impacts, 1);
  ['page-22.json', 'page-25.json'].forEach((p, i) => assert.ok(Calc.geometryFor(tableHotspots, p, [g, u][i].table.tableId)));
});

test('acciones estratégicas (página 32): varias tiradas en su columna, cada una en su fila', () => {
  const c = Calc.calculatorForNode(calculators, 'strategic.cyber.compare');
  const t32 = table('32').tables.find((t) => t.id === c.table.tableId);
  // Guerra Cibernética: 6 y 9 son Éxito, 0 es Fallo, 3 no tiene efecto → 2 frente a 1: éxito.
  const r = Calc.compute(c, { table: t32 }, { sides: { A: { rolls: '6 0 9 3' } } });
  assert.equal(r.sides.A.columnIndex, 0);
  assert.equal(r.sides.A.extraCells.length, 3);
  assert.match(r.sides.A.explanation.join(' '), /tiene éxito/);
  const bad = Calc.compute(c, { table: t32 }, { sides: { A: { rolls: '6 x' } } });
  assert.equal(bad.sides.A.status, 'error');
  const s = Calc.calculatorForNode(calculators, 'strategic.space.result');
  const sp = Calc.compute(s, { table: t32 }, { sides: { A: { rolls: '7 2' } } });
  assert.equal(sp.sides.A.columnIndex, 1);
  assert.ok(Calc.geometryFor(tableHotspots, 'page-32.json', 'strategic-actions-outcome'));
});

// Ramas añadidas para los procedimientos que el árbol original no cubre (AD-005).
test('extensiones: el árbol ampliado cumple los invariantes y sus textos salen de data/rules', () => {
  const ext = readJson('data/routing/decision-graph-extensions.json');
  const full = Engine.mergeExtensions(graph, ext);
  assert.deepEqual(Engine.validateGraph(full), []);
  assert.equal(Object.keys(graph.nodes).length, 117, 'el árbol original no cambia');
  assert.ok(full.nodes['land.kind'].routes.some((r) => r.to === 'ext.reaction.kind'));
  Object.keys(ext.nodes).forEach((id) => assert.match(id, /^ext\./));
  const reactions = readJson('data/rules/ground-reactions.json').reactions;
  reactions.forEach((r) => assert.equal(full.nodes[`ext.reaction.${r.id}`].title, r.name));
  const steps = readJson('data/rules/submarine-ambush.json').steps.map((x) => x.text);
  assert.deepEqual(full.nodes['ext.ambush.steps'].instructions, steps);
  // El archivo es el que genera el script (no se edita a mano).
  const { execFileSync } = require('node:child_process');
  const before = fs.readFileSync(path.join(root, 'data/routing/decision-graph-extensions.json'), 'utf8');
  execFileSync(process.execPath, [path.join(root, 'scripts/build-decision-extensions.js')]);
  assert.equal(fs.readFileSync(path.join(root, 'data/routing/decision-graph-extensions.json'), 'utf8'), before);
  // Un recorrido completo por una rama nueva.
  let s = Engine.createSession(full, { startNode: 'land.kind' });
  s = Engine.choose(full, s, full.nodes['land.kind'].routes.findIndex((r) => r.to === 'ext.reaction.kind'));
  s = Engine.choose(full, s, 0);
  assert.equal(Engine.isFinished(full, s), true);
});

// Defensas (2026-11-02): valores comprobados contra las páginas impresas de Tablas-de-combate 5.pdf.
function ctx(calcId) {
  const c = calculators.calculators[calcId];
  const extra = {};
  (c.extraTables || []).forEach((x) => { extra[x.tableId] = tableOf(x.page, x.tableId); });
  return { calc: { id: calcId, ...c }, context: { table: c.table ? tableOf(c.table.page, c.table.tableId) : null, workflow: c.workflow ? readJson(`data/workflows/${c.workflow}`) : null, extra } };
}

test('defensa aérea de área (páginas 3, 11, 19): A.A. agrupado, modificadores y la menor de dos tiradas', () => {
  const { calc, context } = ctx('area-defense-land-guided');
  assert.equal(Calc.calculatorForNode(calculators, 'land.guided.area').id, 'area-defense-land-guided');
  const r = Calc.compute(calc, context, { sides: { A: { aa: '6', detected: 'no', nearSpace: 'no', roll: '5' } } });
  assert.equal(r.sides.A.columnLabel, '6~7');
  assert.equal(r.sides.A.rowValue, 3);
  assert.equal(r.sides.A.reduction, -2);
  const n = Calc.compute(calc, context, { sides: { A: { aa: '6', detected: 'yes', nearSpace: 'yes', roll: '7', roll2: '4' } } });
  assert.equal(n.sides.A.rowValue, 1);
  assert.equal(n.sides.A.reduction, -1);
  // Sin la tirada ya se marca la columna.
  const col = Calc.computeWithColumn(calc, context, { sides: { A: { aa: '6', detected: 'yes', nearSpace: 'no' } } });
  assert.equal(col.sides.A.status, 'column');
  assert.equal(col.sides.A.columnIndex, 3);
});

test('interceptación de munición (páginas 4 y 8): un disparo por interceptor, fila de su consumo y suma de reducciones', () => {
  const { calc, context } = ctx('munition-land-guided');
  const r = Calc.compute(calc, context, { sides: {
    I1: { consumption: 'high', aa: '3', performance: 'medium', detection: 'attacker', earlyWarning: 'no', ballistic: 'no', roll: '6' },
    I2: { consumption: 'low', aa: '5', performance: 'high', detection: 'neither', earlyWarning: 'no', ballistic: 'no', roll: '9' },
    I3: { consumption: 'high' }
  } });
  assert.equal(r.sides.I1.reduction, -1);
  assert.equal(r.sides.I2.columnScheme, 'low');
  assert.equal(r.sides.I2.columnLabel, '4~5');
  assert.equal(r.sides.I2.reduction, -1);
  assert.equal(r.sides.I3.status, 'unused');
  assert.match(r.summary[0], /-2/);
  // Sin alerta temprana, las columnas «Más allá del horizonte» (6-9) se leen en la 5.
  const cap = Calc.compute(calc, context, { sides: { I1: { consumption: 'high', aa: '8', performance: 'high', detection: 'attacker', earlyWarning: 'no', ballistic: 'no', roll: '9' } } });
  assert.equal(cap.sides.I1.columnLabel, '5');
  assert.equal(cap.sides.I1.reduction, -4);
  const u = ctx('munition-land-unguided');
  const ug = Calc.compute(u.calc, u.context, { sides: { I1: { consumption: 'high', aa: '12', performance: 'low', detection: 'attacker', unguidedIcon: 'yes', roll: '9' } } });
  assert.equal(ug.sides.I1.columnLabel, '9');
  assert.equal(ug.sides.I1.rowValue, 4);
  assert.equal(ug.sides.I1.reduction, -5);
});

test('interceptación final (página 7): la misma tirada en la fila Bajo y en la fila Alto, se suman los impactos', () => {
  const { calc, context } = ctx('final-interception-land');
  const r = Calc.compute(calc, context, { shared: { roll: '6' }, sides: { low: { aa: '5' }, high: { aa: '4' } } });
  assert.equal(r.sides.low.columnLabel, '4~5');
  assert.equal(r.sides.low.impacts, 1);
  assert.equal(r.sides.high.columnScheme, 'high');
  assert.equal(r.sides.high.columnIndex, 4);
  assert.equal(r.sides.high.impacts, 3);
  assert.match(r.summary[0], /4/);
  const col = Calc.compute(calc, context, { shared: { roll: '' }, sides: { low: { aa: '5' }, high: { aa: '' } } });
  assert.equal(col.sides.low.status, 'column');
  assert.equal(col.sides.high.status, 'unused');
  assert.ok(Calc.geometryFor(tableHotspots, 'page-07.json', 'ground-unguided-final-interception').headerBands.high);
});

test('resistencia electrónica de la flota (página 21): modificador del V.E.F. y multiplicador', () => {
  const { calc, context } = ctx('vef-multiplier');
  const r = Calc.compute(calc, context, { sides: { A: { electronic: '5', distance: '3_5', detection: 'designator_only', roll: '9' } } });
  assert.equal(r.sides.A.rowValue, 5);
  assert.equal(r.sides.A.multiplier, 2);
  assert.equal(r.extraMarks[0].tableId, 'antiship-guided-attack-multiplier');
  const low = Calc.compute(calc, context, { sides: { A: { electronic: '0', distance: '0_2', detection: 'neither', roll: '2' } } });
  assert.equal(low.sides.A.multiplier, 6);
  const pending = Calc.compute(calc, context, { sides: { A: { electronic: '5', distance: '0_2', detection: 'attacker_detected', roll: '' } } });
  assert.equal(pending.pending, true);
  assert.equal(pending.extraMarks.length, 0);
});

test('defensa aérea de área contra aviones (página 18): fila de cabecera por el consumo', () => {
  const { calc, context } = ctx('area-defense-air-shot');
  assert.equal(Calc.compute(calc, context, { sides: { A: { consumption: 'low', aa: '6', roll: '4' } } }).sides.A.impacts, 2);
  const high = Calc.compute(calc, context, { sides: { A: { consumption: 'high', aa: '6', roll: '4' } } }).sides.A;
  assert.equal(high.columnScheme, 'canonical');
  assert.equal(high.impacts, 3);
});

// Daño y efectos (2026-11-02): valores comprobados contra las páginas impresas y las reglas transcritas.
test('contraataque a baja altura (páginas 6 y 22): fila de cabecera del defensor y destrucción por Protección', () => {
  const { calc, context } = ctx('low-altitude-land-guided');
  const r = Calc.compute(calc, context, { shared: { defenderKind: 'air_defense_system', defender: '5' }, sides: { U1: { protection: '3', roll: '9' }, U2: { protection: '4', roll: '9' }, U3: {}, U4: {} } });
  assert.equal(r.sides.U1.columnLabel, '2+');
  assert.equal(r.sides.U1.impacts, 3);
  assert.match(r.sides.U1.explanation[2], /destruida/);
  assert.match(r.sides.U2.explanation[2], /sin efecto/);
  assert.equal(r.sides.U3.status, 'unused');
  assert.match(r.summary[0], /1/);
  const main = Calc.compute(calc, context, { shared: { defenderKind: 'canonical', defender: '5' }, sides: { U1: { protection: '3', roll: '9' } } });
  assert.equal(main.sides.U1.columnLabel, '4~5');
  const s = ctx('low-altitude-antiship-guided');
  assert.equal(Calc.compute(s.calc, s.context, { shared: { defender: '2' }, sides: { U1: { protection: '1', roll: '2' } } }).sides.U1.impacts, 1);
  assert.equal(Calc.calculatorsForNode(calculators, 'surface.guided.counter').length, 2);
});

test('combate naval cercano con artillería (página 25): columna izquierda de tiradas', () => {
  const { calc, context } = ctx('naval-artillery');
  const r = Calc.compute(calc, context, { sides: { A: { artillery: '12', roll: '0' } } });
  assert.equal(r.sides.A.columnLabel, '11~15');
  assert.equal(r.sides.A.rowIndex, 1);
  assert.equal(r.sides.A.impacts, 2);
  assert.equal(Calc.compute(calc, context, { sides: { A: { artillery: '12', roll: '9' } } }).sides.A.impacts, 7);
});

test('resultado del ataque terrestre: unidad, puerto, pista, apron y efecto del impacto en un buque', () => {
  const rules = readJson('data/rules/ground-attack-results.json');
  const unit = calculators.calculators['ground-unit-hit'];
  assert.match(Calc.compute(unit, { rules }, { sides: { A: { kind: 'normal', impacts: '4', protection: '2', terrain: '1' } } }).sides.A.explanation[2], /pierde 1/);
  assert.match(Calc.compute(unit, { rules }, { sides: { A: { kind: 'air_pursuit', impacts: '7', protection: '2' } } }).sides.A.explanation[2], /pierde 3/);
  const port = Calc.compute(calculators.calculators['port-attack'], { rules }, { shared: { totalImpacts: '6', portImpacts: '4', portProtection: '2' }, sides: { S1: { type: 'submarine', impacts: '1' }, S2: {}, S3: {} } });
  assert.match(port.summary[1], /2 instalación/);
  assert.match(port.sides.S1.explanation[0], /destruido/);
  const runway = Calc.compute({ ...calculators.calculators['airfield-runway'] }, { rules }, { sides: { A: { letter: 'B', impacts: '5' } } });
  assert.match(runway.sides.A.explanation[1], /pista D/);
  const apron = Calc.compute(calculators.calculators['airfield-apron'], { rules }, { shared: { impacts: '3', airfieldProtection: '2', hangarCapacity: '1' }, sides: { U1: { shelter: 'yes', fragile: 'no' }, U2: { shelter: 'no', fragile: 'yes' }, U3: {}, U4: {} } });
  assert.match(apron.sides.U1.explanation[1], /dañada/);
  assert.match(apron.sides.U2.explanation[1], /eliminada/);
  const shipRules = readJson('data/rules/ship-impact-effects.json');
  const single = calculators.calculators['ship-impact-single'];
  const need = Calc.compute(single, { rules: shipRules }, { sides: { A: { hasDamagedSide: 'yes', alreadyDamaged: 'no', amphibious: 'no', hasShield: 'no', carrier: 'no', transport: 'no' } } });
  assert.equal(need.sides.A.status, 'incomplete');
  const sunk = Calc.compute(single, { rules: shipRules }, { sides: { A: { hasDamagedSide: 'yes', alreadyDamaged: 'no', amphibious: 'no', hasShield: 'no', carrier: 'no', transport: 'no', sinkingResistance: '3', criticalRoll: '2' } } });
  assert.match(sunk.sides.A.explanation.slice(-1)[0], /Hundida/);
  const multi = Calc.compute(calculators.calculators['ship-impact-multi'], { rules: shipRules }, { sides: { A: { fleetSize: '3', carrier: 'no', transport: 'no' } } });
  assert.match(multi.sides.A.explanation.slice(-1)[0], /quedan 2/);
});

test('absorción WVR, escolta electrónica y daño BVR por la Protección', () => {
  const w = calculators.calculators['wvr-absorption'];
  const ok = Calc.compute(w, {}, { sides: { A: { impacts: '5', protections: '2 3', damage: '1 1' } } });
  assert.equal(ok.sides.A.status, 'ok');
  const more = Calc.compute(w, {}, { sides: { A: { impacts: '5', protections: '2 3', damage: '1 0' } } });
  assert.match(more.sides.A.explanation[1], /hay que asignar más/);
  const ew = Calc.compute(calculators.calculators['ew-escort'], {}, { sides: { A: { impacts: '5', ewProtection: '2', otherProtection: '3' } } });
  assert.match(ew.sides.A.explanation[1], /recibe 1 punto/);
  const bvr = Calc.calculatorForNode(calculators, 'air.intercept.bvr');
  const conditions = Calc.resolveChoices(readJson(`data/workflows/${bvr.choices.workflow}`), bvr.choices);
  const r = Calc.compute(bvr, { table: table('16').tables.find((t) => t.id === bvr.table.tableId), choices: conditions }, { sides: { A: { condition: 'cap', airCombatValue: 9, electronic: 5, roll: 9, targetProtection: '1', targetIsCaps: 'yes' }, B: { condition: 'cap', airCombatValue: 1, electronic: 3, roll: 0 } } });
  if (r.sides.A.impacts > 1) assert.match(r.sides.A.explanation.slice(-1)[0], /sale temporalmente/);
});

test('reparto de impactos en la flota: la tirada elige el buque entre los que siguen a flote (hoja de ayuda: 4 entre 3 → el segundo)', () => {
  const c = calculators.calculators['fleet-impact'];
  const r = Calc.compute(c, {}, { shared: { impacts: '5', perImpact: '1', roll: '4', sinkingRoll: '4' }, sides: { S1: { protection: '3', sunk: 'no' }, S2: { protection: '2', sinking: '4', sunk: 'no' }, S3: { protection: '3', sunk: 'no' }, S4: { sunk: 'no' }, S5: { sunk: 'no' } } });
  assert.equal(r.sides.S2.status, 'ok');
  assert.match(r.sides.S2.explanation[1], /Absorbe 2/);
  assert.match(r.sides.S2.explanation[2], /se hunde/);
  assert.match(r.summary[0], /Quedan 3/);
});

test('procedimientos sin tabla: reacción, emboscada, logística de puerto, garantía, ciberataque, guerra espacial y orden BVR', () => {
  const C = calculators.calculators;
  const rr = readJson('data/rules/ground-reactions.json');
  const cf = Calc.compute(C['reaction-cf'], { rules: rr }, { shared: { targetDetected: 'yes' }, sides: { R1: { kind: 'artillery_fire', inPosition: 'yes', usesCas: 'yes', hasAmmo: 'yes', alreadyDidCf: 'no' }, R2: { kind: 'air_on_call', inPosition: 'yes', alreadyDynamic: 'no' }, R3: {} } });
  assert.equal(cf.sides.R1.status, 'no-effect');
  assert.equal(cf.sides.R2.status, 'ok');
  assert.ok(cf.summary.length > 1);
  const amb = readJson('data/rules/submarine-ambush.json');
  assert.equal(Calc.compute(C['submarine-ambush'], { rules: amb }, { sides: { A: { subState: 'hidden', subType: 'nuclear', alreadyAmbushed: 'no', relation: 'adjacent', event: 'enters', hasAmmo: 'no' } } }).sides.A.status, 'ok');
  assert.equal(Calc.compute(C['submarine-ambush'], { rules: amb }, { sides: { A: { subState: 'hidden', subType: 'conventional', alreadyAmbushed: 'no', relation: 'adjacent', event: 'enters', hasAmmo: 'yes' } } }).sides.A.status, 'no-effect');
  const pl = readJson('data/rules/port-logistics.json');
  assert.match(Calc.compute(C['port-ammo-resupply'], { rules: pl }, { sides: { A: { inWaitingArea: 'yes', units: '5', portValue: '3' } } }).sides.A.explanation[0], /3 unidad.*quedan 2/);
  assert.match(Calc.compute(C['port-ammo-depletion'], { rules: pl }, { sides: { A: { remaining: '2', attackValue: '5' } } }).sides.A.explanation[0], /efectivo: 2/);
  const lg = readJson('data/rules/logistics-guarantee.json');
  assert.equal(Calc.compute(C['guarantee-port'], { rules: lg }, { sides: { A: { nodeKind: 'advanced', nodeEnemyControlled: 'no', blockedEdge: 'no', enemyUnitsOnPath: 'no', enemyControlledOnPath: 'no' } } }).sides.A.status, 'ok');
  const t32 = { 'strategic-actions-outcome': table('32').tables.find((t) => t.id === 'strategic-actions-outcome') };
  const cy = Calc.compute(C['cyber-attack'], { rules: readJson('data/rules/cyber-attack.json'), extra: t32 }, { sides: { A: { attackPoints: '1', defenseUsed: 'no', attackRolls: '9 9 9' } } });
  assert.equal(cy.sides.A.status, 'ok');
  assert.match(cy.sides.A.explanation.join(' '), /Tiradas del atacante: 3/);
  const order = Calc.compute(C['space-order'], {}, { sides: { A: { launch: '2', orbital: '1' }, B: { launch: '3', orbital: '1' } } });
  assert.match(order.summary[0], /primero/);
  const de = Calc.compute(C['space-destruction'], { extra: t32 }, { sides: { A: { kind: 'hard', maneuver: 'yes', rolls: '5' } } });
  assert.equal(de.sides.A.status, 'ok');
  const sel = Calc.compute(C['bvr-selection'], {}, { shared: { context: 'air_combat', eeaA: 'no', eeaB: 'no', initiatorSide: 'A' }, sides: { P1: { side: 'A', electronic: '3', detected: 'yes', ew: 'no' }, P2: { side: 'B', electronic: '5', detected: 'yes', ew: 'no' }, P3: { ew: 'no' }, P4: {}, P5: {}, P6: {} } });
  assert.match(sel.sides.P2.explanation[0], /1\.º/);
  assert.match(sel.sides.P1.explanation[0], /2\.º/);
});

test('modificación de la intensidad (página 5): condiciones del workflow y valores escritos', () => {
  const { calc, context } = ctx('intensity-land-guided');
  const r = Calc.compute(calc, context, { sides: { A: { target_type: 'mobile_main', attack_distance_band: '1', high_penetration_supersonic: 'yes', force_size_excess: '1', guidance_modifier: '' } } });
  assert.equal(r.sides.A.intensity, -5 + 2 + 2);
  assert.equal(Calc.calculatorForNode(calculators, 'land.guided.roll9').id, 'ground-guided');
  assert.equal(Calc.calculatorsForNode(calculators, 'land.guided.roll9')[0].id, 'intensity-land-guided');
});

test('iniciativa BVR (página 15): AWACS +1, DRM de la diferencia y tipo de combate según el contexto', () => {
  const { calc, context } = ctx('bvr-initiative');
  const r = Calc.compute(calc, context, { shared: { context: 'air_combat', roll: '4' }, sides: { A: { initiative: '3', awacs: 'yes' }, B: { initiative: '2', awacs: 'no' } } });
  assert.match(r.summary[0], /Diferencia de Iniciativa: 2 → DRM \+5/);
  assert.match(r.summary[1], /= 9/);
  assert.match(r.summary[2], /simultáneamente/);
  assert.equal(r.extraMarks[0].mark.columnIndex, 1);
});

test('planes de ataque: el valor de cada plan sale de los datos transcritos (carga, unidad dañada) y sin valor no se ofrece', () => {
  const us = readJson('data/ammunition/attack-plans/us.json');
  const choices = Calc.planChoices(us.units[0], 'landAttack');
  assert.ok(choices.some((c) => c.letter === 'C' && c.load === 'light' && !c.damaged && c.value === 12));
  assert.ok(choices.some((c) => c.letter === 'B' && c.damaged && c.value === 2));
  const sp = readJson('data/ammunition/special-unit-plans/us.json');
  assert.ok(Calc.planChoices(sp.units[0], 'antiShip').every((c) => typeof c.value === 'number'));
  Object.values(calculators.calculators).forEach((c) => (c.fields || []).concat(c.sharedFields || []).filter((f) => f.planSource).forEach((f) => assert.ok(['attack-value', 'naval-artillery'].includes(f.planSource))));
});

test('Valor de Ataque del plan menos las defensas ya calculadas en el recorrido; una defensa «Sí» sin cálculo queda pendiente', () => {
  const calc = calculators.calculators['ground-guided'];
  const history = [{ nodeId: 'land.guided.area', answer: 'Sí' }, { nodeId: 'land.guided.munition', answer: 'Sí' }];
  const saved = { 'land.guided.area#0': { outcome: { reduction: -2 } }, 'land.guided.munition#0': { outcome: { reduction: -1 } } };
  const r = Calc.defenseReductions(calc, history, saved);
  assert.equal(r.total, -3);
  assert.equal(r.pending, false);
  const no = Calc.defenseReductions(calc, [{ nodeId: 'land.guided.area', answer: 'No' }, { nodeId: 'land.guided.munition', answer: 'Sí' }], saved);
  assert.equal(no.total, -1);
  assert.equal(Calc.defenseReductions(calc, history, { 'land.guided.area#0': { outcome: { reduction: -2 } } }).pending, true);
  assert.ok(calc.fields.find((f) => f.id === 'attackPlan').derives === 'attack');
});

test('distancia de ataque: la respuesta que encaja depende de los hexágonos y de si la misión es de Área', () => {
  const dist = readJson('data/routing/decision-graph-distance.json');
  Object.entries(dist.nodes).forEach(([id, bands]) => assert.equal(bands.length, fullGraph.nodes[id].routes.length, id));
  const land = dist.nodes['land.guided.mobile_distance'];
  assert.equal(Calc.distanceAnswerIndex(land, '1', 'point'), 1);
  assert.equal(Calc.distanceAnswerIndex(land, '1', 'area'), 0);
  assert.equal(Calc.distanceAnswerIndex(land, '2', 'area'), 1);
  assert.equal(Calc.distanceAnswerIndex(land, '5', 'point'), 2);
  assert.equal(Calc.distanceAnswerIndex(land, '1', ''), -1);
  assert.equal(Calc.distanceAnswerIndex(dist.nodes['surface.guided.range'], '6', 'area'), 1);
});

test('grupo de misión: suma de Combate aéreo, Protecciones y aviones del orden BVR, solo unidades en combate', () => {
  const Group = require('../public/js/air-mission-group.js');
  const g = Group.emptyGroup();
  g.sides.A.units.push(Group.newUnit({ airCombatValue: '3', protection: '2', electronic: '4' }), Group.newUnit({ airCombatValue: '2', protection: '1', status: 'withdrawn' }));
  g.sides.B.units.push(Group.newUnit({ airCombatValue: '5', protection: '3', electronic: '6', detected: 'yes' }));
  g.sides.B.eea = 'yes';
  assert.deepEqual(Calc.groupValues(g, 'wvr-ca', ['A', 'B']).sides, { A: { airCombatValue: '3' }, B: { airCombatValue: '5' } });
  assert.deepEqual(Calc.groupValues(g, 'protections', ['A', 'B']).sides, { A: { protections: '2' }, B: { protections: '3' } });
  const bvr = Calc.groupValues(g, 'bvr-units', ['P1', 'P2', 'P3']);
  assert.equal(bvr.sides.P2.side, 'B');
  assert.equal(bvr.sides.P2.detected, 'yes');
  assert.deepEqual(bvr.sides.P3, {});
  assert.equal(bvr.shared.eeaB, 'yes');
});
