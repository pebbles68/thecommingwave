// Turno Comentado (Fase 24, TC-003): la hoja de seguimiento de turno en imagen, con sus
// segmentos como zonas interactivas (data/image-hotspots/turn-sheet.json). Al pasar o tocar se
// resalta la zona; un clic muestra el cuadro con las fases de ese apartado; elegir una abre su
// página. La información sale del modelo canónico del turno (TurnSheetEngine); esta vista solo
// la dibuja. Depende de AppCore, ImageHotspotViewer y TurnSheetEngine.
(function (root) {
  'use strict';

  const { viewRoot, setBreadcrumb, el, renderNotFound, loadTurnTemplate, backRow } = AppCore;

  let sheetCache = null;
  async function loadSheet() {
    if (sheetCache) return sheetCache;
    const res = await fetch('/data/image-hotspots/turn-sheet.json');
    if (!res.ok) throw new Error('No se pudo cargar turn-sheet.json');
    sheetCache = await res.json();
    return sheetCache;
  }

  function linkButton(label, hash, className) {
    const btn = el('button', className || 'btn btn--secondary', label);
    btn.type = 'button';
    btn.addEventListener('click', () => { location.hash = hash; });
    return btn;
  }

  // Recorte ampliado de la zona (solo esa parte de la hoja), dibujado como fondo de una caja con la proporción de la zona.
  function buildCrop(sheet, zone) {
    const [zx, zy, zw, zh] = zone.rect;
    const m = 0.006; // pequeño margen alrededor de la zona (fracción de la hoja)
    const x = Math.max(0, zx - m);
    const y = Math.max(0, zy - m);
    const w = Math.min(1 - x, zw + 2 * m);
    const h = Math.min(1 - y, zh + 2 * m);
    const pxW = w * sheet.image.width;
    const pxH = h * sheet.image.height;
    const dispH = Math.max(240, Math.min(window.innerHeight * 0.62, pxH * 2.4));
    const dispW = Math.min(pxW * (dispH / pxH), window.innerWidth * 0.4);
    const crop = el('div', 'turn-commented__crop');
    crop.setAttribute('role', 'img');
    crop.setAttribute('aria-label', 'Zona ampliada de la hoja de turnos');
    // La caja conserva la proporción de la zona y se encoge con el panel, de modo que la lista de fases
    // queda siempre a su derecha; el fondo se coloca en porcentajes para que el recorte no dependa del tamaño.
    crop.style.width = `${Math.round(dispW)}px`;
    crop.style.aspectRatio = `${pxW} / ${pxH}`;
    crop.style.backgroundImage = `url(/${sheet.image.src})`;
    crop.style.backgroundSize = `${100 / w}% ${100 / h}%`;
    crop.style.backgroundPosition = `${w < 1 ? (x / (1 - w)) * 100 : 0}% ${h < 1 ? (y / (1 - h)) * 100 : 0}%`;
    return { crop, region: { x, y, w, h } };
  }

  // Desde la posición real del recorte sobre la hoja hasta su sitio de destino: el trozo se amplía y «viene al frente»
  // (técnica FLIP: se mide el destino, se coloca la caja en el origen con una transformación y se anima hasta quitarla).
  function flyToFront(crop, region, svg, onDone) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = svg.getBoundingClientRect();
    const to = crop.getBoundingClientRect();
    if (reduce || !from.width || !to.width) { onDone(); return; }
    const sx = from.left + region.x * from.width;
    const sy = from.top + region.y * from.height;
    const sw = region.w * from.width;
    const sh = region.h * from.height;
    crop.style.transformOrigin = 'top left';
    crop.style.transform = `translate(${sx - to.left}px, ${sy - to.top}px) scale(${sw / to.width}, ${sh / to.height})`;
    crop.getBoundingClientRect(); // fuerza el cálculo de estilos antes de iniciar la transición
    crop.style.transition = 'transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    crop.style.transform = 'none';
    let done = false;
    const finish = () => { if (done) return; done = true; crop.style.transition = ''; onDone(); };
    crop.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 650);
  }

  // Escape cierra el detalle aunque el foco aún no haya llegado a él (durante la animación).
  let escapeHandler = null;
  function clearEscape() {
    if (escapeHandler) document.removeEventListener('keydown', escapeHandler, true);
    escapeHandler = null;
  }

  // Detalle sin marco: la zona ampliada al frente y, cuando se posiciona, las opciones a su derecha.
  function renderToolbox(host, template, sheet, zone, svg) {
    host.textContent = '';
    host.classList.remove('is-ready');
    clearEscape();
    if (!zone) { host.hidden = true; return; }
    const box = TurnSheetEngine.buildToolbox(template, zone);
    const close = () => renderToolbox(host, template, sheet, null, svg);
    host.hidden = false;
    escapeHandler = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } };
    document.addEventListener('keydown', escapeHandler, true);
    const backdrop = el('div', 'turn-commented__backdrop');
    backdrop.addEventListener('click', close);
    host.appendChild(backdrop);
    const panel = el('div', 'turn-commented__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', box.title);
    const closeBtn = el('button', 'turn-commented__toolbox-close', 'Cerrar ✕');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', close);
    host.appendChild(closeBtn);
    const body = el('div', 'turn-commented__panel-body');
    const { crop, region } = buildCrop(sheet, zone);
    body.appendChild(crop);
    const side = el('div', 'turn-commented__toolbox');
    side.appendChild(el('h2', 'turn-commented__toolbox-title', box.title));
    if (box.note) side.appendChild(el('p', 'source-refs', box.note));
    side.appendChild(linkButton(box.pageLabel, box.pageHash, 'btn btn--primary'));
    if (box.items.length) {
      side.appendChild(el('p', 'turn-commented__toolbox-label', 'Fases de este apartado'));
      const list = el('div', 'turn-commented__items');
      box.items.forEach((item, i) => list.appendChild(linkButton(`${i + 1}. ${item.label}`, item.hash)));
      side.appendChild(list);
    }
    if (box.extras.length) {
      side.appendChild(el('p', 'turn-commented__toolbox-label', 'No olvides'));
      const list = el('div', 'turn-commented__items');
      box.extras.forEach((item) => list.appendChild(linkButton(item.label, item.hash)));
      side.appendChild(list);
    }
    body.appendChild(side);
    panel.appendChild(body);
    host.appendChild(panel);
    flyToFront(crop, region, svg, () => {
      if (host.hidden || !host.contains(panel)) return;
      host.classList.add('is-ready');
      closeBtn.focus({ preventScroll: true });
    });
  }

  async function renderTurnCommented() {
    const navToken = Router.currentToken();
    AppCore.clearLastTurnContext();
    setBreadcrumb(['TCW Assistant', 'Turno Comentado']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let template;
    let sheet;
    try {
      [template, sheet] = await Promise.all([loadTurnTemplate(), loadSheet()]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'turn-commented');
    wrap.appendChild(el('h1', 'help-detail__title', 'Turno Comentado'));
    wrap.appendChild(el('p', 'turn-commented__intro', 'Esta es la hoja de seguimiento del turno. Pasa el ratón o toca un apartado para resaltarlo; púlsalo para ver sus fases y elige la que necesites. Arriba está el día impar (fases 1.ª a 3.ª) y abajo el día par (4.ª a 6.ª); Estrategia (Fase 0) va una vez por banda.'));

    const hotspots = sheet.zones.map((z) => TurnSheetEngine.buildHotspot(template, z));
    const zonesById = new Map(sheet.zones.map((z) => [z.id, z]));
    const toolbox = el('section', 'turn-commented__focus');
    toolbox.hidden = true;
    toolbox.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); renderToolbox(toolbox, template, sheet, null, viewer.element.querySelector('.ihv__svg')); } });

    let viewer;
    viewer = ImageHotspotViewer.create({
      image: { src: `/${sheet.image.src}`, width: sheet.image.width, height: sheet.image.height, alt: 'Hoja de turnos con sus fases y segmentos' },
      hotspots,
      listCollapsed: true,
      maxWidthPx: 1700,
      // El cuadro se cierra con «Cerrar» o al fijar otra zona.
      onSelect: (id, pinned) => { if (id && pinned) renderToolbox(toolbox, template, sheet, zonesById.get(id), viewer.element.querySelector('.ihv__svg')); }
    });
    // El cuadro va dentro del contenedor del visor: tocarlo no cuenta como «tocar fuera» (que cerraría la zona,
    // movería el diseño entre pulsar y soltar y anularía el clic).
    viewer.element.appendChild(toolbox);
    wrap.appendChild(viewer.element);
    wrap.appendChild(el('p', 'pending-note', 'Las zonas de la hoja están pendientes de revisión por el mantenedor; las páginas de cada fase son, de momento, las del Turno guiado.'));
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.TurnCommented = { renderTurnCommented };
})(typeof window !== 'undefined' ? window : globalThis);
