// Ayuda de planes de ataque y munición (roadmap Fase 3), dividida de
// views/help.js en correcciones03.md COR03-006 (2026-09-29). Cubre las 3
// tareas de Fase 3 "Ayuda de planes de ataque" / "Leyenda de iconos de
// ataque" / "Ayuda de tipos de munición" en una sola categoría de Ayuda
// rápida, interpretando de forma genérica los 18 archivos ya transcritos de
// data/ammunition/ (3 plantillas × 6 países) sin lógica de dominio
// hardcodeada por país (AGENTS.md §9/§11). `ICON_LABELS`/`renderIconChip`
// viven en core.js (AppCore) porque Combate por tipo también los usa.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, renderNotFound, backRow,
    AMMO_COUNTRIES, AMMO_CATEGORIES, loadAmmoFile, collectCategoryUnits, renderSourcePageGallery,
    appendAmmoUnitCrop, ICON_LABELS, renderIconChip
  } = AppCore;

  const PLAN_GROUP_LABELS = { antiShip: 'Antibuque (AsuW)', landAttack: 'Ataque terrestre', special: 'Planes especiales' };

  // Formatea el valor de un plan (completo o dañado) sin asumir loadFormat:
  // algunas entradas excepcionales (p.ej. "special" del CH) usan un
  // multiplicador de texto ("x2") en vez de {damage|heavy/light, range}.
  function formatPlanValue(value) {
    if (value === undefined || value === null) return '—';
    if (typeof value === 'string') return value;
    const parts = [];
    if (value.heavy !== undefined) {
      parts.push(`Pesada: ${value.heavy === null ? '—' : value.heavy}`, `Ligera: ${value.light === null ? '—' : value.light}`);
    } else if (value.damage !== undefined) {
      parts.push(`Valor: ${value.damage === null ? '—' : value.damage}`);
    }
    if (value.range !== undefined) parts.push(`Alcance: ${value.range}`);
    return parts.length ? parts.join(' · ') : '—';
  }

  async function renderMunicionIndex() {
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Munición']);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', 'Planes de ataque y munición'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Planes de ataque transcritos de las Tablas de Armamento (6 países) y leyenda de iconos de munición/ataque.'));

    const iconsCard = el('button', 'help-card help-card--highlight');
    iconsCard.type = 'button';
    iconsCard.appendChild(el('span', 'help-card__title', '🏷️ Leyenda de iconos de ataque y munición'));
    iconsCard.appendChild(el('span', 'help-card__source', 'Tablas de municiones.pdf — tipos de munición e iconos especiales.'));
    iconsCard.addEventListener('click', () => { location.hash = '#/ayuda/municion/iconos'; });
    wrap.appendChild(iconsCard);

    wrap.appendChild(el('h2', 'table-viewer__section-title', 'Por país'));
    const list = el('div', 'help-list');
    AMMO_COUNTRIES.forEach((c) => {
      const card = el('button', 'help-card');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', c.label));
      card.appendChild(el('span', 'help-card__source', 'Aviones tácticos · Naval · Unidades especiales'));
      card.addEventListener('click', () => { location.hash = `#/ayuda/municion/${c.id}`; });
      list.appendChild(card);
    });
    wrap.appendChild(list);
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  function renderMunicionIconLegend() {
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Munición', 'Iconos']);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', 'Leyenda de iconos de ataque y munición'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Cada icono aparece junto al plan de ataque al que corresponde. Fuente: Tablas de municiones.pdf / Tipos de munición.png.'));

    const grid = el('div', 'ammo-icon-grid');
    Object.keys(ICON_LABELS).forEach((iconId) => {
      const card = el('div', 'ammo-icon-card');
      const img = el('img', 'ammo-icon-card__img');
      img.src = `/data/sources/tcw_attack_workflows/icons/${iconId}.png`;
      img.alt = '';
      // Ampliación al tocar o con teclado (Enter/Espacio), Escape para cerrar,
      // además del :hover de escritorio ya cubierto por CSS — AGENTS.md §9.5/§4
      // (hover como mejora progresiva, toque como equivalente obligatorio).
      // El control es un botón de al menos 48×48 px con estado accesible (AJ-009).
      const btn = el('button', 'ammo-icon-card__btn');
      btn.type = 'button';
      btn.setAttribute('aria-label', `Ampliar el icono: ${ICON_LABELS[iconId]}`);
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        const zoomed = btn.classList.toggle('is-zoomed');
        btn.setAttribute('aria-pressed', String(zoomed));
      });
      btn.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && btn.classList.contains('is-zoomed')) {
          btn.classList.remove('is-zoomed');
          btn.setAttribute('aria-pressed', 'false');
        }
      });
      btn.appendChild(img);
      card.appendChild(btn);
      card.appendChild(el('span', 'ammo-icon-card__label', ICON_LABELS[iconId]));
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  async function renderMunicionCountry(countryId) {
    const navToken = Router.currentToken();
    const country = AMMO_COUNTRIES.find((c) => c.id === countryId);
    if (!country) { renderNotFound(`País «${countryId}» no encontrado`); return; }
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Munición', country.label]);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';

    let files;
    try {
      files = await Promise.all(AMMO_CATEGORIES.map((cat) => loadAmmoFile(cat.dir, countryId)));
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', country.label));

    const list = el('div', 'help-list');
    AMMO_CATEGORIES.forEach((cat, idx) => {
      const data = files[idx];
      const units = collectCategoryUnits(data, cat);
      const card = el('button', 'help-card');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', cat.title));
      const statusNote = data.status && data.status !== 'complete' ? ` · ${data.status}` : '';
      card.appendChild(el('span', 'help-card__source', `${units.length} unidad(es)${statusNote}`));
      card.addEventListener('click', () => { location.hash = `#/ayuda/municion/${countryId}/${cat.id}`; });
      list.appendChild(card);
    });
    wrap.appendChild(list);
    await renderSourcePageGallery(countryId, wrap);
    if (!Router.isCurrent(navToken)) return;
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  async function renderMunicionCategory(countryId, categoryId) {
    const navToken = Router.currentToken();
    const country = AMMO_COUNTRIES.find((c) => c.id === countryId);
    const cat = AMMO_CATEGORIES.find((c) => c.id === categoryId);
    if (!country || !cat) { renderNotFound(`Ruta de munición no encontrada`); return; }
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Munición', country.label, cat.title]);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';

    let data;
    try {
      data = await loadAmmoFile(cat.dir, countryId);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', `${country.label} — ${cat.title}`));
    if (data.schemaNote) wrap.appendChild(el('p', 'source-refs', data.schemaNote));

    let currentGroupLabel;
    let list = null;
    collectCategoryUnits(data, cat).forEach(({ unit, groupLabel }) => {
      if (!list || groupLabel !== currentGroupLabel) {
        currentGroupLabel = groupLabel;
        if (groupLabel) wrap.appendChild(el('h2', 'table-viewer__section-title', groupLabel));
        list = el('div', 'help-list');
        wrap.appendChild(list);
      }
      const card = el('button', 'help-card');
      card.type = 'button';
      const nameExtra = unit.nameEn ? ` (${unit.nameEn})` : '';
      card.appendChild(el('span', 'help-card__title', `${unit.name}${nameExtra}`));
      card.appendChild(el('span', 'help-card__source', [unit.class, unit.role].filter(Boolean).join(' · ') || unit.sourceSheet || ''));
      card.addEventListener('click', () => { location.hash = `#/ayuda/municion/${countryId}/${categoryId}/${unit.id}`; });
      list.appendChild(card);
    });
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  function renderPlanCard(letter, plan) {
    const card = el('div', 'ammo-plan-card');
    card.appendChild(el('span', 'ammo-plan-card__letter', letter));
    const body = el('div', 'ammo-plan-card__body');
    body.appendChild(el('span', 'ammo-plan-card__munition', plan.munition || '— sin munición en la hoja —'));
    if (plan.icons && plan.icons.length) {
      const iconsRow = el('div', 'ammo-icon-row');
      plan.icons.forEach((iconId) => iconsRow.appendChild(renderIconChip(iconId)));
      body.appendChild(iconsRow);
    }
    const values = el('div', 'ammo-plan-card__values');
    values.appendChild(el('span', null, `Completa — ${formatPlanValue(plan.full)}`));
    if (plan.damaged !== undefined) values.appendChild(el('span', null, `Dañada — ${formatPlanValue(plan.damaged)}`));
    body.appendChild(values);
    if (plan.note) body.appendChild(el('p', 'source-refs', plan.note));
    card.appendChild(body);
    return card;
  }

  async function renderMunicionUnitDetail(countryId, categoryId, unitId) {
    const navToken = Router.currentToken();
    const country = AMMO_COUNTRIES.find((c) => c.id === countryId);
    const cat = AMMO_CATEGORIES.find((c) => c.id === categoryId);
    if (!country || !cat) { renderNotFound('Ruta de munición no encontrada'); return; }
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';

    let data;
    try {
      data = await loadAmmoFile(cat.dir, countryId);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;
    const found = collectCategoryUnits(data, cat).find((e) => e.unit.id === unitId);
    if (!found) { renderNotFound(`Unidad «${unitId}» no encontrada`); return; }
    const { unit } = found;

    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', 'Munición', country.label, cat.title, unit.name]);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    const nameExtra = [unit.nameEn, unit.nameLocal].filter(Boolean).join(' · ');
    wrap.appendChild(el('h1', 'help-detail__title', unit.name + (nameExtra ? ` — ${nameExtra}` : '')));
    wrap.appendChild(el('p', 'turn-view__desc', [unit.class, unit.role, unit.sourceSheet].filter(Boolean).join(' · ')));
    if (unit.hasFullDamagedRows === false) wrap.appendChild(el('p', 'source-refs', 'Esta unidad no tiene distinción de unidad completa/dañada en la hoja: una sola fila de valores.'));
    if (unit.shipBadge !== undefined) wrap.appendChild(el('p', 'source-refs', `N.º de ficha: ${unit.shipBadge} (su significado exacto está pendiente de validar).`));
    if (unit.cruiseMissileMarker) {
      const cm = unit.cruiseMissileMarker;
      wrap.appendChild(el('p', 'source-refs', `Marcador de misil de crucero (${cm.type}): ${cm.flightData ? cm.flightData.raw : ''}`));
    }

    await appendAmmoUnitCrop(wrap, unit.id, unit);
    if (!Router.isCurrent(navToken)) return;

    const plans = unit.plans || {};
    if (unit.domainSplit === false) {
      // Helicópteros/artillería (data/ammunition/special-unit-plans): una
      // sola cuadrícula de letras compartida por ambos dominios, sin
      // envoltorio antiShip/landAttack (confirmado por el propio campo
      // domainSplit de la unidad, no por una heurística de forma).
      wrap.appendChild(el('h2', 'table-viewer__section-title', 'Planes de ataque'));
      const cardsWrap = el('div', 'ammo-plan-list');
      Object.keys(plans).forEach((letter) => cardsWrap.appendChild(renderPlanCard(letter, plans[letter])));
      wrap.appendChild(cardsWrap);
    } else {
      Object.keys(plans).forEach((groupKey) => {
        const groupValue = plans[groupKey];
        wrap.appendChild(el('h2', 'table-viewer__section-title', PLAN_GROUP_LABELS[groupKey] || groupKey));
        const cardsWrap = el('div', 'ammo-plan-list');
        Object.keys(groupValue).forEach((letter) => cardsWrap.appendChild(renderPlanCard(letter, groupValue[letter])));
        wrap.appendChild(cardsWrap);
      });
    }
    if (unit.note) wrap.appendChild(el('p', 'source-refs', unit.note));

    wrap.appendChild(el('p', 'source-refs', (data.sourceRefs || []).map((s) => s.document + (s.sheetTitle ? ` — ${s.sheetTitle}` : '')).join(' · ')));
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.HelpMunicion = {
    renderMunicionIndex,
    renderMunicionIconLegend,
    renderMunicionCountry,
    renderMunicionCategory,
    renderMunicionUnitDetail
  };
})(typeof window !== 'undefined' ? window : globalThis);
