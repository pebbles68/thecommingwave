// Paso de Resultado del wizard de Ataque Guiado contra Superficie, con su
// sección de asignación de impactos (pasos 5-6 de la hoja de ayuda;
// correcciones03.md COR03-006): solo renderizado DOM. Recibe el estado `s` y
// dos callbacks del controlador (`onSaved`, `onRestart`) en vez de tocar el
// estado del wizard ni el vínculo con el turno guiado directamente. Los
// cálculos viven en public/js/antiship-guided-model.js.
(function (root) {
  'use strict';

  const {
    el, backRow, copyTextToClipboard, saveResolutionToHistory, renderGrid,
    makeTextField, makeNumberField, makeSelectFromValues, wizardActionRow, wizardNavButton
  } = AppCore;
  const {
    getWizardStage, computeAttackValueAfterDefenses, computeVefAndMultiplier, computeImpactAssignmentSummary
  } = AntishipGuidedModel;

  // Pasos 5-6 de la hoja de ayuda: a qué unidad concreta de la flota impacta
  // el ataque, absorción por Protección y comprobación de hundimiento.
  // Sin tabla de por medio (aritmética directa sobre la hoja de flota, ver
  // public/js/combat-wizard-engine.js#assignImpactTarget/applyImpactsToShip/
  // checkSinking) — se renderiza dentro del paso de Resultado, una vez se
  // conoce el número de impactos.
  function renderImpactAssignmentSection(wrap, s, totalImpacts, rerender, method, methodOptions) {
    const ia = s.impactAssignment;
    const damagePerImpact = CombatWizardEngine.damagePerImpactForMethod(method, methodOptions);

    wrap.appendChild(el('h2', null, 'Asignación de impactos y daño'));

    if (damagePerImpact === null) {
      wrap.appendChild(el('p', 'pending-note', `Método "${method}": esta etapa NO está modelada todavía (Decision Book §5.6.5). Balística/Espacio Cercano causa 6 puntos de daño por impacto si el buque tiene símbolo de escudo en su Valor de Protección, o lo hunde directamente si no lo tiene — un dato (si el buque tiene escudo) que este proyecto no registra todavía por unidad. Calcularlo sin ese dato sería inventar (AGENTS.md §14), así que esta sección no se muestra para este método.`));
      return;
    }
    wrap.appendChild(el('p', 'source-refs', 'Páginas 7-8: ¿A qué unidad de superficie de la Flota impacta el ataque japonés? / Cálculo del número de impactos.'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Introduce la flota objetivo (Protección y, si la unidad queda dañada, su Valor de Hundimiento "≤N" del lado dañado del counter). La unidad a la que impacta cada tirada se determina "0-9 de izquierda a derecha, reiniciando el conteo si se supera el número de buques" (nota impresa en la hoja de flota del tablero).'));
    wrap.appendChild(el('p', 'source-refs', `Daño por impacto para este método (${method}): ${damagePerImpact} — cada buque absorbe impactos hasta que impactos × ${damagePerImpact} ≥ su Protección (Decision Book §5.6.5).`));

    ia.fleetShips.forEach((ship, idx) => {
      const row = el('div', 'table-viewer__controls');
      row.appendChild(makeTextField(`Buque ${idx + 1}: identificador`, ship.id, (v) => { ship.id = v; }));
      row.appendChild(makeNumberField(`Buque ${idx + 1}: Protección`, ship.protection, (v) => { ship.protection = v; }, rerender, { visualRef: 'ship-protection' }));
      row.appendChild(makeNumberField(`Buque ${idx + 1}: Valor de Hundimiento (≤N)`, ship.sinkingThreshold, (v) => { ship.sinkingThreshold = v; }, rerender, { visualRef: 'ship-sink-value' }));
      row.appendChild(makeSelectFromValues(`Buque ${idx + 1}: ¿ya estaba dañado antes del ataque?`, ['Sí'], ship.damaged || '', (v) => { ship.damaged = v; rerender(); }));
      if (ia.fleetShips.length > 1) {
        row.appendChild(wizardNavButton('✕ Quitar', 'secondary', () => { ia.fleetShips.splice(idx, 1); rerender(); }));
      }
      wrap.appendChild(row);
    });
    wrap.appendChild(wizardNavButton('+ Añadir otro buque a la flota', 'secondary', () => { ia.fleetShips.push({ id: '', protection: '', sinkingThreshold: '' }); rerender(); }));

    ia.rounds.forEach((r, idx) => {
      const box = el('div', 'wizard-modifier-summary');
      box.appendChild(el('span', 'wizard-modifier-summary__total', `Impacto ${idx + 1}: tirada ${r.targetRoll} → ${r.targetId} (posición ${r.targetIndex + 1})`));
      box.appendChild(el('span', 'source-refs', r.damaged
        ? `Dañada: absorbe ${r.absorbed} impacto(s) (Protección ${r.protection}). Impactos restantes: ${r.remainingAfter}.`
        : `Impactos disponibles (${r.remainingAfter}) insuficientes para su Protección (${r.protection}): no se daña. La fuente no describe reintentar con otro objetivo, así que la resolución termina aquí.`));
      if (r.damaged && r.eliminatedDirectly) {
        box.appendChild(el('span', 'source-refs', 'Ya estaba dañado: al sufrir otro punto de daño es eliminado directamente, sin verificación por daño crítico (Decision Book §5.9).'));
      } else if (r.damaged) {
        box.appendChild(el('span', 'source-refs', `Tirada de hundimiento: ${r.sinkingRoll} ${r.sank ? `≤ ${r.sinkingThreshold} → se hunde y se retira de la flota.` : `> ${r.sinkingThreshold} → sobrevive dañada.`}`));
      }
      wrap.appendChild(box);
    });

    const summary = computeImpactAssignmentSummary(s, totalImpacts, damagePerImpact);

    if (!summary.complete) {
      const validShips = summary.survivors;
      const roundBox = el('div', 'table-viewer__controls');
      roundBox.appendChild(makeSelectFromValues('Tirada de asignación (1d10)', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], ia.pendingTargetRoll, (v) => { ia.pendingTargetRoll = v; rerender(); }));
      roundBox.appendChild(wizardNavButton('🎲 Tirada aleatoria', 'secondary', () => { ia.pendingTargetRoll = String(Math.floor(Math.random() * 10)); rerender(); }));
      wrap.appendChild(roundBox);

      let preview = null;
      let hit = null;
      if (ia.pendingTargetRoll !== '') {
        const assignment = CombatWizardEngine.assignImpactTarget(Number(ia.pendingTargetRoll), validShips);
        if (assignment) {
          preview = assignment;
          hit = CombatWizardEngine.applyImpactsToShip(assignment.ship, summary.impactsRemaining, damagePerImpact);
          wrap.appendChild(el('p', 'source-refs', `Impacta a ${assignment.ship.id} (posición ${assignment.index + 1} de ${validShips.length} supervivientes).`));
        }
      }

      if (hit && hit.damaged && preview.ship.damaged) {
        wrap.appendChild(el('p', 'pending-note', `${preview.ship.id} ya estaba dañado: al sufrir otro punto de daño es eliminado directamente, sin tirada de hundimiento (Decision Book §5.9).`));
      } else if (hit && hit.damaged) {
        wrap.appendChild(makeSelectFromValues('Tirada de hundimiento (1d10)', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], ia.pendingSinkingRoll, (v) => { ia.pendingSinkingRoll = v; rerender(); }));
      }

      const canConfirm = preview && hit && (!hit.damaged || preview.ship.damaged || ia.pendingSinkingRoll !== '');
      wrap.appendChild(wizardNavButton('Confirmar este impacto', 'primary', () => {
        if (!canConfirm) { alert('Elige la tirada de asignación (y, si la unidad queda dañada, la tirada de hundimiento).'); return; }
        const sinkingThreshold = preview.ship.sinkingThreshold !== '' ? Number(preview.ship.sinkingThreshold) : null;
        const fx = hit.damaged ? ShipImpactEffectsEngine.resolveFleetShipHit({ alreadyDamaged: !!preview.ship.damaged, sinkingThreshold: sinkingThreshold === null ? '' : sinkingThreshold, sinkingRoll: ia.pendingSinkingRoll }) : null;
        const sank = fx ? fx.removed : false;
        ia.rounds.push({
          targetRoll: ia.pendingTargetRoll,
          targetId: preview.ship.id,
          targetIndex: preview.index,
          protection: preview.ship.protection,
          damaged: hit.damaged,
          absorbed: hit.absorbed,
          remainingAfter: hit.remainingImpacts,
          sinkingRoll: hit.damaged && !preview.ship.damaged ? ia.pendingSinkingRoll : null,
          sinkingThreshold,
          eliminatedDirectly: !!(fx && fx.eliminatedDirectly),
          sank: !!sank
        });
        ia.pendingTargetRoll = '';
        ia.pendingSinkingRoll = '';
        rerender();
      }));
    } else if (ia.rounds.length === 0 && summary.survivors.length === 0) {
      wrap.appendChild(el('p', 'pending-note', 'Introduce al menos un buque con su Protección para empezar a asignar impactos.'));
    } else {
      const box = el('div', 'wizard-modifier-summary');
      if (summary.impactsRemaining > 0) {
        box.appendChild(el('span', 'wizard-modifier-summary__total', summary.haltedByMissedTarget
          ? `Resolución terminada: el último impacto no dañó a su objetivo.`
          : `Impactos restantes: ${summary.impactsRemaining} — insuficientes para dañar a ninguna unidad superviviente${summary.minSurvivorProtection !== null ? ` (Protección mínima ${summary.minSurvivorProtection})` : ''}: se desprecian.`));
      } else {
        box.appendChild(el('span', 'wizard-modifier-summary__total', 'Todos los impactos han sido asignados.'));
      }
      wrap.appendChild(box);
    }
  }

  function renderWizardStepResult(wrap, s, callbacks, workflow, page03, page04, page21, page22, rerender, methodOptions, diceFormulas) {
    wrap.appendChild(el('h2', null, 'Resultado'));

    const interceptionTable = TableEngine.findTableInPage(page04, 'munition-interception-standard').table;
    const areaAirDefenseAttackTable = TableEngine.findTableInPage(page03, 'ground-guided-area-air-defense').table;
    const vefTable = TableEngine.findTableInPage(page21, 'antiship-guided-vef-modifier').table;
    const multTable = TableEngine.findTableInPage(page21, 'antiship-guided-attack-multiplier').table;
    const finalTable = TableEngine.findTableInPage(page22, 'antiship-guided-final-damage').table;

    const attackAfter = computeAttackValueAfterDefenses(workflow, s, interceptionTable, areaAirDefenseAttackTable);
    const vef = computeVefAndMultiplier(workflow, s, vefTable, multTable);

    const stage4 = getWizardStage(workflow, 'attack_method');
    const methodAnswers = s.stageAnswers.attack_method;
    const diceInfo = CombatWizardEngine.findFirstEffect(stage4.questions, methodAnswers, 'dice', 'attack_resolution');
    const formula = CombatWizardEngine.describeDiceFormula(diceFormulas, diceInfo.effect.value);
    const finalRoll = CombatWizardEngine.resolveRoll(formula, s.rollInputs.slice(0, formula.rollCount));
    const rowScheme = CombatWizardEngine.finalTableRowScheme(methodAnswers.method, methodOptions);

    const finalAttackValue = attackAfter.total * vef.multiplierResult.multiplier;

    let result = null;
    let resolveError = null;
    try {
      result = TableEngine.resolveCell(finalTable, finalRoll, finalAttackValue, { rowScheme });
    } catch (err) {
      resolveError = err;
    }

    const summaryLines = [];
    if (s.attackerLabel || s.targetLabel) {
      summaryLines.push(`${s.attackerLabel || '(atacante sin nombre)'} ataca a ${s.targetLabel || '(objetivo sin nombre)'}`);
    }
    summaryLines.push(`Valor de Ataque base: ${s.baseAttackValue}`);
    summaryLines.push(`Reducción Defensa Aérea de Área: ${attackAfter.stage1Reduction} · Reducción Interceptación de Munición: ${attackAfter.interceptionReduction} → Valor de Ataque tras defensas: ${attackAfter.total}`);
    summaryLines.push(`V.E.F. bruto: ${vef.highest} + (${vef.modResult.total >= 0 ? '+' : ''}${vef.modResult.total}) = ${vef.rawVef}`);
    summaryLines.push(`Mod. V.E.F.: ${vef.vefRollResult.modResult.rawCell} → modificador a la tirada: ${vef.vefRollResult.rollModifier}`);
    summaryLines.push(`Tirada V.E.F.: ${s.vefRoll} + (${vef.vefRollResult.rollModifier}) = ${vef.modifiedRoll} → Multiplicador de ataque: ${vef.multiplierResult.multiplierResult.rawCell}`);
    summaryLines.push(`Valor de Ataque Final: ${attackAfter.total} × ${vef.multiplierResult.multiplier} = ${finalAttackValue}`);
    summaryLines.push(`Método de ataque: ${methodAnswers.method} (${formula.label}, esquema de fila "${rowScheme}") → tirada(s) ${s.rollInputs.slice(0, formula.rollCount).join(', ')} → tirada final: ${finalRoll}`);

    const summary = el('div', 'wizard-modifier-summary');
    summaryLines.forEach((line) => summary.appendChild(el('span', null, line)));
    wrap.appendChild(summary);

    let resultText = null;
    if (resolveError) {
      wrap.appendChild(el('p', 'pending-note', `No se pudo resolver la tabla final: ${resolveError.message}`));
    } else {
      resultText = result.isMissingData
        ? 'sin dato transcrito: el cálculo se detiene aquí'
        : (result.legendText ? result.legendText : `${result.displayValue} impacto(s)`);
      wrap.appendChild(el('p', 'table-viewer__value', `Resultado: ${resultText}`));
      TableEngine.describeResolution(finalTable, result).forEach((line) => wrap.appendChild(el('p', 'source-refs', line)));
      const rowLabels = TableEngine.pickAxisLabels(finalTable.rowAxis, rowScheme);
      wrap.appendChild(renderGrid(finalTable, rowLabels, finalTable.columnAxis.values, result));

      if (!result.isMissingData && result.rawCell !== '.') {
        const damageBox = el('div', 'pending-note');
        damageBox.appendChild(el('p', null, 'Daño por impacto (Decision Book §5.6.5):'));
        const damageSummary = methodOptions
          .filter((o) => o.damagePerImpact !== null)
          .map((o) => `${o.label}: ${o.damagePerImpact} daño(s) por impacto`)
          .join(' · ');
        damageBox.appendChild(el('p', 'turn-view__desc', `${damageSummary} · Balística/Espacio cercano: 6 daños por impacto si el buque tiene escudo en su Protección, o hundimiento directo si no lo tiene (dato de escudo no modelado todavía — ver la sección de abajo).`));
        wrap.appendChild(damageBox);

        const totalImpacts = Number(result.rawCell);
        if (!Number.isNaN(totalImpacts) && totalImpacts > 0) {
          renderImpactAssignmentSection(wrap, s, totalImpacts, rerender, methodAnswers.method, methodOptions);
        }
      }
    }

    if (resultText !== null) {
      const fullSummaryText = [`${workflow.title} — Ataque contra buques de superficie`, ...summaryLines, `Resultado: ${resultText}`].join('\n');
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
        saveResolutionToHistory({
          workflowId: 'antiship_guided',
          workflowTitle: `${workflow.title} — Ataque contra buques de superficie`,
          summaryText: fullSummaryText,
          state: s
        });
        // COR02-003: guardar la resolución la da por completada — deja de
        // bloquear el cierre de la fase que la inició.
        callbacks.onSaved();
        saveBtn.textContent = '✓ Guardado';
        setTimeout(() => { saveBtn.textContent = '💾 Guardar en historial'; }, 2000);
      });
      shareRow.appendChild(saveBtn);
      wrap.appendChild(shareRow);
    }

    wrap.appendChild(wizardActionRow([
      wizardNavButton('← Anterior', 'secondary', () => { s.step = 4; rerender(); }),
      wizardNavButton('Reiniciar wizard', 'secondary', () => {
        callbacks.onRestart();
        rerender();
      })
    ]));
    wrap.appendChild(backRow());
  }

  root.Views = root.Views || {};
  root.Views.AntishipGuidedResult = { renderWizardStepResult };
})(typeof window !== 'undefined' ? window : globalThis);
