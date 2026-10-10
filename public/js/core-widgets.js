// Utilidades de construcción de DOM compartidas (correcciones03.md COR03-006,
// dividido desde public/js/core.js): el helper `el`, widgets genéricos de
// formulario para wizards, la cuadrícula de tabla con celda resaltada, el
// visor de imagen a pantalla completa, los chips de iconos y el portapapeles.
// No dependen de ningún dato ni estado de la aplicación — solo de
// `document`. Expuesto como `AppWidgets`; `AppCore` (core.js) lo re-exporta.
(function (root) {
  'use strict';

  // Copia texto al portapapeles con `navigator.clipboard` (requiere contexto
  // seguro/permiso; no todos los navegadores lo exponen igual) y, si falla o
  // no está disponible, recurre a `document.execCommand('copy')` sobre un
  // textarea temporal. Nunca lanza: devuelve si funcionó, para que el
  // llamador pueda mostrar un mensaje en vez de romper la interacción.
  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_err) {
      // sigue al método alternativo
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch (_err) {
      return false;
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function backRow() {
    const row = el('div', 'action-row');
    const backBtn = el('button', 'btn btn--secondary', '← Volver');
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => { history.back(); });
    row.appendChild(backBtn);
    return row;
  }

  // Visor de imagen a pantalla completa, reutilizable (AGENTS.md §9: ver
  // planes de ataque/hojas de armamento completas tal como aparecen en el
  // PDF de origen, sin exigir zoom del navegador). Un único overlay
  // compartido por toda la sesión, creado la primera vez que hace falta.
  let imageLightboxEl = null;
  function openImageLightbox(src, alt) {
    if (!imageLightboxEl) {
      imageLightboxEl = el('div', 'image-lightbox');
      imageLightboxEl.hidden = true;
      const closeBtn = el('button', 'image-lightbox__close', '✕');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Cerrar imagen');
      const img = el('img', 'image-lightbox__img');
      imageLightboxEl.appendChild(img);
      imageLightboxEl.appendChild(closeBtn);
      const close = () => { imageLightboxEl.hidden = true; };
      closeBtn.addEventListener('click', close);
      imageLightboxEl.addEventListener('click', (ev) => { if (ev.target === imageLightboxEl) close(); });
      document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
      document.body.appendChild(imageLightboxEl);
    }
    const img = imageLightboxEl.querySelector('.image-lightbox__img');
    img.src = src;
    img.alt = alt || '';
    imageLightboxEl.hidden = false;
  }

  // Leyenda de iconos de ataque/munición (AGENTS.md §9), promovida desde
  // views/help.js (COR03-006): usada por la propia Ayuda de Munición Y por
  // Combate por tipo (representativeIcon/iconRefs de cada workflow) — un
  // segundo consumidor real que ya existía antes de este refactor.
  const ICON_LABELS = {
    attack_anti_radiation: 'Antirradiación',
    attack_ballistic: 'Ataque balístico',
    attack_high_penetration: 'Alta penetración',
    attack_low_altitude_bombing: 'Bombardeo a baja altura',
    attack_low_altitude_counterattack: 'Contraataque a baja altura',
    attack_reinforced_installation: 'Ataque reforzado a instalaciones',
    marker_cruise_missile: 'Misil de crucero (CM)',
    marker_low_flight_cruise_missile: 'Misil de crucero de vuelo bajo (LF-CM)',
    marker_supersonic_cruise_missile: 'Misil de crucero supersónico (SUP.CM)',
    munition_light: 'Munición ligera',
    munition_near_space: 'Munición de espacio cercano',
    munition_parabolic: 'Munición parabólica',
    munition_subsonic: 'Munición subsónica',
    munition_supersonic: 'Munición supersónica',
    munition_unguided: 'Munición no guiada'
  };

  function renderIconChip(iconId) {
    const chip = el('span', 'ammo-icon-chip');
    const img = el('img', 'ammo-icon-chip__img');
    img.src = `/data/sources/tcw_attack_workflows/icons/${iconId}.png`;
    img.alt = ICON_LABELS[iconId] || iconId;
    chip.appendChild(img);
    chip.appendChild(el('span', 'ammo-icon-chip__label', ICON_LABELS[iconId] || iconId));
    return chip;
  }

  // Dibuja la cuadrícula de una tabla con fila/columna/celda resaltadas
  // (AGENTS.md §9.3). Compartida entre el visor de tablas de "Ayuda rápida"
  // (views/help.js#renderTableViewer) y el paso de Resultado del wizard de
  // ataque guiado (views/antiship-guided-wizard.js#renderWizardStepResult).
  function renderGrid(table, rowLabels, columnLabels, result) {
    const gridWrap = el('div', 'table-viewer__grid-wrap');
    const gridTable = document.createElement('table');
    gridTable.className = 'table-viewer__grid';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.appendChild(el('th', null, table.rowAxis.label));
    columnLabels.forEach((label, colIdx) => {
      const th = el('th', colIdx === (result && result.columnIndex) ? 'is-selected' : null, String(label));
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    gridTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    table.cells.forEach((row, rowIdx) => {
      const tr = document.createElement('tr');
      const isSelectedRow = result && rowIdx === result.rowIndex;
      tr.appendChild(el('th', isSelectedRow ? 'is-selected' : null, String(rowLabels[rowIdx] !== undefined ? rowLabels[rowIdx] : '')));
      row.forEach((cell, colIdx) => {
        const isSelectedCell = result && rowIdx === result.rowIndex && colIdx === result.columnIndex;
        const isSelectedCol = result && colIdx === result.columnIndex;
        const className = isSelectedCell ? 'is-selected-cell' : (isSelectedRow || isSelectedCol ? 'is-selected' : null);
        tr.appendChild(el('td', className, cell === null ? '∅' : String(cell)));
      });
      tbody.appendChild(tr);
    });
    gridTable.appendChild(tbody);
    gridWrap.appendChild(gridTable);
    return gridWrap;
  }

  // ---------- Widgets genéricos de formulario para wizards/formularios ----------
  // Usados por más de un dominio: el Wizard de ataque guiado
  // (views/antiship-guided-wizard.js), el formulario de añadir unidad de la
  // Plantilla de fuerzas (views/roster.js), el resolver interactivo de
  // detección y el buscador (ambos en views/help.js).

  function makeTextField(labelText, value, onChange, onCommit) {
    const field = el('label', 'table-viewer__field');
    field.appendChild(el('span', null, labelText));
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'table-viewer__select';
    input.value = value;
    input.addEventListener('input', () => onChange(input.value));
    if (onCommit) input.addEventListener('change', () => afterPointerGesture(onCommit));
    field.appendChild(input);
    return field;
  }

  // Confirmar un campo (evento `change`) suele redibujar la vista. Si el campo
  // pierde el foco porque el usuario acaba de tocar un botón, ese redibujado
  // sustituiría el botón entre pulsar y soltar y el primer toque se perdería
  // (hallazgo del humo táctil, AJ-010). Por eso, si hay un gesto de puntero en
  // curso, la confirmación espera a que termine el clic.
  let pointerGestureActive = false;
  document.addEventListener('pointerdown', () => { pointerGestureActive = true; }, true);
  // En pantallas táctiles el navegador emite mousedown/click DESPUÉS de pointerup
  // (y es el mousedown el que quita el foco al campo): el gesto se da por
  // terminado con el clic o, si no llega, tras una breve espera.
  const endGesture = () => { pointerGestureActive = false; };
  document.addEventListener('click', () => { setTimeout(endGesture, 0); }, true);
  ['pointerup', 'pointercancel'].forEach((type) => {
    document.addEventListener(type, () => { setTimeout(endGesture, 350); }, true);
  });

  function afterPointerGesture(fn) {
    if (!pointerGestureActive) { fn(); return; }
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      document.removeEventListener('click', onClick, true);
      setTimeout(fn, 0);
    };
    const onClick = () => run();
    document.addEventListener('click', onClick, true);
    // Si el gesto no termina en clic (arrastre, cancelación), se confirma igualmente.
    setTimeout(run, 600);
  }

  // `opts.visualRef`: ID estable de la entrada de data/rules/wizard-visual-refs.json que explica dónde se lee el valor
  // (ya no se localiza por el texto de la etiqueta; TUR-012).
  function makeNumberField(labelText, value, onChange, onCommit, opts) {
    const field = el('label', 'table-viewer__field');
    if (opts && opts.visualRef) field.dataset.visualRef = opts.visualRef;
    field.appendChild(el('span', null, labelText));
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'table-viewer__select';
    input.value = value;
    input.addEventListener('input', () => onChange(input.value));
    if (onCommit) input.addEventListener('change', () => afterPointerGesture(onCommit));
    field.appendChild(input);
    return field;
  }

  function makeSelectFromValues(labelText, values, currentValue, onChange) {
    const field = el('label', 'table-viewer__field');
    field.appendChild(el('span', null, labelText));
    const select = document.createElement('select');
    select.className = 'table-viewer__select';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '—';
    select.appendChild(blank);
    values.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (String(currentValue) === String(v)) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => onChange(select.value));
    field.appendChild(select);
    return field;
  }

  function makeOptionGroup(question, currentValue, onChange) {
    const field = el('div', 'wizard-question');
    field.appendChild(el('p', 'wizard-question__prompt', question.prompt));
    const optsWrap = el('div', 'wizard-question__options');
    (question.options || []).forEach((opt) => {
      const btn = el('button', `btn btn--secondary wizard-option${currentValue === opt.value ? ' is-active' : ''}`, opt.label);
      btn.type = 'button';
      btn.addEventListener('click', () => onChange(opt.value));
      optsWrap.appendChild(btn);
    });
    field.appendChild(optsWrap);
    return field;
  }

  function renderModifierSummary(label, modResult) {
    const box = el('div', 'wizard-modifier-summary');
    box.appendChild(el('span', 'wizard-modifier-summary__total', `${label}: ${modResult.total >= 0 ? '+' : ''}${modResult.total}`));
    modResult.trace.forEach((t) => {
      box.appendChild(el('span', 'source-refs', `${t.prompt} → ${t.optionLabel}: ${t.value >= 0 ? '+' : ''}${t.value}`));
    });
    return box;
  }

  function wizardActionRow(buttons) {
    const row = el('div', 'action-row');
    buttons.forEach((btn) => row.appendChild(btn));
    return row;
  }

  function wizardNavButton(label, variant, onClick) {
    const btn = el('button', `btn btn--${variant}`, label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  // Bloque plegable «Fuente y trazabilidad» (AJ-006): los ids, archivos y
  // notas de desarrollo no deben ocupar el texto principal del jugador, pero
  // siguen accesibles bajo demanda.
  function makeTraceNote(text) {
    const details = el('details', 'trace-note');
    details.appendChild(el('summary', null, 'Fuente y trazabilidad'));
    details.appendChild(el('p', 'source-refs', text));
    return details;
  }

  // Aviso en lenguaje de juego + (opcional) trazabilidad plegable.
  function appendNoteWithTrace(wrap, className, text, trace) {
    if (text) wrap.appendChild(el('p', className, text));
    if (trace) wrap.appendChild(makeTraceNote(trace));
  }

  root.AppWidgets = {
    makeTraceNote,
    appendNoteWithTrace,
    copyTextToClipboard,
    el,
    backRow,
    openImageLightbox,
    ICON_LABELS,
    renderIconChip,
    renderGrid,
    makeTextField,
    makeNumberField,
    makeSelectFromValues,
    makeOptionGroup,
    renderModifierSummary,
    wizardActionRow,
    wizardNavButton
  };
})(typeof window !== 'undefined' ? window : globalThis);
