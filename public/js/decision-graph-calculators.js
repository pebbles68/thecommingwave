// Cálculos dentro de una pregunta del asistente de combate (Fase 25). Cada cálculo declarado en
// data/routing/decision-graph-calculators.json se resuelve aquí reutilizando el motor ya probado de su wizard, y
// devuelve por bando la columna, la fila y la celda elegidas (índices de data/tables/) más la explicación. La posición
// de esas columnas y filas en la página real sale de data/image-hotspots/table-pages.json (`markRects`). Sin DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./air-combat-wvr-engine.js'), require('./air-combat-bvr-engine.js'), require('./ground-close-combat-engine.js'), require('./asw-attack-engine.js'), require('./asw-signature-search-engine.js'), require('./asw-air-search-engine.js'), require('./torpedo-attack-engine.js'), require('./army-resupply-engine.js'), require('./ground-guided-attack-engine.js'), require('./anti-radiation-attack-engine.js'), require('./combat-modifier-engine.js'), require('./table-engine.js'));
  else root.DecisionGraphCalculators = factory(root.AirCombatWvrEngine, root.AirCombatBvrEngine, root.GroundCloseCombatEngine, root.AswAttackEngine, root.AswSignatureSearchEngine, root.AswAirSearchEngine, root.TorpedoAttackEngine, root.ArmyResupplyEngine, root.GroundGuidedAttackEngine, root.AntiRadiationAttackEngine, root.CombatModifierEngine, root.TableEngine);
})(typeof self !== 'undefined' ? self : this, function (AirCombatWvrEngine, AirCombatBvrEngine, GroundCloseCombatEngine, AswAttackEngine, AswSignatureSearchEngine, AswAirSearchEngine, TorpedoAttackEngine, ArmyResupplyEngine, GroundGuidedAttackEngine, AntiRadiationAttackEngine, CombatModifierEngine, TableEngine) {
  'use strict';

  function calculatorForNode(calcData, nodeId) {
    const entries = Object.entries((calcData && calcData.calculators) || {});
    const found = entries.find(([, c]) => (c.nodes || []).includes(nodeId));
    return found ? { id: found[0], ...found[1] } : null;
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
  function computeAsw(table, inputs, submarine) {
    const sides = {};
    const filled = (v) => v !== '' && v !== undefined;
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (!v.position || !filled(v.signature) || !v.moving || !filled(v.attack) || !filled(v.roll) || (submarine && !v.torpedoType)) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const args = { position: v.position, signature: Number(v.signature), targetMoving: v.moving === 'yes', roll: Number(v.roll) };
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
    return values[def.showIf.field] === def.showIf.equals;
  }
  function missingFields(calculator, values) {
    return calculator.fields.filter((def) => !def.optional && fieldApplies(def, values) && (values[def.id] === '' || values[def.id] === undefined));
  }

  // Búsqueda por diferencia de firma (página 33): columna del buscador, fila donde está la Firma del objetivo y celda
  // de rango (evento + distancia), que se marca aparte en la misma tabla.
  function computeSignatureSearch(calculator, table, inputs) {
    const sides = {};
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      try {
        const r = AswSignatureSearchEngine.resolveSignatureSearch(table, TableEngine, { searcherKind: v.searcherKind, searcherSignature: v.searcherSignature, frame: v.frame, depth: v.depth, trigger: v.trigger, distance: v.distance, targetSignature: v.targetSignature, targetMoving: v.moving === 'yes', roll: Number(v.roll) });
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
  function computeAirSearch(calculator, tables, inputs) {
    const sides = {};
    let tableId = calculator.table.tableId;
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (missingFields(calculator, v).length) { sides[sideId] = { status: 'incomplete' }; return; }
      tableId = v.trigger === 'post_attack' ? 'asw-air-search-post-attack' : 'asw-air-search-routine';
      const table = tables[tableId];
      try {
        const r = AswAirSearchEngine.resolveAirSearch(table, TableEngine, { depth: v.depth, signature: Number(v.signature), targetMoving: v.moving === 'yes', totalAirValue: Number(v.airValue), roll: Number(v.roll) });
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

  function compute(calculator, context, inputs) {
    if (calculator.engine === 'antiship-guided-final') return computeAntishipGuidedFinal(calculator, context.table, inputs);
    if (calculator.engine === 'antiship-unguided') return computeAntishipUnguided(calculator, context.table, inputs);
    if (calculator.engine === 'anti-radiation') return computeAntiRadiation(calculator, context.table, inputs);
    if (calculator.engine === 'ground-guided') return computeGroundGuided(calculator, context.table, context.choices, inputs, context.workflow);
    if (calculator.engine === 'torpedo-surface') return computeTorpedo(calculator, context.table, inputs);
    if (calculator.engine === 'army-resupply') return computeArmyResupply(calculator, context.table, inputs, context.rules);
    if (calculator.engine === 'asw-signature-search') return computeSignatureSearch(calculator, context.table, inputs);
    if (calculator.engine === 'asw-air-search') return computeAirSearch(calculator, { [calculator.table.tableId]: context.table, ...(context.extra || {}) }, inputs);
    if (calculator.engine === 'asw-attack') return computeAsw(context.table, inputs, false);
    if (calculator.engine === 'asw-submarine') return computeAsw(context.table, inputs, true);
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
    const rows = context.table && context.table.rowAxis ? context.table.rowAxis.values : ['0'];
    const probe = String(parseInt(String(rows[0]), 10) || 0);
    Object.entries(inputs.sides || {}).forEach(([sideId, v]) => {
      if (!result.sides[sideId] || result.sides[sideId].status !== 'incomplete') return;
      const missing = missingFields(calculator, v).map((d) => d.id);
      // Solo faltan tiradas (una o varias, p. ej. las dos del subsónico): se prueban todas.
      if (!missing.length || !missing.every((id) => /^roll/.test(id))) return;
      const probes = Object.fromEntries(missing.map((id) => [id, probe]));
      const trial = compute(calculator, context, { ...inputs, sides: { ...inputs.sides, [sideId]: { ...v, ...probes } } });
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
    if (!geometry || !side || (side.status !== 'ok' && side.status !== 'column')) return null;
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

  return { calculatorForNode, findKey, resolveChoices, fieldApplies, computeWvrRound, computeBvrAttack, computeGroundCloseCombat, computeAsw, computeSignatureSearch, computeAirSearch, computeTorpedo, computeArmyResupply, computeGroundGuided, computeAntiRadiation, computeAntishipGuidedFinal, computeAntishipUnguided, columnShiftFromEffects, compute, computeWithColumn, markRects, geometryFor };
});
