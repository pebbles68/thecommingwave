// Cálculos dentro de una pregunta del asistente de combate (Fase 25). Cada cálculo declarado en
// data/routing/decision-graph-calculators.json se resuelve aquí reutilizando el motor ya probado de su wizard, y
// devuelve por bando la columna, la fila y la celda elegidas (índices de data/tables/) más la explicación. La posición
// de esas columnas y filas en la página real sale de data/image-hotspots/table-pages.json (`markRects`). Sin DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./air-combat-wvr-engine.js'), require('./air-combat-bvr-engine.js'), require('./ground-close-combat-engine.js'), require('./table-engine.js'));
  else root.DecisionGraphCalculators = factory(root.AirCombatWvrEngine, root.AirCombatBvrEngine, root.GroundCloseCombatEngine, root.TableEngine);
})(typeof self !== 'undefined' ? self : this, function (AirCombatWvrEngine, AirCombatBvrEngine, GroundCloseCombatEngine, TableEngine) {
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
    return ((findKey(workflow, src.key) || {})[src.list]) || [];
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

  function compute(calculator, context, inputs) {
    if (calculator.engine === 'ground-close-combat') return computeGroundCloseCombat(context.table, context.choices, inputs, context.extra && context.extra['ground-close-combat-electronic-warfare']);
    if (calculator.engine === 'wvr-round') return computeWvrRound(context.table, context.choices, inputs);
    if (calculator.engine === 'bvr-attack') return computeBvrAttack(context.table, context.choices, inputs);
    throw new Error(`Cálculo desconocido: ${calculator.engine}`);
  }

  // Rectángulos normalizados (0-1) que marcan en la página real la columna, la fila y la celda de un bando.
  function markRects(geometry, side) {
    if (!geometry || !side || side.status !== 'ok') return null;
    const band = (geometry.headerBands || {})[side.columnScheme];
    const x0 = geometry.columnEdges[side.columnIndex];
    const x1 = geometry.columnEdges[side.columnIndex + 1];
    const y0 = geometry.rowEdges[side.rowIndex];
    const y1 = geometry.rowEdges[side.rowIndex + 1];
    const bottom = geometry.rowEdges[geometry.rowEdges.length - 1];
    const left = geometry.frame[0];
    return {
      header: band ? { x: x0, y: band[0], w: x1 - x0, h: band[1] - band[0] } : null,
      column: { x: x0, y: band ? band[0] : geometry.rowEdges[0], w: x1 - x0, h: bottom - (band ? band[0] : geometry.rowEdges[0]) },
      row: { x: left, y: y0, w: geometry.columnEdges[geometry.columnEdges.length - 1] - left, h: y1 - y0 },
      cell: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    };
  }

  function geometryFor(hotspots, page, tableId) {
    const n = Number(String(page).match(/\d+/)[0]);
    return ((hotspots && hotspots.tables) || []).find((t) => t.page === n && t.tableId === tableId) || null;
  }

  return { calculatorForNode, findKey, resolveChoices, computeWvrRound, computeBvrAttack, computeGroundCloseCombat, compute, markRects, geometryFor };
});
