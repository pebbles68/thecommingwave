// Wizard de combate: Combate Cercano Terrestre (roadmap Fase 9, primer
// vertical slice de ataques terrestres — data/workflows/01_combate_cercano_terrestre.json
// + data/tables/page-02.json + public/js/ground-close-combat-engine.js).
//
// A diferencia del ataque guiado a superficie (Fase 7), no existe ninguna
// "hoja de ayuda" con un ejemplo resuelto para este dominio: cada paso cita
// directamente el Decision Book (§8.7) en vez de reproducir un escenario
// oficial. El combate terrestre es simétrico (ambos bandos calculan y tiran
// a la vez, Decision Book §8.7.4) pero data/workflows/01... solo transcribe
// UNA perspectiva (un valor de ataque/apoyo, una tirada); este wizard resuelve
// deliberadamente un bando a la vez — "tu bando" — en vez de inventar una UI
// de doble resolución simultánea que la fuente transcrita no describe.
//
// Tampoco modela la asignación de Puntos de Impacto a una unidad principal
// concreta vía su Valor de Defensa Cercana (Decision Book §8.7.6): ese dato
// no está en ningún registro de unidades del proyecto todavía, así que el
// wizard pide directamente el daño ya acumulado a Tamaño de Fuerza (que el
// jugador lleva en su ficha física) para poder consultar el umbral de
// Derrota — en vez de inventar ese registro de datos.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage,
    makeNumberField, makeOptionGroup, makeSelectFromValues,
    wizardActionRow, wizardNavButton, renderGrid
  } = AppCore;

  const WIZARD_STEPS = [
    'Comprobar elegibilidad',
    'Calcular fuerza de combate',
    'Guerra electrónica',
    'Aplicar bajas',
    'Resultado'
  ];

  function freshState() {
    return {
      step: 0,
      activeCombat: '',
      outOfSupply: '',
      baseAttack: '',
      combatSupport: '',
      combatRoll: '',
      electronicOwn: '',
      electronicRival: '',
      ewRoll: '',
      reactionLevel: '',
      forceSize: '',
      damageSoFar: '',
      chooseDefeat: ''
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 4;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'ground-close-combat', type: 'ground_close_combat', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  function getStage(workflow, id) {
    return workflow.stages.find((st) => st.id === id);
  }

  async function renderGroundCloseCombatWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('ground-close-combat', state, freshState);
    linkToTurnContextIfNeeded(state, 'Combate cercano terrestre');
    AppCore.persistWizardDraft('ground-close-combat', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Combate cercano terrestre']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let page02;
    try {
      [workflow, page02] = await Promise.all([
        loadWorkflow('01_combate_cercano_terrestre.json'),
        loadTablePage('page-02.json')
      ]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', workflow.title));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', `${workflow.source.document}, págs. ${workflow.source.pages} · Decision Book §8.7. Sin "hoja de ayuda" con ejemplo resuelto para este dominio: cada paso cita la regla directamente.`));

    const rerender = () => { renderGroundCloseCombatWizard(); };

    AppCore.mountWizardDraft('ground-close-combat', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    const stepRenderers = [
      () => renderStepEligibility(wrap, workflow, rerender),
      () => renderStepAttackValue(wrap, workflow, page02, rerender),
      () => renderStepElectronicWarfare(wrap, workflow, page02, rerender),
      () => renderStepCasualties(wrap, workflow, page02, rerender),
      () => renderStepResult(wrap, workflow, page02, rerender)
    ];
    stepRenderers[state.step]();

    viewRoot.appendChild(wrap);
  }

  function renderStepEligibility(wrap, workflow, rerender) {
    const stage = getStage(workflow, 'eligibility');
    const qActive = stage.questions.find((q) => q.id === 'active_combat');
    const qSupply = stage.questions.find((q) => q.id === 'out_of_supply');

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(makeOptionGroup(qActive, state.activeCombat, (v) => { state.activeCombat = v; state.outOfSupply = ''; rerender(); }));

    let blocked = false;
    if (state.activeCombat === 'yes') {
      wrap.appendChild(makeOptionGroup(qSupply, state.outOfSupply, (v) => { state.outOfSupply = v; rerender(); }));
      if (state.outOfSupply === 'yes') {
        blocked = true;
        wrap.appendChild(el('p', 'pending-note', qSupply.note + ' — no se puede continuar con este combate (Decision Book §8.7.2).'));
      }
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (state.activeCombat === '') { alert('Indica si tu bando inicia el combate de forma activa.'); return; }
        if (blocked) { alert('Una unidad principal fuera de suministro no puede iniciar combate de forma activa. Elige Combate Pasivo o resuelve el suministro primero.'); return; }
        state.step = 1;
        rerender();
      })
    ]));
  }

  function renderStepAttackValue(wrap, workflow, page02, rerender) {
    const stage = getStage(workflow, 'attack_value');
    const table = TableEngine.findTableInPage(page02, 'ground-close-combat-result').table;
    const isActive = state.activeCombat === 'yes';

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));
    wrap.appendChild(el('p', 'turn-view__desc', `Columna de resolución: ${isActive ? 'Activo' : 'Pasivo'} (según lo elegido en el paso anterior — Decision Book §8.7.1).`));

    wrap.appendChild(makeNumberField('Introduce el valor total de ataque de las unidades participantes.', state.baseAttack, (v) => { state.baseAttack = v; }, rerender, { visualRef: 'ground-attack-total' }));
    wrap.appendChild(makeNumberField('Introduce el apoyo de combate aplicable.', state.combatSupport, (v) => { state.combatSupport = v; }, rerender, { visualRef: 'ground-combat-support' }));

    const baseAttack = Number(state.baseAttack);
    const combatSupport = Number(state.combatSupport);
    const hasValues = state.baseAttack !== '' && state.combatSupport !== '' && !Number.isNaN(baseAttack) && !Number.isNaN(combatSupport);
    const attackValue = hasValues ? baseAttack + combatSupport : null;
    if (attackValue !== null) {
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `${stage.formula} ${baseAttack} + ${combatSupport} = ${attackValue}`));
    }

    wrap.appendChild(makeSelectFromValues('Tirada (1d10)', table.rowAxis.values, state.combatRoll, (v) => { state.combatRoll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
      state.combatRoll = table.rowAxis.values[Math.floor(Math.random() * table.rowAxis.values.length)];
      rerender();
    }));

    let result = null;
    if (attackValue !== null && state.combatRoll !== '') {
      try {
        result = GroundCloseCombatEngine.resolveCombatResult(table, TableEngine, { roll: state.combatRoll, attackValue, isActive });
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Puntos de Impacto (antes de guerra electrónica): ${result.isMissingData ? 'sin dato transcrito: el cálculo se detiene aquí' : result.displayValue}`));
      } catch (err) {
        wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${err.message}`));
      }
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!result) { alert('Introduce el Valor de Ataque, el Apoyo de Combate y la tirada.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  function renderStepElectronicWarfare(wrap, workflow, page02, rerender) {
    const stage = getStage(workflow, 'electronic_warfare');
    const table = TableEngine.findTableInPage(page02, 'ground-close-combat-electronic-warfare').table;

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));

    wrap.appendChild(makeNumberField('Valor Electrónico más alto de tu bando.', state.electronicOwn, (v) => { state.electronicOwn = v; }, rerender, { visualRef: 'ground-electronic' }));
    wrap.appendChild(makeNumberField('Valor Electrónico más alto del bando rival.', state.electronicRival, (v) => { state.electronicRival = v; }, rerender, { visualRef: 'ground-electronic' }));

    const own = Number(state.electronicOwn);
    const rival = Number(state.electronicRival);
    const hasValues = state.electronicOwn !== '' && state.electronicRival !== '' && !Number.isNaN(own) && !Number.isNaN(rival);
    let impactMultiplierApplies = false;
    let canAdvance = false;

    if (hasValues) {
      const difference = Math.abs(own - rival);
      if (difference === 0) {
        wrap.appendChild(el('p', 'turn-view__desc', 'Valores Electrónicos iguales: ningún bando obtiene ventaja y esta etapa no se resuelve más (Decision Book §8.7.5).'));
        canAdvance = true;
      } else {
        const ownHasAdvantage = own > rival;
        wrap.appendChild(el('p', 'turn-view__desc', `Diferencia electrónica: ${difference} (${ownHasAdvantage ? 'a favor de tu bando' : 'a favor del bando rival'}, según quién tenga el valor más alto — Decision Book §8.7.5).`));
        wrap.appendChild(makeSelectFromValues('Tirada (1d10)', table.rowAxis.values, state.ewRoll, (v) => { state.ewRoll = v; rerender(); }));
        wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
          state.ewRoll = table.rowAxis.values[Math.floor(Math.random() * table.rowAxis.values.length)];
          rerender();
        }));
        if (state.ewRoll !== '') {
          try {
            const ewResult = GroundCloseCombatEngine.resolveElectronicWarfareAdvantage(table, TableEngine, { roll: state.ewRoll, electronicDifference: difference });
            const advantageGranted = ewResult.rawCell === 'x2';
            wrap.appendChild(el('p', 'wizard-modifier-summary__total', advantageGranted
              ? `Ventaja concedida: ${ownHasAdvantage ? 'tu bando duplica' : 'el bando rival duplica'} su resultado final de Puntos de Impacto.`
              : 'Sin ventaja: ningún bando duplica sus Puntos de Impacto en esta tirada.'));
            impactMultiplierApplies = advantageGranted && ownHasAdvantage;
            canAdvance = true;
          } catch (err) {
            wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${err.message}`));
          }
        }
      }
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!canAdvance) { alert('Introduce el Valor Electrónico más alto de ambos bandos y, si difieren, la tirada.'); return; }
        state.ownHasEwAdvantage = impactMultiplierApplies;
        state.step = 3;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  function renderStepCasualties(wrap, workflow, page02, rerender) {
    const stage = getStage(workflow, 'casualties');
    const table = TableEngine.findTableInPage(page02, 'ground-close-combat-casualties').table;

    wrap.appendChild(el('h2', null, stage.title));
    wrap.appendChild(el('p', 'source-refs', stage.tableReference));

    const reactionQuestion = stage.questions.find((q) => q.id === 'reaction_level');
    wrap.appendChild(makeOptionGroup(reactionQuestion, state.reactionLevel, (v) => { state.reactionLevel = v; rerender(); }));
    wrap.appendChild(makeNumberField('Tamaño de Fuerza antes del combate.', state.forceSize, (v) => { state.forceSize = v; }, rerender, { visualRef: 'ground-force-size' }));

    let canAdvance = false;
    if (state.reactionLevel && state.forceSize !== '' && !Number.isNaN(Number(state.forceSize))) {
      let thresholdInfo;
      try {
        thresholdInfo = GroundCloseCombatEngine.resolveDefeatThreshold(table, TableEngine, { reactionLevel: state.reactionLevel, forceSize: state.forceSize });
      } catch (err) {
        wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${err.message}`));
        thresholdInfo = null;
      }
      if (thresholdInfo) {
        const { parsed } = thresholdInfo;
        if (parsed.kind === 'skip') {
          wrap.appendChild(el('p', 'turn-view__desc', 'Esta combinación de Clase/Tamaño de Fuerza no tiene umbral de Derrota (celda ".", sin bajas posibles).'));
          canAdvance = true;
        } else {
          const thresholdLabel = parsed.kind === 'exact'
            ? `Umbral único de Derrota: ${parsed.value} (Clases C/D, sin elección — Decision Book §8.7.7).`
            : `Valor Mínimo de Derrota: ${parsed.min} (opcional) · Valor Máximo de Derrota: ${parsed.max} (forzosa) — Clases A/B, Decision Book §8.7.7.`;
          wrap.appendChild(el('p', 'wizard-modifier-summary__total', thresholdLabel));
          wrap.appendChild(makeNumberField('Daño ya sufrido en este combate por la unidad que estás comprobando (Tamaño de Fuerza).', state.damageSoFar, (v) => { state.damageSoFar = v; state.chooseDefeat = ''; }, rerender, { visualRef: 'ground-force-size' }));
          if (state.damageSoFar !== '' && !Number.isNaN(Number(state.damageSoFar))) {
            const evalResult = GroundCloseCombatEngine.evaluateGroundUnitDefeat(Number(state.damageSoFar), parsed);
            if (evalResult.forcedDefeat) {
              wrap.appendChild(el('p', 'wizard-modifier-summary__total', 'Derrotada forzosamente (alcanzó el Valor Máximo de Derrota).'));
              state.chooseDefeat = 'yes';
              canAdvance = true;
            } else if (evalResult.canChooseDefeat) {
              wrap.appendChild(makeOptionGroup(
                { prompt: '¿Declaras esta unidad "Derrotada" ahora? (opcional — puede seguir absorbiendo daño hasta el Valor Máximo)', options: [{ value: 'yes', label: 'Sí, Derrotada' }, { value: 'no', label: 'No, sigue combatiendo' }] },
                state.chooseDefeat,
                (v) => { state.chooseDefeat = v; rerender(); }
              ));
              canAdvance = state.chooseDefeat !== '';
            } else {
              wrap.appendChild(el('p', 'turn-view__desc', 'Todavía no alcanza el Valor Mínimo de Derrota: sigue combatiendo sin opción de retirada.'));
              state.chooseDefeat = 'no';
              canAdvance = true;
            }
          }
        }
      }
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 2; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!canAdvance) { alert('Completa el Nivel de reacción, el Tamaño de Fuerza y, si aplica, el daño sufrido.'); return; }
        state.step = 4;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  function renderStepResult(wrap, workflow, page02, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));

    const resultTable = TableEngine.findTableInPage(page02, 'ground-close-combat-result').table;
    const ewTable = TableEngine.findTableInPage(page02, 'ground-close-combat-electronic-warfare').table;
    const casualtiesTable = TableEngine.findTableInPage(page02, 'ground-close-combat-casualties').table;
    const isActive = state.activeCombat === 'yes';
    const attackValue = Number(state.baseAttack) + Number(state.combatSupport);

    let baseResult;
    try {
      baseResult = GroundCloseCombatEngine.resolveCombatResult(resultTable, TableEngine, { roll: state.combatRoll, attackValue, isActive });
    } catch (err) {
      wrap.appendChild(el('p', 'pending-note', `No se pudo resolver el resultado: ${err.message}`));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 3; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }

    const basePoints = Number(baseResult.rawCell) || 0;
    const finalPoints = state.ownHasEwAdvantage ? basePoints * 2 : basePoints;

    const summaryLines = [];
    summaryLines.push(`Combate ${isActive ? 'Activo' : 'Pasivo'} — Valor de Ataque + Apoyo de Combate: ${attackValue}, tirada ${state.combatRoll} → Puntos de Impacto: ${baseResult.isMissingData ? 'sin dato' : baseResult.displayValue}`);
    if (state.ownHasEwAdvantage) {
      summaryLines.push(`Ventaja de guerra electrónica a favor de tu bando: Puntos de Impacto duplicados → ${finalPoints}`);
    } else {
      summaryLines.push('Sin ventaja de guerra electrónica a favor de tu bando (o valores iguales): sin duplicar.');
    }

    let thresholdInfo = null;
    try {
      thresholdInfo = GroundCloseCombatEngine.resolveDefeatThreshold(casualtiesTable, TableEngine, { reactionLevel: state.reactionLevel, forceSize: state.forceSize });
    } catch (err) { /* mostrado ya en el paso anterior */ }
    if (thresholdInfo && thresholdInfo.parsed.kind !== 'skip') {
      const { parsed } = thresholdInfo;
      const thresholdText = parsed.kind === 'exact' ? `umbral único ${parsed.value}` : `Mín. ${parsed.min} (opcional) / Máx. ${parsed.max} (forzosa)`;
      summaryLines.push(`Nivel de reacción ${state.reactionLevel}, Tamaño de Fuerza ${state.forceSize}: ${thresholdText}.`);
      if (state.damageSoFar !== '' && !Number.isNaN(Number(state.damageSoFar))) {
        summaryLines.push(`Daño sufrido: ${state.damageSoFar} → ${state.chooseDefeat === 'yes' ? '"Derrotada"' : 'sigue combatiendo'}.`);
      }
    }

    const summary = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => summary.appendChild(el('span', null, line)));
    wrap.appendChild(summary);

    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${finalPoints} Punto(s) de Impacto${state.chooseDefeat === 'yes' ? ' · unidad "Derrotada" (pasa a Brevemente Detectable, Decision Book §8.7.7)' : ''}`));
    wrap.appendChild(renderGrid(resultTable, resultTable.rowAxis.values, TableEngine.pickAxisLabels(resultTable.columnAxis, isActive ? 'activo' : 'pasivo'), baseResult));

    wrap.appendChild(el('p', 'pending-note', 'La asignación de estos Puntos de Impacto a una unidad principal concreta (absorción por su Valor de Defensa Cercana hasta convertirse en daño a Tamaño de Fuerza, Decision Book §8.7.6) no está modelada todavía en la aplicación — se aplica sobre las fichas físicas; este wizard solo calcula los Puntos de Impacto y, dado el daño ya sufrido, el umbral de Derrota.'));

    const fullSummaryText = [workflow.title, ...summaryLines, `Resultado: ${finalPoints} Punto(s) de Impacto${state.chooseDefeat === 'yes' ? ' — unidad Derrotada' : ''}`].join('\n');
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
        workflowId: 'ground_close_combat',
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
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 3; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => {
        unlinkTurnContext(state);
        state = freshState();
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.GroundCloseCombatWizard = { render: renderGroundCloseCombatWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
