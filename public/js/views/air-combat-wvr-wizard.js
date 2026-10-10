// Wizard de combate: Combate Aéreo Cercano WVR de una Interceptación de Combate
// Aéreo (roadmap Fase 11; data/workflows/05_combate_aereo.json, etapa `wvr` +
// data/tables/page-17.json + public/js/air-combat-wvr-engine.js). Sigue el
// Decision Book §7.16.4 (pp. 145-148): fuerzas de cada bando (patrulla en red,
// escolta electrónica), rondas de combate cercano con tirada simultánea,
// absorción de impactos elegida por el jugador, salida de combate / derrota y,
// si ambos bandos son CAPs, rondas adicionales con +1 acumulativo sin daño.
//
// El texto de las reglas se lee del workflow (datos antes que lógica); la
// mecánica vive en el motor puro. Todo se recalcula en cada render a partir
// de las respuestas guardadas (`replayRounds`).
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow, renderNotFound, copyTextToClipboard, saveResolutionToHistory,
    loadWorkflow, loadTablePage,
    makeTextField, makeNumberField, makeOptionGroup, makeSelectFromValues,
    wizardActionRow, wizardNavButton, renderGrid
  } = AppCore;

  const WIZARD_STEPS = ['Fuerzas de cada bando', 'Rondas de combate cercano', 'Resultado'];
  const DIE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];
  const SIDES = ['A', 'B'];
  const other = (k) => (k === 'A' ? 'B' : 'A');

  let unitCounter = 0;
  function freshUnit() {
    unitCounter += 1;
    return { id: `u${Date.now().toString(36)}${unitCounter}`, name: '', airCombatValue: '', protection: '', network: 'no', bvrOut: 'no' };
  }

  function freshRound() {
    return { rolls: { A: '', B: '' }, damage: { A: {}, B: {} }, eliminated: { A: [], B: [] } };
  }

  function freshState() {
    return {
      step: 0,
      sides: {
        A: { label: 'Bando A', groupType: '', eea: 'no', units: [freshUnit()] },
        B: { label: 'Bando B', groupType: '', eea: 'no', units: [freshUnit()] }
      },
      rounds: [freshRound()],
      turnResolutionId: null
    };
  }

  let state = null;

  function loadStateFromHistory(savedState) {
    state = JSON.parse(JSON.stringify(savedState));
    SIDES.forEach((k) => state.sides[k].units.forEach((u) => { if (!u.bvrOut) u.bvrOut = 'no'; }));
    state.step = 2;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'air-combat-wvr', type: 'air_combat_wvr', getState: () => state });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  const unlinkTurnContext = () => lifecycle.unlink();

  const sideName = (key) => state.sides[key].label || `Bando ${key}`;
  const unitName = (u, idx) => u.name || `Unidad ${idx + 1}`;

  // Bandos tal como los consume el motor (unidades sin datos mínimos fuera).
  function engineSides() {
    const out = {};
    SIDES.forEach((k) => {
      const s = state.sides[k];
      out[k] = {
        groupType: s.groupType,
        eea: s.eea === 'yes',
        units: s.units.filter((u) => u.bvrOut !== 'yes').map((u, idx) => ({ id: u.id, name: unitName(u, s.units.indexOf(u)), airCombatValue: u.airCombatValue, protection: u.protection, network: u.network === 'yes' }))
      };
    });
    return out;
  }

  function forcesComplete() {
    return SIDES.every((k) => {
      const s = state.sides[k];
      const active = s.units.filter((u) => u.bvrOut !== 'yes');
      return s.groupType !== '' && active.length > 0 && active.every((u) => u.protection !== '' && Number(u.protection) >= 1 && (u.airCombatValue === '' || !Number.isNaN(Number(u.airCombatValue))));
    });
  }

  function replay(rule, table) {
    const schemeFor = (type) => (rule.groupTypes.find((g) => g.value === type) || {}).columnScheme || null;
    return AirCombatWvrEngine.replayRounds(table, TableEngine, { sides: engineSides(), rounds: state.rounds, schemeFor });
  }

  async function renderAirCombatWvrWizard() {
    const navToken = Router.currentToken();
    state = AppCore.resolveWizardState('air-combat-wvr', state, freshState);
    linkToTurnContextIfNeeded(state, 'Combate aéreo cercano WVR');
    AppCore.persistWizardDraft('air-combat-wvr', state, () => state);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Combate aéreo cercano WVR']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let page17;
    try {
      [workflow, page17] = await Promise.all([loadWorkflow('05_combate_aereo.json'), loadTablePage('page-17.json')]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    const stage = workflow.stages.find((st) => st.id === 'wvr');
    const ctx = { stage, rule: stage.roundRule, table: TableEngine.findTableInPage(page17, 'air-combat-wvr-damage').table };

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', 'Combate aéreo cercano WVR (dentro del alcance visual)'));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${state.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[state.step]}`));
    wrap.appendChild(el('p', 'source-refs', 'Tablas-de-combate 5.pdf, pág. 17 · Decision Book §7.16.4. Si antes hubo combate BVR, resuélvelo primero en su propio wizard y entra aquí solo con las unidades que no se han retirado.'));
    wrap.appendChild(wizardNavButton('Ver tabla de combate cercano WVR (pág. 17)', 'secondary', () => {
      location.hash = '#/ayuda/tablas/page-17.json/air-combat-wvr-damage';
    }));

    const rerender = () => { renderAirCombatWvrWizard(); };

    AppCore.mountWizardDraft('air-combat-wvr', wrap, () => { unlinkTurnContext(state); state = freshState(); rerender(); });
    [
      () => renderStepForces(wrap, ctx, rerender),
      () => renderStepRounds(wrap, ctx, rerender),
      () => renderStepResult(wrap, ctx, rerender)
    ][state.step]();

    viewRoot.appendChild(wrap);
  }

  // ---------- Paso 1: Fuerzas ----------
  function renderStepForces(wrap, ctx, rerender) {
    const { rule } = ctx;
    wrap.appendChild(el('h2', null, 'Fuerzas de cada bando'));
    wrap.appendChild(el('p', 'turn-view__desc', rule.participation));
    wrap.appendChild(el('p', 'source-refs', 'Si vienes del combate BVR: las unidades que se retiraron o salieron temporalmente de combate (Decision Book §7.16.3 puntos 4-5 y §7.16.6) no participan; márcalas en cada unidad.'));
    wrap.appendChild(wizardNavButton('Cargar el grupo de misión', 'secondary', () => {
      const group = AppCore.loadAirGroup();
      if (AirMissionGroup.isEmpty(group)) { alert('El grupo de misión está vacío. Edítalo en «Grupo de misión aéreo».'); return; }
      const loaded = AirMissionGroup.toWvrSides(group);
      SIDES.forEach((k) => {
        state.sides[k] = { label: loaded[k].label, groupType: loaded[k].groupType, eea: loaded[k].eea, units: loaded[k].units.length ? loaded[k].units : [freshUnit()] };
      });
      state.rounds = [freshRound()];
      rerender();
    }));
    wrap.appendChild(wizardNavButton('Guardar estas fuerzas en el grupo de misión', 'secondary', () => {
      AppCore.saveAirGroup(AirMissionGroup.mergeWvr(AppCore.loadAirGroup(), state.sides, {}));
      alert('Fuerzas guardadas en el grupo de misión.');
    }));
    wrap.appendChild(el('p', 'source-refs', rule.networkPatrol));
    wrap.appendChild(el('p', 'source-refs', rule.electronicEscort));
    wrap.appendChild(el('p', 'source-refs', rule.noAirCombatValue));

    SIDES.forEach((k) => {
      const s = state.sides[k];
      wrap.appendChild(el('h3', null, sideName(k)));
      wrap.appendChild(makeTextField(`${k}: nombre (opcional)`, s.label, (v) => { s.label = v; }));
      wrap.appendChild(makeOptionGroup({ prompt: `${k}: misión del grupo`, options: rule.groupTypes.map((g) => ({ value: g.value, label: g.label })) }, s.groupType, (v) => { s.groupType = v; rerender(); }));
      if (s.groupType !== '' && !rule.groupTypes.find((g) => g.value === s.groupType).columnScheme) {
        wrap.appendChild(el('p', 'pending-note', rule.groupTypesNote));
      }
      wrap.appendChild(makeOptionGroup({ prompt: `${k}: ¿hay un avión de guerra electrónica con escudo de escolta electrónica (EEA) desde el inicio?`, options: YES_NO }, s.eea, (v) => { s.eea = v; rerender(); }));

      s.units.forEach((u, idx) => {
        const row = el('div', 'wizard-unit');
        row.appendChild(el('p', 'wizard-question__prompt', `${k} · ${unitName(u, idx)}`));
        row.appendChild(makeTextField(`${k} · unidad ${idx + 1}: nombre`, u.name, (v) => { u.name = v; }));
        row.appendChild(makeNumberField(`${k} · unidad ${idx + 1}: Valor de Combate Aéreo (vacío si no tiene)`, u.airCombatValue, (v) => { u.airCombatValue = v; }, rerender, { visualRef: 'bvr-air-combat-value' }));
        row.appendChild(makeNumberField(`${k} · unidad ${idx + 1}: Valor de Protección`, u.protection, (v) => { u.protection = v; }, rerender, { visualRef: 'air-protection' }));
        row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${idx + 1}: ¿viene de la patrulla CAPs en red que se une?`, options: YES_NO }, u.network, (v) => { u.network = v; rerender(); }));
        row.appendChild(makeOptionGroup({ prompt: `${k} · unidad ${idx + 1}: ¿se retiró o salió de combate en el BVR (no participa en el combate cercano)?`, options: YES_NO }, u.bvrOut, (v) => { u.bvrOut = v; rerender(); }));
        if (s.units.length > 1) {
          row.appendChild(wizardNavButton('Quitar unidad', 'secondary', () => { s.units.splice(idx, 1); rerender(); }));
        }
        wrap.appendChild(row);
      });
      wrap.appendChild(wizardNavButton(`+ Añadir unidad a ${sideName(k)}`, 'secondary', () => { s.units.push(freshUnit()); rerender(); }));
      if (s.units.some((u) => u.network === 'yes') && state.sides[other(k)].eea === 'yes') {
        wrap.appendChild(el('p', 'pending-note', `${sideName(other(k))} tiene escolta electrónica: la patrulla en red de ${sideName(k)} solo se une en la segunda ronda.`));
      }
    });

    wrap.appendChild(wizardActionRow([
      wizardNavButton('Siguiente →', 'primary', () => {
        if (!forcesComplete()) { alert('Elige la misión de cada bando y da a cada unidad su Valor de Protección (1 o más).'); return; }
        state.step = 1;
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  // Línea de texto con el ataque de un bando en una ronda.
  function attackLine(k, sideRes) {
    const a = sideRes.attack;
    if (sideRes.attackError) return `${sideName(k)}: ${sideRes.attackError}`;
    if (!a) return `${sideName(k)}: falta la tirada.`;
    if (a.noAttack) return `${sideName(k)}: Valor de Combate Aéreo total 0, no ataca.`;
    if (a.noRow) return `${sideName(k)}: su misión no tiene fila en la tabla y su CA es ${a.airCombatValue}; el ataque queda pendiente.`;
    if (a.noColumn) return `${sideName(k)}: CA ${a.airCombatValue} sin columna en su fila; la tabla no dice qué ocurre.`;
    return `${sideName(k)}: CA ${a.airCombatValue}, tirada ${a.naturalRoll}${a.roundBonus ? ` + ${a.roundBonus} (rondas sin daño) = ${a.modifiedRoll}` : ''}${a.rollClamped ? ' → se lee la fila 9' : ''} · columna «${a.cell.columnLabel}» → ${a.impacts} Punto(s) de Impacto.`;
  }

  function absorptionLine(k, abs, units) {
    if (!abs) return null;
    const names = abs.damaged.map((id) => (units.find((u) => u.id === id) || {}).name).filter(Boolean);
    return `${sideName(k)} recibe ${abs.impacts}: absorbe ${abs.consumed}${names.length ? ` (${names.join(', ')})` : ''}, se ignoran ${Math.max(abs.remaining, 0)}.`;
  }

  // ---------- Paso 2: Rondas ----------
  function renderStepRounds(wrap, ctx, rerender) {
    const { rule, table } = ctx;
    wrap.appendChild(el('h2', null, 'Rondas de combate cercano'));
    let replayed;
    try {
      replayed = replay(rule, table);
    } catch (err) {
      wrap.appendChild(el('p', 'pending-note', `No se pudo resolver: ${err.message}`));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }
    const lastIndex = state.rounds.length - 1;
    const named = { A: engineSides().A.units, B: engineSides().B.units };

    // Rondas ya cerradas: resumen.
    replayed.rounds.slice(0, lastIndex).forEach((r) => {
      const box = el('div', 'wizard-modifier-summary');
      box.appendChild(el('span', 'wizard-modifier-summary__total', `Ronda ${r.index + 1}${r.roundBonus ? ` (+${r.roundBonus})` : ''}`));
      SIDES.forEach((k) => box.appendChild(el('span', null, attackLine(k, r.sides[k]))));
      SIDES.forEach((k) => { const l = absorptionLine(k, r.sides[k].absorption, r.sides[k].inCombat); if (l) box.appendChild(el('span', 'source-refs', l)); });
      wrap.appendChild(box);
    });

    const r = replayed.rounds[lastIndex];
    const round = state.rounds[lastIndex];
    wrap.appendChild(el('h3', null, `Ronda ${lastIndex + 1}`));
    if (!r) {
      wrap.appendChild(el('p', 'pending-note', 'Completa la ronda anterior.'));
    } else {
      if (r.roundBonus) wrap.appendChild(el('p', 'wizard-modifier-summary__total', `+${r.roundBonus} a la tirada de ambos bandos por ${r.roundBonus} ronda(s) seguidas sin daño.`));
      if (r.roundBonus) wrap.appendChild(el('p', 'source-refs', rule.noDamageBonusApplication));
      wrap.appendChild(el('p', 'turn-view__desc', 'Ambos bandos tiran 1d10 a la vez; los Puntos de Impacto se aplican simultáneamente.'));

      SIDES.forEach((k) => {
        const sr = r.sides[k];
        const s = state.sides[k];
        const group = rule.groupTypes.find((g) => g.value === s.groupType);
        wrap.appendChild(el('h4', null, `Ataque de ${sideName(k)}`));
        const delayed = named[k].filter((u) => u.network && !sr.inCombat.some((x) => x.id === u.id) && !replayed.out[k].has(u.id));
        wrap.appendChild(el('p', 'source-refs', `En combate: ${sr.inCombat.map((u) => `${u.name} (CA ${u.airCombatValue === '' ? '—' : u.airCombatValue})`).join(', ') || 'ninguna unidad'} · fila «${group.label}».${delayed.length ? ` Todavía no se unen (escolta electrónica enemiga): ${delayed.map((u) => u.name).join(', ')}.` : ''}`));
        if (sr.airCombatValue > 0 && group.columnScheme) {
          wrap.appendChild(makeSelectFromValues(`${k}: tirada WVR (1d10)`, DIE_VALUES, round.rolls[k], (v) => { round.rolls[k] = v; rerender(); }));
          wrap.appendChild(wizardNavButton(`🎲 Tirada aleatoria (${k})`, 'secondary', () => { round.rolls[k] = String(Math.floor(Math.random() * 10)); rerender(); }));
        }
        if (sr.attack || sr.attackError) {
          wrap.appendChild(el('p', sr.attack && (sr.attack.noRow || sr.attack.noColumn) ? 'pending-note' : 'wizard-modifier-summary__total', attackLine(k, sr)));
        }
      });

      SIDES.forEach((k) => {
        const sr = r.sides[k];
        const abs = sr.absorption;
        if (!abs || abs.impacts === 0) return;
        wrap.appendChild(el('h4', null, `${sideName(k)} absorbe ${abs.impacts} Punto(s) de Impacto`));
        sr.inCombat.forEach((u) => {
          const label = `${k} · ${u.name} (Protección ${u.protection}): puntos de daño`;
          wrap.appendChild(makeNumberField(label, round.damage[k][u.id] || '', (v) => { round.damage[k][u.id] = v; }, rerender));
          if (Number(round.damage[k][u.id]) > 0) {
            const elim = round.eliminated[k].includes(u.id) ? 'yes' : 'no';
            wrap.appendChild(makeOptionGroup({ prompt: `${k} · ${u.name}: ¿queda eliminada?`, options: YES_NO }, elim, (v) => {
              round.eliminated[k] = round.eliminated[k].filter((id) => id !== u.id);
              if (v === 'yes') round.eliminated[k].push(u.id);
              rerender();
            }));
          }
        });
        if (abs.overAllocated) {
          wrap.appendChild(el('p', 'pending-note', `Has asignado ${abs.consumed} y solo hay ${abs.impacts} impactos.`));
        } else {
          wrap.appendChild(el('p', 'source-refs', `Absorbidos ${abs.consumed}; quedan ${abs.remaining}.`));
          if (abs.mustAbsorbMore) wrap.appendChild(el('p', 'pending-note', `Quedan ${abs.remaining} impactos y alguna unidad en combate tiene Protección ${abs.minProtection}: la regla obliga a seguir absorbiendo siempre que sea posible.`));
        }
      });
      wrap.appendChild(el('p', 'source-refs', rule.absorption));

      if (r.complete) {
        // Reparto de impactos explicado antes de dar la ronda por cerrada (roadmap Fase 11).
        const dist = el('div', 'wizard-modifier-summary');
        dist.appendChild(el('span', 'wizard-modifier-summary__total', 'Reparto de impactos de la ronda: revísalo antes de continuar'));
        SIDES.forEach((k) => {
          const abs = r.sides[k].absorption;
          if (!abs || abs.impacts === 0) { dist.appendChild(el('span', null, `${sideName(k)} no recibe Puntos de Impacto.`)); return; }
          const parts = r.sides[k].inCombat.filter((u) => Number(round.damage[k][u.id]) > 0)
            .map((u) => `${u.name}: ${round.damage[k][u.id]} punto(s)${round.eliminated[k].includes(u.id) ? ', eliminada' : ''}`);
          dist.appendChild(el('span', null, `${sideName(k)} recibe ${abs.impacts} Punto(s) de Impacto y los absorben: ${parts.join('; ') || 'ninguna unidad'}. Absorbidos ${abs.consumed}${abs.remaining > 0 ? (abs.mustAbsorbMore ? `; faltan ${abs.remaining} por absorber` : `; los ${abs.remaining} restantes se ignoran porque ninguna unidad en combate puede absorberlos`) : ''}.`));
        });
        wrap.appendChild(dist);
        const box = el('div', 'wizard-modifier-summary');
        box.appendChild(el('span', 'wizard-modifier-summary__total', `Fin de la ronda ${lastIndex + 1}`));
        SIDES.forEach((k) => {
          const exited = named[k].filter((u) => replayed.out[k].has(u.id)).map((u) => u.name);
          box.appendChild(el('span', null, `${sideName(k)}: ${r.defeated[k] ? '"Derrotado". ' : ''}${exited.length ? `fuera de combate o eliminadas: ${exited.join(', ')}.` : 'todas sus unidades siguen en combate.'}`));
        });
        box.appendChild(el('span', 'source-refs', rule.exitAndDefeat));
        if (r.canContinue) {
          box.appendChild(el('span', null, `Ambos bandos son CAPs y ninguno está derrotado: puede jugarse otra ronda si ninguno se retira.${r.nextBonus ? ` La siguiente tendrá +${r.nextBonus} (ronda sin daño).` : ''}`));
        } else {
          box.appendChild(el('span', null, 'No hay más rondas: solo continúan dos grupos CAPs que no estén derrotados.'));
        }
        wrap.appendChild(box);
        wrap.appendChild(el('p', 'source-refs', rule.nextRound));
      }
    }

    // Volver atrás desde una ronda adicional la descarta de forma explícita
    // (AGENTS.md §9.2); desde la primera, vuelve a las fuerzas conservándola.
    const buttons = [lastIndex > 0
      ? wizardNavButton('← Descartar esta ronda', 'secondary', () => { state.rounds.pop(); rerender(); })
      : wizardNavButton('← Anterior', 'secondary', () => { state.step = 0; rerender(); })];
    if (r && r.complete && r.canContinue) {
      buttons.push(wizardNavButton('Otra ronda →', 'secondary', () => { state.rounds.push(freshRound()); rerender(); }));
    }
    buttons.push(wizardNavButton('Ver resultado →', 'primary', () => {
      if (!r || !r.complete) { alert('Completa las tiradas y la absorción de impactos de esta ronda.'); return; }
      state.step = 2;
      rerender();
    }));
    wrap.appendChild(wizardActionRow(buttons));
    wrap.appendChild(backRow());
  }

  // ---------- Paso 3: Resultado ----------
  function renderStepResult(wrap, ctx, rerender) {
    const { rule, table } = ctx;
    wrap.appendChild(el('h2', null, 'Resultado'));
    let replayed;
    try { replayed = replay(rule, table); } catch (err) { replayed = null; }
    const last = replayed && replayed.rounds[replayed.rounds.length - 1];
    if (!last || !last.complete) {
      wrap.appendChild(el('p', 'pending-note', 'Faltan datos: vuelve a los pasos anteriores.'));
      wrap.appendChild(wizardActionRow([wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); })]));
      wrap.appendChild(backRow());
      return;
    }

    const summaryLines = [];
    SIDES.forEach((k) => {
      const g = rule.groupTypes.find((x) => x.value === state.sides[k].groupType);
      summaryLines.push(`${sideName(k)}: ${g.label}${state.sides[k].eea === 'yes' ? ', con escolta electrónica' : ''}; ${engineSides()[k].units.length} unidad(es) en combate${state.sides[k].units.length > engineSides()[k].units.length ? ` (${state.sides[k].units.length - engineSides()[k].units.length} fuera desde el BVR)` : ''}.`);
    });
    replayed.rounds.forEach((r) => {
      summaryLines.push(`Ronda ${r.index + 1}${r.roundBonus ? ` (+${r.roundBonus})` : ''}:`);
      SIDES.forEach((k) => summaryLines.push(`  ${attackLine(k, r.sides[k])}`));
      SIDES.forEach((k) => { const l = absorptionLine(k, r.sides[k].absorption, r.sides[k].inCombat); if (l) summaryLines.push(`  ${l}`); });
    });
    const status = SIDES.map((k) => {
      const units = engineSides()[k].units;
      const left = units.filter((u) => !replayed.out[k].has(u.id)).length;
      return `${sideName(k)}${last.defeated[k] ? ' "Derrotado"' : ''}: ${left} de ${units.length} unidad(es) siguen en combate`;
    });
    const resultText = `${replayed.rounds.length} ronda(s) · ${status.join(' · ')}`;

    const box = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => box.appendChild(el('span', null, line)));
    wrap.appendChild(box);
    wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
    wrap.appendChild(wizardNavButton('Guardar el resultado en el grupo de misión', 'secondary', () => {
      const outIds = {};
      SIDES.forEach((k) => { outIds[k] = [...replayed.out[k]]; });
      AppCore.saveAirGroup(AirMissionGroup.mergeWvr(AppCore.loadAirGroup(), state.sides, outIds));
      alert('Resultado guardado: las unidades que salieron de combate quedan marcadas en el grupo de misión.');
    }));

    SIDES.forEach((k) => {
      const a = last.sides[k].attack;
      if (a && a.cell) {
        wrap.appendChild(el('h4', null, `Última ronda, ataque de ${sideName(k)}`));
        wrap.appendChild(renderGrid(table, table.rowAxis.values, TableEngine.pickAxisLabels(table.columnAxis, a.columnScheme), a.cell));
      }
    });
    if (replayed.rounds.some((r) => SIDES.some((k) => r.sides[k].attack && r.sides[k].attack.rollClamped))) {
      AppCore.appendNoteWithTrace(wrap, 'source-refs', 'La bonificación de +1 por ronda sin daño se suma a la tirada (confirmado por el mantenedor); si la tirada supera 9 se lee la fila 9, igual que en el BVR.', 'Confirmación del mantenedor, 2026-10-07; ver docs/rules/known-ambiguities.md, «Combate aéreo cercano WVR (página 17)».');
    }

    wrap.appendChild(el('h3', null, 'Retirada'));
    wrap.appendChild(el('p', 'source-refs', rule.withdrawal.order));
    const shown = new Set();
    SIDES.forEach((k) => {
      const t = state.sides[k].groupType;
      const key = t === 'cap' || t === 'intercept' ? t : 'other';
      if (shown.has(key)) return;
      shown.add(key);
      wrap.appendChild(el('p', 'turn-view__desc', rule.withdrawal[key]));
    });
    wrap.appendChild(el('p', 'source-refs', rule.withdrawal.sustained));

    const fullSummaryText = ['Combate aéreo cercano WVR', ...summaryLines, `Resultado: ${resultText}`].join('\n');
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
      saveResolutionToHistory({ workflowId: 'air_combat_wvr', workflowTitle: 'Combate aéreo cercano WVR', summaryText: fullSummaryText, state });
      unlinkTurnContext(state);
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
    });
    shareRow.appendChild(saveBtn);
    wrap.appendChild(shareRow);

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { state.step = 1; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => {
        unlinkTurnContext(state);
        state = freshState();
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.AirCombatWvrWizard = { render: renderAirCombatWvrWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
