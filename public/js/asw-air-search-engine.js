// Motor puro de la Búsqueda Aérea ASW (roadmap Fase 13; data/workflows/
// 13_busqueda_asw_apoyo.json + data/tables/page-34.json). Cita el Decision Book
// §9.14.3-§9.14.4 (eventos) y §9.15.4 (Pasos 1-5, pp. 214-219); no hay "hoja de
// ayuda" con ejemplo resuelto, así que las pruebas verifican la mecánica contra
// la regla citada y contra valores leídos de la página 34 impresa
// (Tablas-de-combate 5.pdf).
//
// La Búsqueda por Diferencia de Firma (página 33) está en
// asw-signature-search-engine.js, que reutiliza `parseDiscoveryRange` de aquí.
//
//   Paso 1  Sumar los Valores de Detección Aérea de las unidades que pueden
//           buscar; condiciones que lo impiden (devuelve ids de restricción,
//           cuyo texto vive en el workflow).
//   Paso 2  El evento elige la tabla (el workflow declara `airSearchTable`).
//   Paso 3  Firma del objetivo (+1 si "En Movimiento"), leída en la columna
//           P.4/P.3/P.2 de la tabla según la profundidad.
//   Paso 4  Valor total de detección x Firma -> rango de descubrimiento.
//   Paso 5  1d10: dentro del rango = éxito (el submarino queda Expuesto o falla
//           su Evasión); "." o fuera del rango = fallo automático.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AswAirSearchEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class AswAirSearchError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'AswAirSearchError';
      this.code = code;
    }
  }

  // Eventos en los que una formación de superficie a Alta Velocidad no puede
  // buscar: Rutina, Movimiento y Emboscada (página 28; confirmado por el
  // mantenedor, 2026-10-07: «en alta velocidad no puede buscar»).
  const HIGH_SPEED_EXCLUDED_EVENTS = ['routine', 'movement', 'pre_ambush'];

  // Condiciones del objetivo que impiden la búsqueda (Paso 1). Devuelve ids de
  // `restrictions` del workflow.
  function checkTargetRestrictions({ event, targetInEnemyCapZone, depth }) {
    const blocking = [];
    if (targetInEnemyCapZone === 'yes' || targetInEnemyCapZone === true) blocking.push('target_in_enemy_cap_zone');
    if (event === 'routine' && depth === 'P4') blocking.push('routine_no_deep_water');
    return { allowed: blocking.length === 0, blocking };
  }

  // Suma el Valor de Detección Aérea de las unidades que pueden buscar. Cada
  // unidad: { airValue, highSpeed, inEnemyCapZone }. Excluye (con su id de
  // restricción) las que están en una zona de patrulla aérea enemiga y las de
  // Alta Velocidad en búsquedas de Rutina, Movimiento y Antes de la Emboscada
  // (§9.15.4 Paso 1 y página 28).
  function sumAirValue(units, event) {
    let total = 0;
    const contributions = units.map((unit, index) => {
      const airValue = Number(unit.airValue);
      if (unit.airValue === '' || unit.airValue === undefined || Number.isNaN(airValue) || airValue < 0) {
        throw new AswAirSearchError('invalid_air_value', `El Valor de Detección Aérea de la unidad ${index + 1} debe ser un número ≥ 0.`);
      }
      const highSpeed = unit.highSpeed === true || unit.highSpeed === 'yes';
      const inCap = unit.inEnemyCapZone === true || unit.inEnemyCapZone === 'yes';
      let excludedBy = null;
      if (inCap) excludedBy = 'unit_in_enemy_cap_zone';
      else if (highSpeed && HIGH_SPEED_EXCLUDED_EVENTS.includes(event)) excludedBy = 'high_speed_excluded';
      if (!excludedBy) total += airValue;
      return { index, airValue, highSpeed, inEnemyCapZone: inCap, excludedBy, contributes: !excludedBy };
    });
    return { total, contributions };
  }

  // Interpreta una celda de la tabla: "." (sin detección), "N" (solo una tirada
  // de N) o "N+" (tirada de N o más). Una tirada de 1d10 va de 0 a 9.
  function parseDiscoveryRange(rawCell) {
    if (rawCell === '.') return { kind: 'none', min: null };
    const match = /^(\d)(\+)?$/.exec(String(rawCell));
    if (!match) throw new AswAirSearchError('unparseable_cell', `Celda de búsqueda aérea ASW no reconocida: "${rawCell}".`);
    const n = Number(match[1]);
    return { kind: match[2] ? 'atLeast' : 'exact', min: n, max: match[2] ? 9 : n };
  }

  // Pasos 3-5. `table` es la tabla ya elegida por el evento; `depth` 'P4'|'P3'|'P2'.
  function resolveAirSearch(table, tableEngine, { depth, signature, targetMoving, totalAirValue, roll }) {
    const sig = Number(signature);
    if (signature === '' || signature === undefined || Number.isNaN(sig) || sig < 0) {
      throw new AswAirSearchError('invalid_signature', 'El Valor de Firma del objetivo debe ser un número ≥ 0.');
    }
    const effectiveSignature = sig + (targetMoving ? 1 : 0);
    const total = Number(totalAirValue);
    if (Number.isNaN(total) || total < 0) {
      throw new AswAirSearchError('invalid_air_value', 'El Valor de Detección Aérea total debe ser un número ≥ 0.');
    }
    const base = { effectiveSignature, totalAirValue: total, depth, notes: [] };
    if (total < 1) {
      return Object.assign(base, { cell: null, range: null, success: false, noSearch: true,
        notes: ['Valor de Detección Aérea total menor que 1: no llega a ninguna columna de la tabla — la búsqueda falla automáticamente.'] });
    }
    const cell = tableEngine.resolveCell(table, effectiveSignature, total, { rowScheme: depth });
    const range = parseDiscoveryRange(cell.rawCell);
    const natural = Number(roll);
    const success = range.kind !== 'none' && natural >= range.min && natural <= range.max;
    return Object.assign(base, { cell, range, roll: natural, success, noSearch: false });
  }

  return { AswAirSearchError, checkTargetRestrictions, sumAirValue, parseDiscoveryRange, resolveAirSearch };
});
