// Wizard de combate: Ataque ASW por unidades de superficie y aéreas contra
// submarinos (roadmap Fase 13; data/workflows/10_ataque_asw_superficie_aereo.json
// + data/tables/page-29.json + public/js/asw-attack-engine.js).
//
// Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita el Decision Book
// §9.17 directamente. La mecánica (alcance, banda de la cabecera por
// profundidad + Firma, +1 si el submarino está "En Movimiento", celda,
// hundimiento) vive en el motor puro; esta vista solo recoge datos y pinta.
// El ataque ASW de submarinos (página 30) NO está en este wizard: sus fuentes
// se contradicen sobre cómo se elige la fila (ver known-ambiguities.md).
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage,
    makeNumberField, makeOptionGroup, makeSelectFromValues,
    wizardActionRow, wizardNavButton, renderGrid, appendFactorIdentificationHint
  } = AppCore;

  const WIZARD_STEPS = ['Elegibilidad y alcance', 'Datos del objetivo', 'Tirada', 'Resultado'];
  const DIE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const POSITION_BY_DEPTH = { p4: 'P4', p3: 'P3', p2_1: 'P2_P1' };

  function freshState() {
    return {
      step: 0,
      attackerType: '',
      targetInEnemyCapZone: '',
      adjacentTarget: '',
      adjacentCapability: '',
      attackerInEnemyCapZone: '',
      waterDepth: '',
      targetSignature: '',
      targetMoving: '',
      aswAttackValue: '',
      targetProtection: '',
      roll: ''
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 3;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'asw-surface-air', type: 'asw_surface_air', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  function getQuestion(workflow, stageId, questionId) {
    return workflow.stages.find((st) => st.id === stageId).questions.find((q) => q.id === questionId);
  }

  function eligibilityInput() {
    return {
      attackerType: state.attackerType,
      adjacentTarget: state.adjacentTarget,
      targetInEnemyCapZone: state.targetInEnemyCapZone,
      attackerInEnemyCapZone: state.attackerInEnemyCapZone,
      adjacentCapability: state.adjacentCapability
    };
  }

  // Resuelve con los datos introducidos; null mientras falte alguno, {error}
  // si el motor rechaza la combinación.
  function computeAttack(table) {
    const signature = Number(state.targetSignature);
    const value = Number(state.aswAttackValue);
    if (state.waterDepth === '' || state.targetSignature === '' || state.targetMoving === '' || state.aswAttackValue === '' || state.roll === ''
      || Number.isNaN(signature) || Number.isNaN(value)) return null;
    try {
      return {
        result: AswAttackEngine.resolveAswAttack(table, TableEngine, {
          position: POSITION_BY_DEPTH[state.waterDepth],
          signature,
          targetMoving: state.targetMoving === 'yes',
          aswAttackValue: value,
          roll: Number(state.roll),
          targetProtection: state.targetProtection
        })
      };
    } catch (err) {
      return { error: err };
    }
  }

  async function renderAswSurfaceAirWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('asw-surface-air', state, freshState);
    linkToTurnContextIfNeeded(state, 'Ataque ASW por unidades de superficie y aéreas');
    AppCore.persistWizardDraft('asw-surface-air', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Ataque ASW (superficie y aéreas)']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let page29;
    try {
      [workflow, page29] = await Promise.all([
        loadWorkflow('10_ataque_asw_superficie_aereo.json'),
        loadTablePage('page-29.json')
      ]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    const table = TableEngine.findTableInPage(page29, 'asw-surface-air-attack-damage').table;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', workflow.title));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', `${workflow.source.document}, pág. ${workflow.source.pages} · Decision Book §9.17. No hay hoja de ayuda con ejemplo resuelto: cada paso cita la regla directamente. El ataque ASW de submarinos (pág. 30) tiene su propio wizard.`));

    const rerender = () => { renderAswSurfaceAirWizard(); };

    AppCore.mountWizardDraft('asw-surface-air', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    const stepRenderers = [
      () => renderStepEligibility(wrap, workflow, rerender),
      () => renderStepTargetData(wrap, workflow, table, rerender),
      () => renderStepRoll(wrap, workflow, table, rerender),
      () => renderStepResult(wrap, workflow, table, rerender)
    ];
    stepRenderers[state.step]();

    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Elegibilidad y alcance ----------
  function renderStepEligibility(wrap, workflow, rerender) {
    const stage = workflow.stages.find((st) => st.id === 'eligibility');
    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'pending-note', stage.specialRules));

    wrap.appendChild(makeOptionGroup(getQuestion(workflow, 'eligibility', 'attacker_type'), state.attackerType, (v) => { state.attackerType = v; rerender(); }));
    wrap.appendChild(makeOptionGroup(getQuestion(workflow, 'eligibility', 'target_in_enemy_cap_zone'), state.targetInEnemyCapZone, (v) => { state.targetInEnemyCapZone = v; rerender(); }));

    if (state.attackerType === 'surface') {
      wrap.appendChild(makeOptionGroup(getQuestion(workflow, 'eligibility', 'adjacent_target'), state.adjacentTarget, (v) => { state.adjacentTarget = v; rerender(); }));
      if (state.adjacentTarget === 'yes') {
        wrap.appendChild(makeOptionGroup(getQuestion(workflow, 'eligibility', 'adjacent_capability'), state.adjacentCapability, (v) => { state.adjacentCapability = v; rerender(); }));
        wrap.appendChild(makeOptionGroup(getQuestion(workflow, 'eligibility', 'attacker_in_enemy_cap_zone'), state.attackerInEnemyCapZone, (v) => { state.attackerInEnemyCapZone = v; rerender(); }));
      }
    }

    let blocked = false;
    let complete = false;
    if (state.attackerType !== '' && state.targetInEnemyCapZone !== '') {
      const surfaceOk = state.attackerType === 'air' || (state.adjacentTarget === 'no'
        || (state.adjacentTarget === 'yes' && state.adjacentCapability !== '' && state.attackerInEnemyCapZone !== ''));
      complete = surfaceOk;
      if (complete) {
        const check = AswAttackEngine.checkEligibility(eligibilityInput());
        wrap.appendChild(el('p', 'source-refs', check.rangeNote));
        if (!check.eligible) {
          blocked = true;
          check.reasons.forEach((r) => wrap.appendChild(el('p', 'pending-note', `No se puede continuar con este ataque: ${r}`)));
        } else {
          wrap.appendChild(el('p', 'wizard-modifier-summary__total', 'Ataque permitido por las condiciones de alcance.'));
        }
      }
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!complete) { alert('Completa el tipo de atacante, la zona de patrulla aérea enemiga y, para una unidad de superficie, si el objetivo es adyacente (y su capacidad).'); return; }
        if (blocked) { alert('Las condiciones de alcance no permiten este ataque ASW (ver los motivos en pantalla).'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Datos del objetivo ----------
  function renderStepTargetData(wrap, workflow, table, rerender) {
    const qDepth = getQuestion(workflow, 'attack_table', 'water_depth');
    const qSig = getQuestion(workflow, 'attack_table', 'target_signature');
    const qMoving = getQuestion(workflow, 'attack_table', 'target_moving');
    const qValue = getQuestion(workflow, 'attack_table', 'asw_attack_value');
    const qProtection = getQuestion(workflow, 'attack_table', 'target_protection');

    wrap.appendChild(el('h2', null, 'Datos del objetivo y del ataque'));
    wrap.appendChild(wizardNavButton('Ver tabla de Ataque ASW (pág. 29)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-29.json/asw-surface-air-attack-damage';
    }));

    wrap.appendChild(makeOptionGroup(qDepth, state.waterDepth, (v) => { state.waterDepth = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', table.columnAxis.positionDepthNote));
    wrap.appendChild(makeNumberField(qSig.prompt, state.targetSignature, (v) => { state.targetSignature = v; }, rerender));
    wrap.appendChild(el('p', 'source-refs', qSig.note));
    wrap.appendChild(makeOptionGroup(qMoving, state.targetMoving, (v) => { state.targetMoving = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qMoving.note));
    wrap.appendChild(makeNumberField(qValue.prompt, state.aswAttackValue, (v) => { state.aswAttackValue = v; }, rerender));
    wrap.appendChild(makeNumberField(qProtection.prompt, state.targetProtection, (v) => { state.targetProtection = v; }, rerender));
    appendFactorIdentificationHint(wrap, 'submarine-exposed', 'protection');

    // Se reevalúa al pulsar: un clic que llega justo antes del último redibujado debe ver el valor ya escrito.
    const isReady = () => state.waterDepth !== '' && state.targetSignature !== '' && !Number.isNaN(Number(state.targetSignature))
      && state.targetMoving !== '' && state.aswAttackValue !== '' && !Number.isNaN(Number(state.aswAttackValue));
    if (isReady()) {
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
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!isReady()) { alert('Completa la profundidad, la Firma del objetivo, si está en movimiento y el Valor de Ataque ASW.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Tirada ----------
  function renderStepRoll(wrap, workflow, table, rerender) {
    wrap.appendChild(el('h2', null, 'Tirada de ataque'));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §9.17.2 Paso 3: 1d10 cruzado con el Valor de Ataque ASW en la banda elegida.'));
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
        ? `Celda de la tabla (banda ${r.band.bandIndex + 1}, columna «${r.cell.columnLabel}», tirada ${state.roll}): ${r.cell.rawCell === '.' ? 'sin impactos' : r.cell.rawCell}`
        : r.notes[0]));
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!attack || attack.error) { alert('Completa la tirada.'); return; }
        state.step = 3;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 4: Resultado ----------
  function renderStepResult(wrap, workflow, table, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const attack = computeAttack(table);
    if (!attack || attack.error) {
      wrap.appendChild(el('p', 'pending-note', attack && attack.error ? `No se pudo resolver: ${attack.error.message}` : 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 2; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const r = attack.result;
    const attackerLabel = state.attackerType === 'air' ? 'unidad aérea' : 'unidad de superficie';
    const depthLabel = getQuestion(workflow, 'attack_table', 'water_depth').options.find((o) => o.value === state.waterDepth).label;

    const summaryLines = [
      `Atacante: ${attackerLabel}${state.attackerType === 'surface' && state.adjacentTarget === 'yes' ? ' (objetivo en hex adyacente)' : ''}.`,
      `Objetivo: submarino en ${depthLabel}; Firma ${state.targetSignature}${state.targetMoving === 'yes' ? ' +1 por estar En Movimiento' : ''} = ${r.band.effectiveSignature} → banda ${r.band.bandIndex + 1} (rango «${r.band.bandLabel}»).`,
      `Valor de Ataque ASW ${state.aswAttackValue}, tirada ${state.roll}.`,
      r.cell ? `Tabla (pág. 29): columna «${r.cell.columnLabel}» → ${r.cell.rawCell === '.' ? 'sin impactos' : r.cell.rawCell}.` : r.notes[0]
    ];
    if (r.sunk !== null) {
      summaryLines.push(`Protección del submarino ${state.targetProtection}: ${r.impacts} Punto(s) de Impacto ${r.sunk ? '≥' : '<'} Protección → ${r.sunk ? 'el submarino es hundido inmediatamente' : 'el submarino no se hunde'} (§9.17.2 Paso 4).`);
    }

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);

    const resultText = `${r.impacts} Punto(s) de Impacto${r.noEffect ? ' — el ataque no tiene efecto' : ''}${r.sunk ? ' — submarino hundido' : ''}`;
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    if (r.sunk === null && r.impacts > 0) {
      wrap.appendChild(el('p', 'pending-note', 'Compara los Puntos de Impacto con el Valor de Protección (PRO) de la ficha del submarino: si son iguales o mayores, se hunde inmediatamente (Decision Book §9.17.2 Paso 4).'));
    }

    if (r.cell) {
      wrap.appendChild(renderGrid(table, table.rowAxis.values, table.columnAxis.values, r.cell));
      wrap.appendChild(el('p', 'source-refs', 'Las cabeceras de la cuadrícula son las columnas de datos de la banda 3 (·, 1~2, 3-7, 8+); la columna resaltada es la que corresponde a tu banda y Valor de Ataque ASW.'));
    }
    wrap.appendChild(el('p', 'source-refs', 'Cada unidad ASW ataca de forma independiente a un único submarino y las unidades de superficie consumen 1 punto de Munición ASW (§9.17); un MPA regresa a su base inmediatamente después de atacar.'));

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
      saveResolutionToHistory({
        workflowId: 'asw_surface_air',
        workflowTitle: workflow.title,
        summaryText: fullSummaryText,
        state
      });
      // COR02-003: guardar la resolución la da por completada — deja de
      // bloquear el cierre de la fase que la inició.
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
  root.Views.AswSurfaceAirWizard = { render: renderAswSurfaceAirWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
