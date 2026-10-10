// Motor puro de la Asignación de Objetivos del Combate BVR y de la retirada
// previa al BVR en una Interceptación de Combate Aéreo (roadmap Fase 11;
// data/workflows/05_combate_aereo.json, `interceptionRules`). Cita el
// Decision Book §7.16.1 (asignación) y §7.16.2 (quién puede retirarse antes
// del BVR), pp. 143-144. Sin tabla: es orden y emparejamiento.
//
//   §7.16.1  Si un solo bando tiene escolta electrónica (EEA), ese bando elige
//            los objetivos de sus unidades. Si no (ambos o ninguno): primero
//            las no detectadas, luego las detectadas; dentro de cada grupo,
//            Valor Electrónico más alto primero; empate entre bandos -> el que
//            inició el combate. Se puede renunciar. Cada avión un solo
//            oponente; un avión ya emparejado no se elige ni elige. Cuando todo
//            el bando menos numeroso está emparejado, el resto no combate BVR.
//   §7.10.4  Interceptación de penetración: si el bando que penetra tiene EEA y
//            el interceptor no, el avión EW del que penetra elige un objetivo
//            para su BVR antes que nadie; el interceptor asigna después. Con EEA
//            en ambos, sin efecto adicional. (El resto del orden y el caso
//            "solo el interceptor tiene EEA" no los fija la fuente: se usa la
//            prioridad de §7.16.1.)
//   §7.16.2  Retirada inmediata de unidades sin misión aire-aire, salvo:
//            objetivo del BVR, baja altitud, Vuelo Sostenido "Volado", y
//            grupo de Transporte/Suministros con alguna unidad como objetivo.
//
// Lo que la fuente no fija se deja visible en vez de decidirlo: empate de
// Valor Electrónico dentro de un mismo bando (`tieWithinSide`, se respeta el
// orden en que el jugador las listó) y si el bando sin EEA llega a elegir
// cuando el bando con EEA renuncia (no: solo elige el bando con EEA).
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AirInterceptTargetsEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class AirInterceptTargetsError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'AirInterceptTargetsError';
      this.code = code;
    }
  }

  const other = (side) => (side === 'A' ? 'B' : 'A');

  function toNumber(value, label) {
    const n = Number(value);
    if (value === '' || value === undefined || value === null || Number.isNaN(n)) {
      throw new AirInterceptTargetsError('invalid_number', `${label} debe ser un número.`);
    }
    return n;
  }

  // Quién elige: 'eea' con el bando que la tiene (interceptación de combate
  // aéreo), 'eea_penetration' (§7.10.4: en una interceptación de penetración
  // solo el avión EW del bando que penetra elige primero, y solo si el
  // interceptor no tiene escolta), o 'priority'. Sin `context` se asume
  // interceptación de combate aéreo.
  function selectionMode(eeaA, eeaB, ctx) {
    const context = (ctx && ctx.context) || 'air_combat';
    if (context === 'penetration') {
      const penetrator = ctx.penetratorSide;
      const penetratorEea = penetrator === 'A' ? eeaA : (penetrator === 'B' ? eeaB : false);
      const interceptorEea = penetrator === 'A' ? eeaB : (penetrator === 'B' ? eeaA : false);
      if (penetratorEea && !interceptorEea) return { mode: 'eea_penetration', side: penetrator };
      return { mode: 'priority', side: null };
    }
    if (eeaA && !eeaB) return { mode: 'eea', side: 'A' };
    if (eeaB && !eeaA) return { mode: 'eea', side: 'B' };
    return { mode: 'priority', side: null };
  }

  // Orden de elección. `units` = [{id, side, electronic, detected}] en el
  // orden en que el jugador las listó. En modo EEA solo eligen las unidades de
  // ese bando, en el orden listado (la fuente no fija otro).
  function selectionOrder(units, { eeaA, eeaB, initiatorSide, context, penetratorSide }) {
    const mode = selectionMode(eeaA, eeaB, { context, penetratorSide });
    if (mode.mode === 'eea') {
      return { mode, order: units.filter((u) => u.side === mode.side).map((u) => ({ id: u.id, tier: null, tieWithinSide: false })) };
    }
    // §7.10.4: el avión EW del bando que penetra elige primero (un objetivo
    // para su propio BVR); el resto sigue la prioridad de §7.16.1.
    const ewFirst = mode.mode === 'eea_penetration' ? units.filter((u) => u.side === mode.side && u.ew) : [];
    const rest = units.filter((u) => !ewFirst.includes(u));
    const indexed = rest.map((u, i) => ({ u, i, ev: toNumber(u.electronic, `El Valor Electrónico de ${u.name || u.id}`) }));
    const tierOf = (x) => (x.u.detected ? 2 : 1);
    indexed.sort((x, y) => {
      if (tierOf(x) !== tierOf(y)) return tierOf(x) - tierOf(y);
      if (x.ev !== y.ev) return y.ev - x.ev;
      if (x.u.side !== y.u.side) return x.u.side === initiatorSide ? -1 : 1;
      return x.i - y.i;
    });
    const order = ewFirst.map((u) => ({ id: u.id, tier: 0, tieWithinSide: false })).concat(indexed.map((x) => ({
      id: x.u.id,
      tier: tierOf(x),
      tieWithinSide: indexed.some((y) => y !== x && tierOf(y) === tierOf(x) && y.ev === x.ev && y.u.side === x.u.side)
    })));
    return { mode, order };
  }

  // Recorre el orden aplicando las elecciones ya hechas (`choices` = lista de
  // {chooserId, targetId|null}; null = renuncia). Devuelve las parejas, quién
  // elige ahora (o null si ha terminado) y qué unidades no combaten en BVR.
  function applySelections(units, order, choices) {
    const byId = Object.fromEntries(units.map((u) => [u.id, u]));
    const count = { A: units.filter((u) => u.side === 'A').length, B: units.filter((u) => u.side === 'B').length };
    const smaller = count.A === count.B ? null : (count.A < count.B ? 'A' : 'B');
    const paired = new Map();
    const passed = new Set();
    const pairs = [];
    let choiceIdx = 0;
    const smallerDone = () => {
      const sides = smaller ? [smaller] : ['A', 'B'];
      return sides.some((s) => count[s] > 0 && units.filter((u) => u.side === s).every((u) => paired.has(u.id)));
    };
    let next = null;
    for (const entry of order) {
      if (smallerDone()) break;
      if (paired.has(entry.id)) continue;
      const chooser = byId[entry.id];
      const available = units.filter((u) => u.side === other(chooser.side) && !paired.has(u.id));
      if (!available.length) continue;
      const choice = choices[choiceIdx];
      if (!choice) { next = { chooserId: chooser.id, available: available.map((u) => u.id) }; break; }
      if (choice.chooserId !== chooser.id) throw new AirInterceptTargetsError('out_of_order', 'La elección no corresponde a la unidad a la que le toca elegir.');
      choiceIdx += 1;
      if (choice.targetId === null) { passed.add(chooser.id); continue; }
      if (!available.some((u) => u.id === choice.targetId)) throw new AirInterceptTargetsError('invalid_target', 'Ese objetivo ya tiene oponente o es del mismo bando.');
      paired.set(chooser.id, choice.targetId);
      paired.set(choice.targetId, chooser.id);
      pairs.push({ chooserId: chooser.id, targetId: choice.targetId });
    }
    const done = next === null;
    return {
      pairs,
      next,
      done,
      passed: [...passed],
      targetedIds: pairs.map((p) => p.targetId),
      nonParticipants: done ? units.filter((u) => !paired.has(u.id)).map((u) => u.id) : []
    };
  }

  // §7.16.2: ¿puede retirarse antes del BVR? Devuelve el motivo que lo impide
  // (clave de `preBvrWithdrawal.exceptions`) o 'airToAir', o null si puede.
  function preBvrWithdrawalBlock(unit, { targetedIds, transportGroupTargeted }) {
    if (unit.airToAir) return 'airToAir';
    if (targetedIds.includes(unit.id)) return 'targeted';
    if (unit.lowAltitude) return 'lowAltitude';
    if (unit.sustainedFlown) return 'sustainedFlown';
    if (unit.transport && transportGroupTargeted[unit.side]) return 'transportGroup';
    return null;
  }

  return { AirInterceptTargetsError, selectionMode, selectionOrder, applySelections, preBvrWithdrawalBlock };
});
