// Wizard de combate: Combate Aéreo BVR de una Interceptación de Combate Aéreo
// (roadmap Fase 11; data/workflows/05_combate_aereo.json + data/tables/
// page-15.json y page-16.json + public/js/air-combat-bvr-engine.js). Sigue el
// Decision Book §7.16.2-§7.16.3 (pp. 143-145): iniciativa y tipo de combate BVR
// (sin BVR / simultáneo / ventaja) y, según el resultado, el ataque BVR 1
// contra 1 de cada bando con su fila de la tabla (misión + AWACS), el
// modificador electrónico y el daño por Protección.
//
// El combate aéreo cercano (WVR, página 17) y la asignación de objetivos
// (§7.16.1) NO están en este wizard: se resuelve UN duelo 1 contra 1 por
// ejecución. El texto de las reglas se lee del workflow (datos antes que
// lógica); la mecánica vive en el motor puro.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage,
    makeTextField, makeNumberField, makeOptionGroup, makeSelectFromValues,
    wizardActionRow, wizardNavButton, renderGrid
  } = AppCore;

  const WIZARD_STEPS = ['Iniciativa y tipo de combate BVR', 'Ataques BVR', 'Resultado'];
  const DIE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];
  const SIDES = ['A', 'B'];

  function freshSide(name) {
    return { label: name, initiative: '', awacs: 'no', stealth: 'no', electronic: '', mission: '', airCombatValue: '', roll: '', targetProtection: '', targetIsCaps: '' };
  }

  function freshState() {
    return {
      step: 0,
      context: '',
      penetratorSide: '',
      initiativeRoll: '',
      sides: { A: freshSide('Bando A'), B: freshSide('Bando B') },
      turnResolutionId: null
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 2;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'air-combat-bvr', type: 'air_combat', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  const stageOf = (workflow, id) => workflow.stages.find((st) => st.id === id);
  const questionOf = (workflow, stageId, qId) => stageOf(workflow, stageId).questions.find((q) => q.id === qId);
  const sideName = (key) => state.sides[key].label || `Bando ${key}`;

  // Tipo de combate BVR con lo introducido; null mientras falte algo.
  function computeInitiativePhase(workflow, tables) {
    const a = state.sides.A;
    const b = state.sides.B;
    if (state.context === '' || a.initiative === '' || b.initiative === '' || Number.isNaN(Number(a.initiative)) || Number.isNaN(Number(b.initiative))) return null;
    if (state.context === 'penetration' && state.penetratorSide === '') return null;
    const init = AirCombatBvrEngine.computeInitiative({ initiativeA: a.initiative, initiativeB: b.initiative, awacsA: a.awacs === 'yes', awacsB: b.awacs === 'yes' });
    const drm = AirCombatBvrEngine.initiativeDrm(tables.drm, TableEngine, init.difference);
    const bothStealth = a.stealth === 'yes' && b.stealth === 'yes';
    if (state.initiativeRoll === '' && !bothStealth) return { init, drm, bothStealth, total: null, type: null };
    const total = bothStealth ? null : Number(state.initiativeRoll) + drm;
    const type = AirCombatBvrEngine.determineBvrType(tables.outcome, TableEngine, stageOf(workflow, 'initiative').outcomeRule.cellOutcomes, {
      total: total === null ? 0 : total,
      context: state.context,
      penetratorSide: state.penetratorSide === '' ? null : state.penetratorSide,
      penetratorStealth: state.penetratorSide !== '' && state.sides[state.penetratorSide].stealth === 'yes',
      advantageSide: init.advantageSide,
      bothStealth
    });
    return { init, drm, bothStealth, total, type };
  }

  // Quién ataca en BVR según el resultado (§7.16.2 punto 4 / página 15).
  function attackersFor(phase) {
    if (!phase || !phase.type) return [];
    const { outcome } = phase.type;
    if (outcome === 'simultaneous') return ['A', 'B'];
    if (outcome === 'advantage') return phase.init.advantageSide ? [phase.init.advantageSide] : [];
    if (outcome === 'interceptor_advantage') return [state.penetratorSide === 'A' ? 'B' : 'A'];
    return [];
  }

  function conditionFor(side) {
    return `${state.sides[side].mission}${state.sides[side].awacs === 'yes' ? '_awacs' : ''}`;
  }

  function computeAttack(workflow, tables, side, phase) {
    const s = state.sides[side];
    if (s.mission === '' || s.airCombatValue === '' || s.roll === '' || Number.isNaN(Number(s.airCombatValue))) return null;
    const cond = questionOf(workflow, 'bvr', 'mission_condition').options.find((o) => o.value === conditionFor(side));
    const elec = state.sides.A.electronic !== '' && state.sides.B.electronic !== ''
      ? AirCombatBvrEngine.electronicModifier(state.sides.A.electronic, state.sides.B.electronic) : { side: null, modifier: 0 };
    const result = AirCombatBvrEngine.resolveBvrAttack(tables.damage, TableEngine, {
      columnScheme: cond.columnScheme,
      airCombatValue: Number(s.airCombatValue),
      roll: Number(s.roll),
      electronicBonus: elec.side === side ? elec.modifier : 0
    });
    const target = side === 'A' ? 'B' : 'A';
    const damage = state.sides[target].targetProtection !== '' && !Number.isNaN(Number(state.sides[target].targetProtection)) && state.sides[target].targetIsCaps !== ''
      ? AirCombatBvrEngine.resolveBvrDamage({ impacts: result.impacts, protection: Number(state.sides[target].targetProtection), targetIsCaps: state.sides[target].targetIsCaps === 'yes' })
      : null;
    return { result, cond, elec, target, damage };
  }

  async function renderAirCombatBvrWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('air-combat-bvr', state, freshState);
    linkToTurnContextIfNeeded(state, 'Combate aéreo BVR');
    AppCore.persistWizardDraft('air-combat-bvr', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Combate aéreo BVR']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let page15;
    let page16;
    try {
      [workflow, page15, page16] = await Promise.all([
        loadWorkflow('05_combate_aereo.json'),
        loadTablePage('page-15.json'),
        loadTablePage('page-16.json')
      ]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    const tables = {
      drm: TableEngine.findTableInPage(page15, 'air-combat-initiative-drm').table,
      outcome: TableEngine.findTableInPage(page15, 'air-combat-bvr-outcome').table,
      damage: TableEngine.findTableInPage(page16, 'air-combat-bvr-damage').table
    };

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Combate aéreo BVR (más allá del alcance visual)'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Tablas-de-combate 5.pdf, págs. 15-16 · Decision Book §7.16.2-§7.16.3. Resuelve UN duelo 1 contra 1; la asignación de objetivos (§7.16.1) se hace antes en su propio wizard. El combate aéreo cercano (WVR, pág. 17) tiene su propio wizard.'));

    const rerender = () => { renderAirCombatBvrWizard(); };

    AppCore.mountWizardDraft('air-combat-bvr', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    const stepRenderers = [
      () => renderStepInitiative(wrap, workflow, tables, rerender),
      () => renderStepAttacks(wrap, workflow, tables, rerender),
      () => renderStepResult(wrap, workflow, tables, rerender)
    ];
    stepRenderers[state.step]();

    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Iniciativa y tipo de combate BVR ----------
  function renderStepInitiative(wrap, workflow, tables, rerender) {
    const stage = stageOf(workflow, 'initiative');
    const qContext = questionOf(workflow, 'initiative', 'interception_context');
    const rule = stage.outcomeRule;

    wrap.appendChild(el('h2', null, 'Iniciativa y tipo de combate BVR'));
    wrap.appendChild(el('p', 'source-refs', stage.formula));
    wrap.appendChild(wizardNavButton('Ver tablas de iniciativa y resultado (pág. 15)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-15.json/air-combat-bvr-outcome';
    }));
    wrap.appendChild(makeOptionGroup(qContext, state.context, (v) => { state.context = v; if (v !== 'penetration') state.penetratorSide = ''; rerender(); }));

    SIDES.forEach((key) => {
      const s = state.sides[key];
      wrap.appendChild(el('h3', null, sideName(key)));
      wrap.appendChild(makeTextField(`${key}: nombre (opcional)`, s.label, (v) => { s.label = v; }));
      wrap.appendChild(makeNumberField(`${key}: Valor de Iniciativa (IN)`, s.initiative, (v) => { s.initiative = v; }, rerender, { visualRef: 'bvr-initiative' }));
      wrap.appendChild(makeOptionGroup({ prompt: `${key}: ${stage.sideFlags[0].prompt}`, options: YES_NO }, s.awacs, (v) => { s.awacs = v; rerender(); }));
      wrap.appendChild(makeOptionGroup({ prompt: `${key}: ${stage.sideFlags[1].prompt}`, options: YES_NO }, s.stealth, (v) => { s.stealth = v; rerender(); }));
    });
    wrap.appendChild(el('p', 'source-refs', stage.sideFlags[0].effect + ' (Decision Book §7.16.2).'));

    if (state.context === 'penetration') {
      wrap.appendChild(makeOptionGroup({ prompt: '¿Qué bando es el que penetra (el interceptado)?', options: SIDES.map((k) => ({ value: k, label: sideName(k) })) }, state.penetratorSide, (v) => { state.penetratorSide = v; rerender(); }));
    }

    let ready = false;
    const phase = computeInitiativePhase(workflow, tables);
    if (phase) {
      const { init } = phase;
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Iniciativa: ${sideName('A')} ${init.valueA} · ${sideName('B')} ${init.valueB} → diferencia ${init.difference}${init.advantageSide ? ` (ventaja: ${sideName(init.advantageSide)})` : ' (sin ventaja)'}; DRM ${phase.drm >= 0 ? '+' : ''}${phase.drm}.`));
      if (phase.bothStealth) {
        wrap.appendChild(el('p', 'pending-note', rule.bothStealth));
      } else {
        wrap.appendChild(el('p', 'turn-view__desc', rule.rollsSide + ' ' + rule.totalRule));
        wrap.appendChild(makeSelectFromValues('Tirada de iniciativa (1d10)', DIE_VALUES, state.initiativeRoll, (v) => { state.initiativeRoll = v; rerender(); }));
        wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => { state.initiativeRoll = String(Math.floor(Math.random() * 10)); rerender(); }));
      }
      if (phase.type) {
        if (!phase.bothStealth) wrap.appendChild(el('p', 'source-refs', `Total ${state.initiativeRoll} + (${phase.drm}) = ${phase.total}.`));
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', rule.outcomes[phase.type.outcome]));
        ready = true;
      }
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!ready) { alert('Completa el tipo de interceptación, las Iniciativas (y quién penetra si procede) y la tirada.'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Ataques BVR ----------
  function renderStepAttacks(wrap, workflow, tables, rerender) {
    const phase = computeInitiativePhase(workflow, tables);
    const stage = stageOf(workflow, 'bvr');
    const qCond = questionOf(workflow, 'bvr', 'mission_condition');
    wrap.appendChild(el('h2', null, 'Ataques BVR'));
    wrap.appendChild(wizardNavButton('Ver tabla de daño BVR (pág. 16)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-16.json/air-combat-bvr-damage';
    }));

    const attackers = attackersFor(phase);
    if (!phase || !phase.type) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos de iniciativa: vuelve al paso anterior.'));
    } else if (!attackers.length) {
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `${stageOf(workflow, 'initiative').outcomeRule.outcomes[phase.type.outcome]} No hay ataques BVR que resolver.`));
    } else {
      wrap.appendChild(el('p', 'turn-view__desc', attackers.length === 2 ? 'BVR simultáneo: ambos bandos atacan; los efectos se aplican después de determinar los Puntos de Impacto de los dos.' : `Ataca ${sideName(attackers[0])} (unilateral).`));
      wrap.appendChild(el('p', 'source-refs', questionOf(workflow, 'bvr', 'electronic_high').note));
      SIDES.forEach((key) => {
        wrap.appendChild(makeNumberField(`${key}: Valor Electrónico`, state.sides[key].electronic, (v) => { state.sides[key].electronic = v; }, rerender, { visualRef: 'air-electronic-value' }));
      });
      const intercept = qCond.options.find((o) => o.value === 'intercept');
      const cap = qCond.options.find((o) => o.value === 'cap');
      wrap.appendChild(el('p', 'source-refs', qCond.note));

      attackers.forEach((key) => {
        const s = state.sides[key];
        const target = key === 'A' ? 'B' : 'A';
        const t = state.sides[target];
        wrap.appendChild(el('h3', null, `Ataque de ${sideName(key)} contra ${sideName(target)}`));
        wrap.appendChild(makeOptionGroup({ prompt: `${key}: misión original de la unidad que ataca`, options: [{ value: 'intercept', label: intercept.label }, { value: 'cap', label: cap.label }] }, s.mission, (v) => { s.mission = v; rerender(); }));
        if (s.mission !== '') {
          const cond = qCond.options.find((o) => o.value === conditionFor(key));
          wrap.appendChild(el('p', 'source-refs', `Fila de la tabla: «${cond.label}»${s.awacs === 'yes' ? ' (el AWACS en red detecta al objetivo: fila "+ AWACS")' : ''}.`));
        }
        wrap.appendChild(makeNumberField(`${key}: Valor de Combate Aéreo`, s.airCombatValue, (v) => { s.airCombatValue = v; }, rerender, { visualRef: 'bvr-air-combat-value' }));
        wrap.appendChild(makeSelectFromValues(`${key}: Tirada BVR (1d10)`, DIE_VALUES, s.roll, (v) => { s.roll = v; rerender(); }));
        wrap.appendChild(makeNumberField(`${target}: Valor de Protección de la unidad que recibe el ataque de ${key}`, t.targetProtection, (v) => { t.targetProtection = v; }, rerender, { visualRef: 'air-protection' }));
        wrap.appendChild(makeOptionGroup({ prompt: `${target}: ¿La unidad que recibe el ataque es de Patrulla Aérea (CAPs)?`, options: YES_NO }, t.targetIsCaps, (v) => { t.targetIsCaps = v; rerender(); }));

        try {
          const atk = computeAttack(workflow, tables, key, phase);
          if (atk) {
            const r = atk.result;
            wrap.appendChild(el('p', 'wizard-modifier-summary__total', r.noColumn
              ? `Este Valor de Combate Aéreo (${s.airCombatValue}) no tiene columna en la fila elegida (${r.noColumnReason === 'above_table' ? 'por encima del máximo impreso' : 'por debajo del mínimo impreso'}): la tabla no dice qué ocurre (AGENTS.md §14).`
              : `Tirada ${r.naturalRoll}${r.electronicBonus ? ` + ${r.electronicBonus} (electrónico) = ${r.modifiedRoll}` : ''}${r.rollClamped ? ' → se lee la última fila (9): el reglamento no dice qué hacer con una tirada modificada > 9' : ''} · columna «${r.cell.columnLabel}» → ${r.impacts} Punto(s) de Impacto.`));
            if (atk.damage) wrap.appendChild(el('p', 'source-refs', `Daño a ${sideName(target)}: ${atk.damage.damage} punto(s)${atk.damage.capsCapped ? ' (CAPs: solo absorbe 1)' : ''}${atk.damage.exitsCombat ? ' — sale temporalmente de combate' : ''}.`));
          }
        } catch (err) {
          wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${err.message}`));
        }
      });
      wrap.appendChild(el('p', 'source-refs', stage.damageRule.absorption));
      wrap.appendChild(el('p', 'source-refs', stage.damageRule.capsRule));
    }

    const complete = attackers.every((key) => {
      const atk = (() => { try { return computeAttack(workflow, tables, key, phase); } catch (e) { return null; } })();
      return atk && !atk.result.noColumn && atk.damage;
    });
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!phase || !phase.type) { alert('Completa la iniciativa.'); return; }
        if (!complete) { alert('Completa cada ataque BVR (misión, Valor de Combate Aéreo con columna, tirada, Protección y si es CAPs).'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Resultado ----------
  function renderStepResult(wrap, workflow, tables, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const phase = computeInitiativePhase(workflow, tables);
    if (!phase || !phase.type) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const stage = stageOf(workflow, 'bvr');
    const outcomes = stageOf(workflow, 'initiative').outcomeRule.outcomes;
    const attackers = attackersFor(phase);
    const summaryLines = [
      `Interceptación de ${state.context === 'penetration' ? 'Penetración' : 'Combate Aéreo'}. Iniciativa: ${sideName('A')} ${phase.init.valueA} · ${sideName('B')} ${phase.init.valueB} (diferencia ${phase.init.difference}, DRM ${phase.drm >= 0 ? '+' : ''}${phase.drm})${phase.bothStealth ? '. Duelo sigiloso.' : `; tirada ${state.initiativeRoll} → total ${phase.total}.`}`,
      outcomes[phase.type.outcome]
    ];
    const attackResults = [];
    attackers.forEach((key) => {
      const atk = computeAttack(workflow, tables, key, phase);
      if (!atk) return;
      attackResults.push({ key, atk });
      const r = atk.result;
      summaryLines.push(r.noColumn
        ? `${sideName(key)}: sin columna para Valor de Combate Aéreo ${state.sides[key].airCombatValue}.`
        : `${sideName(key)} (fila «${atk.cond.label}»): tirada ${r.naturalRoll}${r.electronicBonus ? ` +${r.electronicBonus} electrónico` : ''}${r.rollClamped ? ' (última fila)' : ''}, columna «${r.cell.columnLabel}» → ${r.impacts} Punto(s) de Impacto → ${atk.damage.damage} punto(s) de daño a ${sideName(atk.target)}${atk.damage.capsCapped ? ' (CAPs: solo 1)' : ''}${atk.damage.exitsCombat ? ', sale temporalmente de combate' : ''}.`);
    });

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    const resultText = attackResults.length
      ? attackResults.map(({ key, atk }) => `${sideName(key)} → ${atk.damage.damage} punto(s) de daño a ${sideName(atk.target)}`).join(' · ')
      : outcomes[phase.type.outcome];
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    attackResults.forEach(({ atk }) => {
      if (atk.result.cell) {
        wrap.appendChild(renderGrid(tables.damage, tables.damage.rowAxis.values, TableEngine.pickAxisLabels(tables.damage.columnAxis, atk.result.columnScheme), atk.result.cell));
      }
    });
    if (attackResults.some(({ atk }) => atk.result.rollClamped)) {
      AppCore.appendNoteWithTrace(wrap, 'source-refs', 'Una tirada BVR modificada por el Valor Electrónico que supera 9 se lee en la última fila de la tabla (9), según confirma el mantenedor.', 'Confirmación del mantenedor, 2026-10-07; ver docs/rules/known-ambiguities.md, «Combate BVR (página 16)».');
    }
    wrap.appendChild(el('p', 'source-refs', stage.damageRule.withdrawal));
    wrap.appendChild(wizardNavButton('Continuar con el combate aéreo cercano (WVR) →', 'secondary', () => { location.hash = '#/wizard/air-combat-wvr'; }));

    const fullSummaryText = ['Combate aéreo BVR', ...summaryLines, `Resultado: ${resultText}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'air_combat', workflowTitle: 'Combate aéreo BVR', summaryText: fullSummaryText, state });
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
  root.Views.AirCombatBvrWizard = { render: renderAirCombatBvrWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
