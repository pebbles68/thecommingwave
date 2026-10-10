// Grupo de misión aéreo compartido (roadmap Fase 11, «Modelar la composición del grupo de misión»).
// Lógica pura: un único registro de los dos bandos y sus unidades que los asistentes de interceptación aérea
// (Decision Book §7.16.1-§7.16.2) y de combate cercano WVR (§7.16.4) pueden cargar y guardar, para no teclear
// las mismas unidades en cada uno y para que la retirada o la eliminación de una unidad en un asistente
// llegue al siguiente. No hay modelo de mapa: todo lo introduce el jugador.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AirMissionGroup = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIDES = ['A', 'B'];
  const SCHEMA_VERSION = 1;
  // Estado de cada unidad en el combate. Solo «active» participa en un nuevo asistente.
  const STATUSES = Object.freeze([
    { value: 'active', label: 'En combate' },
    { value: 'withdrawn', label: 'Retirada' },
    { value: 'out', label: 'Fuera de combate' },
    { value: 'eliminated', label: 'Eliminada' }
  ]);
  const STATUS_VALUES = STATUSES.map((s) => s.value);

  let counter = 0;
  function newId() {
    counter += 1;
    return `g${Date.now().toString(36)}${counter}`;
  }

  function newUnit(fields) {
    return Object.assign({ id: newId(), name: '', airCombatValue: '', protection: '', electronic: '', network: 'no', ew: 'no', detected: 'no', status: 'active' }, fields || {});
  }

  function emptyGroup() {
    return {
      schemaVersion: SCHEMA_VERSION,
      sides: {
        A: { label: 'Bando A', groupType: '', eea: 'no', units: [] },
        B: { label: 'Bando B', groupType: '', eea: 'no', units: [] }
      }
    };
  }

  const yn = (v) => (v === 'yes' ? 'yes' : 'no');
  const text = (v) => (v === undefined || v === null ? '' : String(v));

  function normalizeUnit(u) {
    const o = u && typeof u === 'object' ? u : {};
    return {
      id: text(o.id) || newId(),
      name: text(o.name),
      airCombatValue: text(o.airCombatValue),
      protection: text(o.protection),
      electronic: text(o.electronic),
      network: yn(o.network),
      ew: yn(o.ew),
      detected: yn(o.detected),
      status: STATUS_VALUES.includes(o.status) ? o.status : 'active'
    };
  }

  // Cualquier valor guardado → grupo válido; lo que no se entiende vuelve al grupo vacío.
  function normalize(raw) {
    const base = emptyGroup();
    if (!raw || typeof raw !== 'object' || !raw.sides) return base;
    SIDES.forEach((k) => {
      const s = raw.sides[k];
      if (!s || typeof s !== 'object') return;
      base.sides[k] = {
        label: text(s.label) || base.sides[k].label,
        groupType: text(s.groupType),
        eea: yn(s.eea),
        units: Array.isArray(s.units) ? s.units.map(normalizeUnit) : []
      };
    });
    return base;
  }

  const clone = (g) => JSON.parse(JSON.stringify(g));

  function isEmpty(group) {
    return SIDES.every((k) => group.sides[k].units.length === 0);
  }

  function activeUnits(group, side) {
    return group.sides[side].units.filter((u) => u.status === 'active');
  }

  function counts(group) {
    const out = {};
    SIDES.forEach((k) => {
      const us = group.sides[k].units;
      out[k] = { total: us.length };
      STATUS_VALUES.forEach((st) => { out[k][st] = us.filter((u) => u.status === st).length; });
    });
    return out;
  }

  // Bandos tal como los espera el asistente WVR: las eliminadas no entran; retiradas y fuera de combate van
  // marcadas como salidas del BVR (no participan en el combate cercano).
  function toWvrSides(group) {
    const out = {};
    SIDES.forEach((k) => {
      const s = group.sides[k];
      out[k] = {
        label: s.label,
        groupType: s.groupType,
        eea: s.eea,
        units: s.units.filter((u) => u.status !== 'eliminated').map((u) => ({
          id: u.id, name: u.name, airCombatValue: u.airCombatValue, protection: u.protection,
          network: u.network, bvrOut: u.status === 'active' ? 'no' : 'yes'
        }))
      };
    });
    return out;
  }

  // Participantes tal como los espera el asistente de interceptación: solo las unidades en combate.
  function toInterceptState(group) {
    const sides = {};
    const units = [];
    SIDES.forEach((k) => {
      sides[k] = { label: group.sides[k].label, eea: group.sides[k].eea };
      activeUnits(group, k).forEach((u) => {
        units.push({ id: u.id, side: k, name: u.name, electronic: u.electronic, detected: u.detected, ew: u.ew, airToAir: 'yes', lowAltitude: 'no', sustainedFlown: 'no', transport: 'no' });
      });
    });
    return { sides, units };
  }

  // Inserta o actualiza (por id) una unidad del grupo con los campos dados.
  function upsertUnit(group, side, fields) {
    const units = group.sides[side].units;
    const existing = fields.id ? units.find((u) => u.id === fields.id) : null;
    if (existing) {
      Object.keys(fields).forEach((k) => { if (fields[k] !== undefined) existing[k] = fields[k]; });
      return existing;
    }
    const unit = normalizeUnit(Object.assign({}, fields));
    units.push(unit);
    return unit;
  }

  // Guarda en el grupo lo que el asistente de interceptación tiene (datos de bando y de cada unidad).
  function mergeIntercept(group, st) {
    const g = clone(group);
    SIDES.forEach((k) => {
      if (st.sides && st.sides[k]) {
        g.sides[k].label = text(st.sides[k].label) || g.sides[k].label;
        g.sides[k].eea = yn(st.sides[k].eea);
      }
    });
    (st.units || []).forEach((u) => {
      if (u.side !== 'A' && u.side !== 'B') return;
      if (!u.name && !u.electronic) return; // fila vacía
      upsertUnit(g, u.side, { id: u.id, name: u.name, electronic: text(u.electronic), detected: yn(u.detected), ew: yn(u.ew) });
    });
    return g;
  }

  // Guarda en el grupo lo que el asistente WVR tiene y su resultado: `outIds` = {A:[ids], B:[ids]} son las unidades que
  // el combate dejó fuera (salida de combate o eliminadas: la fuente del WVR no las distingue); pasan a «fuera de
  // combate» y el jugador puede marcar a mano «eliminada».
  function mergeWvr(group, sides, outIds) {
    const g = clone(group);
    SIDES.forEach((k) => {
      const s = sides[k];
      if (!s) return;
      g.sides[k].label = text(s.label) || g.sides[k].label;
      g.sides[k].groupType = text(s.groupType);
      g.sides[k].eea = yn(s.eea);
      (s.units || []).forEach((u) => {
        if (!u.name && !u.airCombatValue && !u.protection) return; // fila vacía
        const prev = g.sides[k].units.find((x) => x.id === u.id);
        let status = prev ? prev.status : 'active';
        if (u.bvrOut === 'yes' && status === 'active') status = 'out';
        if (u.bvrOut !== 'yes' && status !== 'eliminated') status = 'active';
        upsertUnit(g, k, { id: u.id, name: u.name, airCombatValue: text(u.airCombatValue), protection: text(u.protection), network: yn(u.network), status });
      });
      ((outIds && outIds[k]) || []).forEach((id) => {
        const unit = g.sides[k].units.find((x) => x.id === id);
        if (unit && unit.status === 'active') unit.status = 'out';
      });
    });
    return g;
  }

  function setStatus(group, side, unitId, status) {
    if (!STATUS_VALUES.includes(status)) return group;
    const g = clone(group);
    const unit = g.sides[side].units.find((u) => u.id === unitId);
    if (unit) unit.status = status;
    return g;
  }

  return { SIDES, STATUSES, SCHEMA_VERSION, newUnit, emptyGroup, normalize, isEmpty, activeUnits, counts, toWvrSides, toInterceptState, upsertUnit, mergeIntercept, mergeWvr, setStatus };
});
