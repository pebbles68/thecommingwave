// Asistente de combate por árbol de decisión (Fase 25). Una pregunta por pantalla con las respuestas exactas del nodo,
// las respuestas ya dadas como migas que se pueden cambiar, los efectos acumulados y las fuentes; en el resultado final,
// las instrucciones y el acceso al cálculo existente. El recorrido sale de data/routing/decision-graph.json
// (DecisionGraphEngine); la vista solo lo dibuja. Rutas: #/decision, #/decision/<nodo de entrada> y #/decision/e/<entrada>
// (punto de entrada de una página, data/routing/decision-entrypoints.json, con respuestas ya dadas que se pueden cambiar).
(function (root) {
  'use strict';

  const { viewRoot, setBreadcrumb, el, renderNotFound, backRow } = AppCore;
  const STORAGE_KEY = 'tcw.decisionGraph.session';

  let cache = null;
  async function loadData() {
    if (cache) return cache;
    const [graph, links, entrypoints, nodeRefs, visualRefs, calculators, tableHotspots] = await Promise.all([
      fetch('/data/routing/decision-graph.json').then((r) => { if (!r.ok) throw new Error('No se pudo cargar decision-graph.json'); return r.json(); }),
      fetch('/data/routing/decision-graph-links.json').then((r) => (r.ok ? r.json() : { terminals: {} })),
      fetch('/data/routing/decision-entrypoints.json').then((r) => (r.ok ? r.json() : { entries: {} })),
      fetch('/data/routing/decision-graph-visual-refs.json').then((r) => (r.ok ? r.json() : { nodes: {} })),
      fetch('/data/rules/wizard-visual-refs.json').then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch('/data/routing/decision-graph-calculators.json').then((r) => (r.ok ? r.json() : { calculators: {} })),
      fetch('/data/image-hotspots/table-pages.json').then((r) => (r.ok ? r.json() : { tables: [] }))
    ]);
    const factorMap = await AppData.loadFactorMap().catch(() => null);
    cache = { graph, links, entrypoints, nodeRefs, visualRefs, calculators, tableHotspots, factorMap, pageTitles: new Map(), tableData: new Map(), workflows: new Map() };
    return cache;
  }

  async function pageTitle(data, page) {
    if (!data.pageTitles.has(page)) {
      data.pageTitles.set(page, fetch(`/data/tables/${page}`).then((r) => (r.ok ? r.json() : null)).then((p) => (p ? p.title : page)).catch(() => page));
    }
    return data.pageTitles.get(page);
  }

  // La sesión se recuerda en este navegador para no perderla al abrir una tabla o un wizard y volver.
  function loadSession(startNode, entryId) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      return saved && saved.startNode === startNode && (saved.entryId || null) === (entryId || null) ? saved : null;
    } catch (err) { return null; }
  }
  function saveSession(session) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch (err) { /* sin almacenamiento: la sesión vive solo en esta vista */ }
  }

  function linkCard(title, description, hash) {
    const card = el('button', 'help-card help-card--highlight');
    card.type = 'button';
    card.appendChild(el('span', 'help-card__title', title));
    if (description) card.appendChild(el('span', 'help-card__source', description));
    card.addEventListener('click', () => { location.hash = hash; });
    return card;
  }

  function sourcesBlock(list) {
    const details = el('details', 'source-details');
    details.appendChild(el('summary', null, 'Fuentes y trazabilidad'));
    const ul = el('ul');
    list.forEach((s) => ul.appendChild(el('li', null, s)));
    details.appendChild(ul);
    return details;
  }

  // Página real de la tabla (images/tablas/page-NN.png, generada en local con scripts/render-table-pages.js y fuera del
  // repositorio). Si la imagen no está (versión pública), se ofrece la tabla transcrita. La imagen no se usa para calcular.
  function tablePageBlock(data, page, open) {
    const n = Number(page.match(/\d+/)[0]);
    const details = el('details', 'decision-graph__table');
    details.open = Boolean(open);
    const summary = el('summary', null, `Tabla real, página ${n}`);
    details.appendChild(summary);
    pageTitle(data, page).then((title) => { summary.textContent = `Tabla real, página ${n}: ${title}`; });
    const slot = el('div');
    details.appendChild(slot);
    AppVisuals.privateImagesAvailable().then((ok) => {
      if (!ok) { slot.appendChild(el('p', 'pending-note', 'La imagen de la tabla real no está en este servidor. Abre la tabla transcrita.')); return; }
      const img = el('img', 'decision-graph__table-img');
      img.alt = `Página ${n} de las tablas de combate`;
      img.src = `/images/tablas/page-${String(n).padStart(2, '0')}.png`;
      slot.appendChild(img);
    });
    const row = el('div', 'action-row');
    const open2 = el('button', 'btn btn--secondary', 'Abrir la tabla transcrita');
    open2.type = 'button';
    open2.addEventListener('click', () => { location.hash = `#/ayuda/tablas/${page}`; });
    row.appendChild(open2);
    details.appendChild(row);
    return details;
  }

  // Botones «dónde se lee en la ficha» de la pregunta (data/routing/decision-graph-visual-refs.json → entradas de
  // data/rules/wizard-visual-refs.json): abren el panel lateral con el factor recuadrado; una entrada pendiente enseña
  // su motivo en vez de una zona aproximada.
  function factorBlock(data, nodeId) {
    // Cada entrada es el id de la ayuda visual o {ref, templateId} cuando la pregunta solo admite un tipo de ficha.
    const items = (((data.nodeRefs && data.nodeRefs.nodes) || {})[nodeId] || []).map((x) => (typeof x === 'string' ? { ref: x } : x));
    const buttons = items.map((item) => openFactorButton(data, item.ref, item.templateId)).filter(Boolean);
    if (!buttons.length) return null;
    const box = el('div', 'decision-graph__factors');
    box.appendChild(el('h3', 'decision-graph__subtitle', 'Dónde se lee en la ficha'));
    buttons.forEach((b) => box.appendChild(b));
    return box;
  }

  function openFactorButton(data, refId, templateId) {
    const entry = (data.visualRefs.entries || []).find((e) => e.id === refId);
    if (!entry) return null;
    const vocab = (data.factorMap && data.factorMap.factorVocabulary) || {};
    const ref = entry.entityRef;
    const factorLabel = ref && ref.factorId && vocab[ref.factorId] ? vocab[ref.factorId].label : null;
    if (!ref) return el('p', 'pending-note', `Ayuda visual pendiente: ${entry.reason || ''}`);
    const btn = el('button', 'btn btn--secondary decision-graph__factor', factorLabel ? `Ver en la ficha: ${factorLabel}` : 'Ver dónde se lee');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    // Con plantilla fija (p. ej. avión de combate) el panel abre solo esa ficha, sin las demás del grupo.
    btn.addEventListener('click', () => { AppVisualHelp.open({ ...ref, ...(templateId ? { scope: undefined, templateId } : {}), fieldLabel: factorLabel || '', refId: entry.id }, btn); });
    return btn;
  }

  async function loadJsonOnce(map, url) {
    if (!map.has(url)) map.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`No se pudo cargar ${url}`); return r.json(); }));
    return map.get(url);
  }

  // Recorte de la tabla real (página del PDF) con la columna, la fila y la celda de cada bando marcadas en su color.
  // Las posiciones salen de data/image-hotspots/table-pages.json; los valores, del cálculo con data/tables/.
  // `result.sides` da la marca de cada bando; `marksOverride` (tablas extra) da marcas propias por bando.
  function markedTable(geometry, result, sides, withImage, marksOverride) {
    const NS = 'http://www.w3.org/2000/svg';
    const [W, H] = geometry.imageSize;
    const fx = geometry.frame[0] * W;
    const fy = geometry.frame[1] * H;
    const fw = (geometry.frame[2] - geometry.frame[0]) * W;
    const fh = (geometry.frame[3] - geometry.frame[1]) * H;
    const pad = 12;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `${fx - pad} ${fy - pad} ${fw + pad * 2} ${fh + pad * 2}`);
    svg.setAttribute('class', 'decision-graph__marked-table');
    svg.setAttribute('role', 'img');
    if (withImage) {
      const image = document.createElementNS(NS, 'image');
      image.setAttribute('href', `/${geometry.image}`);
      image.setAttribute('width', W);
      image.setAttribute('height', H);
      svg.appendChild(image);
    }
    const rect = (r, attrs) => {
      const n = document.createElementNS(NS, 'rect');
      n.setAttribute('x', r.x * W); n.setAttribute('y', r.y * H); n.setAttribute('width', r.w * W); n.setAttribute('height', r.h * H);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      svg.appendChild(n);
    };
    const labels = [];
    sides.forEach((side, i) => {
      const mark = marksOverride ? marksOverride[side.id] : result.sides[side.id];
      const rects = DecisionGraphCalculators.markRects(geometry, mark);
      if (!rects) return;
      const inset = i * 3; // si los dos bandos usan la misma columna, el segundo marco queda por dentro
      const shrink = (r) => ({ x: r.x + inset / W, y: r.y + inset / H, w: r.w - (2 * inset) / W, h: r.h - (2 * inset) / H });
      rect(rects.column, { fill: side.color, 'fill-opacity': 0.12, stroke: side.color, 'stroke-width': 3 });
      if (rects.header) rect(shrink(rects.header), { fill: 'none', stroke: side.color, 'stroke-width': 4 });
      if (rects.row) rect(rects.row, { fill: side.color, 'fill-opacity': 0.08, stroke: 'none' });
      if (rects.cell) rect(shrink(rects.cell), { fill: 'none', stroke: side.color, 'stroke-width': 6 });
      (rects.extraCells || []).forEach((c) => rect(shrink(c), { fill: side.color, 'fill-opacity': 0.15, stroke: side.color, 'stroke-width': 6 }));
      labels.push(marksOverride ? `${side.label}: celda marcada` : `${side.label}: columna ${result.sides[side.id].columnLabel}${rects.cell ? `, fila ${result.sides[side.id].rowValue}` : ''}`);
    });
    svg.setAttribute('aria-label', `Tabla real con lo marcado. ${labels.join('. ')}`);
    return svg;
  }

  // Cálculo dentro de la pregunta (data/routing/decision-graph-calculators.json): factores de cada bando con su ficha,
  // resultado explicado y tabla real marcada. Lo escrito se recuerda por pregunta y ronda.
  const CALC_KEY = 'tcw.decisionGraph.calc';
  function loadCalcInputs() { try { return JSON.parse(sessionStorage.getItem(CALC_KEY) || '{}'); } catch (err) { return {}; } }
  function saveCalcInputs(all) { try { sessionStorage.setItem(CALC_KEY, JSON.stringify(all)); } catch (err) { /* sin almacenamiento */ } }

  async function calculatorBlock(data, calc, stateKey, roundNumber, effects) {
    const box = el('section', 'decision-graph__calc');
    box.appendChild(el('h3', 'decision-graph__subtitle', roundNumber > 1 ? `${calc.title}: ronda ${roundNumber}` : calc.title));
    if (calc.intro) box.appendChild(el('p', 'phase-view__desc', calc.intro));
    let table;
    let choices = [];
    let workflow = null;
    const extra = {};
    let rules = null;
    try {
      const page = await loadJsonOnce(data.tableData, `/data/tables/${calc.table.page}`);
      table = page.tables.find((t) => t.id === calc.table.tableId);
      if (calc.rules) rules = await loadJsonOnce(data.tableData, `/data/rules/${calc.rules}`);
      for (const x of calc.extraTables || []) {
        const p = await loadJsonOnce(data.tableData, `/data/tables/${x.page}`);
        extra[x.tableId] = p.tables.find((t) => t.id === x.tableId);
      }
      if (calc.choices) {
        const wf = calc.choices.workflow ? await loadJsonOnce(data.workflows, `/data/workflows/${calc.choices.workflow}`) : null;
        workflow = wf;
        choices = DecisionGraphCalculators.resolveChoices(wf, calc.choices);
      }
    } catch (err) {
      box.appendChild(el('p', 'pending-note', err.message));
      return box;
    }
    const sides = calc.sides || data.calculators.sides || [];
    const all = loadCalcInputs();
    const inputs = all[stateKey] || { shared: {}, sides: {} };
    sides.forEach((s) => { inputs.sides[s.id] = inputs.sides[s.id] || {}; });
    // Campos que se proponen a partir de lo que el árbol ya ha aplicado (se pueden cambiar).
    calc.fields.filter((d) => d.default !== undefined).forEach((d) => {
      sides.forEach((s) => { if (inputs.sides[s.id][d.id] === undefined) inputs.sides[s.id][d.id] = d.default; });
    });
    calc.fields.filter((d) => d.prefill === 'columnShift').forEach((d) => {
      sides.forEach((s) => { if (inputs.sides[s.id][d.id] === undefined) inputs.sides[s.id][d.id] = String(DecisionGraphCalculators.columnShiftFromEffects(effects)); });
    });
    const resultHost = el('div', 'decision-graph__calc-result');

    const field = (def, value, onChange, sideLabel) => {
      const wrap = el('label', 'decision-graph__field');
      wrap.appendChild(el('span', null, def.label));
      let input;
      if (def.kind === 'choice') {
        input = el('select');
        input.appendChild(Object.assign(el('option', null, 'Elige…'), { value: '' }));
        (def.options || choices).forEach((g) => input.appendChild(Object.assign(el('option', null, g.label), { value: g.value })));
      } else {
        input = el('input');
        input.type = def.kind === 'text' ? 'text' : 'number';
        input.inputMode = 'numeric';
        if (def.min !== undefined) input.min = def.min;
        if (def.max !== undefined) input.max = def.max;
      }
      input.value = value === undefined ? '' : value;
      input.setAttribute('aria-label', sideLabel ? `${sideLabel}: ${def.label}` : def.label);
      input.addEventListener(def.kind === 'choice' ? 'change' : 'input', () => onChange(input.value));
      wrap.appendChild(input);
      const row = el('div', 'decision-graph__field-row');
      row.appendChild(wrap);
      if (def.visualRef) { const b = openFactorButton(data, def.visualRef, def.visualTemplate); if (b) row.appendChild(b); }
      return row;
    };

    const conditional = [];
    const grid = el('div', 'decision-graph__calc-sides');
    sides.forEach((side) => {
      const fs = el('fieldset', 'decision-graph__side');
      fs.style.borderColor = side.color;
      const legend = el('legend', null, side.label);
      legend.style.color = side.color;
      fs.appendChild(legend);
      calc.fields.forEach((def) => {
        const row = field(def, inputs.sides[side.id][def.id], (v) => { inputs.sides[side.id][def.id] = v; update(); }, side.label);
        // Campo condicional: se enseña solo cuando se cumple su `showIf` (lo reevalúa cada cambio).
        if (def.showIf) conditional.push({ row, def, values: inputs.sides[side.id] });
        fs.appendChild(row);
      });
      grid.appendChild(fs);
    });
    box.appendChild(grid);
    (calc.sharedFields || []).forEach((def) => box.appendChild(field(def, inputs.shared[def.id], (v) => { inputs.shared[def.id] = v; update(); })));
    box.appendChild(resultHost);

    const geometryOf = (tableId) => DecisionGraphCalculators.geometryFor(data.tableHotspots, calc.table.page, tableId);
    const withImage = await AppVisuals.privateImagesAvailable();
    function update() {
      conditional.forEach((c) => { c.row.hidden = !DecisionGraphCalculators.fieldApplies(c.def, c.values); });
      all[stateKey] = inputs;
      saveCalcInputs(all);
      resultHost.textContent = '';
      const result = DecisionGraphCalculators.computeWithColumn(calc, { table, choices, extra, rules, workflow }, inputs);
      const anyOk = sides.some((s) => ['ok', 'column'].includes(result.sides[s.id].status));
      const anyResult = sides.some((s) => result.sides[s.id].status === 'ok');
      // Un cálculo puede elegir la tabla según una respuesta (p. ej. el evento de la búsqueda aérea).
      const geometry = geometryOf(result.tableId || calc.table.tableId);
      sides.forEach((side) => {
        const r = result.sides[side.id];
        const card = el('div', 'decision-graph__side-result');
        card.style.borderColor = side.color;
        card.appendChild(el('strong', null, side.label));
        if (r.status === 'incomplete') card.appendChild(el('p', 'source-refs', 'Faltan datos de este bando.'));
        (r.explanation || []).forEach((t) => card.appendChild(el('p', null, t)));
        resultHost.appendChild(card);
      });
      if (anyOk && geometry) {
        const fig = el('figure', 'decision-graph__figure');
        fig.appendChild(markedTable(geometry, result, sides, withImage));
        const cap = el('figcaption', 'source-refs', withImage
          ? `Tabla real, página ${geometry.page}.${geometry.reviewStatus === 'verified' ? '' : ' Rejilla calibrada pendiente de tu revisión.'}`
          : `La imagen de la tabla real (página ${geometry.page}) no está en este servidor: solo se ven las marcas. Abre la tabla transcrita.`);
        fig.appendChild(cap);
        resultHost.appendChild(fig);
      } else if (anyOk) {
        resultHost.appendChild(el('p', 'pending-note', 'Esta tabla todavía no tiene la rejilla calibrada sobre la página real.'));
      }
      // Tablas extra de la misma página (p. ej. guerra electrónica), con la celda del bando que la consulta.
      (result.extraMarks || []).forEach((xm) => {
        const g = DecisionGraphCalculators.geometryFor(data.tableHotspots, calc.table.page, xm.tableId);
        if (!g) return;
        const fig = el('figure', 'decision-graph__figure decision-graph__figure--extra');
        fig.appendChild(markedTable(g, result, sides, withImage, { [xm.sideId]: xm.mark }));
        fig.appendChild(el('figcaption', 'source-refs', `Tabla real, página ${g.page}: ${(extra[xm.tableId] || {}).title || xm.tableId}.`));
        resultHost.appendChild(fig);
      });
      if (anyResult && calc.afterResult) resultHost.appendChild(el('p', 'phase-view__desc', calc.afterResult));
    }
    update();
    return box;
  }

  function effectsBlock(effects) {
    const box = el('div', 'decision-graph__effects');
    box.appendChild(el('h3', 'decision-graph__subtitle', 'Lo que se aplica hasta ahora'));
    const ul = el('ul');
    effects.forEach((e) => ul.appendChild(el('li', null, e.text)));
    box.appendChild(ul);
    return box;
  }

  async function renderDecisionGraph(startNodeId, entryId) {
    const navToken = Router.currentToken();
    AppCore.clearLastTurnContext();
    setBreadcrumb(['TCW Assistant', 'Asistente de combate']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let data;
    try {
      data = await loadData();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;
    const { graph, links, entrypoints } = data;
    const startNode = startNodeId || graph.entrypoint;
    if (!DecisionGraphEngine.getNode(graph, startNode)) { renderNotFound(`El punto del árbol «${startNode}» no existe`); return; }
    const entry = entryId ? (entrypoints.entries || {})[entryId] : null;
    if (entryId && !entry) { renderNotFound(`El punto de entrada «${entryId}» no existe`); return; }
    const freshSession = () => (entry ? DecisionGraphEngine.sessionFromEntry(graph, entrypoints, entryId) : DecisionGraphEngine.createSession(graph, { startNode }));

    let session = loadSession(startNode, entryId) || freshSession();

    const wrap = el('div', 'decision-graph');
    wrap.appendChild(el('h1', 'help-detail__title', 'Asistente de combate'));
    wrap.appendChild(el('p', 'phase-view__desc', 'Responde una pregunta cada vez: el asistente te lleva al procedimiento y a la tabla que corresponden. Puedes cambiar cualquier respuesta anterior; lo que venía después se descarta.'));
    if (entry) wrap.appendChild(el('p', 'decision-graph__entry', `Empiezas en: ${entry.title}. Las respuestas que la página da por puestas aparecen arriba y puedes cambiarlas.`));
    if (graph.reviewStatus === 'needs_review') wrap.appendChild(el('p', 'source-refs', 'Árbol de decisión pendiente de revisión por el mantenedor.'));
    const body = el('div', 'decision-graph__body');
    wrap.appendChild(body);
    wrap.appendChild(backRow());
    viewRoot.innerHTML = '';
    viewRoot.appendChild(wrap);

    function update(next) {
      session = next;
      saveSession(session);
      // Quita el foco antes de redibujar (mismo arreglo que en los wizards, commit faf97d0).
      if (document.activeElement && body.contains(document.activeElement)) document.activeElement.blur();
      draw();
      // Lleva a la pregunta nueva (no al principio): con muchas respuestas dadas, la pregunta queda más abajo.
      const progress = body.querySelector('.combat-guide__progress');
      (progress || wrap).scrollIntoView({ block: 'start' });
    }

    function answersTrail() {
      if (!session.history.length) return null;
      const box = el('div', 'decision-graph__trail');
      box.appendChild(el('h3', 'decision-graph__subtitle', 'Tus respuestas'));
      const list = el('ol', 'decision-graph__answers');
      session.history.forEach((step, i) => {
        const li = el('li', 'decision-graph__answer');
        // Una pregunta repetida en bucle (rondas WVR) se numera para distinguir cada ronda.
        const round = session.history.slice(0, i + 1).filter((h) => h.nodeId === step.nodeId).length;
        const repeated = session.history.filter((h) => h.nodeId === step.nodeId).length > 1 || step.nodeId === DecisionGraphEngine.currentNodeId(session);
        li.appendChild(el('span', 'decision-graph__answer-question', repeated ? `Ronda ${round}: ${step.question}` : step.question));
        li.appendChild(el('strong', 'decision-graph__answer-value', step.preset ? `${step.answer} (dada por la página)` : step.answer));
        const change = el('button', 'btn btn--secondary decision-graph__change', 'Cambiar');
        change.type = 'button';
        change.setAttribute('aria-label', `Cambiar la respuesta: ${step.question}`);
        change.addEventListener('click', () => update(DecisionGraphEngine.rewindTo(session, i)));
        li.appendChild(change);
        list.appendChild(li);
      });
      box.appendChild(list);
      return box;
    }

    function controls() {
      const row = el('div', 'action-row');
      const prev = el('button', 'btn btn--secondary', '← Pregunta anterior');
      prev.type = 'button';
      prev.disabled = session.history.length === 0;
      prev.addEventListener('click', () => update(DecisionGraphEngine.goBack(session)));
      row.appendChild(prev);
      const restart = el('button', 'btn btn--secondary', 'Empezar de nuevo');
      restart.type = 'button';
      restart.disabled = session.history.every((step) => step.preset);
      restart.addEventListener('click', () => update(freshSession()));
      row.appendChild(restart);
      return row;
    }

    function drawDecision(node) {
      body.appendChild(el('p', 'combat-guide__progress', `Pregunta ${session.history.length + 1}`));
      // Un bucle real (otra ronda WVR) vuelve a la misma pregunta: se dice qué ronda es para que se note que avanzó.
      const repeats = DecisionGraphEngine.repeatCount(session);
      if (repeats > 0) body.appendChild(el('p', 'decision-graph__round', `Ronda ${repeats + 1}. Antes de responder, resuelve esta ronda: con la tabla de abajo o con el cálculo. Se aplica lo indicado en «Lo que se aplica hasta ahora».`));
      body.appendChild(el('h2', 'combat-guide__question', node.question));
      const factors = factorBlock(data, node.id);
      if (factors) body.appendChild(factors);
      const calcDef = DecisionGraphCalculators.calculatorForNode(data.calculators, node.id);
      if (calcDef) {
        const host = el('div');
        body.appendChild(host);
        calculatorBlock(data, calcDef, `${node.id}#${repeats}`, repeats + 1, DecisionGraphEngine.accumulatedEffects(session)).then((block) => host.appendChild(block));
      }
      // Pregunta en la que se cruza una tabla: el cálculo de ese paso, sin perder el recorrido (la sesión se recuerda).
      const calc = DecisionGraphEngine.nodeLinks(links, node.id);
      if (calc.length) {
        const box = el('div', 'decision-graph__resolve');
        box.appendChild(el('h3', 'decision-graph__subtitle', repeats > 0 ? `Resolver la ronda ${repeats + 1}` : 'Resolver este paso'));
        const list = el('div', 'help-list');
        calc.forEach((w) => list.appendChild(linkCard(w.title, 'Calcula la tirada con la tabla; al volver sigues en esta pregunta.', w.hash)));
        box.appendChild(list);
        body.appendChild(box);
      }
      const list = el('div', 'help-list decision-graph__options');
      node.routes.forEach((route, i) => {
        const btn = el('button', 'help-card decision-graph__option');
        btn.type = 'button';
        btn.appendChild(el('span', 'help-card__title', route.answer));
        btn.addEventListener('click', () => update(DecisionGraphEngine.choose(graph, session, i)));
        list.appendChild(btn);
      });
      body.appendChild(list);
      // La tabla de la página citada, abierta si la pregunta es la del cruce (tirada o tabla), plegada si no.
      const crossing = repeats > 0 || DecisionGraphEngine.nodeLinks(links, node.id).length > 0 || /d10|tabla|cruz|Tras resolver|ronda/i.test(node.question);
      DecisionGraphEngine.tablePagesFromSource(node.source, 3).forEach((page) => body.appendChild(tablePageBlock(data, page, crossing)));
    }

    function drawTerminal(node) {
      const illegal = node.id.startsWith('terminal.illegal.');
      body.appendChild(el('p', 'combat-guide__progress', illegal ? 'No se puede resolver' : 'Resultado'));
      body.appendChild(el('h2', 'combat-guide__question', node.title));
      const ul = el('ul', 'decision-graph__instructions');
      node.instructions.forEach((text) => ul.appendChild(el('li', null, text)));
      body.appendChild(ul);
      const target = DecisionGraphEngine.terminalLinks(links, node.id);
      if (target.wizards.length || target.tables.length) {
        body.appendChild(el('h3', 'decision-graph__subtitle', 'Hacer el cálculo'));
        const list = el('div', 'help-list');
        target.wizards.forEach((w) => list.appendChild(linkCard(w.title, 'Calcula la tirada con la tabla y explica el resultado.', w.hash)));
        body.appendChild(list);
        // Las tablas del procedimiento, en pantalla y abiertas (p. ej. en el combate aéreo: banda BVR, daño BVR y WVR).
        target.tables.forEach((page) => body.appendChild(tablePageBlock(data, page, true)));
      }
    }

    function draw() {
      body.textContent = '';
      const node = DecisionGraphEngine.currentNode(graph, session);
      const trail = answersTrail();
      if (trail) body.appendChild(trail);
      if (node.type === 'decision') drawDecision(node); else drawTerminal(node);
      const effects = DecisionGraphEngine.accumulatedEffects(session);
      if (effects.length) body.appendChild(effectsBlock(effects));
      body.appendChild(sourcesBlock(DecisionGraphEngine.sourceTrace(graph, session)));
      body.appendChild(controls());
    }

    draw();
  }

  // Tarjeta «Resolver con el asistente» para otras páginas: `kind` es subphases, workflows o tablePages y `keys` sus ids.
  // Si las claves llevan a entradas distintas (una subfase o un segmento con combates de varios dominios), se entra por
  // la entrada general «all»; si ninguna tiene entrada, no hay tarjeta.
  async function entryCard(kind, keys) {
    let data;
    try { data = await loadData(); } catch (err) { return null; }
    const ids = [...new Set((keys || []).map((k) => DecisionGraphEngine.entryForContext(data.entrypoints, kind, k)).filter(Boolean))];
    if (!ids.length) return null;
    const entryId = ids.length === 1 ? ids[0] : 'all';
    const entry = data.entrypoints.entries[entryId];
    const card = linkCard('▶ Resolver con el asistente de combate', entry ? `Empieza en: ${entry.title}` : '', `#/decision/e/${entryId}`);
    card.classList.add('decision-graph__launch');
    // Nombre accesible corto: la descripción repite el nombre de un combate y no debe confundirse con su propio enlace.
    card.setAttribute('aria-label', 'Resolver con el asistente de combate');
    return card;
  }

  root.Views = root.Views || {};
  root.Views.DecisionGraph = { renderDecisionGraph, entryCard };
})(typeof window !== 'undefined' ? window : globalThis);
