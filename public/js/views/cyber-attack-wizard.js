// Wizard: Ataque cibernético (roadmap Fase 14, regla opcional; data/rules/cyber-attack.json +
// public/js/cyber-attack-engine.js). Decision Book §14.2-§14.4 (págs. 244-246).
//
// Las tiradas son físicas: el jugador escribe los resultados de sus d10 y la aplicación los clasifica con la
// tabla transcrita de la página 32 (columna «Guerra Cibernética»); el motor calcula tiradas y éxitos finales.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadCyberAttack, loadTablePage,
    makeTextField, makeNumberField, makeOptionGroup,
    wizardActionRow, wizardNavButton
  } = AppCore;

  const WIZARD_STEPS = ['Objetivo', 'Defensa', 'Tiradas', 'Resultado'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return {
      step: 0, label: '', target: '', restricted: '', attackPoints: '',
      defenseUsed: '', defensePoints: '', defenseDice: '', attackDice: ''
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 3;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'cyber-attack', type: 'cyber_attack', getState: () => state });
  const unlinkTurnContext = () => lifecycle.unlink();

  const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? NaN : Number(v));
  const targetOf = (rules) => rules.targets.find((t) => t.value === state.target);

  let table = null;

  // Clasifica con la tabla de la página 32 los d10 escritos; null si el texto no es válido.
  function tally(text) {
    const rolls = StrategicActionsEngine.parseRolls(text);
    if (rolls === null || !table) return null;
    return { rolls, ...StrategicActionsEngine.tallyRolls(table, 'cyber', rolls) };
  }

  function evaluate() {
    const dT = state.defenseUsed === 'yes' ? tally(state.defenseDice) : { rolls: [], successes: 0, failures: 0 };
    const defense = CyberAttackEngine.evaluateCyberAttack({
      restricted: state.restricted || 'no', attackPoints: num(state.attackPoints), defenseUsed: state.defenseUsed,
      defensePoints: num(state.defensePoints),
      defenseSuccesses: dT ? dT.successes : NaN, defenseFailures: dT ? dT.failures : NaN,
      attackSuccesses: NaN, attackFailures: NaN
    });
    const aT = tally(state.attackDice);
    // Cada tirada exige un d10 escrito: el recuento tiene que ser exacto antes de dar un resultado.
    const exact = dT && aT && defense.attackRolls !== null && (state.defenseUsed !== 'yes' || dT.rolls.length === defense.defenseRolls) && aT.rolls.length === defense.attackRolls;
    if (!exact) return { ...defense, ok: defense.ok === false ? false : null, netSuccesses: null, success: null };
    return CyberAttackEngine.evaluateCyberAttack({
      restricted: state.restricted || 'no', attackPoints: num(state.attackPoints), defenseUsed: state.defenseUsed,
      defensePoints: num(state.defensePoints), defenseSuccesses: dT.successes, defenseFailures: dT.failures,
      attackSuccesses: aT.successes, attackFailures: aT.failures
    });
  }

  async function renderCyberAttackWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('cyber-attack', state, freshState);
    lifecycle.link('Ataque cibernético');
    AppCore.persistWizardDraft('cyber-attack', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Ataque cibernético']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let rules;
    try {
      rules = await loadCyberAttack();
      const page = await loadTablePage(rules.table.file);
      table = page.tables.find((t) => t.id === rules.table.id);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Ataque cibernético'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §14.2-§14.4 (págs. 244-246), regla opcional. Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.'));
    if (!RuleProfileEngine.isAvailable({ optionalRule: true }, AppCore.loadRuleProfile())) {
      wrap.appendChild(el('p', 'pending-note', 'Es una regla opcional y tu perfil de reglas no la tiene activada. Puedes usarla igualmente, pero recuerda activarla si la partida la incluye.'));
      const link = el('button', 'btn btn--secondary', 'Cambiar el perfil de reglas');
      link.type = 'button';
      link.addEventListener('click', () => { location.hash = '#/perfil-reglas'; });
      wrap.appendChild(link);
    }

    const rerender = () => { renderCyberAttackWizard(); };
    AppCore.mountWizardDraft('cyber-attack', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    [
      () => renderStepTarget(wrap, rules, rerender),
      () => renderStepDefense(wrap, rules, rerender),
      () => renderStepRolls(wrap, rules, rerender),
      () => renderStepResult(wrap, rules, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Objetivo ----------
  function renderStepTarget(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Objetivo'));
    wrap.appendChild(el('p', 'turn-view__desc', rules.intro));
    wrap.appendChild(makeTextField('Objetivo concreto (opcional)', state.label, (v) => { state.label = v; }));
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué sistema es el objetivo del ciberataque?', options: rules.targets.map((t) => ({ value: t.value, label: t.label })) }, state.target, (v) => { state.target = v; state.restricted = ''; rerender(); }));
    const target = targetOf(rules);
    if (target && target.restriction) {
      wrap.appendChild(makeOptionGroup({ prompt: target.restriction.question, options: YES_NO }, state.restricted, (v) => { state.restricted = v; rerender(); }));
      if (state.restricted === 'yes') wrap.appendChild(el('p', 'pending-note', target.restriction.text));
    }
    wrap.appendChild(makeNumberField('Puntos de Capacidad de Guerra Cibernética que gasta el atacante', state.attackPoints, (v) => { state.attackPoints = v; }, rerender, { visualRef: 'cyber-capacity-points' }));
    wrap.appendChild(el('p', 'source-refs', rules.texts.capacity_spent));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!target || (target.restriction && !state.restricted) || !Number.isInteger(num(state.attackPoints)) || num(state.attackPoints) < 1) {
          alert('Elige el sistema atacado, responde a la restricción si la hay e indica al menos 1 punto de Capacidad.');
          return;
        }
        state.step = state.restricted === 'yes' ? 3 : 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Defensa ----------
  function renderStepDefense(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Defensa'));
    wrap.appendChild(makeOptionGroup({ prompt: '¿El defensor invierte Capacidad de Guerra Cibernética para defenderse?', options: YES_NO }, state.defenseUsed, (v) => { state.defenseUsed = v; rerender(); }));
    if (state.defenseUsed === 'yes') {
      wrap.appendChild(makeNumberField('Puntos de Capacidad de Guerra Cibernética que gasta el defensor', state.defensePoints, (v) => { state.defensePoints = v; }, rerender, { visualRef: 'cyber-capacity-points' }));
      wrap.appendChild(el('p', 'source-refs', rules.texts.defense_note));
    }
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!state.defenseUsed || (state.defenseUsed === 'yes' && !(num(state.defensePoints) >= 1))) { alert('Indica si hay defensa y, en ese caso, cuántos puntos gasta.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Tiradas ----------
  function diceField(wrap, label, key, rerender) {
    wrap.appendChild(makeTextField(label, state[key], (v) => { state[key] = v; }, rerender));
  }

  function renderStepRolls(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Tiradas'));
    wrap.appendChild(el('p', 'turn-view__desc', rules.texts.dice_reading));
    wrap.appendChild(wizardNavButton('Ver la tabla (pág. 32)', 'secondary', () => { location.hash = rules.table.hash; }));
    const defenseRolls = state.defenseUsed === 'yes' ? CyberAttackEngine.baseRolls(num(state.defensePoints)) : 0;
    const dT = state.defenseUsed === 'yes' ? tally(state.defenseDice) : { rolls: [], successes: 0, failures: 0 };
    if (state.defenseUsed === 'yes') {
      wrap.appendChild(el('h3', null, `Defensa: ${defenseRolls} tiradas de 1d10`));
      wrap.appendChild(el('p', 'source-refs', rules.texts.defense_rule));
      diceField(wrap, 'Resultados de los d10 de defensa (separados por espacios)', 'defenseDice', rerender);
      if (!dT) wrap.appendChild(el('p', 'pending-note', rules.reasons.wrong_dice_format));
      else if (dT.rolls.length > 0) wrap.appendChild(el('p', 'source-refs', `Defensa: ${dT.successes} Éxito, ${dT.failures} Fallo, ${dT.none} sin efecto.`));
      if (dT && dT.rolls.length !== defenseRolls && dT.rolls.length > 0) wrap.appendChild(el('p', 'pending-note', rules.reasons.defense_dice_count));
    }
    const defenseDone = state.defenseUsed !== 'yes' || (dT && dT.rolls.length === defenseRolls);
    if (defenseDone) {
      const rolls = CyberAttackEngine.attackRolls({ attackPoints: num(state.attackPoints), defenseSuccesses: dT.successes, defenseFailures: dT.failures });
      wrap.appendChild(el('h3', null, `Ataque: ${rolls} tiradas de 1d10`));
      wrap.appendChild(el('p', 'source-refs', `${rules.texts.attack_rule} ${rules.texts.rolls_floor}`));
      if (rolls > 0) diceField(wrap, 'Resultados de los d10 de ataque (separados por espacios)', 'attackDice', rerender);
      const aT = tally(state.attackDice);
      if (!aT) wrap.appendChild(el('p', 'pending-note', rules.reasons.wrong_dice_format));
      else if (aT.rolls.length > 0) wrap.appendChild(el('p', 'source-refs', `Ataque: ${aT.successes} Éxito, ${aT.failures} Fallo, ${aT.none} sin efecto.`));
      if (aT && aT.rolls.length !== rolls && aT.rolls.length > 0) wrap.appendChild(el('p', 'pending-note', rules.reasons.attack_dice_count));
    }
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (evaluate().ok !== true) { alert('Escribe un d10 por cada tirada, solo cifras del 0 al 9.'); return; }
        state.step = 3;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 4: Resultado ----------
  function renderStepResult(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const target = targetOf(rules);
    const r = target ? evaluate() : { ok: null, reasons: [] };
    if (r.ok === null) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const who = state.label ? `${target.label} «${state.label}»` : target.label;
    const lines = [`Objetivo: ${who} (${target.section}).`];
    let resultText;
    if (r.ok === false) {
      r.reasons.forEach((k) => lines.push(k === 'restricted_target' ? target.restriction.text : rules.reasons[k]));
      resultText = 'no se puede realizar el ataque cibernético';
    } else {
      lines.push(`Atacante: ${state.attackPoints} puntos de Capacidad = ${CyberAttackEngine.baseRolls(num(state.attackPoints))} tiradas.`);
      if (state.defenseUsed === 'yes') {
        const dT = tally(state.defenseDice);
        lines.push(`Defensa: ${state.defensePoints} puntos = ${r.defenseRolls} tiradas (${state.defenseDice}); ${dT.successes} Éxitos y ${dT.failures} Fallos → el atacante tira ${r.attackRolls}.`);
      }
      else lines.push('Sin defensa cibernética.');
      const aT = tally(state.attackDice);
      lines.push(`Ataque (${state.attackDice || 'sin tiradas'}): ${aT.successes} Éxitos − ${aT.failures} Fallos = ${r.netSuccesses} éxitos finales.`);
      lines.push(r.success ? rules.texts.success : rules.texts.failure);
      if (r.success) lines.push(target.onSuccessTemplate ? target.onSuccessTemplate.replace('{net}', String(r.netSuccesses)) : target.onSuccess);
      resultText = r.success ? 'ataque cibernético con éxito' : 'ataque cibernético sin éxito';
    }

    const box = el('div', 'wizard-modifier-summary');
    lines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    rules.afterRules.forEach((t) => wrap.appendChild(el('p', 'source-refs', t)));

    const fullSummaryText = ['Ataque cibernético', ...lines, `Resultado: ${resultText}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'cyber_attack', workflowTitle: 'Ataque cibernético', summaryText: fullSummaryText, state });
      unlinkTurnContext(state);
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = r.ok === false ? 0 : 2; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => { unlinkTurnContext(state); state = freshState(); rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.CyberAttackWizard = { render: renderCyberAttackWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
