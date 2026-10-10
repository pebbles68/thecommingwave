// Motor puro de la prioridad de absorción del avión de guerra electrónica con
// escolta (EEA) ante los impactos de un disparo de defensa aérea (roadmap
// Fase 11 "Caso crítico: escolta EW", AGENTS.md §6.5; data/workflows/
// 06_defensa_aerea_area.json, `area_defense.ewEscortAbsorption`). Cita:
//
//   Decision Book §7.10.4 (pp. 135-136): "Si un grupo de misión aérea incluye
//   un avión de guerra electrónica, cuando ese grupo de misión necesita
//   absorber puntos de impacto como resultado de un disparo de defensa aérea,
//   el avión de guerra electrónica absorbe el combate prioritariamente. Solo
//   cuando el avión de guerra electrónica ya no puede absorber más puntos de
//   impacto, otras unidades dentro del grupo de misión absorberán los puntos de
//   impacto. Si los puntos de impacto son < el Valor de Protección del avión
//   de guerra electrónica, este ataque no tiene efecto."
//
//   Decision Book §6.3 (p. 98), defensa antiaérea de área contra unidades
//   aéreas: la facción elige qué unidad absorbe; "esta unidad debe absorber
//   tantos puntos de impacto como sea posible" hasta sufrir 1 punto de daño;
//   "si aún quedan puntos de impacto restantes, la facción propietaria debe
//   elegir otra unidad aérea para que continúe absorbiendo"; termina cuando
//   se han absorbido todos o los restantes son menores que la Protección de
//   cualquier unidad objetivo posible.
//
// Regla confirmada por el mantenedor (2026-10-07): si el avión EW ya sufre un
// punto de daño no puede absorber más, y los restantes los reciben los aviones
// escoltados. Un punto de daño corresponde a tantos puntos de impacto como su
// Protección: absorbe tantos puntos como su Protección y sufre 1 punto de
// daño; el remanente pasa a la siguiente unidad con la misma regla.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EwEscortEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class EwEscortError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'EwEscortError';
      this.code = code;
    }
  }

  function toNumber(value, label) {
    const n = Number(value);
    if (value === '' || value === undefined || value === null || Number.isNaN(n)) {
      throw new EwEscortError('invalid_number', `${label} debe ser un número.`);
    }
    return n;
  }

  // `impacts`: puntos de impacto del disparo de defensa aérea contra el grupo.
  // `ewProtection`: Protección del avión EW (>= 1).
  // `otherProtection`: Protección de la siguiente unidad del grupo (opcional).
  function resolveEwEscortAbsorption({ impacts, ewProtection, otherProtection }) {
    const imp = toNumber(impacts, 'Los puntos de impacto');
    const pro = toNumber(ewProtection, 'El Valor de Protección del avión de guerra electrónica');
    if (imp < 0) throw new EwEscortError('invalid_impacts', 'Los puntos de impacto no pueden ser negativos.');
    if (pro < 1) throw new EwEscortError('invalid_protection', 'El Valor de Protección debe ser 1 o mayor.');

    if (imp < pro) {
      return { impacts: imp, ewProtection: pro, noEffect: true, ewDamage: 0, ewAbsorbed: 0, remaining: 0, others: null };
    }
    const remaining = imp - pro;
    let others = null;
    if (otherProtection !== '' && otherProtection !== undefined && otherProtection !== null) {
      const op = toNumber(otherProtection, 'El Valor de Protección de la siguiente unidad');
      if (op < 1) throw new EwEscortError('invalid_protection', 'El Valor de Protección debe ser 1 o mayor.');
      const damaged = remaining >= op;
      const left = damaged ? remaining - op : remaining;
      others = { protection: op, damage: damaged ? 1 : 0, absorbed: damaged ? op : 0, left };
    }
    return { impacts: imp, ewProtection: pro, noEffect: false, ewDamage: 1, ewAbsorbed: pro, remaining, others };
  }

  return { EwEscortError, resolveEwEscortAbsorption };
});
