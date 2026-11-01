// Revisión de las zonas de imagen (Fase 25; la herramienta de marcado manual que quedó pendiente en la Fase 22).
// Enseña juntas las fichas reales (data/image-hotspots/real-counters.json) con sus zonas y las rejillas de las tablas
// reales (data/image-hotspots/table-pages.json). El mantenedor marca cada zona «Bien» o «Mal» (con nota) y descarga
// el resultado, que se guarda como scripts/image-hotspots/profiles/image-review.json: los calibradores marcan
// `verified` lo que está bien y dejan `needs_review` con la nota lo que está mal. Lo marcado se recuerda en este
// navegador mientras se revisa (es una comodidad: el resultado válido es el archivo descargado). Ruta: #/revision.
(function (root) {
  'use strict';

  const { viewRoot, setBreadcrumb, el, renderNotFound, backRow } = AppCore;
  const STORAGE_KEY = 'tcw.imageReview';
  const NS = 'http://www.w3.org/2000/svg';

  function loadMarks() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (err) { return {}; } }
  function saveMarks(marks) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(marks)); } catch (err) { /* sin almacenamiento */ } }

  function svgEl(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  }

  // Botones Bien / Mal y nota de una zona; `key` identifica la zona en el archivo de revisión.
  function reviewControls(marks, key, onChange) {
    const wrap = el('div', 'image-review__controls');
    const current = () => marks[key] || {};
    const ok = el('button', 'btn btn--secondary image-review__ok', 'Bien');
    const bad = el('button', 'btn btn--secondary image-review__bad', 'Mal');
    [ok, bad].forEach((b) => { b.type = 'button'; });
    const note = el('input', 'image-review__note');
    note.type = 'text';
    note.placeholder = 'Qué está mal (opcional)';
    note.setAttribute('aria-label', 'Nota de lo que está mal');
    const paint = () => {
      const st = current().status;
      ok.classList.toggle('is-active', st === 'ok');
      bad.classList.toggle('is-active', st === 'wrong');
      ok.setAttribute('aria-pressed', String(st === 'ok'));
      bad.setAttribute('aria-pressed', String(st === 'wrong'));
      note.hidden = st !== 'wrong';
      note.value = current().note || '';
    };
    const set = (status) => {
      marks[key] = { ...current(), status: current().status === status ? undefined : status };
      if (!marks[key].status) delete marks[key];
      onChange();
      paint();
    };
    ok.addEventListener('click', () => set('ok'));
    bad.addEventListener('click', () => set('wrong'));
    note.addEventListener('input', () => { marks[key] = { ...current(), note: note.value }; onChange(); });
    wrap.appendChild(ok);
    wrap.appendChild(bad);
    wrap.appendChild(note);
    paint();
    return { element: wrap, repaint: paint };
  }

  function counterCard(inst, vocab, marks, withImage, onChange, controls) {
    const card = el('section', 'image-review__card');
    card.appendChild(el('h2', 'image-review__title', inst.unit));
    card.appendChild(el('p', 'source-refs', `Plantilla: ${inst.templateId}`));
    const [W, H] = inst.imageSize;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'image-review__svg', role: 'img', 'aria-label': `Ficha real: ${inst.unit}` });
    if (withImage) svg.appendChild(svgEl('image', { href: `/${inst.image}`, width: W, height: H }));
    const zones = inst.hotspots.filter((h) => h.rect && !h.notPrinted && !h.unidentified);
    const rects = new Map();
    zones.forEach((h, i) => {
      const r = h.rect;
      const g = svgEl('g', { class: 'image-review__zone' });
      g.appendChild(svgEl('rect', { x: r.x * W, y: r.y * H, width: r.width * W, height: r.height * H }));
      const t = svgEl('text', { x: r.x * W + 1, y: r.y * H - 1 });
      t.textContent = String(i + 1);
      g.appendChild(t);
      svg.appendChild(g);
      rects.set(h.id, g);
    });
    const body = el('div', 'image-review__body');
    const fig = el('div', 'image-review__figure');
    fig.appendChild(svg);
    body.appendChild(fig);
    const list = el('ol', 'image-review__list');
    const label = (h) => (vocab[h.id] ? vocab[h.id].label : h.id);
    zones.forEach((h) => {
      const li = el('li', 'image-review__item');
      const name = el('button', 'image-review__name', label(h));
      name.type = 'button';
      name.addEventListener('click', () => {
        rects.forEach((g) => g.classList.remove('is-active'));
        rects.get(h.id).classList.add('is-active');
      });
      li.appendChild(name);
      const c = reviewControls(marks, `counters/${inst.templateId}/${h.id}`, onChange);
      controls.push(c);
      li.appendChild(c.element);
      list.appendChild(li);
    });
    // Lo que se dice de la ficha sin zona también se revisa: «no lleva impreso» o «pendiente de identificar».
    inst.hotspots.filter((h) => h.notPrinted || h.unidentified).forEach((h) => {
      const li = el('li', 'image-review__item image-review__item--claim');
      li.appendChild(el('span', 'image-review__name', `${label(h)}: ${h.notPrinted ? 'esta ficha no lo lleva impreso' : 'pendiente de identificar'}`));
      const c = reviewControls(marks, `counters/${inst.templateId}/${h.id}`, onChange);
      controls.push(c);
      li.appendChild(c.element);
      list.appendChild(li);
    });
    body.appendChild(list);
    card.appendChild(body);
    return card;
  }

  function tableCard(geo, marks, withImage, onChange, controls) {
    const card = el('section', 'image-review__card');
    card.appendChild(el('h2', 'image-review__title', `Tabla de la página ${geo.page}`));
    card.appendChild(el('p', 'source-refs', `${geo.tableId} · ajuste: ${geo.fit.columns} px en columnas, ${geo.fit.rows} px en filas`));
    const [W, H] = geo.imageSize;
    const [fx0, fy0, fx1, fy1] = geo.frame;
    const pad = 10;
    const svg = svgEl('svg', { viewBox: `${fx0 * W - pad} ${fy0 * H - pad} ${(fx1 - fx0) * W + pad * 2} ${(fy1 - fy0) * H + pad * 2}`, class: 'image-review__svg image-review__svg--table', role: 'img', 'aria-label': `Rejilla de la tabla ${geo.tableId}` });
    if (withImage) svg.appendChild(svgEl('image', { href: `/${geo.image}`, width: W, height: H }));
    const top = Math.min(geo.valuesTop, ...Object.values(geo.headerBands || {}).map((b) => b[0]));
    const bottom = geo.rowEdges[geo.rowEdges.length - 1];
    geo.columnEdges.forEach((x) => svg.appendChild(svgEl('line', { x1: x * W, x2: x * W, y1: top * H, y2: bottom * H, class: 'image-review__col' })));
    geo.rowEdges.forEach((y) => svg.appendChild(svgEl('line', { x1: geo.columnEdges[0] * W, x2: geo.columnEdges[geo.columnEdges.length - 1] * W, y1: y * H, y2: y * H, class: 'image-review__row' })));
    Object.entries(geo.headerBands || {}).forEach(([, b]) => svg.appendChild(svgEl('line', { x1: geo.columnEdges[0] * W, x2: geo.columnEdges[geo.columnEdges.length - 1] * W, y1: b[1] * H, y2: b[1] * H, class: 'image-review__band' })));
    const fig = el('div', 'image-review__figure image-review__figure--table');
    fig.appendChild(svg);
    card.appendChild(fig);
    const c = reviewControls(marks, `tables/page-${String(geo.page).padStart(2, '0')}/${geo.tableId}`, onChange);
    controls.push(c);
    const row = el('div', 'image-review__item');
    row.appendChild(el('span', 'image-review__name', 'Columnas (azul), filas (rojo) y cabeceras (verde) coinciden con la tabla'));
    row.appendChild(c.element);
    card.appendChild(row);
    return card;
  }

  // Archivo de revisión: por zona, «ok» o «wrong» con su nota; quién y cuándo.
  function buildReviewFile(marks) {
    const out = { schemaVersion: 1, note: 'Revisión del mantenedor desde #/revision. Lo aplican calibrate_real_counters.py y calibrate_table_pages.py: «ok» pasa a verified; «wrong» queda needs_review con la nota.', review: { by: 'Mantenedor (Pablo)', at: new Date().toISOString().slice(0, 10) }, counters: {}, tables: {} };
    Object.entries(marks).forEach(([key, v]) => {
      if (!v.status) return;
      const [kind, a, b] = key.split('/');
      out[kind][a] = out[kind][a] || {};
      out[kind][a][b] = v.note ? { status: v.status, note: v.note } : { status: v.status };
    });
    return out;
  }

  async function render() {
    const navToken = Router.currentToken();
    AppCore.clearLastTurnContext();
    setBreadcrumb(['TCW Assistant', 'Revisión de fichas y tablas']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let real; let tables; let factorMap; let withImage;
    try {
      [real, tables, factorMap, withImage] = await Promise.all([
        fetch('/data/image-hotspots/real-counters.json').then((r) => { if (!r.ok) throw new Error('No se pudo cargar real-counters.json'); return r.json(); }),
        fetch('/data/image-hotspots/table-pages.json').then((r) => (r.ok ? r.json() : { tables: [] })),
        AppData.loadFactorMap(),
        AppVisuals.privateImagesAvailable()
      ]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;
    const marks = loadMarks();
    const controls = [];
    const wrap = el('div', 'image-review');
    wrap.appendChild(el('h1', 'help-detail__title', 'Revisión de fichas y tablas'));
    wrap.appendChild(el('p', 'phase-view__desc', 'Marca cada zona «Bien» o «Mal» (si está mal, di qué en la nota). Toca el nombre de un factor para resaltar su recuadro. Al terminar, descarga la revisión y envíamela: lo que esté bien pasará a revisado y corregiré lo que esté mal.'));
    if (!withImage) wrap.appendChild(el('p', 'pending-note', 'Las imágenes reales no están en este servidor: solo se ven los recuadros. La revisión hay que hacerla en local o en el servidor privado.'));
    const status = el('p', 'image-review__status');
    const actions = el('div', 'action-row image-review__actions');
    const allOk = el('button', 'btn btn--secondary', 'Marcar como «Bien» todo lo que falta');
    allOk.type = 'button';
    const download = el('button', 'btn btn--primary', 'Descargar la revisión');
    download.type = 'button';
    actions.appendChild(allOk);
    actions.appendChild(download);
    wrap.appendChild(status);
    wrap.appendChild(actions);

    const allKeys = [];
    const onChange = () => {
      saveMarks(marks);
      const done = allKeys.filter((k) => marks[k] && marks[k].status).length;
      const wrong = allKeys.filter((k) => marks[k] && marks[k].status === 'wrong').length;
      status.textContent = `Revisadas ${done} de ${allKeys.length}${wrong ? ` (${wrong} mal)` : ''}.`;
    };
    const vocab = factorMap.factorVocabulary || {};
    wrap.appendChild(el('h2', 'table-viewer__section-title', 'Fichas reales'));
    real.instances.forEach((inst) => {
      inst.hotspots.forEach((h) => allKeys.push(`counters/${inst.templateId}/${h.id}`));
      wrap.appendChild(counterCard(inst, vocab, marks, withImage, onChange, controls));
    });
    wrap.appendChild(el('h2', 'table-viewer__section-title', 'Tablas reales'));
    (tables.tables || []).forEach((geo) => {
      allKeys.push(`tables/page-${String(geo.page).padStart(2, '0')}/${geo.tableId}`);
      wrap.appendChild(tableCard(geo, marks, withImage, onChange, controls));
    });
    allOk.addEventListener('click', () => {
      allKeys.forEach((k) => { if (!marks[k] || !marks[k].status) marks[k] = { status: 'ok' }; });
      onChange();
      controls.forEach((c) => c.repaint());
    });
    download.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(buildReviewFile(marks), null, 2) + '\n'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'image-review.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    });
    wrap.appendChild(backRow());
    viewRoot.innerHTML = '';
    viewRoot.appendChild(wrap);
    onChange();
  }

  root.Views = root.Views || {};
  root.Views.ImageReview = { render, buildReviewFile };
})(typeof window !== 'undefined' ? window : globalThis);
