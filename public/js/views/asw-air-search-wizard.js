// Wizard de combate: Búsqueda Aérea ASW (roadmap Fase 13; data/workflows/
// 13_busqueda_asw_apoyo.json + data/tables/page-34.json +
// public/js/asw-air-search-engine.js). Decision Book §9.14.3 (eventos) y
// §9.15.4 (Pasos 1-5). La Búsqueda por Diferencia de Firma (página 33) tiene su
// propio wizard (views/asw-signature-search-wizard.js).
//
// El motor puro suma los Valores de Detección Aérea que pueden buscar, aplica
// las restricciones, lee la fila de Firma según la profundidad y resuelve el
// rango de descubrimiento; el texto de las restricciones se lee del workflow.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage,
    makeNumberField, makeOptionGroup, makeSelectFromValues,
    wizardActionRow, wizardNavButton, renderGrid
  } = AppCore;

  const WIZARD_STEPS = ['Evento y objetivo', 'Unidades que buscan', 'Tirada', 'Resultado'];
  const DIE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return {
      step: 0,
      event: '',
      targetInEnemyCapZone: '',
      depth: '',
      targetSignature: '',
      targetMoving: '',
      units: [{ airValue: '', highSpeed: 'no', inEnemyCapZone: 'no' }],
      roll: ''
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 3;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'asw-air-search', type: 'asw_search_support', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  function airStage(workflow) {
    return workflow.stages.find((st) => st.id === 'air_search');
  }

  function getQuestion(workflow, questionId) {
    return airStage(workflow).questions.find((q) => q.id === questionId);
  }

  function eventQuestion(workflow) {
    return workflow.stages[0].questions.find((q) => q.id === 'event');
  }

  function restrictionText(workflow, id) {
    return airStage(workflow).restrictions.find((r) => r.id === id).text;
  }

  function unitsForEngine() {
    return state.units.map((u) => ({ airValue: u.airValue, highSpeed: u.highSpeed === 'yes', inEnemyCapZone: u.inEnemyCapZone === 'yes' }));
  }

  function targetReady() {
    return state.event !== '' && state.targetInEnemyCapZone !== '' && state.depth !== ''
      && state.targetSignature !== '' && !Number.isNaN(Number(state.targetSignature)) && state.targetMoving !== '';
  }

  function unitsReady() {
    return state.units.length > 0 && state.units.every((u) => u.airValue !== '' && !Number.isNaN(Number(u.airValue)));
  }

  // Resuelve con lo introducido; null mientras falte algo, {error} si el motor rechaza.
  function computeSearch(workflow, tables) {
    if (!targetReady() || !unitsReady()) return null;
    try {
      const restrictions = AswAirSearchEngine.checkTargetRestrictions({ event: state.event, targetInEnemyCapZone: state.targetInEnemyCapZone, depth: state.depth });
      const sum = AswAirSearchEngine.sumAirValue(unitsForEngine(), state.event);
      const tableId = eventQuestion(workflow).options.find((o) => o.value === state.event).airSearchTable;
      const table = tables[tableId];
      const result = state.roll === '' || !restrictions.allowed ? null : AswAirSearchEngine.resolveAirSearch(table, TableEngine, {
        depth: state.depth, signature: Number(state.targetSignature), targetMoving: state.targetMoving === 'yes',
        totalAirValue: sum.total, roll: Number(state.roll)
      });
      return { restrictions, sum, table, tableId, result };
    } catch (err) {
      return { error: err };
    }
  }

  async function renderAswAirSearchWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('asw-air-search', state, freshState);
    linkToTurnContextIfNeeded(state, 'Búsqueda Aérea ASW');
    AppCore.persistWizardDraft('asw-air-search', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Búsqueda Aérea ASW']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let page34;
    try {
      [workflow, page34] = await Promise.all([
        loadWorkflow('13_busqueda_asw_apoyo.json'),
        loadTablePage('page-34.json')
      ]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    const tables = {};
    page34.tables.forEach((t) => { tables[t.id] = t; });

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Búsqueda Aérea ASW'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Tablas-de-combate 5.pdf, pág. 34 · Decision Book §9.14.3 y §9.15.4. Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente. La Búsqueda por Diferencia de Firma (pág. 33) tiene su propio wizard.'));

    const rerender = () => { renderAswAirSearchWizard(); };

    AppCore.mountWizardDraft('asw-air-search', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    const stepRenderers = [
      () => renderStepTarget(wrap, workflow, tables, rerender),
      () => renderStepUnits(wrap, workflow, tables, rerender),
      () => renderStepRoll(wrap, workflow, tables, rerender),
      () => renderStepResult(wrap, workflow, tables, rerender)
    ];
    stepRenderers[state.step]();

    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Evento y objetivo ----------
  function renderStepTarget(wrap, workflow, tables, rerender) {
    const stage = airStage(workflow);
    const qEvent = eventQuestion(workflow);
    const qCap = getQuestion(workflow, 'target_in_enemy_cap_zone');
    const qDepth = getQuestion(workflow, 'target_depth');
    const qSig = getQuestion(workflow, 'target_signature');
    const qMoving = getQuestion(workflow, 'target_moving');

    wrap.appendChild(el('h2', null, 'Evento y objetivo'));
    wrap.appendChild(wizardNavButton('Ver tablas de Búsqueda Aérea ASW (pág. 34)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-34.json/asw-air-search-routine';
    }));

    wrap.appendChild(makeOptionGroup(qEvent, state.event, (v) => { state.event = v; state.roll = ''; rerender(); }));
    if (state.event !== '') {
      const rangeKey = ['routine', 'movement', 'pre_ambush'].includes(state.event) ? 'routine_movement_pre_ambush' : 'post_attack_pre_evasion';
      wrap.appendChild(el('p', 'source-refs', `${stage.rangeNotes[rangeKey]} Tabla: ${state.event === 'post_attack' || state.event === 'pre_evasion' ? 'Después del Ataque / Antes de Evadir' : 'Movimiento Submarino / Rutina / Pre-emboscada'}.`));
    }
    wrap.appendChild(makeOptionGroup(Object.assign({}, qCap, { options: YES_NO }), state.targetInEnemyCapZone, (v) => { state.targetInEnemyCapZone = v; rerender(); }));
    wrap.appendChild(makeOptionGroup(qDepth, state.depth, (v) => { state.depth = v; state.roll = ''; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qDepth.note));
    wrap.appendChild(makeNumberField(qSig.prompt, state.targetSignature, (v) => { state.targetSignature = v; }, rerender));
    wrap.appendChild(makeOptionGroup(qMoving, state.targetMoving, (v) => { state.targetMoving = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qMoving.note));

    let blocked = false;
    if (state.event !== '' && state.targetInEnemyCapZone !== '' && state.depth !== '') {
      const check = AswAirSearchEngine.checkTargetRestrictions({ event: state.event, targetInEnemyCapZone: state.targetInEnemyCapZone, depth: state.depth });
      if (!check.allowed) {
        blocked = true;
        check.blocking.forEach((id) => wrap.appendChild(el('p', 'pending-note', `No se puede realizar esta búsqueda: ${restrictionText(workflow, id)}`)));
      }
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!targetReady()) { alert('Completa el evento, la zona de patrulla aérea, la profundidad, la Firma y si el submarino está en movimiento.'); return; }
        if (blocked) { alert('Las condiciones de la búsqueda aérea no permiten esta búsqueda (ver los motivos en pantalla).'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Unidades que buscan ----------
  function renderStepUnits(wrap, workflow, tables, rerender) {
    const stage = airStage(workflow);
    const fields = Object.fromEntries(stage.unitFields.map((f) => [f.id, f]));

    wrap.appendChild(el('h2', null, 'Unidades que buscan'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Las unidades de superficie con Valor de Detección Aérea (helicópteros ASW) y las MPA suman sus valores en una única búsqueda (§9.15.4 Paso 1). Introduce una fila por unidad.'));
    wrap.appendChild(el('p', 'source-refs', fields.airValue.note));

    state.units.forEach((unit, idx) => {
      const row = el('div', 'table-viewer__controls');
      row.appendChild(makeNumberField(`Unidad ${idx + 1}: ${fields.airValue.prompt}`, unit.airValue, (v) => { unit.airValue = v; }, rerender, { visualRef: 'asw-air-detection' }));
      row.appendChild(makeOptionGroup({ prompt: `Unidad ${idx + 1}: ${fields.highSpeed.prompt}`, options: YES_NO }, unit.highSpeed, (v) => { unit.highSpeed = v; rerender(); }));
      row.appendChild(makeOptionGroup({ prompt: `Unidad ${idx + 1}: ${fields.inEnemyCapZone.prompt}`, options: YES_NO }, unit.inEnemyCapZone, (v) => { unit.inEnemyCapZone = v; rerender(); }));
      if (state.units.length > 1) {
        row.appendChild(wizardNavButton('✕ Quitar', 'secondary', () => { state.units.splice(idx, 1); rerender(); }));
      }
      wrap.appendChild(row);
    });
    wrap.appendChild(wizardNavButton('+ Añadir otra unidad', 'secondary', () => { state.units.push({ airValue: '', highSpeed: 'no', inEnemyCapZone: 'no' }); rerender(); }));

    let canAdvance = false;
    const search = computeSearch(workflow, tables);
    if (search && search.error) {
      wrap.appendChild(el('p', 'pending-note', search.error.message));
    } else if (search) {
      const box = el('div', 'wizard-modifier-summary');
      search.sum.contributions.forEach((c) => {
        box.appendChild(el('span', 'source-refs', `Unidad ${c.index + 1} (${c.airValue}): ${c.contributes ? 'suma' : `no suma — ${restrictionText(workflow, c.excludedBy)}`}`));
      });
      box.appendChild(el('span', 'wizard-modifier-summary__total', `Valor de Detección Aérea total: ${search.sum.total}`));
      wrap.appendChild(box);
      canAdvance = true;
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!canAdvance) { alert('Introduce el Valor de Detección Aérea de cada unidad.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Tirada ----------
  function renderStepRoll(wrap, workflow, tables, rerender) {
    wrap.appendChild(el('h2', null, 'Tirada de búsqueda'));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §9.15.4 Pasos 4-5: se cruza el Valor de Detección Aérea total con la Firma del objetivo para obtener el rango de descubrimiento y se tira 1d10.'));
    wrap.appendChild(makeSelectFromValues('Tirada (1d10)', DIE_VALUES, state.roll, (v) => { state.roll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
      state.roll = String(Math.floor(Math.random() * 10));
      rerender();
    }));

    const search = computeSearch(workflow, tables);
    if (search && search.error) {
      wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${search.error.message}`));
    } else if (search && search.result) {
      const r = search.result;
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', r.cell
        ? `Rango de descubrimiento (columna «${r.cell.columnLabel}», fila «${r.cell.rowLabel}»): ${r.cell.rawCell === '.' ? 'sin detección' : r.cell.rawCell}. Tirada ${state.roll} → ${r.success ? 'la búsqueda tiene éxito' : 'la búsqueda falla'}.`
        : r.notes[0]));
    }

    const canAdvance = search && search.result;
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!canAdvance) { alert('Completa la tirada.'); return; }
        state.step = 3;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 4: Resultado ----------
  function renderStepResult(wrap, workflow, tables, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const search = computeSearch(workflow, tables);
    if (!search || search.error || !search.result) {
      wrap.appendChild(el('p', 'pending-note', search && search.error ? `No se pudo resolver: ${search.error.message}` : 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 2; rerender(); }),]));
      wrap.appendChild(backRow());
      return;
    }
    const r = search.result;
    const stage = airStage(workflow);
    const eventLabel = eventQuestion(workflow).options.find((o) => o.value === state.event).label;
    const depthLabel = getQuestion(workflow, 'target_depth').options.find((o) => o.value === state.depth).label;

    const summaryLines = [
      `Evento: ${eventLabel}. Submarino objetivo en ${depthLabel}; Firma ${state.targetSignature}${state.targetMoving === 'yes' ? ' +1 por estar En Movimiento' : ''} = ${r.effectiveSignature}.`,
      `Valor de Detección Aérea total: ${r.totalAirValue} (${search.sum.contributions.filter((c) => c.contributes).length} de ${search.sum.contributions.length} unidad(es) contribuyen).`,
      r.cell ? `Tabla (pág. 34, «${search.tableId === 'asw-air-search-routine' ? 'Movimiento / Rutina / Pre-emboscada' : 'Después del Ataque / Antes de Evadir'}»): fila «${r.cell.rowLabel}», columna «${r.cell.columnLabel}» → ${r.cell.rawCell === '.' ? 'sin detección' : `rango ${r.cell.rawCell}`}; tirada ${state.roll}.` : r.notes[0]
    ];
    const resultText = r.success
      ? 'la búsqueda tiene éxito — el submarino queda Expuesto (o falla su intento de Evasión)'
      : 'la búsqueda falla';

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    if (r.success) {
      wrap.appendChild(el('p', 'source-refs', 'Voltea la ficha al lado Expuesto sin moverla en el mapa; la formación de superficie o la MPA que lo detecta puede realizar de inmediato un Ataque Antisubmarino contra él (§9.15.5).'));
    }
    wrap.appendChild(el('p', 'source-refs', stage.resolutionRule.text));

    if (r.cell) {
      wrap.appendChild(renderGrid(search.table, search.table.rowAxis.alternateLabels[state.depth], search.table.columnAxis.values, r.cell));
      wrap.appendChild(el('p', 'source-refs', `Las filas de la cuadrícula son las etiquetas de Firma de la profundidad elegida; la celda resaltada es la de tu Firma y Valor de Detección Aérea total.`));
    }

    const fullSummaryText = ['Búsqueda Aérea ASW', ...summaryLines, `Resultado: ${resultText}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'asw_search_support', workflowTitle: 'Búsqueda Aérea ASW', summaryText: fullSummaryText, state });
      // COR02-003: guardar la resolución la da por completada.
      unlinkTurnContext(state);
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 2; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => {
        unlinkTurnContext(state);
        state = freshState();
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.AswAirSearchWizard = { render: renderAswAirSearchWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
