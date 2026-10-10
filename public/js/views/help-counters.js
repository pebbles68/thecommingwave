// Ayuda de counters / fichas (roadmap Fase 3), dividida de views/help.js en
// correcciones03.md COR03-006 (2026-09-29). Datos ya transcritos en
// data/counters/factor-map.json (20 plantillas de ficha con posición de
// factores, roleBands y crossReferences a known-ambiguities.md). Esta vista
// solo interpreta ese JSON de forma genérica, sin lógica de dominio
// hardcodeada (AGENTS.md §4.1/§11).
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, renderNotFound, backRow,
    loadFactorMap, translatePosition, buildCounterViewer, loadImageHotspots
  } = AppCore;

  const COUNTER_CATEGORIES = {
    air: { title: 'Aéreas', image: 'counters-aereos.jpg', source: 'Resumen counters - Español.pdf, página 1' },
    naval: { title: 'Navales y submarinas', image: 'resto-counters.jpg', source: 'Resto de Counters.jpg' },
    'low-altitude': { title: 'Baja altitud', image: 'resto-counters.jpg', source: 'Resto de Counters.jpg' },
    ground: { title: 'Terrestres', image: 'resto-counters.jpg', source: 'Resto de Counters.jpg' }
  };

  async function renderCountersIndex() {
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Counters']);
    viewRoot.innerHTML = '<p class="loading">Cargando leyenda de counters…</p>';
    const data = await loadFactorMap();
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', 'Leyenda de counters / fichas'));
    wrap.appendChild(el('p', 'turn-view__desc', `${data.counterTemplates.length} tipos de ficha transcritos de ${data.sourceRefs[0].document}. Elige un grupo para ver qué representa cada factor impreso en la ficha.`));

    const list = el('div', 'help-list');
    Object.keys(COUNTER_CATEGORIES).forEach((catId) => {
      const catInfo = COUNTER_CATEGORIES[catId];
      const count = data.counterTemplates.filter((t) => t.category === catId).length;
      if (!count) return;
      const card = el('button', 'help-card');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', catInfo.title));
      card.appendChild(el('span', 'help-card__source', `${count} tipo(s) de ficha · ${catInfo.source}`));
      card.addEventListener('click', () => { location.hash = `#/ayuda/counters/${catId}`; });
      list.appendChild(card);
    });
    wrap.appendChild(list);

    if (data.expansionNote) wrap.appendChild(el('p', 'source-refs', data.expansionNote));
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  async function renderCountersCategory(catId) {
    const navToken = Router.currentToken();
    const catInfo = COUNTER_CATEGORIES[catId];
    if (!catInfo) { renderNotFound(`Grupo de counters «${catId}» no encontrado`); return; }
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Counters', catInfo.title]);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    const data = await loadFactorMap();
    if (!Router.isCurrent(navToken)) return;
    const templates = data.counterTemplates.filter((t) => t.category === catId);

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', catInfo.title));

    const img = el('img', 'counter-sheet-image');
    img.src = `/data/counters/${catInfo.image}`;
    img.alt = `Hoja de referencia de counters — ${catInfo.title}`;
    wrap.appendChild(img);
    wrap.appendChild(el('p', 'source-refs', `Imagen de apoyo visual (${catInfo.source}); los valores de cada factor se leen en la ficha real del contador. AGENTS.md §11: la imagen es referencia, el cálculo usa los datos estructurados de abajo.`));

    const list = el('div', 'help-list');
    templates.forEach((tpl) => {
      const card = el('button', 'help-card');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', tpl.title));
      const stateNote = tpl.state ? ` · estado: ${tpl.state}` : '';
      card.appendChild(el('span', 'help-card__source', `${tpl.factors.length} factor(es)${stateNote}`));
      card.addEventListener('click', () => { location.hash = `#/ayuda/counters/${catId}/${tpl.id}`; });
      list.appendChild(card);
    });
    wrap.appendChild(list);
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  async function renderCounterDetail(catId, templateId) {
    const navToken = Router.currentToken();
    const catInfo = COUNTER_CATEGORIES[catId];
    if (!catInfo) { renderNotFound(`Grupo de counters «${catId}» no encontrado`); return; }
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    const data = await loadFactorMap();
    if (!Router.isCurrent(navToken)) return;
    const tpl = data.counterTemplates.find((t) => t.id === templateId && t.category === catId);
    if (!tpl) { renderNotFound(`Ficha «${templateId}» no encontrada en «${catId}»`); return; }

    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Counters', catInfo.title, tpl.title]);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', tpl.title));
    if (tpl.state) wrap.appendChild(el('p', 'turn-view__desc', `Estado de la ficha: ${tpl.state}`));
    if (tpl.matchHint) wrap.appendChild(el('p', 'turn-view__desc', tpl.matchHint));

    const bundle = await loadImageHotspots();
    const { viewer, activateFactor } = buildCounterViewer(tpl, data, catInfo.image, bundle);
    wrap.appendChild(viewer);
    wrap.appendChild(el('p', 'source-refs', 'Toca (o pasa el ratón sobre) un factor de la lista o su recuadro en la imagen para señalarlo. AGENTS.md §11: la imagen es apoyo visual, el cálculo usa los datos estructurados de abajo.'));

    wrap.appendChild(el('h2', 'table-viewer__section-title', 'Factores de la ficha'));
    const factorList = el('div', 'counter-factor-list counter-factor-list--interactive');
    tpl.factors.forEach((f) => {
      const vocab = data.factorVocabulary[f.factor];
      const row = el('div', 'counter-factor');
      row.tabIndex = 0;
      row.dataset.factor = f.factor;
      row.appendChild(el('span', 'counter-factor__label', vocab ? vocab.label : f.factor));
      row.appendChild(el('span', 'counter-factor__position', `Posición: ${translatePosition(f.position)}`));
      if (f.expansionOnly) row.appendChild(el('span', 'counter-factor__badge', 'Solo expansión'));
      if (f.note) row.appendChild(el('p', 'source-refs', f.note));
      if (f.roleBands) {
        const rb = el('div', 'counter-rolebands');
        rb.appendChild(el('span', null, `Atacante: ${f.roleBands.attacker.join(' / ')}`));
        rb.appendChild(el('span', null, `Objetivo: ${f.roleBands.target.join(' / ')}`));
        if (f.roleBands.explanation) rb.appendChild(el('p', 'source-refs', f.roleBands.explanation));
        row.appendChild(rb);
      }
      row.addEventListener('click', () => activateFactor(f.factor));
      row.addEventListener('mouseenter', () => activateFactor(f.factor));
      row.addEventListener('focus', () => activateFactor(f.factor));
      factorList.appendChild(row);
    });
    wrap.appendChild(factorList);

    const crossRefs = (data.crossReferences || []).filter((c) => (c.counterTemplateIds || []).includes(tpl.id));
    if (crossRefs.length) {
      wrap.appendChild(el('h2', 'table-viewer__section-title', 'Ambigüedades relacionadas'));
      crossRefs.forEach((c) => {
        wrap.appendChild(el('p', 'pending-note', `${c.resolution} (${c.ambiguity})`));
      });
    }

    wrap.appendChild(el('p', 'source-refs', tpl.sourceRefs.map((s) => s.document + (s.section ? ` — ${s.section}` : '')).join(' · ')));
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.HelpCounters = { renderCountersIndex, renderCountersCategory, renderCounterDetail };
})(typeof window !== 'undefined' ? window : globalThis);
