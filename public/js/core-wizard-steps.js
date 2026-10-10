// Pasos de wizard reutilizables entre varios wizards de ataque (correcciones03.md
// COR03-006, dividido desde public/js/core.js). Hoy: "Disparo en Área"
// (Defensa Antiaérea de Área), compartido por los wizards de ataque guiado y
// no guiado a superficie. Cada paso recibe el estado del wizard por parámetro
// en vez de asumir uno concreto. Expuesto como `AppWizardSteps`.
(function (root) {
  'use strict';

  const { el, backRow, makeNumberField, makeSelectFromValues, makeOptionGroup, wizardActionRow, wizardNavButton } = AppWidgets;
  const { appendFactorIdentificationHint } = AppVisuals;

  // ---------- Paso reutilizable "Disparo en Área" (Defensa Antiaérea de
  // Área, data/workflows/06_defensa_aerea_area.json, data/tables/page-18.json)
  // ----------
  //
  // Promovido desde views/antiship-guided-wizard.js (decisión del mantenedor,
  // 2026-09-25: "Disparo en Área" se generaliza más allá del ataque guiado a
  // superficie — ver docs/rules/known-ambiguities.md) a public/js/core.js
  // (correcciones03.md COR03-005, 2026-09-28: antiship-unguided-wizard.js
  // necesitaba reutilizarlo, tal como el comentario original ya anticipaba:
  // "si un futuro wizard fuera de este archivo necesita reutilizarla, es el
  // momento de promoverla"). Decision Book §6.3: la defensa antiaérea de área
  // es una reacción de CUALQUIER unidad antiaérea contra CUALQUIER unidad
  // aérea/de vuelo bajo/misil de crucero/ataque balístico expuesto dentro de
  // su alcance — no está restringida a munición CM/BM ni a ataques guiados
  // (esa restricción es de la etapa homónima del workflow 07/`area_air_defense`,
  // que reduce el Valor de Ataque de la munición — mecánica distinta, ver
  // docs/rules/known-ambiguities.md). Recibe `state`/`onNext` como parámetros
  // en vez de asumir un wizard concreto: cualquier wizard de ataque aéreo
  // puede incluirlo sin duplicarlo, siempre que su propio estado incluya
  // `areaAirDefenseRoll`, `attackerProtection` y `stageAnswers.area_defense`.
  function computeAreaAirDefenseShot(state, areaAirDefenseTable) {
    const answers = state.stageAnswers.area_defense;
    if (answers.aa_value === undefined || answers.aa_value === '' || Number.isNaN(Number(answers.aa_value))) return null;
    if (state.areaAirDefenseRoll === '' || Number.isNaN(Number(state.areaAirDefenseRoll))) return null;
    try {
      const result = CombatWizardEngine.resolveAreaAirDefenseShot(areaAirDefenseTable, TableEngine, {
        roll: Number(state.areaAirDefenseRoll),
        aaValue: Number(answers.aa_value),
        consumption: answers.ammo_consumption
      });
      return { result };
    } catch (err) {
      return { error: err };
    }
  }

  // Prioridad de absorción del avión EW (Decision Book §7.10.4, pp. 135-136):
  // los puntos de daño de la tabla son los puntos de impacto que absorbe el
  // grupo. Lógica en public/js/ew-escort-engine.js; el texto, en el workflow 06.
  function appendEwEscortOutcome(box, wrap, stage, s, impacts, rerender) {
    const rule = stage.ewEscortAbsorption;
    if (s.ewProtection === undefined || s.ewProtection === '' || Number.isNaN(Number(s.ewProtection))) {
      box.appendChild(el('span', 'source-refs', 'Indica la Protección del avión de guerra electrónica para aplicar su prioridad de absorción (§7.10.4).'));
      return;
    }
    const other = s.attackerProtection !== '' && !Number.isNaN(Number(s.attackerProtection)) ? Number(s.attackerProtection) : '';
    let r;
    try {
      r = EwEscortEngine.resolveEwEscortAbsorption({ impacts, ewProtection: Number(s.ewProtection), otherProtection: other });
    } catch (err) {
      box.appendChild(el('span', 'pending-note', `No se pudo resolver: ${err.message}`));
      return;
    }
    if (r.noEffect) {
      box.appendChild(el('span', 'source-refs', `${rule.noEffect} Aquí: ${impacts} < ${r.ewProtection} (§7.10.4).`));
      return;
    }
    box.appendChild(el('span', 'source-refs', `${impacts} ≥ Protección del avión EW (${r.ewProtection}): el avión EW absorbe primero ${r.ewAbsorbed} punto(s) y sufre ${r.ewDamage} punto de daño; quedan ${r.remaining} punto(s) de impacto para las demás unidades del grupo.`));
    if (r.others) {
      box.appendChild(el('span', 'source-refs', r.others.damage > 0
        ? `La siguiente unidad (Protección ${r.others.protection}) absorbe ${r.others.absorbed} y sufre ${r.others.damage} punto de daño${r.others.left ? `; quedan ${r.others.left} punto(s): si alguna otra unidad aérea del grupo tiene Protección menor o igual, debe seguir absorbiendo (no modelado para más de una unidad)` : ''}.`
        : `${r.remaining} < Protección de la siguiente unidad (${r.others.protection}): no sufre daño.`));
    }
    wrap.appendChild(el('p', 'source-refs', rule.sequence));
    wrap.appendChild(el('p', 'pending-note', rule.readingNote));
  }

  function renderWizardStepAreaAirDefense(wrap, workflow06, page18, state, rerender, onNext) {
    const s = state;
    const stage = workflow06.stages.find((st) => st.id === 'area_defense');
    const answers = s.stageAnswers.area_defense;
    const table = TableEngine.findTableInPage(page18, 'area-air-defense-concentrated-damage').table;

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));
    AppWidgets.appendNoteWithTrace(wrap, 'pending-note', 'Es la reacción de la Flota contra el propio avión atacante: el verdadero «Disparo en Área» de la hoja de ayuda. No es la reducción del Valor de Ataque de la munición CM/BM, que es un paso distinto de más adelante.', 'Workflow 06_defensa_aerea_area.json, confirmado por el golden test del ataque guiado a superficie; no confundir con la etapa area_air_defense de los workflows de ataque guiado. Ver docs/rules/known-ambiguities.md.');

    AppStageQuestions.renderStageQuestions(wrap, stage, answers, { rerender });

    CombatWizardEngine.collectRuleEffects(stage.questions, answers).forEach((r) => {
      wrap.appendChild(el('p', 'pending-note', `Regla: ${r.ruleValue}${r.haltsWorkflow ? ' (detiene el disparo de esta unidad)' : ''} (${r.prompt} → ${r.optionLabel})`));
    });

    wrap.appendChild(el('p', 'turn-view__desc', 'Tirada: siempre 1d10, sin modificador declarado en la fuente (confirmado en el golden test).'));
    wrap.appendChild(makeSelectFromValues('Tirada (1d10)', table.rowAxis.values, s.areaAirDefenseRoll, (v) => { s.areaAirDefenseRoll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
      s.areaAirDefenseRoll = table.rowAxis.values[Math.floor(Math.random() * table.rowAxis.values.length)];
      rerender();
    }));

    // Interceptación de Alta Velocidad (Decision Book §6.9.2, correcciones03.md
    // COR03-005): primer consumidor real de checkHighSpeedInterceptionFailure
    // (probada desde antes, sin ningún consumidor). Solo se comprueba cuando
    // el objetivo es un ataque balístico — para el resto de objetivos esta
    // regla no aplica. La tirada de esta etapa no lleva ningún modificador
    // declarado (nota de arriba), así que la tirada introducida ES la tirada
    // "antes de aplicar modificadores" que pide la regla.
    if (answers.ballistic_missile_interception === 'yes' && s.areaAirDefenseRoll !== '' && CombatWizardEngine.checkHighSpeedInterceptionFailure(Number(s.areaAirDefenseRoll))) {
      wrap.appendChild(el('p', 'pending-note', 'Interceptación de Alta Velocidad (Decision Book §6.9.2): la tirada natural es 0 → la interceptación falla automáticamente, sea cual sea el resultado de la tabla.'));
    }

    const ewOn = answers.ew_escort === 'yes';
    wrap.appendChild(makeNumberField(ewOn ? 'Protección de la otra unidad del grupo atacante, sin contar el avión EW (para interpretar el resultado)' : 'Protección del avión atacante (para interpretar el resultado)', s.attackerProtection, (v) => { s.attackerProtection = v; }, rerender));
    appendFactorIdentificationHint(wrap, 'aircraft-combat-tactical', 'protection');
    if (ewOn) {
      wrap.appendChild(el('p', 'turn-view__desc', stage.ewEscortAbsorption.rule));
      wrap.appendChild(el('p', 'source-refs', stage.ewEscortAbsorption.escortNotCounted));
      wrap.appendChild(makeNumberField('Protección del avión de guerra electrónica con escolta', s.ewProtection === undefined ? '' : s.ewProtection, (v) => { s.ewProtection = v; }, rerender, { visualRef: 'ew-escort-protection' }));
    }

    const shot = computeAreaAirDefenseShot(s, table);
    if (shot && shot.error) {
      wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${shot.error.message}`));
    } else if (shot && shot.result) {
      const box = el('div', 'wizard-modifier-summary');
      const resultText = shot.result.isMissingData ? 'sin dato transcrito: el cálculo se detiene aquí' : (shot.result.legendText || shot.result.displayValue);
      box.appendChild(el('span', 'wizard-modifier-summary__total', `Puntos de daño: ${resultText}`));
      const damage = Number(shot.result.rawCell);
      if (ewOn && !Number.isNaN(damage)) {
        appendEwEscortOutcome(box, wrap, stage, s, damage, rerender);
      } else if (!Number.isNaN(damage) && s.attackerProtection !== '' && !Number.isNaN(Number(s.attackerProtection))) {
        const protection = Number(s.attackerProtection);
        box.appendChild(el('span', 'source-refs', damage < protection
          ? `${damage} < Protección (${protection}): el avión no sufre daño.`
          : `${damage} ≥ Protección (${protection}): el avión sufre daño (asignación de daño no modelada todavía).`));
      }
      wrap.appendChild(box);
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', onNext)
    ]));
    wrap.appendChild(backRow());
  }


  // Filas de disparos de Interceptación de Munición compartidas por los
  // wizards antibuque guiado y no guiado (Decision Book §6.5.4): cada unidad
  // antiaérea dispara por separado con su Valor de Defensa Aérea PROPIO, su
  // tirada (1d10) y su consumo (Alto/Bajo, §6.5.1; con consumo Bajo la
  // columna es el grupo 2~3/4~5/6~7/8+ y un A.A. de 1 no puede interceptar —
  // Tablas-de-combate 5.pdf p.4/p.8). `ship.consumption` ausente (estados
  // guardados antes de este campo) equivale a 'high'. `rowValues` son las
  // tiradas válidas de la tabla; `onBeforeRows` permite al llamador insertar
  // algo (p.ej. la pista visual del factor A.A.) antes de las filas.
  const INTERCEPTION_CONSUMPTION_OPTIONS = [{ value: 'high', label: 'Alto' }, { value: 'low', label: 'Bajo' }];

  function renderInterceptionShotRows(wrap, shots, rowValues, rerender) {
    shots.forEach((ship, idx) => {
      const row = el('div', 'table-viewer__controls');
      row.appendChild(makeNumberField(`Disparo ${idx + 1}: Valor de Defensa Aérea propio`, ship.aa, (v) => { ship.aa = v; }, rerender, { visualRef: 'ship-aa-own' }));
      row.appendChild(makeSelectFromValues(`Disparo ${idx + 1}: Tirada (1d10)`, rowValues, ship.roll, (v) => { ship.roll = v; rerender(); }));
      const consumptionField = el('label', 'table-viewer__field');
      consumptionField.appendChild(el('span', null, `Disparo ${idx + 1}: Consumo`));
      const select = document.createElement('select');
      select.className = 'table-viewer__select';
      INTERCEPTION_CONSUMPTION_OPTIONS.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if ((ship.consumption || 'high') === o.value) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', () => { ship.consumption = select.value; rerender(); });
      consumptionField.appendChild(select);
      row.appendChild(consumptionField);
      if (shots.length > 1) {
        row.appendChild(wizardNavButton('✕ Quitar', 'secondary', () => { shots.splice(idx, 1); rerender(); }));
      }
      wrap.appendChild(row);
    });
    wrap.appendChild(wizardNavButton('+ Añadir otro disparo de interceptación', 'secondary', () => { shots.push({ aa: '', roll: '', consumption: 'high' }); rerender(); }));
  }

  // Casos en los que la regla fuerza consumo Bajo (`stage.lowConsumptionOnlyCases`
  // en el workflow, con su cita): solo informativo — la app no sabe qué plan
  // concreto defiende cada disparo, así que no restringe el selector.
  function appendLowConsumptionRestrictions(wrap, stage) {
    const cases = stage.lowConsumptionOnlyCases;
    if (!cases || !cases.length) return;
    const box = el('div', 'pending-note');
    box.appendChild(el('p', null, 'Solo pueden usar consumo Bajo (elígelo en el disparo correspondiente) cuando el ataque interceptado es:'));
    cases.forEach((c) => box.appendChild(el('p', 'source-refs', `• ${c.label} — ${c.sourceRefs.map((r) => `${r.section}`).join(', ')}`)));
    wrap.appendChild(box);
  }


  // Contraataque a Baja Altura (Decision Book §6.6-§6.6.2), reacción OPCIONAL
  // de la unidad atacada tras la resolución del ataque contra los
  // atacantes de vuelo bajo que hicieron un Asalto a Corta Distancia: un
  // disparo (1d10) por atacante, con el A.A. total del defensor como columna.
  // Compartido por los wizards antibuque no guiado (page-22.json) y
  // antirradiación (page-14.json): cada uno aporta su tabla y sus textos
  // (`opts`: heading, sourceLine, description, pendingNote, aaPrompt); el
  // estado `lac = { aaTotal, attackers: [{ protection, roll }] }` lo posee el
  // wizard llamador. Usa CombatWizardEngine.resolveLowAltitudeCounterattackShot.
  function renderLowAltitudeCounterattackSection(wrap, lac, table, rerender, opts) {
    wrap.appendChild(el('h2', null, opts.heading || 'Contraataque a Baja Altura (opcional)'));
    wrap.appendChild(el('p', 'source-refs', opts.sourceLine));
    wrap.appendChild(el('p', 'turn-view__desc', opts.description));
    if (opts.pendingNote) AppWidgets.appendNoteWithTrace(wrap, 'pending-note', opts.pendingNote, opts.pendingTrace);

    wrap.appendChild(makeNumberField(opts.aaPrompt, lac.aaTotal, (v) => { lac.aaTotal = v; }, rerender));

    lac.attackers.forEach((atk, idx) => {
      const row = el('div', 'table-viewer__controls');
      row.appendChild(makeNumberField(`Atacante ${idx + 1}: Valor de Protección`, atk.protection, (v) => { atk.protection = v; }, rerender, { visualRef: 'low-altitude-attacker-protection' }));
      row.appendChild(makeSelectFromValues(`Atacante ${idx + 1}: Tirada (1d10)`, table.rowAxis.values, atk.roll, (v) => { atk.roll = v; rerender(); }));
      if (lac.attackers.length > 1) {
        row.appendChild(wizardNavButton('✕ Quitar', 'secondary', () => { lac.attackers.splice(idx, 1); rerender(); }));
      }
      wrap.appendChild(row);
    });
    wrap.appendChild(wizardNavButton('+ Añadir otra unidad de vuelo bajo atacante', 'secondary', () => { lac.attackers.push({ protection: '', roll: '' }); rerender(); }));

    if (lac.aaTotal !== '' && !Number.isNaN(Number(lac.aaTotal))) {
      const shotsBox = el('div', 'wizard-modifier-summary');
      lac.attackers.forEach((atk, idx) => {
        if (atk.protection === '' || atk.roll === '' || Number.isNaN(Number(atk.protection))) return;
        const shot = CombatWizardEngine.resolveLowAltitudeCounterattackShot(table, TableEngine, {
          roll: Number(atk.roll),
          defenderAaTotal: Number(lac.aaTotal),
          attackerProtection: Number(atk.protection)
        });
        shotsBox.appendChild(el('span', 'source-refs', `Atacante ${idx + 1} (Protección ${atk.protection}, tirada ${atk.roll}): ${shot.impacts} impacto(s) — ${shot.destroyed ? 'destruida' : 'sobrevive'}.`));
      });
      if (shotsBox.childNodes.length) wrap.appendChild(shotsBox);
    }
  }

  root.AppWizardSteps = {
    renderWizardStepAreaAirDefense,
    renderInterceptionShotRows,
    appendLowConsumptionRestrictions,
    renderLowAltitudeCounterattackSection
  };
})(typeof window !== 'undefined' ? window : globalThis);
