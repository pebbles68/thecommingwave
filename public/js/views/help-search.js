// Buscador por término/regla (roadmap Fase 3), dividido de views/help.js en
// correcciones03.md COR03-006 (2026-09-29). Índice en memoria construido
// sobre los datos ya cargados por las demás categorías de Ayuda rápida
// (tablas, combate por tipo, counters, munición, detección, secuencia,
// reglas) — no transcribe contenido nuevo, solo reutiliza los índices
// existentes. Los cargadores de detección/reglas/misiones viven en core.js
// (AppCore) precisamente para que este módulo no dependa de otro módulo de
// vista para sus propios datos.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, wizardNavButton,
    loadTablesIndex, loadWorkflowsIndex, loadFactorMap, loadDetectionHelp, loadTurnSequenceHelp,
    loadRulesExcerpts, loadAirMissions, AMMO_COUNTRIES, AMMO_CATEGORIES, loadAmmoFile, collectCategoryUnits
  } = AppCore;

  let searchIndexPromise = null;

  function collectMunitionNames(node, out) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.munition === 'string' && node.munition) { out.push(node.munition); return; }
    Object.values(node).forEach((v) => collectMunitionNames(v, out));
  }

  async function buildSearchIndex() {
    if (searchIndexPromise) return searchIndexPromise;
    searchIndexPromise = (async () => {
      const entries = [];
      const [tablesIdx, workflowsIdx, counters] = await Promise.all([loadTablesIndex(), loadWorkflowsIndex(), loadFactorMap()]);

      tablesIdx.pages.forEach((p) => {
        entries.push({ type: 'Tabla', title: `Pág. ${p.page} — ${p.title}`, hash: `#/ayuda/tablas/${p.file}`, haystack: p.title });
      });
      workflowsIdx.files.forEach((wf) => {
        entries.push({ type: 'Combate por tipo', title: wf.title, hash: `#/ayuda/combate/${wf.id}`, haystack: wf.title });
      });
      counters.counterTemplates.forEach((tpl) => {
        entries.push({ type: 'Counter / ficha', title: tpl.title, hash: `#/ayuda/counters/${tpl.category}/${tpl.id}`, haystack: `${tpl.title} ${tpl.matchHint || ''}` });
      });

      try {
        const detection = await loadDetectionHelp();
        [...detection.unitStates.states, ...detection.exposureStates.states].forEach((s) => {
          entries.push({ type: 'Detección', title: s.title, hash: '#/ayuda/deteccion', haystack: `${s.title} ${s.description}` });
        });
        [detection.airDetection, detection.navalDetection, detection.groundDetection, detection.electronicDetection].forEach((section) => {
          entries.push({ type: 'Detección', title: section.title, hash: '#/ayuda/deteccion', haystack: section.title });
        });
      } catch (err) { /* no crítico para el buscador */ }

      try {
        const turnSeq = await loadTurnSequenceHelp();
        turnSeq.phases.forEach((p) => {
          entries.push({ type: 'Secuencia de turno', title: `${p.title} (${p.hours})`, hash: '#/ayuda/secuencia', haystack: `${p.title} ${p.segments.map((s) => s.title).join(' ')}` });
        });
        entries.push({ type: 'Secuencia de turno', title: turnSeq.strategicPhase.title, hash: '#/ayuda/secuencia', haystack: `${turnSeq.strategicPhase.title} ${turnSeq.strategicPhase.steps.join(' ')}` });
      } catch (err) { /* no crítico para el buscador */ }

      try {
        const [rules, missions] = await Promise.all([loadRulesExcerpts(), loadAirMissions()]);
        rules.verifiedExcerpts.forEach((ex) => {
          entries.push({ type: 'Reglas y extractos', title: `${ex.title} (${ex.sections})`, hash: '#/ayuda/reglas', haystack: `${ex.title} ${(ex.points || []).join(' ')} ${(ex.quotes || []).join(' ')}` });
        });
        missions.missions.forEach((m) => {
          entries.push({ type: 'Reglas y extractos', title: `${m.abbreviation ? `[${m.abbreviation}] ` : ''}${m.name || m.title}`, hash: '#/ayuda/reglas', haystack: `${m.name || m.title} ${m.description || ''}` });
        });
      } catch (err) { /* no crítico para el buscador */ }

      const ammoFetches = [];
      AMMO_COUNTRIES.forEach((country) => {
        AMMO_CATEGORIES.forEach((cat) => {
          ammoFetches.push(loadAmmoFile(cat.dir, country.id).then((data) => {
            collectCategoryUnits(data, cat).forEach(({ unit }) => {
              const munitions = [];
              collectMunitionNames(unit.plans, munitions);
              const haystack = [unit.name, unit.nameEn, unit.nameLocal, unit.class, unit.role, ...munitions].filter(Boolean).join(' ');
              entries.push({
                type: 'Munición',
                title: `${unit.name}${unit.nameEn ? ` (${unit.nameEn})` : ''} — ${country.label}`,
                hash: `#/ayuda/municion/${country.id}/${cat.id}/${unit.id}`,
                haystack
              });
            });
          }).catch(() => {}));
        });
      });
      await Promise.all(ammoFetches);
      return entries;
    })();
    return searchIndexPromise;
  }

  async function renderSearch(rawQuery) {
    const navToken = Router.currentToken();
    const query = decodeURIComponent(rawQuery || '').trim();
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Buscar']);
    viewRoot.innerHTML = '<p class="loading">Cargando índice de búsqueda…</p>';
    const index = await buildSearchIndex();
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', 'Buscar'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Busca por nombre de unidad, munición, tipo de combate, ficha o tabla. Consulta de referencia: no inicia ninguna resolución.'));

    const controls = el('div', 'table-viewer__controls');
    const field = el('label', 'table-viewer__field');
    field.appendChild(el('span', null, 'Término de búsqueda'));
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'table-viewer__select';
    input.value = query;
    input.placeholder = 'p.ej. JASSM, submarino, antibuque…';
    field.appendChild(input);
    controls.appendChild(field);
    const runSearch = () => { location.hash = `#/ayuda/buscar/${encodeURIComponent(input.value.trim())}`; };
    controls.appendChild(wizardNavButton('Buscar', 'primary', runSearch));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
    wrap.appendChild(controls);

    if (query) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const results = index.filter((entry) => {
        const haystack = `${entry.title} ${entry.haystack}`.toLowerCase();
        return terms.every((t) => haystack.includes(t));
      });
      wrap.appendChild(el('p', 'turn-view__desc', `${results.length} resultado(s) para «${query}».`));
      const list = el('div', 'help-list');
      results.forEach((r) => {
        const card = el('button', 'help-card');
        card.type = 'button';
        card.appendChild(el('span', 'help-card__title', r.title));
        card.appendChild(el('span', 'help-card__source', r.type));
        card.addEventListener('click', () => { location.hash = r.hash; });
        list.appendChild(card);
      });
      wrap.appendChild(list);
    }

    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.HelpSearch = { renderSearch };
})(typeof window !== 'undefined' ? window : globalThis);
