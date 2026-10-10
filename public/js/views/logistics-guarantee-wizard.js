// Wizard: Verificación de Garantía Logística (roadmap Fase 14;
// data/rules/logistics-guarantee.json + public/js/logistics-guarantee-engine.js).
// Decision Book §11.2-§11.5 (pp. 234-237): una unidad obtiene garantía
// logística si puede conectarse a un Nodo de Suministro mediante una Línea de
// Comunicación; si no, sufre las consecuencias de su tipo (§11.5).
//
// El mapa no está modelado: el jugador declara el origen de la línea, los
// bordes con Restricción de Movimiento y los hexágonos con unidades o control
// enemigo. El texto de las reglas se lee del JSON de reglas; la decisión
// (con/sin suministros y por qué) vive en el motor puro.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadLogisticsGuarantee,
    makeTextField, makeOptionGroup,
    wizardActionRow, wizardNavButton
  } = AppCore;

  const WIZARD_STEPS = ['Unidad', 'Línea de Comunicación', 'Resultado'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return {
      step: 0,
      unitLabel: '',
      unitType: '',
      carrier: '',
      nodeKind: '',
      answers: { node_enemy_controlled: '', blocked_edge: '', enemy_units_on_path: '', tactical_containment: '', enemy_controlled_on_path: '' },
      turnResolutionId: null
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 2;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'logistics-guarantee', type: 'logistics_guarantee', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  const questionOf = (rules, id) => rules.questions.find((q) => q.id === id);
  const unitTypeOf = (rules) => rules.unitTypes.find((u) => u.id === state.unitType);

  function evaluate() {
    return LogisticsGuaranteeEngine.evaluateGuarantee({
      unitType: state.unitType, carrier: state.carrier, nodeKind: state.nodeKind,
      nodeEnemyControlled: state.answers.node_enemy_controlled, blockedEdge: state.answers.blocked_edge,
      enemyUnitsOnPath: state.answers.enemy_units_on_path, tacticalContainment: state.answers.tactical_containment,
      enemyControlledOnPath: state.answers.enemy_controlled_on_path
    });
  }

  function unitReady() {
    return state.unitType !== '' && (state.unitType !== 'airfield' || state.carrier !== '');
  }

  async function renderLogisticsGuaranteeWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('logistics-guarantee', state, freshState);
    linkToTurnContextIfNeeded(state, 'Verificación de garantía logística');
    AppCore.persistWizardDraft('logistics-guarantee', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Garantía logística']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let rules;
    try {
      rules = await loadLogisticsGuarantee();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Verificación de garantía logística'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §11.2-§11.5 (págs. 234-237). Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.'));

    const rerender = () => { renderLogisticsGuaranteeWizard(); };

    AppCore.mountWizardDraft('logistics-guarantee', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    [
      () => renderStepUnit(wrap, rules, rerender),
      () => renderStepLine(wrap, rules, rerender),
      () => renderStepResult(wrap, rules, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Unidad ----------
  function renderStepUnit(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Unidad'));
    wrap.appendChild(el('p', 'turn-view__desc', rules.intro));
    wrap.appendChild(makeTextField('Unidad o instalación (opcional)', state.unitLabel, (v) => { state.unitLabel = v; }));
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué unidad o instalación necesita garantía logística?', options: rules.unitTypes.map((u) => ({ value: u.id, label: u.label })) }, state.unitType, (v) => { state.unitType = v; if (v !== 'airfield') state.carrier = ''; rerender(); }));
    if (state.unitType === 'airfield') {
      wrap.appendChild(makeOptionGroup({ prompt: '¿Es el aeródromo de un portaaviones o buque de asalto anfibio?', options: YES_NO }, state.carrier, (v) => { state.carrier = v; rerender(); }));
      wrap.appendChild(el('p', 'source-refs', unitTypeOf(rules).carrierException));
    }
    wrap.appendChild(el('p', 'source-refs', rules.notModeled));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!unitReady()) { alert('Elige el tipo de unidad (y, si es un aeródromo, si es de portaaviones o buque de asalto anfibio).'); return; }
        state.step = state.unitType === 'airfield' && state.carrier === 'yes' ? 2 : 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Línea de Comunicación ----------
  function renderStepLine(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Línea de Comunicación'));
    const qNode = questionOf(rules, 'node_kind');
    wrap.appendChild(makeOptionGroup({ prompt: qNode.prompt, options: qNode.options.map((o) => ({ value: o.value, label: o.label })) }, state.nodeKind, (v) => { state.nodeKind = v; rerender(); }));
    const chosen = qNode.options.find((o) => o.value === state.nodeKind);
    if (chosen) wrap.appendChild(el('p', 'source-refs', chosen.text));

    if (state.nodeKind === 'advanced' || state.nodeKind === 'ordinary') {
      ['node_enemy_controlled', 'blocked_edge', 'enemy_units_on_path', 'tactical_containment', 'enemy_controlled_on_path'].forEach((id) => {
        const q = questionOf(rules, id);
        if (q.showIf && state.answers[q.showIf.questionId] !== q.showIf.equals) return;
        wrap.appendChild(makeOptionGroup({ prompt: q.prompt, options: YES_NO }, state.answers[id], (v) => { state.answers[id] = v; rerender(); }));
        if (state.answers[id] === 'yes') wrap.appendChild(el('p', 'source-refs', q.yesText));
      });
    }

    const result = evaluate();
    if (result.guaranteed === false) {
      result.reasons.forEach((k) => wrap.appendChild(el('p', 'pending-note', rules.reasons[k])));
    }
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (result.guaranteed === null) { alert('Responde a las preguntas de la Línea de Comunicación.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Resultado ----------
  function renderStepResult(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const result = unitReady() ? evaluate() : { guaranteed: null, reasons: [], pending: [] };
    if (result.guaranteed === null) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const unit = unitTypeOf(rules);
    const who = state.unitLabel ? `${unit.label} «${state.unitLabel}»` : unit.label;
    const summaryLines = [`${who}.`];
    if (result.exempt) {
      summaryLines.push(rules.reasons.carrier_exception);
    } else {
      summaryLines.push(`Origen de la línea: ${questionOf(rules, 'node_kind').options.find((o) => o.value === state.nodeKind).label}.`);
      result.reasons.forEach((k) => summaryLines.push(rules.reasons[k]));
    }
    const resultText = result.guaranteed ? 'con suministros (tiene garantía logística)' : 'sin suministros (no tiene garantía logística)';

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    if (!result.guaranteed) {
      wrap.appendChild(el('h3', null, `Consecuencias para: ${unit.label}`));
      wrap.appendChild(el('p', 'turn-view__desc', unit.withoutGuarantee));
    }
    rules.afterRules.forEach((t) => wrap.appendChild(el('p', 'source-refs', t)));
    wrap.appendChild(el('p', 'source-refs', rules.notModeled));

    const fullSummaryText = ['Verificación de garantía logística', ...summaryLines, `Resultado: ${resultText}`, ...(result.guaranteed ? [] : [unit.withoutGuarantee])].join('\n');
    const shareRow = el('div', 'action-row');
    const copyBtn = el('button', 'btn btn--secondary', '📋 Copiar resumen');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => {
      copyTextToClipboard(fullSummaryText).then((ok) => {
        copyBtn.textContent = ok ? '✓ Copiado' : 'No se pudo copiar';
        setTimeout(() => { copyBtn.textContent = '📋 Copiar resumen'; }, 2000);
      });
    });
    shareRow.appendChild(copyBtn);
    const saveBtn = el('button', 'btn btn--secondary', '💾 Guardar en historial');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => {
      saveResolutionToHistory({ workflowId: 'logistics_guarantee', workflowTitle: 'Verificación de garantía logística', summaryText: fullSummaryText, state });
      unlinkTurnContext(state);
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = result.exempt ? 0 : 1; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => { unlinkTurnContext(state); state = freshState(); rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.LogisticsGuaranteeWizard = { render: renderLogisticsGuaranteeWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
