// Wizard de combate: Ataque Antibuque No Guiado (roadmap Fase 8;
// correcciones.02.md COR02-010). Segundo consumidor real de los módulos
// defensivos ya construidos para el ataque guiado a superficie (Fase 7):
// `CombatWizardEngine.resolveFinalInterceptionShot` (Interceptación Final,
// hasta ahora sin NINGÚN consumidor pese a estar ya probada) y
// `resolveInterceptionShot`/`sumInterceptionReductions` (Interceptación de
// Munición, hasta ahora solo consumida por antiship_guided) — ambas
// funciones puras, sin cambios, solo alimentadas con las tablas propias de
// este workflow (`ground-unguided-final-interception` en page-07.json,
// `munition-interception-unguided` en page-08.json). También reutiliza
// `CombatModifierEngine.resolveAttackValueColumnShift` (Fase 5, motor de
// desplazamiento de columna, sin consumidor hasta ahora) para la etapa
// "Modificación de Intensidad", y `assignImpactTarget`/`applyImpactsToShip`/
// `checkSinking` para la asignación de daño (mismo mecanismo que
// antiship_guided, Decision Book §5.6.5).
//
// Alcance deliberadamente NO igual al de antiship_guided (COR-007): no hay
// ningún plan de ataque antibuque con icono `munition_unguided` transcrito
// en data/ammunition/ (verificado: 0 planes navales antibuque lo tienen —
// el "ataque no guiado" naval de este juego es Combate Naval Cercano con
// Artillería, cuyo Valor de Ataque se calcula sumando valores de combate de
// unidades, un dato que este proyecto no modela todavía). Por eso este
// wizard pide el Valor de Ataque a mano, igual que hace
// ground-close-combat-wizard.js con datos que tampoco están modelados por
// unidad — no es una regresión respecto a COR-007, es la única opción
// honesta con los datos disponibles (AGENTS.md §14: no inventar un plan que
// no existe).
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage, renderNotFound, renderGrid,
    makeTextField, makeNumberField, makeSelectFromValues, makeOptionGroup,
    renderModifierSummary, wizardActionRow, wizardNavButton
  } = AppCore;

  const WIZARD_STEPS = [
    'Disparo en Área (reacción contra el avión atacante)',
    'Intercepción final',
    'Datos base del ataque',
    'Interceptación de munición',
    'Modificación de intensidad y resultado'
  ];

  function freshWizardState() {
    return {
      step: 0,
      attackerLabel: '',
      targetLabel: '',
      stageAnswers: { munition_interception: {}, area_defense: {} },
      missionContext: { missionId: '', areaMission: '', source: 'manual' },
      areaAirDefenseRoll: '',
      attackerProtection: '',
      finalInterception: { aaLow: '', aaHigh: '', roll: '' },
      baseAttackValue: '',
      attackDistanceHexes: '',
      interceptionShips: [{ aa: '', roll: '', consumption: 'high' }],
      finalRoll: '',
      impactAssignment: {
        fleetShips: [{ id: '', protection: '', sinkingThreshold: '' }],
        rounds: [],
        pendingTargetRoll: '',
        pendingSinkingRoll: ''
      },
      lowAltitudeCounterattack: {
        aaTotal: '',
        attackers: [{ protection: '', roll: '' }]
      },
      turnResolutionId: null
    };
  }

  function getWizardStage(workflow, id) {
    return workflow.stages.find((st) => st.id === id);
  }

  let wizardState = null;

  // Usado por views/history.js al "↻ Repetir" una resolución guardada.
  function loadStateFromHistory(state) {
    wizardState = JSON.parse(JSON.stringify(state));
    wizardState.step = 4;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'antiship-unguided', type: 'antiship_unguided', getState: () => wizardState });
  const linkToTurnContextIfNeeded = (state, workflowTitle) => lifecycle.link(workflowTitle);
  const unlinkTurnContext = () => lifecycle.unlink();

  async function renderAntishipUnguidedWizard() {
    const navToken = Router.currentToken();
    wizardState = AppCore.resolveWizardState('antiship-unguided', wizardState, freshWizardState);
    linkToTurnContextIfNeeded(wizardState, 'Ataque antibuque no guiado');
    AppCore.persistWizardDraft('antiship-unguided', wizardState, () => wizardState);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Ataque antibuque no guiado']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let areaAirDefenseWorkflow;
    let page07;
    let page08;
    let page18;
    let page22;
    let page25;
    let airMissions;
    try {
      [workflow, areaAirDefenseWorkflow, page07, page08, page18, page22, page25, airMissions] = await Promise.all([
        loadWorkflow('08_ataque_antibuque_no_guiado.json'),
        loadWorkflow('06_defensa_aerea_area.json'),
        loadTablePage('page-07.json'),
        loadTablePage('page-08.json'),
        loadTablePage('page-18.json'),
        loadTablePage('page-22.json'),
        loadTablePage('page-25.json'),
        AppCore.loadAirMissions()
      ]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', `${workflow.title} — Ataque contra buques de superficie`));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${wizardState.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[wizardState.step]}`));

    const rerender = () => { renderAntishipUnguidedWizard(); };

    AppCore.mountWizardDraft('antiship-unguided', wrap, () => { unlinkTurnContext(wizardState); wizardState = freshWizardState(); rerender(); });
    const stepRenderers = [
      () => AppCore.renderWizardStepAreaAirDefense(wrap, areaAirDefenseWorkflow, page18, wizardState, rerender, () => { wizardState.step = 1; rerender(); }),
      () => renderStepFinalInterception(wrap, workflow, page07, rerender),
      () => renderStepIntro(wrap, rerender),
      () => renderStepMunitionInterception(wrap, workflow, page08, rerender),
      () => renderStepResult(wrap, workflow, page22, page25, rerender)
    ];
    if (wizardState.step === 0) {
      AppCore.renderMissionContext(wrap, wizardState, airMissions, rerender, () => {
        MissionContextEngine.invalidatedAnswerKeys().forEach((k) => { delete wizardState.stageAnswers.munition_interception[k]; });
      });
    }
    stepRenderers[wizardState.step]();

    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Intercepción Final ----------
  //
  // CombatWizardEngine.resolveFinalInterceptionShot ya existía (construida y
  // probada para Fase 8), pero SIN NINGÚN consumidor hasta este wizard.
  function renderStepFinalInterception(wrap, workflow, page07, rerender) {
    const s = wizardState;
    const stage = getWizardStage(workflow, 'final_interception');
    const table = TableEngine.findTableInPage(page07, 'ground-unguided-final-interception').table;
    const fi = s.finalInterception;

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));
    wrap.appendChild(el('p', 'turn-view__desc', 'Puede disparar la unidad atacante cuando tiene el icono de Intercepción Final. El defensor suma el Valor AA de todas sus unidades del mismo tipo de consumo (Bajo/Alto) y consulta la tabla una vez por cada tipo con unidades, sumando los impactos. Deja en blanco el consumo que no tenga unidades disparando.'));

    wrap.appendChild(makeNumberField(stage.questions[0].prompt, fi.aaLow, (v) => { fi.aaLow = v; }, rerender));
    wrap.appendChild(makeNumberField(stage.questions[1].prompt, fi.aaHigh, (v) => { fi.aaHigh = v; }, rerender));
    wrap.appendChild(makeSelectFromValues('Tirada (1d10)', table.rowAxis.values, fi.roll, (v) => { fi.roll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
      fi.roll = table.rowAxis.values[Math.floor(Math.random() * table.rowAxis.values.length)];
      rerender();
    }));

    if (fi.roll !== '') {
      const aaTotalLow = fi.aaLow !== '' ? Number(fi.aaLow) : undefined;
      const aaTotalHigh = fi.aaHigh !== '' ? Number(fi.aaHigh) : undefined;
      const shot = CombatWizardEngine.resolveFinalInterceptionShot(table, TableEngine, { roll: Number(fi.roll), aaTotalLow, aaTotalHigh });
      const box = el('div', 'wizard-modifier-summary');
      if (shot.shots.low) box.appendChild(el('span', 'source-refs', `Consumo Bajo (A.A.=${aaTotalLow}): ${shot.shots.low.rawCell === '.' ? 'sin impactos' : `${shot.shots.low.rawCell} impacto(s)`}`));
      if (shot.shots.high) box.appendChild(el('span', 'source-refs', `Consumo Alto (A.A.=${aaTotalHigh}): ${shot.shots.high.rawCell === '.' ? 'sin impactos' : `${shot.shots.high.rawCell} impacto(s)`}`));
      box.appendChild(el('span', 'wizard-modifier-summary__total', `Impactos de Intercepción Final: ${shot.totalImpacts}`));
      wrap.appendChild(box);
      wrap.appendChild(el('p', 'pending-note', 'Ninguna fuente disponible especifica qué le ocurre al bando atacante con estos impactos (no hay un ejemplo numérico completo ni una cita de consecuencia, a diferencia de "Disparo en Área" del ataque guiado): se muestran sin asumir una consecuencia sobre unidades o daño concreto (AGENTS.md §14).'));
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => { s.step = 2; rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Datos base del ataque ----------
  function renderStepIntro(wrap, rerender) {
    const s = wizardState;
    wrap.appendChild(el('h2', null, 'Datos base del ataque'));
    wrap.appendChild(el('p', 'pending-note', 'No hay ningún plan de ataque antibuque no guiado transcrito en data/ammunition/ (el ataque naval no guiado de este juego es Combate Naval Cercano con Artillería, cuyo Valor de Ataque se calcula sumando el valor de combate de las unidades participantes — un dato que este proyecto no modela todavía por unidad). El Valor de Ataque se introduce a mano, igual que el resto de datos de esta etapa.'));

    wrap.appendChild(makeTextField('Unidad/flota atacante (opcional)', s.attackerLabel, (v) => { s.attackerLabel = v; }));
    wrap.appendChild(makeTextField('Objetivo (opcional)', s.targetLabel, (v) => { s.targetLabel = v; }));
    wrap.appendChild(makeNumberField('Valor de Ataque base', s.baseAttackValue, (v) => { s.baseAttackValue = v; }, undefined, { visualRef: 'attack-base-value' }));
    wrap.appendChild(makeNumberField('Distancia de ataque (hexágonos)', s.attackDistanceHexes, (v) => { s.attackDistanceHexes = v; }, undefined, { visualRef: 'attack-distance' }));

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 1; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (s.baseAttackValue === '' || Number.isNaN(Number(s.baseAttackValue))) { alert('Introduce el Valor de Ataque base.'); return; }
        if (s.attackDistanceHexes === '' || Number.isNaN(Number(s.attackDistanceHexes))) { alert('Introduce la distancia de ataque en hexágonos.'); return; }
        s.step = 3;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Interceptación de Munición ----------
  //
  // Mismas funciones puras que antiship_guided (resolveInterceptionShot/
  // sumInterceptionReductions/sumModifiers), alimentadas con la tabla propia
  // de este workflow (munition-interception-unguided, page-08.json) —
  // segundo consumidor real, sin duplicar la mecánica (correcciones.02.md
  // COR02-010). `short_range_restriction` se deriva de la distancia ya
  // introducida, mismo diseño que COR02-004 para antiship_guided (solo se
  // pregunta el tipo de misión cuando la distancia es exactamente 2, el
  // único caso ambiguo). No hay pregunta de alerta temprana/Más Allá del
  // Horizonte en este workflow (a diferencia de 07): no se pregunta ni se
  // aplica ese tope.
  function renderStepMunitionInterception(wrap, workflow, page08, rerender) {
    const s = wizardState;
    const stage = getWizardStage(workflow, 'munition_interception');
    const table = TableEngine.findTableInPage(page08, 'munition-interception-unguided').table;
    const answers = s.stageAnswers.munition_interception;

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));

    AppCore.renderStageQuestions(wrap, stage, answers, {
      rerender,
      custom: {
        short_range_restriction: (q, target) => {
          const areaAnswer = s.missionContext.areaMission || answers.short_range_restriction_area_mission;
          const derived = CombatWizardEngine.deriveShortRangeRestriction(s.attackDistanceHexes, areaAnswer);
          target.appendChild(el('p', 'wizard-question__prompt', q.prompt));
          if (derived !== null) {
            answers.short_range_restriction = derived;
            const fromMission = s.missionContext.areaMission && Number(s.attackDistanceHexes) === 2 ? ` y de la misión elegida (${s.missionContext.areaMission === 'yes' ? 'Misión de Área' : 'Misión de Punto'})` : '';
            target.appendChild(el('p', 'source-refs', `Derivado de la distancia de ataque introducida en "Datos base" (${s.attackDistanceHexes} hex.)${fromMission}: ${derived === 'yes' ? 'Sí' : 'No'}.`));
          } else {
            delete answers.short_range_restriction;
            target.appendChild(el('p', 'source-refs', `Distancia de ataque: ${s.attackDistanceHexes} hex. — con esta distancia, la restricción depende de si es Misión de Área.`));
            target.appendChild(makeOptionGroup(
              { id: 'short_range_restriction_area_mission', prompt: '¿Es Misión de Área?', options: [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }] },
              answers.short_range_restriction_area_mission,
              (v) => { answers.short_range_restriction_area_mission = v; rerender(); }
            ));
          }
        }
      }
    });

    const modResult = CombatWizardEngine.sumModifiers(stage.questions, answers, 'munition_interception_roll');
    wrap.appendChild(renderModifierSummary('Modificador compartido de rendimiento/detección/munición (se suma a la tirada de cada disparo)', modResult));
    // Los cortes de flujo del workflow (flowCuts) los muestra el renderizador común.
    AppCore.renderStageRules(wrap, workflow, 'munition_interception', answers);
    CombatWizardEngine.collectRuleEffects(stage.questions, answers).filter((r) => !r.cutsStage).forEach((r) => {
      wrap.appendChild(el('p', 'pending-note', `Regla: ${r.ruleValue} (${r.prompt} → ${r.optionLabel})`));
    });

    wrap.appendChild(el('p', 'turn-view__desc', 'Cada unidad que intercepta dispara por separado: introduce su Valor de Defensa Aérea PROPIO y la tirada (1d10) que hace.'));
    AppCore.appendLowConsumptionRestrictions(wrap, stage);
    AppCore.renderInterceptionShotRows(wrap, s.interceptionShips, table.rowAxis.values, rerender);

    const shots = s.interceptionShips
      .filter((sh) => sh.aa !== '' && sh.roll !== '' && !Number.isNaN(Number(sh.aa)) && !Number.isNaN(Number(sh.roll)))
      .map((sh) => CombatWizardEngine.resolveInterceptionShot(table, TableEngine, { roll: Number(sh.roll), modifierTotal: modResult.total, defenderAaValue: Number(sh.aa), earlyWarning: false, consumption: sh.consumption }));
    const reduction = CombatWizardEngine.sumInterceptionReductions(shots);

    const shotsBox = el('div', 'wizard-modifier-summary');
    shots.forEach((shot, idx) => {
      shotsBox.appendChild(el('span', 'source-refs', shot.notEligible
        ? `Disparo ${idx + 1} (consumo Bajo): no puede interceptar — ${shot.reason}`
        : `Disparo ${idx + 1}${shot.consumption === 'low' ? ' (consumo Bajo)' : ''} (tirada modificada=${shot.modifiedRoll}): ${shot.result.rawCell === '.' ? 'sin reducción' : shot.result.displayValue}`));
    });
    shotsBox.appendChild(el('span', 'wizard-modifier-summary__total', `Reducción total de Interceptación de Munición: ${reduction}`));
    wrap.appendChild(shotsBox);

    const attackAfter = Number(s.baseAttackValue) + reduction;
    wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Valor de Ataque tras Interceptación de Munición: ${s.baseAttackValue} + (${reduction}) = ${attackAfter}`));

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 2; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        // Se guarda ya calculado (en vez de recalcularse en el paso de
        // Resultado) para no depender ahí de la tabla de este paso ni repetir
        // la lista de disparos: el paso de Resultado solo necesita el
        // resultado numérico.
        s.attackValueAfterInterception = attackAfter;
        s.step = 4;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 4: Modificación de Intensidad y Resultado ----------
  //
  // CombatModifierEngine.resolveAttackValueColumnShift (Fase 5, sin
  // consumidor hasta ahora) resuelve el desplazamiento de columna descrito
  // literalmente por el propio workflow ("los valores negativos desplazan
  // columnas a la izquierda y se omite la columna '.'"): se le pasa
  // valueCap=Infinity porque este workflow, a diferencia de
  // §5.12.10/§5.13.6 (los únicos con límite de Valor de Ataque citado), no
  // declara ningún tope — con el cap en infinito la función se comporta
  // exactamente como el desplazamiento simple que sí describe este workflow,
  // sin inventar un límite que la fuente no da.
  function renderStepResult(wrap, workflow, page22, page25, rerender) {
    const s = wizardState;
    const stage = getWizardStage(workflow, 'attack_intensity');
    const finalTable = TableEngine.findTableInPage(page25, 'antiship-unguided-damage-and-naval-artillery').table;
    const distanceQuestion = stage.questions.find((q) => q.id === 'distance');

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));

    const bucket = CombatWizardEngine.attackDistanceBucket(s.attackDistanceHexes, distanceQuestion.options);
    const bucketOption = distanceQuestion.options.find((o) => o.value === bucket);
    const distanceModifier = bucketOption ? bucketOption.effects.find((e) => e.target === 'attack_intensity').value : 0;
    wrap.appendChild(el('p', 'wizard-question__prompt', distanceQuestion.prompt));
    wrap.appendChild(el('p', 'source-refs', bucketOption
      ? `Derivado de la distancia de ataque introducida en "Datos base" (${s.attackDistanceHexes} hex.): ${bucketOption.label} → modificador ${distanceModifier}.`
      : `No se pudo derivar el bucket de distancia para "${s.attackDistanceHexes}" hex.`));

    wrap.appendChild(makeSelectFromValues('Tirada de resolución (1d10)', finalTable.rowAxis.values.map((v) => v.replace('*', '')), s.finalRoll, (v) => { s.finalRoll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
      s.finalRoll = String(Math.floor(Math.random() * 10));
      rerender();
    }));

    const finalRollIsNine = s.finalRoll !== '' && Number(s.finalRoll) === 9;
    // Reglas que dependen de la tirada (p.ej. un 9 cancela la intensidad): del workflow.
    AppCore.renderStageRules(wrap, workflow, 'attack_intensity', {}, { finalRoll: s.finalRoll });

    let resultText = null;
    let result = null;
    let columnResult = null;
    if (s.finalRoll !== '' && bucketOption) {
      const modifierTotal = finalRollIsNine ? 0 : distanceModifier;
      const attackAfterInterception = s.attackValueAfterInterception;
      columnResult = CombatModifierEngine.resolveAttackValueColumnShift(TableEngine, {
        rawAttackValue: attackAfterInterception,
        modifierTotal,
        valueCap: Infinity,
        columnLabels: finalTable.columnAxis.values
      });
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Valor de Ataque efectivo: ${attackAfterInterception}${modifierTotal !== 0 ? ` (modificador de intensidad ${modifierTotal}: desplaza ${Math.abs(modifierTotal)} columna(s) a la izquierda)` : ''} → columna "${columnResult.columnLabel}".`));

      try {
        result = TableEngine.resolveCell(finalTable, Number(s.finalRoll), columnResult.columnLabel);
      } catch (err) {
        wrap.appendChild(el('p', 'pending-note', `No se pudo resolver la tabla final: ${err.message}`));
      }

      if (result) {
        resultText = result.isMissingData ? 'sin dato transcrito: el cálculo se detiene aquí' : (result.legendText || `${result.displayValue} impacto(s)`);
        wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
        TableEngine.describeResolution(finalTable, result).forEach((line) => wrap.appendChild(el('p', 'source-refs', line)));
        wrap.appendChild(renderGrid(finalTable, finalTable.rowAxis.values, finalTable.columnAxis.values, result));

        const totalImpacts = Number(result.rawCell);
        if (!Number.isNaN(totalImpacts) && totalImpacts > 0) {
          renderImpactAssignmentSection(wrap, totalImpacts, rerender);
        }
        renderLowAltitudeCounterattackSection(wrap, page22, rerender);
      }
    }

    if (resultText !== null) {
      const fullSummaryText = [`${workflow.title} — Ataque contra buques de superficie`, `Valor de Ataque base: ${s.baseAttackValue}`, `Resultado: ${resultText}`].join('\n');
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
          workflowId: 'antiship_unguided',
          workflowTitle: `${workflow.title} — Ataque contra buques de superficie`,
          summaryText: fullSummaryText,
          state: s
        });
        unlinkTurnContext(s);
        saveBtn.textContent = '✓ Guardado';
        setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
      });
      shareRow.appendChild(saveBtn);
      wrap.appendChild(shareRow);
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 3; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => {
        unlinkTurnContext(s);
        wizardState = freshWizardState();
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Asignación de impactos y daño (Decision Book §5.6.5) ----------
  //
  // Mismo mecanismo que antiship_guided (assignImpactTarget/
  // applyImpactsToShip/checkSinking, reutilizados sin cambios — 1 daño por
  // impacto es el caso documentado en page-25.json; la variante de 2 daños
  // depende de un icono de Protección ilegible en la fuente, needsReview ya
  // señalado en esos datos), con su propio estado en vez de compartir el de
  // antiship-guided-wizard.js (ese archivo no expone su función de
  // renderizado — ver correcciones.02.md COR02-011, deuda pendiente).
  function computeImpactAssignmentSummary(state, totalImpacts) {
    const ia = state.impactAssignment;
    const rounds = ia.rounds;
    const sunkIds = new Set(rounds.filter((r) => r.sank).map((r) => r.targetId));
    // Un buque dañado por una ronda anterior (o marcado como ya dañado) que
    // recibe otro punto de daño queda eliminado directamente (§5.9).
    const damagedIds = new Set(rounds.filter((r) => r.damaged && !r.sank).map((r) => r.targetId));
    const validShips = ia.fleetShips
      .filter((sh) => sh.id !== '' && sh.protection !== '' && !Number.isNaN(Number(sh.protection)))
      .map((sh) => ({ id: sh.id, protection: Number(sh.protection), sinkingThreshold: sh.sinkingThreshold, damaged: sh.damaged === 'Sí' || damagedIds.has(sh.id) }));
    const survivors = validShips.filter((sh) => !sunkIds.has(sh.id));
    const impactsUsed = rounds.reduce((sum, r) => sum + r.absorbed, 0);
    const impactsRemaining = totalImpacts - impactsUsed;
    const lastRound = rounds[rounds.length - 1];
    const haltedByMissedTarget = !!lastRound && lastRound.damaged === false;
    const minSurvivorProtection = survivors.length ? Math.min(...survivors.map((sh) => sh.protection)) : null;
    const minSurvivorImpactsNeeded = minSurvivorProtection !== null ? Math.ceil(minSurvivorProtection / 1) : null;
    const complete = impactsRemaining <= 0
      || survivors.length === 0
      || haltedByMissedTarget
      || (minSurvivorImpactsNeeded !== null && impactsRemaining < minSurvivorImpactsNeeded);
    return { survivors, impactsRemaining, complete, haltedByMissedTarget, minSurvivorProtection };
  }

  function renderImpactAssignmentSection(wrap, totalImpacts, rerender) {
    const s = wizardState;
    const ia = s.impactAssignment;

    wrap.appendChild(el('h2', null, 'Asignación de impactos y daño'));
    AppWidgets.appendNoteWithTrace(wrap, 'source-refs', 'Página 25: Daño de Ataque No Guiado. Se aplica 1 daño por impacto (Valor de Protección «?»). Una segunda variante del icono de Protección causaría 2 daños por impacto, pero ese icono no se lee en la fuente: regla pendiente de validar.', 'Ver data/tables/page-25.json.');
    wrap.appendChild(el('p', 'turn-view__desc', 'Introduce la flota objetivo (Protección y, si la unidad queda dañada, su Valor de Hundimiento "≤N"). La unidad a la que impacta cada tirada se determina "0-9 de izquierda a derecha, reiniciando el conteo" (misma nota que antiship_guided, TWC Flotas Castellano.docx).'));

    ia.fleetShips.forEach((ship, idx) => {
      const row = el('div', 'table-viewer__controls');
      row.appendChild(makeTextField(`Buque ${idx + 1}: identificador`, ship.id, (v) => { ship.id = v; }));
      row.appendChild(makeNumberField(`Buque ${idx + 1}: Protección`, ship.protection, (v) => { ship.protection = v; }, rerender, { visualRef: 'ship-protection' }));
      row.appendChild(makeNumberField(`Buque ${idx + 1}: Valor de Hundimiento (≤N)`, ship.sinkingThreshold, (v) => { ship.sinkingThreshold = v; }, rerender, { visualRef: 'ship-sink-value' }));
      row.appendChild(makeSelectFromValues(`Buque ${idx + 1}: ¿ya estaba dañado antes del ataque?`, ['Sí'], ship.damaged || '', (v) => { ship.damaged = v; rerender(); }));
      if (ia.fleetShips.length > 1) {
        row.appendChild(wizardNavButton('✕ Quitar', 'secondary', () => { ia.fleetShips.splice(idx, 1); rerender(); }));
      }
      wrap.appendChild(row);
    });
    wrap.appendChild(wizardNavButton('+ Añadir otro buque a la flota', 'secondary', () => { ia.fleetShips.push({ id: '', protection: '', sinkingThreshold: '' }); rerender(); }));

    ia.rounds.forEach((r, idx) => {
      const box = el('div', 'wizard-modifier-summary');
      box.appendChild(el('span', 'wizard-modifier-summary__total', `Impacto ${idx + 1}: tirada ${r.targetRoll} → ${r.targetId} (posición ${r.targetIndex + 1})`));
      box.appendChild(el('span', 'source-refs', r.damaged
        ? `Dañada: absorbe ${r.absorbed} impacto(s) (Protección ${r.protection}). Impactos restantes: ${r.remainingAfter}.`
        : `Impactos disponibles (${r.remainingAfter}) insuficientes para su Protección (${r.protection}): no se daña.`));
      if (r.damaged && r.eliminatedDirectly) {
        box.appendChild(el('span', 'source-refs', 'Ya estaba dañado: al sufrir otro punto de daño es eliminado directamente, sin verificación por daño crítico (Decision Book §5.9).'));
      } else if (r.damaged) {
        box.appendChild(el('span', 'source-refs', `Tirada de hundimiento: ${r.sinkingRoll} ${r.sank ? `≤ ${r.sinkingThreshold} → se hunde y se retira de la flota.` : `> ${r.sinkingThreshold} → sobrevive dañada.`}`));
      }
      wrap.appendChild(box);
    });

    const summary = computeImpactAssignmentSummary(s, totalImpacts);

    if (!summary.complete) {
      const validShips = summary.survivors;
      const roundBox = el('div', 'table-viewer__controls');
      roundBox.appendChild(makeSelectFromValues('Tirada de asignación (1d10)', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], ia.pendingTargetRoll, (v) => { ia.pendingTargetRoll = v; rerender(); }));
      roundBox.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => { ia.pendingTargetRoll = String(Math.floor(Math.random() * 10)); rerender(); }));
      wrap.appendChild(roundBox);

      let preview = null;
      let hit = null;
      if (ia.pendingTargetRoll !== '') {
        const assignment = CombatWizardEngine.assignImpactTarget(Number(ia.pendingTargetRoll), validShips);
        if (assignment) {
          preview = assignment;
          hit = CombatWizardEngine.applyImpactsToShip(assignment.ship, summary.impactsRemaining, 1);
          wrap.appendChild(el('p', 'source-refs', `Impacta a ${assignment.ship.id} (posición ${assignment.index + 1} de ${validShips.length} supervivientes).`));
        }
      }

      if (hit && hit.damaged && preview.ship.damaged) {
        wrap.appendChild(el('p', 'pending-note', `${preview.ship.id} ya estaba dañado: al sufrir otro punto de daño es eliminado directamente, sin tirada de hundimiento (Decision Book §5.9).`));
      } else if (hit && hit.damaged) {
        wrap.appendChild(makeSelectFromValues('Tirada de hundimiento (1d10)', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], ia.pendingSinkingRoll, (v) => { ia.pendingSinkingRoll = v; rerender(); }));
      }

      const canConfirm = preview && hit && (!hit.damaged || preview.ship.damaged || ia.pendingSinkingRoll !== '');
      wrap.appendChild(wizardNavButton('Confirmar este impacto', 'primary', () => {
        if (!canConfirm) { alert('Elige la tirada de asignación (y, si la unidad queda dañada, la tirada de hundimiento).'); return; }
        const sinkingThreshold = preview.ship.sinkingThreshold !== '' ? Number(preview.ship.sinkingThreshold) : null;
        const fx = hit.damaged ? ShipImpactEffectsEngine.resolveFleetShipHit({ alreadyDamaged: !!preview.ship.damaged, sinkingThreshold: sinkingThreshold === null ? '' : sinkingThreshold, sinkingRoll: ia.pendingSinkingRoll }) : null;
        const sank = fx ? fx.removed : false;
        ia.rounds.push({
          targetRoll: ia.pendingTargetRoll,
          targetId: preview.ship.id,
          targetIndex: preview.index,
          protection: preview.ship.protection,
          damaged: hit.damaged,
          absorbed: hit.absorbed,
          remainingAfter: hit.remainingImpacts,
          sinkingRoll: hit.damaged && !preview.ship.damaged ? ia.pendingSinkingRoll : null,
          sinkingThreshold,
          eliminatedDirectly: !!(fx && fx.eliminatedDirectly),
          sank: !!sank
        });
        ia.pendingTargetRoll = '';
        ia.pendingSinkingRoll = '';
        rerender();
      }));
    } else if (ia.rounds.length === 0 && summary.survivors.length === 0) {
      wrap.appendChild(el('p', 'pending-note', 'Introduce al menos un buque con su Protección para empezar a asignar impactos.'));
    } else {
      const box = el('div', 'wizard-modifier-summary');
      if (summary.impactsRemaining > 0) {
        box.appendChild(el('span', 'wizard-modifier-summary__total', summary.haltedByMissedTarget
          ? 'Resolución terminada: el último impacto no dañó a su objetivo.'
          : `Impactos restantes: ${summary.impactsRemaining} — insuficientes para dañar a ninguna unidad superviviente${summary.minSurvivorProtection !== null ? ` (Protección mínima ${summary.minSurvivorProtection})` : ''}: se desprecian.`));
      } else {
        box.appendChild(el('span', 'wizard-modifier-summary__total', 'Todos los impactos han sido asignados.'));
      }
      wrap.appendChild(box);
    }
  }

  // ---------- Contraataque a Baja Altura (Decision Book §6.6-§6.6.2, página
  // 26 — correcciones03.md COR03-005) ----------
  //
  // Primer consumidor real de CombatWizardEngine.resolveLowAltitudeCounterattackShot
  // (probada desde el 2026-09-27, sin consumidor hasta ahora). Reacción
  // OPCIONAL de la flota superviviente, resuelta DESPUÉS de la asignación de
  // daño: las unidades de superficie supervivientes con Valor de Artillería
  // Naval pueden contraatacar conjuntamente, sumando sus valores como A.A.
  // total — un disparo (1d10) por cada unidad de vuelo bajo atacante. Este
  // proyecto no modela el Valor de Artillería Naval por unidad todavía
  // (mismo alcance que "Datos base del ataque" arriba, que ya pide el Valor
  // de Ataque a mano): se pide el A.A. total directamente, sin inventar un
  // registro de datos por buque que no existe (AGENTS.md §14).
  function renderLowAltitudeCounterattackSection(wrap, page22, rerender) {
    const table = TableEngine.findTableInPage(page22, 'surface-artillery-low-altitude-counterattack').table;
    AppCore.renderLowAltitudeCounterattackSection(wrap, wizardState.lowAltitudeCounterattack, table, rerender, {
      sourceLine: 'Página 26: Contraataque a Baja Altura.',
      description: 'Si la flota objetivo tiene unidades supervivientes con Valor de Artillería Naval, pueden contraatacar conjuntamente a las unidades de vuelo bajo atacantes: un disparo (1d10) por cada atacante, con el A.A. total de la flota superviviente como columna. No consume munición antiaérea.',
      pendingNote: 'Solo puede disparar a plataformas de baja altura; los buques con icono de daño/avería no pueden contraatacar. Comprueba tú esas dos condiciones: la aplicación todavía no las verifica.',
      pendingTrace: 'Reutiliza la tabla de data/tables/page-22.json (surface-artillery-low-altitude-counterattack); condiciones en data/tables/page-26.json.',
      aaPrompt: 'Valor de Artillería Naval total de la flota superviviente'
    });
  }

  root.Views = root.Views || {};
  root.Views.AntishipUnguidedWizard = { render: renderAntishipUnguidedWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
