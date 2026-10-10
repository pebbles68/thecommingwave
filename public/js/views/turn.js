// Vistas del turno guiado sobre el modelo canónico (ajustes_de_turno.md, Fase 23).
// Una banda de dos días: Fase 0 (Estrategia, una vez) y seis fases de campaña, tres por
// día (mañana, tarde, noche); cada fase tiene sus segmentos (Aire I, Superficie, Aire II,
// Tierra cuando corresponde, Submarino). Todas las pantallas se pueden abrir directamente
// y ninguna marca (terminado, omitido, visitado) exige otra: el orden de la hoja es solo
// una recomendación. Depende de public/js/core.js (AppCore) y de TurnModel/TurnProgressEngine.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, renderNotFound, loadTurnTemplate,
    loadProgress, pushHistory, markNodeFinished, markNodeSkipped, reopenNode, markNodeVisited, dismissNotice,
    resetAllActuada, loadWorkflowsIndex,
    renderPhaseImageGallery, SUBPHASE_IMAGE_GALLERIES,
    changeBand
  } = AppCore;
  const Model = TurnModel;
  const Engine = TurnProgressEngine;

  const STATE_TEXT = { completed: '✓ Terminada', skipped: '— Omitida', visited: 'Visitada', 'not-started': '' };

  function stateText(progress, nodeId, suggestedId) {
    const text = STATE_TEXT[Engine.getNodeState(progress, nodeId)];
    if (text) return text;
    return suggestedId === nodeId ? '→ Siguiente sugerida' : '';
  }

  // Línea de Tierra de una fase; el Nivel de Reacción es una mención que abre la ficha con la letra resaltada (TUR-004).
  function appendGroundLevelsLine(wrap, data, impulse) {
    if (!impulse.groundReactionLevels) { wrap.appendChild(el('p', 'phase-view__desc', 'Sin segmento terrestre en esta fase.')); return; }
    const ref = data.band.groundReactionRef;
    AppVisualHelp.renderTextWithRefs(wrap, `Tierra: pueden activarse las unidades con [[${ref.id}]] ${impulse.groundReactionLevels.join(', ')}.`, [ref], 'phase-view__desc');
  }

  // Texto con menciones a entidades visuales (marcadores [[id]] y lista entityRefs): cada mención abre el panel lateral.
  function helpParagraph(wrap, text, refs, className) {
    if (refs && refs.length && text.includes('[[')) AppVisualHelp.renderTextWithRefs(wrap, text, refs, className);
    else wrap.appendChild(el('p', className, text));
  }

  function backRow(extra) {
    const row = el('div', 'action-row');
    const backBtn = el('button', 'btn btn--secondary', '← Volver');
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => { history.back(); });
    row.appendChild(backBtn);
    if (extra) extra.forEach((b) => row.appendChild(b));
    return row;
  }

  const SOURCE_STATUS = { verified: 'Verificado', needs_review: 'Pendiente de revisión' };

  // Trazabilidad secundaria (TUR-007): documento, página o sección, estado y nota de discrepancia de cada fuente,
  // en un bloque plegable para no estorbar la lectura. Cada nivel (día, fase, segmento, subfase) muestra las suyas.
  function sourceDetails(...groups) {
    const refs = groups.flat().filter(Boolean);
    if (!refs.length) return null;
    const details = el('details', 'trace-note source-details');
    details.appendChild(el('summary', null, 'Fuentes y trazabilidad'));
    const list = el('ul', 'source-details__list');
    refs.forEach((r) => {
      const where = [r.section, r.page ? `pág. ${r.page}` : ''].filter(Boolean).join(', ');
      const li = el('li');
      li.appendChild(el('span', 'source-details__doc', r.document || r.doc));
      if (where) li.appendChild(document.createTextNode(` — ${where}`));
      li.appendChild(el('span', `source-details__status is-${r.status || 'needs_review'}`, ` · ${SOURCE_STATUS[r.status] || SOURCE_STATUS.needs_review}`));
      if (r.note) li.appendChild(el('p', 'source-details__note', r.note));
      list.appendChild(li);
    });
    details.appendChild(list);
    return details;
  }

  // Marca de contexto del turno que usan los wizards (borradores y resoluciones por nodo).
  function setTurnContext(ctx) {
    AppCore.setLastTurnContext({ band: loadProgress().currentBand, ...ctx, resolutionNodeId: ctx.subNodeId || ctx.nodeId });
  }

  // Resoluciones activas (wizards abiertos desde este nodo y todavía sin guardar) con acceso directo.
  function appendPendingResolutionCards(wrap, resolutions, rerender, ctxFor) {
    resolutions.forEach((resolution) => {
      const box = el('div', 'help-card help-card--highlight');
      box.appendChild(el('span', 'help-card__title', `⏳ Resolución activa: ${resolution.label}`));
      box.appendChild(el('span', 'help-card__source', 'Iniciada desde aquí y todavía sin guardar. Puedes retomarla o cancelarla.'));
      const actionsRow = el('div', 'action-row');
      const resumeBtn = el('button', 'btn btn--secondary', '↩ Volver a la resolución');
      resumeBtn.type = 'button';
      resumeBtn.addEventListener('click', () => {
        // El wizard recupera su borrador por el nodo exacto en que se inició.
        AppCore.setLastTurnContext(resolution.nodeId ? ctxFor(resolution) : null);
        location.hash = AppCore.WORKFLOW_WIZARD_HASHES[resolution.type] || '#/';
      });
      actionsRow.appendChild(resumeBtn);
      const cancelBtn = el('button', 'btn btn--secondary', '✕ Cancelar resolución');
      cancelBtn.type = 'button';
      cancelBtn.addEventListener('click', () => {
        if (!confirm(`¿Cancelar la resolución «${resolution.label}»? Se perderá su progreso sin guardar.`)) return;
        AppCore.removePendingResolution(resolution.id);
        pushHistory({ type: 'navigation', view: 'resolution-cancel', id: resolution.id, resolutionType: resolution.type, nodeId: resolution.nodeId, reason: 'cancelada desde el turno' });
        rerender();
      });
      actionsRow.appendChild(cancelBtn);
      box.appendChild(actionsRow);
      wrap.appendChild(box);
    });
  }

  // ---------- Índice: banda de dos días ----------

  async function renderTurnIndex() {
    const navToken = Router.currentToken();
    AppCore.clearLastTurnContext();
    setBreadcrumb(['TCW Assistant', 'Turno guiado']);
    viewRoot.innerHTML = '<p class="loading">Cargando plantilla de turno…</p>';
    const data = await loadTurnTemplate();
    if (!Router.isCurrent(navToken)) return;
    const bands = data.sheet.dayBands.bands;
    const progress = loadProgress();
    const band = bands.find((b) => b.index === progress.currentBand) || bands[0];
    const suggested = Engine.getSuggestedNodeId(data, progress);

    viewRoot.innerHTML = '';
    const wrap = el('div', 'turn-view');
    wrap.appendChild(el('h1', 'turn-view__title', data.title));
    wrap.appendChild(el('p', 'turn-view__desc', data.summary));
    wrap.appendChild(el('p', 'turn-view__desc', data.help));

    // Avisos de una sola vez (migración) y resoluciones heredadas que no se descartan.
    Engine.listNotices(progress).forEach((notice) => {
      const box = el('div', 'help-card help-card--highlight');
      box.appendChild(el('span', 'help-card__title', 'ℹ Cambio en el seguimiento del turno'));
      box.appendChild(el('span', 'help-card__source', notice.text));
      const ok = el('button', 'btn btn--secondary', 'Entendido');
      ok.type = 'button';
      ok.addEventListener('click', () => { dismissNotice(notice.id); renderTurnIndex(); });
      box.appendChild(ok);
      wrap.appendChild(box);
    });
    const legacyResolutions = Engine.listLegacyPendingResolutions(progress);
    if (legacyResolutions.length) {
      wrap.appendChild(el('p', 'turn-view__desc', 'Resoluciones activas heredadas del seguimiento anterior (no están ligadas a ninguna de las fases nuevas):'));
      appendPendingResolutionCards(wrap, legacyResolutions, renderTurnIndex, () => null);
    }

    const bandBox = el('div', 'action-row');
    const prevBandBtn = el('button', 'btn btn--secondary', '← Banda anterior');
    prevBandBtn.type = 'button';
    prevBandBtn.disabled = band.index <= 1;
    prevBandBtn.addEventListener('click', () => { changeBand(-1, bands.length); renderTurnIndex(); });
    bandBox.appendChild(prevBandBtn);
    bandBox.appendChild(el('span', 'turn-view__desc', `Banda ${band.index} de ${bands.length} (${band.label}) — dos días, seis fases${band.strategicPhaseHighlight ? ' — destacada en la hoja física' : ''}`));
    const nextBandBtn = el('button', 'btn btn--secondary', 'Siguiente banda →');
    nextBandBtn.type = 'button';
    nextBandBtn.disabled = band.index >= bands.length;
    nextBandBtn.addEventListener('click', () => { changeBand(1, bands.length); renderTurnIndex(); });
    bandBox.appendChild(nextBandBtn);
    wrap.appendChild(bandBox);
    const bandRefLink = el('button', 'btn btn--secondary', 'Ver referencia completa de secuencia de turno');
    bandRefLink.type = 'button';
    bandRefLink.addEventListener('click', () => { location.hash = '#/ayuda/secuencia'; });
    wrap.appendChild(bandRefLink);
    const rosterLink = el('button', 'btn btn--secondary', 'Plantilla de fuerzas');
    rosterLink.type = 'button';
    rosterLink.addEventListener('click', () => { location.hash = '#/unidades'; });
    wrap.appendChild(rosterLink);

    const list = el('div', 'phase-list');
    const strategicCard = el('button', 'phase-card');
    strategicCard.type = 'button';
    strategicCard.appendChild(el('span', 'phase-card__title', `${data.band.strategic.title} (una vez por banda)`));
    strategicCard.appendChild(el('span', 'phase-card__count', stateText(progress, Model.STRATEGIC_ID, suggested) || `${data.band.strategic.phases.length} pasos`));
    strategicCard.addEventListener('click', () => { location.hash = '#/turno/fase/0'; });
    list.appendChild(strategicCard);
    wrap.appendChild(list);

    Model.listDays(data).forEach((day, dayIdx) => {
      const realDay = (band.index - 1) * data.band.durationDays + dayIdx + 1;
      const head = el('div', 'action-row');
      head.appendChild(el('h2', 'table-viewer__section-title', `Día ${realDay} (${day.title.toLowerCase()})`));
      const dayState = Engine.getNodeState(progress, day.id);
      if (dayState === 'completed') head.appendChild(el('span', 'phase-card__count', '✓ Día terminado'));
      const dayBtn = el('button', 'btn btn--secondary', dayState === 'completed' ? 'Reabrir día' : 'Terminar día');
      dayBtn.type = 'button';
      dayBtn.addEventListener('click', () => {
        if (dayState === 'completed') reopenNode(day.id); else markNodeFinished(day.id);
        pushHistory({ type: dayState === 'completed' ? 'navigation' : 'finish', view: 'day', id: day.id, band: progress.currentBand });
        renderTurnIndex();
      });
      head.appendChild(dayBtn);
      wrap.appendChild(head);

      const dayList = el('div', 'phase-list');
      const crNode = Model.commandRecoveryNodeId(day.id);
      const crCard = el('button', 'phase-card');
      crCard.type = 'button';
      crCard.appendChild(el('span', 'phase-card__title', 'Recuperación de Mando (antes del día)'));
      crCard.appendChild(el('span', 'phase-card__count', STATE_TEXT[Engine.getNodeState(progress, crNode)] || 'ayuda consultable'));
      crCard.addEventListener('click', () => { location.hash = `#/turno/mando/${day.id}`; });
      dayList.appendChild(crCard);
      day.impulses.forEach((impulseId) => {
        const impulse = Model.getImpulse(data, impulseId);
        const card = el('button', 'phase-card');
        card.type = 'button';
        card.appendChild(el('span', 'phase-card__title', `${impulse.number}.ª fase — ${impulse.periodLabel} (${impulse.hours})`));
        card.appendChild(el('span', 'phase-card__count', [stateText(progress, impulse.id, suggested), impulse.groundReactionLevels ? `Tierra ${impulse.groundReactionLevels.join('/')}` : 'sin Tierra'].filter(Boolean).join(' · ')));
        card.addEventListener('click', () => { location.hash = `#/turno/fase/${impulse.number}`; });
        dayList.appendChild(card);
      });
      wrap.appendChild(dayList);
    });

    viewRoot.appendChild(wrap);
    pushHistory({ type: 'navigation', view: 'turno' });
  }

  // ---------- Fase 0 (Estrategia) ----------

  async function renderStrategic() {
    const navToken = Router.currentToken();
    AppCore.clearLastTurnContext();
    const data = await loadTurnTemplate();
    if (!Router.isCurrent(navToken)) return;
    const strategic = data.band.strategic;
    setBreadcrumb(['TCW Assistant', 'Turno guiado', strategic.title]);
    viewRoot.innerHTML = '';
    markNodeVisited(Model.STRATEGIC_ID);
    const progress = loadProgress();
    const suggestedChild = Engine.getSuggestedChildId(data, progress, Model.STRATEGIC_ID);

    const wrap = el('div', 'phase-view');
    wrap.appendChild(el('h1', 'phase-view__title', strategic.title));
    wrap.appendChild(el('p', 'phase-view__desc', strategic.summary));

    const list = el('div', 'phase-list');
    Model.listStrategicPhases(data).forEach((phase) => {
      const nodeId = Model.nodeId(Model.STRATEGIC_ID, phase.id);
      const wrapper = el('div', 'phase-card-wrapper');
      const main = el('button', 'phase-card phase-card__main');
      main.type = 'button';
      main.appendChild(el('span', 'phase-card__title', phase.title + (phase.optional ? ' (opcional)' : '')));
      main.appendChild(el('span', 'phase-card__count', stateText(progress, nodeId, suggestedChild)));
      main.addEventListener('click', () => { location.hash = `#/turno/fase/0/${phase.id}`; });
      wrapper.appendChild(main);
      if (phase.optional) {
        const skipBtn = el('button', 'btn btn--secondary phase-card__skip', 'Saltar fase');
        skipBtn.type = 'button';
        skipBtn.addEventListener('click', () => {
          markNodeSkipped(nodeId);
          pushHistory({ type: 'navigation', view: 'phase-skip', id: nodeId, reason: 'fase opcional no usada' });
          renderStrategic();
        });
        wrapper.appendChild(skipBtn);
      }
      list.appendChild(wrapper);
    });
    wrap.appendChild(list);
    if (strategic.sheetNote) wrap.appendChild(el('p', 'source-refs', strategic.sheetNote));

    wrap.appendChild(finishRow(data, progress, Model.STRATEGIC_ID, strategic.title, 'Terminar Fase 0', renderStrategic));
    viewRoot.appendChild(wrap);
    pushHistory({ type: 'navigation', view: 'strategic' });
  }

  // Fila de acciones con «Terminar»/«Reabrir» de un nodo contenedor; solo confirma si hay una resolución activa.
  function finishRow(data, progress, nodeId, title, finishLabel, rerender, afterFinishHash) {
    const finished = Engine.isFinished(progress, nodeId);
    const finishBtn = el('button', finished ? 'btn btn--secondary' : 'btn btn--danger', finished ? 'Reabrir' : finishLabel);
    finishBtn.type = 'button';
    finishBtn.addEventListener('click', () => {
      if (finished) { reopenNode(nodeId); pushHistory({ type: 'navigation', view: 'reopen', id: nodeId }); rerender(); return; }
      const evaluation = Engine.evaluateNodeCompletion(data, loadProgress(), nodeId);
      if (evaluation.pendingResolutions.length) {
        const msg = `«${title}» tiene resolución(es) activa(s) sin guardar: ${evaluation.pendingResolutions.map((r) => r.label).join(', ')}.\n\n¿Terminarla de todas formas? Esas resoluciones seguirán abiertas: podrás retomarlas o cancelarlas más tarde.`;
        if (!confirm(msg)) return;
      }
      markNodeFinished(nodeId);
      pushHistory({ type: 'finish', view: 'node', id: nodeId });
      if (afterFinishHash) location.hash = afterFinishHash; else rerender();
    });
    return backRow([finishBtn]);
  }

  // ---------- Fase de campaña (impulso): lista de segmentos ----------

  async function renderImpulse(number) {
    const navToken = Router.currentToken();
    AppCore.clearLastTurnContext();
    const data = await loadTurnTemplate();
    if (!Router.isCurrent(navToken)) return;
    const impulse = Model.getImpulseByNumber(data, number);
    if (!impulse) { renderNotFound(`La fase «${number}» no existe`); return; }
    const day = Model.listDays(data).find((d) => d.id === impulse.dayId);
    setBreadcrumb(['TCW Assistant', 'Turno guiado', `${impulse.number}.ª fase`]);
    viewRoot.innerHTML = '';
    markNodeVisited(impulse.id);
    const progress = loadProgress();
    const suggestedSegment = Engine.getSuggestedChildId(data, progress, impulse.id);

    const wrap = el('div', 'phase-view');
    wrap.appendChild(el('h1', 'phase-view__title', `${impulse.title} — ${day.title}, ${impulse.periodLabel.toLowerCase()}`));
    wrap.appendChild(el('p', 'phase-view__desc', `Horario impreso: ${impulse.hours}.`));
    appendGroundLevelsLine(wrap, data, impulse);
    if (impulse.groundReactionLevels) {
      wrap.appendChild(el('p', 'source-refs', 'Las letras A-D son el Nivel de Reacción impreso abajo a la derecha de las fichas terrestres móviles (en la ayuda de la ficha se llama también Iniciativa). Lectura pendiente de revisión: ver Ayuda rápida › Secuencia de turno.'));
    }
    if (impulse.sheetNote) wrap.appendChild(el('p', 'pending-note', impulse.sheetNote));
    const impulseSrc = sourceDetails(impulse.sourceRefs, day.sourceRefs, data.band.sourceRefs);
    if (impulseSrc) wrap.appendChild(impulseSrc);

    const list = el('div', 'phase-list');
    Model.listSegments(data, impulse.id).forEach((seg) => {
      const card = el('button', 'phase-card');
      card.type = 'button';
      card.appendChild(el('span', 'phase-card__title', seg.title));
      const levels = seg.id === 'ground' && impulse.groundReactionLevels ? ` · Nivel de Reacción ${impulse.groundReactionLevels.join(', ')}` : '';
      card.appendChild(el('span', 'phase-card__count', [stateText(progress, seg.nodeId, suggestedSegment), levels.replace(/^ · /, '')].filter(Boolean).join(' · ')));
      card.addEventListener('click', () => { location.hash = `#/turno/fase/${impulse.number}/${seg.id}`; });
      list.appendChild(card);
    });
    wrap.appendChild(list);

    wrap.appendChild(finishRow(data, progress, impulse.id, impulse.title, 'Terminar fase', () => renderImpulse(number), '#/turno'));
    viewRoot.appendChild(wrap);
    pushHistory({ type: 'navigation', view: 'impulse', id: impulse.id });
  }

  // ---------- Segmento (o paso de la Fase 0): definición de contenido + subfases ----------

  async function renderSegment(number, segmentId) {
    const navToken = Router.currentToken();
    AppCore.clearLastTurnContext();
    const data = await loadTurnTemplate();
    if (!Router.isCurrent(navToken)) return;
    const impulse = Model.getImpulseByNumber(data, number);
    const seg = impulse && Model.getSegment(data, impulse.id, segmentId);
    if (seg && seg.consultable) {
      return renderConsultable({ navToken, data, consultable: seg.consultable, nodeId: seg.nodeId, crumbs: ['TCW Assistant', 'Turno guiado', `${impulse.number}.ª fase`, seg.title], parentHash: `#/turno/fase/${impulse.number}`, rerender: () => renderSegment(number, segmentId) });
    }
    if (!seg || !seg.phase) { renderNotFound(`El segmento «${segmentId}» no existe en la fase «${number}»`); return; }
    return renderPhaseLike({
      navToken, data, phase: seg.phase, nodeId: seg.nodeId, impulse, segment: seg,
      heading: `${seg.title} — ${impulse.title}`,
      crumbs: ['TCW Assistant', 'Turno guiado', `${impulse.number}.ª fase`, seg.title],
      parentHash: `#/turno/fase/${impulse.number}`,
      subHash: (sub) => `#/turno/fase/${impulse.number}/${seg.id}/${sub.id}`,
      rerender: () => renderSegment(number, segmentId),
      extra: (wrap) => {
        if (seg.id === 'ground' && impulse.groundReactionLevels) {
          appendGroundLevelsLine(wrap, data, impulse);
        }
        if (seg.sheetSteps) wrap.appendChild(el('p', 'source-refs', `Pasos impresos en la hoja: ${seg.sheetSteps.join(' → ')}.`));
        else wrap.appendChild(el('p', 'source-refs', 'La hoja no imprime los pasos de este segmento en esta fase; no se asume que repite los de la primera fase.'));
      }
    });
  }

  // Nodo consultable (Refuerzos, Recuperación de Mando): título, posición, procedimiento si está transcrito,
  // contenido pendiente y fuentes. Nunca bloquea ni exige marcarse como terminado.
  async function renderConsultable(opts) {
    const { navToken, consultable, nodeId, crumbs, parentHash, rerender } = opts;
    AppCore.clearLastTurnContext();
    setBreadcrumb(crumbs);
    viewRoot.innerHTML = '';
    markNodeVisited(nodeId);
    const progress = loadProgress();
    const wrap = el('div', 'phase-view');
    wrap.appendChild(el('h1', 'phase-view__title', consultable.title));
    wrap.appendChild(el('p', 'phase-view__desc', consultable.summary));
    if (consultable.position) wrap.appendChild(el('p', 'phase-view__desc', `Posición en la secuencia: ${consultable.position}`));
    if (Array.isArray(consultable.procedure) && consultable.procedure.length) {
      wrap.appendChild(el('h2', 'table-viewer__section-title', 'Procedimiento'));
      const list = el('ol', 'actions-list');
      consultable.procedure.forEach((step) => list.appendChild(el('li', 'actions-list__item', step)));
      wrap.appendChild(list);
    }
    if (consultable.pending) wrap.appendChild(el('p', 'pending-note', consultable.pending));
    const src = sourceDetails(consultable.sourceRefs);
    if (src) wrap.appendChild(src);
    await renderContextualHelpLinks(wrap, []);
    if (!Router.isCurrent(navToken)) return;
    const finished = Engine.isFinished(progress, nodeId);
    const markBtn = el('button', finished ? 'btn btn--secondary' : 'btn btn--primary', finished ? 'Reabrir' : 'Marcar como hecho');
    markBtn.type = 'button';
    markBtn.addEventListener('click', () => {
      if (finished) reopenNode(nodeId); else markNodeFinished(nodeId);
      pushHistory({ type: finished ? 'navigation' : 'finish', view: 'consultable', id: nodeId });
      if (finished) rerender(); else location.hash = parentHash;
    });
    wrap.appendChild(backRow([markBtn]));
    viewRoot.appendChild(wrap);
    pushHistory({ type: 'navigation', view: 'consultable', id: nodeId });
  }

  async function renderCommandRecovery(dayId) {
    const navToken = Router.currentToken();
    const data = await loadTurnTemplate();
    if (!Router.isCurrent(navToken)) return;
    const day = Model.listDays(data).find((d) => d.id === dayId);
    if (!day) { renderNotFound(`El día «${dayId}» no existe`); return; }
    return renderConsultable({
      navToken, data, consultable: data.band.consultables[day.commandRecovery], nodeId: Model.commandRecoveryNodeId(day.id),
      crumbs: ['TCW Assistant', 'Turno guiado', `Recuperación de Mando (${day.title.toLowerCase()})`], parentHash: '#/turno',
      rerender: () => renderCommandRecovery(dayId)
    });
  }

  async function renderStrategicPhase(phaseId) {
    const navToken = Router.currentToken();
    AppCore.clearLastTurnContext();
    const data = await loadTurnTemplate();
    if (!Router.isCurrent(navToken)) return;
    const phase = data.band.strategic.phases.includes(phaseId) ? data.phases[phaseId] : null;
    if (!phase) { renderNotFound(`El paso «${phaseId}» no existe en la Fase 0`); return; }
    return renderPhaseLike({
      navToken, data, phase, nodeId: Model.nodeId(Model.STRATEGIC_ID, phase.id), impulse: null, segment: null,
      heading: phase.title,
      crumbs: ['TCW Assistant', 'Turno guiado', data.band.strategic.title, phase.title],
      parentHash: '#/turno/fase/0',
      subHash: (sub) => `#/turno/fase/0/${phase.id}/${sub.id}`,
      rerender: () => renderStrategicPhase(phaseId),
      extra: null
    });
  }

  async function renderPhaseLike(opts) {
    const { navToken, data, phase, nodeId, impulse, segment, heading, crumbs, parentHash, subHash, rerender, extra } = opts;
    setBreadcrumb(crumbs);
    viewRoot.innerHTML = '';
    // AJ-003: una marca pendiente sin borrador asociado no se puede retomar.
    const orphanResolutions = AppCore.repairOrphanPendingResolutions();
    markNodeVisited(nodeId);
    const progress = loadProgress();
    const turnCtx = { impulseId: impulse ? impulse.id : null, segmentId: segment ? segment.id : null, phaseId: phase.id, subphaseId: null, nodeId, subNodeId: null };
    setTurnContext(turnCtx);

    const wrap = el('div', 'phase-view');
    wrap.appendChild(el('h1', 'phase-view__title', heading));
    if (orphanResolutions.length) {
      wrap.appendChild(el('p', 'turn-view__desc', `Se retiraron ${orphanResolutions.length} marca(s) de resolución activa sin datos guardados (${orphanResolutions.map((r) => r.label).join(', ')}): ya no se podían retomar.`));
    }
    wrap.appendChild(el('p', 'phase-view__desc', phase.summary));
    if (phase.nameNote) wrap.appendChild(el('p', 'pending-note', phase.nameNote));
    if (extra) extra(wrap);

    if (phase.actions && phase.actions.length) {
      const actionsList = el('ol', 'actions-list');
      phase.actions.forEach((action) => actionsList.appendChild(el('li', 'actions-list__item', action.text)));
      wrap.appendChild(actionsList);
    }

    if (phase.subphases && phase.subphases.length) {
      const list = el('div', 'subphase-list');
      phase.subphases.forEach((subId) => {
        const sub = data.subphases[subId];
        const card = el('button', 'subphase-card');
        card.type = 'button';
        const done = Engine.isFinished(progress, Model.nodeId(nodeId, subId)) ? ' ✓' : '';
        card.appendChild(el('span', 'subphase-card__title', (sub ? sub.title : subId) + (sub && sub.optionalRule ? ' (regla opcional)' : '') + done));
        card.addEventListener('click', () => { location.hash = subHash(sub || { id: subId }); });
        list.appendChild(card);
      });
      wrap.appendChild(list);
    }

    // Resoluciones activas de este nodo o de sus subfases: «Terminar» las tiene en cuenta, aquí se listan con acceso directo.
    const completion = Engine.evaluateNodeCompletion(data, progress, nodeId);
    appendPendingResolutionCards(wrap, completion.pendingResolutions, rerender, (resolution) => {
      const parts = resolution.nodeId.split('/');
      const subNodeId = parts.length > nodeId.split('/').length ? resolution.nodeId : null;
      return { band: progress.currentBand, ...turnCtx, subNodeId, subphaseId: resolution.subphaseId, resolutionNodeId: resolution.nodeId, phaseId: resolution.phaseId || phase.id };
    });

    wrap.appendChild(el('p', 'pending-note', phase.endCondition));
    if (phase.notes) wrap.appendChild(el('p', 'pending-note', phase.notes));
    wrap.appendChild(el('p', 'source-refs', `Referencia de regla: ${phase.ruleReference}`));
    const src = sourceDetails(segment ? segment.sourceRefs : null, impulse && !segment ? impulse.sourceRefs : null, phase.sourceRefs);
    if (src) wrap.appendChild(src);

    if (phase.id === 'logistica') {
      const rosterCard = el('button', 'help-card help-card--highlight');
      rosterCard.type = 'button';
      rosterCard.appendChild(el('span', 'help-card__title', '→ Plantilla de fuerzas'));
      rosterCard.appendChild(el('span', 'help-card__source', 'Al terminar esta fase, las unidades marcadas como Actuadas pasan a No Actuadas.'));
      rosterCard.addEventListener('click', () => { location.hash = '#/unidades'; });
      wrap.appendChild(rosterCard);
    }

    // Combates y resoluciones de este segmento: la unión de los de sus subfases (nunca una lista vacía si le corresponden).
    const segWorkflows = Model.phaseWorkflows(data, phase);
    await renderContextualHelpLinks(wrap, segWorkflows.workflowIds, segWorkflows.wizardLinks);
    if (!Router.isCurrent(navToken)) return;

    const finished = Engine.isFinished(progress, nodeId);
    const finishBtn = el('button', finished ? 'btn btn--secondary' : 'btn btn--danger', finished ? 'Reabrir fase' : 'Terminar fase');
    finishBtn.type = 'button';
    finishBtn.addEventListener('click', () => {
      if (finished) { reopenNode(nodeId); pushHistory({ type: 'navigation', view: 'reopen', id: nodeId }); rerender(); return; }
      // «Terminar» es una marca voluntaria e independiente: no exige visitar subfases ni respetar el orden. Lo único
      // que se confirma es el riesgo real de perder datos (resoluciones activas sin guardar).
      const evaluation = Engine.evaluateNodeCompletion(data, loadProgress(), nodeId);
      if (evaluation.pendingResolutions.length) {
        const msg = `«${phase.title}» tiene resolución(es) activa(s) sin guardar: ${evaluation.pendingResolutions.map((r) => r.label).join(', ')}.\n\n¿Terminarla de todas formas? Esas resoluciones seguirán abiertas: podrás retomarlas o cancelarlas más tarde.`;
        if (!confirm(msg)) return;
      } else if (!confirm(`¿Terminar «${phase.title}» y volver?`)) {
        return;
      }
      markNodeFinished(nodeId);
      // turn-template.json#phases.logistica, acción 3: «Al finalizar, cambia las unidades marcadas como Actuadas a No Actuadas».
      if (phase.id === 'logistica') resetAllActuada();
      pushHistory({ type: 'finish', view: 'phase', id: nodeId });
      location.hash = parentHash;
    });
    wrap.appendChild(backRow([finishBtn]));
    viewRoot.appendChild(wrap);
    pushHistory({ type: 'navigation', view: 'phase', id: nodeId });
  }

  // ---------- Subfase de un segmento concreto ----------

  async function renderSubphase(number, segmentId, subId) {
    const navToken = Router.currentToken();
    AppCore.clearLastTurnContext();
    const data = await loadTurnTemplate();
    if (!Router.isCurrent(navToken)) return;
    let impulse = null;
    let seg = null;
    let phase;
    let nodeId;
    let crumbs;
    let parentHash;
    if (number === 0) {
      phase = data.band.strategic.phases.includes(segmentId) ? data.phases[segmentId] : null;
      nodeId = Model.nodeId(Model.STRATEGIC_ID, segmentId);
      parentHash = `#/turno/fase/0/${segmentId}`;
      crumbs = ['TCW Assistant', 'Turno guiado', data.band.strategic.title, phase && phase.title];
    } else {
      impulse = Model.getImpulseByNumber(data, number);
      seg = impulse && Model.getSegment(data, impulse.id, segmentId);
      phase = seg && seg.phase;
      nodeId = seg && seg.nodeId;
      parentHash = `#/turno/fase/${number}/${segmentId}`;
      crumbs = ['TCW Assistant', 'Turno guiado', `${number}.ª fase`, seg && seg.title];
    }
    const sub = data.subphases[subId];
    if (!phase || !sub || !(phase.subphases || []).includes(subId)) { renderNotFound(`Subfase «${subId}» no encontrada`); return; }
    const subNodeId = Model.nodeId(nodeId, subId);

    setBreadcrumb([...crumbs, sub.title]);
    viewRoot.innerHTML = '';
    markNodeVisited(subNodeId);
    setTurnContext({ impulseId: impulse ? impulse.id : null, segmentId: seg ? seg.id : null, phaseId: phase.id, subphaseId: sub.id, nodeId, subNodeId });
    const progress = loadProgress();

    const wrap = el('div', 'subphase-view');
    wrap.appendChild(el('h1', 'subphase-view__title', sub.title));
    helpParagraph(wrap, sub.help, sub.entityRefs, 'subphase-view__desc');
    if (sub.optionalRule && !RuleProfileEngine.isAvailable(sub, AppCore.loadRuleProfile())) {
      wrap.appendChild(el('p', 'pending-note', 'Es un paso de regla opcional y tu perfil de reglas no la tiene activada; puedes omitirlo.'));
    }
    if (sub.sourceRefs && sub.sourceRefs.length) wrap.appendChild(el('p', 'source-refs', `Referencia de regla: ${phase.ruleReference}`));
    // Pasos que remiten a un nodo consultable del día (p. ej. Restablecimiento → Recuperación de Mando).
    (sub.consultableLinks || []).forEach((cid) => {
      const consultable = data.band.consultables[cid];
      const dayId = impulse ? impulse.dayId : Model.listDays(data)[0].id;
      if (!consultable) return;
      const card = el('button', 'help-card help-card--highlight');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', `→ ${consultable.title}`));
      card.appendChild(el('span', 'help-card__source', consultable.summary));
      card.addEventListener('click', () => { location.hash = `#/turno/mando/${dayId}`; });
      wrap.appendChild(card);
    });
    const subSrc = sourceDetails(sub.sourceRefs, seg ? seg.sourceRefs : null);
    if (subSrc) wrap.appendChild(subSrc);

    const imageGallery = SUBPHASE_IMAGE_GALLERIES[sub.id];
    if (imageGallery) await renderPhaseImageGallery(wrap, imageGallery.group, imageGallery.title);

    await renderContextualHelpLinks(wrap, sub.relatedWorkflowIds, sub.wizardLinks);
    if (!Router.isCurrent(navToken)) return;

    const finished = Engine.isFinished(progress, subNodeId);
    const finishBtn = el('button', finished ? 'btn btn--secondary' : 'btn btn--primary', finished ? 'Reabrir subfase' : 'Terminar subfase');
    finishBtn.type = 'button';
    finishBtn.addEventListener('click', () => {
      if (finished) { reopenNode(subNodeId); pushHistory({ type: 'navigation', view: 'reopen', id: subNodeId }); renderSubphase(number, segmentId, subId); return; }
      markNodeFinished(subNodeId);
      pushHistory({ type: 'finish', view: 'subphase', id: subNodeId });
      location.hash = parentHash;
    });
    wrap.appendChild(backRow([finishBtn]));
    viewRoot.appendChild(wrap);
    pushHistory({ type: 'navigation', view: 'subphase', id: subNodeId });
  }

  // Acceso contextual a reglas/tablas/ayudas desde una fase o subfase del turno guiado
  // (AGENTS.md §3.1): los workflows de combate relacionados (si la subfase los declara en
  // `relatedWorkflowIds`) más un acceso siempre disponible a Tablas/Detección/Reglas y
  // extractos/Counters, sin salir del flujo de turno guiado.
  async function renderContextualHelpLinks(container, relatedWorkflowIds, wizardLinks) {
    const box = el('div', 'help-view');
    box.appendChild(el('h2', 'table-viewer__section-title', 'Ayuda contextual'));
    const list = el('div', 'help-list');

    if (relatedWorkflowIds && relatedWorkflowIds.length) {
      const index = await loadWorkflowsIndex();
      relatedWorkflowIds.forEach((wfId) => {
        const wf = index.files.find((f) => f.id === wfId);
        if (!wf) return;
        const card = el('button', 'help-card help-card--highlight');
        card.type = 'button';
        card.appendChild(el('span', 'help-card__title', `→ ${wf.title}`));
        card.appendChild(el('span', 'help-card__source', 'Combate por tipo'));
        card.addEventListener('click', () => { location.hash = `#/ayuda/combate/${wf.id}`; });
        list.appendChild(card);
      });
    }

    // Atajos directos a wizards propios de esta fase/subfase (reacciones, resultado de ataque, reabastecimiento...).
    (wizardLinks || []).forEach((link) => {
      const hash = AppCore.WORKFLOW_WIZARD_HASHES[link.wizard];
      if (!hash) return;
      const card = el('button', 'help-card help-card--highlight');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', `▶ ${link.title}`));
      if (link.description) card.appendChild(el('span', 'help-card__source', link.description));
      card.addEventListener('click', () => { location.hash = hash; });
      list.appendChild(card);
    });

    [
      { title: 'Tablas', hashId: 'tablas' },
      { title: 'Detección', hashId: 'deteccion' },
      { title: 'Reglas y extractos', hashId: 'reglas' },
      { title: 'Leyenda de counters / fichas', hashId: 'counters' }
    ].forEach((g) => {
      const card = el('button', 'help-card');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', g.title));
      card.addEventListener('click', () => { location.hash = `#/ayuda/${g.hashId}`; });
      list.appendChild(card);
    });

    box.appendChild(list);
    container.appendChild(box);
  }

  root.Views = root.Views || {};
  root.Views.Turn = { renderTurnIndex, renderStrategic, renderStrategicPhase, renderCommandRecovery, renderImpulse, renderSegment, renderSubphase, renderContextualHelpLinks };
})(typeof window !== 'undefined' ? window : globalThis);
