// Wizard: Reabastecimiento de Campo / Reabastecimiento Logístico del Ejército
// (roadmap Fase 14; data/rules/army-resupply.json + data/tables/page-32.json +
// public/js/army-resupply-engine.js). Decision Book §8.11.3 (p. 186) y página
// 32 de Tablas-de-combate 5.pdf: una unidad principal "No Actuada" que no
// comparte hexágono con unidades principales enemigas y puede recibir apoyo
// logístico lanza 1d10, consulta la tabla por su Nivel de Iniciativa y, con
// éxito, aumenta su fuerza en 1 punto hasta su límite impreso.
//
// La Línea de Suministro y "poder recibir apoyo logístico" (capítulo 11) no
// están modelados: los declara el jugador. El texto de las reglas se lee del
// JSON de reglas; la mecánica vive en el motor puro.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadArmyResupply, loadTablePage, appendFactorIdentificationHint,
    makeTextField, makeNumberField, makeOptionGroup, makeSelectFromValues,
    wizardActionRow, wizardNavButton, renderGrid
  } = AppCore;

  const WIZARD_STEPS = ['Unidad y condiciones', 'Tirada', 'Resultado'];
  const DIE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return {
      step: 0,
      unitLabel: '',
      answers: { not_acted: '', supply_line_intact: '', no_enemy_main_in_hex: '' },
      initiativeLevel: '',
      currentForce: '',
      printedForceLimit: '',
      roll: '',
      turnResolutionId: null
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 2;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'army-resupply', type: 'army_resupply', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  const isCount = (v) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0;

  function unitReady() {
    return state.initiativeLevel !== '' && isCount(state.currentForce) && isCount(state.printedForceLimit)
      && Number(state.currentForce) <= Number(state.printedForceLimit);
  }

  function conditionsCheck(rules) {
    return ArmyResupplyEngine.checkConditions(rules.conditions, state.answers);
  }

  // Resuelve con lo introducido; null mientras falte algo, {error} si el motor rechaza.
  function computeResupply(rules, table) {
    if (!unitReady() || state.roll === '') return null;
    try {
      return { result: ArmyResupplyEngine.resolveArmyResupply(table, TableEngine, {
        initiativeLevel: state.initiativeLevel, roll: state.roll, currentForce: state.currentForce,
        printedForceLimit: state.printedForceLimit, successCell: rules.table.successCell
      }) };
    } catch (err) {
      return { error: err };
    }
  }

  async function renderArmyResupplyWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('army-resupply', state, freshState);
    linkToTurnContextIfNeeded(state, 'Reabastecimiento de Campo del Ejército');
    AppCore.persistWizardDraft('army-resupply', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Reabastecimiento de Campo del Ejército']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let rules;
    let page32;
    try {
      rules = await loadArmyResupply();
      page32 = await loadTablePage(rules.table.file);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    const ctx = { rules, table: page32.tables.find((t) => t.id === rules.table.id) };

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Reabastecimiento de Campo del Ejército'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Tablas-de-combate 5.pdf, pág. 32 · Decision Book §8.11.3. Sin "hoja de ayuda" con ejemplo resuelto: cada paso cita la regla directamente.'));

    const rerender = () => { renderArmyResupplyWizard(); };

    AppCore.mountWizardDraft('army-resupply', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    [
      () => renderStepUnit(wrap, ctx, rerender),
      () => renderStepRoll(wrap, ctx, rerender),
      () => renderStepResult(wrap, ctx, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Unidad y condiciones ----------
  function renderStepUnit(wrap, ctx, rerender) {
    const { rules } = ctx;
    wrap.appendChild(el('h2', null, 'Unidad y condiciones'));
    wrap.appendChild(el('p', 'turn-view__desc', rules.intro));
    wrap.appendChild(wizardNavButton('Ver la tabla de Reabastecimiento Logístico (pág. 32)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-32.json/army-logistics-resupply';
    }));

    wrap.appendChild(makeTextField('Unidad principal (opcional)', state.unitLabel, (v) => { state.unitLabel = v; }));
    rules.conditions.forEach((c) => {
      wrap.appendChild(makeOptionGroup({ prompt: c.question, options: YES_NO }, state.answers[c.id], (v) => { state.answers[c.id] = v; state.roll = ''; rerender(); }));
    });
    wrap.appendChild(wizardNavButton('¿No sabes si tiene la Línea de Suministro sin cortar? Comprobar la garantía logística →', 'secondary', () => {
      location.hash = '#/wizard/logistics-guarantee';
    }));
    const check = conditionsCheck(rules);
    check.blocking.forEach((id) => {
      wrap.appendChild(el('p', 'pending-note', `No se puede realizar el reabastecimiento: ${rules.conditions.find((c) => c.id === id).blockedText}`));
    });

    wrap.appendChild(makeOptionGroup({ prompt: 'Nivel de Iniciativa de la unidad principal (la letra A-D de abajo a la derecha en su ficha; es lo mismo que el Nivel de Reacción).', options: ArmyResupplyEngine.LEVELS.map((l) => ({ value: l, label: l })) }, state.initiativeLevel, (v) => { state.initiativeLevel = v; state.roll = ''; rerender(); }));
    appendFactorIdentificationHint(wrap, 'ground-main', 'initiative');
    wrap.appendChild(el('p', 'source-refs', rules.sourceTermNote));
    wrap.appendChild(makeNumberField('Tamaño de fuerza actual de la unidad', state.currentForce, (v) => { state.currentForce = v; }, rerender, { visualRef: 'ground-force-size' }));
    wrap.appendChild(makeNumberField('Límite impreso original de fuerza de la unidad', state.printedForceLimit, (v) => { state.printedForceLimit = v; }, rerender, { visualRef: 'ground-force-size' }));
    if (isCount(state.currentForce) && isCount(state.printedForceLimit) && Number(state.currentForce) > Number(state.printedForceLimit)) {
      wrap.appendChild(el('p', 'pending-note', 'El tamaño de fuerza actual no puede superar el límite impreso.'));
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!check.allowed && check.blocking.length) { alert('Alguna condición impide el reabastecimiento (ver los motivos en pantalla).'); return; }
        if (!check.allowed) { alert('Responde a las tres condiciones.'); return; }
        if (!unitReady()) { alert('Indica el Nivel de Iniciativa y los tamaños de fuerza (actual no mayor que el límite impreso).'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Tirada ----------
  function renderStepRoll(wrap, ctx, rerender) {
    const { rules, table } = ctx;
    wrap.appendChild(el('h2', null, 'Tirada de reabastecimiento'));
    wrap.appendChild(el('p', 'turn-view__desc', rules.rollRule));
    wrap.appendChild(makeSelectFromValues('Tirada (1d10)', DIE_VALUES, state.roll, (v) => { state.roll = v; rerender(); }));
    wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => { state.roll = String(Math.floor(Math.random() * 10)); rerender(); }));
    const calc = computeResupply(rules, table);
    if (calc && calc.error) {
      wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${calc.error.message}`));
    } else if (calc) {
      const r = calc.result;
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Nivel ${r.level}, tirada ${r.roll} → fila «${r.cell.rowLabel}»: ${r.success ? 'Éxito' : 'sin éxito (·)'}.`));
    }
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!calc || calc.error) { alert('Completa la tirada.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Resultado ----------
  function renderStepResult(wrap, ctx, rerender) {
    const { rules, table } = ctx;
    wrap.appendChild(el('h2', null, 'Resultado'));
    const calc = computeResupply(rules, table);
    if (!calc || calc.error || !conditionsCheck(rules).allowed) {
      wrap.appendChild(el('p', 'pending-note', calc && calc.error ? `No se pudo resolver: ${calc.error.message}` : 'Faltan datos o alguna condición no se cumple: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const r = calc.result;
    const who = state.unitLabel ? `Unidad ${state.unitLabel}` : 'Unidad principal';
    const summaryLines = [
      `${who}: Nivel de Iniciativa ${r.level}; fuerza ${r.currentForce} de ${r.printedForceLimit}.`,
      'Condiciones: No Actuada, Línea de Suministro sin cortar y sin unidades principales enemigas en su hexágono.',
      `Tirada ${r.roll} → fila «${r.cell.rowLabel}», columna «${r.cell.columnLabel}» → ${r.success ? 'Éxito' : 'sin éxito (·)'}.`
    ];
    const resultText = r.success
      ? (r.gained ? `éxito: la fuerza sube de ${r.currentForce} a ${r.newForce}` : `éxito, pero la unidad ya está en su límite impreso (${r.printedForceLimit}): no aumenta`)
      : `sin éxito: la fuerza se queda en ${r.currentForce}`;

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    wrap.appendChild(el('p', 'source-refs', rules.successRule));
    wrap.appendChild(el('p', 'pending-note', `${rules.afterRule} ${rules.terminologyNote}`));
    wrap.appendChild(renderGrid(table, table.rowAxis.values, table.columnAxis.values, r.cell));

    const fullSummaryText = ['Reabastecimiento de Campo del Ejército', ...summaryLines, `Resultado: ${resultText}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'army_resupply', workflowTitle: 'Reabastecimiento de Campo del Ejército', summaryText: fullSummaryText, state });
      unlinkTurnContext(state);
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => { unlinkTurnContext(state); state = freshState(); rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.ArmyResupplyWizard = { render: renderArmyResupplyWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
