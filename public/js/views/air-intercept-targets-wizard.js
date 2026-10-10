// Wizard: Asignación de Objetivos del Combate BVR y retirada previa de una
// Interceptación de Combate Aéreo (roadmap Fase 11; data/workflows/
// 05_combate_aereo.json `interceptionRules` + public/js/air-intercept-targets-engine.js).
// Sigue el Decision Book §7.16.1-§7.16.2 (pp. 143-144): quién elige y en qué
// orden, emparejamiento 1 contra 1, quién se queda fuera del BVR y quién
// puede retirarse antes. Cada duelo resultante se resuelve después en el
// wizard BVR (uno por ejecución) y el resto de la batalla en el WVR.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, makeTextField, makeNumberField, makeOptionGroup, wizardActionRow, wizardNavButton
  } = AppCore;

  const WIZARD_STEPS = ['Participantes', 'Selección de objetivos', 'Duelos BVR y retirada'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];
  const SIDES = ['A', 'B'];

  let unitCounter = 0;
  function freshUnit(side) {
    unitCounter += 1;
    return { id: `t${Date.now().toString(36)}${unitCounter}`, side, name: '', electronic: '', detected: 'no', ew: 'no', airToAir: 'yes', lowAltitude: 'no', sustainedFlown: 'no', transport: 'no' };
  }

  function freshState() {
    return {
      step: 0,
      initiatorSide: '',
      context: 'air_combat',
      penetratorSide: '',
      sides: { A: { label: 'Bando A', eea: 'no' }, B: { label: 'Bando B', eea: 'no' } },
      units: [freshUnit('A'), freshUnit('B')],
      choices: [],
      discardedNote: false,
      turnResolutionId: null
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    // Historiales anteriores a la interceptación de penetración.
    if (!state.context) { state.context = 'air_combat'; state.penetratorSide = ''; }
    state.units.forEach((u) => { if (!u.ew) u.ew = 'no'; });
    state.step = 2;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'air-intercept-targets', type: 'air_intercept_targets', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  const sideName = (k) => state.sides[k].label || `Bando ${k}`;
  const unitsOf = (k) => state.units.filter((u) => u.side === k);
  function unitLabel(u) {
    const idx = unitsOf(u.side).indexOf(u);
    return u.name || `${u.side}${idx + 1}`;
  }
  const byId = (id) => state.units.find((u) => u.id === id);

  // Cambiar participantes invalida las elecciones ya hechas: se descartan de
  // forma explícita (AGENTS.md §9.2).
  function participantsChanged() {
    if (state.choices.length) { state.choices = []; state.discardedNote = true; }
  }

  function engineUnits() {
    return state.units.map((u) => ({
      id: u.id, side: u.side, name: unitLabel(u), electronic: u.electronic, detected: u.detected === 'yes', ew: u.ew === 'yes',
      airToAir: u.airToAir === 'yes', lowAltitude: u.lowAltitude === 'yes', sustainedFlown: u.sustainedFlown === 'yes', transport: u.transport === 'yes'
    }));
  }

  function participantsComplete() {
    if (state.context === 'penetration' && state.penetratorSide === '') return false;
    return state.initiatorSide !== '' && SIDES.every((k) => unitsOf(k).length > 0)
      && state.units.every((u) => u.electronic !== '' && !Number.isNaN(Number(u.electronic)));
  }

  function compute() {
    const units = engineUnits();
    const sel = AirInterceptTargetsEngine.selectionOrder(units, { eeaA: state.sides.A.eea === 'yes', eeaB: state.sides.B.eea === 'yes', initiatorSide: state.initiatorSide, context: state.context, penetratorSide: state.penetratorSide });
    const applied = AirInterceptTargetsEngine.applySelections(units, sel.order, state.choices);
    return { units, sel, applied };
  }

  async function renderAirInterceptTargetsWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('air-intercept-targets', state, freshState);
    linkToTurnContextIfNeeded(state, 'Asignación de objetivos BVR');
    AppCore.persistWizardDraft('air-intercept-targets', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Asignación de objetivos BVR']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';
    let workflow;
    try {
      workflow = await loadWorkflow('05_combate_aereo.json');
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;
    const rules = workflow.interceptionRules;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Interceptación aérea: asignación de objetivos BVR y retirada'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §7.16.1-§7.16.2. Organiza quién combate contra quién en BVR; cada duelo se resuelve luego en el wizard de combate aéreo BVR y el resto de la batalla en el de combate cercano WVR.'));

    const rerender = () => { renderAirInterceptTargetsWizard(); };

    AppCore.mountWizardDraft('air-intercept-targets', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    [
      () => renderStepParticipants(wrap, rules, rerender),
      () => renderStepSelection(wrap, rules, rerender),
      () => renderStepResult(wrap, rules, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Participantes ----------
  function renderStepParticipants(wrap, rules, rerender) {
    const ta = rules.targetAssignment;
    wrap.appendChild(el('h2', null, 'Participantes'));
    if (state.discardedNote) {
      wrap.appendChild(el('p', 'pending-note', 'Has cambiado los participantes: se han descartado las elecciones de objetivo que ya estaban hechas.'));
    }
    wrap.appendChild(el('p', 'source-refs', ta.eea));
    wrap.appendChild(el('p', 'source-refs', ta.priority));
    // Grupo de misión compartido: cargar los participantes en combate o guardar los de este asistente.
    wrap.appendChild(wizardNavButton('Cargar el grupo de misión', 'secondary', () => {
      const group = AppCore.loadAirGroup();
      const loaded = AirMissionGroup.toInterceptState(group);
      if (!loaded.units.length) { alert('El grupo de misión no tiene unidades en combate. Edítalo en «Grupo de misión aéreo».'); return; }
      SIDES.forEach((k) => { state.sides[k] = { label: loaded.sides[k].label, eea: loaded.sides[k].eea }; });
      state.units = loaded.units;
      participantsChanged();
      rerender();
    }));
    wrap.appendChild(wizardNavButton('Guardar estos participantes en el grupo de misión', 'secondary', () => {
      AppCore.saveAirGroup(AirMissionGroup.mergeIntercept(AppCore.loadAirGroup(), state));
      alert('Participantes guardados en el grupo de misión.');
    }));
    wrap.appendChild(makeOptionGroup({ prompt: 'Tipo de interceptación.', options: [{ value: 'air_combat', label: 'Interceptación de Combate Aéreo' }, { value: 'penetration', label: 'Interceptación de Penetración' }] }, state.context, (v) => { state.context = v; if (v !== 'penetration') state.penetratorSide = ''; participantsChanged(); rerender(); }));
    if (state.context === 'penetration') {
      wrap.appendChild(el('p', 'source-refs', ta.penetrationEea.rule));
      wrap.appendChild(el('p', 'source-refs', ta.penetrationEea.note));
      wrap.appendChild(makeOptionGroup({ prompt: '¿Qué bando es el que penetra (el interceptado)?', options: SIDES.map((k) => ({ value: k, label: sideName(k) })) }, state.penetratorSide, (v) => { state.penetratorSide = v; participantsChanged(); rerender(); }));
    }
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué bando inició el combate aéreo?', options: SIDES.map((k) => ({ value: k, label: sideName(k) })) }, state.initiatorSide, (v) => { state.initiatorSide = v; participantsChanged(); rerender(); }));

    SIDES.forEach((k) => {
      const s = state.sides[k];
      wrap.appendChild(el('h3', null, sideName(k)));
      wrap.appendChild(makeTextField(`${k}: nombre (opcional)`, s.label, (v) => { s.label = v; }));
      wrap.appendChild(makeOptionGroup({ prompt: `${k}: ¿tiene escolta electrónica (EEA)?`, options: YES_NO }, s.eea, (v) => { s.eea = v; participantsChanged(); rerender(); }));
      unitsOf(k).forEach((u, idx) => {
        const n = idx + 1;
        const row = el('div', 'wizard-unit');
        row.appendChild(el('p', 'wizard-question__prompt', `${k} · ${unitLabel(u)}`));
        row.appendChild(makeTextField(`${k} · unidad ${n}: nombre`, u.name, (v) => { u.name = v; }));
        row.appendChild(makeNumberField(`${k} · unidad ${n}: Valor Electrónico`, u.electronic, (v) => { u.electronic = v; }, () => { participantsChanged(); rerender(); }, { visualRef: 'air-electronic-value' }));
        row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${n}: ¿detectada por el enemigo?`, options: YES_NO }, u.detected, (v) => { u.detected = v; participantsChanged(); rerender(); }));
        if (state.context === 'penetration' && state.penetratorSide === k && s.eea === 'yes') {
          row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${n}: ¿es el avión de guerra electrónica con escolta?`, options: YES_NO }, u.ew, (v) => { u.ew = v; participantsChanged(); rerender(); }));
        }
        row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${n}: ¿en misión aire-aire (CAPs, INK, Despegue de Emergencia)?`, options: YES_NO }, u.airToAir, (v) => { u.airToAir = v; rerender(); }));
        if (u.airToAir === 'no') {
          row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${n}: ¿unidad de baja altitud?`, options: YES_NO }, u.lowAltitude, (v) => { u.lowAltitude = v; rerender(); }));
          row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${n}: ¿Vuelo Sostenido en estado "Volado"?`, options: YES_NO }, u.sustainedFlown, (v) => { u.sustainedFlown = v; rerender(); }));
          row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${n}: ¿grupo de Transporte Aéreo o Lanzamiento de Suministros?`, options: YES_NO }, u.transport, (v) => { u.transport = v; rerender(); }));
        }
        if (unitsOf(k).length > 1) {
          row.appendChild(wizardNavButton('Quitar unidad', 'secondary', () => { state.units.splice(state.units.indexOf(u), 1); participantsChanged(); rerender(); }));
        }
        wrap.appendChild(row);
      });
      wrap.appendChild(wizardNavButton(`+ Añadir unidad a ${sideName(k)}`, 'secondary', () => { state.units.push(freshUnit(k)); participantsChanged(); rerender(); }));
    });

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!participantsComplete()) { alert('Indica quién inició el combate y el Valor Electrónico de cada unidad.'); return; }
        state.discardedNote = false;
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Selección ----------
  function renderStepSelection(wrap, rules, rerender) {
    const ta = rules.targetAssignment;
    wrap.appendChild(el('h2', null, 'Selección de objetivos'));
    let c;
    try { c = compute(); } catch (err) {
      wrap.appendChild(el('p', 'pending-note', `No se pudo calcular el orden: ${err.message}`));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const { sel, applied } = c;
    wrap.appendChild(el('p', 'wizard-modifier-summary__total', sel.mode.mode === 'eea_penetration'
      ? `Interceptación de penetración: el avión de guerra electrónica de ${sideName(sel.mode.side)} elige primero; después se sigue la prioridad.`
      : sel.mode.mode === 'eea'
      ? `Solo ${sideName(sel.mode.side)} tiene escolta electrónica: elige los objetivos de sus unidades.`
      : 'Ambos bandos o ninguno tienen escolta electrónica: se elige por prioridad (no detectadas primero, Valor Electrónico más alto, empate entre bandos para quien inició).'));
    if (sel.mode.mode === 'eea') wrap.appendChild(el('p', 'source-refs', 'Las unidades del bando con escolta eligen en el orden en que las has listado; la fuente no fija otro.'));

    const orderBox = el('div', 'wizard-modifier-summary');
    orderBox.appendChild(el('span', 'wizard-modifier-summary__total', 'Orden de elección'));
    sel.order.forEach((o, i) => {
      const u = byId(o.id);
      orderBox.appendChild(el('span', null, `${i + 1}. ${unitLabel(u)} (${sideName(u.side)}, V.E. ${u.electronic}${o.tier ? `, ${o.tier === 1 ? 'no detectada' : 'detectada'}` : ''})${o.tieWithinSide ? ' — empate de V.E. en su bando: se respeta el orden listado' : ''}`));
    });
    wrap.appendChild(orderBox);

    applied.pairs.forEach((p) => {
      wrap.appendChild(el('p', 'turn-view__desc', `✓ ${unitLabel(byId(p.chooserId))} (${sideName(byId(p.chooserId).side)}) elige a ${unitLabel(byId(p.targetId))}.`));
    });
    applied.passed.forEach((id) => wrap.appendChild(el('p', 'source-refs', `${unitLabel(byId(id))} renuncia a elegir.`)));

    if (applied.next) {
      const chooser = byId(applied.next.chooserId);
      const q = el('div', 'wizard-question');
      q.appendChild(el('p', 'wizard-question__prompt', `Elige ${unitLabel(chooser)} (${sideName(chooser.side)}):`));
      const opts = el('div', 'wizard-question__options');
      applied.next.available.forEach((id) => {
        opts.appendChild(wizardNavButton(`Elegir ${unitLabel(byId(id))}`, 'secondary', () => { state.choices.push({ chooserId: chooser.id, targetId: id }); rerender(); }));
      });
      opts.appendChild(wizardNavButton('Renunciar', 'secondary', () => { state.choices.push({ chooserId: chooser.id, targetId: null }); rerender(); }));
      q.appendChild(opts);
      wrap.appendChild(q);
      wrap.appendChild(el('p', 'source-refs', ta.pass));
    } else {
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', 'Asignación terminada.'));
    }
    wrap.appendChild(el('p', 'source-refs', ta.oneOpponent));
    wrap.appendChild(el('p', 'source-refs', ta.stop));

    const buttons = [wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); })];
    if (state.choices.length) buttons.push(wizardNavButton('↶ Deshacer última elección', 'secondary', () => { state.choices.pop(); rerender(); }));
    buttons.push(wizardNavButton('Ver duelos →', 'primary', () => {
      if (!applied.done) { alert('Termina la selección de objetivos.'); return; }
      state.step = 2;
      rerender();
    }));
    wrap.appendChild(wizardActionRow(buttons));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Duelos y retirada ----------
  function renderStepResult(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Duelos BVR y retirada'));
    let c;
    try { c = compute(); } catch (err) { c = null; }
    if (!c || !c.applied.done) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const { units, applied } = c;
    const lines = [];
    applied.pairs.forEach((p, i) => {
      lines.push(`Duelo ${i + 1}: ${unitLabel(byId(p.chooserId))} (${sideName(byId(p.chooserId).side)}) contra ${unitLabel(byId(p.targetId))} (${sideName(byId(p.targetId).side)}).`);
    });
    if (!applied.pairs.length) lines.push('No hay duelos BVR: nadie ha elegido objetivo.');
    if (applied.nonParticipants.length) lines.push(`No participan en el BVR: ${applied.nonParticipants.map((id) => unitLabel(byId(id))).join(', ')}.`);

    const pre = rules.preBvrWithdrawal;
    const transportGroupTargeted = { A: false, B: false };
    units.forEach((u) => { if (u.transport && applied.targetedIds.includes(u.id)) transportGroupTargeted[u.side] = true; });
    const withdrawLines = units.map((u) => {
      const block = AirInterceptTargetsEngine.preBvrWithdrawalBlock(u, { targetedIds: applied.targetedIds, transportGroupTargeted });
      if (block === 'airToAir') return `${u.name}: misión aire-aire, la retirada inmediata no aplica.`;
      if (block) return `${u.name}: no puede retirarse antes del BVR (${pre.exceptions[block]}).`;
      return `${u.name}: puede retirarse ahora y "Regresar".`;
    });
    lines.push(...withdrawLines);

    const box = el('div', 'wizard-modifier-summary');
    lines.forEach((l) => box.appendChild(el('span', null, l)));
    wrap.appendChild(box);
    const resultText = `${applied.pairs.length} duelo(s) BVR${applied.nonParticipants.length ? `, ${applied.nonParticipants.length} unidad(es) fuera del BVR` : ''}`;
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    wrap.appendChild(el('p', 'source-refs', pre.rule));
    if (units.some((u) => u.transport)) wrap.appendChild(el('p', 'source-refs', pre.transportNote));
    wrap.appendChild(el('p', 'turn-view__desc', rules.afterBvr));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Resolver un duelo en el wizard BVR →', 'secondary', () => { location.hash = '#/wizard/air-combat-bvr'; }),
      wizardNavButton('Ir al combate cercano WVR →', 'secondary', () => { location.hash = '#/wizard/air-combat-wvr'; })
    ]));

    const fullSummaryText = ['Asignación de objetivos BVR', ...lines, `Resultado: ${resultText}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'air_intercept_targets', workflowTitle: 'Asignación de objetivos BVR', summaryText: fullSummaryText, state });
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
  root.Views.AirInterceptTargetsWizard = { render: renderAirInterceptTargetsWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
