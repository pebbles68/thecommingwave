// Ayuda de Reglas y extractos (roadmap Fase 3), dividida de views/help.js en
// correcciones03.md COR03-006 (2026-09-29). A diferencia de las demás
// categorías, NO transcribe contenido nuevo del Decision Book (260 páginas,
// fuera de alcance de un solo incremento): consolida en una pantalla los
// extractos ya verificados y citados en docs/rules/known-ambiguities.md y en
// los specialRules de data/workflows/, más un resumen enlazado de las 14
// misiones aéreas ya transcritas en data/missions/air-missions.json (sin
// duplicar esos datos aquí). `loadRulesExcerpts`/`loadAirMissions` viven en
// core.js (AppCore) porque el buscador (help-search.js) también los usa.
(function (root) {
  'use strict';

  const { viewRoot, setBreadcrumb, el, renderNotFound, backRow, loadRulesExcerpts, loadAirMissions } = AppCore;

  function renderExcerptCard(excerpt) {
    const card = el('div', 'counter-factor');
    const badges = [];
    if (excerpt.optionalRule) badges.push(RuleProfileEngine.isAvailable(excerpt, AppCore.loadRuleProfile()) ? ' · regla opcional' : ' · regla opcional (desactivada en tu perfil)');
    if (excerpt.auditedOnly) badges.push(' · auditado, no transcrito completo');
    card.appendChild(el('span', 'counter-factor__label', excerpt.title));
    card.appendChild(el('span', 'counter-factor__position', `${excerpt.sections}${excerpt.pages ? `, pág. ${excerpt.pages}` : ''}${badges.join('')}`));
    (excerpt.points || []).forEach((p) => card.appendChild(el('p', 'turn-view__desc', `• ${p}`)));
    (excerpt.quotes || []).forEach((q) => card.appendChild(el('p', 'source-refs', `"${q}"`)));
    if (excerpt.note) card.appendChild(el('p', 'pending-note', excerpt.note));
    if (excerpt.relatedWorkflow) {
      const link = el('button', 'btn btn--secondary', `Ver "Combate por tipo": ${excerpt.relatedWorkflow.id}`);
      link.type = 'button';
      link.addEventListener('click', () => { location.hash = `#/ayuda/combate/${excerpt.relatedWorkflow.id}`; });
      card.appendChild(link);
    }
    return card;
  }

  async function renderReglasHelp() {
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Reglas y extractos']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let data;
    let missions;
    try {
      [data, missions] = await Promise.all([loadRulesExcerpts(), loadAirMissions()]);
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
    wrap.appendChild(el('p', 'source-refs', `Pendiente de transcribir: ${data.pendingSections}`));

    wrap.appendChild(el('h2', null, 'Extractos verificados'));
    data.verifiedExcerpts.forEach((excerpt) => wrap.appendChild(renderExcerptCard(excerpt)));

    wrap.appendChild(el('h2', null, 'Misiones aéreas'));
    wrap.appendChild(el('p', 'turn-view__desc', data.airMissionsRef.note));
    const missionsList = el('div', 'help-list');
    missions.missions.forEach((m) => {
      const card = el('div', 'help-card');
      card.appendChild(el('span', 'help-card__title', `${m.abbreviation ? `[${m.abbreviation}] ` : ''}${m.name || m.title}`));
      card.appendChild(el('span', 'help-card__source', m.description || ''));
      missionsList.appendChild(card);
    });
    wrap.appendChild(missionsList);

    wrap.appendChild(el('p', 'source-refs', data.sourceRefs.map((s) => s.document).join(' · ')));
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.HelpReglas = { renderReglasHelp };
})(typeof window !== 'undefined' ? window : globalThis);
