// Motor puro de logística de puerto y munición (roadmap Fase 14; data/rules/port-logistics.json).
// Decision Book §9.9.4 (Reparación de Buques, opcional), §9.9.5 (Reparaciones de Emergencia) y §11.6
// (Consumo, Reabastecimiento y Agotamiento de Munición). Los textos viven en el JSON de reglas; aquí solo
// se decide qué es posible y con qué límite.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PortLogisticsEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isInt = (n) => Number.isInteger(n) && n >= 0;

  // §9.10.1 / §11.6.1: solo se reabastecen unidades del área «Buques/Flota en Espera», hasta el valor de
  // Reabastecimiento de Munición del puerto.
  function evaluateResupply({ units, portValue, inWaitingArea }) {
    const reasons = [];
    if (!isInt(units) || !isInt(portValue) || !inWaitingArea) return { ok: null, reasons, resupplied: null, left: null };
    if (inWaitingArea === 'no') reasons.push('not_in_waiting_area');
    const resupplied = inWaitingArea === 'no' ? 0 : Math.min(units, portValue);
    const left = units - resupplied;
    if (inWaitingArea === 'yes' && left > 0) reasons.push('over_port_value');
    return { ok: left === 0 && inWaitingArea === 'yes', reasons, resupplied, left };
  }

  // §9.9.4: reparación opcional. Éxito si 1d10 es menor que REP; un intento por buque y Fase de Logística.
  function evaluateRepair({ inPort, damaged, multiShip, alreadyTried, shipsInDock, docks, rep, roll }) {
    const reasons = [];
    if (inPort === 'no') reasons.push('not_in_port');
    if (damaged === 'no') reasons.push('not_damaged');
    if (multiShip === 'yes') reasons.push('multi_ship');
    if (alreadyTried === 'yes') reasons.push('already_tried');
    if (isInt(shipsInDock) && isInt(docks) && shipsInDock > docks) reasons.push('no_dock');
    if (reasons.length) return { eligible: false, reasons, success: null };
    if (!inPort || !damaged || !multiShip || !alreadyTried) return { eligible: null, reasons, success: null };
    if (!isInt(rep) || !Number.isInteger(roll) || roll < 1 || roll > 10) return { eligible: true, reasons, success: null };
    return { eligible: true, reasons, success: roll < rep };
  }

  // §9.9.5: al final del segmento se eliminan tantos marcadores como Valor de Reparación Rápida (RR).
  function evaluateEmergencyRepair({ rr, markers }) {
    if (!isInt(rr) || !isInt(markers)) return { removed: null, remaining: null };
    const removed = Math.min(rr, markers);
    return { removed, remaining: markers - removed };
  }

  // §11.6.2: sin munición suficiente, el valor de ataque baja a la munición restante; a 0 no se puede atacar.
  function evaluateDepletion({ remaining, attackValue }) {
    if (!isInt(remaining) || !isInt(attackValue)) return { effective: null, reduced: null, exhausted: null };
    const effective = Math.min(remaining, attackValue);
    return { effective, reduced: effective < attackValue, exhausted: remaining === 0 };
  }

  // §11.2.2: al final de la Fase de Logística, cada Nodo de Suministro Ordinario que dio garantía a al menos una
  // unidad terrestre, puerto o aeródromo baja 1 nivel; al llegar a 0 se elimina. Los Avanzados no se gastan.
  function evaluateNodeDecay({ level, providedSupply }) {
    if (!isInt(level) || !providedSupply) return { newLevel: null, eliminated: null, changed: null };
    if (providedSupply === 'no' || level === 0) return { newLevel: level, eliminated: level === 0, changed: false };
    const newLevel = level - 1;
    return { newLevel, eliminated: newLevel === 0, changed: true };
  }

  return { evaluateNodeDecay, evaluateResupply, evaluateRepair, evaluateEmergencyRepair, evaluateDepletion };
});
