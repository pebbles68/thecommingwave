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
