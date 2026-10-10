// Wizard de combate: Efectos de Impacto de Ataques Antibuque sobre una unidad
// de superficie (roadmap Fase 12: daño crítico, daño/hundimiento de
// portaaviones y de transportes; Decision Book §5.9-§5.9.3). El motor puro
// (public/js/ship-impact-effects-engine.js) decide qué reglas aplican; el
// texto de cada regla se lee de data/rules/ship-impact-effects.json.
//
// Se entra con una unidad que ya ha absorbido y sufre 1 punto de daño: la
// asignación de Puntos de Impacto a buques concretos (§5.6.5/§5.8.2) es de los
// wizards antibuque. Los atributos de la unidad (tipo de casco, Escudo,
// Resistencia al Hundimiento...) se introducen a mano porque el proyecto no
// registra una hoja de flota por unidad (AGENTS.md §14, no inventar).
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadShipImpactEffects,
    makeTextField, makeNumberField, makeSelectFromValues, makeOptionGroup,
    wizardActionRow, wizardNavButton
  } = AppCore;

  const WIZARD_STEPS = ['Unidad objetivo', 'Verificación por daño crítico', 'Resultado'];
  const DIE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return {
      step: 0,
      unitLabel: '',
      hullType: '',
      fleetSize: '',
      hasDamagedSide: '',
      alreadyDamaged: '',
      isAmphibiousAssault: '',
      hasShield: '',
      sinkingResistance: '',
      isCarrier: '',
      isTransport: '',
      criticalRoll: ''
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 2;
  }

  function question(prompt, options) {
    return { prompt, options };
  }

  // Entrada del motor a partir del estado; null mientras falten datos.
  function buildInput() {
    const s = state;
    if (s.hullType === '' || s.isCarrier === '' || s.isTransport === '') return null;
    const input = { hullType: s.hullType, isCarrier: s.isCarrier === 'yes', isTransport: s.isTransport === 'yes' };
    if (s.hullType === 'multi') {
      if (s.fleetSize === '' || Number.isNaN(Number(s.fleetSize))) return null;
      input.fleetSize = Number(s.fleetSize);
      return input;
    }
    if (s.hasDamagedSide === '' || s.alreadyDamaged === '') return null;
    input.hasDamagedSide = s.hasDamagedSide === 'yes';
    input.alreadyDamaged = s.alreadyDamaged === 'yes';
    if (s.hullType === 'single') {
      if (s.isAmphibiousAssault === '' || s.hasShield === '') return null;
      input.isAmphibiousAssault = s.isAmphibiousAssault === 'yes';
      input.hasShield = s.hasShield === 'yes';
      // Solo se necesita (y se pide) cuando realmente habrá verificación crítica.
      input.sinkingResistance = s.sinkingResistance === '' ? undefined : s.sinkingResistance;
      // Sin Resistencia introducida no se pasa la tirada: así el motor sigue pidiéndola
      // (needsCriticalRoll) en vez de rechazar una entrada a medio rellenar.
      input.criticalRoll = (s.criticalRoll === '' || s.sinkingResistance === '') ? undefined : s.criticalRoll;
    }
    return input;
  }

  function resolveSafely() {
    const input = buildInput();
    if (!input) return null;
    try {
      return { result: ShipImpactEffectsEngine.resolveShipImpactEffect(input) };
    } catch (err) {
      return { error: err };
    }
  }

  async function renderShipImpactEffectsWizard() {
    const navToken = Router.currentToken();
    if (!state) state = freshState();
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Efectos del impacto antibuque']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let rules;
    try {
      rules = await loadShipImpactEffects();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Efectos del impacto antibuque sobre una unidad'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §5.9-§5.9.3 (págs. 72-73). Parte de una unidad que ya ha absorbido y sufre 1 punto de daño; la asignación de Puntos de Impacto a buques concretos se hace en los wizards antibuque.'));

    const rerender = () => { renderShipImpactEffectsWizard(); };
    const stepRenderers = [
      () => renderStepUnit(wrap, rules, rerender),
      () => renderStepCritical(wrap, rules, rerender),
      () => renderStepResult(wrap, rules, rerender)
    ];
    stepRenderers[state.step]();

    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Unidad objetivo ----------
  function renderStepUnit(wrap, rules, rerender) {
    const s = state;
    wrap.appendChild(el('h2', null, 'Unidad objetivo'));
    wrap.appendChild(makeTextField('Unidad (opcional)', s.unitLabel, (v) => { s.unitLabel = v; }));

    wrap.appendChild(makeOptionGroup(question('Tipo de casco de la unidad.', rules.hullTypes.map((h) => ({ value: h.id, label: h.label }))), s.hullType, (v) => { s.hullType = v; s.criticalRoll = ''; rerender(); }));
    const hull = rules.hullTypes.find((h) => h.id === s.hullType);
    if (hull) wrap.appendChild(el('p', 'source-refs', rules.rules.find((r) => r.id === hull.ruleId).text));

    if (s.hullType === 'multi') {
      wrap.appendChild(makeNumberField('Barcos que le quedaban a la unidad antes del impacto', s.fleetSize, (v) => { s.fleetSize = v; }, rerender, { visualRef: 'ship-count-before-hit' }));
    } else if (s.hullType !== '') {
      wrap.appendChild(makeOptionGroup(question('¿El reverso de la ficha tiene contenido (lado dañado)?', YES_NO), s.hasDamagedSide, (v) => { s.hasDamagedSide = v; s.criticalRoll = ''; rerender(); }));
      wrap.appendChild(makeOptionGroup(question('¿La unidad ya estaba en su lado dañado antes de este impacto?', YES_NO), s.alreadyDamaged, (v) => { s.alreadyDamaged = v; s.criticalRoll = ''; rerender(); }));
    }
    if (s.hullType === 'single') {
      wrap.appendChild(makeOptionGroup(question('¿Es un Buque de Asalto Anfibio?', YES_NO), s.isAmphibiousAssault, (v) => { s.isAmphibiousAssault = v; s.criticalRoll = ''; rerender(); }));
      wrap.appendChild(makeOptionGroup(question('¿Tiene el símbolo de escudo en su Valor de Protección?', YES_NO), s.hasShield, (v) => { s.hasShield = v; s.criticalRoll = ''; rerender(); }));
    }
    if (s.hullType !== '') {
      wrap.appendChild(makeOptionGroup(question('¿Es una unidad portaeronaves (transporta unidades aéreas o de baja altitud)?', YES_NO), s.isCarrier, (v) => { s.isCarrier = v; rerender(); }));
      wrap.appendChild(makeOptionGroup(question('¿Es una unidad de transporte (convoy, buque de asalto anfibio, flota de desembarco anfibio)?', YES_NO), s.isTransport, (v) => { s.isTransport = v; rerender(); }));
    }

    const isReady = () => buildInput() !== null; // al pulsar, no al dibujar
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!isReady()) { alert('Completa los datos de la unidad (tipo de casco y las preguntas que se muestran).'); return; }
        s.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 2: Verificación por daño crítico (solo si la regla la exige) ----------
  function renderStepCritical(wrap, rules, rerender) {
    const s = state;
    const attempt = resolveSafely();
    wrap.appendChild(el('h2', null, 'Verificación por daño crítico'));

    if (!attempt || attempt.error) {
      wrap.appendChild(el('p', 'pending-note', attempt && attempt.error ? attempt.error.message : 'Faltan datos de la unidad: vuelve al paso anterior.'));
    } else if (!attempt.result.needsCriticalRoll && attempt.result.criticalResult === undefined) {
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', 'Para esta unidad no hay verificación por daño crítico: el resultado ya está determinado por las reglas.'));
      attempt.result.ruleIds.forEach((id) => wrap.appendChild(el('p', 'source-refs', rules.rules.find((r) => r.id === id).text)));
    } else {
      wrap.appendChild(el('p', 'source-refs', rules.rules.find((r) => r.id === 'critical_check').text));
      wrap.appendChild(makeNumberField('Valor de Resistencia al Hundimiento de la unidad (≤N, del reglamento de unidades)', s.sinkingResistance, (v) => { s.sinkingResistance = v; s.criticalRoll = ''; }, rerender, { visualRef: 'ship-sink-value' }));
      wrap.appendChild(makeSelectFromValues('Tirada de daño crítico (1d10)', DIE_VALUES, s.criticalRoll, (v) => { s.criticalRoll = v; rerender(); }));
      wrap.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => {
        s.criticalRoll = String(Math.floor(Math.random() * 10));
        rerender();
      }));
      if (attempt.result.criticalResult) {
        wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Tirada ${s.criticalRoll} ${attempt.result.criticalResult === 'sunk' ? '≤' : '>'} Resistencia ${s.sinkingResistance} → ${attempt.result.criticalResult === 'sunk' ? 'la unidad es hundida inmediatamente' : 'permanece boca arriba en su lado dañado'}.`));
      }
    }

    const done = attempt && attempt.result && attempt.result.outcome !== null;
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 0; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!done) { alert('Introduce la Resistencia al Hundimiento y la tirada de daño crítico.'); return; }
        s.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Resultado ----------
  function renderStepResult(wrap, rules, rerender) {
    const s = state;
    wrap.appendChild(el('h2', null, 'Resultado'));
    const attempt = resolveSafely();
    if (!attempt || attempt.error || attempt.result.outcome === null) {
      wrap.appendChild(el('p', 'pending-note', attempt && attempt.error ? attempt.error.message : 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { s.step = 1; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const r = attempt.result;
    const outcomeLabel = rules.outcomes.find((o) => o.id === r.outcome).label;
    const hullLabel = rules.hullTypes.find((h) => h.id === s.hullType).label;

    const summaryLines = [
      `${s.unitLabel || 'Unidad'}: ${hullLabel}${s.hullType === 'multi' ? `, ${s.fleetSize} barco(s) antes del impacto` : ''}.`
    ];
    if (r.newFleetSize !== undefined) summaryLines.push(`Tamaño de flota: ${s.fleetSize} → ${r.newFleetSize}.`);
    if (r.criticalResult) summaryLines.push(`Verificación por daño crítico: tirada ${r.criticalRoll} frente a Resistencia ${s.sinkingResistance} → ${r.criticalResult === 'sunk' ? 'hundida' : 'sigue dañada'}.`);
    r.ruleIds.forEach((id) => summaryLines.push(rules.rules.find((rule) => rule.id === id).text));

    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${outcomeLabel}`));
    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'source-refs', rules.sourceRefs.map((x) => `${x.document} §${x.section}, págs. ${x.pages}`).join(' · ')));

    const fullSummaryText = ['Efectos del impacto antibuque', ...summaryLines, `Resultado: ${outcomeLabel}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'ship_impact_effects', workflowTitle: 'Efectos del impacto antibuque', summaryText: fullSummaryText, state: s });
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 1; rerender(); }),
      wizardNavButton('Nueva unidad', 'secondary', () => { state = freshState(); rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.ShipImpactEffectsWizard = { render: renderShipImpactEffectsWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
