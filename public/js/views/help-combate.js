// Ayuda de "Combate por tipo" (roadmap Fase 3), dividida de views/help.js en
// correcciones03.md COR03-006 (2026-09-29). Referencia de solo lectura de
// los 13 workflows ya transcritos en data/workflows/ (AGENTS.md §3.2: la
// consulta rápida no debe iniciar una resolución por sí sola). Distinta del
// wizard interactivo y del router de tablas (Fase 6, que hace preguntas para
// LLEGAR a una tabla): aquí se explican de un vistazo las etapas, preguntas,
// efectos y reglas especiales de cada tipo de combate. `renderIconChip` vive
// en core.js (AppCore) porque la Ayuda de Munición también lo usa.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, renderNotFound, backRow,
    loadTablesIndex, loadWorkflowsIndex, loadWorkflow, loadWorkflowCoverage,
    WORKFLOW_WIZARD_HASHES, RELATED_WORKFLOW_WIZARDS, renderIconChip
  } = AppCore;

  const COMBAT_CATEGORY_LABELS = {
    terrestre: 'Terrestre',
    aereo: 'Aéreo',
    superficie: 'Superficie',
    asw: 'Antisubmarino (ASW)',
    estrategico: 'Estratégico'
  };

  function formatEffectSummary(effect) {
    const typeLabel = { modifier: 'Modificador', rule: 'Regla', dice: 'Dado', range: 'Rango' }[effect.type] || effect.type;
    const value = typeof effect.value === 'number' && effect.value >= 0 && effect.type === 'modifier' ? `+${effect.value}` : effect.value;
    const parts = [`${typeLabel} (${effect.target}): ${value}`];
    if (effect.haltsWorkflow) parts.push('detiene el flujo');
    if (effect.cutsStage) parts.push('corta esta etapa');
    return parts.join(' — ');
  }

  // Estado de la capacidad en la aplicación (AJ-004), desde la matriz de cobertura.
  function appendCoverageBox(wrap, coverage, workflowId) {
    const cov = coverage && coverage.workflows.find((w) => w.workflowId === workflowId);
    if (!cov) return;
    const box = el('div', 'help-card help-card--highlight coverage-box');
    box.appendChild(el('span', 'help-card__title', `Estado en la aplicación: ${coverage.statusLabels[cov.status]}`));
    box.appendChild(el('span', 'help-card__source', `Resultado: ${coverage.resultApplication[cov.resultApplication]}`));
    if (cov.stagesNotCovered.length) {
      box.appendChild(el('span', 'help-card__source', `Etapas sin cubrir: ${cov.stagesNotCovered.map((s) => s.reason).join(' ')}`));
    }
    cov.gaps.forEach((g) => box.appendChild(el('span', 'help-card__source', `${coverage.gapKindLabels[g.kind]}: ${g.text}`)));
    wrap.appendChild(box);
  }

  async function renderCombateIndex() {
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Combate por tipo']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    const [index, coverage] = await Promise.all([loadWorkflowsIndex(), loadWorkflowCoverage().catch(() => null)]);
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', 'Combate por tipo'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Referencia de las etapas, preguntas y reglas especiales de cada tipo de combate — sin iniciar ninguna resolución. Para resolver un ataque real, usa el router de Tablas o el wizard.'));

    // Agrupa por categoría (no por orden de aparición en el índice): la
    // categoría 'asw' no es contigua en data/workflows/index.json (workflow
    // 13 llega después de 'estrategico'), así que agrupar sobre la marcha
    // duplicaría la cabecera en vez de mostrar un único grupo por categoría.
    const byCategory = new Map();
    index.files.forEach((wf) => {
      if (!byCategory.has(wf.category)) byCategory.set(wf.category, []);
      byCategory.get(wf.category).push(wf);
    });
    byCategory.forEach((workflows, category) => {
      wrap.appendChild(el('h2', 'table-viewer__section-title', COMBAT_CATEGORY_LABELS[category] || category));
      const list = el('div', 'help-list');
      workflows.forEach((wf) => {
        const card = el('button', 'help-card');
        card.type = 'button';
        card.appendChild(el('span', 'help-card__title', wf.title));
        const cov = coverage && coverage.workflows.find((w) => w.workflowId === wf.id);
        if (cov) card.appendChild(el('span', 'help-card__source', coverage.statusLabels[cov.status]));
        card.addEventListener('click', () => { location.hash = `#/ayuda/combate/${wf.id}`; });
        list.appendChild(card);
      });
      wrap.appendChild(list);
    });
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  async function renderCombateDetail(workflowId) {
    const navToken = Router.currentToken();
    const index = await loadWorkflowsIndex();
    if (!Router.isCurrent(navToken)) return;
    const entry = index.files.find((wf) => wf.id === workflowId);
    if (!entry) { renderNotFound(`Tipo de combate «${workflowId}» no encontrado`); return; }
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';

    let workflow;
    let tablesIdx;
    let coverage = null;
    try {
      [workflow, tablesIdx, coverage] = await Promise.all([loadWorkflow(entry.file), loadTablesIndex(), loadWorkflowCoverage().catch(() => null)]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Combate por tipo', workflow.title]);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', workflow.title));
    const sourceLine = workflow.source ? `${workflow.source.document}${workflow.source.pages ? ` — págs. ${workflow.source.pages}` : ''}` : '';
    wrap.appendChild(el('p', 'source-refs', sourceLine));
    if (workflow.summary) wrap.appendChild(el('p', 'turn-view__desc', workflow.summary));
    appendCoverageBox(wrap, coverage, workflowId);
    if (workflow.representativeIcon) {
      const iconsRow = el('div', 'ammo-icon-row');
      iconsRow.appendChild(renderIconChip(workflow.representativeIcon));
      wrap.appendChild(iconsRow);
    }

    if (WORKFLOW_WIZARD_HASHES[workflowId]) {
      const wizardHash = WORKFLOW_WIZARD_HASHES[workflowId];
      const wizardCard = el('button', 'help-card help-card--highlight');
      wizardCard.type = 'button';
      wizardCard.appendChild(el('span', 'help-card__title', '▶ Resolver con el wizard de combate'));
      wizardCard.appendChild(el('span', 'help-card__source', 'Pregunta los modificadores y llega a la tabla final ya posicionada.'));
      wizardCard.addEventListener('click', () => { location.hash = wizardHash; });
      wrap.appendChild(wizardCard);
    }
    (RELATED_WORKFLOW_WIZARDS[workflowId] || []).forEach((extra) => {
      const card = el('button', 'help-card help-card--highlight');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', extra.title));
      card.appendChild(el('span', 'help-card__source', extra.desc));
      card.addEventListener('click', () => { location.hash = extra.hash; });
      wrap.appendChild(card);
    });

    (workflow.stages || []).forEach((stage) => {
      wrap.appendChild(el('h2', null, `${stage.order}. ${stage.title}`));
      if (stage.tableReference) wrap.appendChild(el('p', 'source-refs', stage.tableReference));
      if (stage.specialRules) wrap.appendChild(el('p', 'pending-note', stage.specialRules));

      (stage.questions || []).forEach((q) => {
        const qBox = el('div', 'wizard-question');
        qBox.appendChild(el('p', 'wizard-question__prompt', q.prompt));
        if (q.showIf) qBox.appendChild(el('p', 'source-refs', `Solo si «${q.showIf.questionId}» = «${q.showIf.equals}».`));
        if (q.iconRefs && q.iconRefs.length) {
          const iconsRow = el('div', 'ammo-icon-row');
          q.iconRefs.forEach((ref) => iconsRow.appendChild(renderIconChip(ref.ref)));
          qBox.appendChild(iconsRow);
        }
        (q.options || []).forEach((opt) => {
          const optLine = el('p', 'source-refs', `${opt.label}: ${(opt.effects || []).map(formatEffectSummary).join('; ') || '(sin efecto declarado)'}`);
          qBox.appendChild(optLine);
        });
        wrap.appendChild(qBox);
      });
    });

    const extras = [];
    if (workflow.flowCuts && workflow.flowCuts.length) extras.push(`${workflow.flowCuts.length} corte(s) de flujo (flowCuts): la respuesta a una pregunta puede saltar una etapa o detener el ataque antes de llegar a la tabla.`);
    if (workflow.diceRules && workflow.diceRules.length) extras.push(`${workflow.diceRules.length} regla(s) de dados explícitas (diceRules).`);
    if (workflow.rollDependentRules && workflow.rollDependentRules.length) extras.push(`${workflow.rollDependentRules.length} regla(s) dependientes de la tirada final (rollDependentRules).`);
    if (extras.length) {
      wrap.appendChild(el('h2', 'table-viewer__section-title', 'Reglas adicionales'));
      extras.forEach((e) => wrap.appendChild(el('p', 'pending-note', e)));
    }
    if (workflow.finalTableReference) wrap.appendChild(el('p', 'source-refs', `Tabla final: ${workflow.finalTableReference}`));

    const relatedPages = tablesIdx.pages.filter((p) => (p.workflowRefs || []).includes(workflowId));
    if (relatedPages.length) {
      wrap.appendChild(el('h2', 'table-viewer__section-title', 'Tablas relacionadas'));
      const list = el('div', 'help-list');
      relatedPages.forEach((p) => {
        const card = el('button', 'help-card');
        card.type = 'button';
        card.appendChild(el('span', 'help-card__title', `Pág. ${p.page} — ${p.title}`));
        card.appendChild(el('span', 'help-card__source', `${p.tableIds.length} tabla(s)`));
        card.addEventListener('click', () => { location.hash = `#/ayuda/tablas/${p.file}`; });
        list.appendChild(card);
      });
      wrap.appendChild(list);
    }

    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.HelpCombate = { renderCombateIndex, renderCombateDetail };
})(typeof window !== 'undefined' ? window : globalThis);
