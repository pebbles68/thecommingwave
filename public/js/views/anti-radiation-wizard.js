// Wizard de combate: Ataque Anti-Radiación (ARM; roadmap Fase 9;
// data/workflows/04_ataque_antirradiacion.json + data/tables/page-11…14.json +
// public/js/anti-radiation-attack-engine.js). Sigue el Decision Book §5.14
// (pp. 81-83): Valor de Ataque -> Defensa Aérea de Área (CM/BM) ->
// Interceptación de Munición -> modificación de la Fuerza de Ataque (-5 si el
// sistema de detección del objetivo está activado) -> tabla de resolución ARM
// -> Contraataque a Baja Altura.
//
// Reutiliza sin cambios las funciones puras ya probadas por el ataque guiado a
// superficie (AntishipGuidedModel.computeStage1Reduction /
// computeInterceptionResult / computeAttackValueAfterDefenses — leen etapas
// `area_air_defense`/`munition_interception` con los mismos ids que este
// workflow), `AppCore.renderInterceptionShotRows` y
// `AppCore.renderLowAltitudeCounterattackSection`. Lo propio del ARM (desplazamiento de columna con tope 13, esquema [L]/Normal,
// el 9 natural que cancela la modificación) vive en el motor puro.
//
// Como en el combate cercano terrestre, el Valor de Ataque se introduce a
// mano: no hay planes ARM transcritos con un valor por unidad en este
// wizard (AGENTS.md §14, no inventar). La resolución de los Puntos de Impacto
// sobre unidades de radar (§5.14.3, "similar a la regla 5.15") no está
// modelada: el wizard calcula los Puntos de Impacto y lo avisa.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage, loadTableById,
    makeTextField, makeNumberField, makeSelectFromValues, makeOptionGroup,
    renderModifierSummary, wizardActionRow, wizardNavButton, renderGrid
  } = AppCore;
  const { getWizardStage, computeStage1Reduction, computeInterceptionResult, computeAttackValueAfterDefenses } = AntishipGuidedModel;

  const WIZARD_STEPS = [
    'Datos base del ataque',
    'Defensa aérea de área e interceptación de munición',
    'Modificación de la Fuerza de Ataque y tirada',
    'Resultado y contraataque a baja altura'
  ];
  const DIE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  function freshState() {
    return {
      step: 0,
      missionContext: { missionId: '', areaMission: '', source: 'manual' },
      attackDistanceHexes: '',
      targetLabel: '',
      baseAttackValue: '',
      lightPlan: '',
      detectionSystemActive: '',
      stageAnswers: { area_air_defense: {}, munition_interception: {} },
      areaAirDefenseAttackRoll: '',
      areaAirDefenseAttackRoll2: '',
      areaAirDefenseGroupedAaValue: '',
      interceptionShips: [{ aa: '', roll: '', consumption: 'high' }],
      finalRoll: '',
      lowAltitudeCounterattack: { aaTotal: '', attackers: [{ protection: '', roll: '' }] },
      turnResolutionId: null
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 3;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'anti-radiation', type: 'anti_radiation', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  function getQuestion(workflow, stageId, questionId) {
    return getWizardStage(workflow, stageId).questions.find((q) => q.id === questionId);
  }

  // Modificador de intensidad desde los datos del workflow (-5 / 0).
  function intensityModifierFromWorkflow(workflow) {
    if (state.detectionSystemActive === '') return null;
    const q = getQuestion(workflow, 'anti_radiation_modifier', 'detection_system_active');
    const opt = q.options.find((o) => o.value === state.detectionSystemActive);
    return opt.effects.find((e) => e.target === 'attack_intensity').value;
  }

  async function renderAntiRadiationWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('anti-radiation', state, freshState);
    linkToTurnContextIfNeeded(state, 'Ataque antirradiación (ARM)');
    AppCore.persistWizardDraft('anti-radiation', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Ataque antirradiación (ARM)']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let areaDefenseLoaded;
    let interceptionLoaded;
    let page13;
    let page14;
    let airMissions;
    try {
      [workflow, areaDefenseLoaded, interceptionLoaded, page13, page14, airMissions] = await Promise.all([
        loadWorkflow('04_ataque_antirradiacion.json'),
        loadTableById('page-11.json', 'ground-guided-area-air-defense'),
        loadTableById('page-12.json', 'munition-interception-standard'),
        loadTablePage('page-13.json'),
        loadTablePage('page-14.json'),
        AppCore.loadAirMissions()
      ]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    const tables = {
      areaAirDefense: areaDefenseLoaded.table,
      interception: interceptionLoaded.table,
      armDamage: TableEngine.findTableInPage(page13, 'anti-radiation-target-damage').table,
      counterattack: TableEngine.findTableInPage(page14, 'anti-radiation-low-altitude-counterattack').table
    };

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', workflow.title));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', `${workflow.source.document}, págs. ${workflow.source.pages} · Decision Book §5.14. Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.`));

    const rerender = () => { renderAntiRadiationWizard(); };

    AppCore.mountWizardDraft('anti-radiation', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    const stepRenderers = [
      () => renderStepBase(wrap, rerender),
      () => renderStepDefenses(wrap, workflow, tables, rerender),
      () => renderStepIntensity(wrap, workflow, tables, rerender),
      () => renderStepResult(wrap, workflow, tables, rerender)
    ];
    if (state.step === 0) AppCore.renderMissionContext(wrap, state, airMissions, rerender, null, { surfaceOrGround: true });
    stepRenderers[state.step]();

    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Datos base ----------
  function renderStepBase(wrap, rerender) {
    wrap.appendChild(el('h2', null, 'Datos base del ataque'));
    wrap.appendChild(el('p', 'pending-note', 'El Valor de Ataque se introduce a mano (el valor del plan ARM de la unidad atacante, Decision Book §5.14 paso 1): este wizard no deriva el valor de ningún plan transcrito.'));
    wrap.appendChild(makeTextField('Objetivo (opcional)', state.targetLabel, (v) => { state.targetLabel = v; }));
    wrap.appendChild(makeNumberField('Valor de Ataque base del plan anti-radiación', state.baseAttackValue, (v) => { state.baseAttackValue = v; }, rerender, { visualRef: 'attack-base-value' }));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (state.baseAttackValue === '' || Number.isNaN(Number(state.baseAttackValue))) { alert('Introduce el Valor de Ataque base.'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Defensa Aérea de Área + Interceptación de Munición ----------
  function renderStepDefenses(wrap, workflow, tables, rerender) {
    const s = state;
    const stage1 = getWizardStage(workflow, 'area_air_defense');
    const stage2 = getWizardStage(workflow, 'munition_interception');

    wrap.appendChild(el('h2', null, stage1.title));
    wrap.appendChild(el('p', 'source-refs', stage1.tableReference));
    AppCore.renderStageQuestions(wrap, stage1, s.stageAnswers.area_air_defense, {
      rerender
    });
    wrap.appendChild(wizardNavButton('Ver tabla de Defensa Aérea de Área (pág. 11 → 3)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-03.json/ground-guided-area-air-defense';
    }));

    const stage1Info = computeStage1Reduction(workflow, s, tables.areaAirDefense);
    if (!stage1Info.applies) {
      wrap.appendChild(el('p', 'turn-view__desc', 'La munición no está marcada CM/BM: esta etapa no se resuelve (reducción = 0). Decision Book §5.14 paso 2.'));
    } else {
      if (stage1Info.modResult) wrap.appendChild(renderModifierSummary('Modificador de la tirada de esta etapa', stage1Info.modResult));
      wrap.appendChild(makeNumberField('Tirada (1d10)', s.areaAirDefenseAttackRoll, (v) => { s.areaAirDefenseAttackRoll = v; }, rerender, { visualRef: 'dice-roll' }));
      wrap.appendChild(makeNumberField('Valor de Defensa Aérea agrupado (unidades que disparan)', s.areaAirDefenseGroupedAaValue, (v) => { s.areaAirDefenseGroupedAaValue = v; }, rerender, { visualRef: 'grouped-aa' }));
      if (stage1Info.error) {
        wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${stage1Info.error.message}`));
      } else if (stage1Info.value !== null) {
        const label = stage1Info.resolved.result.isMissingData ? 'sin dato transcrito: el cálculo se detiene aquí' : stage1Info.resolved.result.displayValue;
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Tirada modificada: ${stage1Info.resolved.modifiedRoll} → Reducción del Valor de Ataque: ${label}`));
      }
    }

    wrap.appendChild(el('h2', null, stage2.title));
    wrap.appendChild(el('p', 'source-refs', stage2.tableReference));
    wrap.appendChild(wizardNavButton('Ver tabla de Interceptación de Munición (pág. 12 → 4)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-04.json/munition-interception-standard';
    }));
    AppCore.renderStageQuestions(wrap, stage2, s.stageAnswers.munition_interception, {
      rerender,
      renderQuestion: (q, target) => {
        if (q.id === 'short_range_restriction') {
          AppCore.renderShortRangeRestriction(target, q, s.stageAnswers.munition_interception, s, 'attackDistanceHexes', s.missionContext, rerender);
          return true;
        }
        return false;
      }
    });
    const interception = computeInterceptionResult(workflow, s, tables.interception);
    wrap.appendChild(renderModifierSummary('Modificador compartido de rendimiento/detección (se suma a la tirada de cada disparo)', interception.modResult));
    // Los cortes de flujo del workflow (flowCuts) los muestra el renderizador común.
    AppCore.renderStageRules(wrap, workflow, 'munition_interception', s.stageAnswers.munition_interception);
    CombatWizardEngine.collectRuleEffects(stage2.questions, s.stageAnswers.munition_interception).filter((r) => !r.cutsStage).forEach((r) => {
      wrap.appendChild(el('p', 'pending-note', `Regla: ${r.ruleValue} (${r.prompt} → ${r.optionLabel})`));
    });

    wrap.appendChild(el('p', 'turn-view__desc', 'Cada unidad que intercepta dispara por separado: introduce su Valor de Defensa Aérea PROPIO, su tirada (1d10) y su consumo.'));
    AppCore.appendLowConsumptionRestrictions(wrap, stage2);
    AppCore.renderInterceptionShotRows(wrap, s.interceptionShips, tables.interception.rowAxis.values, rerender);

    const shotsBox = el('div', 'wizard-modifier-summary');
    interception.shots.forEach((entry, idx) => {
      if (entry.shot && entry.shot.notEligible) {
        shotsBox.appendChild(el('span', 'source-refs', `Disparo ${idx + 1} (A.A.=${entry.input.aa}, consumo Bajo): no puede interceptar — ${entry.shot.reason}`));
      } else if (entry.shot) {
        shotsBox.appendChild(el('span', 'source-refs', `Disparo ${idx + 1} (A.A.=${entry.input.aa}${entry.shot.consumption === 'low' ? ', consumo Bajo' : ''}, tirada modificada=${entry.shot.modifiedRoll}): ${entry.shot.result.isMissingData ? 'sin dato' : entry.shot.result.displayValue}`));
      } else if (entry.error) {
        shotsBox.appendChild(el('span', 'source-refs', `Disparo ${idx + 1}: ${entry.error.message}`));
      }
    });
    shotsBox.appendChild(el('span', 'wizard-modifier-summary__total', `Reducción total de Interceptación de Munición: ${interception.reduction}`));
    wrap.appendChild(shotsBox);

    const after = computeAttackValueAfterDefenses(workflow, s, tables.interception, tables.areaAirDefense);
    const stage1Pending = after.stage1Info.applies && after.stage1Info.value === null;
    const totalIsValid = !Number.isNaN(after.total) && !stage1Pending;
    if (totalIsValid) {
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Valor de Ataque tras las defensas: ${s.baseAttackValue} + (${after.stage1Reduction}) + (${after.interceptionReduction}) = ${after.total}`));
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 0; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!totalIsValid) { alert('Completa la etapa de Defensa Aérea de Área (tirada y Valor de Defensa Aérea) si la munición es CM/BM.'); return; }
        s.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // Valor de Ataque tras las defensas + resolución ARM con los datos introducidos.
  function computeArm(workflow, tables) {
    const after = computeAttackValueAfterDefenses(workflow, state, tables.interception, tables.areaAirDefense);
    const modifier = intensityModifierFromWorkflow(workflow);
    if (Number.isNaN(after.total) || modifier === null || state.lightPlan === '' || state.finalRoll === '') return { after, modifier, result: null };
    const result = AntiRadiationAttackEngine.resolveAntiRadiationAttack(tables.armDamage, TableEngine, {
      attackValue: after.total,
      lightPlan: state.lightPlan === 'yes',
      intensityModifier: modifier,
      roll: Number(state.finalRoll)
    });
    return { after, modifier, result };
  }

  // ---------- Paso 3: Modificación de la Fuerza de Ataque y tirada ----------
  function renderStepIntensity(wrap, workflow, tables, rerender) {
    const stage = getWizardStage(workflow, 'anti_radiation_modifier');
    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));
    wrap.appendChild(wizardNavButton('Ver tabla ARM (pág. 13)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-13.json/anti-radiation-target-damage';
    }));

    const qSystem = getQuestion(workflow, 'anti_radiation_modifier', 'detection_system_active');
    const qLight = getQuestion(workflow, 'anti_radiation_modifier', 'light_plan');
    wrap.appendChild(makeOptionGroup(qSystem, state.detectionSystemActive, (v) => { state.detectionSystemActive = v; rerender(); }));
    wrap.appendChild(makeOptionGroup(qLight, state.lightPlan, (v) => { state.lightPlan = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', qLight.note));
    wrap.appendChild(el('p', 'turn-view__desc', `${stage.formula} ${stage.specialRules} Las modificaciones positivas solo compensan negativas (neto máximo 0). Con un Valor de Ataque > 13 cada punto negativo lo reduce en 1 hasta 13 (Decision Book §5.14.3).`));

    wrap.appendChild(makeSelectFromValues('Tirada de resolución (1d10)', DIE_VALUES, state.finalRoll, (v) => { state.finalRoll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
      state.finalRoll = String(Math.floor(Math.random() * 10));
      rerender();
    }));

    const { after, modifier, result } = computeArm(workflow, tables);
    wrap.appendChild(el('p', 'source-refs', `Valor de Ataque tras las defensas: ${after.total}${modifier !== null ? ` · modificación de intensidad: ${modifier}` : ''}.`));
    if (result) {
      if (result.cancelledByNine) {
        wrap.appendChild(el('p', 'pending-note', 'Tirada 9: se cancelan todas las modificaciones de la Fuerza de Ataque (Decision Book §5.14.3, nota).'));
      }
      if (result.noColumn) {
        wrap.appendChild(el('p', 'pending-note', `No hay columna para este Valor de Ataque: ${result.reason} La tabla no imprime ninguna columna por debajo de la primera y las fuentes no dicen qué ocurre (AGENTS.md §14).`));
      } else {
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Columna de la tabla: «${result.columnResult.columnLabel}» (fila ${result.lightPlan ? '[L] Ligero' : 'Normal'}) → ${result.cell.rawCell === '.' ? 'sin impactos' : `${result.cell.rawCell} Punto(s) de Impacto`}.`));
      }
    }

    const canAdvance = result && !result.noColumn;
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!canAdvance) { alert('Completa el sistema de detección, el tipo de plan y la tirada (con un Valor de Ataque que tenga columna).'); return; }
        state.step = 3;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 4: Resultado y contraataque ----------
  function renderStepResult(wrap, workflow, tables, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const { after, modifier, result } = computeArm(workflow, tables);
    if (!result || result.noColumn) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos: vuelve al paso anterior.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 2; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }

    const summaryLines = [];
    if (state.targetLabel) summaryLines.push(`Objetivo: ${state.targetLabel}`);
    summaryLines.push(`Valor de Ataque base: ${state.baseAttackValue}`);
    summaryLines.push(`Reducción Defensa Aérea de Área: ${after.stage1Reduction} · Reducción Interceptación de Munición: ${after.interceptionReduction} → Valor de Ataque tras defensas: ${after.total}`);
    summaryLines.push(`Sistema de detección del objetivo ${state.detectionSystemActive === 'yes' ? 'activado' : 'no activado'}: modificación ${modifier}${result.cancelledByNine ? ' (cancelada por la tirada 9)' : ''}.`);
    summaryLines.push(`Plan ${result.lightPlan ? '[L] Ligero' : 'Normal'}, tirada ${state.finalRoll} → columna «${result.columnResult.columnLabel}» → ${result.cell.rawCell === '.' ? 'sin impactos' : result.cell.rawCell}.`);

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);

    const resultText = `${result.impacts} Punto(s) de Impacto`;
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    TableEngine.describeResolution(tables.armDamage, result.cell).forEach((line) => wrap.appendChild(el('p', 'source-refs', line)));
    wrap.appendChild(renderGrid(tables.armDamage, tables.armDamage.rowAxis.values,
      TableEngine.pickAxisLabels(tables.armDamage.columnAxis, result.columnScheme), result.cell));
    wrap.appendChild(el('p', 'pending-note', 'La aplicación de estos Puntos de Impacto a la unidad de radar objetivo (Decision Book §5.14.3: "similar a la regla 5.15, pero aplicado específicamente a unidades de radar") no está modelada todavía: se resuelve sobre las fichas físicas. Nota de la hoja (p.13): el objetivo no recibe bonificación de protección por el terreno donde se encuentra (§5.15.1, excepción ARM).'));

    AppCore.renderLowAltitudeCounterattackSection(wrap, state.lowAltitudeCounterattack, tables.counterattack, rerender, {
      sourceLine: 'Página 14: Contraataque a Baja Altura (esquema Sistema de Defensa Aérea, 1 / 2+).',
      description: 'Si el ataque incluyó un Asalto a Corta Distancia, el objetivo atacado puede contraatacar a las unidades de vuelo bajo atacantes: un disparo (1d10) por atacante, con el Valor de Defensa Aérea del sistema como columna.',
      pendingNote: 'Solo puede disparar contra plataformas de baja altura, solo puede ser realizado por la unidad que recibe el ataque, solo contra atacantes en el mismo hex y no consume munición de defensa aérea. Comprueba tú esas condiciones: la aplicación no las verifica.',
      pendingTrace: 'Página 14 de las tablas de combate (notas de referencia de data/tables/page-14.json).',
      aaPrompt: 'Valor de Defensa Aérea del sistema que contraataca'
    });

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
      saveResolutionToHistory({ workflowId: 'anti_radiation', workflowTitle: workflow.title, summaryText: fullSummaryText, state });
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
  root.Views.AntiRadiationWizard = { render: renderAntiRadiationWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
