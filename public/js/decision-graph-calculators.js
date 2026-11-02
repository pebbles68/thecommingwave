// Cálculos dentro de una pregunta del asistente de combate (Fase 25). Cada cálculo declarado en
// data/routing/decision-graph-calculators.json se resuelve aquí reutilizando el motor ya probado de su wizard, y
// devuelve por bando la columna, la fila y la celda elegidas (índices de data/tables/) más la explicación. La posición
// de esas columnas y filas en la página real sale de data/image-hotspots/table-pages.json (`markRects`). Sin DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./air-combat-wvr-engine.js'), require('./air-combat-bvr-engine.js'), require('./ground-close-combat-engine.js'), require('./asw-attack-engine.js'), require('./asw-signature-search-engine.js'), require('./asw-air-search-engine.js'), require('./torpedo-attack-engine.js'), require('./army-resupply-engine.js'), require('./ground-guided-attack-engine.js'), require('./anti-radiation-attack-engine.js'), require('./combat-modifier-engine.js'), require('./strategic-actions-engine.js'), require('./table-engine.js'), require('./combat-wizard-engine.js'), require('./ground-attack-result-engine.js'), require('./ship-impact-effects-engine.js'), require('./ew-escort-engine.js'), require('./ground-reaction-engine.js'), require('./submarine-ambush-engine.js'), require('./port-logistics-engine.js'), require('./logistics-guarantee-engine.js'), require('./cyber-attack-engine.js'), require('./air-intercept-targets-engine.js'));
  else root.DecisionGraphCalculators = factory(root.AirCombatWvrEngine, root.AirCombatBvrEngine, root.GroundCloseCombatEngine, root.AswAttackEngine, root.AswSignatureSearchEngine, root.AswAirSearchEngine, root.TorpedoAttackEngine, root.ArmyResupplyEngine, root.GroundGuidedAttackEngine, root.AntiRadiationAttackEngine, root.CombatModifierEngine, root.StrategicActionsEngine, root.TableEngine, root.CombatWizardEngine, root.GroundAttackResultEngine, root.ShipImpactEffectsEngine, root.EwEscortEngine, root.GroundReactionEngine, root.SubmarineAmbushEngine, root.PortLogisticsEngine, root.LogisticsGuaranteeEngine, root.CyberAttackEngine, root.AirInterceptTargetsEngine);
})(typeof self !== 'undefined' ? self : this, function (AirCombatWvrEngine, AirCombatBvrEngine, GroundCloseCombatEngine, AswAttackEngine, AswSignatureSearchEngine, AswAirSearchEngine, TorpedoAttackEngine, ArmyResupplyEngine, GroundGuidedAttackEngine, AntiRadiationAttackEngine, CombatModifierEngine, StrategicActionsEngine, TableEngine, CombatWizardEngine, GroundAttackResultEngine, ShipImpactEffectsEngine, EwEscortEngine, GroundReactionEngine, SubmarineAmbushEngine, PortLogisticsEngine, LogisticsGuaranteeEngine, CyberAttackEngine, AirInterceptTargetsEngine) {
  'use strict';

  function calculatorForNode(calcData, nodeId) {
    // El cálculo principal de la pregunta (el primero declarado); los auxiliares (p. ej. la intensidad) van con `order`.
    const found = Object.entries((calcData && calcData.calculators) || {}).find(([, c]) => (c.nodes || []).includes(nodeId));
    return found ? { id: found[0], ...found[1] } : null;
  }
  // Una pregunta puede tener varios cálculos (p. ej. la tabla final y el contraataque a baja altura).
  function calculatorsForNode(calcData, nodeId) {
    return Object.entries((calcData && calcData.calculators) || {}).filter(([, c]) => (c.nodes || []).includes(nodeId)).map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  // Busca la primera clave `key` en un objeto anidado (p. ej. `roundRule` dentro del workflow del combate aéreo).
  function findKey(obj, key) {
    if (!obj || typeof obj !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    for (const v of Object.values(obj)) {
      const r = findKey(v, key);
      if (r) return r;
    }
    return null;
  }

  // Opciones de la pregunta de elección de un cálculo (`choices` en los datos): una lista del workflow, por clave
  // (`key` + `list`) o por la pregunta del workflow con ese id (`questionId`, sus `options`).
  function findById(obj, id) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.id === id && Array.isArray(obj.options)) return obj;
    for (const v of Object.values(obj)) {
      const r = findById(v, id);
      if (r) return r;
    }
    return null;
  }
  function resolveChoices(workflow, src) {
    if (!src) return [];
    if (Array.isArray(src.options)) return src.options;
    if (src.questionId) return (findById(workflow, src.questionId) || {}).options || [];
    // Una lista sin `value` (p. ej. methodRows) se identifica por su posición.
    return (((findKey(workflow, src.key) || {})[src.list]) || []).map((item, i) => (item.value === undefined ? { ...item, value: String(i) } : item));
  }

  // Pregunta del workflow de un campo (`questionId`, en la etapa `stage` si se indica: hay ids repetidos en varias etapas).
  function questionFor(workflow, def) {
    if (!workflow || !def.questionId) return null;
    const stage = def.stage ? (workflow.stages || []).find((st) => st.id === def.stage) : null;
    return findById(stage || workflow, def.questionId);
  }
  function fieldOptions(def, workflow, rules) {
    if (def.options) return def.options;
    if (def.optionsFromRules && rules) {
      const list = def.optionsFromRules.split('.').reduce((o, k) => (o ? o[k] : undefined), rules) || [];
      return list.map((x) => ({ value: x.value !== undefined ? x.value : x.id, label: x.label }));
    }
    const q = questionFor(workflow, def);
    return q ? q.options : null;
  }
  // Suma de los modificadores (`effects` de tipo modifier con ese `target`) de las respuestas elegidas.
  function fieldModifiers(calculator, workflow, values, target) {
    let total = 0;
    const lines = [];
    calculator.fields.filter((def) => def.modifier === target && def.kind === 'number' && fieldApplies(def, values) && !isEmpty(values[def.id])).forEach((def) => {
      const value = Number(values[def.id]) * (def.factor || 1);
      total += value;
      if (value) lines.push(`${def.shortLabel || def.label}: ${values[def.id]}${def.factor && def.factor !== 1 ? ` × ${def.factor}` : ''} (${value > 0 ? '+' : ''}${value})`);
    });
    calculator.fields.filter((def) => def.modifier === target && def.kind !== 'number' && fieldApplies(def, values)).forEach((def) => {
      const option = ((questionFor(workflow, def) || {}).options || fieldOptions(def, workflow) || []).find((o) => o.value === values[def.id]);
      if (!option) return;
      (option.effects || []).filter((e) => e.type === 'modifier' && e.target === target).forEach((e) => {
        total += e.value;
        if (e.value) lines.push(`${option.label} (${e.value > 0 ? '+' : ''}${e.value})`);
      });
    });
    return { total, lines };
  }
  const signed = (n) => (n > 0 ? `+${n}` : String(n));
  const isEmpty = (v) => v === '' || v === undefined || v === null;

  // Ronda WVR: por bando, misión → esquema de columnas, CA → columna, tirada + bonificación → fila (máx. 9).
  function computeWvrRound(table, groupTypes, inputs) {
    const bonus = inputs.shared && inputs.shared.roundBonus !== '' && inputs.shared.roundBonus !== undefined ? Number(inputs.shared.roundBonus) : 0;
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      const group = groupTypes.find((g) => g.value === v.groupType);
      if (!group || v.airCombatValue === '' || v.airCombatValue === undefined || v.roll === '' || v.roll === undefined) {
        sides[sideId] = { status: 'incomplete' };
        return;
      }
      try {
        const attack = AirCombatWvrEngine.resolveWvrAttack(table, TableEngine, { columnScheme: group.columnScheme, airCombatValue: v.airCombatValue, roll: v.roll, roundBonus: bonus });
        if (attack.noAttack) { sides[sideId] = { status: 'no-attack', explanation: [`CA ${attack.airCombatValue}: con 0 no ataca.`] }; return; }
        if (attack.noRow) { sides[sideId] = { status: 'no-row', explanation: [`La misión «${group.label}» no tiene fila en la tabla: el ataque queda pendiente (la fuente no la da).`] }; return; }
        const labels = TableEngine.pickAxisLabels(table.columnAxis, group.columnScheme);
        const columnIndex = TableEngine.matchAxisIndex(labels, Number(attack.airCombatValue)).index;
        if (attack.noColumn || columnIndex === -1) { sides[sideId] = { status: 'no-column', explanation: [`CA ${attack.airCombatValue} no cae en ninguna columna de la fila «${group.label}».`] }; return; }
        const rowIndex = table.rowAxis.values.indexOf(String(attack.rowValue));
        sides[sideId] = {
          status: 'ok',
          columnScheme: group.columnScheme,
          columnIndex,
          columnLabel: labels[columnIndex],
          rowIndex,
          rowValue: attack.rowValue,
          impacts: attack.impacts,
          rawCell: attack.cell.rawCell,
          explanation: [
            `Fila de la misión: ${group.label}.`,
            `Combate aéreo ${attack.airCombatValue} → columna ${labels[columnIndex]}.`,
            `Tirada ${attack.naturalRoll}${attack.roundBonus ? ` + ${attack.roundBonus} por rondas sin bajas` : ''} = ${attack.modifiedRoll}${attack.rollClamped ? ' (se lee en la fila 9)' : ''}.`,
            attack.rawCell === '.' ? 'Celda «·»: sin impactos.' : `Resultado: ${attack.impacts} punto(s) de impacto contra el otro bando.`
          ]
        };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides, bonus };
  }

  // Ataque BVR unidad contra unidad: por bando, condición → fila (esquema), CA → columna, tirada + modificador
  // electrónico (solo el bando con el Valor Electrónico más alto, en la diferencia) → fila de la tirada.
  function computeBvrAttack(table, conditions, inputs) {
    const sides = {};
    const entries = Object.entries(inputs.sides || {});
    const electronics = entries.map(([, v]) => v.electronic);
    let elec = { side: null, modifier: 0 };
    if (entries.length === 2 && electronics.every((e) => e !== '' && e !== undefined)) {
      const m = AirCombatBvrEngine.electronicModifier(entries[0][1].electronic, entries[1][1].electronic);
      elec = { side: m.side === null ? null : entries[m.side === 'A' ? 0 : 1][0], modifier: m.modifier };
    }
    entries.forEach(([sideId, v]) => {
      const cond = conditions.find((c) => c.value === v.condition);
      if (!cond || v.airCombatValue === '' || v.airCombatValue === undefined || v.roll === '' || v.roll === undefined) {
        sides[sideId] = { status: 'incomplete' };
        return;
      }
      try {
        const bonus = elec.side === sideId ? elec.modifier : 0;
        const attack = AirCombatBvrEngine.resolveBvrAttack(table, TableEngine, { columnScheme: cond.columnScheme, airCombatValue: Number(v.airCombatValue), roll: Number(v.roll), electronicBonus: bonus });
        if (attack.noColumn) {
          sides[sideId] = { status: 'no-column', explanation: [`Combate aéreo ${attack.airCombatValue}: ${attack.noColumnReason === 'above_table' ? 'por encima' : 'por debajo'} de las columnas de la fila «${cond.label}» (celda «·» o sin columna): no ataca en BVR.`] };
          return;
        }
        const labels = TableEngine.pickAxisLabels(table.columnAxis, cond.columnScheme || undefined);
        const columnIndex = TableEngine.matchAxisIndex(labels, Number(attack.airCombatValue)).index;
        const rowIndex = table.rowAxis.values.indexOf(String(attack.rowValue));
        sides[sideId] = {
          status: 'ok',
          columnScheme: cond.columnScheme || 'canonical',
          columnIndex,
          columnLabel: labels[columnIndex],
          rowIndex,
          rowValue: attack.rowValue,
          impacts: attack.impacts,
          rawCell: attack.cell.rawCell,
          explanation: [
            `Fila de la condición: ${cond.label}.`,
            `Combate aéreo ${attack.airCombatValue} → columna ${labels[columnIndex]}.`,
            `Tirada ${attack.naturalRoll}${bonus ? ` + ${bonus} por Valor Electrónico más alto` : ''} = ${attack.modifiedRoll}${attack.rollClamped ? ' (se lee en la fila 9)' : ''}.`,
            attack.cell.rawCell === '.' ? 'Celda «·»: sin impactos.' : `Resultado: ${attack.impacts} punto(s) de impacto contra el avión enemigo.`
          ]
        };
        if (!isEmpty(v.targetProtection) && attack.impacts > 0) {
          const d = AirCombatBvrEngine.resolveBvrDamage({ impacts: attack.impacts, protection: v.targetProtection, targetIsCaps: v.targetIsCaps === 'yes' });
          sides[sideId].explanation.push(`Daño: ${d.impacts} / Protección ${d.protection} = ${d.rawDamage} punto(s)${d.capsCapped ? '; un CAP solo absorbe 1' : ''}${d.exitsCombat ? ' y sale temporalmente de combate' : ''}: ${d.damage} punto(s) de daño.`);
        }
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides, electronic: elec };
  }

  // Combate cercano terrestre: por bando, papel (Activo/Pasivo) → fila, Ataque + Apoyo → columna, tirada → fila de
  // la tirada (página 2, tabla 1). Guerra electrónica: el bando con el Valor Electrónico más alto cruza la diferencia con
  // su tirada (tabla 2); con «x2» duplica sus impactos. `context.extra` trae la tabla de guerra electrónica.
  function computeGroundCloseCombat(table, roles, inputs, ewTable) {
    const sides = {};
    const entries = Object.entries(inputs.sides || {});
    let ew = null;
    const filled = (v) => v !== '' && v !== undefined;
    if (ewTable && entries.length === 2 && entries.every(([, v]) => filled(v.electronic))) {
      const [a, b] = entries;
      const diff = Math.abs(Number(a[1].electronic) - Number(b[1].electronic));
      const sideId = Number(a[1].electronic) === Number(b[1].electronic) ? null : (Number(a[1].electronic) > Number(b[1].electronic) ? a[0] : b[0]);
      ew = { sideId, difference: diff, cell: null };
      if (sideId && filled(inputs.sides[sideId].roll)) {
        try {
          ew.cell = GroundCloseCombatEngine.resolveElectronicWarfareAdvantage(ewTable, TableEngine, { roll: Number(inputs.sides[sideId].roll), electronicDifference: diff });
        } catch (err) { ew.error = err.message; }
      }
    }
    entries.forEach(([sideId, v]) => {
      const role = roles.find((r) => r.value === v.role);
      if (!role || !filled(v.attackTotal) || !filled(v.roll)) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const cell = GroundCloseCombatEngine.resolveCombatResult(table, TableEngine, { roll: Number(v.roll), attackValue: Number(v.attackTotal), isActive: role.columnScheme === 'activo' });
        const labels = TableEngine.pickAxisLabels(table.columnAxis, role.columnScheme);
        const base = cell.rawCell === '.' ? 0 : Number(cell.rawCell);
        const hasAdvantage = Boolean(ew && ew.sideId === sideId);
        const impacts = GroundCloseCombatEngine.applyElectronicWarfareAdvantage(base, ew && ew.cell, hasAdvantage);
        const lines = [
          `Fila: ${role.label}.`,
          `Ataque + Apoyo ${v.attackTotal} → columna ${labels[cell.columnIndex]}.`,
          `Tirada ${v.roll} → ${cell.rawCell === '.' ? 'celda «·», sin impactos' : `${base} punto(s) de impacto`}.`
        ];
        if (ew && ew.sideId === null) lines.push('Valores Electrónicos iguales: no hay guerra electrónica.');
        if (hasAdvantage && ew.cell) lines.push(ew.cell.rawCell === 'x2' ? `Guerra electrónica (diferencia ${ew.difference}, tirada ${v.roll}): ✔, impactos x2 = ${impacts}.` : `Guerra electrónica (diferencia ${ew.difference}, tirada ${v.roll}): «·», sin efecto.`);
        lines.push(`Resultado: ${impacts} punto(s) de impacto contra el otro bando.`);
        sides[sideId] = { status: 'ok', columnScheme: role.columnScheme, columnIndex: cell.columnIndex, columnLabel: labels[cell.columnIndex], rowIndex: cell.rowIndex, rowValue: Number(v.roll), impacts, rawCell: cell.rawCell, explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    const extraMarks = ew && ew.cell ? [{ tableId: 'ground-close-combat-electronic-warfare', sideId: ew.sideId, mark: { status: 'ok', columnScheme: 'canonical', columnIndex: ew.cell.columnIndex, rowIndex: ew.cell.rowIndex } }] : [];
    return { sides, electronicWarfare: ew, extraMarks };
  }

  // Ataques ASW (páginas 29 y 30): profundidad + Firma (+1 en movimiento) → fila de la cabecera (band_1-3), Valor de
  // Ataque → columna en esa fila, tirada → fila. Con submarino: torpedo de círculo o hexágono y «NO DISPARAR».
  // Bonificación a la Firma del objetivo por moverse: modificador «target_signature» de la pregunta target_moving del
  // workflow (+1); sin workflow, la aplica el motor.
  function signatureArgs(calculator, workflow, v, signature) {
    if (!workflow) return { signature, targetMoving: v.moving === 'yes' };
    return { signature: Number(signature) + fieldModifiers(calculator, workflow, v, 'target_signature').total, targetMoving: false };
  }

  function computeAsw(table, inputs, submarine, calculator, workflow) {
    const sides = {};
    const filled = (v) => v !== '' && v !== undefined;
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (!v.position || !filled(v.signature) || !v.moving || !filled(v.attack) || !filled(v.roll) || (submarine && !v.torpedoType)) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const args = { position: v.position, ...signatureArgs(calculator || { fields: [] }, workflow, v, Number(v.signature)), roll: Number(v.roll) };
        const r = submarine
          ? AswAttackEngine.resolveSubmarineAswAttack(table, TableEngine, { ...args, torpedoValue: Number(v.attack), torpedoType: v.torpedoType })
          : AswAttackEngine.resolveAswAttack(table, TableEngine, { ...args, aswAttackValue: Number(v.attack) });
        const lines = [`Firma ${r.band.effectiveSignature}${v.moving === 'yes' ? ' (con +1 por moverse)' : ''} en ${v.position.replace('_', '/')} → fila de cabecera ${r.band.bandIndex + 1} («${r.band.bandLabel}»).`];
        if (!r.cell) { sides[sideId] = { status: 'no-column', explanation: lines.concat(r.notes) }; return; }
        const labels = TableEngine.pickAxisLabels(table.columnAxis, r.band.columnScheme);
        lines.push(`Valor de Ataque ${v.attack} → columna ${labels[r.cell.columnIndex]}.`);
        lines.push(`Tirada ${v.roll} → celda «${r.cell.rawCell === 'NO_DISPARAR' ? 'NO DISPARAR' : r.cell.rawCell}».`);
        (r.notes || []).forEach((n) => lines.push(n));
        if (!r.noFire) lines.push(`Resultado: ${r.impacts} impacto(s).`);
        sides[sideId] = { status: 'ok', columnScheme: r.band.columnScheme, columnIndex: r.cell.columnIndex, columnLabel: labels[r.cell.columnIndex], rowIndex: r.cell.rowIndex, rowValue: Number(v.roll), impacts: r.impacts, rawCell: r.cell.rawCell, explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Un campo con `showIf` solo cuenta si se cumple su condición.
  function fieldApplies(def, values) {
    if (!def.showIf) return true;
    if ('notEquals' in def.showIf) return values[def.showIf.field] !== def.showIf.notEquals;
    if (Array.isArray(def.showIf.in)) return def.showIf.in.includes(values[def.showIf.field]);
    return values[def.showIf.field] === def.showIf.equals;
  }
  function missingFields(calculator, values) {
    return calculator.fields.filter((def) => !def.optional && fieldApplies(def, values) && (values[def.id] === '' || values[def.id] === undefined));
  }

  // Búsqueda por diferencia de firma (página 33): columna del buscador, fila donde está la Firma del objetivo y celda
  // de rango (evento + distancia), que se marca aparte en la misma tabla.
  function computeSignatureSearch(calculator, table, inputs, workflow) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const r = AswSignatureSearchEngine.resolveSignatureSearch(table, TableEngine, { searcherKind: v.searcherKind, searcherSignature: v.searcherSignature, frame: v.frame, depth: v.depth, trigger: v.trigger, distance: v.distance, ...(() => { const a = signatureArgs(calculator, workflow, v, v.targetSignature); return { targetSignature: a.signature, targetMoving: a.targetMoving }; })(), roll: Number(v.roll) });
        const columnIndex = table.columnAxis.values.indexOf(r.columnLabel);
        const searcher = v.searcherKind === 'submarine' ? `submarino con Firma ${v.searcherSignature}` : `superficie, marco ${v.frame}, ${v.depth.replace('P', 'P. ')}`;
        const rangeName = `${v.trigger === 'routine_movement' ? 'rutina, movimiento o emboscada' : 'después del ataque o antes de evadir'}, ${v.distance === 'hex' ? 'misma casilla' : 'casilla adyacente'}`;
        const lines = [`Columna del buscador: ${searcher}. Firma del objetivo ${r.effectiveSignature}${v.moving === 'yes' ? ' (con +1 por moverse)' : ''}.`];
        if (r.noRow) { sides[sideId] = { status: 'no-column', explanation: lines.concat(['Esa Firma no aparece en la columna del buscador: no hay detección posible.']) }; return; }
        lines.push(`Fila ${r.rowIndex + 1}; rango (${rangeName}): ${r.cell.rawCell === '.' ? 'sin detección posible' : `hace falta ${r.cell.rawCell}`}.`);
        lines.push(`Tirada ${v.roll}: ${r.success ? 'detectado' : 'no detectado'}.`);
        sides[sideId] = { status: 'ok', columnScheme: 'canonical', columnIndex, columnLabel: searcher, rowIndex: r.rowIndex, rowValue: r.rowIndex, success: r.success, extraCells: [{ columnIndex: r.cell.columnIndex, rowIndex: r.rowIndex }], explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Búsqueda aérea ASW (página 34): la tabla depende del evento; fila por Firma en la profundidad, columna por la suma.
  function computeAirSearch(calculator, tables, inputs, workflow) {
    const sides = {};
    let tableId = calculator.table.tableId;
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      tableId = v.trigger === 'post_attack' ? 'asw-air-search-post-attack' : 'asw-air-search-routine';
      const table = tables[tableId];
      try {
        const r = AswAirSearchEngine.resolveAirSearch(table, TableEngine, { depth: v.depth, ...signatureArgs(calculator, workflow, v, Number(v.signature)), totalAirValue: Number(v.airValue), roll: Number(v.roll) });
        const lines = [`Tabla: ${table.title || tableId}.`];
        if (!r.cell) { sides[sideId] = { status: 'no-column', explanation: lines.concat(r.notes) }; return; }
        lines.push(`Firma ${r.effectiveSignature} en ${v.depth} → fila «${r.cell.rowLabel}»; Valor aéreo ${v.airValue} → columna «${r.cell.columnLabel}».`);
        lines.push(`${r.cell.rawCell === '.' ? 'Celda «·»: sin detección posible' : `Hace falta ${r.cell.rawCell}`}. Tirada ${v.roll}: ${r.success ? 'detectado' : 'no detectado'}.`);
        sides[sideId] = { status: 'ok', columnScheme: 'canonical', columnIndex: r.cell.columnIndex, columnLabel: r.cell.columnLabel, rowIndex: r.cell.rowIndex, rowValue: r.cell.rowLabel, success: r.success, explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides, tableId };
  }

  // Torpedos contra superficie (página 27): fila de cabecera por el contexto ASW y el estado del submarino, columna por
  // el Valor de Ataque; velocidad ≤ 3 fija la tirada en 9; el asterisco puede pedir una segunda tirada.
  function computeTorpedo(calculator, table, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const columnScheme = TorpedoAttackEngine.selectColumnScheme({ aswContext: v.aswContext, attackerState: v.attackerState });
        const r = TorpedoAttackEngine.resolveTorpedoAttack(table, TableEngine, { columnScheme, torpedoValue: Number(v.attack), roll: Number(v.roll), allTargetsSpeedLe3: v.slowTargets === 'yes', torpedoType: v.torpedoType, followUpRoll: v.followUpRoll });
        const labels = TableEngine.pickAxisLabels(table.columnAxis, columnScheme);
        const lines = [
          `Fila de cabecera: ${columnScheme === 'exposed' ? 'atacante Expuesto' : columnScheme === 'hidden' ? 'atacante Oculto' : 'ninguna de las situaciones anteriores'}.`,
          `Valor de Ataque ${v.attack} → columna ${labels[r.cell.columnIndex]}.`,
          r.rollIgnored ? 'Todos los buques con velocidad 3 o menos: tirada fijada en 9.' : `Tirada ${v.roll} → celda «${r.cell.rawCell === 'NO_ATACO' ? 'NO ATACÓ' : r.cell.rawCell}».`
        ].concat(r.notes);
        if (r.needsFollowUpRoll) lines.push('Falta la segunda tirada para saber los impactos finales.');
        else lines.push(`Resultado: ${r.finalImpacts} impacto(s).`);
        sides[sideId] = { status: 'ok', columnScheme: columnScheme || 'canonical', columnIndex: r.cell.columnIndex, columnLabel: labels[r.cell.columnIndex], rowIndex: r.cell.rowIndex, rowValue: r.effectiveRoll, impacts: r.finalImpacts, rawCell: r.cell.rawCell, explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Reabastecimiento de campo (página 32): columna por Nivel de Iniciativa, fila por la tirada.
  function computeArmyResupply(calculator, table, inputs, rules) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const r = ArmyResupplyEngine.resolveArmyResupply(table, TableEngine, { initiativeLevel: v.level, roll: Number(v.roll), currentForce: v.currentForce, printedForceLimit: v.printedForceLimit, successCell: rules && rules.table && rules.table.successCell });
        const lines = [`Nivel ${r.level} → columna ${r.level}; tirada ${r.roll} → «${r.cell.rawCell}».`];
        if (r.success && r.cappedByLimit) lines.push('Éxito, pero la unidad ya está en su límite impreso: no aumenta.');
        else lines.push(r.success ? `Éxito: la fuerza pasa de ${r.currentForce} a ${r.newForce}.` : 'Sin éxito: la fuerza no aumenta.');
        lines.push('La unidad pasa a su lado «Movida».');
        sides[sideId] = { status: 'ok', columnScheme: 'canonical', columnIndex: r.cell.columnIndex, columnLabel: r.level, rowIndex: r.cell.rowIndex, rowValue: r.roll, success: r.success, explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Ataque terrestre guiado (página 5): método → fila de cabecera, Valor de Ataque desplazado por la Modificación de
  // Intensidad → columna, tirada leída como Móvil o Fijo → fila. `context.workflow` aporta valueCap y rollRowScheme.
  function computeGroundGuided(calculator, table, methods, inputs, workflow) {
    const sides = {};
    const fr = (workflow && workflow.finalResolution) || {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      const method = methods.find((m) => m.value === v.method);
      try {
        const r = GroundGuidedAttackEngine.resolveGroundGuidedAttack(table, TableEngine, { attackValue: Number(v.attack), columnScheme: method.columnScheme, targetFixed: v.target === 'fixed', intensityModifier: Math.min(0, Number(v.intensity) || 0), roll: Number(v.roll), valueCap: fr.valueCap, rollRowSchemes: fr.rollRowScheme });
        const lines = [`Fila de cabecera: ${method.label}.`];
        if (Number(v.intensity) > 0) lines.push('Modificación positiva: cuenta como 0.');
        if (r.noColumn) { sides[sideId] = { status: 'no-column', explanation: lines.concat([r.reason]) }; return; }
        lines.push(`Valor de Ataque ${v.attack}${Number(v.attack) > fr.valueCap ? ` (se cuenta como ${fr.valueCap})` : ''}, desplazado ${r.appliedModifier} columna(s) → columna «${r.cell.columnLabel}».`);
        lines.push(`Tirada ${v.roll}${r.cancelledByNine ? ' (un 9 cancela la Modificación de Intensidad)' : ''}, objetivo ${v.target === 'fixed' ? 'Fijo' : 'Móvil'} → fila «${r.cell.rowLabel}».`);
        lines.push(`Resultado: ${r.impacts} impacto(s).`);
        sides[sideId] = { status: 'ok', columnScheme: method.columnScheme || 'canonical', columnIndex: r.cell.columnIndex, columnLabel: r.cell.columnLabel, rowIndex: r.cell.rowIndex, rowValue: r.cell.rowLabel, impacts: r.impacts, rawCell: r.cell.rawCell, explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Suma de los desplazamientos de columna («-5 columnas») de los efectos ya aplicados por el árbol.
  function columnShiftFromEffects(effects) {
    return (effects || []).reduce((sum, e) => {
      const m = /([+-]\d+)\s*columnas?/.exec(e.text || e);
      return m ? sum + Number(m[1]) : sum;
    }, 0);
  }

  // Ataque antirradiación (página 13): fila [L] Ligero o Normal, desplazamiento de columnas, 9 natural lo cancela.
  function computeAntiRadiation(calculator, table, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const r = AntiRadiationAttackEngine.resolveAntiRadiationAttack(table, TableEngine, { attackValue: Number(v.attack), lightPlan: v.light === 'yes', intensityModifier: Math.min(0, Number(v.intensity) || 0), roll: Number(v.roll) });
        const lines = [`Fila de cabecera: ${v.light === 'yes' ? '[L] Ligero' : 'Normal'}.`];
        if (r.noColumn) { sides[sideId] = { status: 'no-column', explanation: lines.concat([r.reason]) }; return; }
        lines.push(`Valor de Ataque ${v.attack}${Number(v.attack) > AntiRadiationAttackEngine.VALUE_CAP ? ` (se cuenta como ${AntiRadiationAttackEngine.VALUE_CAP})` : ''}, desplazado ${r.appliedModifier} columna(s) → columna «${r.cell.columnLabel}».`);
        lines.push(`Tirada ${v.roll}${r.cancelledByNine ? ' (un 9 cancela el desplazamiento)' : ''} → celda «${r.cell.rawCell}».`);
        lines.push(`Resultado: ${r.impacts} impacto(s).`);
        sides[sideId] = { status: 'ok', columnScheme: r.columnScheme || 'canonical', columnIndex: r.cell.columnIndex, columnLabel: r.cell.columnLabel, rowIndex: r.cell.rowIndex, rowValue: Number(v.roll), impacts: r.impacts, rawCell: r.cell.rawCell, explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Antibuque guiado, tabla final (página 22): Valor tras defensas × multiplicador del V.E.F. → columna; el método elige
  // la lectura de la tirada (SUB/SUP o PAR/E.C.) y el subsónico se queda con la mayor de dos tiradas.
  function computeAntishipGuidedFinal(calculator, table, inputs) {
    const sides = {};
    const methods = calculator.fields.find((f) => f.id === 'method').options;
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      const method = methods.find((m) => m.value === v.method);
      try {
        const roll = method.dice === 'max2' ? Math.max(Number(v.roll), Number(v.roll2)) : Number(v.roll);
        const finalValue = Number(v.attack) * Number(v.multiplier);
        const cell = TableEngine.resolveCell(table, roll, finalValue, { rowScheme: method.rowScheme });
        const impacts = cell.rawCell === '.' ? 0 : Number(cell.rawCell);
        sides[sideId] = {
          status: 'ok', columnScheme: 'canonical', columnIndex: cell.columnIndex, columnLabel: cell.columnLabel, rowIndex: cell.rowIndex, rowValue: roll, impacts, rawCell: cell.rawCell,
          explanation: [
            `Valor de Ataque Final: ${v.attack} × ${v.multiplier} = ${finalValue} → columna «${cell.columnLabel}».`,
            `Tirada ${method.dice === 'max2' ? `${v.roll} y ${v.roll2}, la mayor: ${roll}` : roll}, lectura ${method.rowScheme === 'sub_sup' ? 'SUB/SUP' : 'PAR/E.C.'} → fila «${cell.rowLabel}».`,
            `Resultado: ${impacts} impacto(s).`
          ]
        };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Antibuque no guiado (página 25): fila [L] o inferior, desplazamiento de columnas por la distancia, 9 lo cancela.
  function computeAntishipUnguided(calculator, table, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const scheme = v.light === 'yes' ? 'L' : undefined;
        const labels = TableEngine.pickAxisLabels(table.columnAxis, scheme);
        const natural = Number(v.roll);
        const modifier = natural === 9 ? 0 : Math.min(0, Number(v.intensity) || 0);
        const col = CombatModifierEngine.resolveAttackValueColumnShift(TableEngine, { rawAttackValue: Number(v.attack), modifierTotal: modifier, valueCap: Infinity, columnLabels: labels });
        const rowLabels = table.rowAxis.values.map((x) => String(x).replace('*', ''));
        const rowIndex = rowLabels.indexOf(String(natural));
        const rawCell = table.cells[rowIndex][col.columnIndex];
        const impacts = rawCell === '.' ? 0 : Number(rawCell);
        sides[sideId] = {
          status: 'ok', columnScheme: scheme || 'canonical', columnIndex: col.columnIndex, columnLabel: labels[col.columnIndex], rowIndex, rowValue: natural, impacts, rawCell,
          explanation: [
            `Fila de cabecera: ${scheme ? '[L]' : 'inferior'}.`,
            `Valor de Ataque ${v.attack}, desplazado ${modifier} columna(s)${natural === 9 && Number(v.intensity) < 0 ? ' (un 9 cancela la Modificación)' : ''} → columna «${labels[col.columnIndex]}».`,
            `Tirada ${natural} → celda «${rawCell}».`,
            `Resultado: ${impacts} impacto(s).`
          ]
        };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Acciones estratégicas (página 32): varias tiradas en una columna fija; cada una se marca en su fila.
  function computeStrategicRolls(calculator, table, inputs) {
    const sides = {};
    const columnIndex = StrategicActionsEngine.COLUMNS[calculator.column];
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      const rolls = StrategicActionsEngine.parseRolls(v.rolls);
      if (!rolls || !rolls.length) { sides[sideId] = { status: 'error', explanation: ['Escribe las tiradas como cifras de 0 a 9 separadas por espacios.'] }; return; }
      const tally = StrategicActionsEngine.tallyRolls(table, calculator.column, rolls);
      const label = table.columnAxis.values[columnIndex];
      const cells = rolls.map((r) => ({ columnIndex, rowIndex: Math.min(r, 9) }));
      const lines = [`Columna: ${label}.`, `Tiradas ${rolls.join(', ')} → ${rolls.map((r) => { const c = StrategicActionsEngine.cell(table, calculator.column, r); return c === '.' ? 'sin efecto' : c; }).join(', ')}.`, `Éxitos: ${tally.successes}; fallos: ${tally.failures}; sin efecto: ${tally.none}.`];
      if (calculator.column === 'cyber') lines.push(tally.successes > tally.failures ? 'Más ataques efectivos que inefectivos: la acción cibernética tiene éxito.' : 'No hay más efectivos que inefectivos: la acción cibernética falla.');
      sides[sideId] = { status: 'ok', columnScheme: 'canonical', columnIndex, columnLabel: label, rowIndex: cells[0].rowIndex, rowValue: rolls[0], extraCells: cells.slice(1), explanation: lines };
    });
    return { sides };
  }

  // Defensa aérea de área contra la munición (páginas 3, 11 y 19): A.A. agrupado → columna; tirada (la menor de dos con
  // trayectoria de espacio cercano) + modificadores → fila; la celda es la reducción del Valor de Ataque.
  function computeAreaReduction(calculator, table, inputs, workflow) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const mod = fieldModifiers(calculator, workflow, v, 'area_air_defense_roll');
        const roll2 = fieldApplies(calculator.fields.find((d) => d.id === 'roll2') || {}, v) && !isEmpty(v.roll2) ? Number(v.roll2) : undefined;
        const r = CombatWizardEngine.resolveAreaAirDefenseAttackReduction(table, TableEngine, { roll: Number(v.roll), roll2, modifierTotal: mod.total, groupedAaValue: Number(v.aa) });
        const raw = r.result.rawCell;
        const value = Number(raw);
        const lines = [`Valor de Defensa Aérea agrupado ${v.aa} → columna «${r.result.columnLabel}».`];
        if (mod.lines.length) lines.push(`Modificadores de la tirada: ${mod.lines.join(', ')} = ${signed(mod.total)}.`);
        lines.push(`Tirada ${roll2 !== undefined ? `${v.roll} y ${v.roll2}, la menor: ${r.baseRoll}` : r.baseRoll}${mod.total ? ` ${signed(mod.total)} = ${r.modifiedRoll}` : ''} → fila «${r.result.rowLabel}».`);
        lines.push(raw === 'NO_DISPARAR' ? 'Resultado: NO DISPARAR (el sistema no puede disparar).' : `Resultado: ${Number.isNaN(value) ? 'sin reducción' : `el Valor de Ataque se reduce en ${-value}`}.`);
        sides[sideId] = { status: 'ok', columnScheme: 'canonical', columnIndex: r.result.columnIndex, columnLabel: r.result.columnLabel, rowIndex: r.result.rowIndex, rowValue: r.modifiedRoll, rawCell: raw, reduction: Number.isNaN(value) ? 0 : value, explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Interceptación de munición (páginas 4, 12 y 20; no guiado: 8 y 24): cada interceptor dispara por separado. Columna:
  // su A.A. propio (fila «Alto» o «Bajo» de la cabecera según su consumo); fila: tirada + modificadores. Contra un ataque
  // balístico tira 2d10, se queda con la menor y solo con consumo Bajo. Se suman las reducciones.
  function computeMunitionInterception(calculator, table, inputs, workflow, sideDefs) {
    const sides = {};
    let total = 0;
    let any = false;
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      const def = (sideDefs || []).find((d) => d.id === sideId) || {};
      if (def.optional && calculator.fields.every((d) => isEmpty(v[d.id]) || d.default !== undefined)) { sides[sideId] = { status: 'unused', explanation: ['Sin este interceptor.'] }; return; }
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      const ballistic = v.ballistic === 'yes';
      const consumption = ballistic ? 'low' : v.consumption;
      const mod = fieldModifiers(calculator, workflow, v, 'munition_interception_roll');
      let aa = Number(v.aa);
      const lines = [];
      if (calculator.columnCap && consumption !== 'low' && aa > calculator.columnCap) {
        lines.push(`A.A. ${aa}: la última columna impresa es «${calculator.columnCap}+», se lee en ella.`);
        aa = calculator.columnCap;
      }
      try {
        const args = { roll: Number(v.roll), modifierTotal: mod.total, defenderAaValue: aa, earlyWarning: v.earlyWarning === 'yes', consumption };
        const shot = ballistic
          ? CombatWizardEngine.resolveBallisticMunitionInterceptionShot(table, TableEngine, { ...args, roll2: Number(v.roll2) })
          : CombatWizardEngine.resolveInterceptionShot(table, TableEngine, args);
        if (shot.horizonCap && shot.horizonCap.capped) lines.push(`Sin alerta temprana, el A.A. ${shot.horizonCap.originalValue} no puede usar las columnas de «Más allá del horizonte»: se lee en la columna ${shot.horizonCap.effectiveValue}.`);
        if (shot.notEligible || shot.noEffect) {
          sides[sideId] = { status: 'no-effect', explanation: lines.concat([shot.reason]) };
          return;
        }
        const raw = shot.result.rawCell;
        const value = Number(raw);
        lines.unshift(`Consumo ${consumption === 'low' ? 'Bajo' : 'Alto'}${ballistic ? ' (ataque balístico: solo Bajo)' : ''}, A.A. propio ${v.aa} → columna «${shot.result.columnLabel}».`);
        if (mod.lines.length) lines.push(`Modificadores de la tirada: ${mod.lines.join(', ')} = ${signed(mod.total)}.`);
        lines.push(`Tirada ${ballistic ? `${v.roll} y ${v.roll2}, la menor: ${shot.naturalRoll}` : v.roll}${mod.total ? ` ${signed(mod.total)} = ${shot.modifiedRoll}` : ''} → fila «${shot.result.rowLabel}».`);
        lines.push(raw === 'NO_DISPARAR' ? 'Resultado: NO DISPARAR (no puede interceptar).' : `Resultado: ${Number.isNaN(value) ? 'sin reducción' : `reduce el Valor de Ataque en ${-value}`}.`);
        const reduction = Number.isNaN(value) ? 0 : value;
        total += reduction;
        any = true;
        sides[sideId] = { status: 'ok', columnScheme: consumption === 'low' ? 'low' : 'canonical', columnIndex: shot.result.columnIndex, columnLabel: shot.result.columnLabel, rowIndex: shot.result.rowIndex, rowValue: shot.modifiedRoll, rawCell: raw, reduction, explanation: lines };
      } catch (err) {
        if (err && err.code === 'row_out_of_range') {
          const m = Number(v.roll) + mod.total;
          sides[sideId] = { status: 'no-effect', explanation: lines.concat([`Tirada modificada ${m}: queda por debajo de la primera fila de la tabla (0, NO DISPARAR); no reduce el Valor de Ataque.`]) };
          return;
        }
        sides[sideId] = { status: 'error', explanation: lines.concat([err.message]) };
      }
    });
    return { sides, summary: any ? [`Reducción total del Valor de Ataque por la interceptación: ${total}.`] : [] };
  }

  // Interceptación final (páginas 7 y 23): una sola tirada; se cruza con el A.A. total de consumo Bajo (fila «Bajo» de la
  // cabecera) y, por separado, con el de consumo Alto (fila «Alto»), y se suman los impactos (Decision Book §6.4.2).
  function computeFinalInterception(calculator, table, inputs) {
    const sides = {};
    const roll = inputs.shared ? inputs.shared.roll : '';
    let total = 0;
    let any = false;
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (isEmpty(v.aa) || Number(v.aa) <= 0) { sides[sideId] = { status: 'unused', explanation: ['Sin unidades de este consumo.'] }; return; }
      const scheme = sideId === 'high' ? 'high' : undefined;
      try {
        const probe = TableEngine.resolveCell(table, isEmpty(roll) ? 0 : Number(roll), Number(v.aa), scheme ? { columnScheme: scheme } : undefined);
        const lines = [`A.A. total de consumo ${scheme ? 'Alto' : 'Bajo'} ${v.aa} → columna «${probe.columnLabel}» de la fila «${scheme ? 'Alto' : 'Bajo'}».`];
        if (isEmpty(roll)) {
          sides[sideId] = { status: 'column', columnScheme: scheme || 'canonical', columnIndex: probe.columnIndex, columnLabel: probe.columnLabel, explanation: lines.concat(['Falta la tirada: al indicarla se marcarán la fila y la celda del resultado.']) };
          return;
        }
        const impacts = probe.rawCell === '.' ? 0 : Number(probe.rawCell);
        total += impacts;
        any = true;
        lines.push(`Tirada ${roll} → celda «${probe.rawCell}».`, `Resultado: ${impacts} impacto(s).`);
        sides[sideId] = { status: 'ok', columnScheme: scheme || 'canonical', columnIndex: probe.columnIndex, columnLabel: probe.columnLabel, rowIndex: probe.rowIndex, rowValue: Number(roll), rawCell: probe.rawCell, impacts, explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides, pending: !any, summary: any ? [`Impactos de la interceptación final: ${total} (se suman los de los dos consumos).`] : [] };
  }

  // Resistencia electrónica de la flota (página 21): V.E.F. = Valor Electrónico más alto + modificadores → fila de la
  // tabla «Mod.» (modificador de la tirada); tirada + modificador → fila de la tabla de multiplicador.
  function computeVefMultiplier(calculator, table, inputs, workflow, extra) {
    const sides = {};
    const extraMarks = [];
    const multTable = extra[calculator.extraTables[0].tableId];
    let pending = true;
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      const missing = missingFields(calculator, v).map((d) => d.id);
      if (missing.some((id) => id !== 'roll')) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const mod = fieldModifiers(calculator, workflow, v, 'vef_modifier');
        const rawVef = Number(v.electronic) + mod.total;
        const vef = CombatWizardEngine.resolveVefRollModifier(table, TableEngine, rawVef);
        if (vef.rollModifier === undefined) throw new Error(`La celda «${vef.modResult.rawCell}» no es un modificador reconocible.`);
        const lines = [`V.E.F.: Valor Electrónico más alto ${v.electronic}${mod.lines.length ? `, ${mod.lines.join(', ')}` : ''} = ${rawVef} → fila «${vef.modResult.rowLabel}»: modificador de la tirada ${signed(vef.rollModifier)}${vef.parsedModifier.kind === 'self' ? ' (menos el V.E.F.)' : ''}.`];
        const side = { status: 'ok', columnScheme: 'canonical', columnIndex: 0, columnLabel: 'V.E.F.', rowIndex: vef.modResult.rowIndex, rowValue: rawVef, explanation: lines };
        if (missing.length) {
          lines.push('Falta la tirada: al indicarla se marcará el multiplicador.');
        } else {
          const modified = Number(v.roll) + vef.rollModifier;
          const m = CombatWizardEngine.resolveAttackMultiplier(multTable, TableEngine, modified);
          lines.push(`Tirada ${v.roll} ${signed(vef.rollModifier)} = ${modified} → fila «${m.multiplierResult.rowLabel}» de «Mod. al Ataque».`, `Resultado: multiplicador x${m.multiplier}.`);
          side.multiplier = m.multiplier;
          extraMarks.push({ tableId: multTable.id, sideId, mark: { status: 'ok', columnScheme: 'canonical', columnIndex: 0, rowIndex: m.multiplierResult.rowIndex } });
          pending = false;
        }
        sides[sideId] = side;
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides, extraMarks, pending };
  }

  // Defensa aérea de área contra aviones (página 18): disparo concentrado; columna por el Valor de Combate Aéreo agrupado
  // en la fila de su consumo, fila por la tirada; la celda son los puntos de daño.
  function computeAreaShot(calculator, table, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const cell = CombatWizardEngine.resolveAreaAirDefenseShot(table, TableEngine, { roll: Number(v.roll), aaValue: Number(v.aa), consumption: v.consumption });
        const points = cell.rawCell === '.' ? 0 : Number(cell.rawCell);
        sides[sideId] = {
          status: 'ok', columnScheme: v.consumption === 'low' ? 'low' : 'canonical', columnIndex: cell.columnIndex, columnLabel: cell.columnLabel, rowIndex: cell.rowIndex, rowValue: Number(v.roll), rawCell: cell.rawCell, impacts: points,
          explanation: [`Consumo ${v.consumption === 'low' ? 'Bajo' : 'Alto'}, Valor de Combate Aéreo agrupado ${v.aa} → columna «${cell.columnLabel}».`, `Tirada ${v.roll} → celda «${cell.rawCell}».`, `Resultado: ${points} punto(s) de daño.`]
        };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Lados opcionales (varios disparos o unidades): sin ningún dato propio no cuentan.
  function unusedSide(calculator, sideDefs, sideId, v, label) {
    const def = (sideDefs || []).find((d) => d.id === sideId) || {};
    if (def.optional && calculator.fields.every((d) => isEmpty(v[d.id]) || d.default !== undefined)) return { status: 'unused', explanation: [label || 'Sin datos.'] };
    return null;
  }

  // Contraataque a baja altura (páginas 6, 10, 14, 22 y 26): el defensor fija su valor una vez; cada unidad de baja altura
  // atacante recibe su tirada; si los impactos alcanzan su Protección, queda destruida.
  function computeLowAltitude(calculator, table, inputs, sideDefs) {
    const sides = {};
    const shared = inputs.shared || {};
    const scheme = shared.defenderKind && shared.defenderKind !== 'canonical' ? shared.defenderKind : undefined;
    const kindLabel = ((calculator.sharedFields || []).find((d) => d.id === 'defenderKind') || { options: [] }).options.find((o) => o.value === shared.defenderKind);
    let destroyed = 0;
    let any = false;
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      const unused = unusedSide(calculator, sideDefs, sideId, v, 'Sin esta unidad.');
      if (unused) { sides[sideId] = unused; return; }
      if (isEmpty(shared.defender) || (kindLabel === undefined && (calculator.sharedFields || []).some((d) => d.id === 'defenderKind'))) { sides[sideId] = { status: 'incomplete' }; return; }
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const cell = TableEngine.resolveCell(table, Number(v.roll), Number(shared.defender), scheme ? { columnScheme: scheme } : undefined);
        const impacts = Number.isNaN(Number(cell.rawCell)) ? 0 : Number(cell.rawCell);
        const kill = impacts >= Number(v.protection);
        any = true;
        if (kill) destroyed += 1;
        sides[sideId] = {
          status: 'ok', columnScheme: scheme || 'canonical', columnIndex: cell.columnIndex, columnLabel: cell.columnLabel, rowIndex: cell.rowIndex, rowValue: Number(v.roll), rawCell: cell.rawCell, impacts,
          explanation: [`${calculator.defenderLabel || 'Valor del defensor'} ${shared.defender}${kindLabel ? ` (${kindLabel.label})` : ''} → columna «${cell.columnLabel}».`, `Tirada ${v.roll} → celda «${cell.rawCell}».`, `Resultado: ${impacts} impacto(s) contra Protección ${v.protection}: ${kill ? 'la unidad queda destruida' : 'sin efecto'}.`]
        };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides, summary: any ? [`Unidades de baja altura destruidas: ${destroyed}.`] : [] };
  }

  // Combate naval cercano con artillería (página 25): Valor de Artillería sumado → columna; la tirada se lee en la columna
  // izquierda de tiradas (fila «Artillería Naval» de la cabecera).
  function computeNavalArtillery(calculator, table, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const cell = TableEngine.resolveCell(table, Number(v.roll), Number(v.artillery), { rowScheme: 'artillery' });
        const impacts = cell.rawCell === '.' ? 0 : Number(cell.rawCell);
        sides[sideId] = {
          status: 'ok', columnScheme: 'canonical', columnIndex: cell.columnIndex, columnLabel: cell.columnLabel, rowIndex: cell.rowIndex, rowValue: Number(v.roll), rawCell: cell.rawCell, impacts,
          explanation: [`Valor de Artillería Naval de la flota atacante ${v.artillery} → columna «${cell.columnLabel}».`, `Tirada ${v.roll} → fila «${cell.rowLabel}» de la columna izquierda (Artillería Naval), celda «${cell.rawCell}».`, `Resultado: ${impacts} impacto(s), que el atacante reparte entre las unidades de la flota enemiga.`]
        };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Resultado del ataque terrestre sobre una unidad terrestre (§5.15.1, sin tabla).
  function computeGroundUnitHit(calculator, rules, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const kind = rules.groundUnit.attackKinds.find((k) => k.id === v.kind);
        const r = GroundAttackResultEngine.resolveGroundUnitHit({ impacts: v.impacts, protection: v.protection, terrain: v.terrain, kind: v.kind, terrainApplies: kind.terrainApplies });
        const lines = [`${kind.label}.`];
        if (v.kind === 'air_pursuit') lines.push(`${r.impacts} impacto(s) / Protección ${r.protection} = ${r.damage} punto(s) de daño (sin límite).`);
        else lines.push(`Protección ${r.protection}${kind.terrainApplies ? ` + Terreno ${r.terrain}` : ''} = ${r.effectiveProtection}; impactos ${r.impacts}: ${r.damage ? '1 punto de daño (máximo 1 por ataque)' : 'sin daño'}.`);
        lines.push(`Resultado: la unidad pierde ${r.forceLoss} punto(s) de tamaño de fuerza.`);
        sides[sideId] = { status: 'ok', explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Ataque a un puerto y a los buques que hay dentro (§5.15.2).
  function computePortAttack(calculator, inputs, sideDefs) {
    const sides = {};
    const shared = inputs.shared || {};
    const shipIds = Object.keys(inputs.sides || {}).filter((id) => !unusedSide(calculator, sideDefs, id, inputs.sides[id]));
    Object.keys(inputs.sides || {}).forEach((id) => { if (!shipIds.includes(id)) sides[id] = { status: 'unused', explanation: ['Sin este buque.'] }; });
    if (isEmpty(shared.totalImpacts) || shipIds.some((id) => missingFields(calculator, inputs.sides[id]).length)) {
      shipIds.forEach((id) => { sides[id] = { status: 'incomplete' }; });
      return { sides, pending: true };
    }
    try {
      const r = GroundAttackResultEngine.resolvePortAttack({ totalImpacts: shared.totalImpacts, portImpacts: isEmpty(shared.portImpacts) ? 0 : shared.portImpacts, portProtection: shared.portProtection, ships: shipIds.map((id) => ({ type: inputs.sides[id].type, impacts: inputs.sides[id].impacts })) });
      shipIds.forEach((id, i) => {
        const sh = r.ships[i];
        sides[id] = { status: 'ok', explanation: [sh.type === 'surface' ? `Buque de superficie: ${sh.impacts} impacto(s) = ${sh.damagePoints} punto(s) de daño.` : `Submarino: ${sh.impacts ? 'con 1 impacto queda destruido' : 'sin impactos'}.`] };
      });
      const summary = [`Impactos asignados: ${r.assigned} de ${r.totalImpacts}${r.unassigned ? ` (${r.unassigned} sin asignar)` : ''}.`];
      if (r.portProtection) summary.push(`Puerto: impactos / Protección ${r.portProtection} = ${r.paralyzed} instalación(es) paralizada(s) y otras tantas de munición/combustible perdidas.`);
      return { sides, summary };
    } catch (err) {
      return { sides, summary: [err.message], pending: true };
    }
  }

  // Aeródromo (§5.15.3): pista por letra, áreas de estacionamiento (apron) y, como regla opcional, logística.
  function computeAirfield(calculator, rules, inputs, sideDefs) {
    const sides = {};
    const shared = inputs.shared || {};
    if (calculator.part === 'runway' || calculator.part === 'logistics') {
      Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
        if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
        try {
          if (calculator.part === 'runway') {
            const r = GroundAttackResultEngine.resolveRunwayByLetter({ impacts: v.impacts, letter: v.letter, letters: rules.airfield.runwayQuality.letters });
            sides[sideId] = { status: 'ok', explanation: [`Pista ${r.letterBefore}, ${r.impacts} impacto(s): baja ${r.levelsLost} nivel(es) (1 por cada 2 impactos; no baja de E).`, `Resultado: pista ${r.letterAfter}${r.ignored ? `; ${r.ignored} impacto(s) sin efecto` : ''}.`] };
          } else {
            const r = GroundAttackResultEngine.resolveLogistics({ impacts: v.impacts, readiness: v.readiness });
            sides[sideId] = { status: 'ok', explanation: [`${r.impacts} impacto(s): el Valor de Preparación baja ${r.readinessLost} (1 por cada 2 impactos).`, `Resultado: Preparación ${r.readinessAfter}${r.ignored ? `; ${r.ignored} impacto(s) sin efecto` : ''}.`] };
          }
        } catch (err) {
          sides[sideId] = { status: 'error', explanation: [err.message] };
        }
      });
      return { sides };
    }
    // Apron: las unidades en el orden en que el defensor las elige.
    const ids = Object.keys(inputs.sides || {}).filter((id) => !unusedSide(calculator, sideDefs, id, inputs.sides[id]));
    Object.keys(inputs.sides || {}).forEach((id) => { if (!ids.includes(id)) sides[id] = { status: 'unused', explanation: ['Sin esta unidad.'] }; });
    if (['impacts', 'airfieldProtection', 'hangarCapacity'].some((k) => isEmpty(shared[k])) || !ids.length || ids.some((id) => missingFields(calculator, inputs.sides[id]).length)) {
      ids.forEach((id) => { sides[id] = { status: 'incomplete' }; });
      return { sides, pending: true };
    }
    try {
      const r = GroundAttackResultEngine.resolveApron({ impacts: shared.impacts, airfieldProtection: shared.airfieldProtection, hangarCapacity: shared.hangarCapacity, units: ids.map((id) => ({ name: id, usesAirfieldProtection: inputs.sides[id].shelter === 'yes', cannotSurviveDamage: inputs.sides[id].fragile === 'yes' })) });
      ids.forEach((id, i) => {
        const u = r.units[i];
        sides[id] = { status: 'ok', explanation: [`Protección efectiva ${u.protection}.`, u.damaged ? `Recibe ${u.absorbed} impacto(s): 1 punto de daño; ${u.eliminated ? 'queda eliminada' : 'se da la vuelta (dañada)'}.` : 'Los impactos restantes no alcanzan su Protección: sin efecto.'] };
      });
      return { sides, summary: [`${r.impacts} impacto(s) en el apron${r.ignored ? `; ${r.ignored} sin efecto` : ''}.`] };
    } catch (err) {
      return { sides, summary: [err.message], pending: true };
    }
  }

  // Efecto de un punto de daño sobre una unidad de superficie (Decision Book, ver data/rules/ship-impact-effects.json).
  function computeShipImpact(calculator, rules, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const yes = (k) => v[k] === 'yes';
        const r = ShipImpactEffectsEngine.resolveShipImpactEffect({ hullType: calculator.hullType, fleetSize: v.fleetSize, hasDamagedSide: calculator.hullType === 'multi' ? true : yes('hasDamagedSide'), alreadyDamaged: yes('alreadyDamaged'), isAmphibiousAssault: yes('amphibious'), hasShield: yes('hasShield'), sinkingResistance: v.sinkingResistance, criticalRoll: v.criticalRoll, isCarrier: yes('carrier'), isTransport: yes('transport') });
        const lines = r.ruleIds.map((id) => (rules.rules.find((x) => x.id === id) || { text: id }).text);
        if (r.needsCriticalRoll) { lines.push('Falta la tirada de daño crítico y el Valor de Resistencia al Hundimiento.'); sides[sideId] = { status: 'incomplete', explanation: lines }; return; }
        const outcome = (rules.outcomes.find((o) => o.id === r.outcome) || { label: r.outcome }).label;
        if (r.criticalResult) lines.push(`Daño crítico: tirada ${r.criticalRoll} ${r.criticalResult === 'sunk' ? '≤' : '>'} Resistencia ${v.sinkingResistance}.`);
        lines.push(`Resultado: ${outcome}${r.newFleetSize !== undefined ? ` (quedan ${r.newFleetSize} buques)` : ''}.`);
        sides[sideId] = { status: 'ok', explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Absorción de los impactos recibidos en una ronda WVR (§7.16.4): el bando que recibe elige el daño de cada unidad;
  // cada punto consume su Protección y hay que absorber mientras el resto alcance la Protección de alguna unidad.
  function parseList(text) {
    const parts = String(text || '').trim().split(/[\s,;]+/).filter(Boolean);
    return parts.length && parts.every((p) => /^\d+$/.test(p)) ? parts.map(Number) : null;
  }
  function computeWvrAbsorption(calculator, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      const prot = parseList(v.protections);
      const dmg = isEmpty(v.damage) ? prot && prot.map(() => 0) : parseList(v.damage);
      if (!prot || !dmg || dmg.length !== prot.length) { sides[sideId] = { status: 'error', explanation: ['Escribe la Protección de cada unidad y, en el mismo orden, el daño que recibe cada una (cifras separadas por espacios).'] }; return; }
      try {
        const units = prot.map((p, i) => ({ id: `u${i + 1}`, name: `unidad ${i + 1}`, protection: p }));
        const r = AirCombatWvrEngine.applyAbsorption({ impacts: v.impacts, units, damageByUnit: Object.fromEntries(units.map((u, i) => [u.id, dmg[i]])) });
        const lines = [`Impactos recibidos: ${r.impacts}. Daño asignado: ${dmg.map((d, i) => `unidad ${i + 1} (Protección ${prot[i]}): ${d}`).join(', ')} → consume ${r.consumed}.`];
        if (r.overAllocated) lines.push(`Resultado: hay más daño asignado del que permiten los impactos (faltan ${-r.remaining}).`);
        else if (r.mustAbsorbMore) lines.push(`Resultado: quedan ${r.remaining} impacto(s), que todavía alcanzan la Protección ${r.minProtection} de una unidad: hay que asignar más daño.`);
        else lines.push(`Resultado: reparto válido; ${r.remaining} impacto(s) sobrantes se ignoran.`);
        sides[sideId] = { status: r.overAllocated || r.mustAbsorbMore ? 'error' : 'ok', explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Escolta electrónica (§7.10.4): el avión EW absorbe primero los impactos de la defensa aérea.
  function computeEwEscort(calculator, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const r = EwEscortEngine.resolveEwEscortAbsorption({ impacts: v.impacts, ewProtection: v.ewProtection, otherProtection: v.otherProtection });
        const lines = [];
        if (r.noEffect) lines.push(`${r.impacts} impacto(s) no alcanzan la Protección ${r.ewProtection} del avión EW: sin efecto.`);
        else {
          lines.push(`El avión EW absorbe ${r.ewAbsorbed} impacto(s): 1 punto de daño. Quedan ${r.remaining}.`);
          if (r.others) lines.push(r.others.damage ? `La siguiente unidad (Protección ${r.others.protection}) recibe 1 punto de daño; quedan ${r.others.left}.` : `Los ${r.remaining} restantes no alcanzan la Protección ${r.others.protection} de la siguiente unidad.`);
        }
        sides[sideId] = { status: 'ok', explanation: lines };
      } catch (err) {
        sides[sideId] = { status: 'error', explanation: [err.message] };
      }
    });
    return { sides };
  }

  // Reparto de impactos antibuque en la flota (hoja de flota y Decision Book §5.6.5): la tirada elige el buque entre los
  // que siguen a flote (contando de izquierda a derecha y volviendo a empezar); absorbe impactos hasta que el daño alcanza
  // su Protección y, dañado, tira por hundimiento. Una ronda cada vez: con impactos sobrantes, otra tirada.
  function computeFleetImpact(calculator, inputs, sideDefs) {
    const sides = {};
    const shared = inputs.shared || {};
    const afloat = Object.keys(inputs.sides || {}).filter((id) => !unusedSide(calculator, sideDefs, id, inputs.sides[id]) && inputs.sides[id].sunk !== 'yes');
    Object.keys(inputs.sides || {}).forEach((id) => { sides[id] = afloat.includes(id) ? { status: 'unused', explanation: ['A flote: no le toca en esta tirada.'] } : { status: 'unused', explanation: [inputs.sides[id].sunk === 'yes' ? 'Hundido: no cuenta.' : 'Sin este buque.'] }; });
    if (['impacts', 'perImpact', 'roll'].some((k) => isEmpty(shared[k])) || !afloat.length || afloat.some((id) => missingFields(calculator, inputs.sides[id]).length)) return { sides, pending: true };
    const target = CombatWizardEngine.assignImpactTarget(Number(shared.roll), afloat);
    const ship = inputs.sides[target.ship];
    const hit = CombatWizardEngine.applyImpactsToShip({ protection: Number(ship.protection) }, Number(shared.impacts), Number(shared.perImpact));
    const label = ((sideDefs || []).find((d) => d.id === target.ship) || {}).label || target.ship;
    const lines = [`Tirada ${shared.roll}: ${afloat.length} buque(s) a flote, ${shared.roll} entre ${afloat.length} da resto ${target.index} → ${label}.`];
    if (!hit.damaged) lines.push(`Los ${shared.impacts} impacto(s) (×${shared.perImpact} de daño) no alcanzan su Protección ${ship.protection}: sin efecto, se desprecian.`);
    else {
      lines.push(`Absorbe ${hit.absorbed} impacto(s) y queda dañado; quedan ${hit.remainingImpacts}.`);
      if (!isEmpty(ship.sinking) && !isEmpty(shared.sinkingRoll)) lines.push(CombatWizardEngine.checkSinking(Number(shared.sinkingRoll), Number(ship.sinking)) ? `Tirada de hundimiento ${shared.sinkingRoll} ≤ ${ship.sinking}: se hunde.` : `Tirada de hundimiento ${shared.sinkingRoll} > ${ship.sinking}: sigue a flote, dañado.`);
      else lines.push('Tira 1d10 por hundimiento: se hunde si sale menor o igual que su Valor de Hundimiento.');
    }
    sides[target.ship] = { status: 'ok', explanation: lines };
    const summary = hit.damaged && hit.remainingImpacts > 0 ? [`Quedan ${hit.remainingImpacts} impacto(s): cambia los impactos a ${hit.remainingImpacts}, marca el buque si se ha hundido y haz otra tirada.`] : ['No quedan impactos útiles: el reparto ha terminado.'];
    return { sides, summary };
  }

  // Ataques de reacción terrestres (§5.16, §8.5.6, §8.7.8): quién puede ejecutar la reacción, ajustes y consecuencias.
  function computeReaction(calculator, rules, inputs, sideDefs) {
    const sides = {};
    const reaction = GroundReactionEngine.findReaction(rules, calculator.reaction);
    const kinds = [];
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      const unused = unusedSide(calculator, sideDefs, sideId, v, 'Sin esta unidad.');
      if (unused) { sides[sideId] = unused; return; }
      const e = GroundReactionEngine.evaluateAttacker(rules, calculator.reaction, v);
      if (e.pending) { sides[sideId] = { status: 'incomplete' }; return; }
      if (e.eligible) kinds.push(v.kind);
      sides[sideId] = { status: e.eligible ? 'ok' : 'no-effect', explanation: [e.eligible ? `Puede ejecutar ${reaction.name}.` : 'No puede ejecutarla:'].concat(e.reasons, e.notes) };
    });
    const st = GroundReactionEngine.attackSettings(rules, calculator.reaction);
    const summary = [];
    if ((inputs.shared || {}).targetDetected === 'no') summary.push('El objetivo debe haber sido detectado mientras está Brevemente Detectable: sin detección no hay reacción.');
    if (kinds.length) {
      summary.push(`Al resolver: ${st.usesPursuitRow ? 'fila de Persecución de la tabla' : 'fila normal de la tabla'}; ${st.targetGetsTerrainBonus ? 'el objetivo suma su Valor de Terreno' : 'sin bonificación de terreno'}; ${st.targetCanLowAltitudeCounterattack ? 'el objetivo puede contraatacar a baja altura' : 'sin contraataque a baja altura'}.`);
      if (st.limits) summary.push(st.limits);
      summary.push('Todo (atacantes, objetivos y orden) queda decidido antes del primer ataque.');
      GroundReactionEngine.aftermath(rules, calculator.reaction, kinds).forEach((l) => summary.push(l.text));
    }
    return { sides, summary };
  }

  // Emboscada de submarino (§9.16): si puede iniciarla y la secuencia de resolución.
  function computeAmbush(calculator, rules, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      const r = SubmarineAmbushEngine.evaluateAmbush(v);
      if (r.eligible === null) { sides[sideId] = { status: 'incomplete' }; return; }
      if (!r.eligible) { sides[sideId] = { status: 'no-effect', explanation: ['No puede iniciar la Emboscada:'].concat(r.reasons.map((k) => rules.reasons[k] || k)) }; return; }
      const lines = ['Puede iniciar la Emboscada (la iniciación siempre tiene éxito):'].concat(rules.steps.map((st, i) => `${i + 1}. ${st.text}`));
      if (!r.mayAttackWithAmmo) lines.push(rules.noAmmoStep.text);
      sides[sideId] = { status: 'ok', explanation: lines };
    });
    return { sides };
  }

  // Logística de puerto y munición (§9.9.4, §9.9.5, §11.6, §11.2.2): una operación por cálculo.
  function computePortLogistics(calculator, rules, inputs) {
    const sides = {};
    const num = (x) => (isEmpty(x) ? NaN : Number(x));
    const why = (keys) => keys.map((k) => rules.reasons[k] || k);
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      let lines;
      switch (calculator.operation) {
        case 'ammo_resupply': {
          const r = PortLogisticsEngine.evaluateResupply({ units: num(v.units), portValue: num(v.portValue), inWaitingArea: v.inWaitingArea });
          lines = [`Se reabastecen ${r.resupplied} unidad(es); quedan ${r.left} sin reabastecer.`].concat(why(r.reasons), [rules.texts.ammo_resupply_effect]);
          break;
        }
        case 'ship_repair': {
          const r = PortLogisticsEngine.evaluateRepair({ inPort: v.inPort, damaged: v.damaged, multiShip: v.multiShip, alreadyTried: v.alreadyTried, shipsInDock: num(v.shipsInDock), docks: num(v.docks), rep: num(v.rep), roll: num(v.roll) });
          lines = r.eligible === false ? ['No puede intentar la reparación:'].concat(why(r.reasons)) : [`Tirada ${v.roll} ${r.success ? '<' : '≥'} REP ${v.rep}.`, r.success ? rules.texts.repair_success : rules.texts.repair_failure, rules.texts.repair_cost];
          break;
        }
        case 'emergency_repair': {
          const r = PortLogisticsEngine.evaluateEmergencyRepair({ rr: num(v.rr), markers: num(v.markers) });
          lines = [`Se eliminan ${r.removed} marcador(es) de «Instalaciones Inutilizadas»; quedan ${r.remaining}.`, rules.texts.emergency_when];
          break;
        }
        case 'ammo_depletion': {
          const r = PortLogisticsEngine.evaluateDepletion({ remaining: num(v.remaining), attackValue: num(v.attackValue) });
          lines = [r.exhausted ? rules.texts.depletion_zero : `Valor de Ataque efectivo: ${r.effective}${r.reduced ? ` (baja de ${v.attackValue} a la munición que queda)` : ' (sin cambio)'}.`];
          break;
        }
        default: {
          const r = PortLogisticsEngine.evaluateNodeDecay({ level: num(v.level), providedSupply: v.providedSupply });
          lines = [r.changed ? `El nodo baja al nivel ${r.newLevel}${r.eliminated ? ' y se elimina' : ''}.` : `El nodo se queda en el nivel ${r.newLevel}${r.eliminated ? ' (eliminado)' : ''}.`];
        }
      }
      sides[sideId] = { status: 'ok', explanation: lines.filter(Boolean) };
    });
    return { sides };
  }

  // Garantía logística (§11.2-§11.5): si la unidad conecta con un Nodo de Suministro y qué pasa sin garantía.
  function computeGuarantee(calculator, rules, inputs) {
    const sides = {};
    const unit = rules.unitTypes.find((u) => u.id === calculator.unitType);
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      const r = LogisticsGuaranteeEngine.evaluateGuarantee({ unitType: calculator.unitType, carrier: v.carrier, nodeKind: v.nodeKind, nodeEnemyControlled: v.nodeEnemyControlled, blockedEdge: v.blockedEdge, enemyUnitsOnPath: v.enemyUnitsOnPath, tacticalContainment: v.tacticalContainment, enemyControlledOnPath: v.enemyControlledOnPath });
      if (r.guaranteed === null) { sides[sideId] = { status: 'incomplete' }; return; }
      const lines = r.reasons.map((k) => rules.reasons[k] || k);
      lines.push(r.guaranteed ? 'Resultado: con suministros (tiene garantía logística).' : `Resultado: sin suministros. ${unit.withoutGuarantee}`);
      sides[sideId] = { status: r.guaranteed ? 'ok' : 'no-effect', explanation: lines };
    });
    return { sides };
  }

  // Ataque cibernético (§14.2-§14.4): tiradas de defensa y de ataque (3 por punto), clasificadas con la columna «Guerra
  // Cibernética» de la página 32.
  function computeCyberAttack(calculator, rules, inputs, extra) {
    const sides = {};
    const table = extra[calculator.extraTables[0].tableId];
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      const lines = [];
      const defense = v.defenseUsed === 'yes' ? StrategicActionsEngine.parseRolls(v.defenseRolls || '') : [];
      const defenseRolls = v.defenseUsed === 'yes' ? CyberAttackEngine.baseRolls(Number(v.defensePoints)) : 0;
      if (v.defenseUsed === 'yes' && (!defense || defense.length !== defenseRolls)) { sides[sideId] = { status: 'incomplete', explanation: [`La defensa tira ${defenseRolls} dado(s) (3 por punto): escribe sus resultados.`] }; return; }
      const dT = defense && defense.length ? StrategicActionsEngine.tallyRolls(table, 'cyber', defense) : { successes: 0, failures: 0 };
      const attackRolls = CyberAttackEngine.attackRolls({ attackPoints: Number(v.attackPoints), defenseSuccesses: dT.successes, defenseFailures: dT.failures });
      if (v.defenseUsed === 'yes') lines.push(`Defensa: ${defense.join(', ')} → ${dT.successes} éxito(s) y ${dT.failures} fallo(s).`);
      lines.push(`Tiradas del atacante: ${Number(v.attackPoints) * 3} + fallos de la defensa − éxitos de la defensa = ${attackRolls}.`);
      const attack = StrategicActionsEngine.parseRolls(v.attackRolls || '');
      if (!attack || attack.length !== attackRolls) { lines.push(`Escribe los resultados de las ${attackRolls} tirada(s) del atacante.`); sides[sideId] = { status: 'incomplete', explanation: lines }; return; }
      const aT = StrategicActionsEngine.tallyRolls(table, 'cyber', attack);
      const r = CyberAttackEngine.evaluateCyberAttack({ restricted: 'no', attackPoints: Number(v.attackPoints), defenseUsed: v.defenseUsed, defensePoints: Number(v.defensePoints || 0), defenseSuccesses: dT.successes, defenseFailures: dT.failures, attackSuccesses: aT.successes, attackFailures: aT.failures });
      lines.push(`Ataque: ${attack.join(', ')} → ${aT.successes} éxito(s) y ${aT.failures} fallo(s).`, `Resultado: ${r.success ? 'la acción cibernética tiene éxito' : 'la acción cibernética falla'} (éxitos − fallos = ${r.netSuccesses}).`);
      sides[sideId] = { status: 'ok', explanation: lines };
    });
    return { sides };
  }

  // Guerra espacial (§14.5-§14.9): orden de acción, efecto de la destrucción y escombros.
  function computeSpace(calculator, inputs, extra) {
    const sides = {};
    const table = calculator.extraTables ? extra[calculator.extraTables[0].tableId] : null;
    const all = inputs.sides || {};
    const ids = Object.keys(all);
    const n = (x) => (isEmpty(x) ? NaN : Number(x));
    if (calculator.part === 'order') {
      const [a, b] = ids;
      const r = StrategicActionsEngine.actionOrder({ launchA: n(all[a].launch), launchB: n(all[b].launch), orbitalA: n(all[a].orbital), orbitalB: n(all[b].orbital), tieRollA: n(all[a].tieRoll), tieRollB: n(all[b].tieRoll) });
      ids.forEach((id) => { sides[id] = { status: 'unused', explanation: [] }; });
      const label = (k) => ((calculator.sides || []).find((x) => x.id === (k === 'A' ? a : b)) || {}).label || k;
      const summary = { incomplete: ['Faltan los recursos de lanzamiento y orbitales de los dos bandos.'], needs_roll: ['Empate en los dos recursos: cada bando tira 1d10.'], reroll: ['Empate en la tirada: repetidla.'] }[r.status]
        || [r.by === 'dice' ? `Gana la tirada ${label(r.chooser)}: elige quién actúa primero.` : `Actúa primero ${label(r.first)} (${r.by === 'launch' ? 'menos recursos de lanzamiento' : 'más recursos orbitales'}).`];
      return { sides, summary, pending: r.status !== 'decided' };
    }
    Object.entries(all).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      if (calculator.part === 'destruction') {
        const rolls = StrategicActionsEngine.parseRolls(v.rolls);
        const r = rolls ? StrategicActionsEngine.resolveDestruction({ table, kind: v.kind, maneuver: v.maneuver, rolls, enemyOrbital: n(v.enemyOrbital) }) : { error: 'wrong_roll_count', expected: StrategicActionsEngine.destructionRolls(v.kind, v.maneuver) };
        if (r.error) { sides[sideId] = { status: 'incomplete', explanation: [`Este ataque tira ${r.expected} dado(s)${v.maneuver === 'yes' && v.kind !== 'soft' ? ' (−2 por la Maniobra Orbital)' : ''}: escribe sus resultados.`] }; return; }
        sides[sideId] = { status: 'ok', explanation: [`Tiradas ${rolls.join(', ')}: ${r.successes} éxito(s), ${r.failures} fallo(s).`, `El enemigo pierde ${r.enemyOrbitalLost} recurso(s) orbital(es) (${r.enemyOrbitalLostKind === 'consumed' ? 'consumidos' : 'destruidos'})${r.capped ? ', limitado a los que tiene' : ''}.`, `Coste propio: ${{ destroy_launch: 'se destruye el recurso de lanzamiento', consume_launch: 'se consume el recurso de lanzamiento', destroy_orbital: 'se destruye el recurso orbital' }[r.ownCost]}.`, `Escombros generados: ${r.debrisGenerated}.`] };
      } else if (calculator.part === 'debris') {
        const storm = StrategicActionsEngine.debrisStorm({ table, roll: n(v.stormRoll), debris: n(v.debris) });
        const vanish = isEmpty(v.vanishRoll) ? null : StrategicActionsEngine.debrisVanish({ table, roll: n(v.vanishRoll), debris: n(v.debris) });
        const lines = [storm ? `Tormenta de Escombros: ${v.stormRoll} + ${v.debris} escombros = ${storm.total}${storm.clamped ? ' (se lee en 9)' : ''}: ${storm.collision ? 'colisión' : 'sin colisión'}.` : 'Escribe la tirada de la Tormenta de Escombros.'];
        if (vanish) lines.push(`Al inicio de la Fase Espacial: desaparecen ${vanish.removed} escombro(s); quedan ${vanish.remaining}.`);
        sides[sideId] = { status: storm ? 'ok' : 'incomplete', explanation: lines };
      }
    });
    return { sides };
  }

  // Orden de elección de objetivos del combate BVR (§7.16.1, §7.10.4): quién elige y en qué orden.
  function computeBvrSelection(calculator, inputs, sideDefs) {
    const sides = {};
    const shared = inputs.shared || {};
    const ids = Object.keys(inputs.sides || {}).filter((id) => !unusedSide(calculator, sideDefs, id, inputs.sides[id]));
    Object.keys(inputs.sides || {}).forEach((id) => { if (!ids.includes(id)) sides[id] = { status: 'unused', explanation: ['Sin este avión.'] }; });
    if (['context', 'eeaA', 'eeaB', 'initiatorSide'].some((k) => isEmpty(shared[k])) || (shared.context === 'penetration' && isEmpty(shared.penetratorSide)) || ids.some((id) => missingFields(calculator, inputs.sides[id]).length)) {
      ids.forEach((id) => { sides[id] = { status: 'incomplete' }; });
      return { sides, pending: true };
    }
    try {
      const units = ids.map((id) => ({ id, name: id, side: inputs.sides[id].side, electronic: inputs.sides[id].electronic, detected: inputs.sides[id].detected === 'yes', ew: inputs.sides[id].ew === 'yes' }));
      const r = AirInterceptTargetsEngine.selectionOrder(units, { eeaA: shared.eeaA === 'yes', eeaB: shared.eeaB === 'yes', initiatorSide: shared.initiatorSide, context: shared.context, penetratorSide: shared.penetratorSide });
      const label = (id) => ((sideDefs || []).find((d) => d.id === id) || {}).label || id;
      ids.forEach((id) => {
        const pos = r.order.findIndex((o) => o.id === id);
        sides[id] = pos === -1 ? { status: 'no-effect', explanation: ['No elige objetivo: elige el bando con escolta electrónica (EEA).'] } : { status: 'ok', explanation: [`Elige en ${pos + 1}.º lugar${r.order[pos].tieWithinSide ? ' (empate con otro avión de su bando: lo decide su jugador)' : ''}.`] };
      });
      const mode = { eea: `Solo elige el bando ${r.mode.side}, que tiene escolta electrónica (EEA).`, eea_penetration: `El avión EW del bando ${r.mode.side} (que penetra) elige primero; después, por prioridad.`, priority: 'Por prioridad: primero los no detectados, después mayor Valor Electrónico; con empate entre bandos, el que inicia.' }[r.mode.mode];
      return { sides, summary: [mode, `Orden: ${r.order.map((o) => label(o.id)).join(' → ')}. Cada uno elige un oponente libre del otro bando (o renuncia); termina cuando el bando más pequeño tiene todos emparejados. Los que quedan sin pareja no combaten en BVR.`] };
    } catch (err) {
      return { sides, summary: [err.message], pending: true };
    }
  }

  // Modificación de la Intensidad del Ataque (páginas 5, 8 y 24): suma de las condiciones del workflow y de los valores
  // escritos; el resultado se lleva a la tabla de daño.
  function computeIntensity(calculator, inputs, workflow) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      const mod = fieldModifiers(calculator, workflow, v, 'attack_intensity');
      const lines = mod.lines.length ? [`${mod.lines.join(', ')}.`] : ['Sin modificaciones.'];
      lines.push(`Resultado: Modificación de Intensidad ${signed(mod.total)}${mod.total > 0 ? ' (contra unidades básicas, un valor positivo cuenta como 0)' : ''}. Escríbela en la tabla de daño.`);
      sides[sideId] = { status: 'ok', intensity: mod.total, explanation: lines };
    });
    return { sides };
  }

  // Iniciativa y tipo de combate BVR (§7.16.2, página 15): Iniciativa de cada bando (+1 con AWACS que detecta), DRM de la
  // diferencia, 1d10 + DRM del bando con ventaja y resultado según el contexto de la interceptación.
  function computeBvrInitiative(calculator, table, inputs, workflow, extra) {
    const sides = {};
    const shared = inputs.shared || {};
    const ids = Object.keys(inputs.sides || {});
    const outcomeTable = extra[calculator.extraTables[0].tableId];
    const rule = (findKey(workflow, 'outcomeRule') || {});
    const values = {};
    ids.forEach((id) => {
      const v = inputs.sides[id];
      if (missingFields(calculator, v).length) { sides[id] = { status: 'incomplete' }; return; }
      const mod = fieldModifiers(calculator, workflow, v, 'initiative');
      values[id] = Number(v.initiative) + mod.total;
      sides[id] = { status: 'unused', explanation: [`Iniciativa ${v.initiative}${mod.total ? ` + ${mod.total} (AWACS)` : ''} = ${values[id]}.`] };
    });
    if (Object.keys(values).length < 2) return { sides, pending: true };
    const [a, b] = ids;
    const difference = Math.abs(values[a] - values[b]);
    const adv = values[a] === values[b] ? null : (values[a] > values[b] ? a : b);
    const drm = AirCombatBvrEngine.initiativeDrm(table, TableEngine, difference);
    const label = (id) => ((calculator.sides || []).find((d) => d.id === id) || { label: id }).label;
    const summary = [`Diferencia de Iniciativa: ${difference}${difference ? ` → DRM +${drm}` : ' (sin DRM)'}. ${adv ? `Ventaja: ${label(adv)}, que tira 1d10.` : 'Empate: los jugadores deciden quién tira.'}`];
    const extraMarks = [];
    if (difference > 0) {
      const cell = TableEngine.resolveCell(table, difference, 'DRM');
      const sideId = adv || a;
      sides[sideId] = { ...sides[sideId], status: 'ok', columnScheme: 'canonical', columnIndex: 0, rowIndex: cell.rowIndex, rowValue: difference };
    }
    if (isEmpty(shared.roll) || isEmpty(shared.context)) return { sides, summary: summary.concat(['Falta el contexto de la interceptación o la tirada.']), pending: true };
    const total = Number(shared.roll) + (difference ? drm : 0);
    try {
      const r = AirCombatBvrEngine.determineBvrType(outcomeTable, TableEngine, rule.cellOutcomes || {}, { total, context: shared.context, penetratorSide: shared.penetratorSide, penetratorStealth: shared.penetratorStealth === 'yes', advantageSide: adv, bothStealth: shared.bothStealth === 'yes' });
      summary.push(`Tirada ${shared.roll}${difference ? ` + ${drm}` : ''} = ${total}${r.cell ? ` → fila «${r.cell.rowLabel}», «${r.cell.rawCell}»` : ''}.`);
      summary.push(`Resultado: ${(rule.outcomes || {})[r.outcome] || r.outcome}`);
      if (r.cell) extraMarks.push({ tableId: outcomeTable.id, sideId: adv || a, mark: { status: 'ok', columnScheme: 'canonical', columnIndex: r.cell.columnIndex, rowIndex: r.cell.rowIndex } });
      return { sides, summary, extraMarks };
    } catch (err) {
      return { sides, summary: summary.concat([err.message]), pending: true };
    }
  }

  // Planes de ataque de una unidad transcrita (data/ammunition/*), para rellenar un Valor de Ataque desde el plan
  // (antes lo hacía la selección de unidad y plan de los wizards). `domain`: antiShip, landAttack… o vacío para todos.
  // Solo se ofrecen planes con valor numérico transcrito (nunca se inventa uno ausente).
  function planChoices(unit, domain) {
    const groups = unit.domainSplit === false ? { '': unit.plans || {} } : (domain ? { [domain]: (unit.plans || {})[domain] || {} } : (unit.plans || {}));
    const out = [];
    Object.entries(groups).forEach(([dom, plans]) => Object.entries(plans || {}).forEach(([letter, plan]) => {
      const loads = plan.loadFormat === 'dual' ? ['heavy', 'light'] : [null];
      loads.forEach((load) => [false, true].forEach((damaged) => {
        const value = CombatWizardEngine.derivePlanAttackValue(plan, { loadType: load, damaged });
        if (value === null || value === undefined) return;
        const range = CombatWizardEngine.derivePlanRange(plan, { damaged });
        out.push({ domain: dom, letter, munition: plan.munition, load, damaged, value, range, label: `Plan ${letter}${plan.munition ? ` (${plan.munition})` : ''}${load ? (load === 'light' ? ', carga ligera' : ', carga pesada') : ''}${damaged ? ', unidad dañada' : ''}: Valor de Ataque ${value}${range !== null && range !== undefined ? `, alcance ${range}` : ''}` });
      }));
    }));
    return out;
  }

  // Reducciones del Valor de Ataque ya calculadas en las preguntas de defensa de este recorrido (`defenseNodes`): solo
  // cuentan las preguntas contestadas «Sí»; una contestada «Sí» sin cálculo hecho queda pendiente (no se supone 0).
  // `history`: respuestas de la sesión; `saved`: lo guardado de cada cálculo por `<nodo>#<ronda>` (su `outcome`).
  function defenseReductions(calculator, history, saved) {
    const lines = [];
    let total = 0;
    let pending = false;
    (calculator.defenseNodes || []).forEach((d) => {
      const step = (history || []).find((h) => h.nodeId === d.node);
      if (!step || step.answer !== 'Sí') return;
      const outcome = ((saved || {})[`${d.node}#0`] || {}).outcome;
      if (!outcome || typeof outcome.reduction !== 'number') { pending = true; lines.push(`${d.label}: falta hacer su cálculo`); return; }
      total += outcome.reduction;
      lines.push(`${d.label} ${outcome.reduction}`);
    });
    return { total, pending, lines };
  }

  function compute(calculator, context, inputs) {
    if (calculator.engine === 'bvr-initiative') return computeBvrInitiative(calculator, context.table, inputs, context.workflow, context.extra || {});
    if (calculator.engine === 'attack-intensity') return computeIntensity(calculator, inputs, context.workflow);
    if (calculator.engine === 'reaction') return computeReaction(calculator, context.rules, inputs, calculator.sides);
    if (calculator.engine === 'ambush') return computeAmbush(calculator, context.rules, inputs);
    if (calculator.engine === 'port-logistics') return computePortLogistics(calculator, context.rules, inputs);
    if (calculator.engine === 'logistics-guarantee') return computeGuarantee(calculator, context.rules, inputs);
    if (calculator.engine === 'cyber-attack') return computeCyberAttack(calculator, context.rules, inputs, context.extra || {});
    if (calculator.engine === 'space') return computeSpace(calculator, inputs, context.extra || {});
    if (calculator.engine === 'bvr-selection') return computeBvrSelection(calculator, inputs, calculator.sides);
    if (calculator.engine === 'fleet-impact') return computeFleetImpact(calculator, inputs, calculator.sides);
    if (calculator.engine === 'wvr-absorption') return computeWvrAbsorption(calculator, inputs);
    if (calculator.engine === 'ew-escort') return computeEwEscort(calculator, inputs);
    if (calculator.engine === 'low-altitude-counterattack') return computeLowAltitude(calculator, context.table, inputs, calculator.sides);
    if (calculator.engine === 'naval-artillery') return computeNavalArtillery(calculator, context.table, inputs);
    if (calculator.engine === 'ground-unit-hit') return computeGroundUnitHit(calculator, context.rules, inputs);
    if (calculator.engine === 'port-attack') return computePortAttack(calculator, inputs, calculator.sides);
    if (calculator.engine === 'airfield') return computeAirfield(calculator, context.rules, inputs, calculator.sides);
    if (calculator.engine === 'ship-impact') return computeShipImpact(calculator, context.rules, inputs);
    if (calculator.engine === 'area-air-defense-reduction') return computeAreaReduction(calculator, context.table, inputs, context.workflow);
    if (calculator.engine === 'munition-interception') return computeMunitionInterception(calculator, context.table, inputs, context.workflow, calculator.sides);
    if (calculator.engine === 'final-interception') return computeFinalInterception(calculator, context.table, inputs);
    if (calculator.engine === 'vef-multiplier') return computeVefMultiplier(calculator, context.table, inputs, context.workflow, context.extra || {});
    if (calculator.engine === 'area-air-defense-shot') return computeAreaShot(calculator, context.table, inputs);
    if (calculator.engine === 'strategic-rolls') return computeStrategicRolls(calculator, context.table, inputs);
    if (calculator.engine === 'antiship-guided-final') return computeAntishipGuidedFinal(calculator, context.table, inputs);
    if (calculator.engine === 'antiship-unguided') return computeAntishipUnguided(calculator, context.table, inputs);
    if (calculator.engine === 'anti-radiation') return computeAntiRadiation(calculator, context.table, inputs);
    if (calculator.engine === 'ground-guided') return computeGroundGuided(calculator, context.table, context.choices, inputs, context.workflow);
    if (calculator.engine === 'torpedo-surface') return computeTorpedo(calculator, context.table, inputs);
    if (calculator.engine === 'army-resupply') return computeArmyResupply(calculator, context.table, inputs, context.rules);
    if (calculator.engine === 'asw-signature-search') return computeSignatureSearch(calculator, context.table, inputs, context.workflow);
    if (calculator.engine === 'asw-air-search') return computeAirSearch(calculator, { [calculator.table.tableId]: context.table, ...(context.extra || {}) }, inputs, context.workflow);
    if (calculator.engine === 'asw-attack') return computeAsw(context.table, inputs, false, calculator, context.workflow);
    if (calculator.engine === 'asw-submarine') return computeAsw(context.table, inputs, true, calculator, context.workflow);
    if (calculator.engine === 'ground-close-combat') return computeGroundCloseCombat(context.table, context.choices, inputs, context.extra && context.extra['ground-close-combat-electronic-warfare']);
    if (calculator.engine === 'wvr-round') return computeWvrRound(context.table, context.choices, inputs);
    if (calculator.engine === 'bvr-attack') return computeBvrAttack(context.table, context.choices, inputs);
    throw new Error(`Cálculo desconocido: ${calculator.engine}`);
  }

  // Columna antes de la tirada (indicación del mantenedor, 2026-11-01): con todos los datos salvo la tirada se marca ya la
  // columna; la tirada añade la fila y la celda. Se calcula con una tirada de prueba y se descarta todo lo que depende de
  // ella (fila, celda, resultado y tablas extra).
  function computeWithColumn(calculator, context, inputs) {
    const result = compute(calculator, context, inputs);
    if (!context.table) return result;
    const rows = context.table && context.table.rowAxis ? context.table.rowAxis.values : ['0'];
    // Tiradas de prueba: la primera fila y, si con los modificadores se sale de la tabla, la última.
    const candidates = [rows[0], rows[rows.length - 1]].map((r) => String(parseInt(String(r).replace(/[^0-9-]/g, ''), 10) || 0));
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (!result.sides[sideId] || result.sides[sideId].status !== 'incomplete') return;
      const missing = missingFields(calculator, v).map((d) => d.id);
      // Solo faltan tiradas (una o varias, p. ej. las dos del subsónico): se prueban todas.
      if (!missing.length || !missing.every((id) => /^roll/.test(id))) return;
      let trial = null;
      for (const probe of candidates) {
        const probes = Object.fromEntries(missing.map((id) => [id, probe]));
        trial = compute(calculator, context, { ...inputs, sides: { ...inputs.sides, [sideId]: { ...v, ...probes } } });
        if (trial.sides[sideId] && trial.sides[sideId].status === 'ok') break;
      }
      const t = trial.sides[sideId];
      if (!t || t.status !== 'ok') return;
      const cut = t.explanation.findIndex((line) => /^Tirada|^Resultado|^Guerra electrónica|^Nivel/.test(line));
      const lines = (cut === -1 ? t.explanation : t.explanation.slice(0, cut)).concat(['Falta la tirada: al indicarla se marcarán la fila y la celda del resultado.']);
      result.sides[sideId] = { status: 'column', columnScheme: t.columnScheme, columnIndex: t.columnIndex, columnLabel: t.columnLabel, explanation: lines };
      if (!result.tableId && trial.tableId) result.tableId = trial.tableId;
    });
    return result;
  }

  // Rectángulos normalizados (0-1) que marcan en la página real la columna, la fila y la celda de un bando.
  function markRects(geometry, side) {
    if (!geometry || !side || (side.status !== 'ok' && side.status !== 'column') || side.columnIndex === undefined) return null;
    const band = (geometry.headerBands || {})[side.columnScheme];
    const x0 = geometry.columnEdges[side.columnIndex];
    const x1 = geometry.columnEdges[side.columnIndex + 1];
    const y0 = geometry.rowEdges[side.rowIndex];
    const y1 = geometry.rowEdges[side.rowIndex + 1];
    const bottom = geometry.rowEdges[geometry.rowEdges.length - 1];
    const left = geometry.frame[0];
    const header = band ? { x: x0, y: band[0], w: x1 - x0, h: band[1] - band[0] } : null;
    const column = { x: x0, y: band ? band[0] : geometry.rowEdges[0], w: x1 - x0, h: bottom - (band ? band[0] : geometry.rowEdges[0]) };
    // Solo columna (aún sin tirada): ni fila ni celda.
    if (side.status === 'column') return { header, column, row: null, cell: null, extraCells: [] };
    return {
      header: band ? { x: x0, y: band[0], w: x1 - x0, h: band[1] - band[0] } : null,
      column: { x: x0, y: band ? band[0] : geometry.rowEdges[0], w: x1 - x0, h: bottom - (band ? band[0] : geometry.rowEdges[0]) },
      row: { x: left, y: y0, w: geometry.columnEdges[geometry.columnEdges.length - 1] - left, h: y1 - y0 },
      cell: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      extraCells: (side.extraCells || []).map((c) => ({ x: geometry.columnEdges[c.columnIndex], y: geometry.rowEdges[c.rowIndex], w: geometry.columnEdges[c.columnIndex + 1] - geometry.columnEdges[c.columnIndex], h: geometry.rowEdges[c.rowIndex + 1] - geometry.rowEdges[c.rowIndex] }))
    };
  }

  function geometryFor(hotspots, page, tableId) {
    const n = Number(String(page).match(/\d+/)[0]);
    return ((hotspots && hotspots.tables) || []).find((t) => t.page === n && t.tableId === tableId) || null;
  }

  return { defenseReductions, planChoices, calculatorForNode, calculatorsForNode, computeBvrInitiative, computeIntensity, computeReaction, computeAmbush, computePortLogistics, computeGuarantee, computeCyberAttack, computeSpace, computeBvrSelection, computeFleetImpact, computeWvrAbsorption, computeEwEscort, computeLowAltitude, computeNavalArtillery, computeGroundUnitHit, computePortAttack, computeAirfield, computeShipImpact, findKey, resolveChoices, fieldApplies, fieldOptions, fieldModifiers, computeAreaReduction, computeMunitionInterception, computeFinalInterception, computeVefMultiplier, computeAreaShot, computeWvrRound, computeBvrAttack, computeGroundCloseCombat, computeAsw, computeSignatureSearch, computeAirSearch, computeTorpedo, computeArmyResupply, computeGroundGuided, computeAntiRadiation, computeAntishipGuidedFinal, computeAntishipUnguided, computeStrategicRolls, columnShiftFromEffects, compute, computeWithColumn, markRects, geometryFor };
});
