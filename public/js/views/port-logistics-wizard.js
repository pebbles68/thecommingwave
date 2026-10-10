// Wizard: Logística de puerto y munición (roadmap Fase 14; data/rules/port-logistics.json +
// public/js/port-logistics-engine.js). Decision Book §9.9.4, §9.9.5 y §11.6 (págs. 206, 237-238):
// reabastecimiento de munición, reparación de buques (opcional), reparaciones de emergencia y
// agotamiento de munición.
//
// Los valores del puerto no están transcritos: el jugador los lee de la ficha del puerto. El texto
// de las reglas se lee del JSON; la decisión vive en el motor puro.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadPortLogistics,
    makeTextField, makeNumberField, makeOptionGroup,
    wizardActionRow, wizardNavButton
  } = AppCore;

  const WIZARD_STEPS = ['Operación', 'Datos', 'Resultado'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return {
      step: 0, operation: '', label: '', shipKind: 'surface',
      units: '', portValue: '', inWaitingArea: '',
      inPort: '', damaged: '', multiShip: '', alreadyTried: '', shipsInDock: '', docks: '', rep: '', roll: '',
      rr: '', markers: '', nodeLevel: '', nodeProvided: '',
      remaining: '', attackValue: ''
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 2;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'port-logistics', type: 'port_logistics', getState: () => state });
  const unlinkTurnContext = () => lifecycle.unlink();

  // Los campos numéricos guardan texto; '' significa «sin dato».
  const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? NaN : Number(v));

  function compute() {
    const E = PortLogisticsEngine;
    switch (state.operation) {
      case 'ammo_resupply': return { kind: 'resupply', r: E.evaluateResupply({ units: num(state.units), portValue: num(state.portValue), inWaitingArea: state.inWaitingArea }) };
      case 'ship_repair': return {
        kind: 'repair',
        r: E.evaluateRepair({
          inPort: state.inPort, damaged: state.damaged, multiShip: state.multiShip, alreadyTried: state.alreadyTried,
          shipsInDock: num(state.shipsInDock), docks: num(state.docks), rep: num(state.rep), roll: num(state.roll)
        })
      };
      case 'emergency_repair': return { kind: 'emergency', r: E.evaluateEmergencyRepair({ rr: num(state.rr), markers: num(state.markers) }) };
      case 'supply_node_decay': return { kind: 'decay', r: E.evaluateNodeDecay({ level: num(state.nodeLevel), providedSupply: state.nodeProvided }) };
      case 'ammo_depletion': return { kind: 'depletion', r: E.evaluateDepletion({ remaining: num(state.remaining), attackValue: num(state.attackValue) }) };
      default: return null;
    }
  }

  function isComplete(c) {
    if (!c) return false;
    if (c.kind === 'resupply') return c.r.resupplied !== null;
    if (c.kind === 'repair') return c.r.eligible === false || c.r.success !== null;
    if (c.kind === 'emergency') return c.r.removed !== null;
    if (c.kind === 'decay') return c.r.newLevel !== null;
    return c.r.effective !== null;
  }

  async function renderPortLogisticsWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('port-logistics', state, freshState);
    lifecycle.link('Logística de puerto y munición');
    AppCore.persistWizardDraft('port-logistics', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Logística de puerto']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let rules;
    try {
      rules = await loadPortLogistics();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Logística de puerto y munición'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §9.9.4, §9.9.5 y §11.6 (págs. 206, 237-238). Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.'));

    const rerender = () => { renderPortLogisticsWizard(); };

    AppCore.mountWizardDraft('port-logistics', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    [
      () => renderStepOperation(wrap, rules, rerender),
      () => renderStepData(wrap, rules, rerender),
      () => renderStepResult(wrap, rules, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Operación ----------
  function renderStepOperation(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Operación'));
    wrap.appendChild(el('p', 'turn-view__desc', rules.intro));
    wrap.appendChild(makeTextField('Puerto o unidad (opcional)', state.label, (v) => { state.label = v; }));
    // Las operaciones de regla opcional solo se ofrecen si el perfil de reglas las activa.
    const profile = AppCore.loadRuleProfile();
    const available = RuleProfileEngine.filterAvailable(rules.operations, profile);
    if (available.length < rules.operations.length) {
      wrap.appendChild(el('p', 'source-refs', 'Hay operaciones de regla opcional ocultas porque tu perfil de reglas no las activa.'));
      const link = el('button', 'btn btn--secondary', 'Cambiar el perfil de reglas');
      link.type = 'button';
      link.addEventListener('click', () => { location.hash = '#/perfil-reglas'; });
      wrap.appendChild(link);
    }
    if (state.operation && !available.some((o) => o.value === state.operation)) state.operation = '';
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué quieres comprobar?', options: available.map((o) => ({ value: o.value, label: o.label })) }, state.operation, (v) => { state.operation = v; rerender(); }));
    const op = rules.operations.find((o) => o.value === state.operation);
    if (op) wrap.appendChild(el('p', 'source-refs', op.summary));
    wrap.appendChild(el('p', 'source-refs', rules.notModeled));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!state.operation) { alert('Elige la operación que quieres comprobar.'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Datos ----------
  function renderStepData(wrap, rules, rerender) {
    const op = rules.operations.find((o) => o.value === state.operation);
    wrap.appendChild(el('h2', null, op.label));
    const field = (label, key, ref) => wrap.appendChild(makeNumberField(label, state[key], (v) => { state[key] = v; }, rerender, { visualRef: ref }));
    const values = 'port-logistics-values';
    const counts = 'port-logistics-counts';

    if (state.operation === 'ammo_resupply') {
      wrap.appendChild(makeOptionGroup({ prompt: '¿Qué tipo de unidades se reabastecen?', options: rules.shipKinds }, state.shipKind, (v) => { state.shipKind = v; rerender(); }));
      wrap.appendChild(el('p', 'source-refs', state.shipKind === 'submarine' ? rules.texts.ammo_resupply_where_submarine : rules.texts.ammo_resupply_where_surface));
      field('Unidades que quieres reabastecer', 'units', counts);
      field('Valor de Reabastecimiento de Munición del puerto', 'portValue', values);
      wrap.appendChild(makeOptionGroup({ prompt: '¿Todas esas unidades están en el área de «Buques/Flota en Espera»?', options: YES_NO }, state.inWaitingArea, (v) => { state.inWaitingArea = v; rerender(); }));
    } else if (state.operation === 'ship_repair') {
      wrap.appendChild(el('p', 'source-refs', rules.texts.repair_cost));
      [
        ['¿El buque está dentro de un puerto?', 'inPort'],
        ['¿El buque está en su lado Dañado?', 'damaged'],
        ['¿Es una unidad de superficie multi-barco (marca X2, X3...)?', 'multiShip'],
        ['¿Ya ha intentado repararse en esta Fase de Logística?', 'alreadyTried']
      ].forEach(([prompt, key]) => wrap.appendChild(makeOptionGroup({ prompt, options: YES_NO }, state[key], (v) => { state[key] = v; rerender(); })));
      field('Buques en el Dique Seco (contando este)', 'shipsInDock', counts);
      field('Número de Diques (DOCK) del puerto', 'docks', values);
      field('Valor de Reparación de Buques (REP) del puerto', 'rep', values);
      field('Tirada de 1d10', 'roll', 'dice-roll');
    } else if (state.operation === 'supply_node_decay') {
      wrap.appendChild(el('p', 'source-refs', rules.texts.node_decay_rule));
      wrap.appendChild(el('p', 'source-refs', rules.texts.node_decay_advanced));
      field('Marcadores de nivel del Nodo de Suministro Ordinario', 'nodeLevel', counts);
      wrap.appendChild(makeOptionGroup({ prompt: '¿Ha dado garantía logística a alguna unidad terrestre, puerto o aeródromo en esta fase?', options: YES_NO }, state.nodeProvided, (v) => { state.nodeProvided = v; rerender(); }));
    } else if (state.operation === 'emergency_repair') {
      wrap.appendChild(el('p', 'source-refs', rules.texts.emergency_when));
      field('Valor de Reparación Rápida (RR) del puerto', 'rr', values);
      field('Marcadores de «Instalaciones Inutilizadas» del puerto', 'markers', counts);
    } else {
      field('Munición restante de ese tipo', 'remaining', counts);
      field('Valor de ataque del plan de ataque', 'attackValue', counts);
    }

    const c = compute();
    if (c && c.kind === 'resupply') c.r.reasons.forEach((k) => wrap.appendChild(el('p', 'pending-note', rules.reasons[k])));
    if (c && c.kind === 'repair' && c.r.eligible === false) c.r.reasons.forEach((k) => wrap.appendChild(el('p', 'pending-note', rules.reasons[k])));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!isComplete(compute())) { alert('Completa los datos de la operación.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Resultado ----------
  function summarize(rules, c) {
    const lines = [];
    let resultText = '';
    if (c.kind === 'resupply') {
      const r = c.r;
      const kind = state.shipKind === 'submarine' ? 'submarinas' : 'de superficie';
      lines.push(`Unidades ${kind}: ${state.units} por reabastecer; valor del puerto ${state.portValue}.`);
      r.reasons.forEach((k) => lines.push(rules.reasons[k]));
      resultText = `se reabastecen ${r.resupplied} de ${state.units} unidades`;
      if (r.resupplied > 0) lines.push(rules.texts.ammo_resupply_effect);
      lines.push(rules.texts.ammo_resupply_optional);
    } else if (c.kind === 'repair') {
      const r = c.r;
      if (r.eligible === false) {
        r.reasons.forEach((k) => lines.push(rules.reasons[k]));
        resultText = 'el buque no puede intentar la reparación';
      } else {
        lines.push(`1d10 = ${state.roll}; REP del puerto = ${state.rep}. La reparación tiene éxito si la tirada es menor que REP.`);
        lines.push(r.success ? rules.texts.repair_success : rules.texts.repair_failure);
        resultText = r.success ? 'reparación con éxito' : 'reparación fallida';
      }
    } else if (c.kind === 'decay') {
      lines.push(`Nodo de Suministro Ordinario de nivel ${state.nodeLevel}; ${state.nodeProvided === 'yes' ? 'ha dado garantía logística en esta fase' : 'no ha dado garantía logística en esta fase'}.`);
      lines.push(!c.r.changed ? rules.texts.node_decay_unchanged : (c.r.eliminated ? rules.texts.node_decay_eliminated : rules.texts.node_decay_rule));
      resultText = c.r.eliminated ? 'el Nodo se elimina (nivel 0)' : `el Nodo queda en nivel ${c.r.newLevel}`;
    } else if (c.kind === 'emergency') {
      lines.push(`Valor de Reparación Rápida (RR) ${state.rr}; marcadores de «Instalaciones Inutilizadas» ${state.markers}.`);
      resultText = `se eliminan ${c.r.removed} marcadores y quedan ${c.r.remaining}`;
      lines.push(rules.texts.emergency_when);
    } else {
      lines.push(`Munición restante ${state.remaining}; valor de ataque del plan ${state.attackValue}.`);
      if (c.r.exhausted) lines.push(rules.texts.depletion_zero);
      else if (c.r.reduced) lines.push(rules.texts.depletion_reduced);
      resultText = `valor de ataque efectivo ${c.r.effective}`;
    }
    return { lines, resultText };
  }

  function renderStepResult(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const c = compute();
    if (!isComplete(c)) {
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
    if (c.kind === 'resupply') wrap.appendChild(el('p', 'source-refs', rules.texts.ammo_reset_new_turn));
    rules.afterRules.forEach((t) => wrap.appendChild(el('p', 'source-refs', t)));
    wrap.appendChild(el('p', 'source-refs', rules.notModeled));

    const fullSummaryText = [`Logística de puerto: ${title}`, ...lines, `Resultado: ${resultText}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'port_logistics', workflowTitle: 'Logística de puerto y munición', summaryText: fullSummaryText, state });
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
  root.Views.PortLogisticsWizard = { render: renderPortLogisticsWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
