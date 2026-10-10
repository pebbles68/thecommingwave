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
