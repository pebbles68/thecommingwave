// Motor puro de los Efectos de Impacto de Ataques Antibuque sobre una unidad
// de superficie (roadmap Fase 12: daño crítico, daño/hundimiento de
// portaaviones y de transportes; Decision Book §5.9-§5.9.3, pp. 72-73).
// El texto de cada regla vive en data/rules/ship-impact-effects.json; este
// módulo solo decide QUÉ reglas aplican y devuelve sus `id`.
//
// Punto de partida: la unidad ya ha absorbido y sufre 1 punto de daño (cómo se
// llega ahí —asignación de Puntos de Impacto, absorción por Escudo— es de
// §5.6.5/§5.8.2 y de los wizards antibuque). Sin golden test oficial: las
// pruebas verifican la mecánica contra la regla citada.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ShipImpactEffectsEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class ShipImpactEffectsError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'ShipImpactEffectsError';
      this.code = code;
    }
  }

  const HULL_TYPES = ['single', 'double', 'multi'];

  // Entrada:
  //   hullType            'single' | 'double' | 'multi'
  //   fleetSize           (multi) barcos que le quedaban antes del impacto
  //   hasDamagedSide      ¿el reverso de la ficha tiene contenido? (no multi)
  //   alreadyDamaged      ¿ya estaba en su lado dañado? (no multi)
  //   isAmphibiousAssault Buque de Asalto Anfibio (buque único)
  //   hasShield           símbolo de escudo en el Valor de Protección
  //   sinkingResistance   Valor de Resistencia al Hundimiento (buque único sin escudo)
  //   criticalRoll        1d10 de la verificación por daño crítico (si se exige)
  //   isCarrier / isTransport  consecuencias adicionales (§5.9.2 / §5.9.3)
  //
  // Salida: { outcome, ruleIds, needsCriticalRoll, newFleetSize?, criticalRoll?,
  //           criticalResult? }. `outcome` es null mientras falte la tirada crítica.
  function resolveShipImpactEffect(input) {
    const {
      hullType, fleetSize, hasDamagedSide, alreadyDamaged, isAmphibiousAssault,
      hasShield, sinkingResistance, criticalRoll, isCarrier, isTransport
    } = input;
    if (!HULL_TYPES.includes(hullType)) {
      throw new ShipImpactEffectsError('invalid_hull_type', `Tipo de casco desconocido: "${hullType}" (se esperaba single, double o multi).`);
    }

    const ruleIds = [];
    let outcome = null;
    let needsCriticalRoll = false;
    let newFleetSize;
    let criticalResult;

    if (hullType === 'multi') {
      const size = Number(fleetSize);
      if (!(size >= 1)) throw new ShipImpactEffectsError('invalid_fleet_size', 'Una unidad multi-buque debe tener al menos 1 barco antes del impacto.');
      if (size === 1) {
        outcome = 'eliminated';
        ruleIds.push('already_damaged_eliminated');
      } else {
        outcome = 'fleet_reduced';
        newFleetSize = size - 1;
        ruleIds.push('multi_reduces_fleet');
      }
    } else if (!hasDamagedSide) {
      outcome = 'eliminated';
      ruleIds.push('no_damaged_side_eliminated');
    } else if (alreadyDamaged) {
      outcome = 'eliminated';
      ruleIds.push('already_damaged_eliminated');
    } else if (hullType === 'single' && isAmphibiousAssault) {
      outcome = 'sunk';
      ruleIds.push('amphibious_assault_sunk');
    } else if (hullType === 'double') {
      outcome = 'damaged';
      ruleIds.push('double_flips');
    } else {
      // buque único que se da la vuelta
      ruleIds.push('single_flips_and_critical_check');
      if (hasShield) {
        outcome = 'damaged';
        ruleIds.push('shield_no_critical_check');
      } else {
        ruleIds.push('critical_check');
        if (criticalRoll === undefined || criticalRoll === null || criticalRoll === '') {
          needsCriticalRoll = true;
        } else {
          const roll = Number(criticalRoll);
          const resistance = Number(sinkingResistance);
          const resistanceMissing = sinkingResistance === undefined || sinkingResistance === null || sinkingResistance === '';
          if (Number.isNaN(roll) || Number.isNaN(resistance) || resistanceMissing) {
            throw new ShipImpactEffectsError('invalid_critical_input', 'La verificación por daño crítico necesita la tirada y el Valor de Resistencia al Hundimiento.');
          }
          criticalResult = roll <= resistance ? 'sunk' : 'damaged';
          outcome = criticalResult;
        }
      }
    }

    if (outcome === 'damaged' || outcome === 'sunk' || outcome === 'eliminated') {
      if (isCarrier) {
        const destroyed = outcome !== 'damaged';
        ruleIds.push(destroyed ? 'carrier_sunk' : 'carrier_damaged', 'carrier_deployed_units');
      }
    }
    if (isTransport && outcome !== null) ruleIds.push('transport_capacity_loss');

    const result = { outcome, ruleIds, needsCriticalRoll };
    if (newFleetSize !== undefined) result.newFleetSize = newFleetSize;
    if (criticalResult !== undefined) {
      result.criticalRoll = Number(criticalRoll);
      result.criticalResult = criticalResult;
    }
    return result;
  }

  // Un buque de la flota que recibe un punto de daño en la asignación de
  // impactos de un wizard antibuque (hoja de flota: Protección + Valor de
  // Hundimiento). Aplica §5.9 con los datos que esas hojas recogen, que son
  // los de un buque único sin escudo con lado dañado:
  //   - ya dañado antes -> eliminado directamente, sin verificación crítica
  //     (regla `already_damaged_eliminated`);
  //   - si no, se da la vuelta y se hace la verificación por daño crítico:
  //     1d10 <= Valor de Hundimiento -> hundido (`critical_check`).
  // Sin Valor de Hundimiento no se decide el hundimiento (queda dañado).
  // Los demás tipos de casco, el escudo, portaeronaves y transportes se
  // resuelven en el wizard de Efectos del impacto antibuque.
  function resolveFleetShipHit({ alreadyDamaged, sinkingThreshold, sinkingRoll }) {
    if (alreadyDamaged) {
      const r = resolveShipImpactEffect({ hullType: 'single', hasDamagedSide: true, alreadyDamaged: true, hasShield: false });
      return { outcome: r.outcome, ruleIds: r.ruleIds, removed: true, eliminatedDirectly: true, needsSinkingRoll: false };
    }
    const missing = sinkingThreshold === '' || sinkingThreshold === undefined || sinkingThreshold === null;
    if (missing) {
      return { outcome: 'damaged', ruleIds: ['single_flips_and_critical_check'], removed: false, eliminatedDirectly: false, needsSinkingRoll: true };
    }
    const noRoll = sinkingRoll === '' || sinkingRoll === undefined || sinkingRoll === null;
    const r = resolveShipImpactEffect({
      hullType: 'single', hasDamagedSide: true, alreadyDamaged: false, hasShield: false,
      sinkingResistance: sinkingThreshold, criticalRoll: noRoll ? undefined : sinkingRoll
    });
    return { outcome: r.outcome, ruleIds: r.ruleIds, removed: r.outcome === 'sunk', eliminatedDirectly: false, needsSinkingRoll: r.needsCriticalRoll };
  }

  return { ShipImpactEffectsError, HULL_TYPES, resolveShipImpactEffect, resolveFleetShipHit };
});
