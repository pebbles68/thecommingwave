// Motor puro del Ataque ASW por unidades de superficie y aéreas contra
// submarinos (roadmap Fase 13; data/workflows/10_ataque_asw_superficie_aereo.json
// + data/tables/page-29.json). Cita el Decision Book §9.17-§9.17.2
// (páginas 220-221) paso a paso; no hay "hoja de ayuda" con ejemplo resuelto,
// así que las pruebas verifican la mecánica contra la regla citada y contra
// valores leídos de la página 29 impresa (Tablas-de-combate 5.pdf).
//
// También cubre el ataque ASW de submarinos contra submarinos (página 30,
// `resolveSubmarineAswAttack`, Decision Book §9.13.2): la cabecera impresa
// "Firma del atacante 5+/4/0~3" es en realidad la clave de las posiciones
// P.4/P.3/P.2-1 de la página 29 — la fila depende de la PROFUNDIDAD, según
// confirmó el mantenedor el 2026-10-04 (ver docs/rules/known-ambiguities.md).
//
// Pasos (§9.17.2):
//   Paso 1  Firma (SIG) del objetivo; +1 si está "En Movimiento".
//   Paso 2  Profundidad del océano + Firma -> banda (1-3) = fila de etiquetas
//           de Valor de Ataque ASW de la cabecera de la tabla.
//   Paso 3  1d10 x Valor de Ataque ASW -> Puntos de Impacto.
//   Paso 4  Si los Puntos de Impacto absorbidos >= Valor de Protección del
//           submarino, se hunde inmediatamente.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AswAttackEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class AswAttackError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'AswAttackError';
      this.code = code;
    }
  }

  // Elegibilidad y alcance (§9.17.1, y la tabla de la página 29). Solo evalúa
  // las condiciones que las fuentes declaran de forma explícita; devuelve
  // `eligible` y los motivos legibles (sin lanzar).
  function checkEligibility({ attackerType, adjacentTarget, targetInEnemyCapZone, attackerInEnemyCapZone, adjacentCapability }) {
    const reasons = [];
    if (attackerType === 'air') {
      if (targetInEnemyCapZone === 'yes') {
        reasons.push('Una unidad aérea no puede atacar objetivos dentro de una zona de patrulla aérea enemiga (Decision Book §9.17.1; Tablas-de-combate 5.pdf p.29).');
      }
      return { eligible: reasons.length === 0, reasons, rangeNote: 'Las Aeronaves de Patrulla Marítima (MPA) atacan submarinos en su propia casilla y en su Zona Central, y regresan a su base inmediatamente después del ataque (§9.17, §9.17.1).' };
    }
    if (attackerType === 'surface') {
      if (adjacentTarget === 'yes') {
        if (adjacentCapability !== 'air_search' && adjacentCapability !== 'carrier') {
          reasons.push('Para atacar un objetivo en un hex adyacente la unidad de superficie necesita Valor de Detección Aérea (ASW) ≥ 1, o "-" con un Portaaviones en su formación (§9.17.1 condición 1).');
        }
        if (attackerInEnemyCapZone === 'yes' || targetInEnemyCapZone === 'yes') {
          reasons.push('Para atacar un objetivo adyacente, tanto la casilla de la unidad de superficie como la del objetivo deben estar fuera de una Zona de Patrulla Aérea enemiga (§9.17.1 condición 2).');
        }
      }
      return { eligible: reasons.length === 0, reasons, rangeNote: 'Normalmente una unidad de superficie solo ataca unidades en su misma casilla (§9.17.1).' };
    }
    throw new AswAttackError('invalid_attacker_type', `Tipo de atacante desconocido: "${attackerType}" (se esperaba "surface" o "air").`);
  }

  // Pasos 1-2: Firma efectiva y banda de la cabecera. `bands` es
  // `columnAxis.signatureBands[posición]` (3 rangos de Firma); devuelve el
  // índice 0-2 y la clave de esquema de columna `band_{n}`.
  function selectBand(table, tableEngine, { position, signature, targetMoving }) {
    const bands = (table.columnAxis.signatureBands || {})[position];
    if (!bands) throw new AswAttackError('unknown_position', `Posición/profundidad desconocida: "${position}".`);
    const effectiveSignature = Number(signature) + (targetMoving ? 1 : 0);
    if (Number.isNaN(effectiveSignature) || effectiveSignature < 0) {
      throw new AswAttackError('invalid_signature', 'El Valor de Firma del objetivo debe ser un número ≥ 0.');
    }
    const match = tableEngine.matchAxisIndex(bands, effectiveSignature);
    if (match.index === -1) {
      throw new AswAttackError('signature_out_of_range', `El Valor de Firma ${effectiveSignature} no cae en ninguna banda de la posición ${position} (${bands.join(', ')}).`);
    }
    return { effectiveSignature, bandIndex: match.index, bandLabel: bands[match.index], columnScheme: `band_${match.index + 1}`, bands };
  }

  // Pasos 1-4. Un Valor de Ataque ASW menor que 1 no llega a ninguna columna
  // de las bandas 1-2 (y "·" no es una columna elegible): el ataque no tiene
  // efecto, sin inventar una celda.
  function resolveAswAttack(table, tableEngine, { position, signature, targetMoving, aswAttackValue, roll, targetProtection }) {
    const band = selectBand(table, tableEngine, { position, signature, targetMoving });
    const attackValue = Number(aswAttackValue);
    if (Number.isNaN(attackValue) || attackValue < 0) {
      throw new AswAttackError('invalid_attack_value', 'El Valor de Ataque ASW debe ser un número ≥ 0.');
    }
    const base = { band, attackValue, notes: [] };
    if (attackValue < 1) {
      return Object.assign(base, { cell: null, impacts: 0, noEffect: true, sunk: null,
        notes: ['Valor de Ataque ASW menor que 1: no llega a ninguna columna de la tabla — sin impactos.'] });
    }
    const cell = tableEngine.resolveCell(table, Number(roll), attackValue, { columnScheme: band.columnScheme });
    const impacts = cell.rawCell === '.' ? 0 : Number(cell.rawCell);
    if (Number.isNaN(impacts)) throw new AswAttackError('unparseable_cell', `Celda de la tabla ASW no reconocida: "${cell.rawCell}".`);
    let sunk = null;
    if (targetProtection !== undefined && targetProtection !== null && targetProtection !== '' && !Number.isNaN(Number(targetProtection))) {
      sunk = impacts >= Number(targetProtection) && impacts > 0;
    }
    return Object.assign(base, { cell, impacts, noEffect: impacts === 0, sunk });
  }


  // Ataque con torpedos de un submarino contra un submarino expuesto en su
  // misma casilla (§9.13.2; Tablas-de-combate 5.pdf p.30). Misma elección de
  // banda que el ataque de superficie/aéreo (profundidad + Firma, +1 En
  // Movimiento — §9.17.2 Pasos 1-2, aplicable a todo Ataque ASW). Reglas
  // propias: fila "NO DISPARAR" (tirada 0-3: sin búsqueda posterior);
  // torpedo de HEXÁGONO sin asterisco (*) -> el ataque no tiene efecto
  // (§9.13.2 Paso 3); el de círculo no tiene restricción por asterisco.
  function resolveSubmarineAswAttack(table, tableEngine, { position, signature, targetMoving, torpedoValue, torpedoType, roll, targetProtection }) {
    if (torpedoType !== 'circle' && torpedoType !== 'hexagon') {
      throw new AswAttackError('invalid_torpedo_type', `Tipo de torpedo desconocido: "${torpedoType}" (se esperaba "circle" o "hexagon").`);
    }
    const band = selectBand(table, tableEngine, { position, signature, targetMoving });
    const attackValue = Number(torpedoValue);
    if (Number.isNaN(attackValue) || attackValue < 0) {
      throw new AswAttackError('invalid_attack_value', 'El Valor de Ataque con Torpedos debe ser un número ≥ 0.');
    }
    const base = { band, attackValue, torpedoType, notes: [], noFire: false, hexagonNoEffect: false };
    if (attackValue < 1) {
      return Object.assign(base, { cell: null, impacts: 0, noEffect: true, sunk: null,
        notes: ['Valor de Ataque con Torpedos menor que 1: no llega a ninguna columna de la tabla — sin impactos.'] });
    }
    const cell = tableEngine.resolveCell(table, Number(roll), attackValue, { columnScheme: band.columnScheme });
    if (cell.rawCell === 'NO_DISPARAR') {
      return Object.assign(base, { cell, impacts: 0, noEffect: true, noFire: true, sunk: null,
        notes: ['NO DISPARAR: no se realiza búsqueda tras el ataque (Tablas-de-combate 5.pdf p.30).'] });
    }
    const match = /^(\d+)(\*)?$/.exec(String(cell.rawCell));
    const tableImpacts = cell.rawCell === '.' ? 0 : (match ? Number(match[1]) : NaN);
    if (Number.isNaN(tableImpacts)) throw new AswAttackError('unparseable_cell', `Celda de la tabla ASW no reconocida: "${cell.rawCell}".`);
    const star = Boolean(match && match[2]);
    let impacts = tableImpacts;
    const notes = [];
    let hexagonNoEffect = false;
    if (torpedoType === 'hexagon' && !star) {
      hexagonNoEffect = impacts > 0;
      impacts = 0;
      notes.push('Torpedo de hexágono: solo tiene efecto cuando el resultado de la tabla contiene "*" (§9.13.2 Paso 3).');
    }
    let sunk = null;
    if (targetProtection !== undefined && targetProtection !== null && targetProtection !== '' && !Number.isNaN(Number(targetProtection))) {
      sunk = impacts >= Number(targetProtection) && impacts > 0;
    }
    return Object.assign(base, { cell, tableImpacts, star, impacts, noEffect: impacts === 0, hexagonNoEffect, notes, sunk });
  }

  return { AswAttackError, checkEligibility, selectBand, resolveAswAttack, resolveSubmarineAswAttack };
});
