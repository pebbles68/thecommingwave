// Pantalla «Grupo de misión aéreo» (#/wizard/air-mission-group; roadmap Fase 11): los dos bandos y sus
// unidades, compartidos por los asistentes de interceptación aérea y de combate cercano WVR. El grupo se guarda
// en este navegador y se puede cargar y guardar desde cada asistente. Lógica pura en AirMissionGroup.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, loadWorkflow,
    makeTextField, makeNumberField, makeOptionGroup, wizardNavButton
  } = AppCore;
  const G = () => AirMissionGroup;
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  async function render() {
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Combate aéreo', 'Grupo de misión']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let workflow;
    try {
      workflow = await loadWorkflow('05_combate_aereo.json');
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;
    const groupTypes = workflow.stages.find((st) => st.id === 'wvr').roundRule.groupTypes;

    let group = AppCore.loadAirGroup();
    const save = (next) => { group = next; AppCore.saveAirGroup(group); };
    const rerender = () => render();

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Grupo de misión aéreo'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Los dos bandos y sus unidades, una sola vez. Los wizards de Asignación de objetivos BVR y de Combate aéreo cercano WVR pueden cargarlos y guardar en ellos las retiradas y las bajas. Decision Book §7.16.1-§7.16.4.'));
    wrap.appendChild(el('p', 'source-refs', 'No hay mapa: el grupo, su estado y los valores los declaras tú. Se guarda en este navegador.'));

    const counts = G().counts(group);
    G().SIDES.forEach((k) => {
      const s = group.sides[k];
      const c = counts[k];
      wrap.appendChild(el('h2', null, s.label || `Bando ${k}`));
      wrap.appendChild(el('p', 'source-refs', c.total === 0 ? 'Sin unidades.' : `${c.total} unidad(es): ${c.active} en combate, ${c.withdrawn} retirada(s), ${c.out} fuera de combate, ${c.eliminated} eliminada(s).`));
      wrap.appendChild(makeTextField(`${k}: nombre del bando (opcional)`, s.label, (v) => { s.label = v; save(group); }));
      wrap.appendChild(makeOptionGroup({ prompt: `${k}: misión del grupo`, options: groupTypes.map((g) => ({ value: g.value, label: g.label })) }, s.groupType, (v) => { s.groupType = v; save(group); rerender(); }));
      wrap.appendChild(makeOptionGroup({ prompt: `${k}: ¿hay un avión de guerra electrónica con escudo de escolta electrónica (EEA)?`, options: YES_NO }, s.eea, (v) => { s.eea = v; save(group); rerender(); }));

      s.units.forEach((u, idx) => {
        const row = el('div', 'wizard-unit');
        row.appendChild(el('p', 'wizard-question__prompt', `${k} · ${u.name || `Unidad ${idx + 1}`}`));
        row.appendChild(makeTextField(`${k} · unidad ${idx + 1}: nombre`, u.name, (v) => { u.name = v; save(group); }));
        row.appendChild(makeNumberField(`${k} · unidad ${idx + 1}: Valor de Combate Aéreo (vacío si no tiene)`, u.airCombatValue, (v) => { u.airCombatValue = v; save(group); }, rerender, { visualRef: 'bvr-air-combat-value' }));
        row.appendChild(makeNumberField(`${k} · unidad ${idx + 1}: Valor de Protección`, u.protection, (v) => { u.protection = v; save(group); }, rerender, { visualRef: 'air-protection' }));
        row.appendChild(makeNumberField(`${k} · unidad ${idx + 1}: Valor Electrónico`, u.electronic, (v) => { u.electronic = v; save(group); }, rerender, { visualRef: 'air-electronic-value' }));
        row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${idx + 1}: ¿viene de la patrulla CAPs en red?`, options: YES_NO }, u.network, (v) => { u.network = v; save(group); rerender(); }));
        row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${idx + 1}: ¿es el avión de guerra electrónica con escolta?`, options: YES_NO }, u.ew, (v) => { u.ew = v; save(group); rerender(); }));
        row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${idx + 1}: estado`, options: G().STATUSES.map((st) => ({ value: st.value, label: st.label })) }, u.status, (v) => { u.status = v; save(group); rerender(); }));
        row.appendChild(wizardNavButton('Quitar unidad', 'secondary', () => { s.units.splice(idx, 1); save(group); rerender(); }));
        wrap.appendChild(row);
      });
      wrap.appendChild(wizardNavButton(`+ Añadir unidad a ${s.label || `Bando ${k}`}`, 'secondary', () => { s.units.push(G().newUnit()); save(group); rerender(); }));
    });

    wrap.appendChild(el('h2', null, 'Usar el grupo'));
    wrap.appendChild(wizardNavButton('Ir a Asignación de objetivos BVR', 'secondary', () => { location.hash = '#/wizard/air-intercept-targets'; }));
    wrap.appendChild(wizardNavButton('Ir a Combate aéreo cercano WVR', 'secondary', () => { location.hash = '#/wizard/air-combat-wvr'; }));
    wrap.appendChild(wizardNavButton('Vaciar el grupo de misión', 'secondary', () => {
      if (G().isEmpty(group) || confirm('¿Vaciar el grupo de misión? Se perderán las unidades de los dos bandos guardadas aquí.')) {
        save(G().emptyGroup());
        rerender();
      }
    }));
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.AirMissionGroupWizard = { render };
})(typeof window !== 'undefined' ? window : globalThis);
