// Panel lateral de ayuda visual (ajustes_de_turno.md TUR-009/010/011). Activar una entidad (aeródromo, puerto,
// unidades aéreas...) abre este panel sin sustituir la pantalla: el texto que originó la ayuda sigue visible.
// En tablet horizontal y escritorio se acopla a la derecha; en móvil sube como panel inferior. No usa `inert`
// ni fondo modal (a diferencia de la Ayuda rápida): lo que importa es ver a la vez la regla y la imagen.
//
// La selección de qué imagen mostrar la hace VisualHelpEngine sobre el catálogo declarativo
// data/visual-help/entities.json; las imágenes y zonas son las ya calibradas (Fase 22): este módulo no define
// coordenadas ni recortes propios.
(function (root) {
  'use strict';

  const { el } = AppWidgets;
  const Engine = VisualHelpEngine;

  let panel = null;
  let titleEl = null;
  let noteEl = null;
  let tabsEl = null;
  let bodyEl = null;
  let footEl = null;
  let opener = null;
  let renderToken = 0;

  function ensurePanel() {
    if (panel) return;
    panel = el('aside', 'vh-panel');
    panel.id = 'visual-help-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-labelledby', 'visual-help-title');
    panel.tabIndex = -1;

    const head = el('div', 'vh-panel__head');
    titleEl = el('h2', 'vh-panel__title');
    titleEl.id = 'visual-help-title';
    titleEl.tabIndex = -1;
    const closeBtn = el('button', 'icon-btn vh-panel__close', '✕');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Cerrar la ayuda visual');
    closeBtn.addEventListener('click', () => close());
    head.append(titleEl, closeBtn);

    noteEl = el('p', 'vh-panel__note');
    tabsEl = el('div', 'vh-panel__tabs');
    tabsEl.setAttribute('role', 'tablist');
    bodyEl = el('div', 'vh-panel__body');
    footEl = el('div', 'vh-panel__foot');
    panel.append(head, noteEl, tabsEl, bodyEl, footEl);
    panel.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); close(); }
    });
    document.body.appendChild(panel);
  }

  function isOpen() { return !!panel && !panel.hidden; }

  function close() {
    if (!isOpen()) return;
    renderToken += 1;
    panel.hidden = true;
    document.documentElement.classList.remove('has-vh-panel');
    const back = opener;
    opener = null;
    if (back && document.contains(back)) back.focus();
  }

  const STATUS_NOTES = {
    generic: 'Ejemplo genérico: la regla no fija un tipo concreto, así que se muestran todos los tipos disponibles.',
    restricted: 'La regla restringe el tipo: solo se muestran los tipos que admite.',
    concrete: '',
    'missing-context': 'Falta contexto para elegir un tipo: se muestran todos, sin escoger ninguno por ti.',
    'no-compatible': 'Ninguna ficha de este grupo tiene ese factor: ayuda visual pendiente.',
    'unknown-entity': 'Ayuda visual pendiente: la entidad no está en el catálogo.'
  };

  async function renderTemplate(template, ref, token) {
    const wrap = el('div', 'vh-panel__template');
    wrap.appendChild(el('h3', 'vh-panel__template-title', template.label));
    if (template.kind === 'counter-template') {
      const [data, bundle] = await Promise.all([AppData.loadFactorMap(), AppData.loadImageHotspots()]);
      const tpl = data.counterTemplates.find((t) => t.id === template.templateId);
      if (!tpl) {
        wrap.appendChild(el('p', 'pending-note', 'Ayuda visual pendiente: la ficha no existe en el catálogo de fichas.'));
        return wrap;
      }
      wrap.appendChild(el('p', 'source-refs', tpl.title));
      const { viewer, activateFactor } = AppVisuals.buildCounterViewer(tpl, data, tpl.region.sourceImage, bundle);
      wrap.appendChild(viewer);
      const factor = Engine.wantedFactors(ref).find((id) => tpl.factors.some((f) => f.factor === id));
      if (factor) activateFactor(factor);
    } else if (template.kind === 'board') {
      const ok = await AppVisuals.appendBoardIdentificationHint(wrap, template.boardType, ref.hotspotId);
      if (!ok) wrap.appendChild(el('p', 'pending-note', 'Ayuda visual pendiente: esta tarjeta no está calibrada.'));
    } else if (template.kind === 'ammo-plan') {
      const file = await AppData.loadAmmoFile(template.dir, template.country);
      const unit = ['units', 'surfaceShips', 'submarines'].flatMap((k) => file[k] || []).find((u) => u.id === template.unitId);
      const ok = unit && await AppVisuals.appendAmmoPlanHotspots(wrap, unit);
      if (!ok) wrap.appendChild(el('p', 'pending-note', 'Ayuda visual pendiente: este plan no está calibrado.'));
    } else if (template.kind === 'link') {
      const btn = el('button', 'btn btn--secondary', `Abrir: ${template.label}`);
      btn.type = 'button';
      btn.addEventListener('click', () => { close(); location.hash = template.hash; });
      wrap.appendChild(btn);
    }
    if (token !== renderToken) return null;
    return wrap;
  }

  async function showTemplate(templates, index, ref) {
    const token = (renderToken += 1);
    Array.from(tabsEl.children).forEach((b, i) => {
      b.setAttribute('aria-selected', String(i === index));
      b.classList.toggle('is-active', i === index);
    });
    bodyEl.textContent = '';
    bodyEl.appendChild(el('p', 'loading', 'Cargando…'));
    const node = await renderTemplate(templates[index], ref, token);
    if (!node || token !== renderToken) return;
    bodyEl.textContent = '';
    bodyEl.appendChild(node);
  }

  // Abre el panel para una referencia { entityType, scope|subsetIds|templateId, factorId?, hotspotId?, label? }.
  async function open(ref, openerEl) {
    ensurePanel();
    const catalog = await AppData.loadVisualHelpCatalog();
    const factorMap = Engine.wantedFactors(ref).length ? await AppData.loadFactorMap() : null;
    const selection = Engine.selectTemplates(catalog, ref, { factorMap });
    opener = openerEl || document.activeElement;
    panel.hidden = false;
    document.documentElement.classList.add('has-vh-panel');

    titleEl.textContent = (selection.entity && selection.entity.label) || ref.label || 'Ayuda visual';
    const notes = [ref.fieldLabel ? `Campo: ${ref.fieldLabel}.` : '', STATUS_NOTES[selection.status], selection.entity ? selection.entity.summary : ''].filter(Boolean);
    noteEl.textContent = notes.join(' ');
    tabsEl.textContent = '';
    bodyEl.textContent = '';
    footEl.textContent = '';

    if (!selection.templates.length) {
      bodyEl.appendChild(el('p', 'pending-note', STATUS_NOTES[selection.status] || 'Ayuda visual pendiente.'));
    } else {
      if (selection.templates.length > 1) {
        selection.templates.forEach((t, i) => {
          const tab = el('button', 'vh-panel__tab', t.label);
          tab.type = 'button';
          tab.setAttribute('role', 'tab');
          tab.addEventListener('click', () => { showTemplate(selection.templates, i, ref); });
          tabsEl.appendChild(tab);
        });
      }
      showTemplate(selection.templates, 0, ref);
    }
    if (selection.entity && selection.entity.helpHash) {
      const full = el('button', 'btn btn--secondary', 'Abrir la ayuda completa');
      full.type = 'button';
      full.addEventListener('click', () => { close(); location.hash = selection.entity.helpHash; });
      footEl.appendChild(full);
    }
    if (selection.entity && catalog.sourceRefs) footEl.appendChild(el('p', 'source-refs', `Fuente: ${catalog.sourceRefs.map((r) => r.document).join(' · ')}`));
    titleEl.focus();
  }

  // Dibuja un texto cuyas menciones a entidades son botones accesibles (marcadores `[[id]]` con su lista `refs`):
  // cada mención abre el panel lateral sin cambiar la ruta principal.
  function renderTextWithRefs(container, text, refs, className) {
    const p = el('p', className || 'phase-view__desc');
    Engine.splitTextWithRefs(text, refs).forEach((part) => {
      if (part.type === 'text') { p.appendChild(document.createTextNode(part.text)); return; }
      const btn = el('button', 'vh-ref', part.ref.label);
      btn.type = 'button';
      btn.setAttribute('aria-haspopup', 'true');
      btn.setAttribute('aria-label', `${part.ref.label}: abrir ayuda visual`);
      btn.addEventListener('click', () => { open(part.ref, btn); });
      p.appendChild(btn);
    });
    container.appendChild(p);
    return p;
  }

  // El panel solo acompaña a la pantalla que lo abrió: cambiar de ruta lo cierra.
  window.addEventListener('hashchange', () => { if (isOpen()) { renderToken += 1; panel.hidden = true; document.documentElement.classList.remove('has-vh-panel'); opener = null; } });

  root.AppVisualHelp = { open, close, isOpen, renderTextWithRefs };
})(typeof window !== 'undefined' ? window : globalThis);
