// Wizard: Resolución del Resultado del Ataque Terrestre (roadmap Fase 9;
// data/rules/ground-attack-results.json + public/js/ground-attack-result-engine.js).
// Decision Book §5.15.1-§5.15.3 (pp. 83-87): qué hacen los Puntos de Impacto
// finales sobre una unidad terrestre, un puerto (y los buques dentro) o un
// aeródromo (pista, áreas de estacionamiento y, como regla opcional, logística).
//
// Se entra con los Puntos de Impacto ya obtenidos en la tabla de resolución
// (los wizards de ataque terrestre guiado y no guiado ofrecen un botón que los
// traslada aquí). La asignación entre pista/apron/buques y el orden en que el
// defensor elige unidades los declara el jugador. El texto de las reglas se lee
// del JSON de reglas; la aritmética vive en el motor puro.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadGroundAttackResults,
    makeTextField, makeNumberField, makeOptionGroup,
    wizardActionRow, wizardNavButton
  } = AppCore;

  const WIZARD_STEPS = ['Impactos y objetivo', 'Datos del objetivo', 'Resultado'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  function freshState() {
    return {
      step: 0,
      impacts: '',
      target: '',
      unit: { label: '', kind: 'normal', protection: '', terrain: '' },
      port: { portImpacts: '', protection: '', ships: [{ name: '', type: 'surface', impacts: '' }] },
      airfield: {
        runwayImpacts: '', runwayLetter: '',
        apronImpacts: '', airfieldProtection: '', hangarCapacity: '',
        units: [{ name: '', uses: 'no', cannotSurvive: 'no' }],
        logisticsOn: 'no', logisticsImpacts: '', readiness: ''
      },
      turnResolutionId: null
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    state.step = 2;
  }

  // Lo usan los wizards de ataque terrestre para trasladar sus Puntos de Impacto.
  function prefill({ impacts, kind }) {
    state = freshState();
    state.impacts = String(impacts);
    // Tipo de ataque que fija una reacción (Persecución Aérea, Interdicción…).
    if (kind) { state.target = 'ground_unit'; state.unit.kind = kind; }
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'ground-attack-result', type: 'ground_attack_result', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  const isCount = (v) => v !== '' && v !== undefined && Number.isInteger(Number(v)) && Number(v) >= 0;
  const blank = (v) => (v === '' ? 0 : v);

  // Resuelve con lo introducido; {error} si el motor rechaza; null si falta algo.
  function compute(rules) {
    if (!isCount(state.impacts) || state.target === '') return null;
    try {
      if (state.target === 'ground_unit') {
        const u = state.unit;
        const kind = rules.groundUnit.attackKinds.find((k) => k.id === u.kind);
        if (!isCount(u.protection)) return null;
        return { result: GroundAttackResultEngine.resolveGroundUnitHit({ impacts: state.impacts, protection: u.protection, terrain: u.terrain, kind: u.kind, terrainApplies: kind.terrainApplies }), kind };
      }
      if (state.target === 'port') {
        const p = state.port;
        if (isCount(blank(p.portImpacts)) && Number(blank(p.portImpacts)) > 0 && !isCount(p.protection)) return null;
        return { result: GroundAttackResultEngine.resolvePortAttack({ totalImpacts: state.impacts, portImpacts: p.portImpacts, portProtection: p.protection, ships: p.ships.map((s) => ({ type: s.type, impacts: s.impacts })) }) };
      }
      const a = state.airfield;
      const total = Number(state.impacts);
      const assigned = Number(blank(a.runwayImpacts)) + Number(blank(a.apronImpacts)) + (a.logisticsOn === 'yes' ? Number(blank(a.logisticsImpacts)) : 0);
      if (assigned > total) throw new GroundAttackResultEngine.GroundAttackResultError('over_assigned', `Has asignado ${assigned} impactos y solo hay ${total}.`);
      const out = { assigned, unassigned: total - assigned };
      if (Number(blank(a.runwayImpacts)) > 0) {
        if (a.runwayLetter === '') return null;
        out.runway = GroundAttackResultEngine.resolveRunwayByLetter({ impacts: blank(a.runwayImpacts), letter: a.runwayLetter, letters: rules.airfield.runwayQuality.letters });
      }
      if (Number(blank(a.apronImpacts)) > 0) {
        if (!isCount(a.airfieldProtection) || !isCount(a.hangarCapacity)) return null;
        out.apron = GroundAttackResultEngine.resolveApron({
          impacts: blank(a.apronImpacts), airfieldProtection: a.airfieldProtection, hangarCapacity: a.hangarCapacity,
          units: a.units.map((u, i) => ({ name: u.name || `Unidad ${i + 1}`, usesAirfieldProtection: u.uses === 'yes', cannotSurviveDamage: u.cannotSurvive === 'yes' }))
        });
      }
      if (a.logisticsOn === 'yes' && Number(blank(a.logisticsImpacts)) > 0) {
        if (!isCount(a.readiness)) return null;
        out.logistics = GroundAttackResultEngine.resolveLogistics({ impacts: blank(a.logisticsImpacts), readiness: a.readiness });
      }
      return { result: out };
    } catch (err) {
      return { error: err };
    }
  }

  async function renderGroundAttackResultWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('ground-attack-result', state, freshState);
    linkToTurnContextIfNeeded(state, 'Resolución del resultado del ataque terrestre');
    AppCore.persistWizardDraft('ground-attack-result', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Resultado del ataque terrestre']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let rules;
    try {
      rules = await loadGroundAttackResults();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Resolución del resultado del ataque terrestre'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Decision Book §5.15 (págs. 83-87) y notas de efectos de las páginas 6 y 9 de Tablas-de-combate 5.pdf.'));

    const rerender = () => { renderGroundAttackResultWizard(); };

    AppCore.mountWizardDraft('ground-attack-result', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    [
      () => renderStepTarget(wrap, rules, rerender),
      () => renderStepDetails(wrap, rules, rerender),
      () => renderStepResult(wrap, rules, rerender)
    ][state.step]();
    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Impactos y objetivo ----------
  function renderStepTarget(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Impactos y objetivo'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Introduce los Puntos de Impacto finales obtenidos en la tabla de resolución del ataque (los wizards de ataque terrestre guiado y no guiado los traen ya rellenados).'));
    wrap.appendChild(makeNumberField('Puntos de Impacto finales', state.impacts, (v) => { state.impacts = v; }, rerender, { visualRef: 'impact-points' }));
    wrap.appendChild(makeOptionGroup({ prompt: '¿Qué se ataca?', options: rules.targets.map((t) => ({ value: t.id, label: t.label })) }, state.target, (v) => { state.target = v; rerender(); }));
    wrap.appendChild(el('p', 'source-refs', rules.notModeled));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!isCount(state.impacts)) { alert('Introduce los Puntos de Impacto finales (un número entero ≥ 0).'); return; }
        if (state.target === '') { alert('Elige qué se ataca.'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  function listRows(wrap, items, renderRow, addLabel, makeNew, rerender) {
    items.forEach((item, idx) => {
      const row = el('div', 'wizard-unit');
      renderRow(row, item, idx);
      if (items.length > 1) row.appendChild(wizardNavButton('Quitar', 'secondary', () => { items.splice(idx, 1); rerender(); }));
      wrap.appendChild(row);
    });
    wrap.appendChild(wizardNavButton(addLabel, 'secondary', () => { items.push(makeNew()); rerender(); }));
  }

  // ---------- Paso 2: Datos del objetivo ----------
  function renderStepDetails(wrap, rules, rerender) {
    const calc = compute(rules);
    if (state.target === 'ground_unit') {
      const g = rules.groundUnit;
      const u = state.unit;
      wrap.appendChild(el('h2', null, 'Unidad terrestre'));
      wrap.appendChild(makeTextField('Unidad (opcional)', u.label, (v) => { u.label = v; }));
      wrap.appendChild(makeOptionGroup({ prompt: 'Tipo de ataque', options: g.attackKinds.map((k) => ({ value: k.id, label: k.label })) }, u.kind, (v) => { u.kind = v; rerender(); }));
      wrap.appendChild(makeNumberField('Valor de Protección de la unidad', u.protection, (v) => { u.protection = v; }, rerender, { visualRef: 'ground-protection' }));
      if (g.attackKinds.find((k) => k.id === u.kind).terrainApplies) {
        wrap.appendChild(makeNumberField('Valor de Terreno del hexágono (marcadores de terreno; 0 si no hay)', u.terrain, (v) => { u.terrain = v; }, rerender, { visualRef: 'ground-terrain' }));
      }
      wrap.appendChild(el('p', 'source-refs', g.terrainRule));
      wrap.appendChild(el('p', 'source-refs', u.kind === 'air_pursuit' ? g.airPursuitRule : g.normalRule));
    } else if (state.target === 'port') {
      const p = rules.port;
      const s = state.port;
      wrap.appendChild(el('h2', null, 'Puerto y buques'));
      wrap.appendChild(el('p', 'turn-view__desc', p.assignRule));
      wrap.appendChild(makeNumberField('Puntos de Impacto asignados al puerto (0 si no se ataca)', s.portImpacts, (v) => { s.portImpacts = v; }, rerender, { visualRef: 'port-protection' }));
      wrap.appendChild(makeNumberField('Valor de Protección del puerto (sin terreno)', s.protection, (v) => { s.protection = v; }, rerender, { visualRef: 'port-protection' }));
      wrap.appendChild(el('p', 'source-refs', p.portRule));
      wrap.appendChild(el('h3', null, 'Buques dentro del puerto'));
      wrap.appendChild(el('p', 'source-refs', p.shipsRule));
      listRows(wrap, s.ships, (row, ship, idx) => {
        row.appendChild(makeTextField(`Buque ${idx + 1}: nombre (opcional)`, ship.name, (v) => { ship.name = v; }));
        row.appendChild(makeOptionGroup({ prompt: `Buque ${idx + 1}: tipo`, options: [{ value: 'surface', label: 'Unidad de superficie' }, { value: 'submarine', label: 'Unidad submarina' }] }, ship.type, (v) => { ship.type = v; rerender(); }));
        row.appendChild(makeNumberField(`Buque ${idx + 1}: Puntos de Impacto que absorbe`, ship.impacts, (v) => { ship.impacts = v; }, rerender, { visualRef: 'impact-points' }));
      }, '+ Añadir buque', () => ({ name: '', type: 'surface', impacts: '' }), rerender);
    } else {
      const f = rules.airfield;
      const a = state.airfield;
      wrap.appendChild(el('h2', null, 'Aeródromo'));
      wrap.appendChild(el('p', 'turn-view__desc', f.assignRule));
      wrap.appendChild(el('h3', null, 'Pista'));
      wrap.appendChild(makeNumberField('Puntos de Impacto asignados a la pista (0 si no se ataca)', a.runwayImpacts, (v) => { a.runwayImpacts = v; }, rerender, { visualRef: 'impact-points' }));
      wrap.appendChild(makeOptionGroup({ prompt: 'Calidad actual de la pista (de A, la mejor, a E, la peor)', options: f.runwayQuality.letters.map((l) => ({ value: l, label: l })) }, a.runwayLetter, (v) => { a.runwayLetter = v; rerender(); }));
      wrap.appendChild(el('p', 'source-refs', f.runwayQuality.note));
      wrap.appendChild(el('p', 'source-refs', f.runwayRule));
      wrap.appendChild(el('h3', null, 'Áreas de estacionamiento (apron)'));
      wrap.appendChild(makeNumberField('Puntos de Impacto asignados al apron (0 si no se ataca)', a.apronImpacts, (v) => { a.apronImpacts = v; }, rerender, { visualRef: 'impact-points' }));
      wrap.appendChild(makeNumberField('Valor de Protección del aeródromo', a.airfieldProtection, (v) => { a.airfieldProtection = v; }, rerender, { visualRef: 'airfield-protection' }));
      wrap.appendChild(makeNumberField('Capacidad de Hangares', a.hangarCapacity, (v) => { a.hangarCapacity = v; }, rerender, { visualRef: 'airfield-capacity' }));
      wrap.appendChild(el('p', 'source-refs', f.apronRule));
      wrap.appendChild(el('p', 'source-refs', f.absorbRule));
      listRows(wrap, a.units, (row, unit, idx) => {
        row.appendChild(makeTextField(`Unidad aérea ${idx + 1}: nombre (opcional)`, unit.name, (v) => { unit.name = v; }));
        row.appendChild(makeOptionGroup({ prompt: `Unidad aérea ${idx + 1}: ¿usa el Valor de Protección del aeródromo?`, options: YES_NO }, unit.uses, (v) => { unit.uses = v; rerender(); }));
        row.appendChild(makeOptionGroup({ prompt: `Unidad aérea ${idx + 1}: ¿ya está dañada o no tiene lado dañado?`, options: YES_NO }, unit.cannotSurvive, (v) => { unit.cannotSurvive = v; rerender(); }));
      }, '+ Añadir unidad aérea (en el orden en que el defensor las elige)', () => ({ name: '', uses: 'no', cannotSurvive: 'no' }), rerender);
      wrap.appendChild(el('h3', null, 'Instalaciones logísticas (regla opcional)'));
      wrap.appendChild(makeOptionGroup({ prompt: '¿Se usa la regla opcional de ataque a instalaciones logísticas?', options: YES_NO }, a.logisticsOn, (v) => { a.logisticsOn = v; rerender(); }));
      if (a.logisticsOn === 'yes') {
        wrap.appendChild(makeNumberField('Puntos de Impacto asignados a la logística', a.logisticsImpacts, (v) => { a.logisticsImpacts = v; }, rerender, { visualRef: 'impact-points' }));
        wrap.appendChild(makeNumberField('Valor de Preparación actual del aeródromo', a.readiness, (v) => { a.readiness = v; }, rerender, { visualRef: 'airfield-readiness' }));
        wrap.appendChild(el('p', 'source-refs', f.logisticsRule));
      }
    }

    if (calc && calc.error) wrap.appendChild(el('p', 'pending-note', calc.error.message));
    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); }),
      wizardNavButton('Ver resultado →', 'primary', () => {
        if (!calc || calc.error) { alert(calc && calc.error ? calc.error.message : 'Completa los datos del objetivo.'); return; }
        state.step = 2;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // Líneas de resumen del resultado según el objetivo.
  function summaryOf(rules, calc) {
    const r = calc.result;
    const lines = [];
    let resultText = '';
    if (state.target === 'ground_unit') {
      const who = state.unit.label ? `Unidad ${state.unit.label}` : 'Unidad terrestre';
      lines.push(`${who}: ${calc.kind.label}; ${r.impacts} Punto(s) de Impacto contra Protección ${r.protection}${r.terrain ? ` + Terreno ${r.terrain} = ${r.effectiveProtection}` : ''}.`);
      if (r.kind === 'air_pursuit') {
        resultText = `${r.damage} punto(s) de daño y ${r.forceLoss} de tamaño de fuerza (${r.impacts} ÷ ${r.protection}, redondeado hacia abajo)`;
      } else if (r.damage) {
        resultText = `1 punto de daño y -1 de tamaño de fuerza${r.capped ? ' (los impactos sobrantes no suman: máximo 1 por ataque)' : ''}`;
      } else {
        resultText = `sin daño (${r.impacts} < ${r.effectiveProtection})`;
      }
    } else if (state.target === 'port') {
      lines.push(`Puerto: ${r.totalImpacts} impactos; ${r.assigned} asignados, ${r.unassigned} sin asignar.`);
      const parts = [];
      if (r.portProtection) {
        lines.push(`Puerto (Protección ${r.portProtection}): ${r.paralyzed} efecto(s) de Instalación Paralizada; Munición y Combustible -${r.ammoFuelLoss} cada uno.`);
        parts.push(`${r.paralyzed} Instalación(es) Paralizada(s)`);
      }
      r.ships.forEach((s, i) => {
        const name = state.port.ships[i].name || `Buque ${i + 1}`;
        if (s.type === 'surface') {
          lines.push(`${name} (superficie): ${s.damagePoints} punto(s) de daño${s.damagePoints ? ' — resuelve los efectos de impacto (§5.9) con el wizard de Efectos del impacto antibuque' : ''}.`);
          if (s.damagePoints) parts.push(`${name}: ${s.damagePoints} daño(s)`);
        } else {
          lines.push(`${name} (submarino): ${s.destroyed ? 'destruido y eliminado' : 'sin impactos'}.`);
          if (s.destroyed) parts.push(`${name}: destruido`);
        }
      });
      resultText = parts.length ? parts.join(' · ') : 'sin efectos';
    } else {
      lines.push(`Aeródromo: ${r.assigned} impactos asignados, ${r.unassigned} sin asignar (se ignoran).`);
      const parts = [];
      if (r.runway) {
        lines.push(`Pista: ${r.runway.impacts} impactos → baja ${r.runway.levelsLost} nivel(es): de ${r.runway.letterBefore} a ${r.runway.letterAfter}${r.runway.ignored ? `; ${r.runway.ignored} impacto(s) sobrante(s) ignorado(s)` : ''}.`);
        parts.push(`pista ${r.runway.letterBefore} → ${r.runway.letterAfter}`);
      }
      if (r.apron) {
        r.apron.units.forEach((u) => {
          lines.push(`${u.name} (Protección ${u.protection}): ${u.damaged ? `absorbe ${u.absorbed} y ${u.eliminated ? 'es eliminada' : 'se da la vuelta a su lado dañado'}` : 'no sufre daño'}.`);
        });
        if (r.apron.ignored) lines.push(`Apron: ${r.apron.ignored} impacto(s) sobrante(s) ignorado(s).`);
        const damaged = r.apron.units.filter((u) => u.damaged);
        parts.push(`apron: ${damaged.filter((u) => u.eliminated).length} eliminada(s), ${damaged.filter((u) => u.flipped).length} dañada(s)`);
      }
      if (r.logistics) {
        lines.push(`Logística: ${r.logistics.impacts} impactos → Preparación -${r.logistics.readinessLost}; queda ${r.logistics.readinessAfter}.`);
        parts.push(`Preparación -${r.logistics.readinessLost}`);
      }
      resultText = parts.length ? parts.join(' · ') : 'sin efectos';
    }
    return { lines, resultText };
  }

  // ---------- Paso 3: Resultado ----------
  function renderStepResult(wrap, rules, rerender) {
    wrap.appendChild(el('h2', null, 'Resultado'));
    const calc = compute(rules);
    if (!calc || calc.error) {
      wrap.appendChild(el('p', 'pending-note', calc && calc.error ? calc.error.message : 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const { lines, resultText } = summaryOf(rules, calc);
    const box = el('div', 'wizard-modifier-summary');
    lines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    if (state.target === 'ground_unit') wrap.appendChild(el('p', 'source-refs', rules.groundUnit.mobileUnitNote));
    if (state.target === 'port') {
      wrap.appendChild(el('p', 'source-refs', rules.port.repairRule));
      wrap.appendChild(wizardNavButton('Efectos del impacto antibuque (§5.9) →', 'secondary', () => { location.hash = '#/wizard/ship-impact-effects'; }));
    }
    if (state.target === 'airfield') wrap.appendChild(el('p', 'source-refs', rules.airfield.runwayRule));
    wrap.appendChild(el('p', 'source-refs', rules.notModeled));

    const fullSummaryText = ['Resolución del resultado del ataque terrestre', ...lines, `Resultado: ${resultText}`].join('\n');
    const shareRow = el('div', 'action-row');
    const copyBtn = el('button', 'btn btn--secondary', '📋 Copiar resumen');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => {
      copyTextToClipboard(fullSummaryText).then((ok) => {
        copyBtn.textContent = ok ? '✓ Copiado' : 'No se pudo copiar';
        setTimeout(() => { copyBtn.textContent = '📋 Copiar resumen'; }, 2000);
      });
    });
    shareRow.appendChild(copyBtn);
    const saveBtn = el('button', 'btn btn--secondary', '💾 Guardar en historial');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => {
      saveResolutionToHistory({ workflowId: 'ground_attack_result', workflowTitle: 'Resolución del resultado del ataque terrestre', summaryText: fullSummaryText, state });
      unlinkTurnContext(state);
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => { unlinkTurnContext(state); state = freshState(); rerender(); })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.GroundAttackResultWizard = { render: renderGroundAttackResultWizard, loadStateFromHistory, prefill };
})(typeof window !== 'undefined' ? window : globalThis);
