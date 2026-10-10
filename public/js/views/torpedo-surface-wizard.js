// Wizard de combate: Ataque Submarino con Torpedos contra unidades de
// superficie (roadmap Fase 12; data/workflows/09_ataque_torpedos_superficie.json
// + data/tables/page-27.json + public/js/torpedo-attack-engine.js).
//
// Como en el combate cercano terrestre, no hay "hoja de ayuda" con ejemplo
// resuelto: cada paso cita el Decision Book §9.13.1 directamente. La
// mecánica (fila de cabecera según estado/contexto ASW, velocidad ≤ 3, tipo
// de torpedo círculo/hexágono, segundo dado) vive en el motor puro; esta vista
// solo recoge datos y pinta. El Paso 5 del reglamento (hundir/dañar buques
// concretos) depende de la hoja de flota física del jugador y no está
// modelado: el wizard calcula los Puntos de Impacto finales y explica cómo
// se absorben, sin inventar un registro de flota.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage,
    makeNumberField, makeOptionGroup, makeSelectFromValues,
    wizardActionRow, wizardNavButton, renderGrid, appendFactorIdentificationHint
  } = AppCore;

  const WIZARD_STEPS = ['Emboscada (opcional)', 'Datos del ataque', 'Tirada', 'Resultado'];
  const DIE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  function freshState() {
    return {
      step: 0,
      ambush: '',
      submarineType: '',
      allSpeedLe3: '',
      aswContext: '',
      attackerState: '',
      torpedoType: '',
      torpedoValue: '',
      roll: '',
      followUpRoll: ''
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 3;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'torpedo-surface', type: 'torpedo_vs_surface', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  function getStage(workflow, id) {
    return workflow.stages.find((st) => st.id === id);
  }

  function getQuestion(workflow, stageId, questionId) {
    return getStage(workflow, stageId).questions.find((q) => q.id === questionId);
  }

  // Resuelve el ataque con los datos introducidos; devuelve null mientras
  // falte alguno (no lanza ni inventa un valor), o {error} si el motor rechaza.
  function computeAttack(table) {
    const value = Number(state.torpedoValue);
    const needsState = state.aswContext === 'surface_search_or_mpa';
    if (state.torpedoType === '' || state.aswContext === '' || state.allSpeedLe3 === '' || state.torpedoValue === '' || Number.isNaN(value)) return null;
    if (needsState && state.attackerState === '') return null;
    const speedLe3 = state.allSpeedLe3 === 'yes';
    if (!speedLe3 && state.roll === '') return null;
    try {
      const columnScheme = TorpedoAttackEngine.selectColumnScheme({ aswContext: state.aswContext, attackerState: state.attackerState });
      const result = TorpedoAttackEngine.resolveTorpedoAttack(table, TableEngine, {
        columnScheme,
        torpedoValue: value,
        roll: state.roll === '' ? undefined : Number(state.roll),
        allTargetsSpeedLe3: speedLe3,
        torpedoType: state.torpedoType,
        followUpRoll: state.followUpRoll === '' ? undefined : Number(state.followUpRoll)
      });
      return { result, columnScheme };
    } catch (err) {
      return { error: err };
    }
  }

  async function renderTorpedoSurfaceWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('torpedo-surface', state, freshState);
    linkToTurnContextIfNeeded(state, 'Ataque con torpedos a buques de superficie');
    AppCore.persistWizardDraft('torpedo-surface', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Ataque con torpedos a superficie']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let page27;
    try {
      [workflow, page27] = await Promise.all([
        loadWorkflow('09_ataque_torpedos_superficie.json'),
        loadTablePage('page-27.json')
      ]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    const table = TableEngine.findTableInPage(page27, 'torpedo-vs-surface-damage').table;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', workflow.title));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', `${workflow.source.document}, pág. ${workflow.source.pages} · Decision Book §9.13.1. Sin "hoja de ayuda" con ejemplo resuelto para este ataque: cada paso cita la regla directamente.`));

    const rerender = () => { renderTorpedoSurfaceWizard(); };

    AppCore.mountWizardDraft('torpedo-surface', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    const stepRenderers = [
      () => renderStepAmbush(wrap, workflow, rerender),
      () => renderStepAttackData(wrap, workflow, table, rerender),
      () => renderStepRoll(wrap, workflow, table, rerender),
      () => renderStepResult(wrap, workflow, table, rerender)
    ];
    stepRenderers[state.step]();

    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Emboscada (informativo, no bloquea nada) ----------
  function renderStepAmbush(wrap, workflow, rerender) {
    const stage = getStage(workflow, 'ambush');
    const qAmbush = getQuestion(workflow, 'ambush', 'ambush');
    const qSub = getQuestion(workflow, 'ambush', 'submarine_type');

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'turn-view__desc', 'Este paso es solo informativo (la Emboscada es una reacción opcional que se declara antes del ataque): puedes omitirlo con "Siguiente".'));
    wrap.appendChild(makeOptionGroup(qAmbush, state.ambush, (v) => { state.ambush = v; rerender(); }));

    if (state.ambush === 'yes') {
      wrap.appendChild(makeOptionGroup(qSub, state.submarineType, (v) => { state.submarineType = v; rerender(); }));
      const chosen = qSub.options.find((o) => o.value === state.submarineType);
      if (chosen) {
        const range = chosen.effects.find((e) => e.type === 'range');
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Zona de Emboscada: ${range.value === 0 ? '0 casillas (solo la propia)' : `${range.value} casilla (la propia y las adyacentes)`}.`));
      }
      wrap.appendChild(el('p', 'pending-note', stage.specialRules));
      wrap.appendChild(el('p', 'source-refs', stage.sourceRefs.map((r) => `${r.document} §${r.sections}, pág. ${r.pages}`).join(' · ')));
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => { state.step = 1; rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Datos del ataque ----------
  function renderStepAttackData(wrap, workflow, table, rerender) {
    const qSpeed = getQuestion(workflow, 'target_speed', 'all_target_speed_le3');
    const qContext = getQuestion(workflow, 'detection_context', 'target_hex_asw_context');
    const qState = getQuestion(workflow, 'detection_context', 'attacker_state');
    const qType = getQuestion(workflow, 'detection_context', 'torpedo_type');
    const qValue = getQuestion(workflow, 'detection_context', 'torpedo_attack_value');

    wrap.appendChild(el('h2', null, 'Datos del ataque'));
    wrap.appendChild(wizardNavButton('Ver tabla de Ataque con Torpedos (pág. 27)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-27.json/torpedo-vs-surface-damage';
    }));

    wrap.appendChild(makeOptionGroup(qSpeed, state.allSpeedLe3, (v) => { state.allSpeedLe3 = v; if (v === 'yes') { state.roll = ''; } rerender(); }));
    if (state.allSpeedLe3 === 'yes') {
      wrap.appendChild(el('p', 'source-refs', 'Velocidad impresa ≤ 3 en todos los buques: el dado se ignora y la tirada se considera 9 (Decision Book §9.13.1 Paso 2).'));
    }

    wrap.appendChild(makeOptionGroup(qContext, state.aswContext, (v) => { state.aswContext = v; if (v === 'none') state.attackerState = ''; rerender(); }));
    if (state.aswContext === 'surface_search_or_mpa') {
      wrap.appendChild(makeOptionGroup(qState, state.attackerState, (v) => { state.attackerState = v; rerender(); }));
    } else if (state.aswContext === 'none') {
      wrap.appendChild(el('p', 'source-refs', 'Sin esa situación se usa la tercera fila de la cabecera (columnas 1-9, 10+) sea cual sea el estado del submarino (Decision Book §9.13.1 Paso 1).'));
    }

    wrap.appendChild(makeOptionGroup(qType, state.torpedoType, (v) => { state.torpedoType = v; state.followUpRoll = ''; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qType.note));

    wrap.appendChild(makeNumberField(qValue.prompt, state.torpedoValue, (v) => { state.torpedoValue = v; state.followUpRoll = ''; }, rerender));
    appendFactorIdentificationHint(wrap, 'submarine-hidden', 'torpedoes');

    const scheme = state.aswContext === 'surface_search_or_mpa' && state.attackerState !== ''
      ? TorpedoAttackEngine.selectColumnScheme({ aswContext: state.aswContext, attackerState: state.attackerState })
      : undefined;
    if (state.torpedoValue !== '' && !Number.isNaN(Number(state.torpedoValue)) && state.aswContext !== '' && (state.aswContext === 'none' || state.attackerState !== '')) {
      try {
        const labels = TableEngine.pickAxisLabels(table.columnAxis, scheme);
        const match = TableEngine.matchAxisIndex(labels, Number(state.torpedoValue));
        if (match.index === -1) {
          wrap.appendChild(el('p', 'pending-note', `Con este estado/contexto no hay columna para un Valor de Ataque del Torpedo de ${state.torpedoValue}.`));
        } else {
          wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Columna de la tabla: «${labels[match.index]}» (${scheme === 'exposed' ? 'fila Expuesto' : scheme === 'hidden' ? 'fila Oculto' : 'fila "cualquiera"'}).`));
        }
      } catch (err) {
        wrap.appendChild(el('p', 'pending-note', err.message));
      }
    }

    // Se evalúa al pulsar, no al dibujar: si el clic llega justo antes de que el último campo termine de redibujar,
    // el botón antiguo debe ver el valor ya escrito (en CI lento el clic se adelantaba y no avanzaba).
    const isReady = () => state.allSpeedLe3 !== '' && state.aswContext !== '' && state.torpedoType !== '' && state.torpedoValue !== ''
      && !Number.isNaN(Number(state.torpedoValue)) && Number(state.torpedoValue) >= 1
      && (state.aswContext === 'none' || state.attackerState !== '');

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!isReady()) { alert('Completa la velocidad de la flota, el contexto ASW (y el estado del submarino si procede), el tipo de torpedo y su Valor de Ataque (≥ 1).'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Tirada (y segundo dado si el tipo de torpedo lo exige) ----------
  function renderStepRoll(wrap, workflow, table, rerender) {
    const speedLe3 = state.allSpeedLe3 === 'yes';
    wrap.appendChild(el('h2', null, 'Tirada de ataque'));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §9.13.1 Pasos 2-4.'));

    if (speedLe3) {
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', 'Velocidad impresa ≤ 3: el dado se ignora; la tirada es 9.'));
    } else {
      wrap.appendChild(makeSelectFromValues('Tirada (1d10)', DIE_VALUES, state.roll, (v) => { state.roll = v; state.followUpRoll = ''; rerender(); }));
      wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
        state.roll = String(Math.floor(Math.random() * 10));
        state.followUpRoll = '';
        rerender();
      }));
    }

    const attack = computeAttack(table);
    if (attack && attack.error) {
      wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${attack.error.message}`));
    } else if (attack) {
      const r = attack.result;
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Celda de la tabla (fila «${r.cell.rowLabel}», columna «${r.cell.columnLabel}»): ${r.cell.rawCell === 'NO_ATACO' ? 'NO ATACÓ' : r.cell.rawCell === '.' ? 'sin impactos' : r.cell.rawCell}`));
      r.notes.forEach((n) => wrap.appendChild(el('p', 'source-refs', n)));
      if (r.needsFollowUpRoll) {
        wrap.appendChild(makeSelectFromValues('Segundo dado (1d10)', DIE_VALUES, state.followUpRoll, (v) => { state.followUpRoll = v; rerender(); }));
        wrap.appendChild(wizardNavButton('🎲 Segundo dado aleatorio', 'secondary', () => {
          state.followUpRoll = String(Math.floor(Math.random() * 10));
          rerender();
        }));
      }
      if (r.finalImpacts !== null) {
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Puntos de Impacto finales: ${r.finalImpacts}`));
      }
    }

    const canAdvance = attack && attack.result && attack.result.finalImpacts !== null;
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!canAdvance) { alert(speedLe3 ? 'Completa el segundo dado.' : 'Completa la tirada (y el segundo dado si se pide).'); return; }
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
    if (!attack || attack.error || attack.result.finalImpacts === null) {
      wrap.appendChild(el('p', 'pending-note', attack && attack.error ? `No se pudo resolver: ${attack.error.message}` : 'Faltan datos: vuelve al paso anterior.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 2; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const r = attack.result;
    const typeLabel = state.torpedoType === 'circle' ? 'círculo (moderno)' : 'hexágono (antiguo)';
    const contextLabel = state.aswContext === 'surface_search_or_mpa'
      ? `con búsqueda por diferencia de firma / Zona Central de MPA, submarino ${state.attackerState === 'exposed' ? 'Expuesto' : 'Oculto'}`
      : 'sin búsqueda por diferencia de firma ni Zona Central de MPA (fila "cualquiera")';

    const summaryLines = [
      `Torpedo de ${typeLabel}, Valor de Ataque ${state.torpedoValue}; ${contextLabel}.`,
      r.rollIgnored ? 'Velocidad impresa ≤ 3 en todos los buques: dado ignorado, tirada 9.' : `Tirada: ${r.effectiveRoll}.`,
      `Tabla (pág. 27): fila «${r.cell.rowLabel}», columna «${r.cell.columnLabel}» → ${r.cell.rawCell === 'NO_ATACO' ? 'NO ATACÓ' : r.cell.rawCell === '.' ? 'sin impactos' : r.cell.rawCell}.`
    ].concat(r.notes);

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);

    const resultText = r.outcome === 'no_attack'
      ? 'No atacó (sin consumo de munición ni búsqueda posterior)'
      : `${r.finalImpacts} Punto(s) de Impacto${r.finalImpacts === 0 ? ' — el ataque no tiene efecto' : ''}`;
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));

    const columnLabels = table.columnAxis.values;
    wrap.appendChild(renderGrid(table, table.rowAxis.values, columnLabels, r.cell));
    wrap.appendChild(el('p', 'source-refs', 'Las cabeceras de la cuadrícula son las columnas de datos 1-9, 10+ (fila "cualquiera"); la columna resaltada es la que corresponde a tu Valor de Ataque según el estado y contexto elegidos.'));

    if (r.finalImpacts > 0) {
      const rules = workflow.impactResolution;
      const rulesBox = el('div', 'pending-note');
      rulesBox.appendChild(el('p', null, rules.title));
      rules.rules.forEach((rule) => rulesBox.appendChild(el('p', 'source-refs', `• ${rule.label}`)));
      if (r.generalUnitsOnly) rulesBox.appendChild(el('p', 'source-refs', `• ${workflow.hexagonGeneralUnitsOnly.label}`));
      if (r.singleShipOnly) rulesBox.appendChild(el('p', 'source-refs', `• ${workflow.hexagonSingleShipOnly.label}`));
      rulesBox.appendChild(el('p', 'source-refs', 'La asignación a buques concretos (hundimiento, tamaño de flota, daño por Resistencia) se aplica sobre tu hoja de flota física: este wizard no la modela.'));
      wrap.appendChild(rulesBox);
    }

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
        workflowId: 'torpedo_vs_surface',
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
  root.Views.TorpedoSurfaceWizard = { render: renderTorpedoSurfaceWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
