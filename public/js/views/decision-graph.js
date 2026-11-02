// Asistente de combate por árbol de decisión (Fase 25). Una pregunta por pantalla con las respuestas exactas del nodo,
// las respuestas ya dadas como migas que se pueden cambiar, los efectos acumulados y las fuentes; en el resultado final,
// las instrucciones y el acceso al cálculo existente. El recorrido sale de data/routing/decision-graph.json
// (DecisionGraphEngine); la vista solo lo dibuja. Rutas: #/decision, #/decision/<nodo de entrada> y #/decision/e/<entrada>
// (punto de entrada de una página, data/routing/decision-entrypoints.json, con respuestas ya dadas que se pueden cambiar).
(function (root) {
  'use strict';

  const { viewRoot, setBreadcrumb, el, renderNotFound, backRow } = AppCore;
  // Último resultado de cada cálculo de la sesión (por pregunta y ronda), para el resumen que se guarda en el historial.
  const calcSummaries = new Map();
  const STORAGE_KEY = 'tcw.decisionGraph.session';

  let cache = null;
  async function loadData() {
    if (cache) return cache;
    const [baseGraph, extensions, links, entrypoints, nodeRefs, visualRefs, calculators, tableHotspots] = await Promise.all([
      fetch('/data/routing/decision-graph.json').then((r) => { if (!r.ok) throw new Error('No se pudo cargar decision-graph.json'); return r.json(); }),
      fetch('/data/routing/decision-graph-extensions.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/routing/decision-graph-links.json').then((r) => (r.ok ? r.json() : { terminals: {} })),
      fetch('/data/routing/decision-entrypoints.json').then((r) => (r.ok ? r.json() : { entries: {} })),
      fetch('/data/routing/decision-graph-visual-refs.json').then((r) => (r.ok ? r.json() : { nodes: {} })),
      fetch('/data/rules/wizard-visual-refs.json').then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch('/data/routing/decision-graph-calculators.json').then((r) => (r.ok ? r.json() : { calculators: {} })),
      fetch('/data/image-hotspots/table-pages.json').then((r) => (r.ok ? r.json() : { tables: [] }))
    ]);
    const distance = await fetch('/data/routing/decision-graph-distance.json').then((r) => (r.ok ? r.json() : { nodes: {} })).catch(() => ({ nodes: {} }));
    const missions = await AppData.loadAirMissions().catch(() => null);
    const factorMap = await AppData.loadFactorMap().catch(() => null);
    // Ramas añadidas para los procedimientos que el árbol original no cubre (Fase 25, AD-005).
    const graph = DecisionGraphEngine.mergeExtensions(baseGraph, extensions);
    cache = { graph, links, entrypoints, nodeRefs, visualRefs, calculators, tableHotspots, factorMap, distance, missions, pageTitles: new Map(), tableData: new Map(), workflows: new Map() };
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
    const btn = el('button', 'btn btn--secondary decision-graph__factor', entry.buttonLabel || (factorLabel ? `Ver en la ficha: ${factorLabel}` : 'Ver dónde se lee'));
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    // Con plantilla fija (p. ej. avión de combate) el panel abre solo esa ficha, sin las demás del grupo.
    btn.addEventListener('click', () => { AppVisualHelp.open({ ...ref, ...(templateId ? { scope: undefined, templateId } : {}), fieldLabel: entry.fieldLabel || factorLabel || '', refId: entry.id }, btn); });
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
    // Una tabla pequeña (p. ej. las de la página 21) no se amplía más allá de 1,5 veces su tamaño en la página.
    svg.style.maxWidth = `${Math.round((fw + pad * 2) * 1.5)}px`;
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
  const MISSION_KEY = 'tcw.decisionGraph.mission';
  // Preguntas donde se pide la misión del ataque (ataques aire-superficie y aire-tierra) y donde se edita el grupo de
  // misión aéreo (interceptación y combate aéreo).
  const MISSION_NODES = /^(land\.(guided|unguided|arm)|surface\.(guided|unguided))\./;
  const GROUP_NODES = /^(air\.intercept\.|ext\.air\.)/;
  function loadCalcInputs() { try { return JSON.parse(sessionStorage.getItem(CALC_KEY) || '{}'); } catch (err) { return {}; } }
  function saveCalcInputs(all) { try { sessionStorage.setItem(CALC_KEY, JSON.stringify(all)); } catch (err) { /* sin almacenamiento */ } }

  async function calculatorBlock(data, calc, stateKey, roundNumber, effects, onResult, history) {
    const box = el('section', 'decision-graph__calc');
    box.appendChild(el('h3', 'decision-graph__subtitle', roundNumber > 1 ? `${calc.title}: ronda ${roundNumber}` : calc.title));
    if (calc.intro) box.appendChild(el('p', 'phase-view__desc', calc.intro));
    let table;
    let choices = [];
    let workflow = null;
    const extra = {};
    let rules = null;
    // Una página que repite la tabla de otra (`reusesTable`) la toma de la página donde está transcrita; la imagen marcada
    // sigue siendo la de esta página.
    const loadTable = async (pageFile, tableId) => {
      const p = await loadJsonOnce(data.tableData, `/data/tables/${pageFile}`);
      const found = (p.tables || []).find((t) => t.id === tableId);
      if (found || !p.reusesTable || p.reusesTable.id !== tableId) return found;
      return loadTable(p.reusesTable.definedIn.split('/').pop(), tableId);
    };
    try {
      // Un procedimiento sin tabla (p. ej. el resultado sobre un puerto) solo explica el cálculo.
      if (calc.table) table = await loadTable(calc.table.page, calc.table.tableId);
      if (calc.rules) rules = await loadJsonOnce(data.tableData, `/data/rules/${calc.rules}`);
      for (const x of calc.extraTables || []) extra[x.tableId] = await loadTable(x.page, x.tableId);
      const wfFile = calc.workflow || (calc.choices && calc.choices.workflow);
      if (wfFile) workflow = await loadJsonOnce(data.workflows, `/data/workflows/${wfFile}`);
      if (calc.choices) choices = DecisionGraphCalculators.resolveChoices(workflow, calc.choices);
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
    const defenses = DecisionGraphCalculators.defenseReductions(calc, history, all);
    const inputEls = {};

    const field = (def, value, onChange, sideLabel) => {
      const wrap = el('label', 'decision-graph__field');
      wrap.appendChild(el('span', null, def.label));
      let input;
      if (def.kind === 'choice') {
        input = el('select');
        input.appendChild(Object.assign(el('option', null, 'Elige…'), { value: '' }));
        (DecisionGraphCalculators.fieldOptions(def, workflow, rules) || choices).forEach((g) => input.appendChild(Object.assign(el('option', null, g.label), { value: g.value })));
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
      if (def.planSource) row.appendChild(planPicker(def, input));
      if (def.derives && (calc.defenseNodes || []).length) {
        row.appendChild(el('p', 'source-refs decision-graph__derived', defenses.lines.length
          ? `Defensas de este recorrido: ${defenses.lines.join(', ')}.${defenses.pending ? '' : ` Se restan solas: Valor de Ataque = plan ${defenses.total < 0 ? '−' : '+'} ${Math.abs(defenses.total)}.`}`
          : 'Ninguna defensa contestada «Sí» en este recorrido: el Valor de Ataque es el del plan.'));
      }
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
        const row = field(def, inputs.sides[side.id][def.id], (v) => {
          inputs.sides[side.id][def.id] = v;
          // Un campo que deriva otro (el Valor del plan) rellena el destino con las defensas ya restadas.
          if (def.derives && v !== '' && !defenses.pending) {
            const target = inputEls[`${side.id}:${def.derives}`];
            const value = String(Math.max(0, Number(v) + defenses.total));
            inputs.sides[side.id][def.derives] = value;
            if (target) target.value = value;
          }
          update();
        }, side.label);
        inputEls[`${side.id}:${def.id}`] = row.querySelector('input, select');
        // Campo condicional: se enseña solo cuando se cumple su `showIf` (lo reevalúa cada cambio).
        if (def.showIf) conditional.push({ row, def, values: inputs.sides[side.id] });
        fs.appendChild(row);
      });
      grid.appendChild(fs);
    });
    if (calc.groupLoad) {
      const load = el('button', 'btn btn--secondary', 'Cargar del grupo de misión');
      load.type = 'button';
      const info = el('span', 'source-refs');
      load.addEventListener('click', () => {
        const g = DecisionGraphCalculators.groupValues(AppCore.loadAirGroup(), calc.groupLoad, sides.map((s) => s.id));
        const put = (key, value) => {
          const target = inputEls[key];
          if (!target || value === undefined) return;
          target.value = value;
          target.dispatchEvent(new Event(target.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        };
        Object.entries(g.sides).forEach(([sid, vals]) => Object.entries(vals).forEach(([k, v]) => put(`${sid}:${k}`, v)));
        Object.entries(g.shared).forEach(([k, v]) => put(`shared:${k}`, v));
        info.textContent = g.missing ? `Cargado; ${g.missing} avión(es) del grupo no caben aquí.` : 'Cargado del grupo de misión (solo las unidades «En combate»).';
      });
      const row = el('div', 'action-row');
      row.appendChild(load);
      row.appendChild(info);
      box.appendChild(row);
    }
    box.appendChild(grid);
    (calc.sharedFields || []).forEach((def) => {
      const row = field(def, inputs.shared[def.id], (v) => { inputs.shared[def.id] = v; update(); });
      inputEls[`shared:${def.id}`] = row.querySelector('input, select');
      box.appendChild(row);
    });
    box.appendChild(resultHost);

    const geometryOf = (tableId) => (calc.table ? DecisionGraphCalculators.geometryFor(data.tableHotspots, calc.table.page, tableId) : null);
    const withImage = await AppVisuals.privateImagesAvailable();
    function update() {
      conditional.forEach((c) => { c.row.hidden = !DecisionGraphCalculators.fieldApplies(c.def, c.values); });
      all[stateKey] = inputs;
      saveCalcInputs(all);
      resultHost.textContent = '';
      const result = DecisionGraphCalculators.computeWithColumn(calc, { table, choices, extra, rules, workflow }, inputs);
      if (calc.outcome === 'reduction') {
        const done = sides.filter((s) => result.sides[s.id].status === 'ok');
        inputs.outcome = done.length ? { reduction: done.reduce((sum, s) => sum + (result.sides[s.id].reduction || 0), 0) } : undefined;
        saveCalcInputs(all);
      }
      const anyOk = sides.some((s) => ['ok', 'column'].includes(result.sides[s.id].status));
      const anyResult = sides.some((s) => result.sides[s.id].status === 'ok') || ((result.summary || []).length > 0 && !result.pending);
      // Un cálculo puede elegir la tabla según una respuesta (p. ej. el evento de la búsqueda aérea).
      const geometry = calc.table ? geometryOf(result.tableId || calc.table.tableId) : null;
      sides.forEach((side) => {
        const r = result.sides[side.id];
        const card = el('div', 'decision-graph__side-result');
        card.style.borderColor = side.color;
        card.appendChild(el('strong', null, side.label));
        if (r.status === 'incomplete') card.appendChild(el('p', 'source-refs', side.optional ? 'Opcional: rellénalo solo si dispara.' : 'Faltan datos de este bando.'));
        (r.explanation || []).forEach((t) => card.appendChild(el('p', null, t)));
        resultHost.appendChild(card);
      });
      // Total de varios disparos (p. ej. la suma de las reducciones de la interceptación).
      (result.summary || []).forEach((t) => resultHost.appendChild(el('p', 'decision-graph__calc-summary', t)));
      if (anyOk && geometry) {
        const fig = el('figure', 'decision-graph__figure');
        fig.appendChild(markedTable(geometry, result, sides, withImage));
        const cap = el('figcaption', 'source-refs', withImage
          ? `Tabla real, página ${geometry.page}.${geometry.reviewStatus === 'verified' ? '' : ' Rejilla calibrada pendiente de tu revisión.'}`
          : `La imagen de la tabla real (página ${geometry.page}) no está en este servidor: solo se ven las marcas. Abre la tabla transcrita.`);
        fig.appendChild(cap);
        resultHost.appendChild(fig);
      } else if (anyOk && calc.table) {
        resultHost.appendChild(el('p', 'pending-note', 'Esta tabla todavía no tiene la rejilla calibrada sobre la página real.'));
      }
      // Tablas extra de la misma página (p. ej. guerra electrónica), con la celda del bando que la consulta.
      (result.extraMarks || []).forEach((xm) => {
        const xPage = ((calc.extraTables || []).find((x) => x.tableId === xm.tableId) || calc.table).page;
        const g = DecisionGraphCalculators.geometryFor(data.tableHotspots, xPage, xm.tableId);
        if (!g) return;
        const fig = el('figure', 'decision-graph__figure decision-graph__figure--extra');
        fig.appendChild(markedTable(g, result, sides, withImage, { [xm.sideId]: xm.mark }));
        fig.appendChild(el('figcaption', 'source-refs', `Tabla real, página ${g.page}: ${(extra[xm.tableId] || {}).title || xm.tableId}.`));
        resultHost.appendChild(fig);
      });
      if (anyResult && !result.pending) {
        calcSummaries.set(stateKey, [calc.title].concat(sides.filter((s) => result.sides[s.id].status !== 'unused' && result.sides[s.id].explanation).map((s) => `${s.label}: ${result.sides[s.id].explanation.join(' ')}`), result.summary || []));
        if (onResult) onResult();
      }
      if (anyResult && !result.pending && calc.afterResult) resultHost.appendChild(el('p', 'phase-view__desc', calc.afterResult));
    }
    update();
    return box;
  }

  // Selector de unidad y plan de ataque (data/ammunition/*): rellena el campo con el valor transcrito del plan elegido.
  // `planSource`: «attack-value» (Valor de Ataque del plan, del dominio `planDomain`) o «naval-artillery» (número
  // arriba a la derecha del perfil del barco). Con `planSum` el valor se suma al que ya hay (p. ej. toda la flota).
  function planPicker(def, input) {
    const box = el('details', 'decision-graph__plan');
    box.appendChild(el('summary', null, def.planSource === 'naval-artillery' ? 'Tomar del plan de ataque del buque' : 'Tomar del plan de ataque'));
    const country = el('select');
    const category = el('select');
    const unitSel = el('select');
    const planSel = el('select');
    const note = el('p', 'source-refs');
    const use = el('button', 'btn btn--secondary', def.planSum ? 'Sumar este valor' : 'Usar este valor');
    use.type = 'button';
    use.disabled = true;
    const opt = (sel, value, label) => sel.appendChild(Object.assign(el('option', null, label), { value }));
    const label = (text, control) => { const w = el('label', 'decision-graph__field'); w.appendChild(el('span', null, text)); w.appendChild(control); return w; };
    opt(country, '', 'Elige…');
    AppData.AMMO_COUNTRIES.forEach((c) => opt(country, c.id, c.label));
    const cats = def.planSource === 'naval-artillery' ? AppData.AMMO_CATEGORIES.filter((c) => c.id === 'naval') : AppData.AMMO_CATEGORIES;
    opt(category, '', 'Elige…');
    cats.forEach((c) => opt(category, c.id, c.title));
    if (cats.length === 1) category.value = cats[0].id;
    let units = [];
    let choices = [];
    const reset = (sel) => { sel.textContent = ''; opt(sel, '', 'Elige…'); };
    async function loadUnits() {
      reset(unitSel); reset(planSel); use.disabled = true; note.textContent = '';
      const cat = cats.find((c) => c.id === category.value);
      if (!country.value || !cat) return;
      try {
        const file = await AppData.loadAmmoFile(cat.dir, country.value);
        units = cat.groups.flatMap((g) => file[g.key] || []);
        if (def.planSource === 'naval-artillery') units = (file.surfaceShips || []).filter((u) => u.shipBadge !== undefined && u.shipBadge !== null);
        units.forEach((u, i) => opt(unitSel, String(i), u.name || u.id));
      } catch (err) { note.textContent = err.message; }
    }
    function loadPlans() {
      reset(planSel); use.disabled = true; note.textContent = '';
      const u = units[Number(unitSel.value)];
      if (!u || unitSel.value === '') return;
      if (def.planSource === 'naval-artillery') {
        note.textContent = `Artillería Naval de ${u.name}: ${u.shipBadge}.`;
        use.disabled = !/^\d+$/.test(String(u.shipBadge));
        if (use.disabled) note.textContent += ' No es un número único: escríbelo a mano.';
        return;
      }
      choices = DecisionGraphCalculators.planChoices(u, def.planDomain);
      choices.forEach((c, i) => opt(planSel, String(i), c.label));
      if (!choices.length) note.textContent = 'Esta unidad no tiene planes con valor transcrito para este ataque.';
    }
    country.addEventListener('change', loadUnits);
    category.addEventListener('change', loadUnits);
    unitSel.addEventListener('change', loadPlans);
    planSel.addEventListener('change', () => {
      const c = choices[Number(planSel.value)];
      use.disabled = !c || planSel.value === '';
      note.textContent = c ? `${c.label}.${def.planNote ? ` ${def.planNote}` : ''}` : '';
    });
    use.addEventListener('click', () => {
      const value = def.planSource === 'naval-artillery' ? Number(units[Number(unitSel.value)].shipBadge) : choices[Number(planSel.value)].value;
      input.value = String(def.planSum && input.value !== '' ? Number(input.value) + value : value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    box.appendChild(label('País', country));
    if (cats.length > 1) box.appendChild(label('Tipo de unidad', category));
    box.appendChild(label(def.planSource === 'naval-artillery' ? 'Buque' : 'Unidad', unitSel));
    if (def.planSource !== 'naval-artillery') box.appendChild(label('Plan de ataque', planSel));
    box.appendChild(note);
    box.appendChild(use);
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
    calcSummaries.clear();
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
    AppCore.mountTurnOrigin(wrap);
    if (entry) wrap.appendChild(el('p', 'decision-graph__entry', `Empiezas en: ${entry.title}. Las respuestas que la página da por puestas aparecen arriba y puedes cambiarlas.`));
    if (graph.reviewStatus === 'needs_review') wrap.appendChild(el('p', 'source-refs', 'Árbol de decisión pendiente de revisión por el mantenedor.'));
    const body = el('div', 'decision-graph__body');
    wrap.appendChild(body);
    wrap.appendChild(backRow());
    viewRoot.innerHTML = '';
    viewRoot.appendChild(wrap);

    // Resolución ligada al nodo del turno desde el que se abrió (como hacían los wizards): aparece como «Resolución activa»
    // en esa subfase hasta que se guarda o se cancela, y «Volver a la resolución» abre esta misma ruta.
    const turnCtx = AppCore.getLastTurnContext();
    const resolutionId = turnCtx && turnCtx.resolutionNodeId ? TurnProgressEngine.makeResolutionId('decision', turnCtx.band, turnCtx.resolutionNodeId) : null;
    function linkToTurn() {
      if (!resolutionId) return;
      AppCore.registerPendingResolution({ id: resolutionId, type: 'decision', band: turnCtx.band, nodeId: turnCtx.resolutionNodeId, phaseId: turnCtx.phaseId, subphaseId: turnCtx.subphaseId, label: `Asistente de combate${entry ? `: ${entry.title}` : ''}`, resumeHash: location.hash });
      AppStorage.saveDraft(`decision:${resolutionId}`, { hash: location.hash, session }, resolutionId);
    }
    function summaryText(node) {
      const lines = ['Asistente de combate', node.title || node.question];
      session.history.forEach((h) => lines.push(`${h.question} → ${h.answer}`));
      DecisionGraphEngine.accumulatedEffects(session).forEach((e) => lines.push(`• ${e.text}`));
      calcSummaries.forEach((l) => lines.push('', ...l));
      return lines.join('\n');
    }
    function saveRow(node) {
      const row = el('div', 'action-row');
      const save = el('button', 'btn btn--primary', '💾 Guardar en el historial');
      save.type = 'button';
      const done = el('span', 'source-refs');
      save.addEventListener('click', () => {
        AppCore.saveResolutionToHistory({ workflowId: 'decision', workflowTitle: `Asistente de combate: ${node.title || node.question}`, summaryText: summaryText(node), state: { route: location.hash, session, calcInputs: loadCalcInputs(), calculators: Object.fromEntries(calcSummaries) } });
        if (resolutionId) AppCore.removePendingResolution(resolutionId);
        done.textContent = resolutionId ? 'Guardada en el historial y quitada de las resoluciones activas del turno.' : 'Guardada en el historial.';
      });
      row.appendChild(save);
      row.appendChild(done);
      return row;
    }

    function update(next) {
      session = next;
      saveSession(session);
      if (session.history.some((h) => !h.preset)) linkToTurn();
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
      if (MISSION_NODES.test(node.id)) body.appendChild(missionBlock());
      const distanceBands = (data.distance.nodes || {})[node.id];
      if (distanceBands) body.appendChild(distanceBlock(node, distanceBands));
      if (GROUP_NODES.test(node.id)) body.appendChild(groupBlock());
      calculatorsHere(node, repeats);
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
      // Respuestas de reglas opcionales o de la expansión: solo si el perfil de reglas las activa.
      const profile = AppCore.loadRuleProfile();
      const hidden = node.routes.filter((route) => !RuleProfileEngine.isAvailable(route, profile));
      node.routes.forEach((route, i) => {
        if (hidden.includes(route)) return;
        const btn = el('button', 'help-card decision-graph__option');
        btn.type = 'button';
        btn.appendChild(el('span', 'help-card__title', route.answer));
        btn.addEventListener('click', () => update(DecisionGraphEngine.choose(graph, session, i)));
        list.appendChild(btn);
      });
      body.appendChild(list);
      if (hidden.length) {
        const note = el('p', 'source-refs', `No se ofrece por tu perfil de reglas: ${hidden.map((r) => r.answer).join(', ')}. `);
        const change = el('button', 'btn btn--secondary', 'Cambiar el perfil de reglas');
        change.type = 'button';
        change.addEventListener('click', () => { location.hash = '#/perfil-reglas'; });
        note.appendChild(change);
        body.appendChild(note);
      }
      // La tabla de la página citada, abierta si la pregunta es la del cruce (tirada o tabla), plegada si no.
      const crossing = repeats > 0 || DecisionGraphEngine.nodeLinks(links, node.id).length > 0 || /d10|tabla|cruz|Tras resolver|ronda/i.test(node.question);
      DecisionGraphEngine.tablePagesFromSource(node.source, 3).forEach((page) => body.appendChild(tablePageBlock(data, page, crossing)));
    }

    // Cálculos de esta pregunta o resultado (puede haber varios), en el orden de los datos.
    function calculatorsHere(node, repeats) {
      DecisionGraphCalculators.calculatorsForNode(data.calculators, node.id).forEach((calcDef) => {
        const host = el('div');
        body.appendChild(host);
        const key = calcDef.id === DecisionGraphCalculators.calculatorForNode(data.calculators, node.id).id ? `${node.id}#${repeats}` : `${node.id}:${calcDef.id}#${repeats}`;
        calculatorBlock(data, calcDef, key, repeats + 1, DecisionGraphEngine.accumulatedEffects(session), linkToTurn, session.history).then((block) => host.appendChild(block));
      });
    }

    // ---- Misión del ataque (antes: «paso 0» de los wizards; data/missions/air-missions.json, MissionContextEngine) ----
    // Se recuerda en esta pestaña; desde una fase del turno con una sola misión posible se preselecciona.
    function loadMission() { try { return JSON.parse(sessionStorage.getItem(MISSION_KEY) || '{}'); } catch (err) { return {}; } }
    function saveMission(m) { try { sessionStorage.setItem(MISSION_KEY, JSON.stringify(m)); } catch (err) { /* sin almacenamiento */ } }
    function currentMission() {
      const m = loadMission();
      if (!m.missionId && data.missions && turnCtx) {
        const preset = MissionContextEngine.presetMissionForPhase(data.missions, turnCtx.phaseId);
        if (preset) { m.missionId = preset; m.source = 'phase'; saveMission(m); }
      }
      return m;
    }
    function missionType(m) {
      if (m.missionId && m.missionId !== MissionContextEngine.NONE && data.missions) {
        const a = MissionContextEngine.areaMissionAnswer(data.missions, m.missionId);
        if (a) return a === 'yes' ? 'area' : 'point';
      }
      return m.manualType || '';
    }
    function missionBlock() {
      const box = el('details', 'decision-graph__mission');
      const m = currentMission();
      const name = (id) => { const x = data.missions && MissionContextEngine.findMission(data.missions, id); return x ? `${x.name}${x.abbreviation ? ` (${x.abbreviation})` : ''}` : ''; };
      box.appendChild(el('summary', null, m.missionId && m.missionId !== MissionContextEngine.NONE ? `Misión del ataque: ${name(m.missionId)}` : (m.missionId ? 'Misión del ataque: no procede de una misión aérea' : 'Misión del ataque (opcional)')));
      if (!data.missions) { box.appendChild(el('p', 'pending-note', 'No se han podido cargar las misiones aéreas.')); return box; }
      const restriction = turnCtx ? MissionContextEngine.restrictionForPhase(data.missions, turnCtx.phaseId) : null;
      if (restriction) box.appendChild(el('p', 'phase-view__desc', `En esta fase del turno la única misión aérea que se resuelve es ${restriction.onlyMissionIds.map(name).join(' o ')}.`));
      const sel = el('select');
      sel.setAttribute('aria-label', '¿Qué misión aérea ejecuta el grupo que ataca?');
      sel.appendChild(Object.assign(el('option', null, 'Elige…'), { value: '' }));
      MissionContextEngine.listMissions(data.missions, { surfaceOrGround: true, phaseId: turnCtx ? turnCtx.phaseId : null }).forEach((x) => sel.appendChild(Object.assign(el('option', null, name(x.id)), { value: x.id })));
      sel.appendChild(Object.assign(el('option', null, 'No procede de una misión aérea (artillería, ataque naval o submarino)'), { value: MissionContextEngine.NONE }));
      sel.value = m.missionId || '';
      sel.addEventListener('change', () => { saveMission({ missionId: sel.value, source: 'manual' }); draw(); });
      const wrap = el('label', 'decision-graph__field');
      wrap.appendChild(el('span', null, '¿Qué misión aérea ejecuta el grupo que ataca?'));
      wrap.appendChild(sel);
      box.appendChild(wrap);
      const card = m.missionId && m.missionId !== MissionContextEngine.NONE ? MissionContextEngine.buildCard(data.missions, m.missionId) : null;
      if (card) {
        [['Tipo de misión', card.missionType], ['Zona Central', card.centralZone], ['Distancia corta', card.shortRangeNote], ['Alcance permitido', card.ranges.join(' · ')], ['Duración', card.duration], ['Coste de mando', card.commandCost === null ? null : `${card.commandCost} Punto(s) de Mando`], ['Requisitos', card.requirements.join('; ')]]
          .filter(([, v]) => v).forEach(([k, v]) => { const p = el('p', 'phase-view__desc'); p.appendChild(el('strong', null, `${k}: `)); p.appendChild(document.createTextNode(v)); box.appendChild(p); });
        if (card.sourceRefs.length) box.appendChild(el('p', 'source-refs', card.sourceRefs.join(' · ')));
      }
      box.open = !m.missionId;
      return box;
    }

    // ---- Distancia de ataque: señala la respuesta que encaja con los hexágonos y la misión (Área / Punto) ----
    function distanceBlock(node, bands) {
      const box = el('div', 'decision-graph__distance');
      const m = currentMission();
      const input = el('input');
      input.type = 'number';
      input.inputMode = 'numeric';
      input.min = 0;
      input.value = m.distance || '';
      input.setAttribute('aria-label', 'Distancia de ataque en hexágonos');
      const wrap = el('label', 'decision-graph__field');
      wrap.appendChild(el('span', null, 'Distancia de ataque (hexágonos, contada desde la ficha del atacante)'));
      wrap.appendChild(input);
      box.appendChild(wrap);
      const type = missionType(m);
      let typeSel = null;
      if (!type || m.manualType) {
        typeSel = el('select');
        typeSel.setAttribute('aria-label', '¿Es Misión de Área?');
        [['', 'Elige…'], ['area', 'Sí, Misión de Área'], ['point', 'No, Misión de Punto o sin misión']].forEach(([v, l]) => typeSel.appendChild(Object.assign(el('option', null, l), { value: v })));
        typeSel.value = m.manualType || '';
        const w = el('label', 'decision-graph__field');
        w.appendChild(el('span', null, '¿Es Misión de Área?'));
        w.appendChild(typeSel);
        box.appendChild(w);
      } else {
        box.appendChild(el('p', 'source-refs', `Según la misión elegida: ${type === 'area' ? 'Misión de Área' : 'Misión de Punto'}.`));
      }
      const out = el('p', 'decision-graph__distance-result');
      box.appendChild(out);
      const refresh = () => {
        const cur = loadMission();
        cur.distance = input.value;
        if (typeSel) cur.manualType = typeSel.value;
        saveMission(cur);
        const idx = DecisionGraphCalculators.distanceAnswerIndex(bands, input.value, missionType(cur));
        body.querySelectorAll('.decision-graph__option').forEach((b, i) => b.classList.toggle('decision-graph__option--suggested', i === idx));
        out.textContent = idx >= 0 ? `Encaja con la respuesta «${node.routes[idx].answer}».` : (input.value === '' ? '' : 'Falta saber si es Misión de Área.');
      };
      input.addEventListener('input', refresh);
      if (typeSel) typeSel.addEventListener('change', refresh);
      setTimeout(refresh, 0);
      return box;
    }

    // ---- Grupo de misión aéreo (antes: #/wizard/air-mission-group; AirMissionGroup + almacenamiento local) ----
    function groupBlock() {
      const box = el('details', 'decision-graph__group');
      const group = AppCore.loadAirGroup();
      const n = (k) => group.sides[k].units.filter((u) => u.status === 'active').length;
      box.appendChild(el('summary', null, `Grupo de misión: ${n('A')} en combate en el bando azul, ${n('B')} en el rojo`));
      box.appendChild(el('p', 'phase-view__desc', 'Las unidades de los dos bandos, guardadas en este navegador. Los cálculos de esta pregunta pueden cargarlas («Cargar del grupo de misión»); al retirarse o caer una unidad, cambia su estado y ya no se carga.'));
      const save = () => AppCore.saveAirGroup(group);
      const colLabels = [['name', 'Nombre', 'text'], ['airCombatValue', 'Combate aéreo', 'number'], ['protection', 'Protección', 'number'], ['electronic', 'Valor Electrónico', 'number']];
      const yn = [['no', 'No'], ['yes', 'Sí']];
      ['A', 'B'].forEach((k, si) => {
        const s = group.sides[k];
        const side = (data.calculators.sides || [])[si] || { label: k, color: '#888' };
        const fsEl = el('fieldset', 'decision-graph__side');
        fsEl.style.borderColor = side.color;
        const legend = el('legend', null, side.label);
        legend.style.color = side.color;
        fsEl.appendChild(legend);
        const eea = el('select');
        yn.forEach(([v, l]) => eea.appendChild(Object.assign(el('option', null, l), { value: v })));
        eea.value = s.eea;
        eea.setAttribute('aria-label', `${side.label}: ¿lleva escolta electrónica (EEA)?`);
        eea.addEventListener('change', () => { s.eea = eea.value; save(); });
        const ew = el('label', 'decision-graph__field');
        ew.appendChild(el('span', null, '¿Lleva escolta electrónica (EEA)?'));
        ew.appendChild(eea);
        fsEl.appendChild(ew);
        s.units.forEach((u, ui) => {
          const row = el('div', 'decision-graph__group-unit');
          colLabels.forEach(([key, label, type]) => {
            const i = el('input');
            i.type = type;
            if (type === 'number') { i.inputMode = 'numeric'; i.min = 0; }
            i.value = u[key];
            i.setAttribute('aria-label', `${side.label}, unidad ${ui + 1}: ${label}`);
            i.addEventListener('input', () => { u[key] = i.value; save(); });
            const w = el('label', 'decision-graph__field');
            w.appendChild(el('span', null, label));
            w.appendChild(i);
            row.appendChild(w);
          });
          [['detected', '¿Detectada?', yn], ['ew', '¿Avión EW?', yn], ['status', 'Estado', AirMissionGroup.STATUSES.map((x) => [x.value, x.label])]].forEach(([key, label, opts]) => {
            const sel = el('select');
            opts.forEach(([v, l]) => sel.appendChild(Object.assign(el('option', null, l), { value: v })));
            sel.value = u[key];
            sel.setAttribute('aria-label', `${side.label}, unidad ${ui + 1}: ${label}`);
            sel.addEventListener('change', () => { u[key] = sel.value; save(); });
            const w = el('label', 'decision-graph__field');
            w.appendChild(el('span', null, label));
            w.appendChild(sel);
            row.appendChild(w);
          });
          const del = el('button', 'btn btn--secondary', 'Quitar');
          del.type = 'button';
          del.setAttribute('aria-label', `Quitar la unidad ${ui + 1} del ${side.label}`);
          del.addEventListener('click', () => { s.units.splice(ui, 1); save(); draw(); });
          row.appendChild(del);
          fsEl.appendChild(row);
        });
        const add = el('button', 'btn btn--secondary', 'Añadir unidad');
        add.type = 'button';
        add.setAttribute('aria-label', `Añadir una unidad al ${side.label}`);
        add.addEventListener('click', () => { s.units.push(AirMissionGroup.newUnit()); save(); draw(); body.querySelector('.decision-graph__group').open = true; });
        fsEl.appendChild(add);
        box.appendChild(fsEl);
      });
      return box;
    }

    function drawTerminal(node) {
      const illegal = node.id.startsWith('terminal.illegal.');
      body.appendChild(el('p', 'combat-guide__progress', illegal ? 'No se puede resolver' : 'Resultado'));
      body.appendChild(el('h2', 'combat-guide__question', node.title));
      if (node.id.startsWith('ext.')) body.appendChild(el('p', 'source-refs', 'Rama añadida a partir del reglamento, pendiente de revisión por el mantenedor.'));
      const ul = el('ul', 'decision-graph__instructions');
      node.instructions.forEach((text) => ul.appendChild(el('li', null, text)));
      body.appendChild(ul);
      calculatorsHere(node, 0);
      if (!illegal) body.appendChild(saveRow(node));
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

  // Punto del asistente que sustituye a un wizard antiguo (data/routing/decision-entrypoints.json, `wizards`).
  async function assistantHash(kind, key) {
    let data;
    try { data = await loadData(); } catch (err) { return null; }
    if (kind === 'wizards') {
      const target = (data.entrypoints.wizards || {})[key];
      if (!target) return null;
      return target.entry ? `#/decision/e/${target.entry}` : `#/decision/${target.node}`;
    }
    const entryId = DecisionGraphEngine.entryForContext(data.entrypoints, kind, key);
    return entryId ? `#/decision/e/${entryId}` : null;
  }

  // Igual que assistantHash('wizards', …) pero a partir del enlace antiguo (#/wizard/<id>).
  async function assistantHashForWizardHash(hash) {
    const key = Object.keys(AppCore.WORKFLOW_WIZARD_HASHES || {}).find((k) => AppCore.WORKFLOW_WIZARD_HASHES[k] === hash);
    return key ? assistantHash('wizards', key) : null;
  }

  // Ruta antigua de un wizard retirado (#/wizard/<id>): el punto del asistente que lo sustituye, o su inicio.
  async function redirectFromWizard(slug) {
    const target = (await assistantHashForWizardHash(`#/wizard/${slug}`)) || '#/decision';
    location.replace(target);
  }

  // «Repetir» del historial: vuelve a la misma pregunta con las mismas respuestas y los mismos datos de los cálculos.
  function restoreFromHistory(state) {
    if (state && state.session) saveSession(state.session);
    if (state && state.calcInputs) saveCalcInputs(state.calcInputs);
    location.hash = (state && state.route) || '#/decision';
  }

  root.Views = root.Views || {};
  root.Views.DecisionGraph = { renderDecisionGraph, entryCard, assistantHash, assistantHashForWizardHash, redirectFromWizard, restoreFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
