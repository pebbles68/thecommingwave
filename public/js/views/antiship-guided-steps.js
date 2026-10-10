// Pasos de entrada del wizard de Ataque Guiado contra Superficie (datos base,
// defensas, V.E.F. y método de ataque; correcciones03.md COR03-006): solo
// renderizado DOM. Cada función recibe el estado `s` ya creado por el
// controlador (views/antiship-guided-wizard.js) — este módulo no es dueño de
// ningún estado. Los cálculos viven en public/js/antiship-guided-model.js
// (AntishipGuidedModel); el paso de Resultado, en antiship-guided-result.js.
(function (root) {
  'use strict';

  const {
    el, backRow, makeTextField, makeNumberField, makeSelectFromValues, makeOptionGroup,
    renderModifierSummary, wizardActionRow, wizardNavButton,
    appendFactorIdentificationHint, appendAmmoUnitCrop,
    AMMO_COUNTRIES, countryUnitsCache, loadCountryUnitsWithAntishipPlans
  } = AppCore;
  const {
    methodLabel, getWizardStage, computeInterceptionResult, computeStage1Reduction,
    computeAttackValueAfterDefenses, computeVefAndMultiplier
  } = AntishipGuidedModel;

  function renderWizardStepIntro(wrap, s, rerender, methodOptions) {
    const sel = s.unitSelection;
    wrap.appendChild(el('h2', null, 'Datos base del ataque'));

    // Modo validado (seleccionar unidad y plan) / modo manual (correcciones.md
    // COR-007, diseño punto 7: "si se mantiene entrada manual, denominarla
    // explícitamente 'modo manual' y no mezclarla con la selección validada").
    const modeRow = el('div', 'wizard-question__options');
    const validatedBtn = el('button', `btn btn--secondary wizard-option${sel.mode === 'validated' ? ' is-active' : ''}`, 'Seleccionar unidad y plan');
    validatedBtn.type = 'button';
    validatedBtn.addEventListener('click', () => { sel.mode = 'validated'; rerender(); });
    const manualBtn = el('button', `btn btn--secondary wizard-option${sel.mode === 'manual' ? ' is-active' : ''}`, 'Modo manual (introducir valores a mano)');
    manualBtn.type = 'button';
    manualBtn.addEventListener('click', () => { sel.mode = 'manual'; rerender(); });
    modeRow.appendChild(validatedBtn);
    modeRow.appendChild(manualBtn);
    wrap.appendChild(modeRow);

    if (sel.mode === 'manual') {
      AppWidgets.appendNoteWithTrace(wrap, 'pending-note', 'Modo manual: los valores no se comprueban contra ninguna unidad ni plan, así que puedes introducir una combinación que no exista en el juego. Usa «Seleccionar unidad y plan» para una entrada validada.', 'Incidencia COR-007 (correcciones.md); los planes validados proceden de data/ammunition/.');
      wrap.appendChild(makeTextField('Unidad atacante (opcional)', s.attackerLabel, (v) => { s.attackerLabel = v; }));
      wrap.appendChild(makeTextField('Objetivo (opcional)', s.targetLabel, (v) => { s.targetLabel = v; }));
      wrap.appendChild(makeNumberField('Valor de Ataque base de la munición', s.baseAttackValue, (v) => { s.baseAttackValue = v; }, undefined, { visualRef: 'attack-base-value' }));

      wrap.appendChild(wizardActionRow([
        wizardNavButton('← Anterior', 'secondary', () => { s.step = 0; rerender(); }),
        wizardNavButton('Siguiente →', 'primary', () => {
          if (s.baseAttackValue === '' || Number.isNaN(Number(s.baseAttackValue))) {
            alert('Introduce el Valor de Ataque base de la munición.');
            return;
          }
          sel.resolvedPlan = null;
          s.step = 2;
          rerender();
        })
      ]));
      wrap.appendChild(backRow());
      return;
    }

    wrap.appendChild(el('p', 'turn-view__desc', 'Selecciona la unidad atacante y uno de sus planes de ataque antibuque ya transcritos: el método, el Valor de Ataque y el alcance se derivan automáticamente — no se piden a mano.'));

    const countryField = el('label', 'table-viewer__field');
    countryField.appendChild(el('span', null, 'País'));
    const countrySelect = document.createElement('select');
    countrySelect.className = 'table-viewer__select';
    countrySelect.appendChild(el('option', null, '—')).value = '';
    AMMO_COUNTRIES.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      if (c.id === sel.country) opt.selected = true;
      countrySelect.appendChild(opt);
    });
    countrySelect.addEventListener('change', () => {
      sel.country = countrySelect.value;
      sel.unitId = '';
      sel.planLetter = '';
      sel.resolvedPlan = null;
      sel.loadType = '';
      sel.damaged = false;
      rerender();
    });
    countryField.appendChild(countrySelect);
    wrap.appendChild(countryField);

    if (sel.country) {
      const countryUnits = countryUnitsCache.get(sel.country);
      if (!countryUnits) {
        wrap.appendChild(el('p', 'loading', 'Cargando unidades…'));
        loadCountryUnitsWithAntishipPlans(sel.country).then(() => rerender());
      } else if (!countryUnits.length) {
        wrap.appendChild(el('p', 'pending-note', 'Este país no tiene ninguna unidad con un plan antibuque guiado ya transcrito.'));
      } else {
        const unitField = el('label', 'table-viewer__field');
        unitField.appendChild(el('span', null, 'Unidad atacante'));
        const unitSelect = document.createElement('select');
        unitSelect.className = 'table-viewer__select';
        unitSelect.appendChild(el('option', null, '—')).value = '';
        countryUnits.forEach((entry) => {
          const opt = document.createElement('option');
          opt.value = entry.unit.id;
          opt.textContent = `${entry.unit.name} (${entry.categoryTitle}${entry.groupLabel ? ` — ${entry.groupLabel}` : ''})`;
          if (entry.unit.id === sel.unitId) opt.selected = true;
          unitSelect.appendChild(opt);
        });
        unitSelect.addEventListener('change', () => {
          sel.unitId = unitSelect.value;
          sel.planLetter = '';
          sel.resolvedPlan = null;
          sel.loadType = '';
          sel.damaged = false;
          rerender();
        });
        unitField.appendChild(unitSelect);
        wrap.appendChild(unitField);

        const unitEntry = countryUnits.find((entry) => entry.unit.id === sel.unitId);
        if (unitEntry) {
          // COR02-005 (correcciones.02.md): los planes Balístico/Espacio
          // Cercano de esta unidad, si tiene, ya se excluyeron del selector
          // de abajo (core.js#loadCountryUnitsWithAntishipPlans) porque su
          // daño final depende de la marca de Escudo del buque objetivo, un
          // dato que este proyecto no tiene transcrito todavía — se avisa
          // aquí, antes de elegir plan, en vez de descubrirlo en el resultado.
          if (unitEntry.partialOptions.length) {
            const names = unitEntry.partialOptions.map((o) => `${o.letter} (${o.plan.munition}, ${methodLabel(methodOptions, o.method)})`).join(', ');
            wrap.appendChild(el('p', 'pending-note', `⚠ Esta unidad tiene ${unitEntry.partialOptions.length} plan(es) adicional(es) no disponible(s) para resolución todavía: ${names}. Su daño final depende de si el buque objetivo tiene la marca de Escudo (Decision Book §9.x), un dato sin transcribir para ninguna unidad. Puedes consultarlos en "Ayuda rápida > Planes de ataque y munición".`));
          }
          if (!unitEntry.options.length) {
            wrap.appendChild(el('p', 'pending-note', 'Ningún plan de esta unidad es resoluble todavía con los datos disponibles.'));
          }

          const planField = el('label', 'table-viewer__field');
          planField.appendChild(el('span', null, 'Plan de ataque'));
          const planSelect = document.createElement('select');
          planSelect.className = 'table-viewer__select';
          planSelect.appendChild(el('option', null, '—')).value = '';
          unitEntry.options.forEach((opt) => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.letter;
            optionEl.textContent = `${opt.letter} — ${opt.plan.munition} (${methodLabel(methodOptions, opt.method)})`;
            if (opt.letter === sel.planLetter) optionEl.selected = true;
            planSelect.appendChild(optionEl);
          });
          planSelect.addEventListener('change', () => {
            sel.planLetter = planSelect.value;
            const chosen = unitEntry.options.find((o) => o.letter === sel.planLetter);
            sel.resolvedPlan = chosen || null;
            sel.loadType = chosen && chosen.plan.loadFormat === 'dual' ? 'heavy' : '';
            sel.damaged = false;
            rerender();
          });
          planField.appendChild(planSelect);
          wrap.appendChild(planField);

          const chosen = unitEntry.options.find((o) => o.letter === sel.planLetter);
          if (chosen) {
            sel.resolvedPlan = chosen;
            const plan = chosen.plan;

            if (plan.loadFormat === 'dual') {
              wrap.appendChild(makeOptionGroup(
                { prompt: 'Carga', options: [{ value: 'heavy', label: 'Pesada' }, { value: 'light', label: 'Ligera' }] },
                sel.loadType,
                (v) => { sel.loadType = v; rerender(); }
              ));
            }

            if (plan.damaged) {
              wrap.appendChild(makeOptionGroup(
                { prompt: 'Estado de la unidad', options: [{ value: 'no', label: 'Completa' }, { value: 'yes', label: 'Dañada' }] },
                sel.damaged ? 'yes' : 'no',
                (v) => { sel.damaged = v === 'yes'; rerender(); }
              ));
            }

            const attackValue = CombatWizardEngine.derivePlanAttackValue(plan, { loadType: sel.loadType, damaged: sel.damaged });
            const range = CombatWizardEngine.derivePlanRange(plan, { damaged: sel.damaged });

            wrap.appendChild(makeNumberField('Distancia de ataque (hexágonos)', sel.attackDistanceHexes, (v) => { sel.attackDistanceHexes = v; }, rerender, { visualRef: 'attack-distance' }));

            const summaryBox = el('div', 'wizard-modifier-summary');
            summaryBox.appendChild(el('span', 'wizard-modifier-summary__total', attackValue === null
              ? 'Valor de Ataque: sin dato transcrito para esta combinación (AGENTS.md §14 — no se inventa; elige otra carga/estado).'
              : `Valor de Ataque derivado: ${attackValue} (método: ${chosen.method})`));
            if (range !== null) {
              const withinRange = sel.attackDistanceHexes !== '' && CombatWizardEngine.isDistanceWithinRange(sel.attackDistanceHexes, range);
              summaryBox.appendChild(el('span', 'source-refs', `Alcance del plan: ${range} hex. ${sel.attackDistanceHexes !== '' ? (withinRange ? '— dentro de alcance.' : `— FUERA de alcance (distancia introducida: ${sel.attackDistanceHexes} hex).`) : ''}`));
            }
            wrap.appendChild(summaryBox);

            appendAmmoUnitCrop(wrap, unitEntry.unit.id);
          }
        }
      }
    }

    wrap.appendChild(makeTextField('Objetivo (opcional)', s.targetLabel, (v) => { s.targetLabel = v; }));

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 0; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        const chosen = sel.resolvedPlan;
        if (!sel.country || !sel.unitId || !chosen) { alert('Selecciona país, unidad y plan de ataque.'); return; }
        if (chosen.plan.loadFormat === 'dual' && !sel.loadType) { alert('Elige la carga (pesada o ligera).'); return; }
        const attackValue = CombatWizardEngine.derivePlanAttackValue(chosen.plan, { loadType: sel.loadType, damaged: sel.damaged });
        if (attackValue === null) { alert('Este plan no tiene transcrito el valor de ataque para la combinación de carga/estado elegida. Elige otra.'); return; }
        const range = CombatWizardEngine.derivePlanRange(chosen.plan, { damaged: sel.damaged });
        if (sel.attackDistanceHexes === '' || Number.isNaN(Number(sel.attackDistanceHexes))) { alert('Introduce la distancia de ataque en hexágonos.'); return; }
        if (!CombatWizardEngine.isDistanceWithinRange(sel.attackDistanceHexes, range)) {
          alert(`La distancia introducida (${sel.attackDistanceHexes} hex) supera el alcance del plan (${range === null ? 'sin dato transcrito' : `${range} hex`}). No se puede continuar con esta combinación.`);
          return;
        }
        const countryLabel = (AMMO_COUNTRIES.find((c) => c.id === sel.country) || {}).label || sel.country;
        const unitEntry = (countryUnitsCache.get(sel.country) || []).find((e) => e.unit.id === sel.unitId);
        s.baseAttackValue = attackValue;
        s.attackerLabel = unitEntry ? `${unitEntry.unit.name} (${countryLabel}) — Plan ${chosen.letter}: ${chosen.plan.munition}` : s.attackerLabel;
        s.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  function renderWizardStepDefenses(wrap, s, workflow, page03, page04, rerender, methodOptions, cmBmMarkerIcons) {
    const stage1 = getWizardStage(workflow, 'area_air_defense');
    const stage2 = getWizardStage(workflow, 'munition_interception');
    const interceptionTable = TableEngine.findTableInPage(page04, 'munition-interception-standard').table;
    const areaAirDefenseAttackTable = TableEngine.findTableInPage(page03, 'ground-guided-area-air-defense').table;

    wrap.appendChild(el('h2', null, stage1.title));
    wrap.appendChild(el('p', 'source-refs', stage1.tableReference));
    AppWidgets.appendNoteWithTrace(wrap, 'pending-note', 'Esta etapa no es el «Disparo en Área» del paso anterior (ese es un disparo de la Flota contra el propio avión atacante, ya resuelto). Aquí se reduce el Valor de Ataque de la munición, y solo si el marcador es CM o BM (Decision Book §5.12 paso 2): responde primero esa pregunta.', 'Workflow independiente 06_defensa_aerea_area.json; ver docs/rules/known-ambiguities.md.');
    AppCore.renderStageQuestions(wrap, stage1, s.stageAnswers.area_air_defense, {
      rerender,
      renderQuestion: (q, target) => {
        // correcciones.02.md COR02-004 (alcance reducido tras COR02-005): en
        // modo validado, si el plan de ataque ya elegido lleva un marcador
        // CM/BM (icono o campo transcrito) o su método es Balístico, el dato
        // ya se conoce — no se vuelve a preguntar.
        if (q.id === 'munition_marked_cm_or_bm' && s.unitSelection.mode === 'validated' && s.unitSelection.resolvedPlan) {
          const marked = CombatWizardEngine.derivePlanCmOrBmMarker(s.unitSelection.resolvedPlan.plan, s.unitSelection.resolvedPlan.method, methodOptions, cmBmMarkerIcons);
          s.stageAnswers.area_air_defense.munition_marked_cm_or_bm = marked ? 'yes' : 'no';
          const label = marked ? 'Sí' : 'No';
          target.appendChild(el('p', 'wizard-question__prompt', q.prompt));
          target.appendChild(el('p', 'source-refs', `Derivado del plan de ataque elegido (Plan ${s.unitSelection.planLetter}, ${s.unitSelection.resolvedPlan.plan.munition}): ${label}.`));
          return true;
        }
        return false;
      }
    });
    wrap.appendChild(wizardNavButton('Ver tabla de Defensa Aérea de Área (pág. 19 → 3)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-03.json/ground-guided-area-air-defense';
    }));

    const stage1Info = computeStage1Reduction(workflow, s, areaAirDefenseAttackTable);
    if (!stage1Info.applies) {
      wrap.appendChild(el('p', 'turn-view__desc', 'La munición no está marcada CM/BM: esta etapa no se resuelve (reducción = 0). Decision Book §5.12 paso 2.'));
    } else {
      if (stage1Info.modResult) wrap.appendChild(renderModifierSummary('Modificador de la tirada de esta etapa', stage1Info.modResult));
      wrap.appendChild(makeNumberField('Tirada (1d10)', s.areaAirDefenseAttackRoll, (v) => { s.areaAirDefenseAttackRoll = v; }, rerender, { visualRef: 'dice-roll' }));
      if (s.stageAnswers.area_air_defense.near_space_trajectory === 'yes') {
        wrap.appendChild(el('p', 'turn-view__desc', 'Trayectoria de espacio cercano: se lanzan 2d10 y se toma el resultado MENOR (Decision Book §6.3.2).'));
        wrap.appendChild(makeNumberField('Segunda tirada (2d10, toma el menor)', s.areaAirDefenseAttackRoll2, (v) => { s.areaAirDefenseAttackRoll2 = v; }, rerender, { visualRef: 'dice-roll' }));
      }
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
    wrap.appendChild(wizardNavButton('Ver tabla de Interceptación de Munición (pág. 20 → 4)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-04.json/munition-interception-standard';
    }));
    AppCore.renderStageQuestions(wrap, stage2, s.stageAnswers.munition_interception, {
      rerender,
      renderQuestion: (q, target) => {
        // correcciones.02.md COR02-004 (alcance reducido tras COR02-005): en
        // modo validado la distancia de ataque ya se introdujo en "Datos
        // base" — solo hace falta preguntar el tipo de misión cuando la
        // distancia es EXACTAMENTE 2 (el único caso ambiguo: "1 hex., o 2 en
        // Misión de Área"); con distancia 1 o > 2 la respuesta ya se conoce.
        if (q.id === 'short_range_restriction' && s.unitSelection.mode === 'validated' && s.unitSelection.resolvedPlan) {
          const answers2 = s.stageAnswers.munition_interception;
          const areaAnswer = s.missionContext.areaMission || answers2.short_range_restriction_area_mission;
          const derived = CombatWizardEngine.deriveShortRangeRestriction(s.unitSelection.attackDistanceHexes, areaAnswer);
          target.appendChild(el('p', 'wizard-question__prompt', q.prompt));
          if (derived !== null) {
            answers2.short_range_restriction = derived;
            const fromMission = s.missionContext.areaMission && Number(s.unitSelection.attackDistanceHexes) === 2 ? ` y de la misión elegida (${s.missionContext.areaMission === 'yes' ? 'Misión de Área' : 'Misión de Punto'})` : '';
            target.appendChild(el('p', 'source-refs', `Derivado de la distancia de ataque introducida en "Datos base" (${s.unitSelection.attackDistanceHexes} hex.)${fromMission}: ${derived === 'yes' ? 'Sí' : 'No'}.`));
          } else {
            delete answers2.short_range_restriction;
            target.appendChild(el('p', 'source-refs', `Distancia de ataque: ${s.unitSelection.attackDistanceHexes} hex. — con esta distancia, la restricción depende de si es Misión de Área.`));
            target.appendChild(makeOptionGroup(
              { id: 'short_range_restriction_area_mission', prompt: '¿Es Misión de Área?', options: [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }] },
              answers2.short_range_restriction_area_mission,
              (v) => { answers2.short_range_restriction_area_mission = v; rerender(); }
            ));
          }
          return true;
        }
        if (q.id === 'short_range_restriction') {
          AppCore.renderShortRangeRestriction(target, q, s.stageAnswers.munition_interception, s.unitSelection, 'attackDistanceHexes', s.missionContext, rerender);
          return true;
        }
        return false;
      }
    });
    const interceptionResult = computeInterceptionResult(workflow, s, interceptionTable);
    wrap.appendChild(renderModifierSummary('Modificador compartido de rendimiento/detección (se suma a la tirada de cada disparo)', interceptionResult.modResult));
    // Los cortes de flujo del workflow (flowCuts) los muestra el renderizador común.
    AppCore.renderStageRules(wrap, workflow, 'munition_interception', s.stageAnswers.munition_interception);
    CombatWizardEngine.collectRuleEffects(stage2.questions, s.stageAnswers.munition_interception).filter((r) => !r.cutsStage).forEach((r) => {
      wrap.appendChild(el('p', 'pending-note', `Regla: ${r.ruleValue} (${r.prompt} → ${r.optionLabel})`));
    });

    wrap.appendChild(el('p', 'turn-view__desc', 'Cada unidad de superficie que intercepta dispara por separado: introduce su Valor de Defensa Aérea PROPIO y la tirada (1d10) que hace. La fila de la tabla es la tirada ya modificada por el modificador compartido de arriba; la columna es el A.A. propio de esa unidad (confirmado contra el golden test: BS-20381 A.A.=2 y BS-1164 A.A.=4, misma tirada modificada, dan -1 y -2 respectivamente).'));
    appendFactorIdentificationHint(wrap, 'ship-combat', 'aa');
    AppCore.appendLowConsumptionRestrictions(wrap, stage2);
    AppCore.renderInterceptionShotRows(wrap, s.interceptionShips, interceptionTable.rowAxis.values, rerender);

    const shotsBox = el('div', 'wizard-modifier-summary');
    interceptionResult.shots.forEach((s2, idx) => {
      if (s2.shot && s2.shot.notEligible) {
        shotsBox.appendChild(el('span', 'source-refs', `Disparo ${idx + 1} (A.A.=${s2.input.aa}, consumo Bajo): no puede interceptar — ${s2.shot.reason}`));
      } else if (s2.shot) {
        const capNote = s2.shot.horizonCap.capped
          ? ` — tope "Más Allá del Horizonte" aplicado: sin alerta temprana, A.A.=${s2.shot.horizonCap.originalValue} se resuelve como si fuera ${s2.shot.horizonCap.effectiveValue} (Decision Book §6.5.2)`
          : '';
        shotsBox.appendChild(el('span', 'source-refs', `Disparo ${idx + 1} (A.A.=${s2.input.aa}${s2.shot.consumption === 'low' ? ', consumo Bajo' : ''}, tirada modificada=${s2.shot.modifiedRoll}): ${s2.shot.result.isMissingData ? 'sin dato' : s2.shot.result.displayValue}${capNote}`));
      } else if (s2.error) {
        shotsBox.appendChild(el('span', 'source-refs', `Disparo ${idx + 1}: ${s2.error.message}`));
      }
    });
    shotsBox.appendChild(el('span', 'wizard-modifier-summary__total', `Reducción total de Interceptación de Munición: ${interceptionResult.reduction}`));
    wrap.appendChild(shotsBox);

    const attackAfter = computeAttackValueAfterDefenses(workflow, s, interceptionTable, areaAirDefenseAttackTable);
    const stage1Pending = attackAfter.stage1Info.applies && attackAfter.stage1Info.value === null;
    const totalIsValid = !Number.isNaN(attackAfter.total) && !stage1Pending;
    if (totalIsValid) {
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Valor de Ataque tras Defensa Aérea de Área e Interceptación de Munición: ${s.baseAttackValue} + (${attackAfter.stage1Reduction}) + (${attackAfter.interceptionReduction}) = ${attackAfter.total}`));
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 1; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!totalIsValid) {
          alert('Introduce el Valor de Ataque base (paso anterior) y, si la munición es CM/BM, la tirada y el Valor de Defensa Aérea de la etapa de Defensa Aérea de Área.');
          return;
        }
        s.step = 3;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  function renderWizardStepFleet(wrap, s, workflow, page21, rerender) {
    const stage3 = getWizardStage(workflow, 'fleet_electronic_resistance');
    const answers = s.stageAnswers.fleet_electronic_resistance;
    const vefTable = TableEngine.findTableInPage(page21, 'antiship-guided-vef-modifier').table;
    const multTable = TableEngine.findTableInPage(page21, 'antiship-guided-attack-multiplier').table;

    wrap.appendChild(el('h2', null, stage3.title));
    wrap.appendChild(el('p', 'source-refs', stage3.tableReference));
    wrap.appendChild(el('p', 'turn-view__desc', stage3.formula));
    wrap.appendChild(wizardNavButton('Ver tabla de Mod. V.E.F. / Multiplicador (pág. 21)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-21.json/antiship-guided-vef-modifier';
    }));

    AppCore.renderStageQuestions(wrap, stage3, answers, {
      rerender,
      afterQuestion: (q, target) => {
        if (q.id === 'highest_fleet_electronic') appendFactorIdentificationHint(target, 'ship-combat', 'electronic');
      },
      renderQuestion: (q, target) => {
        // correcciones.md COR-007: en modo validado, la distancia de ataque ya
        // se introdujo en "Datos base" (paso anterior) — se deriva el bucket
        // en vez de volver a preguntarlo, para no poder contradecir la
        // distancia ya validada contra el alcance del plan.
        if (q.id === 'attack_distance' && s.unitSelection.mode === 'validated' && s.unitSelection.resolvedPlan) {
          const bucket = CombatWizardEngine.attackDistanceBucket(s.unitSelection.attackDistanceHexes, q.options);
          answers.attack_distance = bucket;
          const label = ((q.options || []).find((o) => o.value === bucket) || {}).label || 'sin definir';
          target.appendChild(el('p', 'wizard-question__prompt', q.prompt));
          target.appendChild(el('p', 'source-refs', `Derivado de la distancia de ataque introducida en "Datos base" (${s.unitSelection.attackDistanceHexes} hex.): ${label}.`));
          return true;
        }
        return false;
      }
    });

    const vef = computeVefAndMultiplier(workflow, s, vefTable, multTable);
    wrap.appendChild(renderModifierSummary('Modificador V.E.F. (a sumar al Valor Electrónico más alto)', vef.modResult));

    if (vef.rawVef !== null) {
      const box = el('div', 'wizard-modifier-summary');
      box.appendChild(el('span', 'wizard-modifier-summary__total', `V.E.F. bruto = ${vef.highest} + (${vef.modResult.total >= 0 ? '+' : ''}${vef.modResult.total}) = ${vef.rawVef}`));
      box.appendChild(el('span', 'source-refs', `Mod. V.E.F. (fila «${vef.vefRollResult.modResult.rowLabel}»): ${vef.vefRollResult.modResult.rawCell} → modificador a la tirada de esta etapa: ${vef.vefRollResult.rollModifier >= 0 ? '+' : ''}${vef.vefRollResult.rollModifier}`));
      wrap.appendChild(box);
    }

    wrap.appendChild(el('p', 'turn-view__desc', 'Esta etapa exige además una tirada propia — siempre 1d10, con independencia del método de ataque (confirmado en el golden test) — que se modifica con el resultado de arriba y se cruza con la tabla de multiplicador.'));
    wrap.appendChild(makeSelectFromValues('Tirada V.E.F. (1d10)', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], s.vefRoll, (v) => { s.vefRoll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => { s.vefRoll = String(Math.floor(Math.random() * 10)); rerender(); }));

    if (vef.modifiedRoll !== null) {
      const box = el('div', 'wizard-modifier-summary');
      box.appendChild(el('span', 'source-refs', `Tirada modificada: ${s.vefRoll} + (${vef.vefRollResult.rollModifier >= 0 ? '+' : ''}${vef.vefRollResult.rollModifier}) = ${vef.modifiedRoll}`));
      if (vef.multiplierResult) {
        box.appendChild(el('span', 'wizard-modifier-summary__total', `Multiplicador de ataque (fila «${vef.multiplierResult.multiplierResult.rowLabel}»): ${vef.multiplierResult.multiplierResult.rawCell}`));
      } else if (vef.multiplierError) {
        box.appendChild(el('span', 'source-refs', `No se pudo resolver el multiplicador: ${vef.multiplierError.message}`));
      }
      wrap.appendChild(box);
    }

    const canAdvance = vef.multiplierResult && vef.multiplierResult.multiplier !== null;
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 2; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!canAdvance) { alert('Completa el Valor Electrónico más alto de la flota, las preguntas de esta etapa y la tirada V.E.F.'); return; }
        s.step = 4;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  function renderWizardStepMethod(wrap, s, workflow, page22, rerender, methodOptions, diceFormulas) {
    const stage4 = workflow.stages.find((st) => st.id === 'attack_method');
    const answers = s.stageAnswers.attack_method;
    const finalTable = TableEngine.findTableInPage(page22, 'antiship-guided-final-damage').table;

    wrap.appendChild(el('h2', null, stage4.title));
    wrap.appendChild(el('p', 'source-refs', stage4.tableReference));
    wrap.appendChild(wizardNavButton('Ver tabla final de Ataque Guiado (pág. 22)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-22.json/antiship-guided-final-damage';
    }));
    AppCore.renderStageQuestions(wrap, stage4, answers, {
      rerender,
      onAnswer: (q) => { s.rollInputs = ['']; },
      renderQuestion: (q, target) => {
        // correcciones.md COR-007: en modo validado, el método ya se deriva del
        // icono de munición del plan elegido en "Datos base" — no se vuelve a
        // preguntar (evita poder elegir un método que no corresponde al plan).
        if (q.id === 'method' && s.unitSelection.mode === 'validated' && s.unitSelection.resolvedPlan) {
          answers.method = s.unitSelection.resolvedPlan.method;
          const label = ((q.options || []).find((o) => o.value === answers.method) || {}).label || answers.method;
          target.appendChild(el('p', 'wizard-question__prompt', q.prompt));
          target.appendChild(el('p', 'source-refs', `Derivado del plan de ataque elegido (Plan ${s.unitSelection.planLetter}, ${s.unitSelection.resolvedPlan.plan.munition}): ${label}.`));
          return true;
        }
        return false;
      }
    });

    const diceInfo = CombatWizardEngine.findFirstEffect(stage4.questions, answers, 'dice', 'attack_resolution');
    let formula = null;
    if (diceInfo) {
      formula = CombatWizardEngine.describeDiceFormula(diceFormulas, diceInfo.effect.value);
      wrap.appendChild(el('p', 'turn-view__desc', `Tirada: ${formula.label} (según el método elegido).`));

      const rowScheme = CombatWizardEngine.finalTableRowScheme(answers.method, methodOptions);
      const rowValues = TableEngine.pickAxisLabels(finalTable.rowAxis, rowScheme);
      wrap.appendChild(el('p', 'source-refs', `Fila de la tabla final según el método elegido: «${rowScheme}».`));

      if (s.rollInputs.length < formula.rollCount) s.rollInputs = new Array(formula.rollCount).fill('');

      for (let i = 0; i < formula.rollCount; i++) {
        const idx = i;
        wrap.appendChild(makeSelectFromValues(`Tirada ${idx + 1} (elige de la fila de la tabla final)`, rowValues, s.rollInputs[idx], (v) => { s.rollInputs[idx] = v; rerender(); }));
      }

      wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
        for (let i = 0; i < formula.rollCount; i++) s.rollInputs[i] = rowValues[Math.floor(Math.random() * rowValues.length)];
        rerender();
      }));

      if (s.rollInputs.slice(0, formula.rollCount).every((v) => v !== '' && v !== undefined)) {
        const finalRoll = CombatWizardEngine.resolveRoll(formula, s.rollInputs.slice(0, formula.rollCount));
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Tirada final: ${finalRoll}`));
      }
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 3; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!formula || s.rollInputs.slice(0, formula.rollCount).some((v) => v === '' || v === undefined)) {
          alert('Elige el método de ataque y completa la tirada.');
          return;
        }
        s.step = 5;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.AntishipGuidedSteps = {
    renderWizardStepIntro,
    renderWizardStepDefenses,
    renderWizardStepFleet,
    renderWizardStepMethod
  };
})(typeof window !== 'undefined' ? window : globalThis);
