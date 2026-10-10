// Wizard de combate: Búsqueda por Diferencia de Firma (roadmap Fase 13;
// data/workflows/13_busqueda_asw_apoyo.json, etapa `signature_search`, +
// data/tables/page-33.json + public/js/asw-signature-search-engine.js).
// Decision Book §9.14.2, §9.15.1 y §9.15.3 (Pasos 1-7, pp. 214-218).
//
// El motor puro elige la columna (Firma del submarino buscador, o forma del
// marco del Valor ASW + profundidad si busca una unidad de superficie), busca
// la Firma del objetivo en esa columna y lee a la derecha el rango de
// descubrimiento. El texto de las reglas y de las restricciones se lee del
// workflow; los iconos de los marcos son recortes de la página 33 (apoyo
// visual, no fuente de cálculo).
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage,
    makeNumberField, makeOptionGroup, makeSelectFromValues,
    wizardActionRow, wizardNavButton, renderGrid
  } = AppCore;

  const WIZARD_STEPS = ['Buscador y activación', 'Objetivo y distancia', 'Tirada', 'Resultado'];
  const DIE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return {
      step: 0,
      searcherKind: '',
      trigger: '',
      highSpeed: 'no',
      frame: '',
      frameClosed: '',
      searcherSignature: '',
      depth: '',
      targetSignature: '',
      targetMoving: '',
      distance: '',
      roll: '',
      turnResolutionId: null
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 3;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'asw-signature-search', type: 'asw_signature_search', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  const stageOf = (workflow) => workflow.stages.find((st) => st.id === 'signature_search');
  const questionOf = (workflow, id) => stageOf(workflow).questions.find((q) => q.id === id);
  const optionLabel = (workflow, qId, value) => (questionOf(workflow, qId).options.find((o) => o.value === value) || {}).label || value;
  const restrictionText = (workflow, id) => stageOf(workflow).restrictions.find((r) => r.id === id).text;

  function searcherReady() {
    if (state.searcherKind === '' || state.trigger === '') return false;
    if (state.searcherKind === 'submarine') return state.searcherSignature !== '' && !Number.isNaN(Number(state.searcherSignature));
    return state.frame !== '' && state.frameClosed !== '';
  }

  function targetReady() {
    return state.depth !== '' && state.targetSignature !== '' && !Number.isNaN(Number(state.targetSignature))
      && state.targetMoving !== '' && state.distance !== '';
  }

  function engineInput() {
    return {
      searcherKind: state.searcherKind, searcherSignature: state.searcherSignature, frame: state.frame, depth: state.depth,
      trigger: state.trigger, distance: state.distance, targetSignature: state.targetSignature,
      targetMoving: state.targetMoving === 'yes', roll: state.roll
    };
  }

  function restrictions() {
    return AswSignatureSearchEngine.checkRestrictions({
      searcherKind: state.searcherKind, trigger: state.trigger, highSpeed: state.highSpeed, frameClosed: state.frameClosed,
      depth: state.depth, distance: state.distance
    });
  }

  // Resuelve con lo introducido; null mientras falte algo, {error} si el motor rechaza.
  function computeSearch(table) {
    if (!searcherReady() || !targetReady()) return null;
    try {
      const check = restrictions();
      const result = check.allowed ? AswSignatureSearchEngine.resolveSignatureSearch(table, TableEngine, engineInput()) : null;
      return { check, result };
    } catch (err) {
      return { error: err };
    }
  }

  async function renderAswSignatureSearchWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('asw-signature-search', state, freshState);
    linkToTurnContextIfNeeded(state, 'Búsqueda por Diferencia de Firma');
    AppCore.persistWizardDraft('asw-signature-search', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Búsqueda por Diferencia de Firma']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let page33;
    try {
      [workflow, page33] = await Promise.all([loadWorkflow('13_busqueda_asw_apoyo.json'), loadTablePage('page-33.json')]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    const ctx = { workflow, page33, table: page33.tables.find((t) => t.id === 'asw-signature-difference-search') };

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Búsqueda por Diferencia de Firma'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Tablas-de-combate 5.pdf, pág. 33 · Decision Book §9.14.2, §9.15.1 y §9.15.3. Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.'));

    const rerender = () => { renderAswSignatureSearchWizard(); };

    AppCore.mountWizardDraft('asw-signature-search', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    [
      () => renderStepSearcher(wrap, ctx, rerender),
      () => renderStepTarget(wrap, ctx, rerender),
      () => renderStepRoll(wrap, ctx, rerender),
      () => renderStepResult(wrap, ctx, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Buscador y activación ----------
  function renderStepSearcher(wrap, ctx, rerender) {
    const { workflow, page33 } = ctx;
    const stage = stageOf(workflow);
    const qTrigger = questionOf(workflow, 'trigger');
    wrap.appendChild(el('h2', null, 'Buscador y activación'));
    wrap.appendChild(wizardNavButton('Ver la tabla de Búsqueda por Diferencia de Firma (pág. 33)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-33.json/asw-signature-difference-search';
    }));

    wrap.appendChild(makeOptionGroup(questionOf(workflow, 'searcher_kind'), state.searcherKind, (v) => { state.searcherKind = v; state.roll = ''; rerender(); }));
    wrap.appendChild(makeOptionGroup(qTrigger, state.trigger, (v) => { state.trigger = v; state.roll = ''; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qTrigger.note));

    if (state.searcherKind === 'submarine') {
      const q = questionOf(workflow, 'searcher_signature');
      wrap.appendChild(makeNumberField(q.prompt, state.searcherSignature, (v) => { state.searcherSignature = v; }, () => { state.roll = ''; rerender(); }));
      wrap.appendChild(el('p', 'source-refs', q.note));
    } else if (state.searcherKind === 'surface') {
      const qFrame = questionOf(workflow, 'surface_frame');
      const row = el('div', 'frame-gallery');
      page33.surfaceFrames.forEach((f) => {
        const fig = el('figure', 'frame-gallery__item');
        const img = document.createElement('img');
        img.src = `/data/tables/${f.image}`;
        img.alt = f.description;
        img.className = 'frame-gallery__img';
        fig.appendChild(img);
        fig.appendChild(el('figcaption', 'source-refs', `${f.id}. ${f.label}`));
        row.appendChild(fig);
      });
      wrap.appendChild(row);
      wrap.appendChild(makeOptionGroup(qFrame, state.frame, (v) => { state.frame = v; state.roll = ''; rerender(); }));
      wrap.appendChild(el('p', 'pending-note', page33.surfaceFramesNote));
      wrap.appendChild(el('p', 'source-refs', qFrame.note));
      const qClosed = questionOf(workflow, 'frame_closed');
      wrap.appendChild(makeOptionGroup(Object.assign({}, qClosed, { options: YES_NO }), state.frameClosed, (v) => { state.frameClosed = v; rerender(); }));
      wrap.appendChild(el('p', 'source-refs', qClosed.note));
      wrap.appendChild(makeOptionGroup({ prompt: '¿La formación de superficie está en estado de Alta Velocidad?', options: YES_NO }, state.highSpeed, (v) => { state.highSpeed = v; rerender(); }));
      if (state.trigger === 'routine_movement' && state.highSpeed === 'yes') {
        wrap.appendChild(el('p', 'pending-note', `No se puede realizar esta búsqueda: ${restrictionText(workflow, 'high_speed_no_routine')}`));
      }
    }
    wrap.appendChild(el('p', 'source-refs', stage.unitSelection.text));

    const blocked = state.searcherKind === 'surface' && state.trigger === 'routine_movement' && state.highSpeed === 'yes';
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!searcherReady()) { alert('Indica quién busca, qué activó la búsqueda y la Firma del submarino (o el marco del Valor ASW y si es cerrado).'); return; }
        if (blocked) { alert('Una formación a Alta Velocidad no puede realizar Búsquedas de Rutina.'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Objetivo y distancia ----------
  function renderStepTarget(wrap, ctx, rerender) {
    const { workflow } = ctx;
    const qDepth = questionOf(workflow, 'target_depth');
    const qSig = questionOf(workflow, 'target_signature');
    const qMoving = questionOf(workflow, 'target_moving');
    const qDistance = questionOf(workflow, 'distance');

    wrap.appendChild(el('h2', null, 'Objetivo y distancia'));
    wrap.appendChild(makeOptionGroup(qDepth, state.depth, (v) => { state.depth = v; state.roll = ''; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qDepth.note));
    wrap.appendChild(makeNumberField(qSig.prompt, state.targetSignature, (v) => { state.targetSignature = v; }, () => { state.roll = ''; rerender(); }));
    wrap.appendChild(makeOptionGroup(Object.assign({}, qMoving, { options: YES_NO }), state.targetMoving, (v) => { state.targetMoving = v; state.roll = ''; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qMoving.note));
    wrap.appendChild(makeOptionGroup(qDistance, state.distance, (v) => { state.distance = v; state.roll = ''; rerender(); }));

    let blocked = false;
    if (state.depth !== '' && state.distance !== '') {
      const check = restrictions();
      if (!check.allowed) {
        blocked = true;
        check.blocking.forEach((id) => wrap.appendChild(el('p', 'pending-note', `No se puede realizar esta búsqueda: ${restrictionText(workflow, id)}`)));
      }
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!targetReady()) { alert('Completa la profundidad, la Firma del objetivo, si está En Movimiento y la distancia.'); return; }
        if (blocked) { alert('Las condiciones de la búsqueda no permiten esta distancia (ver los motivos en pantalla).'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  function rangeText(r) {
    return r.cell.rawCell === '.' ? 'sin detección' : `rango ${r.cell.rawCell}`;
  }

  // ---------- Paso 3: Tirada ----------
  function renderStepRoll(wrap, ctx, rerender) {
    const { workflow, table } = ctx;
    wrap.appendChild(el('h2', null, 'Tirada de búsqueda'));
    wrap.appendChild(el('p', 'source-refs', stageOf(workflow).resolutionRule.text));
    const search = computeSearch(table);
    if (search && search.error) {
      wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${search.error.message}`));
    } else if (search && search.result) {
      const r = search.result;
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', r.noRow
        ? `La Firma ${r.effectiveSignature} no aparece en la columna «${r.columnLabel}»: la tabla no da rango de descubrimiento.`
        : `Columna «${r.columnLabel}»: Firma ${r.effectiveSignature} → fila ${r.rowIndex} (celda «${r.searchCell.rawCell}»); rango de descubrimiento «${r.rangeColumnLabel}»: ${r.cell.rawCell === '.' ? 'sin detección' : r.cell.rawCell}.`));
    }
    wrap.appendChild(makeSelectFromValues('Tirada (1d10)', DIE_VALUES, state.roll, (v) => { state.roll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => { state.roll = String(Math.floor(Math.random() * 10)); rerender(); }));
    const result = search && search.result && !search.result.noRow && state.roll !== '' ? search.result : null;
    if (result) {
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Tirada ${state.roll} → ${result.success ? 'la búsqueda tiene éxito' : 'la búsqueda falla'}.`));
    }

    const canAdvance = !!result;
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
  function renderStepResult(wrap, ctx, rerender) {
    const { workflow, table } = ctx;
    wrap.appendChild(el('h2', null, 'Resultado'));
    const search = computeSearch(table);
    if (!search || search.error || !search.result || search.result.noRow || state.roll === '') {
      wrap.appendChild(el('p', 'pending-note', search && search.error ? `No se pudo resolver: ${search.error.message}` : 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 2; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const r = search.result;
    const searcherText = state.searcherKind === 'submarine'
      ? `Submarino buscador con Firma ${state.searcherSignature}`
      : `Unidad de superficie con marco del Valor ASW ${state.frame} (${(ctx.page33.surfaceFrames.find((f) => f.id === state.frame) || {}).label})${state.frameClosed === 'yes' ? ', cerrado' : ', abierto'}`;
    const summaryLines = [
      `${searcherText}. Activación: ${optionLabel(workflow, 'trigger', state.trigger)}.`,
      `Objetivo en ${optionLabel(workflow, 'target_depth', state.depth)}; Firma ${state.targetSignature}${state.targetMoving === 'yes' ? ' +1 por estar En Movimiento' : ''} = ${r.effectiveSignature}. Distancia: ${optionLabel(workflow, 'distance', state.distance)}.`,
      `Tabla (pág. 33): columna «${r.columnLabel}», fila ${r.rowIndex} (celda «${r.searchCell.rawCell}») → columna del rango «${r.rangeColumnLabel}» = ${r.cell.rawCell === '.' ? 'sin detección' : r.cell.rawCell}; tirada ${state.roll}.`
    ];
    const resultText = r.success
      ? 'la búsqueda tiene éxito — el submarino queda Expuesto (o falla su intento de Evasión)'
      : 'la búsqueda falla';

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    if (r.success) {
      wrap.appendChild(el('p', 'source-refs', 'Voltea la ficha al lado Expuesto sin moverla en el mapa; la formación o unidad que lo detecta puede realizar de inmediato un Ataque Antisubmarino contra él (§9.15.5).'));
    }
    wrap.appendChild(el('p', 'source-refs', stageOf(workflow).resolutionRule.text));
    wrap.appendChild(renderGrid(table, table.rowAxis.values, table.columnAxis.values, r.cell));
    wrap.appendChild(el('p', 'source-refs', 'La celda resaltada es la del rango de descubrimiento. Columnas: «sub-N» = submarino buscador con Firma N; «supM-pK» = unidad de superficie con marco M y profundidad P.K; «rango1/rango2» = Rutina/Movimiento/Emboscada o Después del Ataque/Antes de la Evasión (HEX = misma casilla, ADYAC = adyacente).'));

    const fullSummaryText = ['Búsqueda por Diferencia de Firma', ...summaryLines, `Resultado: ${resultText}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'asw_signature_search', workflowTitle: 'Búsqueda por Diferencia de Firma', summaryText: fullSummaryText, state });
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
  root.Views.AswSignatureSearchWizard = { render: renderAswSignatureSearchWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
