// Motor puro del Ataque Submarino con Torpedos contra unidades de superficie
// (roadmap Fase 12; data/workflows/09_ataque_torpedos_superficie.json +
// data/tables/page-27.json). Cita directamente el Decision Book §9.13.1
// (páginas 210-212) paso a paso — no existe una "hoja de ayuda" con ejemplo
// resuelto para este ataque, así que las pruebas de este módulo verifican la
// mecánica contra la regla citada y contra valores leídos de la tabla impresa
// (Tablas-de-combate 5.pdf p.27), no contra una partida real.
//
// Pasos del Decision Book §9.13.1:
//   Paso 1  Posición/estado del submarino -> qué fila de cabecera de la tabla
//           (Expuesto / Oculto / "cualquiera") => `selectColumnScheme`.
//   Paso 2  Tirar 1d10; si TODAS las unidades de superficie del objetivo tienen
//           Velocidad impresa <= 3, el dado se ignora y el resultado es 9.
//   Paso 3  Cruzar Valor de Ataque del Torpedo x tirada => Puntos de Impacto
//           ("·" / "Ataque Fallido" = sin efecto; "NO ATACÓ" = no atacó).
//   Paso 4  Tipo de torpedo:
//             CÍRCULO (moderno): si hay asterisco (*), tirar 1d10 otra vez y
//               quedarse con el MENOR entre los Puntos de Impacto originales y
//               el nuevo dado (si son iguales, se mantienen).
//             HEXÁGONO (antiguo): si la tirada inicial fue 9, tirar otra vez y
//               quedarse con el menor; con asterisco (y sin 9) el ataque no
//               tiene efecto; si no se da ninguno de los dos casos, los Puntos
//               de Impacto solo los absorben unidades de superficie generales.
//   Paso 5  Resolver el resultado (hundimiento / daño) — depende de la hoja de
//           flota del jugador; este módulo solo calcula los Puntos de Impacto
//           finales y las restricciones de absorción, no asigna a buques.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TorpedoAttackEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class TorpedoAttackError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'TorpedoAttackError';
      this.code = code;
    }
  }

  // Paso 1. Devuelve la clave de `columnAxis.alternateLabelSets` de la tabla
  // (page-27.json): 'exposed' u 'hidden' si el hex objetivo tiene una unidad de
  // superficie con Búsqueda por Diferencia de Firma o el submarino está en la
  // Zona Central de un MPA; `undefined` (esquema canónico = fila "cualquiera")
  // en cualquier otro caso, sea cual sea el estado del submarino.
  function selectColumnScheme({ aswContext, attackerState }) {
    if (aswContext !== 'surface_search_or_mpa') return undefined;
    if (attackerState === 'exposed') return 'exposed';
    if (attackerState === 'hidden') return 'hidden';
    throw new TorpedoAttackError('invalid_attacker_state', `Estado del submarino atacante desconocido: "${attackerState}" (se esperaba "exposed" u "hidden").`);
  }

  // Interpreta el contenido de una celda de la tabla: ".", "NO_ATACO", "N" o "N*".
  function parseImpactCell(rawCell) {
    if (rawCell === 'NO_ATACO') return { kind: 'no_attack', impacts: 0, star: false };
    if (rawCell === '.') return { kind: 'none', impacts: 0, star: false };
    const match = /^(\d+)(\*)?$/.exec(String(rawCell));
    if (!match) throw new TorpedoAttackError('unparseable_cell', `Celda de la tabla de torpedos no reconocida: "${rawCell}".`);
    return { kind: 'impacts', impacts: Number(match[1]), star: Boolean(match[2]) };
  }

  // Pasos 2-4. `followUpRoll` es la segunda tirada de 1d10 (solo hace falta
  // cuando el resultado la exige; si no se ha facilitado todavía, el resultado
  // trae `needsFollowUpRoll: true` y `finalImpacts: null` en vez de lanzar).
  function resolveTorpedoAttack(table, tableEngine, { columnScheme, torpedoValue, roll, allTargetsSpeedLe3, torpedoType, followUpRoll }) {
    if (torpedoType !== 'circle' && torpedoType !== 'hexagon') {
      throw new TorpedoAttackError('invalid_torpedo_type', `Tipo de torpedo desconocido: "${torpedoType}" (se esperaba "circle" o "hexagon").`);
    }
    if (!(Number(torpedoValue) >= 1)) {
      throw new TorpedoAttackError('invalid_torpedo_value', 'El Valor de Ataque del Torpedo debe ser 1 o mayor.');
    }
    const rollIgnored = Boolean(allTargetsSpeedLe3);
    const effectiveRoll = rollIgnored ? 9 : Number(roll);
    const cell = tableEngine.resolveCell(table, effectiveRoll, Number(torpedoValue), { columnScheme });
    const parsed = parseImpactCell(cell.rawCell);

    const base = { cell, parsed, effectiveRoll, rollIgnored, torpedoType, originalImpacts: parsed.impacts, notes: [] };

    if (parsed.kind === 'no_attack') {
      return Object.assign(base, { outcome: 'no_attack', finalImpacts: 0, needsFollowUpRoll: false, generalUnitsOnly: false,
        notes: ['No atacó: no realiza búsqueda posterior al ataque y no se consume munición (Tablas-de-combate 5.pdf p.27, "Resultado especial").'] });
    }
    if (parsed.kind === 'none') {
      return Object.assign(base, { outcome: 'no_effect', finalImpacts: 0, needsFollowUpRoll: false, generalUnitsOnly: false,
        notes: ['Sin Puntos de Impacto: el ataque no tiene efecto (§9.13.1 Paso 3).'] });
    }

    const keepLowerOf = (needsRoll) => {
      if (followUpRoll === undefined || followUpRoll === null || followUpRoll === '') {
        return Object.assign(base, { outcome: 'pending_follow_up', finalImpacts: null, needsFollowUpRoll: true, generalUnitsOnly: false, notes: [needsRoll] });
      }
      const second = Number(followUpRoll);
      const finalImpacts = Math.min(parsed.impacts, second);
      return Object.assign(base, { outcome: 'resolved', finalImpacts, followUpRoll: second, needsFollowUpRoll: false, generalUnitsOnly: false,
        notes: [`${needsRoll} Segundo dado ${second} frente a ${parsed.impacts} Punto(s) de Impacto originales → se toma el menor: ${finalImpacts}.`] });
    };

    if (torpedoType === 'circle') {
      if (parsed.star) return keepLowerOf('Torpedo de círculo con asterisco (*): se tira 1d10 de nuevo (§9.13.1 Paso 4).');
      return Object.assign(base, { outcome: 'resolved', finalImpacts: parsed.impacts, needsFollowUpRoll: false, generalUnitsOnly: false,
        notes: ['Torpedo de círculo sin asterisco: los Puntos de Impacto se mantienen (§9.13.1 Paso 4).'] });
    }

    // Hexágono
    if (effectiveRoll === 9) {
      return keepLowerOf(`Torpedo de hexágono con tirada inicial 9${rollIgnored ? ' (automática por Velocidad impresa ≤ 3)' : ''}: se tira 1d10 de nuevo (§9.13.1 Paso 4).`);
    }
    if (parsed.star) {
      return Object.assign(base, { outcome: 'no_effect', finalImpacts: 0, needsFollowUpRoll: false, generalUnitsOnly: false,
        notes: ['Torpedo de hexágono con asterisco (*) y tirada distinta de 9: este ataque no tiene efecto (§9.13.1 Paso 4).'] });
    }
    // Se aplican las dos reglas (confirmado por el mantenedor, 2026-10-07): solo
    // unidades de superficie generales (§9.13.1 Paso 4) y solo un buque (página 27),
    // aunque el resultado sea otro número.
    return Object.assign(base, { outcome: 'resolved', finalImpacts: parsed.impacts, needsFollowUpRoll: false, generalUnitsOnly: true, singleShipOnly: true,
      notes: ['Torpedo de hexágono sin 9 ni asterisco: los Puntos de Impacto solo pueden ser absorbidos por unidades de superficie generales, no por unidades especiales/protegidas (§9.13.1 Paso 4), y solo puede ser impactado un buque aunque el resultado sea otro número (página 27).'] });
  }

  return {
    TorpedoAttackError,
    selectColumnScheme,
    parseImpactCell,
    resolveTorpedoAttack
  };
});
