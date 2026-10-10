// Vistas de la Plantilla de fuerzas (correcciones.md COR-005, paso 4),
// extraídas de public/js/app.js: listado de unidades de la sesión y
// formulario de alta. Depende de public/js/core.js (AppCore).
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, renderNotFound, backRow,
    loadUnitRegistry, loadRoster, toggleRosterFlag, removeRosterUnit, addRosterUnit,
    makeTextField, wizardActionRow, wizardNavButton
  } = AppCore;

  const ROSTER_DOMAIN_TO_MUNICION_CATEGORY = {
    'attack-plan': 'aviones',
    'naval-surface': 'naval',
    'naval-submarine': 'naval',
    'special-unit': 'especiales'
  };

  const ROSTER_DOMAIN_LABELS = {
    'attack-plan': 'Avión táctico',
    'naval-surface': 'Buque de superficie',
    'naval-submarine': 'Submarino',
    'special-unit': 'Unidad especial',
    'ground-formation': 'Formación terrestre',
    'support-system': 'Sistema de apoyo (SAM/EWR/HLSC)'
  };

  async function renderRosterIndex() {
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Plantilla de fuerzas']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let registry;
    try {
      registry = await loadUnitRegistry();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;
    const roster = loadRoster();

    viewRoot.innerHTML = '';
    const wrap = el('div', 'turn-view');
    wrap.appendChild(el('h1', 'turn-view__title', 'Plantilla de fuerzas'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Unidades de la sesión y su estado de ficha. Solo se anotan los estados Actuada/No Actuada y Dañada; la posición, el alcance, la detección y la munición consumida se llevan en tu hoja física.'));

    const addBtn = el('button', 'btn btn--primary', '+ Añadir unidad');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => { location.hash = '#/unidades/anadir'; });
    wrap.appendChild(addBtn);

    if (!roster.length) {
      wrap.appendChild(el('p', 'pending-note', 'Sin unidades añadidas todavía.'));
    } else {
      const list = el('div', 'phase-list');
      roster.forEach((unit) => {
        const row = el('div', 'phase-card-wrapper');
        const main = el('div', 'phase-card');
        const titleParts = [unit.name, `(${unit.country})`];
        if (unit.label) titleParts.push(`— ${unit.label}`);
        main.appendChild(el('span', 'phase-card__title', titleParts.join(' ')));
        const statusParts = [ROSTER_DOMAIN_LABELS[unit.domain] || unit.domain];
        if (unit.side) statusParts.push(unit.side);
        statusParts.push(unit.actuada ? 'Actuada' : 'No Actuada');
        statusParts.push(unit.damaged ? 'Dañada' : 'Operativa');
        main.appendChild(el('span', 'phase-card__count', statusParts.join(' · ')));
        row.appendChild(main);

        const actionsRow = el('div', 'action-row');
        const actuadaBtn = el('button', 'btn btn--secondary', unit.actuada ? 'Marcar No Actuada' : 'Marcar Actuada');
        actuadaBtn.type = 'button';
        actuadaBtn.addEventListener('click', () => { toggleRosterFlag(unit.id, 'actuada'); renderRosterIndex(); });
        actionsRow.appendChild(actuadaBtn);

        const damagedBtn = el('button', 'btn btn--secondary', unit.damaged ? 'Marcar Operativa' : 'Marcar Dañada');
        damagedBtn.type = 'button';
        damagedBtn.addEventListener('click', () => { toggleRosterFlag(unit.id, 'damaged'); renderRosterIndex(); });
        actionsRow.appendChild(damagedBtn);

        const municionCategory = ROSTER_DOMAIN_TO_MUNICION_CATEGORY[unit.domain];
        if (municionCategory) {
          const viewBtn = el('button', 'btn btn--secondary', 'Ver ficha');
          viewBtn.type = 'button';
          viewBtn.addEventListener('click', () => { location.hash = `#/ayuda/municion/${unit.country.toLowerCase()}/${municionCategory}/${unit.typeId}`; });
          actionsRow.appendChild(viewBtn);
        }

        const removeBtn = el('button', 'btn btn--secondary', '✕ Quitar');
        removeBtn.type = 'button';
        removeBtn.addEventListener('click', () => {
          if (confirm(`¿Quitar «${unit.name}» de la plantilla de fuerzas?`)) { removeRosterUnit(unit.id); renderRosterIndex(); }
        });
        actionsRow.appendChild(removeBtn);

        row.appendChild(actionsRow);
        list.appendChild(row);
      });
      wrap.appendChild(list);
    }

    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  async function renderRosterAddForm() {
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Plantilla de fuerzas', 'Añadir unidad']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let registry;
    try {
      registry = await loadUnitRegistry();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    const countries = Array.from(new Set(registry.entries.map((e) => e.country))).sort();
    const domainLabelsPresent = (country) => Array.from(new Set(registry.entries.filter((e) => e.country === country).map((e) => e.domain)));

    const state = { country: countries[0] || '', domain: '', typeId: '', side: '', label: '' };
    state.domain = domainLabelsPresent(state.country)[0] || '';

    function unitsFor(country, domain) {
      return registry.entries.filter((e) => e.country === country && e.domain === domain).sort((a, b) => a.name.localeCompare(b.name));
    }
    state.typeId = (unitsFor(state.country, state.domain)[0] || {}).id || '';

    function render() {
      viewRoot.innerHTML = '';
      const wrap = el('div', 'turn-view');
      wrap.appendChild(el('h1', 'turn-view__title', 'Añadir unidad a la plantilla'));

      const countryField = el('label', 'table-viewer__field');
      countryField.appendChild(el('span', null, 'País'));
      const countrySelect = document.createElement('select');
      countrySelect.className = 'table-viewer__select';
      countries.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        if (c === state.country) opt.selected = true;
        countrySelect.appendChild(opt);
      });
      countrySelect.addEventListener('change', () => {
        state.country = countrySelect.value;
        state.domain = domainLabelsPresent(state.country)[0] || '';
        state.typeId = (unitsFor(state.country, state.domain)[0] || {}).id || '';
        render();
      });
      countryField.appendChild(countrySelect);
      wrap.appendChild(countryField);

      const domainField = el('label', 'table-viewer__field');
      domainField.appendChild(el('span', null, 'Tipo de unidad'));
      const domainSelect = document.createElement('select');
      domainSelect.className = 'table-viewer__select';
      domainLabelsPresent(state.country).forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = ROSTER_DOMAIN_LABELS[d] || d;
        if (d === state.domain) opt.selected = true;
        domainSelect.appendChild(opt);
      });
      domainSelect.addEventListener('change', () => {
        state.domain = domainSelect.value;
        state.typeId = (unitsFor(state.country, state.domain)[0] || {}).id || '';
        render();
      });
      domainField.appendChild(domainSelect);
      wrap.appendChild(domainField);

      const units = unitsFor(state.country, state.domain);
      const unitField = el('label', 'table-viewer__field');
      unitField.appendChild(el('span', null, 'Unidad'));
      const unitSelect = document.createElement('select');
      unitSelect.className = 'table-viewer__select';
      units.forEach((u) => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        if (u.id === state.typeId) opt.selected = true;
        unitSelect.appendChild(opt);
      });
      unitSelect.addEventListener('change', () => { state.typeId = unitSelect.value; });
      unitField.appendChild(unitSelect);
      wrap.appendChild(unitField);

      wrap.appendChild(makeTextField('Bando / lado (opcional)', state.side, (v) => { state.side = v; }));
      wrap.appendChild(makeTextField('Etiqueta identificativa (opcional)', state.label, (v) => { state.label = v; }));

      wrap.appendChild(wizardActionRow([
        wizardNavButton('← Cancelar', 'secondary', () => { location.hash = '#/unidades'; }),
        wizardNavButton('+ Añadir', 'primary', () => {
          const selectedUnit = units.find((u) => u.id === state.typeId);
          if (!selectedUnit) { alert('Elige una unidad.'); return; }
          addRosterUnit({
            typeId: selectedUnit.id,
            name: selectedUnit.name,
            country: selectedUnit.country,
            domain: selectedUnit.domain,
            side: state.side,
            label: state.label
          });
          location.hash = '#/unidades';
        })
      ]));
      wrap.appendChild(backRow());
      viewRoot.appendChild(wrap);
    }

    render();
  }

  root.Views = root.Views || {};
  root.Views.Roster = { renderRosterIndex, renderRosterAddForm };
})(typeof window !== 'undefined' ? window : globalThis);
