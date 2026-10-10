// Apoyo visual con imágenes de las fuentes (correcciones03.md COR03-006,
// dividido desde public/js/core.js): galerías de hojas/páginas originales,
// recorte de la fila de una unidad en su hoja de armamento, y el visor de
// fichas/counters con recuadro rojo (AGENTS.md §9.2/§9.4). Combina datos
// (`AppData`) con constructores DOM (`AppWidgets`); consumido a la vez por
// "Ayuda rápida" y por los wizards. Expuesto como `AppVisuals`.
(function (root) {
  'use strict';

  const { el, openImageLightbox, ICON_LABELS } = AppWidgets;
  const { loadPhaseSourceImages, loadAmmoUnitRegions, loadAmmoSourcePages, loadFactorMap, loadImageHotspots, loadBoardHotspots, loadAmmoPlanHotspots } = AppData;
  const viewRoot = document.getElementById('view-root');

  // Apoyo visual (AGENTS.md §3.1/§11) para subfases sin modelo de datos propio
  // todavía (no hay puertos/aeródromos transcritos, ver
  // data/sources/sources.json#aerodromos-puertos-1/2): galería de las hojas
  // completas tal como aparecen en el PDF de origen, mismo patrón que
  // renderSourcePageGallery para Tablas de Armamento. Compartida entre
  // views/turn.js (subfases con SUBPHASE_IMAGE_GALLERIES) y cualquier otra
  // vista que necesite el mismo patrón de galería.
  async function renderPhaseImageGallery(wrap, group, title) {
    let index;
    try {
      index = await loadPhaseSourceImages();
    } catch (_err) {
      return;
    }
    const pages = index[group];
    if (!pages || !pages.length) return;
    wrap.appendChild(el('h2', 'table-viewer__section-title', title));
    wrap.appendChild(el('p', 'source-refs', `Apoyo visual: ${pages.length} páginas de "${pages[0].sourceDocument}" tal como aparecen en el documento de origen. Toca una miniatura para verla entera. Son imágenes de apoyo: todavía no se usan para calcular.`));
    const gallery = el('div', 'source-page-gallery');
    pages.forEach((page) => {
      const item = el('button', 'source-page-gallery__item');
      item.type = 'button';
      const img = el('img');
      img.src = `/data/phases/source-images/${page.image}`;
      img.alt = `${page.sourceDocument}, pág. ${page.page} — miniatura`;
      item.appendChild(img);
      item.setAttribute('aria-label', `Ver página completa: ${page.sourceDocument}, pág. ${page.page}`);
      item.addEventListener('click', () => openImageLightbox(`/data/phases/source-images/${page.image}`, `${page.sourceDocument}, pág. ${page.page}`));
      gallery.appendChild(item);
    });
    wrap.appendChild(gallery);
    await renderBoardExplorer(wrap, group);
  }

  // «¿Dónde se lee este valor?» sobre una tarjeta de aeródromo o puerto: la primera tarjeta de ese tipo
  // sirve de ejemplo y se abre con la zona pedida ya seleccionada (mismo patrón que las fichas).
  async function appendBoardIdentificationHint(container, boardType, hotspotId) {
    const bundle = await loadBoardHotspots();
    if (!bundle) return false;
    const { boards, concepts } = bundle;
    const inst = boards.instances.find((i) => i.type === boardType);
    if (!inst) return false;
    const img = boards.images[inst.imageId];
    const conceptsById = new Map(concepts.concepts.map((c) => [c.id, c]));
    const pad = 0.012;
    const view = { x: Math.max(inst.rect.x - pad, 0), y: Math.max(inst.rect.y - pad * 0.7, 0), width: Math.min(inst.rect.width + pad * 2, 1), height: Math.min(inst.rect.height + pad * 1.4, 1) };
    const hotspots = inst.hotspots.map((h) => {
      const c = conceptsById.get(h.conceptId);
      return {
        id: h.id, label: c ? c.label : h.id, summary: c ? c.summary : 'Uso pendiente de transcribir/validar.', rect: h.rect, polygon: h.polygon,
        status: c && c.status !== 'verified' ? c.status : h.reviewStatus, basicOrExpansion: 'basic',
        sourceText: c && c.sourceRefs ? c.sourceRefs.map((r) => `${r.document}${r.section ? ` — ${r.section}` : ''}`).join(' · ') : '', note: ''
      };
    });
    container.appendChild(el('p', 'turn-view__desc', 'Ejemplo de tarjeta de la hoja; el valor se lee en la misma zona de la tuya:'));
    const hv = ImageHotspotViewer.create({
      image: { src: `/${img.src}`, width: img.width, height: img.height, alt: `Tarjeta de ejemplo (${inst.label})` },
      view, hotspots, maxWidthPx: 640, listCollapsed: true, selectedId: hotspotId && hotspots.some((h) => h.id === hotspotId) ? hotspotId : undefined
    });
    container.appendChild(hv.element);
    return true;
  }

  // Explorador de tarjetas (ajuste_imagenes.md, IMG-003/IMG-004): dos niveles con el mismo
  // componente de hotspots. Nivel página: cada tarjeta localizada es una zona; al elegirla se
  // abre debajo la tarjeta con sus zonas. Las posiciones salen de data/image-hotspots/boards.json
  // (calibradas con OpenCV) y los textos de board-concepts.json; nada se calcula con ellas.
  async function renderBoardExplorer(wrap, group) {
    const bundle = await loadBoardHotspots();
    if (!bundle) return;
    const { boards, concepts } = bundle;
    const pageKeys = Object.keys(boards.images).filter((k) => k.startsWith(`${group}/`)).sort();
    const instancesOf = (key) => boards.instances.filter((i) => i.imageId === key);
    if (!pageKeys.some((k) => instancesOf(k).length)) return;
    const conceptsById = new Map(concepts.concepts.map((c) => [c.id, c]));
    const typeLabel = { airfield: 'Aeródromo', port: 'Puerto', command: 'Capacidad de Mando (C4I)', heliport: 'Helipuerto', platform: 'Plataforma de combate de baja altitud', strategy: 'Capacidad estratégica' };
    const sourceRefsText = (c) => (c && c.sourceRefs && c.sourceRefs.length
      ? c.sourceRefs.map((r) => `${r.document}${r.section ? ` — ${r.section}` : ''}`).join(' · ') : '');

    const box = el('section', 'board-explorer');
    box.appendChild(el('h2', 'table-viewer__section-title', 'Tarjetas con zonas explicadas'));
    box.appendChild(el('p', 'source-refs', 'Elige una página y toca una tarjeta: se abre debajo con sus zonas (valores, áreas de colocación y casillas de misión). Las posiciones están calibradas automáticamente y pendientes de revisión; el efecto de cada zona en el juego aún no está transcrito.'));
    const pager = el('div', 'board-explorer__pager');
    const pageHost = el('div', 'board-explorer__page');
    const cardHost = el('div', 'board-explorer__card');
    box.append(pager, pageHost, cardHost);
    wrap.appendChild(box);

    function showCard(inst) {
      cardHost.textContent = '';
      if (!inst) return;
      const img = boards.images[inst.imageId];
      cardHost.appendChild(el('h3', 'board-explorer__card-title', inst.label));
      const pad = 0.012;
      const view = {
        x: Math.max(inst.rect.x - pad, 0), y: Math.max(inst.rect.y - pad * 0.7, 0),
        width: Math.min(inst.rect.width + pad * 2, 1 - Math.max(inst.rect.x - pad, 0)),
        height: Math.min(inst.rect.height + pad * 1.4, 1 - Math.max(inst.rect.y - pad * 0.7, 0))
      };
      const hotspots = inst.hotspots.map((h) => {
        const c = conceptsById.get(h.conceptId);
        return {
          id: h.id, label: c ? c.label : h.id, summary: c ? c.summary : 'Uso pendiente de transcribir/validar.',
          rect: h.rect, polygon: h.polygon, status: c && c.status !== 'verified' ? c.status : h.reviewStatus,
          basicOrExpansion: 'basic', sourceText: sourceRefsText(c), note: ''
        };
      });
      const hv = ImageHotspotViewer.create({
        image: { src: `/${img.src}`, width: img.width, height: img.height, alt: `${inst.label}, ${inst.imageId}` },
        view, hotspots, maxWidthPx: 720
      });
      cardHost.appendChild(hv.element);
      cardHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function showPage(key) {
      pageHost.textContent = '';
      cardHost.textContent = '';
      pager.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.key === key));
      const img = boards.images[key];
      const list = instancesOf(key);
      if (!list.length) {
        pageHost.appendChild(el('p', 'source-refs', 'Esta página no tiene tarjetas calibradas todavía; consulta la página completa en la galería.'));
        return;
      }
      const byId = new Map(list.map((i) => [i.id, i]));
      const hotspots = list.map((i) => ({
        id: i.id, label: i.label, summary: `${typeLabel[i.type] || 'Tarjeta'}. Púlsala para abrirla debajo con sus zonas.`,
        rect: i.rect, polygon: i.polygon, status: i.reviewStatus, basicOrExpansion: 'basic', sourceText: '', note: ''
      }));
      const hv = ImageHotspotViewer.create({
        image: { src: `/${img.src}`, width: img.width, height: img.height, alt: `Página ${key}` },
        view: { x: 0, y: 0, width: 0.66, height: 1 }, hotspots, maxWidthPx: 440,
        onSelect: (id, pinned) => { if (id && pinned && byId.has(id)) showCard(byId.get(id)); }
      });
      pageHost.appendChild(hv.element);
    }

    pageKeys.forEach((key) => {
      const n = instancesOf(key).length;
      const btn = el('button', 'board-explorer__page-btn', `Pág. ${Number(key.match(/page-(\d+)/)[1])}${n ? '' : ' (sin calibrar)'}`);
      btn.type = 'button';
      btn.dataset.key = key;
      btn.addEventListener('click', () => showPage(key));
      pager.appendChild(btn);
    });
    showPage(pageKeys.find((k) => instancesOf(k).length));
  }

  const SUBPHASE_IMAGE_GALLERIES = {
    preparacion_aerodromo: { group: 'aerodromos', title: 'Fichas de aeródromo (apoyo visual, PDF de origen)' },
    reorganizacion_formaciones: { group: 'puertos', title: 'Fichas de puerto (apoyo visual, PDF de origen)' },
    logistica_transporte_superficie: { group: 'puertos', title: 'Fichas de puerto (apoyo visual, PDF de origen)' },
    logistica_transporte_submarino: { group: 'puertos', title: 'Fichas de puerto (apoyo visual, PDF de origen)' }
  };

  // Recorte de la fila de una unidad concreta dentro de su hoja de
  // armamento (AGENTS.md §9: "recorte del plan de ataque del PDF de origen
  // en la explicación de cada plan concreto"). Cobertura parcial a
  // propósito (ver unit-regions.json#coverage): si la unidad no tiene
  // region calibrada todavía, no se muestra nada en vez de aproximar una
  // posición sin verificar (AGENTS.md §14). Compartido entre "Ayuda rápida >
  // Munición" y el wizard de ataque guiado (correcciones.md COR-007).
  const AMMO_GROUP_LABELS = { antiShip: 'Antibuque (AsuW)', landAttack: 'Ataque terrestre' };

  function describeAmmoValue(value) {
    if (value === undefined || value === null) return 'sin valor en la hoja';
    if (typeof value === 'string') return value;
    const parts = [];
    if (value.heavy !== undefined) parts.push(`pesada ${value.heavy === null ? '—' : value.heavy}`, `ligera ${value.light === null ? '—' : value.light}`);
    else if (value.damage !== undefined) parts.push(`valor ${value.damage === null ? '—' : value.damage}`);
    if (value.range !== undefined) parts.push(`alcance ${value.range}`);
    return parts.length ? parts.join(', ') : 'sin valor en la hoja';
  }

  // Subzonas del recorte (IMG-006): la imagen aporta solo la posición de cada zona del plan; el
  // texto de cada una se construye con los datos ya transcritos de data/ammunition/ (unit.plans).
  async function appendAmmoPlanHotspots(container, unit) {
    const bundle = await loadAmmoPlanHotspots();
    if (!bundle) return false;
    const inst = bundle.instances.find((i) => i.id === unit.id);
    if (!inst) return false;
    const img = bundle.images[inst.imageId];
    const hotspots = [];
    inst.hotspots.forEach((h) => {
      const plan = unit.plans && unit.plans[h.block] && unit.plans[h.block][h.plan];
      if (!plan) return;
      const group = AMMO_GROUP_LABELS[h.block] || h.block;
      const base = { id: h.id, rect: h.rect, status: h.reviewStatus, basicOrExpansion: 'basic', note: '', sourceText: `data/ammunition/ — ${unit.sourceSheet || 'hoja de armamento'}` };
      if (h.kind === 'header') hotspots.push({ ...base, label: `Plan ${h.plan} · ${group}`, summary: `Letra del plan en la hoja. Munición: ${plan.munition || 'sin munición en la hoja'}.` });
      else if (h.kind === 'icons') hotspots.push({ ...base, label: `Iconos del plan ${h.plan} · ${group}`, summary: plan.icons && plan.icons.length ? plan.icons.map((i) => ICON_LABELS[i] || i).join(', ') + '.' : 'Sin iconos en la hoja.' });
      else if (h.kind === 'full') hotspots.push({ ...base, label: `Unidad completa, plan ${h.plan} · ${group}`, summary: `Valores de la unidad completa: ${describeAmmoValue(plan.full)}.` });
      else if (h.kind === 'damaged') {
        if (plan.damaged === undefined) return;
        hotspots.push({ ...base, label: `Unidad dañada, plan ${h.plan} · ${group}`, summary: `Valores de la unidad dañada: ${describeAmmoValue(plan.damaged)}.` });
      } else if (h.kind === 'label') hotspots.push({ ...base, label: `Munición del plan ${h.plan} · ${group}`, summary: `${plan.munition || 'Sin munición en la hoja'}.${plan.note ? ` ${plan.note}` : ''}` });
    });
    if (!hotspots.length) return false;
    const pad = 0.006;
    const view = { x: Math.max(inst.rect.x - pad, 0), y: Math.max(inst.rect.y - pad, 0), width: Math.min(inst.rect.width + pad * 2, 1), height: Math.min(inst.rect.height + pad * 2, 1) };
    container.appendChild(el('h2', 'table-viewer__section-title', 'Recorte del plan de ataque con zonas explicadas'));
    const hv = ImageHotspotViewer.create({ image: { src: `/${img.src}`, width: img.width, height: img.height, alt: `Plan de ataque de ${unit.name}` }, view, hotspots, listCollapsed: true });
    container.appendChild(hv.element);
    container.appendChild(el('p', 'source-refs', 'Las posiciones están calibradas con OpenCV y pendientes de revisión; los valores y nombres que se muestran son los transcritos en los datos de munición, no los leídos de la imagen. Toca la imagen de la hoja completa más abajo para verla entera.'));
    return true;
  }

  async function appendAmmoUnitCrop(container, unitId, unit) {
    if (unit && await appendAmmoPlanHotspots(container, unit)) {
      // Con zonas explicadas el recorte plano sigue disponible como enlace a la hoja completa.
      let regions0;
      try { regions0 = await loadAmmoUnitRegions(); } catch (_e) { regions0 = null; }
      const region0 = regions0 && regions0.units[unitId];
      if (region0) {
        const link = el('button', 'help-card');
        link.type = 'button';
        link.appendChild(el('span', 'help-card__title', 'Ver la hoja completa del PDF de origen'));
        link.addEventListener('click', () => openImageLightbox(`/data/ammunition/source-pages/${region0.sourceImage}`, region0.sourceImage));
        container.appendChild(link);
      }
      return;
    }
    let regions;
    try {
      regions = await loadAmmoUnitRegions();
    } catch (err) {
      return;
    }
    const region = regions.units[unitId];
    if (!region) return;
    const sheetSize = { widthPx: 1242, heightPx: 1755 };
    const crop = el('div', 'ammo-unit-crop');
    const cropWidthPx = (region.wPct / 100) * sheetSize.widthPx;
    const cropHeightPx = (region.hPct / 100) * sheetSize.heightPx;
    crop.style.setProperty('--crop-ratio', `${cropWidthPx} / ${cropHeightPx}`);
    crop.style.backgroundImage = `url('/data/ammunition/source-pages/${region.sourceImage}')`;
    crop.style.backgroundSize = `${(10000 / region.wPct).toFixed(2)}% ${(10000 / region.hPct).toFixed(2)}%`;
    crop.style.backgroundPosition = `${(region.xPct / (100 - region.wPct) * 100).toFixed(2)}% ${(region.yPct / (100 - region.hPct) * 100).toFixed(2)}%`;
    crop.setAttribute('role', 'button');
    crop.setAttribute('aria-label', 'Ver la hoja completa');
    crop.addEventListener('click', () => openImageLightbox(`/data/ammunition/source-pages/${region.sourceImage}`, region.sourceImage));
    container.appendChild(el('h2', 'table-viewer__section-title', 'Recorte del plan de ataque (PDF de origen)'));
    container.appendChild(crop);
    container.appendChild(el('p', 'source-refs', 'Recorte de apoyo visual de la hoja original (AGENTS.md §11); toca la imagen para ver la hoja completa. Los valores del cálculo son los ya transcritos arriba.'));
  }

  // Galería de las hojas originales de "Tablas de Armamento" de un país
  // (AGENTS.md §9): miniaturas que abren la hoja completa en el visor a
  // pantalla completa. Apoyo visual únicamente (AGENTS.md §11): el cálculo
  // sigue usando los datos ya transcritos de attack-plans/naval-plans/etc.
  async function renderSourcePageGallery(countryId, wrap) {
    let index;
    try {
      index = await loadAmmoSourcePages();
    } catch (err) {
      return;
    }
    const pages = index.byCountry[countryId];
    if (!pages || !pages.length) return;
    wrap.appendChild(el('h2', 'table-viewer__section-title', 'Hojas originales (PDF)'));
    wrap.appendChild(el('p', 'source-refs', 'Imagen completa de cada hoja de "Tablas de Armamento" tal como aparece en el documento de origen. Toca una miniatura para verla entera.'));
    const gallery = el('div', 'source-page-gallery');
    pages.forEach((page, idx) => {
      const item = el('button', 'source-page-gallery__item');
      item.type = 'button';
      const img = el('img');
      img.src = `/data/ammunition/source-pages/${page.image}`;
      img.alt = `${page.sourceDocument} — miniatura`;
      item.appendChild(img);
      item.setAttribute('aria-label', `Ver hoja completa: ${page.sourceDocument}`);
      item.addEventListener('click', () => openImageLightbox(`/data/ammunition/source-pages/${page.image}`, page.sourceDocument));
      gallery.appendChild(item);
    });
    wrap.appendChild(gallery);
  }

  // ---------- Ayuda de counters / fichas: acceso compartido (roadmap Fase 3) ----------
  // Solo lo que consume tanto "Ayuda rápida > Leyenda de counters" (views/help.js)
  // como el identificador visual del Wizard (AGENTS.md §9.2, views/antiship-guided-wizard.js)
  // vive aquí. COUNTER_CATEGORIES es exclusivo de la vista de ayuda y queda en views/help.js.

  const POSITION_WORD_ES = {
    top: 'arriba', bottom: 'abajo', left: 'izquierda', right: 'derecha',
    center: 'centro', far: 'extremo', upper: 'superior', middle: 'medio', lower: 'inferior'
  };

  function translatePosition(position) {
    if (!position) return '';
    return position.split('-').map((w) => POSITION_WORD_ES[w] || w).join(' ');
  }

  // Construye el visor recortado/con zoom de una ficha concreta dentro de su
  // hoja de counters, con un recuadro rojo por factor (hover en escritorio,
  // toque en tablet) y su tooltip anclado a esa posición (AGENTS.md §9.4).
  // El recorte y los sectores de cada factor salen de tpl.region y
  // data.positionBoxes (data/counters/factor-map.json): ambos son porcentajes
  // ya verificados visualmente, nunca coordenadas de pixel inventadas.
  // Visor de ficha con el componente común (IMG-007): las zonas salen de
  // data/image-hotspots/counters.json (cajas calibradas con OpenCV y revisadas) y, para los
  // factores que aún no tienen geometría propia, de la posición genérica de factor-map.json,
  // marcadas como pendientes de validar (no se aproxima una zona como si estuviera calibrada).
  function buildCounterHotspotViewer(tpl, data, sheetImage, bundle, onSelect) {
    const region = tpl.region;
    const dims = data.sourceImages[region.sourceImage];
    const instance = bundle.counters.instances.find((i) => i.id === tpl.id);
    const conceptsById = new Map(bundle.concepts.concepts.map((c) => [c.id, c]));
    const hotspots = tpl.factors.map((f) => {
      const concept = conceptsById.get(f.factor);
      const calibrated = instance && instance.hotspots.find((h) => h.id === f.factor);
      let rect = calibrated && calibrated.rect;
      let status = calibrated ? calibrated.reviewStatus : 'needs_review';
      let note = '';
      if (!rect) {
        const box = data.positionBoxes[f.position];
        if (box) {
          rect = {
            x: (region.xPct + (box.xPct / 100) * region.wPct) / 100, y: (region.yPct + (box.yPct / 100) * region.hPct) / 100,
            width: ((box.wPct / 100) * region.wPct) / 100, height: ((box.hPct / 100) * region.hPct) / 100
          };
          status = 'needs_review';
          note = 'Zona aproximada por su posición en la ficha (sin calibrar todavía).';
        }
      }
      const refs = concept && concept.sourceRefs && concept.sourceRefs.length
        ? concept.sourceRefs.map((r) => `${r.document}${r.section ? ` — ${r.section}` : ''}${r.pages ? `, pág. ${r.pages}` : ''}`).join(' · ')
        : `Resumen de uso aún sin fuente transcrita. Posición en la ficha: ${translatePosition(f.position)}.`;
      return {
        id: f.factor,
        label: concept ? concept.label : (data.factorVocabulary[f.factor] ? data.factorVocabulary[f.factor].label : f.factor),
        summary: concept ? concept.summary : 'Uso pendiente de transcribir/validar.',
        rect,
        // La posición puede estar verificada y el texto de uso no: se muestra el estado más débil.
        status: concept && status === 'verified' && concept.status !== 'verified' ? concept.status : (concept && concept.status === 'needs_review' && status === 'generated' ? 'needs_review' : status),
        basicOrExpansion: f.expansionOnly ? 'expansion' : (concept ? concept.basicOrExpansion : 'basic'),
        sourceText: refs,
        note: note || [concept && concept.note, concept && status === 'verified' && concept.status !== 'verified' ? 'Posición verificada; el texto de uso está pendiente de revisión.' : ''].filter(Boolean).join(' ')
      };
    });
    return ImageHotspotViewer.create({
      image: { src: `/data/counters/${region.sourceImage}`, width: dims.widthPx, height: dims.heightPx, alt: `Ficha: ${tpl.title}` },
      view: { x: region.xPct / 100, y: region.yPct / 100, width: region.wPct / 100, height: region.hPct / 100 },
      hotspots,
      onSelect
    });
  }

  function buildCounterViewer(tpl, data, sheetImage, bundle) {
    if (bundle) {
      const wrap = document.createElement('div');
      wrap.className = 'counter-viewer counter-viewer--hotspots';
      const hv = buildCounterHotspotViewer(tpl, data, sheetImage, bundle, (id) => {
        viewRoot.querySelectorAll('.counter-factor').forEach((rowEl) => { rowEl.classList.toggle('is-active', Boolean(id) && rowEl.dataset.factor === id); });
      });
      wrap.appendChild(hv.element);
      return { viewer: wrap, activateFactor: (id) => hv.select(id) };
    }
    const region = tpl.region;
    const sheetSize = data.sourceImages[region.sourceImage];
    const viewer = el('div', 'counter-viewer');
    const crop = el('div', 'counter-viewer__crop');

    const cropWidthPx = (region.wPct / 100) * sheetSize.widthPx;
    const cropHeightPx = (region.hPct / 100) * sheetSize.heightPx;
    crop.style.setProperty('--counter-viewer-ratio', `${cropWidthPx} / ${cropHeightPx}`);
    crop.style.backgroundImage = `url('/data/counters/${sheetImage}')`;
    crop.style.backgroundSize = `${(10000 / region.wPct).toFixed(2)}% ${(10000 / region.hPct).toFixed(2)}%`;
    crop.style.backgroundPosition = `${(region.xPct / (100 - region.wPct) * 100).toFixed(2)}% ${(region.yPct / (100 - region.hPct) * 100).toFixed(2)}%`;

    const tooltip = el('div', 'counter-viewer__tooltip');
    tooltip.hidden = true;
    const hotspots = new Map();

    tpl.factors.forEach((f) => {
      const box = data.positionBoxes[f.position];
      if (!box) return;
      const vocab = data.factorVocabulary[f.factor];
      const hotspot = el('button', 'counter-viewer__hotspot');
      hotspot.type = 'button';
      // El botón se centra en el factor y mide al menos 48×48 px (AJ-009); el
      // recuadro rojo visible (`mark`) conserva el tamaño exacto del factor.
      hotspot.style.left = `${box.xPct + box.wPct / 2}%`;
      hotspot.style.top = `${box.yPct + box.hPct / 2}%`;
      hotspot.style.width = `${box.wPct}%`;
      hotspot.style.height = `${box.hPct}%`;
      const mark = el('span', 'counter-viewer__mark');
      hotspot.appendChild(mark);
      hotspot.setAttribute('aria-label', `${vocab ? vocab.label : f.factor} (${translatePosition(f.position)})`);
      hotspot.addEventListener('click', () => activateFactor(f.factor));
      hotspot.addEventListener('mouseenter', () => activateFactor(f.factor));
      hotspot.addEventListener('focus', () => activateFactor(f.factor));
      hotspots.set(f.factor, { el: hotspot, box, factor: f, vocab, mark });
      crop.appendChild(hotspot);
    });
    crop.appendChild(tooltip);
    viewer.appendChild(crop);

    // Tamaño del recuadro visible en píxeles según el tamaño real del recorte.
    const MIN_TOUCH_PX = 48;
    function layoutMarks() {
      const w = crop.clientWidth;
      const h = crop.clientHeight;
      if (!w || !h) return;
      hotspots.forEach(({ el: hEl, box, mark }) => {
        const bw = (box.wPct / 100) * w;
        const bh = (box.hPct / 100) * h;
        hEl.style.width = `${Math.max(bw, MIN_TOUCH_PX)}px`;
        hEl.style.height = `${Math.max(bh, MIN_TOUCH_PX)}px`;
        mark.style.width = `${bw}px`;
        mark.style.height = `${bh}px`;
      });
    }
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(layoutMarks).observe(crop);

    function activateFactor(factorId) {
      hotspots.forEach(({ el: hEl }, key) => hEl.classList.toggle('is-active', key === factorId));
      viewRoot.querySelectorAll('.counter-factor').forEach((rowEl) => {
        rowEl.classList.toggle('is-active', rowEl.dataset.factor === factorId);
      });
      const target = hotspots.get(factorId);
      if (!target) { tooltip.hidden = true; return; }
      const { box, factor: f, vocab } = target;
      tooltip.textContent = `${vocab ? vocab.label : f.factor}: ${translatePosition(f.position)}${f.expansionOnly ? ' · solo expansión' : ''}`;
      const tooltipLeft = Math.min(Math.max(box.xPct, 2), 70);
      const tooltipTop = box.yPct > 50 ? Math.max(box.yPct - 14, 2) : Math.min(box.yPct + box.hPct + 2, 82);
      tooltip.style.left = `${tooltipLeft}%`;
      tooltip.style.top = `${tooltipTop}%`;
      tooltip.hidden = false;
    }

    return { viewer, activateFactor };
  }

  // Identificación visual de un valor pedido por el Wizard (AGENTS.md §9.2): el wizard conoce el tipo de ficha
  // concreto (p. ej. el lado Oculto de un submarino), así que la referencia es concreta y el panel lateral
  // compartido abre solo esa ficha con el factor pedido ya resaltado (TUR-012).
  async function appendFactorIdentificationHint(container, templateId, factorId) {
    let data;
    let catalog;
    try {
      [data, catalog] = await Promise.all([loadFactorMap(), AppData.loadVisualHelpCatalog()]);
    } catch (err) {
      return;
    }
    const tpl = data.counterTemplates.find((t) => t.id === templateId);
    if (!tpl || !tpl.factors.some((f) => f.factor === factorId)) return;
    const entity = Object.values(catalog.entities).find((e) => e.templates.some((t) => t.templateId === templateId));
    if (!entity) return;
    const vocab = data.factorVocabulary[factorId];
    const box = el('div', 'wizard-modifier-summary');
    const btn = el('button', 'btn btn--secondary visual-ref__btn', `¿Dónde se lee «${vocab ? vocab.label : factorId}»?`);
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.addEventListener('click', () => { AppVisualHelp.open({ entityType: entity.id, templateId, factorId, fieldLabel: vocab ? vocab.label : factorId }, btn); });
    box.appendChild(btn);
    box.appendChild(el('p', 'source-refs', `Se abre en el panel lateral la ficha «${tpl.title}» con el factor señalado; es el tipo de ficha, no la unidad concreta de este ataque.`));
    container.appendChild(box);
  }

  root.AppVisuals = {
    renderPhaseImageGallery,
    SUBPHASE_IMAGE_GALLERIES,
    appendAmmoUnitCrop,
    appendBoardIdentificationHint,
    appendAmmoPlanHotspots,
    renderSourcePageGallery,
    translatePosition,
    buildCounterViewer,
    appendFactorIdentificationHint
  };
})(typeof window !== 'undefined' ? window : globalThis);
