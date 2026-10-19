// Guía de pasos del combate (Fase 24, TC-006): para quien no sabe qué hacer, explica el proceso mental que lleva a la
// tabla correcta, un paso por pantalla, y abre el wizard o la ayuda cuando toca calcular. Los pasos salen de
// data/guides/combat-steps.json (CombatGuideEngine); la vista solo los dibuja. Ruta: #/guia/<id>.
(function (root) {
  'use strict';

  const { viewRoot, setBreadcrumb, el, renderNotFound, backRow } = AppCore;

  let cache = null;
  async function loadData() {
    if (cache) return cache;
    const [guides, missions] = await Promise.all([
      fetch('/data/guides/combat-steps.json').then((r) => { if (!r.ok) throw new Error('No se pudo cargar combat-steps.json'); return r.json(); }),
      fetch('/data/missions/air-missions.json').then((r) => (r.ok ? r.json() : { missions: [] }))
    ]);
    cache = { guides, missions };
    return cache;
  }

  function linkCard(title, description, hash) {
    const card = el('button', 'help-card help-card--highlight');
    card.type = 'button';
    card.appendChild(el('span', 'help-card__title', title));
    if (description) card.appendChild(el('span', 'help-card__source', description));
    card.addEventListener('click', () => { location.hash = hash; });
    return card;
  }

  async function renderCombatGuide(guideId) {
    const navToken = Router.currentToken();
    AppCore.clearLastTurnContext();
    setBreadcrumb(['TCW Assistant', 'Guía de combate']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let data;
    try {
      data = await loadData();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;
    const guide = CombatGuideEngine.getGuide(data.guides, guideId);
    if (!guide) { renderNotFound(`La guía «${guideId}» no existe`); return; }
    const steps = CombatGuideEngine.buildSteps(guide, data.missions);
    setBreadcrumb(['TCW Assistant', 'Guía de combate', guide.title]);

    let index = 0;
    const wrap = el('div', 'combat-guide');
    const body = el('div', 'combat-guide__body');

    function draw() {
      body.textContent = '';
      const step = steps[index];
      const nav = el('div', 'combat-guide__steps');
      steps.forEach((s, i) => {
        const chip = el('button', `combat-guide__chip${i === index ? ' is-active' : ''}${i < index ? ' is-done' : ''}`, `${s.order}. ${s.title}`);
        chip.type = 'button';
        chip.setAttribute('aria-current', i === index ? 'step' : 'false');
        chip.addEventListener('click', () => { index = i; draw(); });
        nav.appendChild(chip);
      });
      body.appendChild(nav);
      body.appendChild(el('p', 'combat-guide__progress', `Paso ${index + 1} de ${steps.length}`));
      body.appendChild(el('h2', 'combat-guide__question', step.question));
      body.appendChild(el('p', 'phase-view__desc', step.explanation));
      (step.clarifications || []).forEach((text) => body.appendChild(el('p', 'combat-guide__clarification', text)));
      step.missions.forEach((m) => {
        const box = el('div', 'help-card');
        box.appendChild(el('span', 'help-card__title', `${m.name}${m.abbreviation ? ` (${m.abbreviation})` : ''}`));
        if (m.description) box.appendChild(el('span', 'help-card__source', m.description));
        body.appendChild(box);
      });
      if (step.pending) body.appendChild(el('p', 'pending-note', step.pending));
      if (step.links.length) {
        const list = el('div', 'help-list');
        step.links.forEach((l) => list.appendChild(linkCard(l.title, l.description, l.hash)));
        body.appendChild(list);
      }
      if (step.status === 'needs_review') body.appendChild(el('p', 'source-refs', 'Paso pendiente de revisión por el mantenedor.'));
      const row = el('div', 'action-row');
      const prev = el('button', 'btn btn--secondary', '← Paso anterior');
      prev.type = 'button';
      prev.disabled = index === 0;
      prev.addEventListener('click', () => { index -= 1; draw(); });
      row.appendChild(prev);
      const next = el('button', 'btn btn--primary', index === steps.length - 1 ? 'Terminar guía' : 'Siguiente paso →');
      next.type = 'button';
      next.addEventListener('click', () => { if (index === steps.length - 1) { location.hash = '#/'; return; } index += 1; draw(); });
      row.appendChild(next);
      body.appendChild(row);
    }

    wrap.appendChild(el('h1', 'help-detail__title', guide.title));
    wrap.appendChild(el('p', 'phase-view__desc', guide.intro));
    wrap.appendChild(body);
    wrap.appendChild(backRow());
    viewRoot.innerHTML = '';
    viewRoot.appendChild(wrap);
    draw();
  }

  root.Views = root.Views || {};
  root.Views.CombatGuide = { renderCombatGuide };
})(typeof window !== 'undefined' ? window : globalThis);
