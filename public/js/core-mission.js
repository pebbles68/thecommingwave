// Bloque «Misión del ataque» de los wizards que parten de una misión aérea
// (ajuste AJ-002). Muestra la tarjeta de misión (derivada de
// data/missions/air-missions.json vía MissionContextEngine) y guarda en
// `state.missionContext` la misión elegida, que otras preguntas del wizard
// usan para no volver a preguntar lo que la misión ya fija (Área/Punto).
//
// No se fuerza en ataques que no proceden de una misión aérea: hay una opción
// «No procede de una misión aérea». Si el wizard se abre desde una fase del
// turno donde ya se confirmó una misión, se hereda como contexto confirmado.
(function (root) {
  'use strict';

  const { el, makeOptionGroup, makeNumberField, makeTraceNote } = AppWidgets;
  const Engine = MissionContextEngine;

  function freshMissionContext() {
    return { missionId: '', areaMission: '', source: 'manual' };
  }

  // Fase del turno desde la que se abrió el wizard (si la hay).
  function currentPhaseId() {
    const ctx = AppCore.getLastTurnContext();
    return ctx ? ctx.phaseId : null;
  }

  // Si la fase del turno restringe la misión a una sola (p.ej. ON CALL fuera de
  // la Fase de acciones aéreas), se preselecciona mientras no se haya elegido.
  function presetMissionIfAny(state, data, listOpts) {
    if (state.missionContext.missionId) return;
    const preset = Engine.presetMissionForPhase(data, currentPhaseId(), listOpts);
    if (preset) state.missionContext = Engine.buildContext(data, preset, 'phase');
  }

  function cardRow(box, label, value) {
    if (!value) return;
    const p = el('p', 'turn-view__desc');
    p.appendChild(el('strong', null, `${label}: `));
    p.appendChild(document.createTextNode(value));
    box.appendChild(p);
  }

  function renderMissionCard(box, card) {
    box.appendChild(el('h3', null, card.title));
    cardRow(box, 'Categoría', card.category);
    cardRow(box, 'Duración', card.duration);
    cardRow(box, 'Tipo de misión', card.missionType);
    cardRow(box, 'Zona Central', card.centralZone);
    cardRow(box, 'Alcance permitido', card.ranges.join(' · '));
    cardRow(box, 'Distancia corta', card.shortRangeNote);
    cardRow(box, 'Coste de mando', card.commandCost === null ? null : `${card.commandCost} Punto(s) de Mando`);
    if (card.requirements.length) cardRow(box, 'Requisitos', card.requirements.join('; '));
    if (card.description) box.appendChild(el('p', 'source-refs', card.description));
    box.appendChild(makeTraceNote(card.sourceRefs.join(' · ')));
  }

  // Dibuja el bloque. `onChange` se llama tras cambiar la misión (el wizard
  // invalida entonces sus respuestas dependientes y re-renderiza).
  // `opts.surfaceOrGround`: wizards contra buques o terrestres (sin misiones aire-aire).
  function renderMissionContext(wrap, state, data, rerender, onChange, opts) {
    const baseOpts = opts || { surfaceOrGround: true };
    const listOpts = { ...baseOpts, phaseId: currentPhaseId() };
    if (!state.missionContext) state.missionContext = freshMissionContext();
    presetMissionIfAny(state, data, baseOpts);
    const ctx = state.missionContext;

    const box = el('div', 'help-card help-card--highlight mission-context');
    box.appendChild(el('h2', null, 'Misión del ataque'));
    const restriction = Engine.restrictionForPhase(data, listOpts.phaseId);
    if (restriction) {
      box.appendChild(el('p', 'turn-view__desc', `En esta fase del turno la única misión aérea que se resuelve es ${restriction.onlyMissionIds.map((id) => { const m = Engine.findMission(data, id); return m ? m.name + (m.abbreviation ? ' (' + m.abbreviation + ')' : '') : id; }).join(' o ')}. Si el ataque no es aéreo (artillería, buques…), elige la última opción.`));
      box.appendChild(makeTraceNote(`${restriction.note} ${restriction.source}.`));
    }
    const options = Engine.listMissions(data, listOpts).map((m) => ({ value: m.id, label: `${m.name}${m.abbreviation ? ` (${m.abbreviation})` : ''}` }));
    options.push({ value: Engine.NONE, label: 'No procede de una misión aérea (artillería, ataque naval o submarino)' });
    box.appendChild(makeOptionGroup(
      { id: 'attack_mission', prompt: '¿Qué misión aérea ejecuta el grupo que ataca?', options },
      ctx.missionId,
      (v) => {
        state.missionContext = Engine.buildContext(data, v, 'manual');
        if (onChange) onChange(state.missionContext);
        rerender();
      }
    ));
    const card = ctx.missionId && ctx.missionId !== Engine.NONE ? Engine.buildCard(data, ctx.missionId) : null;
    if (card) renderMissionCard(box, card);
    else if (ctx.missionId === Engine.NONE) box.appendChild(el('p', 'turn-view__desc', 'Sin misión aérea: las preguntas que dependen del tipo de misión se harán aparte.'));
    wrap.appendChild(box);
  }

  // Pregunta «¿La distancia de ataque es 1 (o 2 en Misión de Área)?» (páginas 4, 8, 12 y 20):
  // en vez de pedir el sí/no ya combinado, se pide la distancia de ataque en
  // hexágonos y se deriva la restricción con el tipo de misión (Área/Punto).
  // Solo si la distancia es 2 y la misión no es conocida se pregunta si es de
  // Área. `holder[distanceKey]` guarda la distancia; `answers` recibe la
  // respuesta derivada (`short_range_restriction`).
  function renderShortRangeRestriction(wrap, question, answers, holder, distanceKey, missionContext, rerender) {
    wrap.appendChild(el('p', 'wizard-question__prompt', question.prompt));
    wrap.appendChild(makeNumberField('Distancia de ataque (hexágonos)', holder[distanceKey], (v) => { holder[distanceKey] = v; }, rerender));
    const missionArea = missionContext && missionContext.areaMission;
    const areaAnswer = missionArea || answers.short_range_restriction_area_mission;
    const derived = CombatWizardEngine.deriveShortRangeRestriction(holder[distanceKey], areaAnswer);
    if (derived !== null) {
      answers[question.id] = derived;
      const viaMission = missionArea && Number(holder[distanceKey]) === 2 ? ` y de la misión elegida (${missionArea === 'yes' ? 'Misión de Área' : 'Misión de Punto'})` : '';
      wrap.appendChild(el('p', 'source-refs', `Derivado de la distancia de ataque (${holder[distanceKey]} hex.)${viaMission}: ${derived === 'yes' ? 'Sí' : 'No'}.`));
      return;
    }
    delete answers[question.id];
    if (holder[distanceKey] === '' || holder[distanceKey] === undefined) {
      wrap.appendChild(el('p', 'source-refs', 'Introduce la distancia de ataque: con distancia 1 la restricción siempre aplica y con más de 2 nunca; solo con distancia 2 depende de si la misión es de Área.'));
    } else {
      wrap.appendChild(el('p', 'source-refs', `Distancia de ataque: ${holder[distanceKey]} hex. — con esta distancia, la restricción depende de si es Misión de Área.`));
      wrap.appendChild(makeOptionGroup(
        { id: 'short_range_restriction_area_mission', prompt: '¿Es Misión de Área?', options: [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }] },
        answers.short_range_restriction_area_mission,
        (v) => { answers.short_range_restriction_area_mission = v; rerender(); }
      ));
    }
  }

  // Banda de distancia del modificador de intensidad (páginas 5 y 8): en vez de
  // pedir el valor combinado «distancia // Misión de Área», se pide la distancia
  // (contada desde el hexágono propio) y se usa la misión. Devuelve '0' | '1' |
  // '2plus' o null si aún faltan datos.
  function renderDistanceBand(wrap, rule, holder, distanceKey, missionContext, areaAnswers, rerender) {
    if (rule) {
      wrap.appendChild(el('p', 'source-refs', rule.text));
      wrap.appendChild(makeTraceNote(rule.sourceRefs.map((r) => `${r.section}, p. ${r.pages}`).join(' · ')));
    }
    wrap.appendChild(makeNumberField('Distancia de ataque (hexágonos, contada desde el hexágono que ocupas)', holder[distanceKey], (v) => { holder[distanceKey] = v; }, rerender));
    const missionArea = missionContext && missionContext.areaMission;
    const areaAnswer = missionArea || areaAnswers.short_range_restriction_area_mission;
    if (!missionArea && holder[distanceKey] !== '' && holder[distanceKey] !== undefined) {
      wrap.appendChild(makeOptionGroup(
        { id: 'short_range_restriction_area_mission', prompt: '¿Es Misión de Área?', options: [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }] },
        areaAnswers.short_range_restriction_area_mission,
        (v) => { areaAnswers.short_range_restriction_area_mission = v; rerender(); }
      ));
    }
    const band = GroundGuidedAttackEngine.distanceBand(holder[distanceKey], areaAnswer);
    if (band !== null) {
      const label = { '0': '0 / Área ≤1', '1': '1 / Área ≤2', '2plus': '≥2 / Área ≥3' }[band];
      const viaMission = areaAnswer === 'yes' ? ' (Misión de Área: se cuenta hasta un hexágono adyacente al de destino)' : '';
      wrap.appendChild(el('p', 'wizard-modifier-summary__total', `Banda de distancia: ${label}${viaMission}.`));
    }
    return band;
  }

  root.AppMission = { freshMissionContext, renderMissionContext, renderShortRangeRestriction, renderDistanceBand };
})(typeof window !== 'undefined' ? window : globalThis);
