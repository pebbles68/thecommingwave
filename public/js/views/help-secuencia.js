// Ayuda de Secuencia de turno y fases (roadmap Fase 3), dividida de
// views/help.js en correcciones03.md COR03-006 (2026-09-29). Referencia de
// solo lectura de la secuencia, generada desde el modelo canónico data/phases/turn-template.json
// (TurnModel.buildSequenceHelp; transcrito de TCW - Hoja de turnos 1.1.pdf). Es la misma secuencia
// que recorre el turno guiado (views/turn.js); esta pantalla solo la explica.
(function (root) {
  'use strict';

  const { viewRoot, setBreadcrumb, el, renderNotFound, backRow, loadTurnSequenceHelp } = AppCore;

  async function renderSecuenciaHelp() {
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Secuencia de turno y fases']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let data;
    try {
      data = await loadTurnSequenceHelp();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', data.title));
    wrap.appendChild(el('p', 'pending-note', data.note));

    // La hoja de turnos tal como aparece en el documento de origen, para consultarla como imagen (igual que las fichas).
    const SHEET_IMAGE = '/data/phases/source-images/hoja-de-turnos.jpg';
    const SHEET_ALT = 'Hoja de turnos 1.1 tal como aparece en el documento de origen';
    const sheetBtn = el('button', 'btn btn--primary', '🖼 Ver la hoja de turnos (imagen)');
    sheetBtn.type = 'button';
    sheetBtn.addEventListener('click', () => AppCore.openImageLightbox(SHEET_IMAGE, SHEET_ALT));
    wrap.appendChild(sheetBtn);
    wrap.appendChild(el('p', 'source-refs', 'La hoja de turnos completa, como imagen de apoyo. Tócala para ampliarla a tamaño real y vuelve a tocarla para ajustarla a la pantalla. Lo que ves aquí debajo es la misma hoja explicada paso a paso.'));
    const sheetThumb = el('button', 'source-page-gallery__item');
    sheetThumb.type = 'button';
    const sheetImg = el('img');
    sheetImg.src = SHEET_IMAGE;
    sheetImg.alt = `${SHEET_ALT} — miniatura`;
    sheetThumb.appendChild(sheetImg);
    sheetThumb.setAttribute('aria-label', 'Ver la hoja de turnos completa');
    sheetThumb.addEventListener('click', () => AppCore.openImageLightbox(SHEET_IMAGE, SHEET_ALT));
    const sheetGallery = el('div', 'source-page-gallery');
    sheetGallery.appendChild(sheetThumb);
    wrap.appendChild(sheetGallery);

    wrap.appendChild(el('h2', null, 'Bandas de día'));
    wrap.appendChild(el('p', 'turn-view__desc', data.dayBands.intro));
    const bandsRow = el('div', 'router-trail');
    data.dayBands.bands.forEach((b) => {
      bandsRow.appendChild(el('span', `router-trail__item${b.strategicPhaseHighlight ? ' help-card--highlight' : ''}`, `${b.index}. ${b.label}`));
    });
    wrap.appendChild(bandsRow);
    wrap.appendChild(el('p', 'source-refs', data.dayBands.strategicPhaseNote));

    wrap.appendChild(el('h2', null, data.strategicPhase.title));
    const stratRow = el('div', 'ammo-icon-row');
    data.strategicPhase.steps.forEach((s) => stratRow.appendChild(el('span', 'ammo-icon-chip__label', s)));
    wrap.appendChild(stratRow);
    wrap.appendChild(el('p', 'source-refs', data.strategicPhase.note));
    wrap.appendChild(el('p', 'source-refs', data.strategicPhase.spaceDebrisTracker));

    wrap.appendChild(el('h2', null, 'Fases del día'));
    wrap.appendChild(el('p', 'turn-view__desc', data.commandRecoveryNote));

    data.commandRecoveryCycles.forEach((cycle) => {
      wrap.appendChild(el('h3', 'table-viewer__section-title', cycle.label));
      cycle.phaseIds.forEach((phaseId) => {
        const phase = data.phases.find((p) => p.id === phaseId);
        const phaseBox = el('div', 'counter-factor');
        const timeIcon = phase.timeOfDay === 'night' ? '🌙' : '☀';
        phaseBox.appendChild(el('span', 'counter-factor__label', `${timeIcon} ${phase.order}. ${phase.title}`));
        phaseBox.appendChild(el('span', 'counter-factor__position', `Horario: ${phase.hours}`));
        phase.segments.forEach((seg) => {
          const segLine = el('p', 'source-refs');
          const markers = seg.groundActivationMarkers ? ` [${seg.groundActivationMarkers.join(',')}]` : '';
          const stepsText = seg.steps ? seg.steps.join(' → ') : '(pasos no impresos en la hoja para esta fase)';
          segLine.textContent = `${seg.title}${markers}: ${stepsText}`;
          phaseBox.appendChild(segLine);
        });
        if (phase.note) phaseBox.appendChild(el('p', 'pending-note', phase.note));
        wrap.appendChild(phaseBox);
      });
    });

    wrap.appendChild(el('p', 'pending-note', data.groundActivationMarkersNote));
    wrap.appendChild(el('p', 'source-refs', data.phaseOrderCrossCheck));

    wrap.appendChild(el('p', 'source-refs', data.sourceRefs.map((s) => `${s.document}${s.page ? `, pág. ${s.page}` : ''}`).join(' · ')));
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.HelpSecuencia = { renderSecuenciaHelp };
})(typeof window !== 'undefined' ? window : globalThis);
