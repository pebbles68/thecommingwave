// Motor puro de la Resolución del Resultado del Ataque Terrestre (roadmap Fase 9;
// data/rules/ground-attack-results.json). Cita el Decision Book §5.15.1-§5.15.3
// (pp. 83-87) y las notas de efectos de las páginas 6 y 9 de Tablas-de-combate 5.pdf.
// Parte de los Puntos de Impacto finales ya obtenidos en la tabla de resolución.
//
//   §5.15.1  Unidad terrestre. Ataque normal: impactos >= (Protección + Terreno)
//            -> 1 punto de daño y -1 de fuerza (máximo 1 por ataque). Persecución
//            Aérea: floor(impactos / Protección) puntos de daño, sin límite y sin
//            terreno. Sin terreno también en Interdicción Aérea y ARM.
//   §5.15.2  Puerto: floor(impactos al puerto / Protección del puerto) efectos de
//            "Instalación Paralizada" (munición y combustible -1 por efecto);
//            buques: superficie -> 1 punto de daño por impacto; submarino -> destruido
//            por impacto; cada buque elegido absorbe al menos 1.
//   §5.15.3  Aeródromo. Pista: floor(impactos / 2) niveles, mínimo E. Apron: Protección
//            del aeródromo (o 1) según capacidad de hangares; cada unidad absorbe hasta
//            igualar su Protección y sufre 1 punto de daño (se da la vuelta, o es
//            eliminada si ya estaba dañada / no tiene lado dañado); el resto, si es
//            menor que la Protección de cualquier unidad restante, se ignora.
//            Logística (opcional): floor(impactos / 2) puntos de Preparación, mínimo 0.
//
// Sin ejemplo resuelto en el reglamento salvo el de Protección 7 + Terreno 3 = 10;
// las pruebas verifican la mecánica contra la regla citada.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GroundAttackResultEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class GroundAttackResultError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'GroundAttackResultError';
      this.code = code;
    }
  }

  function count(value, label, min) {
    const n = Number(value);
    if (value === '' || value === undefined || value === null || Number.isNaN(n) || !Number.isInteger(n) || n < (min === undefined ? 0 : min)) {
      throw new GroundAttackResultError('invalid_number', `${label} debe ser un número entero ≥ ${min === undefined ? 0 : min}.`);
    }
    return n;
  }

  // §5.15.1. `kind`: 'normal' | 'no_terrain' | 'air_pursuit'; `terrainApplies` viene
  // de `groundUnit.attackKinds` del JSON de reglas.
  function resolveGroundUnitHit({ impacts, protection, terrain, kind, terrainApplies }) {
    const imp = count(impacts, 'Los Puntos de Impacto');
    const pro = count(protection, 'El Valor de Protección', 1);
    const ter = terrainApplies ? count(terrain === '' || terrain === undefined ? 0 : terrain, 'El Valor de Terreno') : 0;
    const effectiveProtection = pro + ter;
    if (kind === 'air_pursuit') {
      const damage = Math.floor(imp / pro);
      return { kind, impacts: imp, protection: pro, terrain: 0, effectiveProtection: pro, damage, forceLoss: damage, capped: false };
    }
    const damage = imp >= effectiveProtection ? 1 : 0;
    return { kind, impacts: imp, protection: pro, terrain: ter, effectiveProtection, damage, forceLoss: damage, capped: imp >= effectiveProtection * 2 };
  }

  // §5.15.2. `ships`: [{ type: 'surface' | 'submarine', impacts }].
  function resolvePortAttack({ totalImpacts, portImpacts, portProtection, ships }) {
    const total = count(totalImpacts, 'Los Puntos de Impacto');
    const port = count(portImpacts === '' ? 0 : portImpacts, 'Los impactos asignados al puerto');
    const shipRows = ships.map((s, i) => {
      if (s.type !== 'surface' && s.type !== 'submarine') throw new GroundAttackResultError('invalid_ship', `El buque ${i + 1} debe ser de superficie o submarino.`);
      const imp = count(s.impacts === '' ? 0 : s.impacts, `Los impactos del buque ${i + 1}`);
      return { type: s.type, impacts: imp };
    });
    const assigned = port + shipRows.reduce((sum, s) => sum + s.impacts, 0);
    if (assigned > total) throw new GroundAttackResultError('over_assigned', `Has asignado ${assigned} impactos y solo hay ${total}.`);
    const result = { totalImpacts: total, assigned, unassigned: total - assigned, paralyzed: 0, ammoFuelLoss: 0, ships: [] };
    if (port > 0) {
      const pro = count(portProtection, 'El Valor de Protección del puerto', 1);
      result.paralyzed = Math.floor(port / pro);
      result.ammoFuelLoss = result.paralyzed;
      result.portProtection = pro;
    }
    result.ships = shipRows.map((s) => (s.type === 'surface'
      ? { type: 'surface', impacts: s.impacts, damagePoints: s.impacts, destroyed: false }
      : { type: 'submarine', impacts: s.impacts, damagePoints: 0, destroyed: s.impacts >= 1 }));
    return result;
  }

  // §5.15.3, pista. `levelsAboveE`: niveles que le quedan por encima del mínimo E.
  function resolveRunway({ impacts, levelsAboveE }) {
    const imp = count(impacts, 'Los impactos asignados a la pista');
    const levels = count(levelsAboveE, 'Los niveles de pista por encima de E');
    const levelsLost = Math.min(Math.floor(imp / 2), levels);
    return { impacts: imp, levelsLost, levelsAfter: levels - levelsLost, ignored: imp - levelsLost * 2 };
  }

  // Pista por letra de calidad (A la mejor … E la peor; confirmado por el
  // mantenedor, 2026-10-07). `letters` viene de los datos, de mejor a peor.
  function resolveRunwayByLetter({ impacts, letter, letters }) {
    const idx = letters.indexOf(letter);
    if (idx === -1) throw new GroundAttackResultError('invalid_letter', `Calidad de pista desconocida: ${letter}.`);
    const levelsAboveE = letters.length - 1 - idx;
    const res = resolveRunway({ impacts, levelsAboveE });
    return { ...res, letterBefore: letter, letterAfter: letters[letters.length - 1 - res.levelsAfter] };
  }

  // §5.15.3, instalaciones logísticas (regla opcional).
  function resolveLogistics({ impacts, readiness }) {
    const imp = count(impacts, 'Los impactos asignados a la logística');
    const ready = count(readiness, 'El Valor de Preparación');
    const lost = Math.min(Math.floor(imp / 2), ready);
    return { impacts: imp, readinessLost: lost, readinessAfter: ready - lost, ignored: imp - lost * 2 };
  }

  // Protección efectiva de cada unidad del apron según la capacidad de hangares.
  // `units`: [{ usesAirfieldProtection: boolean }]. Con total <= capacidad todas
  // pueden usarla (cada una decide); con total > capacidad, como máximo `capacity`.
  function apronProtections(units, { airfieldProtection, hangarCapacity }) {
    const prot = count(airfieldProtection, 'El Valor de Protección del aeródromo', 0);
    const cap = count(hangarCapacity, 'La Capacidad de Hangares');
    const users = units.filter((u) => u.usesAirfieldProtection).length;
    if (units.length > cap && users > cap) {
      throw new GroundAttackResultError('over_capacity', `Hay ${units.length} unidades y la Capacidad de Hangares es ${cap}: como máximo ${cap} pueden usar la Protección del aeródromo.`);
    }
    return units.map((u) => (u.usesAirfieldProtection ? Math.max(prot, 1) : 1));
  }

  // §5.15.3, apron. `units`: [{ name, usesAirfieldProtection, cannotSurviveDamage }] en el
  // orden en que el defensor las elige. Cada unidad cuya Protección efectiva alcanzan los
  // impactos restantes sufre 1 punto de daño y se le restan; si no los alcanzan, no pasa
  // nada y los impactos pasan al siguiente objetivo (nunca quedan impactos sin efecto si
  // otro avión puede ser dañado con ellos). Confirmado por el mantenedor, 2026-10-07.
  function resolveApron({ impacts, units, airfieldProtection, hangarCapacity }) {
    const imp = count(impacts, 'Los impactos asignados al apron');
    const protections = apronProtections(units, { airfieldProtection, hangarCapacity });
    let remaining = imp;
    const rows = units.map((u, i) => {
      const protection = protections[i];
      if (remaining >= protection) {
        remaining -= protection;
        return { name: u.name, protection, absorbed: protection, damaged: true, eliminated: Boolean(u.cannotSurviveDamage), flipped: !u.cannotSurviveDamage };
      }
      return { name: u.name, protection, absorbed: 0, damaged: false, eliminated: false, flipped: false };
    });
    return { impacts: imp, units: rows, ignored: remaining };
  }

  return { GroundAttackResultError, resolveGroundUnitHit, resolvePortAttack, resolveRunway, resolveRunwayByLetter, resolveLogistics, apronProtections, resolveApron };
});
