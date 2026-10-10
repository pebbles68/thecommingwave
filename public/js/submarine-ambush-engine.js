// Motor puro de la Emboscada de submarino (roadmap Fase 13; data/rules/submarine-ambush.json).
// Decision Book §9.16 (pp. 219-220):
//   9.16    Es una acción de reacción de la Fase de Acciones de Superficie: no consume el límite de ataques, pero
//           cada submarino solo puede hacer una por Fase de Acciones de Superficie. Solo la inician los Ocultos.
//   9.16.1  Zona de Emboscada: 0 casillas (convencional) o 1 casilla (nuclear). Se puede iniciar cuando una
//           formación de superficie entra, sale o se mueve dentro de la zona.
//   9.16.2  La iniciación siempre tiene éxito; sin munición correspondiente se puede emboscar pero no se pueden
//           hacer ataques que consuman munición.
//
// El motor no conoce el mapa: recibe lo que declara el jugador. Las claves de motivo (`reasons`) y de paso tienen su
// texto en el JSON de reglas.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SubmarineAmbushEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ZONE_RANGE = { conventional: 0, nuclear: 1 };
  const EVENTS = ['enters', 'leaves', 'moves_within'];

  // ¿La formación está dentro de la Zona de Emboscada de ese tipo de submarino?
  function isInsideZone(subType, relation) {
    if (!(subType in ZONE_RANGE) || !relation) return null;
    if (relation === 'same_hex') return true;
    if (relation === 'adjacent') return ZONE_RANGE[subType] >= 1;
    return false;
  }

  // Devuelve { eligible: true|false|null, reasons: [claves], zoneRange, mayAttackWithAmmo: true|false|null }.
  // `eligible` es null mientras falten respuestas; false con las claves de motivo cuando alguna regla lo impide.
  function evaluateAmbush({ subState, subType, alreadyAmbushed, relation, event, hasAmmo }) {
    const reasons = [];
    const pending = [];
    if (!subState) pending.push('subState'); else if (subState !== 'hidden') reasons.push('not_hidden');
    if (!subType) pending.push('subType');
    if (!alreadyAmbushed) pending.push('alreadyAmbushed'); else if (alreadyAmbushed === 'yes') reasons.push('already_ambushed');
    if (!event) pending.push('event'); else if (!EVENTS.includes(event)) reasons.push('no_event');
    if (!relation) pending.push('relation');
    const inside = isInsideZone(subType, relation);
    if (inside === false) reasons.push(subType === 'nuclear' ? 'outside_zone_nuclear' : 'outside_zone_conventional');
    const zoneRange = subType in ZONE_RANGE ? ZONE_RANGE[subType] : null;
    const eligible = reasons.length ? false : (pending.length ? null : true);
    return {
      eligible,
      reasons,
      pending,
      zoneRange,
      // Sin munición correspondiente se puede emboscar pero no atacar con munición (9.16.2).
      mayAttackWithAmmo: eligible === true ? hasAmmo !== 'no' : null
    };
  }

  return { evaluateAmbush, isInsideZone, ZONE_RANGE, EVENTS };
});
