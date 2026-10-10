// Wizard de combate: Ataque Terrestre Guiado (roadmap Fase 9;
// data/workflows/02_ataque_terrestre_guiado.json + data/tables/page-03…06.json +
// public/js/ground-guided-attack-engine.js). Sigue el Decision Book §5.12
// (pp. 74-78): Valor de Ataque -> Defensa Aérea de Área (CM/BM) ->
// Interceptación de Munición -> modificación de la Fuerza de Ataque (según el
// tipo de objetivo, §5.12.9) -> tabla de "Ataque de precisión contra objetivos
// terrestres" -> Contraataque a Baja Altura.
//
// Reutiliza sin cambios las funciones puras de los demás wizards de ataque
// (AntishipGuidedModel.computeStage1Reduction / computeInterceptionResult /
// computeAttackValueAfterDefenses, `AppCore.renderInterceptionShotRows` y
// `AppCore.renderLowAltitudeCounterattackSection`). Lo propio del ataque
// terrestre (grupos de modificadores, 4 combinaciones de método, fila Móvil/Fijo,
// el 9 natural) vive en el motor puro y en los datos del workflow.
//
// Como en los demás wizards sin plan transcrito, el Valor de Ataque se introduce
// a mano. Se resuelve UN método de ataque por ejecución: el reglamento permite
// varios tipos de ataque con una única tirada compartida (§5.12.10), no
// modelado aquí. Los efectos de los impactos sobre la unidad o instalación
// (§5.15, página 6) no se aplican: se muestran como referencia.
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
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return {
      step: 0,
      missionContext: { missionId: '', areaMission: '', source: 'manual' },
      attackDistanceHexes: '',
      resultKind: '',
      targetLabel: '',
      baseAttackValue: '',
      lightPlan: '',
      pursuit: '',
      targetType: '',
      intensityAnswers: {},
      forceSizeTotal: '',
      guidanceModifier: '',
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

  // Lo usa el wizard de Ataques de Reacción: abre el ataque con los ajustes de la
  // reacción (fila Persecución, misión ON CALL, tipo de resultado sin terreno…).
  function prefill({ pursuit, missionContext, resultKind }) {
    state = freshState();
    if (pursuit) state.pursuit = 'yes';
    if (missionContext) state.missionContext = missionContext;
    if (resultKind) state.resultKind = resultKind;
  }

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 3;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'ground-guided', type: 'ground_guided', getState: () => state });
  const linkToTurnContextIfNeeded = (s, workflowTitle) => lifecycle.link(workflowTitle);
  const unlinkTurnContext = () => lifecycle.unlink();

  const intensityStage = (workflow) => getWizardStage(workflow, 'attack_intensity');
  const intensityQuestion = (workflow, id) => intensityStage(workflow).questions.find((q) => q.id === id);

  // Efecto numérico de la opción elegida de una pregunta de la etapa de
  // intensidad (los valores viven en el workflow, no aquí).
  function optionModifier(question, value) {
    const opt = (question.options || []).find((o) => o.value === value);
    if (!opt) return null;
    const eff = (opt.effects || []).find((e) => e.target === 'attack_intensity');
    return eff ? eff.value : 0;
  }

  // Modificador de cada pregunta aplicable; null en los que aún faltan datos.
  function intensityValues(workflow) {
    const stage = intensityStage(workflow);
    const values = {};
    const missing = [];
    const applicable = stage.modifierGroups.byTargetType[state.targetType] || [];
    applicable.forEach((id) => {
      const q = intensityQuestion(workflow, id);
      if (id === 'force_size_excess') {
        if (state.forceSizeTotal === '' || Number.isNaN(Number(state.forceSizeTotal))) { missing.push(id); return; }
        const blocks = GroundGuidedAttackEngine.forceSizeBlocks(state.forceSizeTotal, stage.forceSize);
        values[id] = blocks * stage.forceSize.perBlock;
      } else if (id === 'guidance_modifier') {
        if (state.guidanceModifier === '' || Number.isNaN(Number(state.guidanceModifier))) { missing.push(id); return; }
        values[id] = Math.abs(Number(state.guidanceModifier));
      } else {
        const v = optionModifier(q, state.intensityAnswers[id]);
        if (v === null) { missing.push(id); return; }
        values[id] = v;
      }
    });
    return { values, missing };
  }

  async function renderGroundGuidedWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('ground-guided', state, freshState);
    linkToTurnContextIfNeeded(state, 'Ataque terrestre guiado');
    AppCore.persistWizardDraft('ground-guided', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Ataque terrestre guiado']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let areaDefenseLoaded;
    let interceptionLoaded;
    let page5;
    let page6;
    let airMissions;
    try {
      [workflow, areaDefenseLoaded, interceptionLoaded, page5, page6, airMissions] = await Promise.all([
        loadWorkflow('02_ataque_terrestre_guiado.json'),
        loadTableById('page-03.json', 'ground-guided-area-air-defense'),
        loadTableById('page-04.json', 'munition-interception-standard'),
        loadTablePage('page-05.json'),
        loadTablePage('page-06.json'),
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
      damage: TableEngine.findTableInPage(page5, workflow.finalResolution.table.id).table,
      counterattack: TableEngine.findTableInPage(page6, 'low-altitude-counterattack').table
    };

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', workflow.title));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', `${workflow.source.document}, págs. ${workflow.source.pages} · Decision Book §5.12. Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.`));

    const rerender = () => { renderGroundGuidedWizard(); };

    AppCore.mountWizardDraft('ground-guided', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    if (state.step === 0) AppCore.renderMissionContext(wrap, state, airMissions, rerender, null, { surfaceOrGround: true });
    [
      () => renderStepBase(wrap, workflow, rerender),
      () => renderStepDefenses(wrap, workflow, tables, rerender),
      () => renderStepIntensity(wrap, workflow, tables, rerender),
      () => renderStepResult(wrap, workflow, tables, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Datos base ----------
  function renderStepBase(wrap, workflow, rerender) {
    const fr = workflow.finalResolution;
    wrap.appendChild(el('h2', null, 'Datos base del ataque'));
    wrap.appendChild(el('p', 'pending-note', 'El Valor de Ataque se introduce a mano (el del plan de ataque de la unidad atacante): este wizard no deriva el valor de ningún plan transcrito. Se resuelve un método de ataque por ejecución (si el ataque combina varios, el reglamento usa una única tirada para todos: repite el wizard con esa misma tirada y suma los impactos).'));
    wrap.appendChild(makeTextField('Objetivo (opcional)', state.targetLabel, (v) => { state.targetLabel = v; }));
    wrap.appendChild(makeNumberField('Valor de Ataque base del plan de ataque', state.baseAttackValue, (v) => { state.baseAttackValue = v; }, rerender, { visualRef: 'attack-base-value' }));
    wrap.appendChild(makeOptionGroup({ prompt: 'Tipo de ataque: ¿el plan de ataque es Ligero (marcado con una L, fondo negro en la tabla)?', options: YES_NO }, state.lightPlan, (v) => { state.lightPlan = v; rerender(); }));
    wrap.appendChild(makeOptionGroup({ prompt: 'Tipo de munición: ¿es de Persecución (la munición con el icono junto a la palabra "Persecución" en la tabla) o el ataque es una Persecución Aérea?', options: [{ value: 'no', label: 'Normal' }, { value: 'yes', label: 'Persecución' }] }, state.pursuit, (v) => { state.pursuit = v; rerender(); }));
    if (state.lightPlan !== '' && state.pursuit !== '') {
      const row = GroundGuidedAttackEngine.selectMethodRow(fr.methodRows, { lightPlan: state.lightPlan === 'yes', pursuit: state.pursuit === 'yes' });
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Fila de la tabla: ${row.label}.`));
    }
    wrap.appendChild(el('p', 'source-refs', fr.note));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (state.baseAttackValue === '' || Number.isNaN(Number(state.baseAttackValue))) { alert('Introduce el Valor de Ataque base.'); return; }
        if (state.lightPlan === '' || state.pursuit === '') { alert('Indica el tipo de ataque (Ligero o no) y el tipo de munición (Normal o Persecución).'); return; }
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
    AppCore.renderStageQuestions(wrap, stage1, s.stageAnswers.area_air_defense, { rerender });
    wrap.appendChild(wizardNavButton('Ver tabla de Defensa Aérea de Área (pág. 3)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-03.json/ground-guided-area-air-defense';
    }));

    const stage1Info = computeStage1Reduction(workflow, s, tables.areaAirDefense);
    if (!stage1Info.applies) {
      wrap.appendChild(el('p', 'turn-view__desc', 'La munición no está marcada CM/BM: esta etapa no se resuelve (reducción = 0). Decision Book §5.12 paso 2.'));
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
    wrap.appendChild(wizardNavButton('Ver tabla de Interceptación de Munición (pág. 4)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-04.json/munition-interception-standard';
    }));
    AppCore.renderStageQuestions(wrap, stage2, s.stageAnswers.munition_interception, {
      rerender,
      custom: {
        short_range_restriction: (q, target) => AppCore.renderShortRangeRestriction(target, q, s.stageAnswers.munition_interception, s, 'attackDistanceHexes', s.missionContext, rerender)
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

  // Valor de Ataque tras las defensas + resolución con los datos introducidos.
  function computeAttack(workflow, tables) {
    const fr = workflow.finalResolution;
    const stage = intensityStage(workflow);
    const after = computeAttackValueAfterDefenses(workflow, state, tables.interception, tables.areaAirDefense);
    const { values, missing } = state.targetType === '' ? { values: {}, missing: ['target_type'] } : intensityValues(workflow);
    const modifier = state.targetType === '' ? null : GroundGuidedAttackEngine.computeIntensityModifier(stage.modifierGroups.byTargetType, state.targetType, values);
    const method = GroundGuidedAttackEngine.selectMethodRow(fr.methodRows, { lightPlan: state.lightPlan === 'yes', pursuit: state.pursuit === 'yes' });
    let result = null;
    if (!Number.isNaN(after.total) && modifier && !missing.length && state.finalRoll !== '') {
      result = GroundGuidedAttackEngine.resolveGroundGuidedAttack(tables.damage, TableEngine, {
        attackValue: after.total, columnScheme: method.columnScheme, targetFixed: state.targetType === 'fixed',
        intensityModifier: modifier.net, roll: Number(state.finalRoll), valueCap: fr.valueCap, rollRowSchemes: fr.rollRowScheme
      });
    }
    return { after, modifier, missing, method, result };
  }

  // ---------- Paso 3: Modificación de la Fuerza de Ataque y tirada ----------
  function renderStepIntensity(wrap, workflow, tables, rerender) {
    const stage = intensityStage(workflow);
    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));
    wrap.appendChild(wizardNavButton('Ver tabla de ataque de precisión (pág. 5)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-05.json/ground-precision-attack-damage';
    }));

    const qTarget = intensityQuestion(workflow, 'target_type');
    wrap.appendChild(makeOptionGroup(qTarget, state.targetType, (v) => { state.targetType = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', stage.modifierGroups.note));

    const applicable = state.targetType === '' ? [] : stage.modifierGroups.byTargetType[state.targetType];
    applicable.forEach((id) => {
      const q = intensityQuestion(workflow, id);
      if (id === 'force_size_excess') {
        wrap.appendChild(makeNumberField('Tamaño de fuerza impreso total de las unidades terrestres propias en el hexágono objetivo', state.forceSizeTotal, (v) => { state.forceSizeTotal = v; }, rerender, { visualRef: 'ground-force-size' }));
        wrap.appendChild(el('p', 'source-refs', stage.forceSize.note));
      } else if (id === 'guidance_modifier') {
        wrap.appendChild(makeNumberField('Corrección de designación aplicable (0 si no hay unidad designadora)', state.guidanceModifier, (v) => { state.guidanceModifier = v; }, rerender, { visualRef: 'designation-correction' }));
        wrap.appendChild(el('p', 'source-refs', stage.designationNote));
      } else if (id === 'attack_distance_band') {
        const band = AppCore.renderDistanceBand(wrap, stage.distanceRule, state, 'attackDistanceHexes', state.missionContext, state.stageAnswers.munition_interception, rerender);
        if (band !== null) state.intensityAnswers[id] = band; else delete state.intensityAnswers[id];
      } else {
        wrap.appendChild(makeOptionGroup(q, state.intensityAnswers[id], (v) => { state.intensityAnswers[id] = v; rerender(); }));
      }
    });

    const { missing, modifier, after, method, result } = computeAttack(workflow, tables);
    if (modifier) {
      const box = el('div', 'wizard-modifier-summary');
      const { values } = intensityValues(workflow);
      modifier.parts.forEach((p) => {
        const known = values[p.id] !== undefined;
        box.appendChild(el('span', 'source-refs', `${intensityQuestion(workflow, p.id).prompt} → ${known ? (p.value >= 0 ? '+' : '') + p.value : 'pendiente'}`));
      });
      box.appendChild(el('span', 'wizard-modifier-summary__total', `Modificación de Fuerza de Ataque: ${modifier.raw >= 0 ? '+' : ''}${modifier.raw}${modifier.positiveDiscarded ? ' → neto 0 (las positivas solo compensan negativas)' : ''}`));
      wrap.appendChild(box);
    }
    wrap.appendChild(el('p', 'turn-view__desc', `${stage.formula} ${stage.specialRules} Con un Valor de Ataque > 13 cada punto negativo lo reduce en 1 hasta 13 (Decision Book §5.12.10).`));
    wrap.appendChild(el('p', 'source-refs', `Fila de la tabla: ${method.label}. La columna de tirada es la de ${state.targetType === 'fixed' ? 'Objetivos Fijos' : 'Objetivos Móviles'} (§5.12.10).`));

    wrap.appendChild(makeSelectFromValues('Tirada de resolución (1d10)', DIE_VALUES, state.finalRoll, (v) => { state.finalRoll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
      state.finalRoll = String(Math.floor(Math.random() * 10));
      rerender();
    }));

    wrap.appendChild(el('p', 'source-refs', `Valor de Ataque tras las defensas: ${after.total}${modifier ? ` · modificación neta de intensidad: ${modifier.net}` : ''}.`));
    if (result) {
      if (result.cancelledByNine) wrap.appendChild(el('p', 'pending-note', 'Tirada 9: se cancelan todas las modificaciones de la Fuerza de Ataque (Decision Book §5.12.10, nota especial).'));
      if (result.noColumn) {
        wrap.appendChild(el('p', 'pending-note', `No hay columna para este Valor de Ataque: ${result.reason} Las fuentes no dicen qué ocurre (AGENTS.md §14).`));
      } else {
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Columna de la tabla: «${result.columnResult.columnLabel}» (${method.label}), fila «${result.cell.rowLabel}» (${result.targetFixed ? 'Fijo' : 'Móvil'}) → ${result.cell.rawCell === '.' ? 'sin impactos' : `${result.cell.rawCell} Punto(s) de Impacto`}.`));
      }
    }

    const canAdvance = result && !result.noColumn;
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!canAdvance) { alert(missing.length ? 'Completa el tipo de objetivo y sus modificadores.' : 'Completa la tirada (con un Valor de Ataque que tenga columna).'); return; }
        state.step = 3;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 4: Resultado y contraataque ----------
  function renderStepResult(wrap, workflow, tables, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const { after, modifier, method, result } = computeAttack(workflow, tables);
    if (!result || result.noColumn) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos: vuelve al paso anterior.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 2; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const targetLabel = intensityQuestion(workflow, 'target_type').options.find((o) => o.value === state.targetType).label;

    const summaryLines = [];
    if (state.targetLabel) summaryLines.push(`Objetivo: ${state.targetLabel} (${targetLabel})`);
    else summaryLines.push(`Objetivo: ${targetLabel}`);
    summaryLines.push(`Valor de Ataque base: ${state.baseAttackValue}`);
    summaryLines.push(`Reducción Defensa Aérea de Área: ${after.stage1Reduction} · Reducción Interceptación de Munición: ${after.interceptionReduction} → Valor de Ataque tras defensas: ${after.total}`);
    summaryLines.push(`Modificación de Fuerza de Ataque: ${modifier.raw}${modifier.positiveDiscarded ? ' (neto 0)' : ''}${result.cancelledByNine ? ', cancelada por la tirada 9' : ''}.`);
    summaryLines.push(`Método: ${method.label}; tirada ${state.finalRoll} (${result.targetFixed ? 'Fijo' : 'Móvil'}) → columna «${result.columnResult.columnLabel}», fila «${result.cell.rowLabel}» → ${result.cell.rawCell === '.' ? 'sin impactos' : result.cell.rawCell}.`);

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);

    const resultText = `${result.impacts} Punto(s) de Impacto`;
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    TableEngine.describeResolution(tables.damage, result.cell).forEach((line) => wrap.appendChild(el('p', 'source-refs', line)));
    wrap.appendChild(renderGrid(tables.damage, tables.damage.rowAxis.values,
      TableEngine.pickAxisLabels(tables.damage.columnAxis, result.columnScheme), result.cell));
    wrap.appendChild(el('p', 'pending-note', 'La aplicación de estos Puntos de Impacto a la unidad o instalación objetivo (Decision Book §5.15 / página 6: pérdidas de personal, nivel de pista, instalaciones paralizadas…) se resuelve en el wizard de Resultado del ataque terrestre (botón de abajo).'));
    wrap.appendChild(wizardNavButton('Aplicar los impactos al objetivo (§5.15) →', 'primary', () => {
      Views.GroundAttackResultWizard.prefill({ impacts: result.impacts, kind: state.resultKind });
      location.hash = '#/wizard/ground-attack-result';
    }));
    wrap.appendChild(wizardNavButton('Ver los efectos de los impactos (pág. 6)', 'secondary', () => { location.hash = '#/ayuda/tablas/page-06.json'; }));

    AppCore.renderLowAltitudeCounterattackSection(wrap, state.lowAltitudeCounterattack, tables.counterattack, rerender, {
      sourceLine: 'Página 6: Contraataque a Baja Altura (Decision Book §5.12.11 y §6.6).',
      description: 'Después de resolver el ataque guiado, la unidad terrestre objetivo puede contraatacar a todos los atacantes que realizaron un Asalto a Corta Distancia: un disparo (1d10) por atacante, con su Valor de Defensa Aérea como columna.',
      pendingNote: 'Solo puede disparar contra plataformas de baja altura que hicieron un Asalto a Corta Distancia; ninguna de las condiciones se comprueba automáticamente.',
      aaPrompt: 'Valor de Defensa Aérea de la unidad terrestre objetivo'
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
      saveResolutionToHistory({ workflowId: 'ground_guided', workflowTitle: workflow.title, summaryText: fullSummaryText, state });
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
  root.Views.GroundGuidedWizard = { render: renderGroundGuidedWizard, loadStateFromHistory, prefill };
})(typeof window !== 'undefined' ? window : globalThis);
