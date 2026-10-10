// Wizard de combate: Ataque ASW de submarinos contra submarinos (roadmap
// Fase 13; data/workflows/11_ataque_asw_submarino.json + data/tables/page-30.json
// + AswAttackEngine.resolveSubmarineAswAttack). Decision Book §9.13.2 y §9.17.2.
//
// La fila de la tabla depende de la PROFUNDIDAD del océano de la casilla del
// objetivo (confirmado por el mantenedor, 2026-10-04: la cabecera impresa
// "Firma del atacante 5+/4/0~3" es la clave de P.4/P.3/P.2-1). El motor puro
// elige la banda y aplica la regla del torpedo de hexágono (sin asterisco no
// hay efecto); esta vista solo recoge datos y pinta.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage,
    makeNumberField, makeOptionGroup, makeSelectFromValues,
    wizardActionRow, wizardNavButton, renderGrid, appendFactorIdentificationHint
  } = AppCore;

  const WIZARD_STEPS = ['Datos del ataque', 'Tirada', 'Resultado'];
  const DIE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const POSITION_BY_DEPTH = { p4: 'P4', p3: 'P3', p2_1: 'P2_P1' };

  function freshState() {
    return {
      step: 0,
      waterDepth: '',
      targetSignature: '',
      targetMoving: '',
      torpedoType: '',
      torpedoValue: '',
      targetProtection: '',
      roll: ''
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 2;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'asw-submarine', type: 'asw_submarine', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  function getQuestion(workflow, questionId) {
    return workflow.stages[0].questions.find((q) => q.id === questionId);
  }

  function dataReady() {
    return state.waterDepth !== '' && state.targetSignature !== '' && !Number.isNaN(Number(state.targetSignature))
      && state.targetMoving !== '' && state.torpedoType !== ''
      && state.torpedoValue !== '' && !Number.isNaN(Number(state.torpedoValue));
  }

  // null mientras falte algún dato; {error} si el motor rechaza la combinación.
  function computeAttack(table) {
    if (!dataReady() || state.roll === '') return null;
    try {
      return {
        result: AswAttackEngine.resolveSubmarineAswAttack(table, TableEngine, {
          position: POSITION_BY_DEPTH[state.waterDepth],
          signature: Number(state.targetSignature),
          targetMoving: state.targetMoving === 'yes',
          torpedoValue: Number(state.torpedoValue),
          torpedoType: state.torpedoType,
          roll: Number(state.roll),
          targetProtection: state.targetProtection
        })
      };
    } catch (err) {
      return { error: err };
    }
  }

  async function renderAswSubmarineWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('asw-submarine', state, freshState);
    linkToTurnContextIfNeeded(state, 'Ataque ASW por unidades submarinas');
    AppCore.persistWizardDraft('asw-submarine', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Ataque ASW (submarinos)']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let page30;
    try {
      [workflow, page30] = await Promise.all([
        loadWorkflow('11_ataque_asw_submarino.json'),
        loadTablePage('page-30.json')
      ]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    const table = TableEngine.findTableInPage(page30, 'asw-submarine-vs-submarine-damage').table;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', workflow.title));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', `${workflow.source.document}, pág. ${workflow.source.pages} · Decision Book §9.13.2. Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.`));

    const rerender = () => { renderAswSubmarineWizard(); };

    AppCore.mountWizardDraft('asw-submarine', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    const stepRenderers = [
      () => renderStepData(wrap, workflow, table, rerender),
      () => renderStepRoll(wrap, table, rerender),
      () => renderStepResult(wrap, workflow, table, rerender)
    ];
    stepRenderers[state.step]();

    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Datos del ataque ----------
  function renderStepData(wrap, workflow, table, rerender) {
    const qDepth = getQuestion(workflow, 'water_depth');
    const qSig = getQuestion(workflow, 'target_signature');
    const qMoving = getQuestion(workflow, 'target_moving');
    const qType = getQuestion(workflow, 'torpedo_type');
    const qValue = getQuestion(workflow, 'torpedo_attack_value');
    const qProtection = getQuestion(workflow, 'target_protection');

    wrap.appendChild(el('h2', null, 'Datos del ataque'));
    wrap.appendChild(el('p', 'pending-note', workflow.stages[0].specialRules));
    wrap.appendChild(wizardNavButton('Ver tabla de Ataque ASW de submarinos (pág. 30)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-30.json/asw-submarine-vs-submarine-damage';
    }));

    wrap.appendChild(makeOptionGroup(qDepth, state.waterDepth, (v) => { state.waterDepth = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qDepth.note));
    wrap.appendChild(makeNumberField(qSig.prompt, state.targetSignature, (v) => { state.targetSignature = v; }, rerender));
    wrap.appendChild(el('p', 'source-refs', qSig.note));
    wrap.appendChild(makeOptionGroup(qMoving, state.targetMoving, (v) => { state.targetMoving = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qMoving.note));
    wrap.appendChild(makeOptionGroup(qType, state.torpedoType, (v) => { state.torpedoType = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qType.note));
    wrap.appendChild(makeNumberField(qValue.prompt, state.torpedoValue, (v) => { state.torpedoValue = v; }, rerender));
    appendFactorIdentificationHint(wrap, 'submarine-hidden', 'torpedoes');
    wrap.appendChild(makeNumberField(qProtection.prompt, state.targetProtection, (v) => { state.targetProtection = v; }, rerender));
    appendFactorIdentificationHint(wrap, 'submarine-exposed', 'protection');

    if (state.waterDepth !== '' && state.targetSignature !== '' && !Number.isNaN(Number(state.targetSignature)) && state.targetMoving !== '') {
      try {
        const band = AswAttackEngine.selectBand(table, TableEngine, {
          position: POSITION_BY_DEPTH[state.waterDepth], signature: Number(state.targetSignature), targetMoving: state.targetMoving === 'yes'
        });
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Firma efectiva ${band.effectiveSignature} → banda ${band.bandIndex + 1} de la cabecera (rango de Firma «${band.bandLabel}»).`));
      } catch (err) {
        wrap.appendChild(el('p', 'pending-note', err.message));
      }
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!dataReady()) { alert('Completa la profundidad, la Firma del objetivo, si está en movimiento, el tipo de torpedo y su Valor de Ataque.'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Tirada ----------
  function renderStepRoll(wrap, table, rerender) {
    wrap.appendChild(el('h2', null, 'Tirada de ataque'));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §9.13.2 Paso 2: 1d10 cruzado con el Valor de Ataque del Torpedo en la banda elegida (tirada 0-3 = NO DISPARAR).'));
    wrap.appendChild(makeSelectFromValues('Tirada (1d10)', DIE_VALUES, state.roll, (v) => { state.roll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
      state.roll = String(Math.floor(Math.random() * 10));
      rerender();
    }));

    const attack = computeAttack(table);
    if (attack && attack.error) {
      wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${attack.error.message}`));
    } else if (attack) {
      const r = attack.result;
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', r.cell
        ? `Celda de la tabla (banda ${r.band.bandIndex + 1}, columna «${r.cell.columnLabel}», tirada ${state.roll}): ${r.cell.rawCell === 'NO_DISPARAR' ? 'NO DISPARAR' : r.cell.rawCell === '.' ? 'sin impactos' : r.cell.rawCell}`
        : r.notes[0]));
      r.notes.forEach((n) => { if (r.cell) wrap.appendChild(el('p', 'source-refs', n)); });
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!attack || attack.error) { alert('Completa la tirada.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Resultado ----------
  function renderStepResult(wrap, workflow, table, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const attack = computeAttack(table);
    if (!attack || attack.error) {
      wrap.appendChild(el('p', 'pending-note', attack && attack.error ? `No se pudo resolver: ${attack.error.message}` : 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const r = attack.result;
    const depthLabel = getQuestion(workflow, 'water_depth').options.find((o) => o.value === state.waterDepth).label;
    const typeLabel = state.torpedoType === 'circle' ? 'círculo (moderno)' : 'hexágono (antiguo)';

    const summaryLines = [
      `Torpedo de ${typeLabel}, Valor de Ataque ${state.torpedoValue}, contra un submarino en ${depthLabel}.`,
      `Firma ${state.targetSignature}${state.targetMoving === 'yes' ? ' +1 por estar En Movimiento' : ''} = ${r.band.effectiveSignature} → banda ${r.band.bandIndex + 1} (rango «${r.band.bandLabel}»). Tirada ${state.roll}.`,
      r.cell ? `Tabla (pág. 30): columna «${r.cell.columnLabel}» → ${r.cell.rawCell === 'NO_DISPARAR' ? 'NO DISPARAR' : r.cell.rawCell === '.' ? 'sin impactos' : r.cell.rawCell}.` : r.notes[0]
    ];
    if (r.cell) r.notes.forEach((n) => summaryLines.push(n));
    if (r.sunk !== null) {
      summaryLines.push(`Protección del submarino ${state.targetProtection}: ${r.impacts} Punto(s) de Impacto ${r.sunk ? '≥' : '<'} Protección → ${r.sunk ? 'el submarino es hundido inmediatamente' : 'el submarino no se hunde'} (§9.13.2 Paso 4).`);
    }

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);

    const resultText = r.noFire
      ? 'NO DISPARAR (sin búsqueda posterior al ataque)'
      : `${r.impacts} Punto(s) de Impacto${r.noEffect ? ' — el ataque no tiene efecto' : ''}${r.sunk ? ' — submarino hundido' : ''}`;
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    if (r.sunk === null && r.impacts > 0) {
      wrap.appendChild(el('p', 'pending-note', 'Compara los Puntos de Impacto con el Valor de Protección (PRO) de la ficha del submarino: si son iguales o mayores, se hunde inmediatamente (Decision Book §9.13.2 Paso 4).'));
    }

    if (r.cell) {
      wrap.appendChild(renderGrid(table, table.rowAxis.values, table.columnAxis.values, r.cell));
      wrap.appendChild(el('p', 'source-refs', 'Las cabeceras de la cuadrícula son las columnas de datos de la banda 3 (·, 1~2, 3-7, 8+); la columna resaltada es la que corresponde a tu banda y Valor de Ataque.'));
    }
    wrap.appendChild(el('p', 'source-refs', 'Un ataque con torpedos consume 1 punto de Munición de Torpedos y solo puede hacer objetivo a unidades submarinas expuestas en la misma casilla (Decision Book §9.13.2).'));

    const fullSummaryText = [workflow.title, ...summaryLines, `Resultado: ${resultText}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'asw_submarine', workflowTitle: workflow.title, summaryText: fullSummaryText, state });
      // COR02-003: guardar la resolución la da por completada.
      unlinkTurnContext(state);
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => {
        unlinkTurnContext(state);
        state = freshState();
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.AswSubmarineWizard = { render: renderAswSubmarineWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
