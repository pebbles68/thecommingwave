// Wizard: Ataques de Reacción terrestres (roadmap Fase 10;
// data/rules/ground-reactions.json + public/js/ground-reaction-engine.js).
// Decision Book §5.16 (pp. 88-91), §8.5.6 (pp. 175-176) y §8.7.8 (pp. 181-182):
// Contrabatería (CF), Contrafuegos (AS), Persecución Aérea (KB) e Interdicción
// de Batalla (BAI).
//
// El wizard guía cuatro decisiones: qué hecho dejó a la unidad Brevemente
// Detectable (y por tanto qué reacción procede), qué unidades pueden atacar,
// el plan completo de objetivos y orden (que debe fijarse antes del primer
// ataque) y las consecuencias. Cada ataque se resuelve en los wizards de ataque
// terrestre ya existentes, con los ajustes de la reacción. El mapa no está
// modelado: el jugador declara quién cumple cada condición.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadGroundReactions, loadAirMissions,
    makeTextField, makeOptionGroup, makeSelectFromValues,
    wizardActionRow, wizardNavButton
  } = AppCore;

  const WIZARD_STEPS = ['Qué ha ocurrido', 'Unidades de ataque', 'Objetivos y orden', 'Resolución y consecuencias'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return {
      step: 0,
      trigger: '',
      targetDetected: '',
      targets: [{ name: '' }],
      attackers: [{ name: '', kind: '', inPosition: '', usesCas: '', hasAmmo: '', alreadyDidCf: '', alreadyDynamic: '', target: '', order: '' }],
      closed: {},
      turnResolutionId: null
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 3;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'ground-reaction', type: 'ground_reaction', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);
  const unlinkTurnContext = () => lifecycle.unlink();

  const targetLabel = (t, i) => t.name || `Objetivo ${i + 1}`;
  const attackerLabel = (a, i) => a.name || `Unidad ${i + 1}`;

  function currentReaction(rules) {
    return state.trigger ? GroundReactionEngine.reactionForTrigger(rules, state.trigger) : null;
  }

  function evaluated(rules, reaction) {
    return state.attackers.map((a) => ({ ...a, evaluation: GroundReactionEngine.evaluateAttacker(rules, reaction.id, a) }));
  }

  async function renderGroundReactionWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('ground-reaction', state, freshState);
    linkToTurnContextIfNeeded(state, 'Ataque de reacción terrestre');
    AppCore.persistWizardDraft('ground-reaction', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Ataques de reacción terrestres']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let rules;
    let airMissions;
    try {
      [rules, airMissions] = await Promise.all([loadGroundReactions(), loadAirMissions()]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Ataques de reacción terrestres'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §5.16 (págs. 88-91), §8.5.6 y §8.7.8. Sin «hoja de ayuda» con ejemplo resuelto: cada paso cita la regla directamente.'));

    const rerender = () => { renderGroundReactionWizard(); };
    AppCore.mountWizardDraft('ground-reaction', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });

    [
      () => renderStepTrigger(wrap, rules, rerender),
      () => renderStepAttackers(wrap, rules, rerender),
      () => renderStepPlan(wrap, rules, rerender),
      () => renderStepResult(wrap, rules, airMissions, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: qué ha ocurrido ----------
  function renderStepTrigger(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Qué ha ocurrido'));
    wrap.appendChild(el('p', 'turn-view__desc', rules.intro));
    wrap.appendChild(makeOptionGroup({
      prompt: '¿Qué hecho ha dejado a una unidad Brevemente Detectable?',
      options: rules.reactions.map((r) => ({ value: r.triggerId, label: r.triggerLabel }))
    }, state.trigger, (v) => { state.trigger = v; rerender(); }));

    const reaction = currentReaction(rules);
    if (reaction) {
      const box = el('div', 'help-card help-card--highlight');
      box.appendChild(el('span', 'help-card__title', `Reacción que procede: ${reaction.name}`));
      box.appendChild(el('span', 'help-card__source', `Objetivo: ${reaction.targetDescription}`));
      box.appendChild(el('span', 'help-card__source', `Pueden atacar: ${reaction.attackerKinds.map((k) => GroundReactionEngine.kindLabel(rules, k)).join('; ')}.`));
      if (reaction.limits) box.appendChild(el('span', 'help-card__source', reaction.limits));
      box.appendChild(el('span', 'help-card__source', `Regla: Decision Book §${reaction.sourceRef.section}, p. ${reaction.sourceRef.page}.`));
      wrap.appendChild(box);

      wrap.appendChild(makeOptionGroup({ prompt: rules.questions.targetDetected, options: YES_NO }, state.targetDetected, (v) => { state.targetDetected = v; rerender(); }));
      wrap.appendChild(wizardNavButton('Ayuda de detección', 'secondary', () => { location.hash = '#/ayuda/deteccion'; }));
      if (state.targetDetected === 'no') {
        wrap.appendChild(el('p', 'pending-note', 'Sin detección no hay ataque de reacción: el estado de detección breve dura muy poco (§5.16, nota de diseño).'));
      }

      wrap.appendChild(el('h3', null, 'Objetivos'));
      state.targets.forEach((t, i) => {
        wrap.appendChild(makeTextField(`Objetivo ${i + 1} (nombre)`, t.name, (v) => { t.name = v; }));
      });
      wrap.appendChild(wizardNavButton('+ Añadir objetivo', 'secondary', () => { state.targets.push({ name: '' }); rerender(); }));
      if (state.targets.length > 1) {
        wrap.appendChild(wizardNavButton('− Quitar el último objetivo', 'secondary', () => {
          const removed = state.targets.length - 1;
          state.targets.pop();
          state.attackers.forEach((a) => { if (a.target === String(removed)) a.target = ''; });
          rerender();
        }));
      }
      GroundReactionEngine.attackSettings(rules, reaction.id).specialRules.forEach((t) => wrap.appendChild(el('p', 'source-refs', t)));
    }

    wrap.appendChild(el('p', 'source-refs', rules.notModeled));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!reaction) { alert('Elige qué hecho ha ocurrido.'); return; }
        if (state.targetDetected === '') { alert('Indica si el objetivo ha sido detectado.'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: unidades de ataque ----------
  function renderStepAttackers(wrap, rules, rerender) {
    const reaction = currentReaction(rules);
    wrap.appendChild(el('h2', null, `Unidades de ataque (${reaction.name})`));
    wrap.appendChild(el('p', 'turn-view__desc', 'Añade cada unidad que quiere atacar y contesta si cumple las condiciones. Las que no las cumplen se descartan con su motivo.'));

    state.attackers.forEach((a, i) => {
      const box = el('div', 'wizard-parallel');
      box.appendChild(el('h3', null, attackerLabel(a, i)));
      box.appendChild(makeTextField(`Unidad ${i + 1}: nombre (opcional)`, a.name, (v) => { a.name = v; }));
      box.appendChild(makeOptionGroup({
        prompt: `Unidad ${i + 1}: ¿qué tipo de unidad es?`,
        options: reaction.attackerKinds.map((k) => ({ value: k, label: GroundReactionEngine.kindLabel(rules, k) }))
      }, a.kind, (v) => { a.kind = v; rerender(); }));
      if (a.kind) {
        box.appendChild(makeOptionGroup({ prompt: `Unidad ${i + 1}: ${rules.questions.attackerInPosition} ${reaction.attackerConditions[a.kind]}`, options: YES_NO }, a.inPosition, (v) => { a.inPosition = v; rerender(); }));
        if (a.kind === 'artillery_fire') {
          box.appendChild(makeOptionGroup({ prompt: `Unidad ${i + 1}: ${rules.questions.usesCas}`, options: YES_NO }, a.usesCas, (v) => { a.usesCas = v; rerender(); }));
          box.appendChild(makeOptionGroup({ prompt: `Unidad ${i + 1}: ${rules.questions.hasAmmo}`, options: YES_NO }, a.hasAmmo, (v) => { a.hasAmmo = v; rerender(); }));
          box.appendChild(makeOptionGroup({ prompt: `Unidad ${i + 1}: ${rules.questions.alreadyDidCf}`, options: YES_NO }, a.alreadyDidCf, (v) => { a.alreadyDidCf = v; rerender(); }));
        }
        if (a.kind === 'air_on_call' || a.kind === 'low_altitude_operational') {
          box.appendChild(makeOptionGroup({ prompt: `Unidad ${i + 1}: ${rules.questions.alreadyDynamic}`, options: YES_NO }, a.alreadyDynamic, (v) => { a.alreadyDynamic = v; rerender(); }));
        }
        const ev = GroundReactionEngine.evaluateAttacker(rules, reaction.id, a);
        if (ev.eligible) box.appendChild(el('p', 'wizard-modifier-summary__total', `✓ Puede atacar${ev.notes.length ? ` · ${ev.notes.join(' ')}` : ''}`));
        else if (ev.pending) box.appendChild(el('p', 'source-refs', 'Contesta las preguntas para saber si puede atacar.'));
        else ev.reasons.forEach((r) => box.appendChild(el('p', 'pending-note', `✗ ${r}`)));
      }
      wrap.appendChild(box);
    });
    wrap.appendChild(wizardNavButton('+ Añadir unidad de ataque', 'secondary', () => {
      state.attackers.push({ name: '', kind: '', inPosition: '', usesCas: '', hasAmmo: '', alreadyDidCf: '', alreadyDynamic: '', target: '', order: '' });
      rerender();
    }));
    if (state.attackers.length > 1) {
      wrap.appendChild(wizardNavButton('− Quitar la última unidad', 'secondary', () => { state.attackers.pop(); rerender(); }));
    }
    GroundReactionEngine.attackSettings(rules, reaction.id); // valida que la reacción existe
    rules.generalRules.filter((g) => g.id === 'who' || g.id === 'no-command').forEach((g) => wrap.appendChild(el('p', 'source-refs', g.text)));

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!evaluated(rules, reaction).some((a) => a.evaluation.eligible)) { alert('Ninguna unidad cumple las condiciones: no hay ataque de reacción que resolver.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: objetivos y orden ----------
  function renderStepPlan(wrap, rules, rerender) {
    const reaction = currentReaction(rules);
    const attackers = evaluated(rules, reaction);
    wrap.appendChild(el('h2', null, 'Objetivos y orden de resolución'));
    wrap.appendChild(el('p', 'turn-view__desc', rules.generalRules.find((g) => g.id === 'plan-first').text));
    wrap.appendChild(el('p', 'source-refs', rules.generalRules.find((g) => g.id === 'multiple').text));

    const targetOptions = state.targets.map((t, i) => ({ value: String(i), label: targetLabel(t, i) }));
    const orderValues = attackers.filter((a) => a.evaluation.eligible).map((_, i) => String(i + 1));
    attackers.forEach((a, i) => {
      if (!a.evaluation.eligible) return;
      const label = attackerLabel(a, i);
      wrap.appendChild(makeOptionGroup({ prompt: `${label}: ¿contra qué objetivo ataca?`, options: targetOptions }, a.target, (v) => { state.attackers[i].target = v; rerender(); }));
      wrap.appendChild(makeSelectFromValues(`${label}: orden de resolución`, orderValues, a.order, (v) => { state.attackers[i].order = v; rerender(); }));
    });

    const check = GroundReactionEngine.validatePlan(rules, reaction.id, { targetDetected: state.targetDetected, targets: state.targets, attackers });
    check.errors.forEach((e) => wrap.appendChild(el('p', 'pending-note', e)));
    check.warnings.forEach((w) => wrap.appendChild(el('p', 'source-refs', w)));

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Ver resolución →', 'primary', () => {
        if (!check.ok) { alert(check.errors.join('\n')); return; }
        state.step = 3;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // Abre un wizard de ataque terrestre con los ajustes de la reacción.
  function openAttack(rules, airMissions, reaction, attacker, wizard) {
    const settings = GroundReactionEngine.attackSettings(rules, reaction.id);
    const missionContext = attacker.kind === 'air_on_call' ? MissionContextEngine.buildContext(airMissions, 'on-call', 'reaction') : null;
    const options = { pursuit: settings.usesPursuitRow, missionContext, resultKind: settings.resultKind };
    if (wizard === 'guided') { Views.GroundGuidedWizard.prefill(options); location.hash = '#/wizard/ground-guided'; }
    else if (wizard === 'unguided') { Views.GroundUnguidedWizard.prefill(options); location.hash = '#/wizard/ground-unguided'; }
    else { location.hash = '#/wizard/anti-radiation'; }
  }

  // ---------- Paso 4: resolución y consecuencias ----------
  function renderStepResult(wrap, rules, airMissions, rerender) {
    const reaction = currentReaction(rules);
    const attackers = evaluated(rules, reaction).filter((a) => a.evaluation.eligible)
      .sort((x, y) => Number(x.order) - Number(y.order));
    const settings = GroundReactionEngine.attackSettings(rules, reaction.id);

    wrap.appendChild(el('h2', null, `Resolución: ${reaction.name}`));
    wrap.appendChild(el('p', 'turn-view__desc', 'Resuelve los ataques en el orden fijado. Cada botón abre el wizard de ataque terrestre con los ajustes de esta reacción ya aplicados; al terminar, vuelve con «Atrás».'));

    const adjust = [];
    adjust.push(settings.usesPursuitRow ? 'Se usa la fila «Persecución» de la tabla de resolución.' : 'Se usa la fila habitual del plan de ataque.');
    adjust.push(settings.targetGetsTerrainBonus ? 'El objetivo conserva la bonificación de Valor de Protección del terreno.' : 'El objetivo NO recibe la bonificación de Valor de Protección del terreno: pon 0 en el Valor de Terreno al aplicar los impactos.');
    if (!settings.targetCanLowAltitudeCounterattack) adjust.push('El objetivo no puede iniciar un Contraataque a Baja Altura.');
    const adjustBox = el('div', 'help-card help-card--highlight');
    adjustBox.appendChild(el('span', 'help-card__title', 'Ajustes de esta reacción'));
    adjust.forEach((t) => adjustBox.appendChild(el('span', 'help-card__source', t)));
    wrap.appendChild(adjustBox);

    const lines = [];
    attackers.forEach((a, i) => {
      const t = state.targets[Number(a.target)];
      const row = el('div', 'wizard-modifier-summary');
      row.appendChild(el('span', 'wizard-modifier-summary__total', `${a.order}. ${attackerLabel(a, i)} → ${targetLabel(t, Number(a.target))}`));
      const buttons = el('div', 'action-row');
      buttons.appendChild(wizardNavButton('Resolver: ataque terrestre guiado', 'secondary', () => openAttack(rules, airMissions, reaction, a, 'guided')));
      buttons.appendChild(wizardNavButton('Resolver: ataque terrestre no guiado', 'secondary', () => openAttack(rules, airMissions, reaction, a, 'unguided')));
      buttons.appendChild(wizardNavButton('Resolver: antirradiación (ARM)', 'secondary', () => openAttack(rules, airMissions, reaction, a, 'arm')));
      row.appendChild(buttons);
      wrap.appendChild(row);
      lines.push(`${a.order}. ${attackerLabel(a, i)} (${GroundReactionEngine.kindLabel(rules, a.kind)}) → ${targetLabel(t, Number(a.target))}`);
    });

    wrap.appendChild(el('h3', null, 'Consecuencias al terminar'));
    const after = GroundReactionEngine.aftermath(rules, reaction.id, attackers.map((a) => a.kind));
    after.forEach((l) => wrap.appendChild(el('p', 'turn-view__desc', `• ${l.text}`)));

    wrap.appendChild(el('h3', null, 'Cerrar el estado de detección breve'));
    state.targets.forEach((t, i) => {
      wrap.appendChild(makeOptionGroup({ prompt: `${targetLabel(t, i)}: ¿han terminado todas las reacciones aplicables y deja de ser Brevemente Detectable?`, options: YES_NO }, state.closed[i] || '', (v) => { state.closed[i] = v; rerender(); }));
    });
    const allClosed = state.targets.every((_, i) => state.closed[i] === 'yes');
    if (allClosed) wrap.appendChild(el('p', 'wizard-modifier-summary__total', 'Estado cerrado: ningún objetivo sigue Brevemente Detectable.'));

    const summary = [
      `Ataque de reacción: ${reaction.name} (Decision Book §${reaction.sourceRef.section}, p. ${reaction.sourceRef.page})`,
      `Hecho: ${reaction.triggerLabel}`,
      ...lines,
      ...adjust,
      ...after.map((l) => l.text),
      allClosed ? 'Estado de detección breve cerrado.' : 'Estado de detección breve: pendiente de cerrar.'
    ];
    const summaryText = summary.join('\n');
    const shareRow = el('div', 'action-row');
    const copyBtn = el('button', 'btn btn--secondary', '📋 Copiar resumen');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => {
      copyTextToClipboard(summaryText).then((ok) => {
        copyBtn.textContent = ok ? '✓ Copiado' : 'No se pudo copiar';
        setTimeout(() => { copyBtn.textContent = '📋 Copiar resumen'; }, 2000);
      });
    });
    shareRow.appendChild(copyBtn);
    const saveBtn = el('button', 'btn btn--secondary', '💾 Guardar en historial');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => {
      saveResolutionToHistory({ workflowId: 'ground_reaction', workflowTitle: 'Ataque de reacción terrestre', summaryText, state });
      unlinkTurnContext(state);
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 2; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => { unlinkTurnContext(state); state = freshState(); rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.GroundReactionWizard = { render: renderGroundReactionWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
