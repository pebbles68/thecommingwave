// Wizard: Emboscada de submarino (roadmap Fase 13; data/rules/submarine-ambush.json +
// public/js/submarine-ambush-engine.js). Decision Book §9.16 (pp. 219-220): comprueba si un
// submarino Oculto puede iniciar la Emboscada y enseña su secuencia de resolución.
//
// El mapa no está modelado: el jugador declara dónde está la formación objetivo y qué hace.
// El texto de las reglas se lee del JSON; la decisión (puede o no puede, y por qué) vive en el motor.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadSubmarineAmbush,
    makeTextField, makeOptionGroup,
    wizardActionRow, wizardNavButton
  } = AppCore;

  const WIZARD_STEPS = ['Submarino', 'Formación objetivo', 'Resultado'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return { step: 0, subLabel: '', subState: '', subType: '', alreadyAmbushed: '', relation: '', event: '', hasAmmo: '' };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 2;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'submarine-ambush', type: 'submarine_ambush', getState: () => state });
  const unlinkTurnContext = () => lifecycle.unlink();

  const labelOf = (list, value) => (list.find((o) => o.value === value) || {}).label || '';

  function evaluate() {
    return SubmarineAmbushEngine.evaluateAmbush({
      subState: state.subState, subType: state.subType, alreadyAmbushed: state.alreadyAmbushed,
      relation: state.relation, event: state.event, hasAmmo: state.hasAmmo
    });
  }

  async function renderSubmarineAmbushWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('submarine-ambush', state, freshState);
    lifecycle.link('Emboscada de submarino');
    AppCore.persistWizardDraft('submarine-ambush', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Emboscada de submarino']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let rules;
    try {
      rules = await loadSubmarineAmbush();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Emboscada de submarino'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §9.16 (págs. 219-220). Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.'));

    const rerender = () => { renderSubmarineAmbushWizard(); };

    AppCore.mountWizardDraft('submarine-ambush', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    [
      () => renderStepSubmarine(wrap, rules, rerender),
      () => renderStepTarget(wrap, rules, rerender),
      () => renderStepResult(wrap, rules, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Submarino ----------
  function renderStepSubmarine(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Submarino'));
    wrap.appendChild(el('p', 'turn-view__desc', rules.intro));
    wrap.appendChild(makeTextField('Submarino (opcional)', state.subLabel, (v) => { state.subLabel = v; }));
    wrap.appendChild(makeOptionGroup({ prompt: '¿En qué estado está el submarino?', options: rules.subStates }, state.subState, (v) => { state.subState = v; rerender(); }));
    if (state.subState === 'exposed') wrap.appendChild(el('p', 'pending-note', rules.reasons.not_hidden));
    wrap.appendChild(makeOptionGroup({ prompt: '¿Es un submarino convencional o nuclear?', options: rules.subTypes.map((t) => ({ value: t.value, label: t.label })) }, state.subType, (v) => { state.subType = v; rerender(); }));
    const type = rules.subTypes.find((t) => t.value === state.subType);
    if (type) wrap.appendChild(el('p', 'source-refs', type.zoneText));
    wrap.appendChild(makeOptionGroup({ prompt: '¿Ya ha hecho una Emboscada en esta Fase de Acciones de Superficie?', options: YES_NO }, state.alreadyAmbushed, (v) => { state.alreadyAmbushed = v; rerender(); }));
    if (state.alreadyAmbushed === 'yes') wrap.appendChild(el('p', 'pending-note', rules.reasons.already_ambushed));
    wrap.appendChild(el('p', 'source-refs', rules.notModeled));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!state.subState || !state.subType || !state.alreadyAmbushed) { alert('Indica el estado, el tipo del submarino y si ya ha emboscado en esta fase.'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Formación objetivo ----------
  function renderStepTarget(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Formación objetivo'));
    wrap.appendChild(makeOptionGroup({ prompt: '¿Dónde está la formación de superficie respecto del submarino?', options: rules.relations }, state.relation, (v) => { state.relation = v; rerender(); }));
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué hace la formación de superficie?', options: rules.events }, state.event, (v) => { state.event = v; rerender(); }));
    wrap.appendChild(makeOptionGroup({ prompt: '¿El submarino tiene munición correspondiente para atacar?', options: YES_NO }, state.hasAmmo, (v) => { state.hasAmmo = v; rerender(); }));

    const result = evaluate();
    if (result.eligible === false) result.reasons.forEach((k) => wrap.appendChild(el('p', 'pending-note', rules.reasons[k])));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!state.relation || !state.event || !state.hasAmmo) { alert('Responde a las preguntas sobre la formación objetivo.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Resultado ----------
  function renderStepResult(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const result = state.subState && state.subType && state.alreadyAmbushed && state.relation && state.event
      ? evaluate() : { eligible: null, reasons: [] };
    if (result.eligible === null) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const type = rules.subTypes.find((t) => t.value === state.subType);
    const who = state.subLabel ? `Submarino ${type.label.toLowerCase()} «${state.subLabel}»` : `Submarino ${type.label.toLowerCase()}`;
    const summaryLines = [
      `${who}, estado ${labelOf(rules.subStates, state.subState).toLowerCase()}.`,
      `Formación objetivo: ${labelOf(rules.relations, state.relation).toLowerCase()}; ${labelOf(rules.events, state.event).toLowerCase()}.`
    ];
    result.reasons.forEach((k) => summaryLines.push(rules.reasons[k]));
    const resultText = result.eligible ? 'el submarino puede iniciar la Emboscada' : 'el submarino no puede iniciar la Emboscada';

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));

    const sequenceLines = [];
    if (result.eligible) {
      wrap.appendChild(el('h3', null, 'Secuencia de la Emboscada'));
      const list = el('ol', 'wizard-sequence');
      const steps = rules.steps.slice();
      if (!result.mayAttackWithAmmo) steps.splice(4, 0, rules.noAmmoStep);
      steps.forEach((s) => {
        const li = el('li', null, s.text);
        if (s.link) {
          li.appendChild(document.createTextNode(' '));
          const a = el('a', 'btn btn--secondary', `▶ ${s.link.label}`);
          a.href = s.link.hash;
          li.appendChild(a);
        }
        list.appendChild(li);
        sequenceLines.push(s.text);
      });
      wrap.appendChild(list);
    }
    rules.afterRules.forEach((t) => wrap.appendChild(el('p', 'source-refs', t)));
    wrap.appendChild(el('p', 'source-refs', rules.notModeled));

    const fullSummaryText = ['Emboscada de submarino', ...summaryLines, `Resultado: ${resultText}`, ...sequenceLines.map((t, i) => `${i + 1}. ${t}`)].join('\n');
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
      saveResolutionToHistory({ workflowId: 'submarine_ambush', workflowTitle: 'Emboscada de submarino', summaryText: fullSummaryText, state });
      unlinkTurnContext(state);
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => { unlinkTurnContext(state); state = freshState(); rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.SubmarineAmbushWizard = { render: renderSubmarineAmbushWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
