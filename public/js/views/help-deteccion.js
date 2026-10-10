// Ayuda de Detección (roadmap Fase 3/4), dividida de views/help.js en
// correcciones03.md COR03-006 (2026-09-29). Combina la referencia de solo
// lectura de data/detection/help-sheet.json (transcrito de
// TCW-Hoja-de-Ayuda-Deteccion.pdf) con el resolutor interactivo de la Fase 4
// (llama a public/js/detection-engine.js): dado un caso concreto (distancia,
// firma, terreno, etc.) devuelve sí/no + por qué + qué estado resulta,
// citando la fuente. Cada tipo resuelve exactamente lo que help-sheet.json
// declara como regla comprobable; donde la hoja solo da una regla
// cualitativa se explica esa regla tal cual, sin inventar una distancia o
// umbral que la fuente no da. `loadDetectionHelp` vive en core.js (AppCore)
// porque el buscador (help-search.js) también lo usa.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, renderNotFound, backRow,
    makeNumberField, makeOptionGroup, loadDetectionHelp
  } = AppCore;

  function renderStateCards(states) {
    const list = el('div', 'counter-factor-list');
    states.forEach((s) => {
      const card = el('div', 'counter-factor');
      card.appendChild(el('span', 'counter-factor__label', s.title));
      list.appendChild(card);
      const desc = el('p', 'source-refs', s.description);
      card.appendChild(desc);
    });
    return list;
  }

  function renderRuleRows(rows, detectorKey, ruleKey) {
    const list = el('div', 'counter-factor-list');
    rows.forEach((r) => {
      const card = el('div', 'counter-factor');
      card.appendChild(el('span', 'counter-factor__label', r[detectorKey]));
      card.appendChild(el('p', 'source-refs', r[ruleKey]));
      list.appendChild(card);
    });
    return list;
  }

  async function renderDeteccionHelp() {
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Detección']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let data;
    try {
      data = await loadDetectionHelp();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', data.title));
    wrap.appendChild(el('p', 'turn-view__desc', 'Esta página es la referencia de estados y procedimientos de detección — explica, no calcula.'));
    const resolverCard = el('button', 'help-card help-card--highlight');
    resolverCard.type = 'button';
    resolverCard.appendChild(el('span', 'help-card__title', '🧭 Resolver detección'));
    resolverCard.appendChild(el('span', 'help-card__source', 'Responde sí/no, a qué distancia y por qué, y obtén el estado en que queda la unidad.'));
    resolverCard.addEventListener('click', () => { location.hash = '#/ayuda/deteccion/resolver'; });
    wrap.appendChild(resolverCard);
    (data.footnotes || []).forEach((f) => wrap.appendChild(el('p', 'source-refs', f.text)));

    wrap.appendChild(el('h2', null, data.unitStates.title));
    wrap.appendChild(el('p', 'turn-view__desc', data.unitStates.intro));
    wrap.appendChild(renderStateCards(data.unitStates.states));
    wrap.appendChild(el('p', 'pending-note', data.unitStates.note));

    wrap.appendChild(el('h2', null, 'Estados de exposición'));
    wrap.appendChild(el('p', 'turn-view__desc', data.exposureStates.intro));
    wrap.appendChild(renderStateCards(data.exposureStates.states));

    const air = data.airDetection;
    wrap.appendChild(el('h2', null, air.title));
    wrap.appendChild(el('p', 'turn-view__desc', air.intro));
    wrap.appendChild(el('p', 'turn-view__desc', air.signatureValues.intro));
    wrap.appendChild(renderStateCards([
      { title: 'Valor superior', description: air.signatureValues.superior },
      { title: 'Valor inferior', description: air.signatureValues.inferior }
    ]));
    wrap.appendChild(el('p', 'turn-view__desc', air.lowAltitudeNote));
    wrap.appendChild(el('p', 'source-refs', air.radarModifierNote));
    wrap.appendChild(el('p', 'pending-note', air.radarModifierCaveat));
    wrap.appendChild(el('p', 'turn-view__desc', air.airToAirProcedure));

    const ex = air.workedExample;
    wrap.appendChild(el('h3', 'table-viewer__section-title', ex.title));
    const unitsRow = el('p', 'source-refs', ex.units.map((u) => `${u.label}: firma aérea ${u.airSignature}`).join(' · '));
    wrap.appendChild(unitsRow);
    const casesList = el('div', 'counter-factor-list');
    ex.cases.forEach((c) => {
      const card = el('div', 'counter-factor');
      card.appendChild(el('span', 'counter-factor__label', c.result));
      casesList.appendChild(card);
    });
    wrap.appendChild(casesList);
    wrap.appendChild(el('p', 'source-refs', ex.note));

    wrap.appendChild(el('h3', 'table-viewer__section-title', air.detectedByOthers.intro));
    wrap.appendChild(renderRuleRows(air.detectedByOthers.rows, 'detector', 'rule'));

    const naval = data.navalDetection;
    wrap.appendChild(el('h2', null, naval.title));
    wrap.appendChild(renderRuleRows(naval.detectedBy, 'detector', 'rule'));

    const ground = data.groundDetection;
    wrap.appendChild(el('h2', null, ground.title));
    wrap.appendChild(el('h3', 'table-viewer__section-title', ground.whoCanDetect.question));
    wrap.appendChild(el('p', 'turn-view__desc', ground.whoCanDetect.rule));
    wrap.appendChild(el('p', 'source-refs', `No pueden detectar unidades terrestres: ${ground.whoCanDetect.cannotDetect.map((t) => t.label).join(', ')}.`));

    wrap.appendChild(el('h3', 'table-viewer__section-title', ground.fixedInstallations.question));
    wrap.appendChild(el('p', 'turn-view__desc', ground.fixedInstallations.rule));

    wrap.appendChild(el('h3', 'table-viewer__section-title', ground.mobileUnitDetectability.question));
    wrap.appendChild(renderRuleRows(ground.mobileUnitDetectability.rules, 'unitType', 'condition'));
    wrap.appendChild(el('p', 'source-refs', ground.mobileUnitDetectability.note));

    wrap.appendChild(el('h3', 'table-viewer__section-title', ground.brieflyDetectableTriggers.question));
    wrap.appendChild(el('p', 'turn-view__desc', ground.brieflyDetectableTriggers.rule));
    const triggersRow = el('div', 'ammo-icon-row');
    ground.brieflyDetectableTriggers.actions.forEach((a) => triggersRow.appendChild(el('span', 'ammo-icon-chip__label', a.label)));
    wrap.appendChild(triggersRow);
    wrap.appendChild(el('p', 'pending-note', ground.brieflyDetectableTriggers.consequence));

    const elec = data.electronicDetection;
    wrap.appendChild(el('h2', null, elec.title));
    wrap.appendChild(el('p', 'turn-view__desc', elec.rule));
    wrap.appendChild(el('p', 'pending-note', elec.consequence));
    if (elec.detectorTypes) {
      wrap.appendChild(el('h3', 'table-viewer__section-title', 'Tipos de detector'));
      wrap.appendChild(renderRuleRows(elec.detectorTypes.types, 'label', 'capability'));
    }
    if (elec.targetTypes) {
      wrap.appendChild(el('h3', 'table-viewer__section-title', 'Objetivos ("unidades de radar")'));
      const targetsRow = el('div', 'ammo-icon-row');
      elec.targetTypes.types.forEach((t) => targetsRow.appendChild(el('span', 'ammo-icon-chip__label', t.label + (t.needsReview ? ' (pendiente de validar)' : ''))));
      wrap.appendChild(targetsRow);
    }
    if (elec.armException) wrap.appendChild(el('p', 'pending-note', `⚠ ${elec.armException.rule}`));

    const matrix = data.summaryMatrix;
    wrap.appendChild(el('h2', null, matrix.title));
    const gridWrap = el('div', 'table-viewer__grid-wrap');
    const table = document.createElement('table');
    table.className = 'table-viewer__grid';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.appendChild(el('th', null, `${matrix.rowAxis.label} \\ ${matrix.columnAxis.label}`));
    matrix.columnAxis.values.forEach((v) => headRow.appendChild(el('th', null, matrix.labels[v])));
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    matrix.rowAxis.values.forEach((rv, ri) => {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = matrix.labels[rv];
      row.appendChild(th);
      matrix.cells[ri].forEach((cellText) => row.appendChild(el('td', null, cellText)));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    gridWrap.appendChild(table);
    wrap.appendChild(gridWrap);

    wrap.appendChild(el('p', 'source-refs', data.sourceRefs.map((s) => `${s.document}${s.pages ? `, págs. ${s.pages}` : ''}`).join(' · ')));
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  // ---------- Resolver de detección interactivo (roadmap Fase 4) ----------

  const DETECTION_RESOLVER_TYPES = [
    { id: 'air-to-air', title: 'Aire-aire', description: 'Exposición mutua entre dos unidades aéreas, según distancia y firma aérea.' },
    { id: 'surface-vs-air', title: 'Naval contra aérea', description: 'Si una unidad de superficie expone a una unidad aérea o de baja altitud.' },
    { id: 'naval-detector-eligibility', title: '¿Quién puede detectar unidades navales?', description: 'Qué tipos de unidad pueden exponer a un buque, y bajo qué condición.' },
    { id: 'ground-mobile', title: 'Detectabilidad terrestre móvil', description: 'Si una unidad terrestre móvil (principal o técnica) queda detectable u oculta.' },
    { id: 'briefly-detectable', title: 'Brevemente detectable', description: 'Si una acción concreta expone temporalmente a una unidad oculta.' },
    { id: 'fixed-installation', title: 'Instalación fija', description: 'Las instalaciones fijas siempre están expuestas.' },
    { id: 'ground-detector-eligibility', title: '¿Quién puede detectar terrestres?', description: 'Qué tipos de unidad tienen capacidad de detección terrestre.' },
    { id: 'electronic', title: 'Detección electrónica', description: 'Unidad con capacidad EW contra unidad de radar.' }
  ];

  const detectionResolverState = {};
  function getDetectionState(typeId, defaults) {
    if (!detectionResolverState[typeId]) detectionResolverState[typeId] = Object.assign({}, defaults);
    return detectionResolverState[typeId];
  }

  function renderDetectionResultBox(container, { verdictLabel, reason, sourceRefs, extra }) {
    const box = el('div', 'wizard-modifier-summary');
    box.appendChild(el('span', 'wizard-modifier-summary__total', verdictLabel));
    box.appendChild(el('p', 'turn-view__desc', reason));
    (extra || []).forEach((line) => box.appendChild(el('p', 'source-refs', line)));
    if (sourceRefs && sourceRefs.length) {
      box.appendChild(el('p', 'source-refs', sourceRefs.map((s) => `${s.document}${s.page ? `, pág. ${s.page}` : ''}${s.pages ? `, págs. ${s.pages}` : ''}`).join(' · ')));
    }
    container.appendChild(box);
  }

  function renderDetectionResolverIndex() {
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Detección', 'Resolver detección']);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', 'Resolver detección'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Elige el tipo de detección a resolver. Cada uno pide solo los datos que la regla necesita y explica el resultado citando la fuente.'));
    const list = el('div', 'help-list');
    DETECTION_RESOLVER_TYPES.forEach((t) => {
      const card = el('button', 'help-card');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', t.title));
      card.appendChild(el('span', 'help-card__source', t.description));
      card.addEventListener('click', () => { location.hash = `#/ayuda/deteccion/resolver/${t.id}`; });
      list.appendChild(card);
    });
    wrap.appendChild(list);
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  // correcciones.02.md COR02-006: los resolutores que dependen de un valor o
  // lista fija (alcance de baja altitud, multiplicador de terreno, acciones
  // de "brevemente detectable", tipos de detector terrestre/naval) necesitan
  // data/detection/help-sheet.json ya cargado — de ahí que esta pantalla,
  // antes síncrona, pase a cargar los datos primero (mismo patrón que
  // renderDeteccionHelp/renderSecuenciaHelp: Router.currentToken()/isCurrent
  // evita una carrera si el usuario navega antes de que termine de cargar).
  async function renderDetectionResolverDetail(typeId) {
    const type = DETECTION_RESOLVER_TYPES.find((t) => t.id === typeId);
    if (!type) { renderNotFound(`Tipo de detección «${typeId}» no encontrado`); return; }
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Detección', 'Resolver detección', type.title]);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let data;
    try {
      data = await loadDetectionHelp();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', type.title));
    wrap.appendChild(el('p', 'turn-view__desc', type.description));

    const rerender = () => renderDetectionResolverDetail(typeId);
    const renderers = {
      'air-to-air': renderDetectionAirToAir,
      'surface-vs-air': renderDetectionSurfaceVsAir,
      'naval-detector-eligibility': renderDetectionNavalDetectorEligibility,
      'ground-mobile': renderDetectionGroundMobile,
      'briefly-detectable': renderDetectionBrieflyDetectable,
      'fixed-installation': renderDetectionFixedInstallation,
      'ground-detector-eligibility': renderDetectionGroundDetectorEligibility,
      'electronic': renderDetectionElectronic
    };
    renderers[typeId](wrap, rerender, data);

    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  function renderDetectionAirToAir(wrap, rerender) {
    const s = getDetectionState('air-to-air', { hexDistance: '3', sigA: '3', sigB: '5' });
    wrap.appendChild(makeNumberField('Distancia entre las dos unidades (hexágonos)', s.hexDistance, (v) => { s.hexDistance = v; }, rerender));
    wrap.appendChild(makeNumberField('Firma aérea de la unidad A', s.sigA, (v) => { s.sigA = v; }, rerender));
    wrap.appendChild(makeNumberField('Firma aérea de la unidad B', s.sigB, (v) => { s.sigB = v; }, rerender));
    const hexDistance = Number(s.hexDistance);
    const sigA = Number(s.sigA);
    const sigB = Number(s.sigB);
    if (!Number.isFinite(hexDistance) || !Number.isFinite(sigA) || !Number.isFinite(sigB)) return;
    const r = DetectionEngine.resolveAirToAirMutualExposure({ hexDistance, unitA: { airSignature: sigA }, unitB: { airSignature: sigB } });
    const verdict = { mutual: 'Exposición mutua', 'one-way': 'Exposición en un solo sentido', none: 'Ninguna se expone' }[r.outcome];
    renderDetectionResultBox(wrap, {
      verdictLabel: verdict,
      reason: `A → B: ${r.aExposesB.reason}`,
      extra: [`B → A: ${r.bExposesA.reason}`],
      sourceRefs: r.sourceRefs
    });
  }

  function renderDetectionSurfaceVsAir(wrap, rerender, data) {
    const s = getDetectionState('surface-vs-air', { hexDistance: '3', lowAltitude: 'no', groundSignature: '4' });
    wrap.appendChild(makeNumberField('Distancia (hexágonos)', s.hexDistance, (v) => { s.hexDistance = v; }, rerender));
    wrap.appendChild(makeOptionGroup({ prompt: '¿El objetivo es una unidad de baja altitud?', options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] }, s.lowAltitude, (v) => { s.lowAltitude = v; rerender(); }));
    if (s.lowAltitude === 'no') {
      wrap.appendChild(makeNumberField('Firma terrestre (valor inferior) del objetivo', s.groundSignature, (v) => { s.groundSignature = v; }, rerender));
    }
    const hexDistance = Number(s.hexDistance);
    if (!Number.isFinite(hexDistance)) return;
    const targetIsLowAltitude = s.lowAltitude === 'si';
    const groundSignature = Number(s.groundSignature);
    if (!targetIsLowAltitude && !Number.isFinite(groundSignature)) return;
    const r = DetectionEngine.resolveSurfaceDetectsAir({ hexDistance, targetIsLowAltitude, targetGroundSignature: groundSignature, lowAltitudeFixedRangeHex: data.airDetection.lowAltitudeFixedRangeHex });
    renderDetectionResultBox(wrap, {
      verdictLabel: r.exposed ? 'Expuesta' : 'No expuesta',
      reason: r.reason,
      sourceRefs: r.sourceRefs
    });
  }

  function renderDetectionGroundMobile(wrap, rerender, data) {
    const s = getDetectionState('ground-mobile', { unitType: 'main', terrainValue: '1', count: '5' });
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué tipo de unidad?', options: [{ value: 'main', label: 'Unidad principal' }, { value: 'technical', label: 'Unidad técnica' }] }, s.unitType, (v) => { s.unitType = v; rerender(); }));
    wrap.appendChild(makeNumberField('Valor de Terreno del hexágono', s.terrainValue, (v) => { s.terrainValue = v; }, rerender));
    wrap.appendChild(makeNumberField(s.unitType === 'technical' ? 'Número de unidades técnicas' : 'Fuerza de la unidad', s.count, (v) => { s.count = v; }, rerender));
    const terrainValue = Number(s.terrainValue);
    const count = Number(s.count);
    if (!Number.isFinite(terrainValue) || !Number.isFinite(count)) return;
    const r = DetectionEngine.resolveGroundMobileDetectability({ unitType: s.unitType, terrainValue, strengthOrTechnicalCount: count, terrainMultiplier: data.groundDetection.mobileUnitDetectability.terrainMultiplier });
    renderDetectionResultBox(wrap, {
      verdictLabel: r.detectable ? 'Detectable' : 'Oculta',
      reason: r.reason,
      sourceRefs: r.sourceRefs
    });
  }

  function renderDetectionBrieflyDetectable(wrap, rerender, data) {
    const s = getDetectionState('briefly-detectable', { action: 'movement' });
    const actions = data.groundDetection.brieflyDetectableTriggers.actions;
    const options = actions.map((a) => ({ value: a.id, label: a.label }));
    options.push({ value: 'other', label: 'Otra acción' });
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué acción realiza la unidad oculta?', options }, s.action, (v) => { s.action = v; rerender(); }));
    const r = DetectionEngine.resolveBrieflyDetectable({ action: s.action, actions });
    renderDetectionResultBox(wrap, {
      verdictLabel: r.triggers ? 'Brevemente detectable' : 'Sigue oculta',
      reason: r.reason,
      sourceRefs: r.sourceRefs
    });
  }

  function renderDetectionFixedInstallation(wrap) {
    const r = DetectionEngine.resolveFixedInstallationExposure();
    renderDetectionResultBox(wrap, {
      verdictLabel: 'Siempre expuesta',
      reason: r.reason,
      sourceRefs: r.sourceRefs
    });
  }

  function renderDetectionGroundDetectorEligibility(wrap, rerender, data) {
    const s = getDetectionState('ground-detector-eligibility', { detectorType: 'air-isr' });
    const whoCanDetect = data.groundDetection.whoCanDetect;
    const options = whoCanDetect.capableTypes
      .map((t) => ({ value: t.id, label: t.label }))
      .concat(whoCanDetect.cannotDetect.map((t) => ({ value: t.id, label: t.label })));
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué tipo de unidad intenta detectar?', options }, s.detectorType, (v) => { s.detectorType = v; rerender(); }));
    const r = DetectionEngine.resolveGroundDetectorEligibility({ detectorType: s.detectorType, capableTypes: whoCanDetect.capableTypes, incapableTypes: whoCanDetect.cannotDetect });
    renderDetectionResultBox(wrap, {
      verdictLabel: r.capable ? 'Puede detectar unidades terrestres' : 'No puede detectar unidades terrestres',
      reason: r.reason,
      sourceRefs: r.sourceRefs
    });
  }

  function renderDetectionNavalDetectorEligibility(wrap, rerender, data) {
    const s = getDetectionState('naval-detector-eligibility', { detectorType: 'surface', conditionMet: 'si' });
    const rules = data.navalDetection.detectedBy;
    const options = rules.map((r) => ({ value: r.id, label: r.detector }));
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué tipo de unidad intenta detectar al buque?', options }, s.detectorType, (v) => { s.detectorType = v; rerender(); }));
    const currentRule = rules.find((r) => r.id === s.detectorType);
    if (!currentRule.alwaysCapable) {
      wrap.appendChild(makeOptionGroup({ prompt: `¿${currentRule.conditionLabel}?`, options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] }, s.conditionMet, (v) => { s.conditionMet = v; rerender(); }));
    }
    const r = DetectionEngine.resolveNavalDetectorEligibility({ detectorType: s.detectorType, conditionMet: s.conditionMet === 'si', rules });
    renderDetectionResultBox(wrap, {
      verdictLabel: r.capable ? 'Puede detectar a la unidad naval' : 'No puede detectar a la unidad naval',
      reason: r.reason,
      sourceRefs: r.sourceRefs
    });
  }

  function renderDetectionElectronic(wrap, rerender) {
    const s = getDetectionState('electronic', { hasEw: 'si', targetHasRadar: 'si', targetIsSurfaceUnit: 'no' });
    wrap.appendChild(makeOptionGroup({ prompt: '¿La unidad detectora tiene capacidad EW?', options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] }, s.hasEw, (v) => { s.hasEw = v; rerender(); }));
    wrap.appendChild(makeOptionGroup({ prompt: '¿El objetivo es una unidad de radar?', options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] }, s.targetHasRadar, (v) => { s.targetHasRadar = v; rerender(); }));
    wrap.appendChild(makeOptionGroup({ prompt: '¿El objetivo es un buque de superficie?', options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] }, s.targetIsSurfaceUnit, (v) => { s.targetIsSurfaceUnit = v; rerender(); }));
    const r = DetectionEngine.resolveElectronicDetection({ attackerHasEwCapability: s.hasEw === 'si', targetHasRadar: s.targetHasRadar === 'si', targetIsSurfaceUnit: s.targetIsSurfaceUnit === 'si' });
    renderDetectionResultBox(wrap, {
      verdictLabel: r.exposed ? 'Expuesta electrónicamente' : 'No expuesta',
      reason: r.reason,
      extra: [r.exposed ? `Elegible para ataque antirradiación: ${r.armEligible ? 'sí' : 'no'}.` : null].filter(Boolean),
      sourceRefs: r.sourceRefs
    });
  }

  root.Views = root.Views || {};
  root.Views.HelpDeteccion = { renderDeteccionHelp, renderDetectionResolverIndex, renderDetectionResolverDetail };
})(typeof window !== 'undefined' ? window : globalThis);
