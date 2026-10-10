// Wizard de combate: Ataque Terrestre No Guiado (roadmap Fase 9;
// data/workflows/03_ataque_terrestre_no_guiado.json + data/tables/page-07…10.json +
// public/js/ground-guided-attack-engine.js). Sigue el Decision Book §5.13
// (pp. 78-81): Valor de Ataque -> Intercepción Final -> Interceptación de
// Munición -> modificación de la Fuerza de Ataque (solo contra unidades móviles,
// §5.13.2) -> tabla de "Ataque no guiado contra objetivos terrestres" ->
// Contraataque a Baja Altura.
//
// Reutiliza el motor del ataque terrestre guiado (la página 9 tiene la misma
// estructura que la 5: 4 combinaciones de método Ligero/no ligero × Normal/
// Persecución, fila Móvil/Fijo, tirada 9, tope 66 en vez de 13), las funciones
// de CombatWizardEngine para la Intercepción Final y la Interceptación de
// Munición, y `AppCore.renderLowAltitudeCounterattackSection`. Los textos y
// los datos de cada regla viven en el workflow 03.
//
// El Valor de Ataque se introduce a mano. Se resuelve UN método de ataque por
// ejecución: el reglamento permite varios tipos de ataque con una única tirada
// compartida (§5.13.6), no modelado aquí. Los efectos de los impactos sobre la
// unidad o instalación (§5.15, página 9) no se aplican: se muestran como
// referencia.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage,
    makeTextField, makeNumberField, makeSelectFromValues, makeOptionGroup,
    renderModifierSummary, wizardActionRow, wizardNavButton, renderGrid
  } = AppCore;
  const { getWizardStage, computeInterceptionResult } = AntishipGuidedModel;

  const WIZARD_STEPS = [
    'Intercepción final',
    'Datos base del ataque',
    'Interceptación de munición',
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
      targetMobile: '',
      distanceBand: '',
      forceSizeTotal: '',
      guidanceModifier: '',
      finalInterception: { aaLow: '', aaHigh: '', roll: '' },
      stageAnswers: { munition_interception: {} },
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
    state.step = 4;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'ground-unguided', type: 'ground_unguided', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  const intensityStage = (workflow) => getWizardStage(workflow, 'attack_intensity');
  const intensityQuestion = (workflow, id) => intensityStage(workflow).questions.find((q) => q.id === id);
  const targetKey = () => (state.targetMobile === 'yes' ? 'mobile' : 'fixed');

  // Modificador de la opción elegida de una pregunta de la etapa de intensidad.
  function optionModifier(question, value) {
    const opt = (question.options || []).find((o) => o.value === value);
    if (!opt) return null;
    const eff = (opt.effects || []).find((e) => e.target === 'attack_intensity');
    return eff ? eff.value : 0;
  }

  // Modificador de cada pregunta aplicable; las que faltan quedan en `missing`.
  function intensityValues(workflow) {
    const stage = intensityStage(workflow);
    const values = {};
    const missing = [];
    (stage.modifierGroups.byTarget[targetKey()] || []).forEach((id) => {
      if (id === 'force_size_excess') {
        if (state.forceSizeTotal === '' || Number.isNaN(Number(state.forceSizeTotal))) { missing.push(id); return; }
        values[id] = GroundGuidedAttackEngine.forceSizeBlocks(state.forceSizeTotal, stage.forceSize) * stage.forceSize.perBlock;
      } else if (id === 'guidance_modifier') {
        if (state.guidanceModifier === '' || Number.isNaN(Number(state.guidanceModifier))) { missing.push(id); return; }
        values[id] = Math.abs(Number(state.guidanceModifier));
      } else {
        const v = optionModifier(intensityQuestion(workflow, id), state.distanceBand);
        if (v === null) { missing.push(id); return; }
        values[id] = v;
      }
    });
    return { values, missing };
  }

  async function renderGroundUnguidedWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('ground-unguided', state, freshState);
    linkToTurnContextIfNeeded(state, 'Ataque terrestre no guiado');
    AppCore.persistWizardDraft('ground-unguided', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Ataque terrestre no guiado']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let page7;
    let page8;
    let page9;
    let page6;
    let airMissions;
    try {
      [workflow, page7, page8, page9, page6, airMissions] = await Promise.all([
        loadWorkflow('03_ataque_terrestre_no_guiado.json'),
        loadTablePage('page-07.json'),
        loadTablePage('page-08.json'),
        loadTablePage('page-09.json'),
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
      finalInterception: TableEngine.findTableInPage(page7, 'ground-unguided-final-interception').table,
      interception: TableEngine.findTableInPage(page8, 'munition-interception-unguided').table,
      damage: TableEngine.findTableInPage(page9, workflow.finalResolution.table.id).table,
      counterattack: TableEngine.findTableInPage(page6, 'low-altitude-counterattack').table
    };

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', workflow.title));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', `${workflow.source.document}, págs. ${workflow.source.pages} · Decision Book §5.13. Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.`));

    const rerender = () => { renderGroundUnguidedWizard(); };

    AppCore.mountWizardDraft('ground-unguided', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    if (state.step === 0) AppCore.renderMissionContext(wrap, state, airMissions, rerender, null, { surfaceOrGround: true });
    [
      () => renderStepFinalInterception(wrap, workflow, tables, rerender),
      () => renderStepBase(wrap, workflow, rerender),
      () => renderStepMunitionInterception(wrap, workflow, tables, rerender),
      () => renderStepIntensity(wrap, workflow, tables, rerender),
      () => renderStepResult(wrap, workflow, tables, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Intercepción Final ----------
  function renderStepFinalInterception(wrap, workflow, tables, rerender) {
    const stage = getWizardStage(workflow, 'final_interception');
    const table = tables.finalInterception;
    const fi = state.finalInterception;

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));
    wrap.appendChild(el('p', 'turn-view__desc', `${stage.specialRules} Puede disparar la unidad atacante cuando tiene el icono de Intercepción Final: el defensor suma el Valor AA de todas sus unidades del mismo tipo de consumo (Bajo/Alto) y consulta la tabla una vez por cada tipo con unidades, sumando los impactos. Deja en blanco el consumo que no tenga unidades disparando.`));
    wrap.appendChild(wizardNavButton('Ver tabla de Intercepción Final (pág. 7)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-07.json/ground-unguided-final-interception';
    }));

    wrap.appendChild(makeNumberField('Valor de Defensa Aérea agrupado de las unidades de consumo Bajo (opcional)', fi.aaLow, (v) => { fi.aaLow = v; }, rerender, { visualRef: 'grouped-aa' }));
    wrap.appendChild(makeNumberField('Valor de Defensa Aérea agrupado de las unidades de consumo Alto (opcional)', fi.aaHigh, (v) => { fi.aaHigh = v; }, rerender, { visualRef: 'grouped-aa' }));
    wrap.appendChild(makeSelectFromValues('Tirada de la Intercepción Final (1d10)', table.rowAxis.values, fi.roll, (v) => { fi.roll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
      fi.roll = table.rowAxis.values[Math.floor(Math.random() * table.rowAxis.values.length)];
      rerender();
    }));

    if (fi.roll !== '' && (fi.aaLow !== '' || fi.aaHigh !== '')) {
      const aaTotalLow = fi.aaLow !== '' ? Number(fi.aaLow) : undefined;
      const aaTotalHigh = fi.aaHigh !== '' ? Number(fi.aaHigh) : undefined;
      try {
        const shot = CombatWizardEngine.resolveFinalInterceptionShot(table, TableEngine, { roll: Number(fi.roll), aaTotalLow, aaTotalHigh });
        const box = el('div', 'wizard-modifier-summary');
        if (shot.shots.low) box.appendChild(el('span', 'source-refs', `Consumo Bajo (A.A.=${aaTotalLow}): ${shot.shots.low.rawCell === '.' ? 'sin impactos' : `${shot.shots.low.rawCell} impacto(s)`}`));
        if (shot.shots.high) box.appendChild(el('span', 'source-refs', `Consumo Alto (A.A.=${aaTotalHigh}): ${shot.shots.high.rawCell === '.' ? 'sin impactos' : `${shot.shots.high.rawCell} impacto(s)`}`));
        box.appendChild(el('span', 'wizard-modifier-summary__total', `Impactos de Intercepción Final: ${shot.totalImpacts}`));
        wrap.appendChild(box);
      } catch (err) {
        wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${err.message}`));
      }
      wrap.appendChild(el('p', 'pending-note', 'Ninguna fuente disponible especifica qué le ocurre al bando atacante con estos impactos: se muestran sin asumir una consecuencia sobre unidades o daño concreto (AGENTS.md §14).'));
    }

    wrap.appendChild(wizardActionRow([wizardNavButton('Siguiente →', 'primary', () => { state.step = 1; rerender(); })]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Datos base ----------
  function renderStepBase(wrap, workflow, rerender) {
    const fr = workflow.finalResolution;
    wrap.appendChild(el('h2', null, 'Datos base del ataque'));
    wrap.appendChild(el('p', 'pending-note', 'El Valor de Ataque se introduce a mano (el del plan de ataque de la unidad atacante): este wizard no deriva el valor de ningún plan transcrito. Se resuelve un método de ataque por ejecución (si el ataque combina varios, el reglamento usa una única tirada para todos: repite el wizard con esa misma tirada y suma los impactos).'));
    wrap.appendChild(makeTextField('Objetivo (opcional)', state.targetLabel, (v) => { state.targetLabel = v; }));
    wrap.appendChild(makeNumberField('Valor de Ataque base del plan de ataque no guiado', state.baseAttackValue, (v) => { state.baseAttackValue = v; }, rerender, { visualRef: 'attack-base-value' }));
    wrap.appendChild(makeOptionGroup({ prompt: 'Tipo de ataque: ¿el plan de ataque es Ligero (marcado con una L, fondo negro en la tabla)?', options: YES_NO }, state.lightPlan, (v) => { state.lightPlan = v; rerender(); }));
    wrap.appendChild(makeOptionGroup({ prompt: 'Tipo de munición: ¿es de Persecución (la munición con el icono junto a la palabra "Persecución" en la tabla) o el ataque es una Persecución Aérea?', options: [{ value: 'no', label: 'Normal' }, { value: 'yes', label: 'Persecución' }] }, state.pursuit, (v) => { state.pursuit = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', 'Un plan marcado Ligero (L) también recibe -3 a la tirada de Interceptación de Munición (Decision Book §6.5.3.D): se aplica en el paso siguiente sin volver a preguntarlo.'));
    if (state.lightPlan !== '' && state.pursuit !== '') {
      const row = GroundGuidedAttackEngine.selectMethodRow(fr.methodRows, { lightPlan: state.lightPlan === 'yes', pursuit: state.pursuit === 'yes' });
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Fila de la tabla: ${row.label}.`));
    }
    wrap.appendChild(el('p', 'source-refs', fr.note));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (state.baseAttackValue === '' || Number.isNaN(Number(state.baseAttackValue))) { alert('Introduce el Valor de Ataque base.'); return; }
        if (state.lightPlan === '' || state.pursuit === '') { alert('Indica el tipo de ataque (Ligero o no) y el tipo de munición (Normal o Persecución).'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Interceptación de Munición ----------
  function renderStepMunitionInterception(wrap, workflow, tables, rerender) {
    const s = state;
    const stage = getWizardStage(workflow, 'munition_interception');
    const answers = s.stageAnswers.munition_interception;
    // El icono 'L' (Munición Ligera) del plan es el mismo dato que el tipo de ataque
    // del paso anterior: se deriva en vez de volver a preguntarlo.
    answers.unguided_icon_type = s.lightPlan === 'yes' ? 'yes' : 'no';

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));
    wrap.appendChild(wizardNavButton('Ver tabla de Interceptación de Munición (pág. 8)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-08.json/munition-interception-unguided';
    }));
    AppCore.renderStageQuestions(wrap, stage, answers, {
      rerender,
      renderQuestion: (q, target) => {
        if (q.id === 'unguided_icon_type') {
          target.appendChild(el('p', 'wizard-question__prompt', q.prompt));
          target.appendChild(el('p', 'source-refs', `Derivado del tipo de ataque del paso anterior: ${s.lightPlan === 'yes' ? 'Sí (plan Ligero: -3 a la tirada)' : 'No'}.`));
          return true;
        }
        if (q.id === 'short_range_restriction') {
          AppCore.renderShortRangeRestriction(target, q, answers, s, 'attackDistanceHexes', s.missionContext, rerender);
          return true;
        }
        return false;
      }
    });
    const interception = computeInterceptionResult(workflow, s, tables.interception);
    wrap.appendChild(renderModifierSummary('Modificador compartido de rendimiento/detección/munición (se suma a la tirada de cada disparo)', interception.modResult));
    // Los cortes de flujo del workflow (flowCuts) los muestra el renderizador común.
    AppCore.renderStageRules(wrap, workflow, 'munition_interception', answers);
    CombatWizardEngine.collectRuleEffects(stage.questions, answers).filter((r) => !r.cutsStage).forEach((r) => {
      wrap.appendChild(el('p', 'pending-note', `Regla: ${r.ruleValue} (${r.prompt} → ${r.optionLabel})`));
    });

    wrap.appendChild(el('p', 'turn-view__desc', 'Cada unidad que intercepta dispara por separado: introduce su Valor de Defensa Aérea PROPIO, su tirada (1d10) y su consumo.'));
    AppCore.appendLowConsumptionRestrictions(wrap, stage);
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

    const attackAfter = Number(s.baseAttackValue) + interception.reduction;
    wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Valor de Ataque tras la Interceptación de Munición: ${s.baseAttackValue} + (${interception.reduction}) = ${attackAfter}`));

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 1; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => { s.step = 3; rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  // Valor de Ataque tras la interceptación + resolución con los datos introducidos.
  function computeAttack(workflow, tables) {
    const fr = workflow.finalResolution;
    const stage = intensityStage(workflow);
    state.stageAnswers.munition_interception.unguided_icon_type = state.lightPlan === 'yes' ? 'yes' : 'no';
    const interception = computeInterceptionResult(workflow, state, tables.interception);
    const attackAfter = Number(state.baseAttackValue) + interception.reduction;
    const method = GroundGuidedAttackEngine.selectMethodRow(fr.methodRows, { lightPlan: state.lightPlan === 'yes', pursuit: state.pursuit === 'yes' });
    let modifier = null;
    let missing = ['target_mobile'];
    if (state.targetMobile !== '') {
      const iv = intensityValues(workflow);
      missing = iv.missing;
      modifier = GroundGuidedAttackEngine.computeIntensityModifier(stage.modifierGroups.byTarget, targetKey(), iv.values);
    }
    let result = null;
    if (!Number.isNaN(attackAfter) && modifier && !missing.length && state.finalRoll !== '') {
      result = GroundGuidedAttackEngine.resolveGroundGuidedAttack(tables.damage, TableEngine, {
        attackValue: attackAfter, columnScheme: method.columnScheme, targetFixed: state.targetMobile === 'no',
        intensityModifier: modifier.net, roll: Number(state.finalRoll), valueCap: fr.valueCap, rollRowSchemes: fr.rollRowScheme
      });
    }
    return { interception, attackAfter, modifier, missing, method, result };
  }

  // ---------- Paso 4: Modificación de la Fuerza de Ataque y tirada ----------
  function renderStepIntensity(wrap, workflow, tables, rerender) {
    const stage = intensityStage(workflow);
    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));
    wrap.appendChild(wizardNavButton('Ver tabla de ataque no guiado (pág. 9)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-09.json/ground-unguided-attack-damage';
    }));

    const qTarget = intensityQuestion(workflow, 'target_mobile');
    wrap.appendChild(makeOptionGroup(qTarget, state.targetMobile, (v) => { state.targetMobile = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', stage.modifierGroups.note));

    if (state.targetMobile === 'yes') {
      const band = AppCore.renderDistanceBand(wrap, stage.distanceRule, state, 'attackDistanceHexes', state.missionContext, state.stageAnswers.munition_interception, rerender);
      state.distanceBand = band !== null ? band : '';
      wrap.appendChild(makeNumberField('Tamaño de fuerza impreso total de las unidades terrestres propias en el hexágono objetivo', state.forceSizeTotal, (v) => { state.forceSizeTotal = v; }, rerender, { visualRef: 'ground-force-size' }));
      wrap.appendChild(el('p', 'source-refs', stage.forceSize.note));
      wrap.appendChild(makeNumberField('Corrección de designación aplicable (0 si no hay unidad designadora)', state.guidanceModifier, (v) => { state.guidanceModifier = v; }, rerender, { visualRef: 'designation-correction' }));
      wrap.appendChild(el('p', 'source-refs', stage.designationNote));
    } else if (state.targetMobile === 'no') {
      wrap.appendChild(el('p', 'turn-view__desc', 'Contra instalaciones fijas el ataque no guiado no recibe modificaciones de Fuerza de Ataque (Decision Book §5.13.2).'));
    }

    const { missing, modifier, attackAfter, method, result } = computeAttack(workflow, tables);
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
    wrap.appendChild(el('p', 'turn-view__desc', `${stage.formula} ${stage.specialRules} Con un Valor de Ataque > 66 cada punto negativo lo reduce en 1 hasta 66 (Decision Book §5.13.6).`));
    wrap.appendChild(el('p', 'source-refs', `Fila de la tabla: ${method.label}. La columna de tirada es la de ${state.targetMobile === 'no' ? 'Objetivos Fijos' : 'Objetivos Móviles'} (§5.13.6).`));

    wrap.appendChild(makeSelectFromValues('Tirada de resolución (1d10)', DIE_VALUES, state.finalRoll, (v) => { state.finalRoll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
      state.finalRoll = String(Math.floor(Math.random() * 10));
      rerender();
    }));

    wrap.appendChild(el('p', 'source-refs', `Valor de Ataque tras la interceptación: ${attackAfter}${modifier ? ` · modificación neta de intensidad: ${modifier.net}` : ''}.`));
    if (result) {
      if (result.cancelledByNine) wrap.appendChild(el('p', 'pending-note', 'Tirada 9: se cancelan todas las modificaciones de la Fuerza de Ataque (Decision Book §5.13.6, nota especial).'));
      if (result.noColumn) {
        wrap.appendChild(el('p', 'pending-note', `No hay columna para este Valor de Ataque: ${result.reason} Las fuentes no dicen qué ocurre (AGENTS.md §14).`));
      } else {
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Columna de la tabla: «${result.columnResult.columnLabel}» (${method.label}), fila «${result.cell.rowLabel}» (${result.targetFixed ? 'Fijo' : 'Móvil'}) → ${result.cell.rawCell === '.' ? 'sin impactos' : `${result.cell.rawCell} Punto(s) de Impacto`}.`));
      }
    }

    const canAdvance = result && !result.noColumn;
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 2; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!canAdvance) { alert(missing.length ? 'Completa el tipo de objetivo y sus modificadores.' : 'Completa la tirada (con un Valor de Ataque que tenga columna).'); return; }
        state.step = 4;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 5: Resultado y contraataque ----------
  function renderStepResult(wrap, workflow, tables, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const { interception, attackAfter, modifier, method, result } = computeAttack(workflow, tables);
    if (!result || result.noColumn) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos: vuelve al paso anterior.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 3; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const targetLabel = state.targetMobile === 'yes' ? 'unidad móvil' : 'instalación fija';

    const summaryLines = [];
    summaryLines.push(`Objetivo: ${state.targetLabel ? `${state.targetLabel} (${targetLabel})` : targetLabel}`);
    summaryLines.push(`Valor de Ataque base: ${state.baseAttackValue}`);
    summaryLines.push(`Reducción Interceptación de Munición: ${interception.reduction} → Valor de Ataque tras la interceptación: ${attackAfter}`);
    summaryLines.push(`Modificación de Fuerza de Ataque: ${modifier.raw}${modifier.positiveDiscarded ? ' (neto 0)' : ''}${result.cancelledByNine ? ', cancelada por la tirada 9' : ''}.`);
    summaryLines.push(`Método: ${method.label}; tirada ${state.finalRoll} (${result.targetFixed ? 'Fijo' : 'Móvil'}) → columna «${result.columnResult.columnLabel}», fila «${result.cell.rowLabel}» → ${result.cell.rawCell === '.' ? 'sin impactos' : result.cell.rawCell}.`);

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);

    const resultText = `${result.impacts} Punto(s) de Impacto`;
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    TableEngine.describeResolution(tables.damage, result.cell).forEach((line) => wrap.appendChild(el('p', 'source-refs', line)));
    wrap.appendChild(renderGrid(tables.damage, tables.damage.rowAxis.values,
      TableEngine.pickAxisLabels(tables.damage.columnAxis, result.columnScheme || undefined), result.cell));
    wrap.appendChild(el('p', 'pending-note', 'La aplicación de estos Puntos de Impacto a la unidad o instalación objetivo (Decision Book §5.15 / página 9: pérdidas de personal, nivel de pista, instalaciones paralizadas…) se resuelve en el wizard de Resultado del ataque terrestre (botón de abajo).'));
    wrap.appendChild(wizardNavButton('Aplicar los impactos al objetivo (§5.15) →', 'primary', () => {
      Views.GroundAttackResultWizard.prefill({ impacts: result.impacts, kind: state.resultKind });
      location.hash = '#/wizard/ground-attack-result';
    }));

    AppCore.renderLowAltitudeCounterattackSection(wrap, state.lowAltitudeCounterattack, tables.counterattack, rerender, {
      sourceLine: 'Página 10: Contraataque a Baja Altura (misma tabla que la página 6; Decision Book §5.13.7 y §6.6).',
      description: 'Después de resolver el ataque no guiado, la unidad terrestre objetivo puede contraatacar a todos los atacantes que realizaron un Asalto a Corta Distancia: un disparo (1d10) por atacante, con su Valor de Defensa Aérea como columna.',
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
      saveResolutionToHistory({ workflowId: 'ground_unguided', workflowTitle: workflow.title, summaryText: fullSummaryText, state });
      unlinkTurnContext(state);
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 3; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => { unlinkTurnContext(state); state = freshState(); rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.GroundUnguidedWizard = { render: renderGroundUnguidedWizard, loadStateFromHistory, prefill };
})(typeof window !== 'undefined' ? window : globalThis);
