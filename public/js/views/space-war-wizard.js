// Wizard: Guerra espacial (roadmap Fase 14, regla opcional; data/rules/space-war.json +
// public/js/strategic-actions-engine.js + data/tables/page-32.json). Decision Book §14.5-§14.9
// (págs. 246-251) y Tablas-de-combate 5.pdf págs. 31-32.
//
// Las tiradas son físicas: el jugador escribe los resultados de sus d10 y la aplicación los clasifica con la
// tabla transcrita de la página 32; el motor calcula los efectos sobre recursos y escombros.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadSpaceWar, loadTablePage,
    makeTextField, makeNumberField, makeOptionGroup,
    wizardActionRow, wizardNavButton
  } = AppCore;

  const WIZARD_STEPS = ['Acción', 'Datos', 'Resultado'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];
  const E = () => StrategicActionsEngine;

  function freshState() {
    return {
      step: 0, operation: '', label: '',
      launchMine: '', launchRival: '', orbitalMine: '', orbitalRival: '', tieMine: '', tieRival: '',
      supportKind: '', guaranteeKind: '',
      destructionKind: '', maneuver: '', dice: '', enemyOrbital: '',
      stormRoll: '', debris: '', vanishRoll: ''
    };
  }

  let state = null;
  let table = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 2;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'space-war', type: 'space_war', getState: () => state });
  const unlinkTurnContext = () => lifecycle.unlink();

  // Los campos numéricos guardan texto; '' significa «sin dato».
  const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? NaN : Number(v));

  function compute() {
    switch (state.operation) {
      case 'order': {
        const r = E().actionOrder({
          launchA: num(state.launchMine), launchB: num(state.launchRival), orbitalA: num(state.orbitalMine), orbitalB: num(state.orbitalRival),
          tieRollA: num(state.tieMine), tieRollB: num(state.tieRival)
        });
        return { kind: 'order', r, ready: r.status === 'decided' };
      }
      case 'destruction': {
        const rolls = E().parseRolls(state.dice);
        if (!state.destructionKind || rolls === null) return { kind: 'destruction', r: null, ready: false, badFormat: rolls === null };
        const r = E().resolveDestruction({ table, kind: state.destructionKind, maneuver: state.maneuver, rolls, enemyOrbital: num(state.enemyOrbital) });
        return { kind: 'destruction', r, ready: !!r && !r.error && Number.isInteger(num(state.enemyOrbital)) };
      }
      case 'debris_storm': {
        const r = E().debrisStorm({ table, roll: num(state.stormRoll), debris: num(state.debris) });
        return { kind: 'storm', r, ready: !!r };
      }
      case 'debris_vanish': {
        const r = E().debrisVanish({ table, roll: num(state.vanishRoll), debris: num(state.debris) });
        return { kind: 'vanish', r, ready: !!r };
      }
      case 'support': return { kind: 'support', r: null, ready: !!state.supportKind };
      case 'guarantee': return { kind: 'guarantee', r: null, ready: !!state.guaranteeKind };
      default: return null;
    }
  }

  async function renderSpaceWarWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('space-war', state, freshState);
    lifecycle.link('Guerra espacial');
    AppCore.persistWizardDraft('space-war', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Guerra espacial']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let rules;
    try {
      rules = await loadSpaceWar();
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
    wrap.appendChild(el('h1', 'help-detail__title', 'Guerra espacial'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §14.5-§14.9 (págs. 246-251) y Tablas-de-combate 5.pdf págs. 31-32, regla opcional. Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.'));
    if (!RuleProfileEngine.isAvailable({ optionalRule: true }, AppCore.loadRuleProfile())) {
      wrap.appendChild(el('p', 'pending-note', 'Es una regla opcional y tu perfil de reglas no la tiene activada. Puedes usarla igualmente, pero recuerda activarla si la partida la incluye.'));
      const link = el('button', 'btn btn--secondary', 'Cambiar el perfil de reglas');
      link.type = 'button';
      link.addEventListener('click', () => { location.hash = '#/perfil-reglas'; });
      wrap.appendChild(link);
    }

    const rerender = () => { renderSpaceWarWizard(); };
    AppCore.mountWizardDraft('space-war', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    [
      () => renderStepAction(wrap, rules, rerender),
      () => renderStepData(wrap, rules, rerender),
      () => renderStepResult(wrap, rules, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Acción ----------
  function renderStepAction(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Acción'));
    wrap.appendChild(el('p', 'turn-view__desc', rules.intro));
    wrap.appendChild(el('p', 'source-refs', rules.texts.resources_reset));
    wrap.appendChild(makeTextField('Detalle (opcional)', state.label, (v) => { state.label = v; }));
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué quieres comprobar?', options: rules.operations.map((o) => ({ value: o.value, label: o.label })) }, state.operation, (v) => { state.operation = v; rerender(); }));
    const op = rules.operations.find((o) => o.value === state.operation);
    if (op) wrap.appendChild(el('p', 'source-refs', `${op.summary} (${op.section})`));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!state.operation) { alert('Elige qué quieres comprobar.'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  function diceField(wrap, rules, label, key, rerender) {
    wrap.appendChild(makeTextField(label, state[key], (v) => { state[key] = v; }, rerender));
    if (E().parseRolls(state[key]) === null) wrap.appendChild(el('p', 'pending-note', rules.reasons.wrong_dice_format));
  }

  // ---------- Paso 2: Datos ----------
  function renderStepData(wrap, rules, rerender) {
    const op = rules.operations.find((o) => o.value === state.operation);
    wrap.appendChild(el('h2', null, op.label));
    const field = (label, key, ref) => wrap.appendChild(makeNumberField(label, state[key], (v) => { state[key] = v; }, rerender, { visualRef: ref }));
    const resources = 'space-war-resources';

    if (state.operation === 'order') {
      wrap.appendChild(el('p', 'source-refs', rules.texts.active_when));
      field('Recursos de Lanzamiento disponibles de tu bando', 'launchMine', resources);
      field('Recursos de Lanzamiento disponibles del bando rival', 'launchRival', resources);
      field('Recursos Orbitales disponibles de tu bando', 'orbitalMine', resources);
      field('Recursos Orbitales disponibles del bando rival', 'orbitalRival', resources);
      const c = compute();
      if (c.r.status === 'needs_roll' || c.r.status === 'reroll') {
        wrap.appendChild(el('p', 'pending-note', 'Empate en Lanzamiento y en Orbitales: cada bando tira 1d10 y el más alto elige si actuar primero o segundo.'));
        field('Tirada de 1d10 de tu bando (0-9)', 'tieMine', 'dice-roll');
        field('Tirada de 1d10 del bando rival (0-9)', 'tieRival', 'dice-roll');
        if (c.r.status === 'reroll') wrap.appendChild(el('p', 'pending-note', rules.reasons.tie_reroll));
      }
    } else if (state.operation === 'support') {
      wrap.appendChild(el('p', 'source-refs', rules.supportCommon));
      wrap.appendChild(makeOptionGroup({ prompt: '¿Qué acción de Apoyo Espacial?', options: rules.support.map((s) => ({ value: s.value, label: s.label })) }, state.supportKind, (v) => { state.supportKind = v; rerender(); }));
    } else if (state.operation === 'guarantee') {
      wrap.appendChild(makeOptionGroup({ prompt: '¿Qué acción de Garantía Espacial?', options: rules.guarantee.map((s) => ({ value: s.value, label: s.label })) }, state.guaranteeKind, (v) => { state.guaranteeKind = v; rerender(); }));
    } else if (state.operation === 'destruction') {
      wrap.appendChild(makeOptionGroup({ prompt: '¿Qué ataque de Destrucción Espacial?', options: rules.destruction.map((d) => ({ value: d.value, label: d.label })) }, state.destructionKind, (v) => { state.destructionKind = v; if (v === 'soft') state.maneuver = 'no'; rerender(); }));
      const kind = rules.destruction.find((d) => d.value === state.destructionKind);
      if (kind) {
        wrap.appendChild(el('p', 'source-refs', `${kind.kind}. ${kind.cost} ${kind.roll}`));
        if (kind.value !== 'soft') {
          wrap.appendChild(makeOptionGroup({ prompt: '¿El objetivo hace una Maniobra Orbital (consume 1 Recurso Orbital y reduce en 2 tus tiradas)?', options: YES_NO }, state.maneuver, (v) => { state.maneuver = v; rerender(); }));
        }
        field('Recursos Orbitales disponibles del enemigo', 'enemyOrbital', resources);
        const expected = E().destructionRolls(kind.value, state.maneuver);
        if (expected !== null && (kind.value === 'soft' || state.maneuver)) {
          wrap.appendChild(el('h3', null, `${expected} ${expected === 1 ? 'tirada' : 'tiradas'} de 1d10`));
          diceField(wrap, rules, 'Resultados de los d10 de destrucción (separados por espacios)', 'dice', rerender);
          const rolls = E().parseRolls(state.dice);
          if (rolls && rolls.length > 0) {
            const t = E().tallyRolls(table, 'destruction', rolls);
            wrap.appendChild(el('p', 'source-refs', `${t.successes} Éxito, ${t.failures} Fallo, ${t.none} sin efecto.`));
            if (rolls.length !== expected) wrap.appendChild(el('p', 'pending-note', rules.reasons.wrong_roll_count));
          }
        }
      }
    } else if (state.operation === 'debris_storm') {
      field('Escombros Espaciales presentes', 'debris', 'space-war-debris');
      field('Tirada de 1d10 de la Tormenta de Escombros (0-9)', 'stormRoll', 'dice-roll');
    } else {
      wrap.appendChild(el('p', 'source-refs', rules.texts.vanish_rule));
      field('Escombros Espaciales presentes', 'debris', 'space-war-debris');
      field('Tirada de 1d10 de desaparición de escombros (0-9)', 'vanishRoll', 'dice-roll');
    }

    wrap.appendChild(wizardNavButton('Ver la tabla (pág. 32)', 'secondary', () => { location.hash = rules.table.hash; }));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!compute().ready) { alert('Completa los datos de la acción.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Resultado ----------
  function ownCostText(cost) {
    return { destroy_launch: 'Destruyes 1 de tus Recursos de Lanzamiento.', consume_launch: 'Consumes 1 de tus Recursos de Lanzamiento.', destroy_orbital: 'Destruyes 1 de tus Recursos Orbitales (baja también tu límite máximo).' }[cost];
  }

  function summarize(rules, c) {
    const lines = [];
    let resultText;
    if (c.kind === 'order') {
      if (c.r.by === 'launch') { lines.push('Empieza quien tiene menos Recursos de Lanzamiento.'); resultText = c.r.first === 'A' ? 'empieza tu bando' : 'empieza el bando rival'; }
      else if (c.r.by === 'orbital') { lines.push('Empatan en Lanzamiento: empieza quien tiene más Recursos Orbitales.'); resultText = c.r.first === 'A' ? 'empieza tu bando' : 'empieza el bando rival'; }
      else { lines.push(`Empatan en ambos recursos: tirada ${state.tieMine} contra ${state.tieRival}.`); resultText = c.r.chooser === 'A' ? 'tu bando elige si actuar primero o segundo' : 'el bando rival elige si actuar primero o segundo'; }
    } else if (c.kind === 'support') {
      const s = rules.support.find((x) => x.value === state.supportKind);
      lines.push(`${s.label} (${s.section}; ${s.kind}).`, s.effect, rules.supportCommon);
      resultText = `${s.label}: efecto seguro, consume 1 Recurso Orbital`;
    } else if (c.kind === 'guarantee') {
      const g = rules.guarantee.find((x) => x.value === state.guaranteeKind);
      lines.push(`${g.label} (${g.section}; ${g.kind}).`, g.effect);
      resultText = g.label;
    } else if (c.kind === 'destruction') {
      const d = rules.destruction.find((x) => x.value === state.destructionKind);
      const r = c.r;
      lines.push(`${d.label} (${d.section}): ${ownCostText(r.ownCost)}`);
      if (state.maneuver === 'yes') lines.push('Maniobra Orbital del objetivo: tus tiradas bajan en 2.');
      lines.push(`Tiradas (${state.dice}): ${r.successes} Éxito, ${r.failures} Fallo, ${r.none} sin efecto.`);
      lines.push(r.enemyOrbitalLostKind === 'consumed' ? `Recursos Orbitales enemigos consumidos: ${r.enemyOrbitalLost}.` : `Recursos Orbitales enemigos destruidos: ${r.enemyOrbitalLost}.`);
      if (r.capped) lines.push('El enemigo tenía menos Recursos Orbitales disponibles que éxitos: no se destruyen más de los que tiene.');
      lines.push(`Escombros Espaciales generados: ${r.debrisGenerated}.`);
      resultText = `${r.enemyOrbitalLost} Recurso(s) Orbital(es) enemigo(s) y ${r.debrisGenerated} escombro(s)`;
    } else if (c.kind === 'storm') {
      lines.push(`1d10 ${state.stormRoll} + ${state.debris} escombros = ${c.r.total}.`);
      if (c.r.clamped) lines.push(rules.texts.storm_clamped);
      lines.push(c.r.collision ? rules.texts.storm_collision : rules.texts.storm_clear);
      resultText = c.r.collision ? 'Colisión' : 'sin efecto: la acción continúa';
    } else {
      lines.push(`1d10 ${state.vanishRoll}: la tabla da ${c.r.tableValue}.`);
      lines.push(`Desaparecen ${c.r.removed} escombros y quedan ${c.r.remaining}.`);
      resultText = `desaparecen ${c.r.removed} escombros, quedan ${c.r.remaining}`;
    }
    return { lines, resultText };
  }

  function renderStepResult(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const c = state.operation ? compute() : null;
    if (!c || !c.ready) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = state.operation ? 1 : 0; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const op = rules.operations.find((o) => o.value === state.operation);
    const { lines, resultText } = summarize(rules, c);
    const title = state.label ? `${op.label} — ${state.label}` : op.label;

    const box = el('div', 'wizard-modifier-summary');
    lines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    if (c.kind === 'destruction' && c.r.debrisGenerated > 0) wrap.appendChild(el('p', 'source-refs', rules.texts.debris_shared));
    if (c.kind === 'destruction') wrap.appendChild(el('p', 'source-refs', rules.texts.cyber_cancels));
    rules.afterRules.forEach((t) => wrap.appendChild(el('p', 'source-refs', t)));

    const fullSummaryText = [`Guerra espacial: ${title}`, ...lines, `Resultado: ${resultText}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'space_war', workflowTitle: 'Guerra espacial', summaryText: fullSummaryText, state });
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
  root.Views.SpaceWarWizard = { render: renderSpaceWarWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
