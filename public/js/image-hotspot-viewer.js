// Componente único de ayudas sobre imágenes (ajuste_imagenes.md, IMG-007).
//
// Muestra una imagen (o una región de ella) con zonas interactivas ("hotspots") cuyas
// coordenadas llegan de datos versionados (data/image-hotspots/), normalizadas entre 0 y 1
// respecto de la imagen. No conoce reglas de counters, puertos ni aeródromos: solo imagen,
// zonas, textos y selección. Nada se calcula a partir de los píxeles.
//
// Accesibilidad (§5): cada zona es un control alcanzable con Tab y activable con Enter/Espacio,
// con área táctil mínima de 48×48 px aunque el borde visible sea menor; hay una lista textual
// espejo; el popover ofrece lo mismo con puntero, foco, toque y lector de pantalla; Escape
// cierra; una sola zona activa; el popover permanece dentro del contenedor.
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MIN_TOUCH_PX = 48;
  const HOVER_OPEN_MS = 120;
  const HOVER_CLOSE_MS = 220;

  const STATUS_LABELS = {
    generated: 'Pendiente de revisión',
    needs_review: 'Pendiente de validar',
    verified: 'Verificado',
    rejected: 'Rechazado'
  };

  function svgEl(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach((k) => node.setAttribute(k, String(attrs[k])));
    return node;
  }

  function htmlEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  let uid = 0;

  // options:
  //   image:    { src, width, height, alt }   dimensiones naturales de la imagen
  //   view:     { x, y, width, height }       región visible (normalizada); por defecto toda
  //   hotspots: [{ id, label, summary, rect:{x,y,width,height}, status, basicOrExpansion,
  //                sourceText, note }]        rect normalizado respecto de la imagen entera
  //   selectedId, onSelect(id|null, pinned)  pinned=false cuando solo es una vista previa (hover/foco)
  function create(options) {
    const instanceId = `ihv${uid += 1}`;
    const { image, hotspots } = options;
    const view = options.view || { x: 0, y: 0, width: 1, height: 1 };
    const vbX = view.x * image.width;
    const vbY = view.y * image.height;
    const vbW = view.width * image.width;
    const vbH = view.height * image.height;

    const element = htmlEl('div', 'ihv');
    const stage = htmlEl('div', 'ihv__stage');
    stage.style.setProperty('--ihv-ratio', `${vbW} / ${vbH}`);
    if (options.maxWidthPx) stage.style.maxWidth = `${options.maxWidthPx}px`;
    const svg = svgEl('svg', { class: 'ihv__svg', viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`, role: 'img', 'aria-label': image.alt || 'Imagen explicativa' });
    svg.appendChild(svgEl('image', { href: image.src, x: 0, y: 0, width: image.width, height: image.height }));

    const popover = htmlEl('div', 'ihv__popover');
    popover.id = `${instanceId}-popover`;
    popover.setAttribute('role', 'region');
    popover.hidden = true;

    const list = htmlEl('ul', 'ihv__list');
    list.setAttribute('aria-label', 'Zonas de la imagen');

    const zones = new Map();
    let selectedId = null;
    let pinned = false;
    let openTimer = null;
    let closeTimer = null;

    hotspots.forEach((hs) => {
      const g = svgEl('g', { class: `ihv__zone is-${hs.status || 'needs_review'}`, 'data-id': hs.id });
      let hit = null;
      let mark = null;
      if (hs.rect) {
        const x = hs.rect.x * image.width;
        const y = hs.rect.y * image.height;
        const w = hs.rect.width * image.width;
        const h = hs.rect.height * image.height;
        const r = Math.min(10, Math.min(w, h) / 3);
        // Con polygon (tarjetas escaneadas con inclinación) el borde sigue la forma girada; el área
        // táctil sigue siendo la caja que la contiene.
        mark = hs.polygon
          ? svgEl('polygon', { class: 'ihv__mark', points: hs.polygon.map((p) => `${p[0] * image.width},${p[1] * image.height}`).join(' ') })
          : svgEl('rect', { class: 'ihv__mark', x, y, width: w, height: h, rx: r, ry: r });
        hit = svgEl('rect', { class: 'ihv__hit', x, y, width: w, height: h, tabindex: 0, role: 'button', 'aria-label': hs.label, 'aria-pressed': 'false' });
        g.appendChild(mark);
        g.appendChild(hit);
        svg.appendChild(g);
      }

      const li = htmlEl('li');
      const btn = htmlEl('button', 'ihv__list-btn', hs.label);
      btn.type = 'button';
      btn.dataset.id = hs.id;
      btn.setAttribute('aria-pressed', 'false');
      if (!hs.rect) btn.title = 'Esta zona aún no tiene posición propia en la imagen';
      li.appendChild(btn);
      list.appendChild(li);

      zones.set(hs.id, { hs, g, hit, mark, btn });
    });

    stage.appendChild(svg);
    stage.appendChild(popover);
    element.appendChild(stage);
    if (options.listCollapsed) {
      // Muchas zonas: la lista textual espejo sigue disponible, plegada, para no alargar la pantalla.
      const details = htmlEl('details', 'ihv__list-wrap');
      details.appendChild(htmlEl('summary', null, `Lista de zonas (${hotspots.length})`));
      details.appendChild(list);
      element.appendChild(details);
    } else {
      element.appendChild(list);
    }

    // ---- Área táctil mínima de 48×48 px (centrada en la zona) ----
    function layoutHits() {
      const rendered = svg.getBoundingClientRect();
      if (!rendered.width) return;
      const scale = vbW / rendered.width; // unidades del viewBox por píxel CSS
      const min = MIN_TOUCH_PX * scale;
      zones.forEach(({ hs, hit }) => {
        if (!hit) return;
        const x = hs.rect.x * image.width;
        const y = hs.rect.y * image.height;
        const w = hs.rect.width * image.width;
        const h = hs.rect.height * image.height;
        const hw = Math.max(w, min);
        const hh = Math.max(h, min);
        hit.setAttribute('x', x + w / 2 - hw / 2);
        hit.setAttribute('y', y + h / 2 - hh / 2);
        hit.setAttribute('width', hw);
        hit.setAttribute('height', hh);
      });
      if (selectedId) positionPopover();
    }
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(layoutHits).observe(svg);

    // ---- Popover ----
    function fillPopover(entry) {
      const { hs } = entry;
      popover.textContent = '';
      popover.setAttribute('aria-label', `Explicación: ${hs.label}`);
      popover.appendChild(htmlEl('p', 'ihv__title', hs.label));
      popover.appendChild(htmlEl('p', 'ihv__summary', hs.summary));
      const badges = htmlEl('p', 'ihv__badges');
      if (hs.basicOrExpansion && hs.basicOrExpansion !== 'basic') {
        badges.appendChild(htmlEl('span', 'ihv__badge ihv__badge--expansion', hs.basicOrExpansion === 'expansion' ? 'Solo expansión' : 'Expansión en algunas fichas'));
      }
      if (hs.status && hs.status !== 'verified') {
        badges.appendChild(htmlEl('span', 'ihv__badge ihv__badge--review', STATUS_LABELS[hs.status] || hs.status));
      }
      if (badges.childNodes.length) popover.appendChild(badges);
      if (hs.note) popover.appendChild(htmlEl('p', 'ihv__note', hs.note));
      if (hs.sourceText) {
        const details = htmlEl('details', 'ihv__source');
        details.appendChild(htmlEl('summary', null, 'Fuente y trazabilidad'));
        details.appendChild(htmlEl('p', null, hs.sourceText));
        popover.appendChild(details);
      }
    }

    function positionPopover() {
      const entry = zones.get(selectedId);
      if (!entry || popover.hidden) return;
      popover.classList.remove('is-docked');
      const stageRect = stage.getBoundingClientRect();
      if (!stageRect.width) return;
      const scale = stageRect.width / vbW;
      let cx;
      let top;
      let bottom;
      if (entry.hs.rect) {
        cx = (entry.hs.rect.x * image.width + entry.hs.rect.width * image.width / 2 - vbX) * scale;
        top = (entry.hs.rect.y * image.height - vbY) * scale;
        bottom = top + entry.hs.rect.height * image.height * scale;
      } else {
        cx = stageRect.width / 2;
        top = 0;
        bottom = 0;
      }
      const gap = 12;
      const width = popover.offsetWidth || 260;
      const height = popover.offsetHeight || 80;
      // El popover no se superpone nunca a la imagen (cubriría el factor consultado y los
      // rótulos de al lado): va a la derecha de la imagen, si no a la izquierda y, si la
      // ventana es estrecha, acoplado debajo de ella.
      const rightFits = stageRect.right + gap + width <= window.innerWidth - 8;
      const leftFits = stageRect.left - gap - width >= 8;
      if (!rightFits && !leftFits) {
        popover.classList.add('is-docked');
        popover.style.left = '';
        popover.style.top = '';
        return;
      }
      const alignedTop = Math.min(Math.max(top, 0), Math.max(stageRect.height - height, 0));
      popover.style.left = `${rightFits ? stageRect.width + gap : -(width + gap)}px`;
      popover.style.top = `${alignedTop}px`;
    }

    function setActiveStyles(id) {
      zones.forEach((z, zid) => {
        const active = zid === id;
        z.g.classList.toggle('is-active', active);
        if (z.hit) z.hit.setAttribute('aria-pressed', String(active && pinned));
        z.btn.setAttribute('aria-pressed', String(active));
        z.btn.classList.toggle('is-active', active);
        if (z.hit) {
          if (active) z.hit.setAttribute('aria-describedby', popover.id); else z.hit.removeAttribute('aria-describedby');
        }
      });
    }

    function select(id, opts) {
      const keepPinned = opts && opts.pin;
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      if (id === null || !zones.has(id)) {
        selectedId = null;
        pinned = false;
        popover.hidden = true;
        setActiveStyles(null);
        if (options.onSelect) options.onSelect(null);
        return;
      }
      selectedId = id;
      pinned = Boolean(keepPinned);
      fillPopover(zones.get(id));
      popover.hidden = false;
      setActiveStyles(id);
      positionPopover();
      if (options.onSelect) options.onSelect(id, pinned);
    }

    // ---- Eventos ----
    zones.forEach((z, id) => {
      const activate = () => { if (selectedId === id && pinned) select(null); else select(id, { pin: true }); };
      z.btn.addEventListener('click', activate);
      if (!z.hit) return;
      z.hit.addEventListener('click', activate);
      z.hit.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(); }
      });
      z.hit.addEventListener('focus', () => { if (!pinned) select(id); });
      z.hit.addEventListener('pointerenter', (ev) => {
        if (ev.pointerType !== 'mouse') return; // hover solo con puntero: toque y teclado usan otros gestos
        clearTimeout(closeTimer);
        clearTimeout(openTimer);
        openTimer = setTimeout(() => { if (!pinned) select(id); }, HOVER_OPEN_MS);
      });
      z.hit.addEventListener('pointerleave', (ev) => {
        if (ev.pointerType !== 'mouse') return;
        clearTimeout(openTimer);
        closeTimer = setTimeout(() => { if (!pinned && selectedId === id) select(null); }, HOVER_CLOSE_MS);
      });
    });
    popover.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    popover.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType !== 'mouse') return;
      closeTimer = setTimeout(() => { if (!pinned) select(null); }, HOVER_CLOSE_MS);
    });
    element.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && selectedId) { ev.stopPropagation(); select(null); }
    });
    // Tocar fuera cierra la zona fijada.
    document.addEventListener('pointerdown', (ev) => {
      if (!selectedId || !pinned) return;
      if (element.contains(ev.target)) return;
      select(null);
    }, true);

    if (options.selectedId) select(options.selectedId, { pin: options.pinSelected !== false });
    requestAnimationFrame(layoutHits);

    return { element, select: (id) => select(id, { pin: true }), selectedId: () => selectedId };
  }

  root.ImageHotspotViewer = { create, STATUS_LABELS, MIN_TOUCH_PX };
})(typeof window !== 'undefined' ? window : globalThis);
