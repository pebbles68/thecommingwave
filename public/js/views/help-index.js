// Índice de "Ayuda rápida" (correcciones.md COR-005, paso 4; dividido de
// views/help.js en correcciones03.md COR03-006, 2026-09-29). Solo la
// pantalla de entrada (categorías, favoritos, recientes) y el fallback
// genérico de una categoría sin implementar todavía — cada categoría real
// vive en su propio módulo (help-tablas.js, help-deteccion.js, etc.).
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, renderNotFound,
    QUICK_HELP_CATEGORIES, loadFavoriteHelp, toggleFavoriteHelp, loadRecentHelp
  } = AppCore;

  function renderHelpIndex() {
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida']);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-view');
    wrap.appendChild(el('h1', 'help-view__title', 'Ayuda rápida'));

    const searchCard = el('button', 'help-card help-card--highlight');
    searchCard.type = 'button';
    searchCard.appendChild(el('span', 'help-card__title', '🔎 Buscar'));
    searchCard.appendChild(el('span', 'help-card__source', 'Por nombre de unidad, munición, tipo de combate, ficha o tabla.'));
    searchCard.addEventListener('click', () => { location.hash = '#/ayuda/buscar'; });
    wrap.appendChild(searchCard);

    const favorites = loadFavoriteHelp().map((id) => QUICK_HELP_CATEGORIES.find((c) => c.id === id)).filter(Boolean);
    if (favorites.length) {
      wrap.appendChild(el('h2', 'table-viewer__section-title', '⭐ Favoritos'));
      const favList = el('div', 'help-list');
      favorites.forEach((cat) => {
        const card = el('button', 'help-card');
        card.type = 'button';
        card.appendChild(el('span', 'help-card__title', cat.title));
        card.addEventListener('click', () => { location.hash = `#/ayuda/${cat.id}`; });
        favList.appendChild(card);
      });
      wrap.appendChild(favList);
    }

    const recentIds = loadRecentHelp().slice().reverse().filter((id) => !favorites.some((f) => f.id === id));
    const recents = recentIds.map((id) => QUICK_HELP_CATEGORIES.find((c) => c.id === id)).filter(Boolean).slice(0, 4);
    if (recents.length) {
      wrap.appendChild(el('h2', 'table-viewer__section-title', '🕐 Recientes'));
      const recentList = el('div', 'help-list');
      recents.forEach((cat) => {
        const card = el('button', 'help-card');
        card.type = 'button';
        card.appendChild(el('span', 'help-card__title', cat.title));
        card.addEventListener('click', () => { location.hash = `#/ayuda/${cat.id}`; });
        recentList.appendChild(card);
      });
      wrap.appendChild(recentList);
    }

    if (favorites.length || recents.length) wrap.appendChild(el('h2', 'table-viewer__section-title', 'Todas las categorías'));

    const list = el('div', 'phase-list');
    QUICK_HELP_CATEGORIES.forEach((cat) => {
      const row = el('div', 'phase-card-wrapper');
      const card = el('button', 'help-card phase-card__main');
      card.type = 'button';
      card.appendChild(el('span', 'help-card__title', cat.title));
      card.appendChild(el('span', 'help-card__source', cat.source));
      card.addEventListener('click', () => { location.hash = `#/ayuda/${cat.id}`; });
      row.appendChild(card);

      const isFav = loadFavoriteHelp().includes(cat.id);
      const favBtn = el('button', 'btn btn--secondary phase-card__skip', isFav ? '★ Quitar de favoritos' : '☆ Añadir a favoritos');
      favBtn.type = 'button';
      favBtn.addEventListener('click', () => { toggleFavoriteHelp(cat.id); renderHelpIndex(); });
      row.appendChild(favBtn);

      list.appendChild(row);
    });
    wrap.appendChild(list);
    viewRoot.appendChild(wrap);
  }

  function renderHelpCategory(catId) {
    const cat = QUICK_HELP_CATEGORIES.find((c) => c.id === catId);
    if (!cat) { renderNotFound(`Ayuda «${catId}» no encontrada`); return; }
    setBreadcrumb(['TCW Assistant', 'Ayuda rápida', cat.title]);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', cat.title));
    wrap.appendChild(el('p', 'pending-note', `Esta ayuda todavía no está disponible. Fuente prevista: «${cat.source}».`));
    const backBtn = el('button', 'btn btn--secondary', '← Volver');
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => { history.back(); });
    wrap.appendChild(backBtn);
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.HelpIndex = { renderHelpIndex, renderHelpCategory };
})(typeof window !== 'undefined' ? window : globalThis);
