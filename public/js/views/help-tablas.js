// Ayuda de Tablas (roadmap Fase 5/6), dividida de views/help.js en
// correcciones03.md COR03-006 (2026-09-29). Índice de las 34 páginas
// transcritas, router de combate (árbol de decisión de "Mapa de uso de
// tablas.txt") y el visor de tabla individual (fila/columna/celda
// resaltadas, AGENTS.md §9.3).
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, renderNotFound, backRow, renderGrid,
    loadTablesIndex, loadTableRouting, findTablesForLeaf, loadTablePage,
    loadWorkflowsIndex, loadTableById, WORKFLOW_WIZARD_HASHES, RELATED_WORKFLOW_WIZARDS
  } = AppCore;

  async function renderTablesIndex() {
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Tablas']);
    viewRoot.innerHTML = '<p class="loading">Cargando índice de tablas…</p>';
    const index = await loadTablesIndex();
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', 'Tablas de combate'));
    wrap.appendChild(el('p', 'turn-view__desc', `${index.pages.length} páginas transcritas de Tablas-de-combate 5.pdf. Cada página indica si su transcripción está verificada contra el PDF y si queda alguna regla de uso pendiente de validar (ver docs/rules/known-ambiguities.md).`));

    const routerCard = el('button', 'help-card help-card--highlight');
    routerCard.type = 'button';
    routerCard.appendChild(el('span', 'help-card__title', '🧭 Buscar tabla por tipo de combate'));
    routerCard.appendChild(el('span', 'help-card__source', 'Router de combate (Mapa de uso de tablas): responde unas preguntas y llega directamente a la tabla correcta, en vez de elegir la página a mano.'));
    routerCard.addEventListener('click', () => { location.hash = '#/ayuda/tablas/router'; });
    wrap.appendChild(routerCard);

    wrap.appendChild(el('h2', 'table-viewer__section-title', 'O elige la página directamente'));
    const list = el('div', 'help-list');
    index.pages.forEach((page) => {
      const card = el('button', 'help-card');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', `Pág. ${page.page} — ${page.title}`));
      const statusNote = reviewStatusLabel(page);
      card.appendChild(el('span', 'help-card__source', `${page.tableIds.length} tabla(s)${statusNote ? ' · ' + statusNote : ''}`));
      card.addEventListener('click', () => { location.hash = `#/ayuda/tablas/${page.file}`; });
      list.appendChild(card);
    });
    wrap.appendChild(list);
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  async function renderTableRouter(pathValues) {
    const navToken = Router.currentToken();
    viewRoot.innerHTML = '<p class="loading">Cargando router de combate…</p>';
    const routing = await loadTableRouting();
    if (!Router.isCurrent(navToken)) return;
    const walk = TableRoutingEngine.walkTableRouting(routing, pathValues);

    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Tablas', 'Router', ...(walk.trail || []).map((t) => t.label)]);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail router-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Router de combate'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Responde cada pregunta (objetivo, origen y tipo de ataque) hasta llegar a la tabla que corresponde.'));

    if (walk.trail && walk.trail.length) {
      const trailBox = el('div', 'router-trail');
      walk.trail.forEach((t) => trailBox.appendChild(el('span', 'router-trail__item', `${t.question}: ${t.label}`)));
      wrap.appendChild(trailBox);
    }

    if (walk.error) {
      wrap.appendChild(el('p', 'pending-note', walk.error));
    } else if (walk.leaf) {
      wrap.appendChild(el('h2', null, 'Resultado'));
      if (walk.leaf.tableReference) wrap.appendChild(el('p', 'turn-view__desc', walk.leaf.tableReference));
      if (walk.leaf.note) wrap.appendChild(el('p', 'source-refs', walk.leaf.note));

      if (WORKFLOW_WIZARD_HASHES[walk.leaf.workflowId]) {
        const wizardHash = WORKFLOW_WIZARD_HASHES[walk.leaf.workflowId];
        const wizardCard = el('button', 'help-card help-card--highlight');
        wizardCard.type = 'button';
        wizardCard.appendChild(el('span', 'help-card__title', '▶ Resolver con el wizard de combate'));
        wizardCard.appendChild(el('span', 'help-card__source', 'Pregunta los modificadores y llega a la tabla final ya posicionada.'));
        wizardCard.addEventListener('click', () => { location.hash = wizardHash; });
        wrap.appendChild(wizardCard);
      }
      (RELATED_WORKFLOW_WIZARDS[walk.leaf.workflowId] || []).forEach((extra) => {
        const card = el('button', 'help-card help-card--highlight');
        card.type = 'button';
        card.appendChild(el('span', 'help-card__title', extra.title));
        card.appendChild(el('span', 'help-card__source', extra.desc));
        card.addEventListener('click', () => { location.hash = extra.hash; });
        wrap.appendChild(card);
      });

      if (walk.leaf.wizardHash) {
        const wizardCard = el('button', 'help-card help-card--highlight');
        wizardCard.type = 'button';
        wizardCard.appendChild(el('span', 'help-card__title', '▶ Resolver con el wizard'));
        wizardCard.appendChild(el('span', 'help-card__source', 'Comprueba las condiciones, tira por el Nivel de Iniciativa y aplica el resultado.'));
        wizardCard.addEventListener('click', () => { location.hash = walk.leaf.wizardHash; });
        wrap.appendChild(wizardCard);
      }

      const links = await findTablesForLeaf(walk.leaf);
      if (!Router.isCurrent(navToken)) return;
      if (!links.length) {
        wrap.appendChild(el('p', 'pending-note', 'Este resultado todavía no tiene una tabla disponible en la aplicación.'));
      } else {
        const list = el('div', 'help-list');
        links.forEach((link) => {
          const card = el('button', 'help-card');
          card.type = 'button';
          card.appendChild(el('span', 'help-card__title', link.tableId));
          card.appendChild(el('span', 'help-card__source', link.pageTitle ? `Pág. ${link.page} — ${link.pageTitle}` : link.file));
          card.addEventListener('click', () => { location.hash = `#/ayuda/tablas/${link.file}/${link.tableId}`; });
          list.appendChild(card);
        });
        wrap.appendChild(list);
      }
    } else if (walk.node) {
      wrap.appendChild(el('h2', null, walk.node.question));
      const list = el('div', 'help-list');
      walk.node.options.forEach((opt) => {
        const card = el('button', 'help-card');
        card.type = 'button';
        card.appendChild(el('span', 'help-card__title', opt.label));
        card.appendChild(el('span', 'help-card__source', opt.leaf ? 'resultado' : 'más preguntas'));
        card.addEventListener('click', () => {
          location.hash = `#/ayuda/tablas/router/${[...pathValues, opt.value].join('/')}`;
        });
        list.appendChild(card);
      });
      wrap.appendChild(list);
    }

    const row = el('div', 'action-row');
    if (pathValues.length > 0) {
      const stepBackBtn = el('button', 'btn btn--secondary', '← Paso anterior');
      stepBackBtn.type = 'button';
      stepBackBtn.addEventListener('click', () => {
        location.hash = `#/ayuda/tablas/router/${pathValues.slice(0, -1).join('/')}`;
      });
      row.appendChild(stepBackBtn);
      const restartBtn = el('button', 'btn btn--secondary', 'Reiniciar');
      restartBtn.type = 'button';
      restartBtn.addEventListener('click', () => { location.hash = '#/ayuda/tablas/router'; });
      row.appendChild(restartBtn);
    }
    wrap.appendChild(row);
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  async function renderTablesPage(fileName) {
    const navToken = Router.currentToken();
    viewRoot.innerHTML = '<p class="loading">Cargando página…</p>';
    let page;
    let workflowsIdx;
    try {
      [page, workflowsIdx] = await Promise.all([loadTablePage(fileName), loadWorkflowsIndex()]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Tablas', `Pág. ${page.page}`]);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', `Pág. ${page.page} — ${page.title}`));

    // Enlace cruzado tabla → combate por tipo (AGENTS.md §3.2/roadmap Fase 3:
    // "enlaces cruzados entre ayuda, regla y tabla"). Cierra en la dirección
    // que faltaba: Combate por tipo ya enlazaba a sus tablas relacionadas
    // (workflowRefs), pero una tabla no enlazaba de vuelta a su workflow.
    (page.workflowRefs || []).forEach((wfId) => {
      const wf = workflowsIdx.files.find((f) => f.id === wfId);
      if (!wf) return;
      const link = el('button', 'help-card help-card--highlight');
      link.type = 'button';
      link.appendChild(el('span', 'help-card__title', `↩ Ver en "Combate por tipo": ${wf.title}`));
      link.addEventListener('click', () => { location.hash = `#/ayuda/combate/${wfId}`; });
      wrap.appendChild(link);
    });

    appendReviewNotice(wrap, page, {});

    if (page.reusesTable) {
      wrap.appendChild(el('p', 'pending-note', `Esta página reutiliza la tabla «${page.reusesTable.id}», ya transcrita en ${page.reusesTable.definedIn}. ${page.reusesTable.note || ''}`));
      const list = el('div', 'help-list');
      const card = el('button', 'help-card');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', page.reusesTable.id));
      card.addEventListener('click', () => { location.hash = `#/ayuda/tablas/${fileName}/${page.reusesTable.id}`; });
      list.appendChild(card);
      wrap.appendChild(list);
    }

    (page.referenceNotes || []).forEach((note) => {
      const box = el('div', 'pending-note');
      box.appendChild(el('p', null, note.topic));
      if (note.intro) box.appendChild(el('p', 'turn-view__desc', note.intro));
      (note.rows || []).forEach((row) => {
        box.appendChild(el('p', 'turn-view__desc', `${row.condition} → ${row.effect}`));
      });
      if (note.note) box.appendChild(el('p', 'source-refs', note.note));
      wrap.appendChild(box);
    });

    if (page.tables && page.tables.length) {
      const list = el('div', 'help-list');
      page.tables.forEach((table) => {
        const card = el('button', 'help-card');
        card.type = 'button';
        card.appendChild(el('span', 'help-card__title', table.title || table.id));
        card.appendChild(el('span', 'help-card__source', reviewStatusLabel(page, table) || 'verificada/pasada rápida'));
        card.addEventListener('click', () => { location.hash = `#/ayuda/tablas/${fileName}/${table.id}`; });
        list.appendChild(card);
      });
      wrap.appendChild(list);
    }

    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  // AJ-005: transcripción y regla son conceptos distintos. Una tabla puede
  // estar transcrita y verificada contra el PDF y aun así depender de una
  // regla pendiente de validar (ruleStatus/blockingIssues en el índice).
  function reviewStatusLabel(page, table) {
    const parts = [];
    if (page.transcriptionStatus === 'verified') parts.push('transcripción verificada');
    if (page.ruleStatus === 'needs_review') parts.push('regla pendiente de validar');
    else if (page.ruleStatus === 'resolved') parts.push('regla validada');
    if (!parts.length && (page.needsReview || (table && table.needsReview))) parts.push('pendiente de revisión');
    return parts.join(' · ');
  }

  function appendReviewNotice(wrap, page, table) {
    if (page.ruleStatus === 'needs_review') {
      const box = el('div', 'pending-note');
      box.appendChild(el('p', null, `${reviewStatusLabel(page)}. Los datos de la tabla coinciden con el PDF; lo pendiente es una regla de uso que afecta al cálculo:`));
      (page.blockingIssues || []).forEach((issue) => box.appendChild(el('p', 'turn-view__desc', `• ${issue}`)));
      wrap.appendChild(box);
    } else if (!page.ruleStatus && table.needsReview) {
      wrap.appendChild(el('p', 'pending-note', 'Pendiente de revisión: esta tabla tiene ambigüedades (esquemas de columna superpuestos o celdas dudosas) pendientes de una pasada de verificación a alta resolución. Úsala con precaución.'));
    }
  }

  async function renderTableViewer(fileName, tableId) {
    const navToken = Router.currentToken();
    viewRoot.innerHTML = '<p class="loading">Cargando tabla…</p>';
    let loaded;
    try {
      loaded = await loadTableById(fileName, tableId);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;
    const { table } = loaded;

    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Tablas', `Pág. ${loaded.page.page}`, table.title || table.id]);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail table-viewer');
    wrap.appendChild(el('h1', 'help-detail__title', table.title || table.id));

    appendReviewNotice(wrap, loaded.page, table);

    const rowSchemes = ['values'].concat(Object.keys(table.rowAxis.alternateLabels || {}), Object.keys(table.rowAxis.variants || {}));
    const columnSchemes = ['values'].concat(Object.keys(table.columnAxis.alternateLabelSets || {}), Object.keys(table.columnAxis.variants || {}));
    const rowIsPlaceholder = TableEngine.isPlaceholderScheme(table.rowAxis.values);
    const columnIsPlaceholder = TableEngine.isPlaceholderScheme(table.columnAxis.values);

    const form = el('div', 'table-viewer__controls');

    function makeSelect(labelText, options, defaultIndex) {
      const field = el('label', 'table-viewer__field');
      field.appendChild(el('span', null, labelText));
      const select = document.createElement('select');
      select.className = 'table-viewer__select';
      options.forEach((opt, i) => {
        const optionEl = document.createElement('option');
        optionEl.value = opt;
        optionEl.textContent = opt;
        if (i === defaultIndex) optionEl.selected = true;
        select.appendChild(optionEl);
      });
      field.appendChild(select);
      return { field, select };
    }

    const rowSchemeField = rowSchemes.length > 1
      ? makeSelect('Esquema de fila', rowSchemes, rowIsPlaceholder ? 1 : 0)
      : null;
    const columnSchemeField = columnSchemes.length > 1
      ? makeSelect('Esquema de columna', columnSchemes, columnIsPlaceholder ? 1 : 0)
      : null;
    if (rowSchemeField) form.appendChild(rowSchemeField.field);
    if (columnSchemeField) form.appendChild(columnSchemeField.field);

    function currentRowScheme() {
      const val = rowSchemeField ? rowSchemeField.select.value : 'values';
      return val === 'values' ? undefined : val;
    }
    function currentColumnScheme() {
      const val = columnSchemeField ? columnSchemeField.select.value : 'values';
      return val === 'values' ? undefined : val;
    }

    let rowValueField = null;
    let columnValueField = null;
    const resultBox = el('div', 'table-viewer__result');
    const gridHost = el('div', 'table-viewer__grid-host');

    function currentLabels(axis, scheme) {
      return TableEngine.pickAxisLabels(axis, scheme);
    }

    function rebuildValueSelectors() {
      const rowLabels = currentLabels(table.rowAxis, currentRowScheme());
      const columnLabels = currentLabels(table.columnAxis, currentColumnScheme());

      if (rowValueField) rowValueField.field.remove();
      if (columnValueField) columnValueField.field.remove();
      // Etiquetas repetidas (p.ej. varias columnas "." de relleno en un esquema
      // needsReview) resolverían siempre al primer índice; se deduplican solo
      // en el selector para no ofrecer opciones indistinguibles entre sí.
      rowValueField = makeSelect(`Fila (${table.rowAxis.label})`, Array.from(new Set(rowLabels)), 0);
      columnValueField = makeSelect(`Columna (${table.columnAxis.label})`, Array.from(new Set(columnLabels)), 0);
      form.appendChild(rowValueField.field);
      form.appendChild(columnValueField.field);
      rowValueField.select.addEventListener('change', resolveAndRender);
      columnValueField.select.addEventListener('change', resolveAndRender);
    }

    function resolveAndRender() {
      gridHost.innerHTML = '';
      resultBox.innerHTML = '';
      const opts = { rowScheme: currentRowScheme(), columnScheme: currentColumnScheme() };
      const rowLabels = currentLabels(table.rowAxis, opts.rowScheme);
      const columnLabels = currentLabels(table.columnAxis, opts.columnScheme);

      let result = null;
      let error = null;
      try {
        result = TableEngine.resolveCell(table, rowValueField.select.value, columnValueField.select.value, opts);
      } catch (err) {
        error = err;
      }

      gridHost.appendChild(renderGrid(table, rowLabels, columnLabels, result));

      if (error) {
        resultBox.appendChild(el('p', 'pending-note', `${error.code}: ${error.message}`));
        return;
      }
      resultBox.appendChild(el('p', 'table-viewer__value', `Resultado: ${result.isMissingData ? 'sin dato transcrito: el cálculo se detiene aquí' : result.displayValue}`));
      TableEngine.describeResolution(table, result).forEach((line) => {
        resultBox.appendChild(el('p', 'source-refs', line));
      });
    }

    rebuildValueSelectors();
    if (rowSchemeField) rowSchemeField.select.addEventListener('change', rebuildValueSelectors);
    if (columnSchemeField) columnSchemeField.select.addEventListener('change', rebuildValueSelectors);
    // Al cambiar de esquema hay que volver a resolver con las nuevas opciones disponibles.
    if (rowSchemeField) rowSchemeField.select.addEventListener('change', resolveAndRender);
    if (columnSchemeField) columnSchemeField.select.addEventListener('change', resolveAndRender);

    wrap.appendChild(form);
    wrap.appendChild(resultBox);
    wrap.appendChild(gridHost);

    resolveAndRender();

    if (table.notes && table.notes.length) {
      const notesBox = el('div', 'pending-note');
      table.notes.forEach((note) => notesBox.appendChild(el('p', 'turn-view__desc', note)));
      wrap.appendChild(notesBox);
    }
    wrap.appendChild(el('p', 'source-refs', `Fuente: ${(table.sourceRefs || []).map((r) => `${r.document}, pág. ${r.page}${r.section ? ' — ' + r.section : ''}`).join(' · ')}`));

    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.HelpTablas = { renderTablesIndex, renderTableRouter, renderTablesPage, renderTableViewer };
})(typeof window !== 'undefined' ? window : globalThis);
