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
    return crop;
  }

  // Panel que «separa» la zona de la hoja: la zona ampliada a la izquierda y, a su lado, el cuadro con sus fases.
  function renderToolbox(host, template, sheet, zone) {
    host.textContent = '';
    if (!zone) { host.hidden = true; return; }
    const box = TurnSheetEngine.buildToolbox(template, zone);
    const close = () => renderToolbox(host, template, sheet, null);
    host.hidden = false;
    const backdrop = el('div', 'turn-commented__backdrop');
    backdrop.addEventListener('click', close);
    host.appendChild(backdrop);
    const panel = el('div', 'turn-commented__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', box.title);
    const closeBtn = el('button', 'btn btn--secondary turn-commented__toolbox-close', 'Cerrar');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', close);
    panel.appendChild(closeBtn);
    panel.appendChild(el('h2', 'turn-commented__toolbox-title', box.title));
    const body = el('div', 'turn-commented__panel-body');
    body.appendChild(buildCrop(sheet, zone));
    const side = el('div', 'turn-commented__toolbox');
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
    closeBtn.focus({ preventScroll: true });
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
    toolbox.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); renderToolbox(toolbox, template, sheet, null); } });

    const viewer = ImageHotspotViewer.create({
      image: { src: `/${sheet.image.src}`, width: sheet.image.width, height: sheet.image.height, alt: 'Hoja de turnos con sus fases y segmentos' },
      hotspots,
      listCollapsed: true,
      maxWidthPx: 1700,
      // El cuadro se cierra con «Cerrar» o al fijar otra zona.
      onSelect: (id, pinned) => { if (id && pinned) renderToolbox(toolbox, template, sheet, zonesById.get(id)); }
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
